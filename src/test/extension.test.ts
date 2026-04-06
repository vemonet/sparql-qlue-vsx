import * as assert from 'assert';
import * as vscode from 'vscode';

const EXTENSION_ID = 'vemonet.sparql-qlue';
const SPARQL_QUERY = 'SELECT * WHERE { ?s ?p ?o } LIMIT 10';
const UNIPROT_ENDPOINT = 'https://sparql.uniprot.org/sparql';
const UP_PREFIX = 'PREFIX up: <http://purl.uniprot.org/core/>';

suite('Extension activation', () => {
  let extension: vscode.Extension<unknown>;

  suiteSetup(async () => {
    extension = vscode.extensions.getExtension(EXTENSION_ID)!;
    if (!extension.isActive) {
      await extension.activate();
    }
  });

  test('extension is present and activates', () => {
    assert.ok(extension, `Extension ${EXTENSION_ID} not found`);
    assert.ok(extension.isActive, 'Extension should be active');
  });

  test('sparql-qlue.executeQuery command is registered', async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('sparql-qlue.executeQuery'), 'executeQuery command not registered');
  });

  test('sparql-qlue.showQueryPanel command is registered', async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('sparql-qlue.showQueryPanel'), 'showQueryPanel command not registered');
  });

  test('sparql-qlue.openServerSettings command is registered', async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('sparql-qlue.openServerSettings'), 'openServerSettings command not registered');
  });
});

suite('Extension SPARQL language recognition', () => {
  test(".rq files are assigned languageId 'sparql'", async () => {
    const doc = await vscode.workspace.openTextDocument({ language: 'sparql', content: SPARQL_QUERY });
    assert.strictEqual(doc.languageId, 'sparql');
  });

  test("opening the test query.rq fixture has languageId 'sparql'", async () => {
    const uri = vscode.Uri.joinPath(vscode.extensions.getExtension(EXTENSION_ID)!.extensionUri, 'docs', 'query.rq');
    const doc = await vscode.workspace.openTextDocument(uri);
    assert.strictEqual(doc.languageId, 'sparql');
  });
});

suite('Extension executeQuery command guard', () => {
  test('shows a warning when no SPARQL editor is active (non-sparql doc)', async () => {
    const doc = await vscode.workspace.openTextDocument({ language: 'plaintext', content: 'hello' });
    await vscode.window.showTextDocument(doc);
    try {
      await vscode.commands.executeCommand('sparql-qlue.executeQuery');
    } catch (e) {
      assert.fail(`executeQuery should not throw when no SPARQL editor is active: ${e}`);
    }
  });
});

/** Poll the format provider until the WASM LSP returns actual edits. */
async function waitForLsp(timeoutMs = 10000): Promise<void> {
  const probe = await vscode.workspace.openTextDocument({ language: 'sparql', content: 'select *where{?s?p?o}' });
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const edits = await vscode.commands.executeCommand<vscode.TextEdit[]>(
      'vscode.executeFormatDocumentProvider',
      probe.uri,
    );
    if (Array.isArray(edits) && edits.length > 0) {
      return;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('Timed out waiting for the SPARQL LSP to become ready');
}

/** Poll completions after `up:` until the UniProt backend is indexed and returns items. */
async function waitForBackend(timeoutMs = 60000): Promise<void> {
  const content = `${UP_PREFIX}\nSELECT * WHERE { ?s up:`;
  const probe = await vscode.workspace.openTextDocument({ language: 'sparql', content });
  // Column is at the very end of line 1, right after `up:`
  const position = new vscode.Position(1, 'SELECT * WHERE { ?s up:'.length);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const list = await vscode.commands.executeCommand<vscode.CompletionList>(
      'vscode.executeCompletionItemProvider',
      probe.uri,
      position,
    );
    const items =
      list instanceof vscode.CompletionList
        ? list.items
        : ((list as unknown as { items: vscode.CompletionItem[] })?.items ?? []);
    if (items.length > 0) {
      return;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('Timed out waiting for UniProt backend to be indexed');
}

function completionItems(list: vscode.CompletionList | unknown): vscode.CompletionItem[] {
  return list instanceof vscode.CompletionList
    ? list.items
    : ((list as unknown as { items: vscode.CompletionItem[] })?.items ?? []);
}

function itemLabel(item: vscode.CompletionItem): string {
  return typeof item.label === 'string' ? item.label : (item.label as vscode.CompletionItemLabel).label;
}

suite('Extension LSP language features', function () {
  // Increase suite timeout to accommodate UniProt indexing (prefix/class/example fetching)
  this.timeout(120000);

  suiteSetup(async function () {
    this.timeout(120000);
    const extension = vscode.extensions.getExtension(EXTENSION_ID)!;
    if (!extension.isActive) {
      await extension.activate();
    }
    await waitForLsp();

    // Register UniProt as backend — triggers background indexing of prefixes/classes/examples
    const backendDoc = await vscode.workspace.openTextDocument({
      language: 'sparql',
      content: `#+ endpoint: ${UNIPROT_ENDPOINT}\nSELECT * WHERE { ?s ?p ?o }`,
    });
    await (extension.exports as { useDocEndpoint: (doc: vscode.TextDocument) => Promise<void> }).useDocEndpoint(
      backendDoc,
    );

    // Wait until the LS has indexed UniProt predicates (smart poll on `up:` completions)
    await waitForBackend();
  });

  test('format document: edits are applied and keywords are capitalised', async () => {
    const unformatted = 'select *where{?s?p?o}';
    const doc = await vscode.workspace.openTextDocument({ language: 'sparql', content: unformatted });
    const editor = await vscode.window.showTextDocument(doc);
    const edits = await vscode.commands.executeCommand<vscode.TextEdit[]>(
      'vscode.executeFormatDocumentProvider',
      doc.uri,
    );
    assert.ok(Array.isArray(edits) && edits.length > 0, 'LSP formatter should return at least one edit');
    assert.ok(edits[0] instanceof vscode.TextEdit, 'edits should be vscode.TextEdit instances');
    const applied = await editor.edit((builder) => {
      for (const edit of edits) {
        builder.replace(edit.range, edit.newText);
      }
    });
    assert.ok(applied, 'edits should apply successfully');
    const result = doc.getText();
    assert.notStrictEqual(result, unformatted, 'formatted output should differ from the input');
    assert.ok(result.includes('SELECT'), 'formatted query should capitalise SELECT');
    assert.ok(result.includes('WHERE'), 'formatted query should capitalise WHERE');
  });

  test('hover provider: returns content over a UniProt prefixed IRI', async () => {
    const query = `${UP_PREFIX}\nSELECT * WHERE { ?s up:organism ?o }`;
    const doc = await vscode.workspace.openTextDocument({ language: 'sparql', content: query });
    await vscode.window.showTextDocument(doc);
    // Position inside `up:organism` on line 1 — `up:organism` starts at col 19
    const position = new vscode.Position(1, 22);
    const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
      'vscode.executeHoverProvider',
      doc.uri,
      position,
    );
    assert.ok(Array.isArray(hovers), 'hover provider should return an array');
    assert.ok(hovers.length > 0, 'hover should return results for up:organism');
    const hoverText = hovers
      .flatMap((h) => h.contents)
      .map((c) => (typeof c === 'string' ? c : (c as vscode.MarkdownString).value))
      .join('');
    assert.ok(hoverText.length > 0, `hover content should be non-empty, got: "${hoverText}"`);
    assert.ok(
      hoverText.includes('uniprot') || hoverText.includes('organism') || hoverText.includes('http'),
      `hover should reference UniProt IRI, got: "${hoverText}"`,
    );
  });

  test('completion provider: returns UniProt predicates after up: prefix', async () => {
    const content = `${UP_PREFIX}\nSELECT * WHERE { ?s up:`;
    const doc = await vscode.workspace.openTextDocument({ language: 'sparql', content });
    await vscode.window.showTextDocument(doc);
    const position = new vscode.Position(1, 'SELECT * WHERE { ?s up:'.length);
    const list = await vscode.commands.executeCommand<vscode.CompletionList>(
      'vscode.executeCompletionItemProvider',
      doc.uri,
      position,
    );
    assert.ok(list !== undefined && list !== null, 'completion should return a result');
    const items = completionItems(list);
    assert.ok(items.length > 0, `expected UniProt predicate completions after up:, got ${items.length} items`);
    const labels = items.map(itemLabel);
    assert.ok(
      labels.some((l) => l.startsWith('up:') || l.includes('organism') || l.includes('Protein')),
      `expected UniProt terms among completions, got: [${labels.slice(0, 8).join(', ')}]`,
    );
  });
});

suite('Extension execute query', function () {
  this.timeout(30000);

  suiteSetup(async function () {
    this.timeout(30000);
    const extension = vscode.extensions.getExtension(EXTENSION_ID)!;
    if (!extension.isActive) {
      await extension.activate();
    }
  });

  test('executeQuery command does not throw when SPARQL doc is active', async () => {
    const content = `#+ endpoint: ${UNIPROT_ENDPOINT}\n${UP_PREFIX}\nSELECT * WHERE { ?s ?p ?o } LIMIT 5`;
    const doc = await vscode.workspace.openTextDocument({ language: 'sparql', content });
    await vscode.window.showTextDocument(doc);
    try {
      await vscode.commands.executeCommand('sparql-qlue.executeQuery');
    } catch (e) {
      assert.fail(`executeQuery should not throw: ${e}`);
    }
  });

  test('UniProt endpoint returns valid SPARQL JSON results', async () => {
    const query = 'SELECT * WHERE { ?s ?p ?o } LIMIT 5';
    const url = new URL(UNIPROT_ENDPOINT);
    url.searchParams.set('query', query);
    const resp = await fetch(url.toString(), {
      headers: { Accept: 'application/sparql-results+json' },
    });
    assert.ok(resp.ok, `UniProt endpoint returned HTTP ${resp.status}`);
    const contentType = resp.headers.get('content-type') ?? '';
    assert.ok(
      contentType.includes('json') || contentType.includes('sparql-results'),
      `expected JSON content-type, got: ${contentType}`,
    );
    const json = (await resp.json()) as { results?: { bindings?: unknown[] } };
    const results = json.results;
    assert.ok(results, 'response should have a results field');
    assert.ok(Array.isArray(results!.bindings), 'results.bindings should be an array');
    assert.ok((results!.bindings ?? []).length > 0, 'results.bindings should be non-empty');
  });
});
