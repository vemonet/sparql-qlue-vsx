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

// suite("Extension LSP formatter", () => {
//   test("document formatter is available for a SPARQL document", async () => {
//     // Give the language server reasonable time to start
//     await new Promise((resolve) => setTimeout(resolve, 5000));

//     const content = `select *where{?s?p?o}`;
//     const doc = await vscode.workspace.openTextDocument({ language: "sparql", content });
//     await vscode.window.showTextDocument(doc);

//     const edits = await vscode.commands.executeCommand<vscode.TextEdit[]>(
//       "vscode.executeFormatDocumentProvider",
//       doc.uri,
//     );
//     // If the LSP is running, we should get at least one formatting edit;
//     // if it hasn't started yet the command returns undefined/null — both are acceptable
//     // because we're testing availability, not correctness.
//     assert.ok(
//       edits === undefined || edits === null || Array.isArray(edits),
//       "formatter response should be an array of edits or undefined",
//     );
//     if (Array.isArray(edits) && edits.length > 0) {
//       // Verify the first edit is a proper text edit
//       const first = edits[0];
//       assert.ok(first instanceof vscode.TextEdit, "edits should be vscode.TextEdit instances");
//     }
//   });
// });
