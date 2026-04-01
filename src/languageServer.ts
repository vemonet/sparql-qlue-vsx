import * as vscode from 'vscode';
import { AbstractMessageReader, AbstractMessageWriter, type DataCallback, type Message } from 'vscode-jsonrpc/browser';
import { BaseLanguageClient, type LanguageClientOptions, type MessageTransports } from 'vscode-languageclient/browser';
import { type BackendConfig } from './state';

/** Language client that runs qlue-ls WASM inline using a custom message transport.
 * Using the /browser subpackages works in both Node.js and browser environments
 * since we provide our own transport (no Node streams / child processes needed). */
class WasmLanguageClient extends BaseLanguageClient {
  private readonly _createTransports: () => Promise<MessageTransports>;

  constructor(
    id: string,
    name: string,
    clientOptions: LanguageClientOptions,
    createTransports: () => Promise<MessageTransports>,
  ) {
    super(id, name, clientOptions);
    this._createTransports = createTransports;
  }

  protected createMessageTransports(_encoding: string): Promise<MessageTransports> {
    return this._createTransports();
  }
}

export class SparqlLanguageServer {
  private _client: WasmLanguageClient | undefined;

  /** Initialise the WASM module and start the LSP client. */
  async start(context: vscode.ExtensionContext): Promise<void> {
    const reader = new WasmMessageReader();
    const writer = new WasmMessageWriter();

    const createTransports = async (): Promise<MessageTransports> => {
      // WASM output → vscode-languageclient
      const serverOutputWritable = new WritableStream({
        write(chunk: unknown) {
          reader.receive(chunk);
        },
        close() {
          reader.reportClose();
        },
      });

      // vscode-languageclient → WASM input
      let enqueueToWasm!: (str: string) => void;
      const serverInputReadable = new ReadableStream<string>({
        start(controller) {
          enqueueToWasm = (str) => controller.enqueue(str);
        },
      });
      writer.setEnqueue((str) => enqueueToWasm(str));

      const wasmUri = vscode.Uri.joinPath(context.extensionUri, 'dist', 'qlue_ls_bg.wasm');
      const wasmBuffer = await vscode.workspace.fs.readFile(wasmUri);

      const qlueModule = await import('qlue-ls');
      qlueModule.initSync({ module: wasmBuffer });

      const server = qlueModule.init_language_server(serverOutputWritable.getWriter());
      qlueModule.listen(server, serverInputReadable.getReader()).catch((err: unknown) => {
        if (String(err).includes('reader cancelled')) {
          return;
        }
        vscode.window.showErrorMessage(`SPARQL Qlue: listen error: ${err}`);
        console.error('qlue-ls listen error:', err);
      });

      return { reader, writer };
    };

    this._client = new WasmLanguageClient(
      'sparql-qlue',
      'SPARQL Qlue Language Server',
      {
        documentSelector: [{ language: 'sparql' }],
        middleware: {
          // NOTE: avoid error notifs for every completion/hover requests, often unjustified
          provideCompletionItem: async (document, position, context, token, next) => {
            try {
              const result = await next(document, position, context, token);
              if (!result) {
                return result;
              }
              const items = Array.isArray(result) ? result : result.items;
              for (const item of items) {
                if (typeof item.label === 'object' && item.label.detail && !item.label.detail.startsWith(' ')) {
                  // Add a space between prefixed IRI and label
                  item.label.detail = ' ' + item.label.detail;
                }
              }
              return result;
            } catch {
              return null;
            }
          },
          provideHover: async (document, position, token, next) => {
            try {
              return await next(document, position, token);
            } catch {
              return null;
            }
          },
        },
      },
      createTransports,
    );
    await this._client.start();
    context.subscriptions.push(this._client);
  }

  // /** Returns the underlying LanguageClient. Throws if called before start(). */
  // getClient(): LanguageClient {
  //   if (!this._client) {
  //     throw new Error('Language server has not been started yet.');
  //   }
  //   return this._client;
  // }

  /** Stop the language server. */
  stop(): Promise<void> | undefined {
    return this._client?.stop();
  }

  /** Register an endpoint as the active backend for the language server.
   * @param endpoint SPARQL endpoint URL
   * @param config   Optional prefix map and completion queries for the backend.
   */
  async useBackend(endpoint: string, config: BackendConfig): Promise<void> {
    if (!this._client) {
      return;
    }
    await this._client.sendNotification('qlueLs/addBackend', {
      name: endpoint,
      url: endpoint,
      default: true,
      prefixMap: config.prefixMap,
      queries: config.queries,
    });
    await this._client.sendNotification('qlueLs/updateDefaultBackend', { backendName: endpoint });
  }

  /** Push updated settings to the language server. */
  async updateSettings(settings: Record<string, unknown>): Promise<void> {
    if (!this._client) {
      return;
    }
    await this._client.sendNotification('qlueLs/changeSettings', settings);
  }

  // NOTE: all available commands at https://github.com/IoannisNezis/Qlue-ls/blob/main/docs/docs/07_lsp_extensions.md
  // qlueLs/listBackends
}

class WasmMessageReader extends AbstractMessageReader {
  private _callback: DataCallback | undefined;

  listen(callback: DataCallback): { dispose: () => void } {
    this._callback = callback;
    return {
      dispose: () => {
        this._callback = undefined;
      },
    };
  }

  receive(chunk: unknown): void {
    if (!this._callback) {
      return;
    }
    try {
      this._callback(JSON.parse(typeof chunk === 'string' ? chunk : String(chunk)) as Message);
    } catch {
      // malformed JSON from WASM — ignore
    }
  }

  reportClose(): void {
    this.fireClose();
  }
}

class WasmMessageWriter extends AbstractMessageWriter {
  private _enqueue: ((str: string) => void) | undefined;

  setEnqueue(fn: (str: string) => void): void {
    this._enqueue = fn;
  }

  write(msg: Message): Promise<void> {
    this._enqueue?.(JSON.stringify(msg));
    return Promise.resolve();
  }

  end(): void {}
}
