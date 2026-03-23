import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { getNonce, querySparql } from '../utils';
import { ExtensionState, DEFAULT_ENDPOINTS } from '../state';

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

  private getSavedEndpoints(): string[] {
    const saved = this.state.getSavedEndpoints();
    return saved.length > 0 ? saved : [...DEFAULT_ENDPOINTS];
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
      localResourceRoots: [vscode.Uri.file(path.join(this.context.extensionPath, 'dist'))],
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
    if (msg.type === 'pinEndpoint') {
      const { endpoint } = msg;
      if (!endpoint) {
        return;
      }
      if (!this.currentFileUri) {
        this.view?.webview.postMessage({
          type: 'error',
          message: 'No query file is currently open.',
        });
        return;
      }
      try {
        const uri = vscode.Uri.parse(this.currentFileUri);
        const doc = await vscode.workspace.openTextDocument(uri);
        const text = doc.getText();
        const endpointLineRegex = /^#\+\s*endpoint\s*:.*$/m;
        const newLine = `#+ endpoint: ${endpoint}`;
        const edit = new vscode.WorkspaceEdit();
        const match = endpointLineRegex.exec(text);
        if (match) {
          const existingLineNum = doc.positionAt(match.index).line;
          if (existingLineNum === 0) {
            // Already at the top — just update the URL in place
            const startPos = doc.positionAt(match.index);
            const endPos = doc.positionAt(match.index + match[0].length);
            edit.replace(uri, new vscode.Range(startPos, endPos), newLine);
          } else {
            // Remove the existing line (including its trailing newline) and insert at the top
            const lineRange = doc.lineAt(existingLineNum).rangeIncludingLineBreak;
            edit.delete(uri, lineRange);
            edit.insert(uri, new vscode.Position(0, 0), newLine + '\n');
          }
        } else {
          edit.insert(uri, new vscode.Position(0, 0), newLine + '\n');
        }
        await vscode.workspace.applyEdit(edit);
      } catch (err: unknown) {
        this.view?.webview.postMessage({
          type: 'error',
          message: `Failed to update file: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
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

        const response = await querySparql(endpoint, query, this.activeAbortController.signal, accept);
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
        // Build merged prefix map: backend prefixes + query-declared prefixes (query wins)
        const prefixes = { ...(this.state.getBackends()[endpoint]?.prefixMap ?? {}), ...extractQueryPrefixes(query) };
        this.view?.webview.postMessage({
          type: 'results',
          data: responseText,
          contentType,
          queryType,
          prefixes,
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
    const extUri = (...segments: string[]) =>
      webview.asWebviewUri(vscode.Uri.file(path.join(this.context.extensionPath, ...segments))).toString();
    const replacements: Record<string, string> = {
      __NONCE__: getNonce(),
      __CSP_SOURCE__: webview.cspSource,
      __YASR_CSS_URI__: extUri('dist', 'panels', 'yasr.min.css'),
      __YASR_JS_URI__: extUri('dist', 'panels', 'yasr.min.js'),
      __GRAPH_PLUGIN_CSS_URI__: extUri('dist', 'panels', 'yasgui-graph-plugin.min.css'),
      __YASR_PLUGINS_CSS_URI__: extUri('dist', 'panels', 'yasrPlugins.css'),
      __YASR_PLUGINS_JS_URI__: extUri('dist', 'panels', 'yasrPlugins.js'),
    };
    const htmlPath = path.join(this.context.extensionPath, 'dist', 'panels', 'queryPanel.html');
    return fs.readFileSync(htmlPath, 'utf8').replace(/__[A-Z_]+__/g, (m) => replacements[m] ?? m);
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

/** Extract PREFIX declarations from a SPARQL query as a prefix→namespace map. */
export function extractQueryPrefixes(query: string): Record<string, string> {
  const prefixes: Record<string, string> = {};
  const regex = /^\s*PREFIX\s+([\w-]*):\s*<([^>]+)>/gim;
  let match;
  while ((match = regex.exec(query)) !== null) {
    prefixes[match[1]] = match[2];
  }
  return prefixes;
}
