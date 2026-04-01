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

const lsServer = new SparqlLanguageServer();
let queryPanel: SparqlQueryPanel;
let extensionContext: vscode.ExtensionContext;
let state: ExtensionState;
let currentEndpoint = '';

/** In-memory search index for all indexed endpoints. */
const searchIndex = new SearchIndex();

function localName(iri: string): string {
  const i = Math.max(iri.lastIndexOf('#'), iri.lastIndexOf('/'));
  return i >= 0 ? iri.slice(i + 1) : iri;
}

/** Build docs for a backend and add them to the shared search index under the given endpoint. */
function indexBackend(endpointUrl: string, backend: BackendConfig): void {
  const docs: SearchDoc[] = [];
  for (const ex of backend.examples ?? []) {
    docs.push({
      type: 'example',
      label: ex.comment,
      keywords: `${ex.comment} ${ex.query}`.toLowerCase(),
      formatted: `### ${ex.comment}\n\`\`\`sparql\n${ex.query}\n\`\`\``,
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
  currentEndpoint = endpointUrl;
  const backends = state.getBackends();
  let backend = backends[endpointUrl];
  if (!backend) {
    const prefixMap = buildPrefixMap(
      await fetchEndpointPrefixes(endpointUrl, state.getSettings().timeoutMs as number | undefined),
    );
    backend = { prefixMap, queries: DEFAULT_COMPLETION_QUERIES };
    await state.setBackends({ ...state.getBackends(), [endpointUrl]: backend });
  }
  try {
    await lsServer.useBackend(endpointUrl, backend);
  } catch (err) {
    vscode.window.showErrorMessage(
      `SPARQL Qlue: Failed to configure backend for ${endpointUrl}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return;
  }
  queryPanel?.setActiveBackendUrl(endpointUrl, backend);

  // Build in-memory search index if not already present
  if (!searchIndex.hasEndpoint(endpointUrl)) {
    const current = state.getBackends()[endpointUrl];
    if (current.examples !== undefined || current.classSchemas !== undefined) {
      // All data already stored — index immediately
      indexBackend(endpointUrl, current);
      queryPanel?.setActiveBackendUrl(endpointUrl, current);
    } else {
      // Fetch missing data in the background
      void vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Indexing endpoint ${endpointUrl}…`,
          cancellable: false,
        },
        async () => {
          const timeoutMs = (state.getSettings().completion as Record<string, unknown>)?.timeoutMs as
            | number
            | undefined;
          const [examples, classSchemas] = await Promise.all([
            current.examples ?? fetchEndpointExamples(endpointUrl, timeoutMs),
            current.classSchemas ?? fetchEndpointClasses(endpointUrl, timeoutMs),
          ]);
          const updated: BackendConfig = { ...current, examples, classSchemas };
          await state.setBackends({ ...state.getBackends(), [endpointUrl]: updated });
          indexBackend(endpointUrl, updated);
          queryPanel?.setActiveBackendUrl(endpointUrl, updated);
          vscode.window.showInformationMessage(
            `Indexed SPARQL endpoint ${endpointUrl}\n${examples.length} examples · ${classSchemas.length} class schemas · ${Object.keys(updated.prefixMap).length} prefixes`,
          );
        },
      );
    }
  }
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

  return { useDocEndpoint };
}

export function deactivate(): Promise<void> | undefined {
  if (queryPanel) {
    queryPanel.dispose();
  }
  return lsServer.stop();
}
