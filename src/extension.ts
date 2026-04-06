import * as vscode from 'vscode';
import { SparqlQueryPanel } from './panels/queryPanel';
import {
  buildPrefixMap,
  fetchEndpointClasses,
  fetchEndpointExamples,
  fetchEndpointPrefixes,
  findEndpointUrl,
} from './utils';
import SettingsPanel from './panels/settingsPanel';
import { SparqlLanguageServer } from './languageServer';
import { DEFAULT_COMPLETION_QUERIES, ExtensionState, type BackendConfig } from './state';
import { SPARQL_LEGEND, SparqlSemanticTokensProvider } from './semanticTokens';
import { SearchIndex, type SearchDoc } from './searchIndex';
import { registerTools } from './tools';
import { localEndpoint } from './localEndpoint';

const languageServer = new SparqlLanguageServer();
let queryPanel: SparqlQueryPanel;
let extensionContext: vscode.ExtensionContext;
let state: ExtensionState;
let currentEndpoint = '';
let statusBarItem: vscode.StatusBarItem;

/** In-memory search index for all indexed endpoints. */
const searchIndex = new SearchIndex();

function localName(iri: string): string {
  const i = Math.max(iri.lastIndexOf('#'), iri.lastIndexOf('/'));
  return i >= 0 ? iri.slice(i + 1) : iri;
}

function updateStatusBar(): void {
  if (!statusBarItem) {
    return;
  }
  const backends = state.getBackends();
  const backend = currentEndpoint ? backends[currentEndpoint] : undefined;
  const prefixCount = backend ? Object.keys(backend.prefixMap).length : 0;
  const exampleCount = backend?.examples?.length ?? 0;
  const classCount = backend?.classSchemas ? new Set(backend.classSchemas.map((cs) => cs.subjectClass)).size : 0;

  const md = new vscode.MarkdownString('', true);
  md.isTrusted = true;
  md.supportThemeIcons = true;
  md.appendMarkdown(`### $(database) SPARQL Qlue active backend\n\n`);
  md.appendMarkdown(`---\n\n`);
  md.appendMarkdown(`${currentEndpoint ? `**${currentEndpoint}**` : '_No backend configured_'}\n\n`);
  md.appendMarkdown(`&nbsp;&nbsp;$(symbol-namespace) **${prefixCount}** prefixes\n\n`);
  md.appendMarkdown(`&nbsp;&nbsp;$(code) **${exampleCount}** example queries\n\n`);
  md.appendMarkdown(`&nbsp;&nbsp;$(symbol-class) **${classCount}** classes\n\n`);
  md.appendMarkdown(`---\n\n`);
  md.appendMarkdown(`[$(play) Execute Query](command:sparql-qlue.executeQuery)&nbsp;&nbsp;&nbsp;`);
  md.appendMarkdown(`[$(output) Query Panel](command:sparql-qlue.showQueryPanel)&nbsp;&nbsp;&nbsp;`);
  if (exampleCount > 0) {
    md.appendMarkdown(`[$(code) Examples](command:sparql-qlue.showExamplesQuickPick)&nbsp;&nbsp;&nbsp;`);
  }
  md.appendMarkdown(`[$(gear) Settings](command:sparql-qlue.openServerSettings)`);
  statusBarItem.tooltip = md;
}

/** Build docs for a backend and add them to the shared search index under the given endpoint. */
function indexBackend(endpointUrl: string, backend: BackendConfig): void {
  const docs: SearchDoc[] = [];
  for (const ex of backend.examples ?? []) {
    docs.push({
      type: 'example',
      label: ex.comment,
      keywords: `${ex.comment} ${ex.query}`.toLowerCase(),
      formatted: `### ${ex.comment}\n\`\`\`sparql\n#+ endpoint: ${endpointUrl}\n${ex.query}\n\`\`\``,
    });
  }
  // Group class schemas by subjectClass
  const classMap = new Map<string, Array<{ prop: string; objectClass?: string; objectDatatype?: string }>>();
  for (const cs of backend.classSchemas ?? []) {
    const rows = classMap.get(cs.subjectClass) ?? [];
    rows.push({ prop: cs.prop, objectClass: cs.objectClass, objectDatatype: cs.objectDatatype });
    classMap.set(cs.subjectClass, rows);
  }
  for (const [cls, rows] of classMap) {
    const allIris = [
      cls,
      ...rows.map((r) => r.prop),
      ...rows.flatMap((r) => [r.objectClass, r.objectDatatype].filter(Boolean) as string[]),
    ];
    const propLines = rows
      .map(
        (r) =>
          `  - \`${r.prop}\`${r.objectClass ? ` → \`${r.objectClass}\`` : ''}${r.objectDatatype ? ` (${r.objectDatatype})` : ''}`,
      )
      .join('\n');
    docs.push({
      type: 'class',
      label: localName(cls),
      keywords: allIris.join(' ').toLowerCase(),
      formatted: `### \`${cls}\` (${localName(cls)})\n${propLines}`,
    });
  }
  searchIndex.add(endpointUrl, docs);
}

/** Returns the endpoint for a document, either saved override or discovered automatically.
 * Falls back to the local Oxigraph store if it is loaded and no other endpoint is found. */
async function getDocEndpoint(document: vscode.TextDocument): Promise<string> {
  const overrides = state?.getFileEndpoints() ?? {};
  const endpoint = overrides[document.uri.toString()] ?? (await findEndpointUrl(document));
  if (!endpoint && localEndpoint.isLoaded()) {
    return localEndpoint.url;
  }
  return endpoint;
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
  currentEndpoint = endpointUrl;
  updateStatusBar();

  // Local Oxigraph store: no LS registration or remote prefix/example fetching
  if (endpointUrl === localEndpoint.url) {
    queryPanel?.setActiveBackendUrl(endpointUrl);
    return;
  }
  const backends = state.getBackends();
  let backend = backends[endpointUrl];
  const isNew = !backend;
  if (isNew) {
    // Bootstrap with default prefixes immediately so the LS is usable right away.
    // Real prefixes and indexing data are fetched in the background below.
    backend = { prefixMap: buildPrefixMap({}), queries: DEFAULT_COMPLETION_QUERIES };
    await state.setBackends({ ...state.getBackends(), [endpointUrl]: backend });
  }
  try {
    await languageServer.useBackend(endpointUrl, backend);
  } catch (err) {
    vscode.window.showErrorMessage(
      `SPARQL Qlue: Failed to configure backend for ${endpointUrl}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return;
  }
  queryPanel?.setActiveBackendUrl(endpointUrl, backend);

  // Fetch metadata in the background when needed, without blocking the caller
  const needsIndex = !searchIndex.hasEndpoint(endpointUrl);
  if (isNew || needsIndex) {
    void fetchBackendMetadata(endpointUrl, isNew);
  }
}

/** Fetch prefixes, examples, and class schemas for an endpoint in the background.
 * Updates state, re-registers the LS backend if prefixes changed, and rebuilds the search index. */
async function fetchBackendMetadata(endpointUrl: string, fetchPrefixes: boolean): Promise<void> {
  const timeoutMs = (state.getSettings().completion as Record<string, unknown>)?.timeoutMs as number | undefined;
  void vscode.window.withProgress(
    { location: vscode.ProgressLocation.Window, title: `Indexing ${endpointUrl}…` },
    async () => {
      const current = state.getBackends()[endpointUrl];
      if (!current) {
        return;
      }
      const [rawPrefixes, examples, classSchemas] = await Promise.all([
        fetchPrefixes ? fetchEndpointPrefixes(endpointUrl, timeoutMs) : Promise.resolve(null),
        current.examples ?? fetchEndpointExamples(endpointUrl, timeoutMs),
        current.classSchemas ?? fetchEndpointClasses(endpointUrl, timeoutMs),
      ]);
      const prefixMap = rawPrefixes !== null ? buildPrefixMap(rawPrefixes) : current.prefixMap;
      const updated: BackendConfig = { ...current, prefixMap, examples, classSchemas };
      await state.setBackends({ ...state.getBackends(), [endpointUrl]: updated });
      if (rawPrefixes !== null) {
        // Re-register with the LS now that we have real prefixes
        await languageServer.useBackend(endpointUrl, updated).catch(() => {});
        queryPanel?.setActiveBackendUrl(endpointUrl, updated);
      }
      indexBackend(endpointUrl, updated);
      queryPanel?.setActiveBackendUrl(endpointUrl, updated);
      if (endpointUrl === currentEndpoint) {
        updateStatusBar();
      }
    },
  );
}

/** Activate the extension, main starting point. */
export async function activate(context: vscode.ExtensionContext) {
  extensionContext = context;
  state = new ExtensionState(context);
  // Register semantic token provider so our custom types override any active theme
  context.subscriptions.push(
    vscode.languages.registerDocumentSemanticTokensProvider(
      { language: 'sparql' },
      new SparqlSemanticTokensProvider(),
      SPARQL_LEGEND,
    ),
  );
  // Status bar item (bottom-right) — hover shows backend info, click opens settings
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 101);
  statusBarItem.name = 'SPARQL Qlue';
  statusBarItem.text = '$(database) SPARQL Qlue';
  statusBarItem.command = 'sparql-qlue.openServerSettings';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Register the query panel as a WebviewViewProvider (shown in the bottom panel)
  queryPanel = new SparqlQueryPanel(context);
  queryPanel.onEndpointChange = useBackend;
  context.subscriptions.push(vscode.window.registerWebviewViewProvider(SparqlQueryPanel.viewId, queryPanel));

  // Register Copilot LM tools (execute_query + search_docs)
  registerTools(
    context,
    () => currentEndpoint,
    () => searchIndex,
  );

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

  // Command: Show examples QuickPick for the current endpoint
  context.subscriptions.push(
    vscode.commands.registerCommand('sparql-qlue.showExamplesQuickPick', async () => {
      const examples = currentEndpoint ? (state.getBackends()[currentEndpoint]?.examples ?? []) : [];
      if (examples.length === 0) {
        vscode.window.showInformationMessage(
          currentEndpoint ? `No examples indexed for ${currentEndpoint}.` : 'No backend active.',
        );
        return;
      }
      const picked = await vscode.window.showQuickPick(
        examples.map((ex) => ({
          label: ex.comment,
          detail: ex.query.replace(/\s+/g, ' ').slice(0, 120),
          query: ex.query,
        })),
        { placeHolder: `Pick an example from ${currentEndpoint}`, matchOnDetail: true },
      );
      if (!picked) {
        return;
      }
      const doc = await vscode.workspace.openTextDocument({
        language: 'sparql',
        content: `#+ endpoint: ${currentEndpoint}\n${picked.query}`,
      });
      await vscode.window.showTextDocument(doc);
    }),
  );

  // Command: Open server settings webview
  context.subscriptions.push(
    vscode.commands.registerCommand('sparql-qlue.openServerSettings', async () => {
      const doc = vscode.window.activeTextEditor?.document;
      const activeEndpoint = (doc ? await getDocEndpoint(doc) : '') || currentEndpoint;
      SettingsPanel.createOrShow(context, state, activeEndpoint, async (endpointUrl, config) => {
        // onSaveEndpointBackend callback: persist the new/updated backend config
        const backends = state.getBackends();
        backends[endpointUrl] = config;
        await state.setBackends(backends);
        await useBackend(endpointUrl);
      });
    }),
  );

  // Command: Create a new SPARQL file from an endpoint example
  context.subscriptions.push(
    vscode.commands.registerCommand('sparql-qlue.newQueryFromExample', async (uri?: vscode.Uri) => {
      // Resolve the endpoint from the active document or the invoking file
      let endpointUrl = '';
      let document: vscode.TextDocument | undefined;
      if (uri) {
        try {
          document = await vscode.workspace.openTextDocument(uri);
        } catch {
          /* ignore */
        }
      } else {
        const editor = vscode.window.activeTextEditor;
        if (editor?.document.languageId === 'sparql') {
          document = editor.document;
        }
      }
      endpointUrl = document ? await getDocEndpoint(document) : '';

      if (!endpointUrl) {
        vscode.window.showWarningMessage(
          'No SPARQL endpoint found for this file. Add a "#+ endpoint: <url>" comment or an endpoint.txt file.',
        );
        return;
      }

      const backends = state.getBackends();
      let examples = backends[endpointUrl]?.examples;
      if (!examples) {
        examples = await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: 'Fetching examples…', cancellable: false },
          async () => {
            const timeoutMs = (state.getSettings().completion as Record<string, unknown> | undefined)?.timeoutMs as
              | number
              | undefined;
            const fetched = await fetchEndpointExamples(endpointUrl, timeoutMs);
            if (fetched.length > 0) {
              const backend = backends[endpointUrl];
              if (backend) {
                await state.setBackends({ ...backends, [endpointUrl]: { ...backend, examples: fetched } });
              }
            }
            return fetched;
          },
        );
      }
      if (examples.length === 0) {
        vscode.window.showInformationMessage(`No SPARQL examples found at ${endpointUrl}.`);
        return;
      }
      const items = examples.map((ex) => ({
        label: ex.comment,
        detail: ex.query.replace(/\s+/g, ' ').slice(0, 120),
        example: ex,
      }));
      const picked = await vscode.window.showQuickPick(items, {
        placeHolder: `Pick an example query from ${endpointUrl}`,
        matchOnDetail: true,
      });
      if (!picked) {
        return;
      }
      const header = `#+ endpoint: ${endpointUrl}\n`;
      const content = header + picked.example.query;
      const doc = await vscode.workspace.openTextDocument({ language: 'sparql', content });
      await vscode.window.showTextDocument(doc);
    }),
  );

  // Command: Load an RDF file into the local Oxigraph triplestore
  context.subscriptions.push(
    vscode.commands.registerCommand('sparql-qlue.addToLocalEndpoint', async (uri?: vscode.Uri) => {
      const targetUri = uri ?? vscode.window.activeTextEditor?.document.uri;
      if (!targetUri) {
        vscode.window.showWarningMessage('No RDF file selected.');
        return;
      }
      try {
        const count = await localEndpoint.addFile(targetUri);
        const { files } = localEndpoint.getInfo();
        queryPanel?.refreshEndpoints();
        vscode.window.showInformationMessage(`Local SPARQL endpoint: ${count} triples loaded (${files.join(', ')})`);
      } catch (err: unknown) {
        vscode.window.showErrorMessage(`Failed to load RDF file: ${err instanceof Error ? err.message : String(err)}`);
      }
    }),
  );

  // Command: Reset (clear) the local Oxigraph triplestore
  context.subscriptions.push(
    vscode.commands.registerCommand('sparql-qlue.resetLocalEndpoint', () => {
      localEndpoint.reset();
      queryPanel?.refreshEndpoints();
      vscode.window.showInformationMessage('Local SPARQL endpoint cleared.');
    }),
  );

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(async (editor) => {
      if (editor?.document.languageId === 'sparql') {
        await useDocEndpoint(editor.document);
      }
    }),
  );

  // Format-on-save via LSP when sparql-qlue.formatOnSave is enabled
  // TODO: is there a better way to do format on save through VSCode APIs?
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
        languageServer.updateSettings(state.getSettings()).catch((err: unknown) => {
          vscode.window.showErrorMessage(
            `SPARQL Qlue: Failed to apply settings: ${err instanceof Error ? err.message : String(err)}`,
          );
        });
      }
    }),
  );

  languageServer
    .start(context)
    .then(async () => {
      // Apply current settings (from VS Code configuration) so the LS starts with the right config
      try {
        await languageServer.updateSettings(state.getSettings());
      } catch (err) {
        // Non-fatal — settings will be re-applied when user opens the settings panel
        vscode.window.showWarningMessage(
          `SPARQL Qlue: Failed to apply saved settings: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      // Seed the backend for the active SPARQL file, or fall back to the most recently
      // used persisted endpoint so the LS always starts with a backend configured.
      const activeEditor = vscode.window.activeTextEditor;
      let seedEndpoint = '';
      if (activeEditor?.document.languageId === 'sparql') {
        seedEndpoint = await getDocEndpoint(activeEditor.document);
      }
      if (!seedEndpoint) {
        // No endpoint from the file, restore the last known endpoint from persisted state
        const backends = state.getBackends();
        const saved = state.getSavedEndpoints();
        seedEndpoint = saved.find((url) => backends[url]) ?? Object.keys(backends)[0] ?? '';
      }
      if (seedEndpoint) {
        await useBackend(seedEndpoint);
      }
    })
    .catch((err: unknown) => {
      vscode.window.showErrorMessage(
        `SPARQL Qlue: Failed to start language server: ${err instanceof Error ? err.message : String(err)}`,
      );
    });

  return { useDocEndpoint };
}

export function deactivate(): Promise<void> | undefined {
  if (queryPanel) {
    queryPanel.dispose();
  }
  return languageServer.stop();
}
