import * as vscode from "vscode";
import { type LanguageClient } from "vscode-languageclient/node";
import { SparqlQueryPanel } from "./queryPanel";
import { findEndpointUrl } from "./utils";
import { DEFAULT_COMPLETION_QUERIES, DEFAULT_PREFIX_MAP } from "./backendConf";
import { startLanguageServer } from "./languageServer";

let client: LanguageClient | undefined;
let queryPanel: SparqlQueryPanel;
const addedBackends = new Set<string>();

export async function setupEndpoint(document: vscode.TextDocument): Promise<void> {
    const url = await findEndpointUrl(document);
    if (url) { await setupBackendForEndpoint(url); }
}

async function setupBackendForEndpoint(endpointUrl: string): Promise<void> {
  if (!client || !endpointUrl) { return; }
  let name: string;
  try {
    name = new URL(endpointUrl).hostname;
  } catch {
    name = endpointUrl;
  }
  if (!addedBackends.has(name)) {
    try {
      await client.sendNotification("qlueLs/addBackend", {
        name,
        url: endpointUrl,
        default: true,
        prefixMap: DEFAULT_PREFIX_MAP,
        // TODO: get custom prefix map from endpoint (SHACL)
        queries: DEFAULT_COMPLETION_QUERIES,
      });
      addedBackends.add(name);
      // vscode.window.showInformationMessage(`SPARQL Qlue: Backend added: ${name} (${endpointUrl})`);
    } catch (err) {
      vscode.window.showErrorMessage(`SPARQL Qlue: Failed to add backend for ${endpointUrl}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  try {
    await client.sendNotification("qlueLs/updateDefaultBackend", { backendName: name });
    // vscode.window.showInformationMessage(`SPARQL Qlue: Default backend set to ${name}`);
  } catch (err) {
    console.error("[sparql-qlue] Failed to update default backend:", err);
  }
}

export async function activate(context: vscode.ExtensionContext) {
  // Register the query panel as a WebviewViewProvider (shown in the bottom panel)
  queryPanel = new SparqlQueryPanel(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(SparqlQueryPanel.viewId, queryPanel)
  );

  // Register commands first so they are always available regardless of LS startup
  context.subscriptions.push(
    vscode.commands.registerCommand("sparql-qlue.executeQuery", async (uri?: vscode.Uri) => {
      // Support both right-click from explorer (uri arg) and active editor
      let document: vscode.TextDocument | undefined;
      if (uri) {
        document = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(document, { preserveFocus: true, preview: false });
      } else {
        const editor = vscode.window.activeTextEditor;
        if (editor?.document.languageId === "sparql") {
          document = editor.document;
        }
      }
      if (!document) {
        vscode.window.showWarningMessage("Open a .rq or .sparql file to execute a SPARQL query.");
        return;
      }
      const query = document.getText();
      const endpoint = await findEndpointUrl(document);
      queryPanel.show(query, endpoint, true);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("sparql-qlue.showQueryPanel", async (uri?: vscode.Uri) => {
      let document: vscode.TextDocument | undefined;
      if (uri) {
        document = await vscode.workspace.openTextDocument(uri);
      } else {
        const editor = vscode.window.activeTextEditor;
        if (editor?.document.languageId === "sparql") {
          document = editor.document;
        }
      }
      const query = document ? document.getText() : "";
      const endpoint = document ? await findEndpointUrl(document) : "";
      queryPanel.show(query, endpoint);
    })
  );

  // // Status bar item: click to open the query panel for the active SPARQL file
  // const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  // statusBarItem.command = "sparql-qlue.showQueryPanel";
  // statusBarItem.text = "$(play) SPARQL";
  // statusBarItem.tooltip = "SPARQL Qlue: Open query panel";
  // statusBarItem.backgroundColor = undefined;
  // context.subscriptions.push(statusBarItem);
  // const updateStatusBar = (editor: vscode.TextEditor | undefined) => {
  //   if (editor?.document.languageId === "sparql") {
  //     statusBarItem.show();
  //   } else {
  //     statusBarItem.hide();
  //   }
  // };
  // updateStatusBar(vscode.window.activeTextEditor);
  // context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(updateStatusBar));

  // Format-on-save via LSP when sparql-qlue.formatOnSave is enabled
  context.subscriptions.push(
    vscode.workspace.onWillSaveTextDocument((event) => {
      if (event.document.languageId !== "sparql") { return; }
      const config = vscode.workspace.getConfiguration("sparql-qlue", event.document.uri);
      if (!config.get<boolean>("formatOnSave", false)) { return; }
      event.waitUntil(
        vscode.commands.executeCommand<vscode.TextEdit[]>("vscode.executeFormatDocumentProvider", event.document.uri).then(
          (edits) => edits ?? []
        )
      );
    })
  );

  // Auto-setup backend when the active SPARQL editor changes
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(async (editor) => {
      if (!editor || editor.document.languageId !== "sparql") { return; }
      await setupEndpoint(editor.document);
    })
  );

  // Re-check backend when the endpoint comment is edited in a SPARQL document
  let endpointDebounce: ReturnType<typeof setTimeout> | undefined;
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.languageId !== "sparql") { return; }
      if (vscode.window.activeTextEditor?.document !== event.document) { return; }
      clearTimeout(endpointDebounce);
      endpointDebounce = setTimeout(async () => await setupEndpoint(event.document), 1000);
    })
  );

  // Start the WASM language server (non-blocking — commands are already registered)
  startLanguageServer(context).then(async (lc) => {
    client = lc;
    // Seed backend for the already-open SPARQL file (if any)
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor?.document.languageId === "sparql") {
      await setupEndpoint(activeEditor.document);
    }
  }).catch((err: unknown) => {
    vscode.window.showErrorMessage(`SPARQL Qlue: Failed to start language server: ${err instanceof Error ? err.message : String(err)}`);
  });
}

export function deactivate(): Promise<void> | undefined {
  if (queryPanel) {
    queryPanel.dispose();
  }
  return client?.stop();
}
