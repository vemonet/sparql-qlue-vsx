import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { findEndpointUrl, getNonce } from '../utils';

suite('findEndpointUrl', () => {
  // ── Helper ────────────────────────────────────────────────────────────────

  /** Open an in-memory (untitled) document without touching disk. */
  async function openDoc(content: string): Promise<vscode.TextDocument> {
    return vscode.workspace.openTextDocument({ language: 'sparql', content });
  }

  /** Create a real temp file, open it as a document, return both. */
  async function openTempDoc(content: string, dir?: string): Promise<{ doc: vscode.TextDocument; filePath: string }> {
    const targetDir = dir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'sparql-qlue-test-'));
    const filePath = path.join(targetDir, `query-${Date.now()}.rq`);
    fs.writeFileSync(filePath, content, 'utf8');
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
    return { doc, filePath };
  }

  // ── Inline comment ────────────────────────────────────────────────────────

  test('reads endpoint from #+ endpoint: comment', async () => {
    const doc = await openDoc('#+ endpoint: https://sparql.uniprot.org/sparql\nSELECT * WHERE { ?s ?p ?o }');
    const url = await findEndpointUrl(doc);
    assert.strictEqual(url, 'https://sparql.uniprot.org/sparql');
  });

  test('trims whitespace around the endpoint URL in a comment', async () => {
    const doc = await openDoc('#+ endpoint:   https://example.org/sparql   \nSELECT * WHERE {}');
    const url = await findEndpointUrl(doc);
    assert.strictEqual(url, 'https://example.org/sparql');
  });

  test('reads endpoint even when the comment is not the first line', async () => {
    const doc = await openDoc(
      'PREFIX ex: <http://example.org/>\n#+ endpoint: https://example.org/sparql\nSELECT * WHERE {}',
    );
    const url = await findEndpointUrl(doc);
    assert.strictEqual(url, 'https://example.org/sparql');
  });

  test('returns empty string when no endpoint comment and no endpoint.txt', async () => {
    // Use a temp file in an isolated directory so no ancestor endpoint.txt interferes
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sparql-qlue-test-'));
    const { doc } = await openTempDoc('SELECT * WHERE { ?s ?p ?o }', tmpDir);
    const url = await findEndpointUrl(doc);
    assert.strictEqual(url, '');
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── endpoint.txt ─────────────────────────────────────────────────────────

  test('reads endpoint from endpoint.txt in the same directory', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sparql-qlue-test-'));
    try {
      fs.writeFileSync(path.join(tmpDir, 'endpoint.txt'), 'https://query.wikidata.org/sparql\n', 'utf8');
      const { doc } = await openTempDoc('SELECT * WHERE { ?s ?p ?o }', tmpDir);
      const url = await findEndpointUrl(doc);
      assert.strictEqual(url, 'https://query.wikidata.org/sparql');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('reads endpoint from endpoint.txt in a parent directory', async () => {
    const parentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sparql-qlue-test-'));
    try {
      const childDir = path.join(parentDir, 'subdir');
      fs.mkdirSync(childDir);
      fs.writeFileSync(path.join(parentDir, 'endpoint.txt'), 'https://dbpedia.org/sparql', 'utf8');
      const { doc } = await openTempDoc('SELECT * WHERE { ?s ?p ?o }', childDir);
      const url = await findEndpointUrl(doc);
      assert.strictEqual(url, 'https://dbpedia.org/sparql');
    } finally {
      fs.rmSync(parentDir, { recursive: true, force: true });
    }
  });

  test('inline comment takes priority over endpoint.txt', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sparql-qlue-test-'));
    try {
      fs.writeFileSync(path.join(tmpDir, 'endpoint.txt'), 'https://dbpedia.org/sparql', 'utf8');
      const { doc } = await openTempDoc('#+ endpoint: https://sparql.rhea-db.org/sparql/\nSELECT * WHERE {}', tmpDir);
      const url = await findEndpointUrl(doc);
      assert.strictEqual(url, 'https://sparql.rhea-db.org/sparql/');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('skips empty endpoint.txt and returns empty string', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sparql-qlue-test-'));
    try {
      fs.writeFileSync(path.join(tmpDir, 'endpoint.txt'), '   \n\n', 'utf8');
      const { doc } = await openTempDoc('SELECT * WHERE { ?s ?p ?o }', tmpDir);
      const url = await findEndpointUrl(doc);
      assert.strictEqual(url, '');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

suite('getNonce', () => {
  test('returns a 32-character alphanumeric string', () => {
    const nonce = getNonce();
    assert.strictEqual(nonce.length, 32);
    assert.match(nonce, /^[A-Za-z0-9]+$/);
  });

  test('returns a different value each time', () => {
    assert.notStrictEqual(getNonce(), getNonce());
  });
});
