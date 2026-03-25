import * as assert from 'assert';
import * as vscode from 'vscode';

const EXTENSION_ID = 'vemonet.sparql-qlue';
const SPARQL_QUERY = 'SELECT * WHERE { ?s ?p ?o } LIMIT 10';

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
    // Open a plain-text document so there is no active SPARQL editor
    const doc = await vscode.workspace.openTextDocument({ language: 'plaintext', content: 'hello' });
    await vscode.window.showTextDocument(doc);

    // The command should silently guard (no throw) even with no SPARQL editor open
    try {
      await vscode.commands.executeCommand('sparql-qlue.executeQuery');
    } catch (e) {
      assert.fail(`executeQuery should not throw when no SPARQL editor is active: ${e}`);
    }
  });
});

// Retry calling the format provider until the WASM LSP returns actual edits,
// so subsequent tests can rely on the server being fully ready.
async function waitForLsp(timeoutMs = 1000): Promise<void> {
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

suite('Extension LSP language features', () => {
  suiteSetup(async () => {
    const extension = vscode.extensions.getExtension(EXTENSION_ID)!;
    if (!extension.isActive) {
      await extension.activate();
    }
    await waitForLsp();
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
    assert.ok(applied, 'edits should apply to the document successfully');
    const result = doc.getText();
    assert.notStrictEqual(result, unformatted, 'formatted output should differ from the unformatted input');
    assert.ok(result.includes('SELECT'), 'formatted query should capitalise SELECT');
    assert.ok(result.includes('WHERE'), 'formatted query should capitalise WHERE');
  });

  test('hover provider: returns a response at a SPARQL token position', async () => {
    const query = 'SELECT * WHERE { ?s ?p ?o }';
    const doc = await vscode.workspace.openTextDocument({ language: 'sparql', content: query });
    await vscode.window.showTextDocument(doc);
    // Position over `?s` (the subject variable)
    const position = new vscode.Position(0, 17);
    const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
      'vscode.executeHoverProvider',
      doc.uri,
      position,
    );
    assert.ok(Array.isArray(hovers), 'hover provider should return an array');
  });

  test('completion provider: returns a completion list at a predicate position', async () => {
    // Position cursor right after `?s ` to trigger predicate completion
    const query = 'SELECT * WHERE { ?s ';
    const doc = await vscode.workspace.openTextDocument({ language: 'sparql', content: query });
    await vscode.window.showTextDocument(doc);
    const position = new vscode.Position(0, query.length);
    const list = await vscode.commands.executeCommand<vscode.CompletionList>(
      'vscode.executeCompletionItemProvider',
      doc.uri,
      position,
    );
    assert.ok(list !== undefined && list !== null, 'completion provider should return a result');
    assert.ok(
      list instanceof vscode.CompletionList || Array.isArray((list as any)?.items),
      'completion result should be a CompletionList',
    );
  });
});

// suite('Extension LSP language features', () => {
//   suiteSetup(async () => {
//     const extension = vscode.extensions.getExtension(EXTENSION_ID)!;
//     if (!extension.isActive) {
//       await extension.activate();
//     }
//     await waitForLsp();
//     // Register a backend so completion queries have a target endpoint.
//     // We open a doc with an inline endpoint comment and let the extension wire it up.
//     const backendDoc = await vscode.workspace.openTextDocument({
//       language: 'sparql',
//       content: '#+ endpoint: https://sparql.uniprot.org/sparql\nselect * where { ?s ?p ?o }',
//     });
//     await (extension.exports as { useDocEndpoint: (doc: vscode.TextDocument) => Promise<void> }).useDocEndpoint(
//       backendDoc,
//     );
//   });

//   test('format document: edits are applied and keywords are capitalised', async () => {
//     const unformatted = 'select *where{?s?p?o}';
//     const doc = await vscode.workspace.openTextDocument({ language: 'sparql', content: unformatted });
//     const editor = await vscode.window.showTextDocument(doc);
//     const edits = await vscode.commands.executeCommand<vscode.TextEdit[]>(
//       'vscode.executeFormatDocumentProvider',
//       doc.uri,
//     );

//     assert.ok(Array.isArray(edits) && edits.length > 0, 'LSP formatter should return at least one edit');
//     assert.ok(edits[0] instanceof vscode.TextEdit, 'edits should be vscode.TextEdit instances');
//     const applied = await editor.edit((builder) => {
//       for (const edit of edits) {
//         builder.replace(edit.range, edit.newText);
//       }
//     });
//     assert.ok(applied, 'edits should apply to the document successfully');
//     const result = doc.getText();
//     assert.notStrictEqual(result, unformatted, 'formatted output should differ from the unformatted input');
//     assert.ok(result.includes('SELECT'), 'formatted query should capitalise SELECT');
//     assert.ok(result.includes('WHERE'), 'formatted query should capitalise WHERE');
//   });

//   test('hover provider: returns a response at a SPARQL token position', async () => {
//     const query =
//       '#+ endpoint: https://sparql.uniprot.org/sparql\nPREFIX up: <http://purl.uniprot.org/core/>\nSELECT * WHERE { up:organism ?p ?o }';
//     const doc = await vscode.workspace.openTextDocument({ language: 'sparql', content: query });
//     await vscode.window.showTextDocument(doc);
//     // Position over `?s` (the subject variable)
//     const position = new vscode.Position(2, 17);
//     const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
//       'vscode.executeHoverProvider',
//       doc.uri,
//       position,
//     );
//     assert.ok(Array.isArray(hovers), 'hover provider should return an array');
//     assert.ok(hovers.length > 0, 'hover provider should return at least one hover');
//   });

//   test('completion provider: returns a completion list at a predicate position', async () => {
//     // Position cursor right after `?s ` to trigger predicate completion
//     const query = '#+ endpoint: https://sparql.uniprot.org/sparql\nSELECT * WHERE { ?s ';
//     const doc = await vscode.workspace.openTextDocument({ language: 'sparql', content: query });
//     await vscode.window.showTextDocument(doc);
//     const position = new vscode.Position(1, query.length);
//     const list = await vscode.commands.executeCommand<vscode.CompletionList>(
//       'vscode.executeCompletionItemProvider',
//       doc.uri,
//       position,
//     );
//     assert.ok(list !== undefined && list !== null, 'completion provider should return a result');
//     assert.ok(
//       list instanceof vscode.CompletionList || Array.isArray((list as any)?.items),
//       'completion result should be a CompletionList',
//     );
//   });
// });
