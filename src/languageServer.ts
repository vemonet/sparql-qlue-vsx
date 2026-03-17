import * as path from "path";
import * as vscode from "vscode";
import {
  AbstractMessageReader,
  AbstractMessageWriter,
  type DataCallback,
  type Message,
} from "vscode-jsonrpc/node";
import {
  LanguageClient,
  type LanguageClientOptions,
  type MessageTransports,
  type ServerOptions,
} from "vscode-languageclient/node";

// MessageReader that receives raw JSON strings from the WASM output stream and
// delivers parsed Message objects to vscode-languageclient.
class WasmMessageReader extends AbstractMessageReader {
  private _callback: DataCallback | undefined;

  listen(callback: DataCallback): { dispose: () => void } {
    this._callback = callback;
    return { dispose: () => { this._callback = undefined; } };
  }

  receive(chunk: unknown): void {
    if (!this._callback) { return; }
    try {
      this._callback(JSON.parse(typeof chunk === "string" ? chunk : String(chunk)) as Message);
    } catch {
      // malformed JSON from WASM — ignore
    }
  }

  reportClose(): void { this.fireClose(); }
}

// MessageWriter that receives Message objects from vscode-languageclient and
// feeds them as raw JSON strings into the WASM input stream.
class WasmMessageWriter extends AbstractMessageWriter {
  private _enqueue: ((str: string) => void) | undefined;

  setEnqueue(fn: (str: string) => void): void { this._enqueue = fn; }

  write(msg: Message): Promise<void> {
    this._enqueue?.(JSON.stringify(msg));
    return Promise.resolve();
  }

  end(): void {}
}

export async function startLanguageServer(
  context: vscode.ExtensionContext
): Promise<LanguageClient> {
  const wasmPath = path.join(context.extensionPath, "dist", "qlue_ls_bg.wasm");
  const fs = await import("fs");
  const wasmBuffer = fs.readFileSync(wasmPath);
  const reader = new WasmMessageReader();
  const writer = new WasmMessageWriter();

  // WASM output → vscode-languageclient: the qlue-ls wasm-bindgen bindings write raw JSON
  // strings (not LSP-framed bytes), so we parse them directly into Message objects.
  const serverOutputWritable = new WritableStream({
    write(chunk: unknown) { reader.receive(chunk); },
    close() { reader.reportClose(); },
  });

  // vscode-languageclient → WASM input: Message objects serialised to raw JSON strings.
  let enqueueToWasm!: (str: string) => void;
  const serverInputReadable = new ReadableStream<string>({
    start(controller) { enqueueToWasm = (str) => controller.enqueue(str); },
  });
  writer.setEnqueue((str) => enqueueToWasm(str));
  const qlueModule = await import("qlue-ls");
  qlueModule.initSync({ module: wasmBuffer });

  const server = qlueModule.init_language_server(serverOutputWritable.getWriter());
  qlueModule.listen(server, serverInputReadable.getReader()).catch((err: unknown) => {
    if (String(err).includes("reader cancelled")) { return; }
    vscode.window.showErrorMessage(`SPARQL Qlue: listen error: ${err}`);
    console.error("qlue-ls listen error:", err);
  });

  const serverOptions: ServerOptions = (): Promise<MessageTransports> => {
    return Promise.resolve({ reader, writer });
  };
  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ language: "sparql" }],
  };
  const client = new LanguageClient(
    "sparql-qlue",
    "SPARQL Qlue Language Server",
    serverOptions,
    clientOptions
  );
  await client.start();
  context.subscriptions.push(client);
  return client;
}
