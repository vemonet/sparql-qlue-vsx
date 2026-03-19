import * as vscode from 'vscode';
import { type LanguageClient } from 'vscode-languageclient/node';
import { SparqlQueryPanel } from './queryPanel';
import { fetchEndpointPrefixes, findEndpointUrl } from './utils';
import { type BackendConfig, DEFAULT_PREFIX_MAP, DEFAULT_COMPLETION_QUERIES } from './backendConf';
import SettingsPanel from './settingsPanel';
import { startLanguageServer } from './languageServer';

let client: LanguageClient | undefined;
let queryPanel: SparqlQueryPanel;
let extensionContext: vscode.ExtensionContext;

/** Returns the endpoint for a document, preferring any user override saved at workspace level. */
async function getEffectiveEndpointUrl(document: vscode.TextDocument): Promise<string> {
  const overrides = extensionContext?.workspaceState.get<Record<string, string>>('sparql-qlue.fileEndpoints') ?? {};
  return overrides[document.uri.toString()] ?? (await findEndpointUrl(document));
}

export async function setupEndpoint(document: vscode.TextDocument): Promise<void> {
  const url = await getEffectiveEndpointUrl(document);
  if (url) {
    await setupBackendForEndpoint(url);
  }
}

/** Merge endpoint-specific prefixes with defaults, deduplicating by namespace value.
 * Endpoint prefixes win; a default is added only when neither its key nor its namespace
 * IRI is already present. The LS Converter rejects maps with duplicate namespace values. */
function buildPrefixMap(endpointPrefixes: Record<string, string>): Record<string, string> {
  const seen = new Set<string>();
  const map: Record<string, string> = {};
  for (const [prefix, ns] of Object.entries(endpointPrefixes)) {
    if (!seen.has(ns)) {
      map[prefix] = ns;
      seen.add(ns);
    }
  }
  for (const [prefix, ns] of Object.entries(DEFAULT_PREFIX_MAP)) {
    if (!(prefix in map) && !seen.has(ns)) {
      map[prefix] = ns;
      seen.add(ns);
    }
  }
  return map;
}

async function setupBackendForEndpoint(endpointUrl: string): Promise<void> {
  if (!client || !endpointUrl) {
    return;
  }

  const endpointBackends =
    extensionContext.globalState.get<Record<string, BackendConfig>>('sparql-qlue.endpointBackends') ?? {};

  // New endpoints: fetch endpoint-declared prefixes, dedup+merge with defaults, persist.
  // Known endpoints: reuse the already-deduped stored prefixMap.
  let prefixMap: Record<string, string>;
  if (!(endpointUrl in endpointBackends)) {
    const endpointPrefixes = await fetchEndpointPrefixes(endpointUrl);
    prefixMap = Object.keys(endpointPrefixes).length > 0 ? buildPrefixMap(endpointPrefixes) : DEFAULT_PREFIX_MAP;
    const latest =
      extensionContext.globalState.get<Record<string, BackendConfig>>('sparql-qlue.endpointBackends') ?? {};
    latest[endpointUrl] = { prefixMap, queries: DEFAULT_COMPLETION_QUERIES };
    void extensionContext.globalState.update('sparql-qlue.endpointBackends', latest);
  } else {
    prefixMap = buildPrefixMap(endpointBackends[endpointUrl].prefixMap) ?? DEFAULT_PREFIX_MAP;
    // prefixMap = endpointBackends[endpointUrl].prefixMap ?? DEFAULT_PREFIX_MAP;
  }

  try {
    await client.sendNotification('qlueLs/addBackend', {
      name: endpointUrl,
      url: endpointUrl,
      default: true,
      prefixMap,
      queries: DEFAULT_COMPLETION_QUERIES,
    });
  } catch (err) {
    vscode.window.showErrorMessage(
      `SPARQL Qlue: Failed to add backend for ${endpointUrl}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return;
  }
  try {
    await client.sendNotification('qlueLs/updateDefaultBackend', { backendName: endpointUrl });
  } catch (err) {
    vscode.window.showErrorMessage(
      `SPARQL Qlue: Failed to update default backend for ${endpointUrl}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  queryPanel?.setActiveBackendUrl(endpointUrl);
}

export async function activate(context: vscode.ExtensionContext) {
  extensionContext = context;
  // Register the query panel as a WebviewViewProvider (shown in the bottom panel)
  queryPanel = new SparqlQueryPanel(context);
  queryPanel.onEndpointChange = setupBackendForEndpoint;
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
      const endpoint = await getEffectiveEndpointUrl(document);
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
      const endpoint = document ? await getEffectiveEndpointUrl(document) : '';
      queryPanel.show(query, endpoint, false, document?.uri.toString());
    }),
  );

  // Command: Open server settings webview
  context.subscriptions.push(
    vscode.commands.registerCommand('sparql-qlue.openServerSettings', async () => {
      const serverSettings = context.globalState.get<any>('sparql-qlue.serverSettings') ?? {};
      const endpointBackends =
        context.globalState.get<Record<string, BackendConfig>>('sparql-qlue.endpointBackends') ?? {};
      SettingsPanel.createOrShow(
        context,
        () => client,
        serverSettings,
        endpointBackends,
        async (endpointUrl, config) => {
          // Persist the updated backend config
          const backends = context.globalState.get<Record<string, BackendConfig>>('sparql-qlue.endpointBackends') ?? {};
          backends[endpointUrl] = config;
          await context.globalState.update('sparql-qlue.endpointBackends', backends);
          // Re-register on next use by calling setupBackendForEndpoint directly.
          // Re-register on next use by calling setupBackendForEndpoint directly.
          await setupBackendForEndpoint(endpointUrl);
        },
      );
    }),
  );

  // Status bar quick-menu: click to choose between Results panel and Settings
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

  // Status bar item: click to open the quick menu
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
        await setupEndpoint(editor.document);
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
        await setupEndpoint(event.document);
        queryPanel.updateQuery(event.document.getText());
      }, 1000);
    }),
  );

  // Start the WASM language server (non-blocking — commands are already registered)
  startLanguageServer(context)
    .then(async (lc) => {
      client = lc;
      // Re-apply persisted settings so they survive a VS Code restart
      const savedSettings = context.globalState.get<any>('sparql-qlue.serverSettings');
      if (savedSettings && Object.keys(savedSettings).length > 0) {
        try {
          await client.sendNotification('qlueLs/changeSettings', savedSettings);
        } catch (err) {
          // Non-fatal — settings will be re-applied when user opens the settings panel
          vscode.window.showWarningMessage(
            `SPARQL Qlue: Failed to apply saved settings: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
      // Seed backend for the already-open SPARQL file (if any)
      const activeEditor = vscode.window.activeTextEditor;
      if (activeEditor?.document.languageId === 'sparql') {
        await setupEndpoint(activeEditor.document);
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
  return client?.stop();
}
