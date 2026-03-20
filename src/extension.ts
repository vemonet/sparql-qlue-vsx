import * as vscode from 'vscode';
import { SparqlQueryPanel } from './panels/queryPanel';
import { buildPrefixMap, fetchEndpointPrefixes, findEndpointUrl } from './utils';
import SettingsPanel from './panels/settingsPanel';
import { SparqlLanguageServer } from './languageServer';
import { DEFAULT_COMPLETION_QUERIES, ExtensionState } from './state';

const lsServer = new SparqlLanguageServer();
let queryPanel: SparqlQueryPanel;
let extensionContext: vscode.ExtensionContext;
let state: ExtensionState;

/** Returns the endpoint for a document, either saved override or discovered automatically. */
async function getDocEndpoint(document: vscode.TextDocument): Promise<string> {
  const overrides = state?.getFileEndpoints() ?? {};
  return overrides[document.uri.toString()] ?? (await findEndpointUrl(document));
}

/** Set up the backend for a given document. */
export async function useDocEndpoint(document: vscode.TextDocument): Promise<void> {
  const url = await getDocEndpoint(document);
  if (url) {
    await useBackend(url);
  }
}

/** Configure the language server to use the given endpoint URL as backend.
 *
 * - Check global state for a persisted backend config (prefixes, completion queries) for the URL.
 * - If the endpoint is new, its prefixes will be fetched and a backend config will be created.
 */
async function useBackend(endpointUrl: string): Promise<void> {
  if (!endpointUrl) {
    return;
  }
  const endpointBackends = state.getBackends();
  const prefixMap =
    endpointUrl in endpointBackends
      ? endpointBackends[endpointUrl].prefixMap
      : buildPrefixMap(await fetchEndpointPrefixes(endpointUrl, state.getSettings().timeoutMs as number | undefined));
  const backendConf = { prefixMap, queries: DEFAULT_COMPLETION_QUERIES };
  if (!(endpointUrl in endpointBackends)) {
    void state.setBackends({ ...endpointBackends, [endpointUrl]: backendConf });
  }
  try {
    await lsServer.useBackend(endpointUrl, backendConf);
  } catch (err) {
    vscode.window.showErrorMessage(
      `SPARQL Qlue: Failed to configure backend for ${endpointUrl}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return;
  }
  queryPanel?.setActiveBackendUrl(endpointUrl);
}

/** Activate the extension, main starting point. */
export async function activate(context: vscode.ExtensionContext) {
  extensionContext = context;
  state = new ExtensionState(context);
  // Register the query panel as a WebviewViewProvider (shown in the bottom panel)
  queryPanel = new SparqlQueryPanel(context);
  queryPanel.onEndpointChange = useBackend;
  context.subscriptions.push(vscode.window.registerWebviewViewProvider(SparqlQueryPanel.viewId, queryPanel));

  // Register commands first so they are always available regardless of LS startup
  context.subscriptions.push(
    vscode.commands.registerCommand('sparql-qlue.executeQuery', async (uri?: vscode.Uri) => {
      // Support both right-click from explorer (uri arg) and active editor
      let document: vscode.TextDocument | undefined;
      if (uri) {
        document = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(document, { preserveFocus: true, preview: false });
      } else {
        const editor = vscode.window.activeTextEditor;
        if (editor?.document.languageId === 'sparql') {
          document = editor.document;
        }
      }
      if (!document) {
        vscode.window.showWarningMessage('Open a .rq or .sparql file to execute a SPARQL query.');
        return;
      }
      const query = document.getText();
      const endpoint = await getDocEndpoint(document);
      queryPanel.show(query, endpoint, true, document.uri.toString());
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sparql-qlue.showQueryPanel', async (uri?: vscode.Uri) => {
      let document: vscode.TextDocument | undefined;
      if (uri) {
        document = await vscode.workspace.openTextDocument(uri);
      } else {
        const editor = vscode.window.activeTextEditor;
        if (editor?.document.languageId === 'sparql') {
          document = editor.document;
        }
      }
      const query = document ? document.getText() : '';
      const endpoint = document ? await getDocEndpoint(document) : '';
      queryPanel.show(query, endpoint, false, document?.uri.toString());
    }),
  );

  // Command: Open server settings webview
  context.subscriptions.push(
    vscode.commands.registerCommand('sparql-qlue.openServerSettings', async () => {
      SettingsPanel.createOrShow(context, lsServer, state, async (endpointUrl, config) => {
        // onSaveEndpointBackend callback: persist the new/updated backend config
        const backends = state.getBackends();
        backends[endpointUrl] = config;
        await state.setBackends(backends);
        await useBackend(endpointUrl);
      });
    }),
  );

  // Status bar quick-menu when click bottom-right: choose between Query panel and Settings
  context.subscriptions.push(
    vscode.commands.registerCommand('sparql-qlue.sparqlMenu', async () => {
      const choice = await vscode.window.showQuickPick(
        [
          { label: '$(play) Execute SPARQL Query', action: 'execute' },
          { label: '$(settings-gear) Configure SPARQL Language Server', action: 'settings' },
        ],
        { placeHolder: 'SPARQL Qlue' },
      );
      if (!choice) {
        return;
      }
      if (choice.action === 'execute') {
        vscode.commands.executeCommand('sparql-qlue.executeQuery');
      } else {
        vscode.commands.executeCommand('sparql-qlue.openServerSettings');
      }
    }),
  );

  // Status bar item at bottom-right: click to open the quick menu
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'sparql-qlue.sparqlMenu';
  statusBarItem.text = '$(database) SPARQL Qlue';
  statusBarItem.tooltip = 'SPARQL Qlue';
  context.subscriptions.push(statusBarItem);
  const updateStatusBar = (editor: vscode.TextEditor | undefined) => {
    if (editor?.document.languageId === 'sparql') {
      statusBarItem.show();
    } else {
      statusBarItem.hide();
    }
  };
  updateStatusBar(vscode.window.activeTextEditor);
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(async (editor) => {
      updateStatusBar(editor);
      if (editor?.document.languageId === 'sparql') {
        await useDocEndpoint(editor.document);
      }
    }),
  );

  // Format-on-save via LSP when sparql-qlue.formatOnSave is enabled
  context.subscriptions.push(
    vscode.workspace.onWillSaveTextDocument((event) => {
      if (event.document.languageId !== 'sparql') {
        return;
      }
      const config = vscode.workspace.getConfiguration('sparql-qlue', event.document.uri);
      if (!config.get<boolean>('formatOnSave', false)) {
        return;
      }
      event.waitUntil(
        vscode.commands
          .executeCommand<vscode.TextEdit[]>('vscode.executeFormatDocumentProvider', event.document.uri)
          .then((edits) => edits ?? []),
      );
    }),
  );

  // Re-check backend when the endpoint comment is edited in a SPARQL document
  let endpointDebounce: ReturnType<typeof setTimeout> | undefined;
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.languageId !== 'sparql') {
        return;
      }
      if (vscode.window.activeTextEditor?.document !== event.document) {
        return;
      }
      clearTimeout(endpointDebounce);
      endpointDebounce = setTimeout(async () => {
        await useDocEndpoint(event.document);
        queryPanel.updateQuery(event.document.getText());
      }, 1000);
    }),
  );

  // Start the WASM language server (non-blocking — commands are already registered)
  // Keep the language server in sync when users edit settings via the VS Code Settings UI
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (
        e.affectsConfiguration('sparql-qlue.format') ||
        e.affectsConfiguration('sparql-qlue.completion') ||
        e.affectsConfiguration('sparql-qlue.prefixes')
      ) {
        lsServer.updateSettings(state.getSettings()).catch((err: unknown) => {
          vscode.window.showErrorMessage(
            `SPARQL Qlue: Failed to apply settings: ${err instanceof Error ? err.message : String(err)}`,
          );
        });
      }
    }),
  );

  lsServer
    .start(context)
    .then(async () => {
      // Apply current settings (from VS Code configuration) so the LS starts with the right config
      try {
        await lsServer.updateSettings(state.getSettings());
      } catch (err) {
        // Non-fatal — settings will be re-applied when user opens the settings panel
        vscode.window.showWarningMessage(
          `SPARQL Qlue: Failed to apply saved settings: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      // Seed backend for the already-open SPARQL file (if any)
      const activeEditor = vscode.window.activeTextEditor;
      if (activeEditor?.document.languageId === 'sparql') {
        await useDocEndpoint(activeEditor.document);
      }
    })
    .catch((err: unknown) => {
      vscode.window.showErrorMessage(
        `SPARQL Qlue: Failed to start language server: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
}

export function deactivate(): Promise<void> | undefined {
  if (queryPanel) {
    queryPanel.dispose();
  }
  return lsServer.stop();
}
