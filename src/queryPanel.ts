import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

export class SparqlQueryPanel implements vscode.WebviewViewProvider {
  static readonly viewId = "sparql-qlue.queryPanel";

  private view: vscode.WebviewView | undefined;
  private context: vscode.ExtensionContext;
  private pendingQuery: string | undefined;
  private pendingEndpoint: string | undefined;
  private pendingAutoExecute = false;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  resolveWebviewView(webviewView: vscode.WebviewView) {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.file(path.join(this.context.extensionPath, "node_modules")),
        vscode.Uri.file(path.join(this.context.extensionPath, "dist")),
      ],
    };
    webviewView.webview.html = this.getWebviewContent(webviewView.webview);
    webviewView.webview.onDidReceiveMessage(
      (msg) => this.handleMessage(msg),
      undefined,
      this.context.subscriptions
    );
    webviewView.onDidDispose(() => {
      this.view = undefined;
    });
    // Send any data that was queued before the view was resolved
    if (this.pendingQuery !== undefined) {
      const query = this.pendingQuery;
      const endpoint = this.pendingEndpoint ?? "";
      const autoExecute = this.pendingAutoExecute;
      this.pendingQuery = undefined;
      this.pendingEndpoint = undefined;
      this.pendingAutoExecute = false;
      setTimeout(() => {
        webviewView.webview.postMessage({ type: "update", query, endpoint, autoExecute });
      }, 300);
    }
  }

  show(query: string, endpoint: string, autoExecute = false) {
    if (this.view) {
      this.view.show(true);
      this.view.webview.postMessage({ type: "update", query, endpoint, autoExecute });
    } else {
      this.pendingQuery = query;
      this.pendingEndpoint = endpoint;
      this.pendingAutoExecute = autoExecute;
      vscode.commands.executeCommand(`${SparqlQueryPanel.viewId}.focus`);
    }
  }

  private async handleMessage(msg: { type: string; query: string; endpoint: string }) {
    if (msg.type === "executeQuery") {
      const { query, endpoint } = msg;
      if (!endpoint) {
        this.view?.webview.postMessage({
          type: "error",
          message: "Please provide a SPARQL endpoint URL.",
        });
        return;
      }
      if (!query.trim()) {
        this.view?.webview.postMessage({
          type: "error",
          message: "Query is empty.",
        });
        return;
      }

      const queryType = detectQueryType(query);
      try {
        const accept =
          queryType === "CONSTRUCT" || queryType === "DESCRIBE"
            ? "text/turtle, application/n-triples, application/ld+json"
            : "application/sparql-results+json";

        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/sparql-query",
            Accept: accept,
            "User-Agent": `sparql-qlue/${this.context.extension.packageJSON.version}`,
          },
          body: query,
        });

        if (!response.ok) {
          const errorText = await response.text();
          this.view?.webview.postMessage({
            type: "error",
            message: `HTTP ${response.status}: ${errorText}`,
          });
          return;
        }
        const contentType = response.headers.get("content-type") ?? "";
        const responseText = await response.text();
        this.view?.webview.postMessage({
          type: "results",
          data: responseText,
          contentType,
          queryType,
        });
      } catch (err: unknown) {
        this.view?.webview.postMessage({
          type: "error",
          message: `Fetch error: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }
  }

  private getWebviewContent(webview: vscode.Webview): string {
    const yasrCssUri = webview.asWebviewUri(
      vscode.Uri.file(path.join(this.context.extensionPath, "node_modules", "@zazuko", "yasr", "build", "yasr.min.css"))
    );
    const yasrJsUri = webview.asWebviewUri(
      vscode.Uri.file(path.join(this.context.extensionPath, "node_modules", "@zazuko", "yasr", "build", "yasr.min.js"))
    );
    const nonce = getNonce();
    const htmlPath = path.join(this.context.extensionPath, "src", "queryPanel.html");
    return fs
      .readFileSync(htmlPath, "utf8")
      .replaceAll("__NONCE__", nonce)
      .replaceAll("__CSP_SOURCE__", webview.cspSource)
      .replaceAll("__YASR_CSS_URI__", yasrCssUri.toString())
      .replaceAll("__YASR_JS_URI__", yasrJsUri.toString());
  }

  dispose() {
    this.view = undefined;
  }
}

function detectQueryType(query: string): string {
  const cleaned = query
    .replace(/#.*$/gm, "")
    .replace(/"(?:[^"\\]|\\.)*"/g, "")
    .replace(/'(?:[^'\\]|\\.)*'/g, "")
    .trim();
  const match = cleaned.match(
    /\b(SELECT|CONSTRUCT|DESCRIBE|ASK|INSERT|DELETE)\b/i
  );
  return match ? match[1].toUpperCase() : "SELECT";
}

function getNonce(): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

