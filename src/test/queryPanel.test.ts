import * as assert from 'assert';
import * as vscode from 'vscode';
import { SparqlQueryPanel, detectQueryType } from '../queryPanel';

// ── Minimal in-memory ExtensionContext mock ───────────────────────────────────

function makeMockContext(): vscode.ExtensionContext {
  const globalStore = new Map<string, unknown>();
  const workspaceStore = new Map<string, unknown>();
  return {
    globalState: {
      get: <T>(key: string) => globalStore.get(key) as T | undefined,
      update: async (key: string, value: unknown) => {
        globalStore.set(key, value);
      },
      keys: () => [...globalStore.keys()],
      setKeysForSync: () => {},
    },
    workspaceState: {
      get: <T>(key: string) => workspaceStore.get(key) as T | undefined,
      update: async (key: string, value: unknown) => {
        workspaceStore.set(key, value);
      },
      keys: () => [...workspaceStore.keys()],
    },
    subscriptions: [],
    extensionPath: '',
    extensionUri: vscode.Uri.file(''),
    extension: { packageJSON: { version: '0.0.0-test' } },
  } as unknown as vscode.ExtensionContext;
}

/** Access private members for white-box testing. */
function asAny(panel: SparqlQueryPanel): any {
  return panel as any;
}

// ── detectQueryType ───────────────────────────────────────────────────────────

suite('detectQueryType', () => {
  test('detects SELECT', () => {
    assert.strictEqual(detectQueryType('SELECT * WHERE { ?s ?p ?o }'), 'SELECT');
  });

  test('detects CONSTRUCT', () => {
    assert.strictEqual(detectQueryType('CONSTRUCT { ?s ?p ?o } WHERE { ?s ?p ?o }'), 'CONSTRUCT');
  });

  test('detects DESCRIBE', () => {
    assert.strictEqual(detectQueryType('DESCRIBE <http://example.org/>'), 'DESCRIBE');
  });

  test('detects ASK', () => {
    assert.strictEqual(detectQueryType('ASK { ?s ?p ?o }'), 'ASK');
  });

  test('detects INSERT (SPARQL Update)', () => {
    assert.strictEqual(detectQueryType('INSERT { <s> <p> <o> } WHERE {}'), 'INSERT');
  });

  test('detects DELETE (SPARQL Update)', () => {
    assert.strictEqual(detectQueryType('DELETE { <s> <p> <o> } WHERE {}'), 'DELETE');
  });

  test('defaults to SELECT when keyword not found', () => {
    assert.strictEqual(detectQueryType('{ ?s ?p ?o }'), 'SELECT');
  });

  test('is case-insensitive', () => {
    assert.strictEqual(detectQueryType('select * where { ?s ?p ?o }'), 'SELECT');
    assert.strictEqual(detectQueryType('construct { ?s ?p ?o } where { ?s ?p ?o }'), 'CONSTRUCT');
  });

  test('ignores keywords inside string literals', () => {
    // "CONSTRUCT" inside a string must not win over the real SELECT keyword
    assert.strictEqual(detectQueryType('SELECT ?x WHERE { ?x <p> "CONSTRUCT" }'), 'SELECT');
  });

  test('ignores keywords inside comments', () => {
    assert.strictEqual(detectQueryType('# CONSTRUCT\nSELECT * WHERE { ?s ?p ?o }'), 'SELECT');
  });
});

// ── SparqlQueryPanel endpoint management ─────────────────────────────────────

suite('SparqlQueryPanel endpoint list', () => {
  let panel: SparqlQueryPanel;
  let p: any; // same instance, typed as any for private access

  setup(() => {
    panel = new SparqlQueryPanel(makeMockContext());
    p = asAny(panel);
  });

  test('returns DEFAULT_ENDPOINTS when nothing has been saved', () => {
    const endpoints: string[] = p.getSavedEndpoints();
    assert.ok(endpoints.length > 0, 'should have at least the defaults');
    assert.ok(endpoints.includes('https://sparql.uniprot.org/sparql'), 'should contain UniProt endpoint');
    assert.ok(endpoints.includes('https://query.wikidata.org/sparql'), 'should contain Wikidata endpoint');
  });

  test('saveEndpoint prepends a new URL to the front', async () => {
    const newUrl = 'https://custom.example.org/sparql';
    await p.saveEndpoint(newUrl);
    const endpoints: string[] = p.getSavedEndpoints();
    assert.strictEqual(endpoints[0], newUrl);
  });

  test('saveEndpoint does not add a duplicate URL', async () => {
    const url = 'https://custom.example.org/sparql';
    await p.saveEndpoint(url);
    await p.saveEndpoint(url);
    const endpoints: string[] = p.getSavedEndpoints();
    const count = endpoints.filter((u: string) => u === url).length;
    assert.strictEqual(count, 1, 'duplicate URL should appear only once');
  });

  test('saveEndpoint caps the saved list at 50 entries', async () => {
    for (let i = 0; i < 55; i++) {
      await p.saveEndpoint(`https://example.org/sparql/${i}`);
    }
    const saved: string[] = p.context.globalState.get('sparql-qlue.savedEndpoints') ?? [];
    assert.ok(saved.length <= 50, `expected ≤50 saved entries, got ${saved.length}`);
  });

  test('deleteEndpoint removes a custom URL', async () => {
    const url = 'https://custom.example.org/sparql';
    await p.saveEndpoint(url);
    await p.deleteEndpoint(url);
    const endpoints: string[] = p.getSavedEndpoints();
    assert.ok(!endpoints.includes(url), 'deleted URL should not appear in list');
  });

  test('deleteEndpoint removes a default endpoint from results', async () => {
    const defaultUrl = 'https://sparql.uniprot.org/sparql';
    await p.deleteEndpoint(defaultUrl);
    const endpoints: string[] = p.getSavedEndpoints();
    assert.ok(!endpoints.includes(defaultUrl), 'deleted default URL should not appear');
  });

  test('deleted default endpoints do not reappear after delete', async () => {
    const defaultUrl = 'https://query.wikidata.org/sparql';
    await p.deleteEndpoint(defaultUrl);
    // Simulate creating a fresh panel sharing the same context (globalState persists)
    const panel2 = new SparqlQueryPanel(p.context);
    const endpoints: string[] = (panel2 as any).getSavedEndpoints();
    assert.ok(!endpoints.includes(defaultUrl), 'deleted default must stay removed');
  });

  test('getSavedEndpoints puts user-saved entries before defaults', async () => {
    const customUrl = 'https://my-endpoint.example.org/sparql';
    await p.saveEndpoint(customUrl);
    const endpoints: string[] = p.getSavedEndpoints();
    const customIdx = endpoints.indexOf(customUrl);
    const defaultIdx = endpoints.indexOf('https://sparql.uniprot.org/sparql');
    assert.ok(customIdx < defaultIdx, 'user-saved endpoint should precede defaults');
  });
});
