import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { getNonce } from '../utils';
import { ExtensionState } from '../state';

export class SparqlQueryPanel implements vscode.WebviewViewProvider {
  static readonly viewId = 'sparql-qlue.queryPanel';

  private view: vscode.WebviewView | undefined;
  private context: vscode.ExtensionContext;
  private pendingQuery: string | undefined;
  private pendingEndpoint: string | undefined;
  private pendingAutoExecute = false;
  private pendingFileUri: string | undefined;
  /** URI string of the .rq file currently shown in the panel. */
  private currentFileUri: string | undefined;

  /** Called whenever the user executes a query against a new endpoint URL. */
  public onEndpointChange?: (url: string) => Promise<void>;

  private activeAbortController: AbortController | undefined;

  private state: ExtensionState;

  private static readonly DEFAULT_ENDPOINTS = [
    'https://sparql.uniprot.org/sparql',
    'https://qlever.dev/api/wikidata',
    'https://qlever.dev/api/wikimedia-commons',
    'https://qlever.dev/api/dblp',
    'https://qlever.dev/api/osm-planet',
    'https://qlever.dev/api/freebase',
    'https://qlever.dev/api/imdb',
    'https://query.wikidata.org/sparql',
    'https://www.bgee.org/sparql/',
    'https://sparql.omabrowser.org/sparql/',
    'https://beta.sparql.swisslipids.org/',
    'https://sparql.rhea-db.org/sparql/',
    'https://sparql.cellosaurus.org/sparql',
    'https://sparql.sibils.org/sparql',
    'https://kg.earthmetabolome.org/metrin/api/',
    'https://biosoda.unil.ch/graphdb/repositories/biodatafuse',
    'https://hamap.expasy.org/sparql/',
    'https://rdf.metanetx.org/sparql/',
    'https://sparql.orthodb.org/sparql',
  ];

  private getSavedEndpoints(): string[] {
    const saved = this.state.getSavedEndpoints();
    return saved.length > 0 ? saved : [...SparqlQueryPanel.DEFAULT_ENDPOINTS];
  }

  private async deleteEndpoint(url: string): Promise<void> {
    const list = this.getSavedEndpoints();
    await this.state.setSavedEndpoints(list.filter((u) => u !== url));
  }

  private async saveEndpoint(url: string): Promise<void> {
    const list = this.getSavedEndpoints();
    if (!list.includes(url)) {
      await this.state.setSavedEndpoints([url, ...list].slice(0, 50));
    }
  }

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.state = new ExtensionState(context);
  }

  resolveWebviewView(webviewView: vscode.WebviewView) {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.file(path.join(this.context.extensionPath, 'node_modules')),
        vscode.Uri.file(path.join(this.context.extensionPath, 'dist')),
      ],
    };
    webviewView.webview.html = this.getWebviewContent(webviewView.webview);
    webviewView.webview.onDidReceiveMessage((msg) => this.handleMessage(msg), undefined, this.context.subscriptions);
    webviewView.onDidDispose(() => {
      this.view = undefined;
    });
    // Push saved endpoints immediately so the datalist is populated
    setTimeout(() => {
      webviewView.webview.postMessage({ type: 'setEndpoints', endpoints: this.getSavedEndpoints() });
    }, 200);
    // Send any data that was queued before the view was resolved
    if (this.pendingQuery !== undefined) {
      const query = this.pendingQuery;
      const endpoint = this.pendingEndpoint ?? '';
      const autoExecute = this.pendingAutoExecute;
      this.pendingQuery = undefined;
      this.pendingEndpoint = undefined;
      this.pendingAutoExecute = false;
      this.currentFileUri = this.pendingFileUri;
      this.pendingFileUri = undefined;
      setTimeout(() => {
        webviewView.webview.postMessage({ type: 'update', query, endpoint, autoExecute });
      }, 300);
    }
  }

  show(query: string, endpoint: string, autoExecute = false, fileUri?: string) {
    if (this.view) {
      this.currentFileUri = fileUri;
      this.view.show(true);
      this.view.webview.postMessage({ type: 'setEndpoints', endpoints: this.getSavedEndpoints() });
      this.view.webview.postMessage({ type: 'update', query, endpoint, autoExecute });
    } else {
      this.pendingQuery = query;
      this.pendingEndpoint = endpoint;
      this.pendingAutoExecute = autoExecute;
      this.pendingFileUri = fileUri;
      vscode.commands.executeCommand(`${SparqlQueryPanel.viewId}.focus`);
    }
  }

  /** Silently update the stored query text without affecting the endpoint or triggering execution. */
  updateQuery(query: string) {
    if (this.view) {
      this.view.webview.postMessage({ type: 'updateQuery', query });
    } else if (this.pendingQuery !== undefined) {
      // Panel not yet resolved — update the pending query so it arrives correctly
      this.pendingQuery = query;
    }
  }

  private async handleMessage(msg: { type: string; query: string; endpoint: string; url?: string }) {
    if (msg.type === 'openSettings') {
      vscode.commands.executeCommand('sparql-qlue.openServerSettings');
      return;
    }
    if (msg.type === 'cancelQuery') {
      this.activeAbortController?.abort();
      this.activeAbortController = undefined;
      return;
    }
    if (msg.type === 'deleteEndpoint') {
      if (!msg.url) {
        return;
      }
      await this.deleteEndpoint(msg.url);
      this.view?.webview.postMessage({ type: 'setEndpoints', endpoints: this.getSavedEndpoints() });
      return;
    }
    if (msg.type === 'executeQuery') {
      const { endpoint } = msg;
      // Always read the live document text so edits made since the last debounce are picked up
      let query = msg.query;
      if (this.currentFileUri) {
        try {
          const doc = await vscode.workspace.openTextDocument(vscode.Uri.parse(this.currentFileUri));
          query = doc.getText();
        } catch {
          // fall back to the query the webview sent
        }
      }
      if (!endpoint) {
        this.view?.webview.postMessage({
          type: 'error',
          message: 'Please provide a SPARQL endpoint URL.',
        });
        return;
      }
      if (!query.trim()) {
        this.view?.webview.postMessage({
          type: 'error',
          message: 'Query is empty.',
        });
        return;
      }
      // Notify the language server about the (possibly new) endpoint before executing
      if (this.onEndpointChange) {
        await this.onEndpointChange(endpoint);
      }

      const queryType = detectQueryType(query);
      this.activeAbortController = new AbortController();
      try {
        const accept =
          queryType === 'CONSTRUCT' || queryType === 'DESCRIBE'
            ? 'text/turtle, application/n-triples, application/ld+json'
            : 'application/sparql-results+json';

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/sparql-query',
            Accept: accept,
            'User-Agent': `sparql-qlue/${this.context.extension.packageJSON.version}`,
          },
          body: query,
          signal: this.activeAbortController.signal,
        });

        if (!response.ok) {
          const errorText = await response.text();
          this.view?.webview.postMessage({
            type: 'error',
            message: `HTTP ${response.status}: ${errorText}`,
          });
          return;
        }
        const contentType = response.headers.get('content-type') ?? '';
        const responseText = await response.text();
        await this.saveEndpoint(endpoint);
        // Persist the endpoint used for this specific file at workspace level
        if (this.currentFileUri) {
          const overrides = this.state.getFileEndpoints();
          if (overrides[this.currentFileUri] !== endpoint) {
            await this.state.setFileEndpoints({ ...overrides, [this.currentFileUri]: endpoint });
          }
        }
        this.view?.webview.postMessage({ type: 'setEndpoints', endpoints: this.getSavedEndpoints() });
        this.view?.webview.postMessage({
          type: 'results',
          data: responseText,
          contentType,
          queryType,
        });
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') {
          this.view?.webview.postMessage({ type: 'cancelled' });
          return;
        }
        this.view?.webview.postMessage({
          type: 'error',
          message: `Fetch error: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }
  }

  private getWebviewContent(webview: vscode.Webview): string {
    const yasrCssUri = webview.asWebviewUri(
      vscode.Uri.file(
        path.join(this.context.extensionPath, 'node_modules', '@zazuko', 'yasr', 'build', 'yasr.min.css'),
      ),
    );
    const yasrJsUri = webview.asWebviewUri(
      vscode.Uri.file(path.join(this.context.extensionPath, 'node_modules', '@zazuko', 'yasr', 'build', 'yasr.min.js')),
    );
    const nonce = getNonce();
    const htmlPath = path.join(this.context.extensionPath, 'src', 'panels', 'queryPanel.html');
    return fs
      .readFileSync(htmlPath, 'utf8')
      .replaceAll('__NONCE__', nonce)
      .replaceAll('__CSP_SOURCE__', webview.cspSource)
      .replaceAll('__YASR_CSS_URI__', yasrCssUri.toString())
      .replaceAll('__YASR_JS_URI__', yasrJsUri.toString());
  }

  setActiveBackendUrl(url: string): void {
    this.view?.webview.postMessage({ type: 'setBackend', url });
  }

  dispose() {
    this.view = undefined;
  }
}

export function detectQueryType(query: string): string {
  const cleaned = query
    .replace(/#.*$/gm, '')
    .replace(/"(?:[^"\\]|\\.)*"/g, '')
    .replace(/'(?:[^'\\]|\\.)*'/g, '')
    .trim();
  const match = cleaned.match(/\b(SELECT|CONSTRUCT|DESCRIBE|ASK|INSERT|DELETE)\b/i);
  return match ? match[1].toUpperCase() : 'SELECT';
}
