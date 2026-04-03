import * as vscode from 'vscode';

// Formats natively supported by oxigraph WASM
const RDF_MIME_TYPES: Record<string, string> = {
  '.ttl': 'text/turtle',
  '.nt': 'application/n-triples',
  '.nq': 'application/n-quads',
  '.trig': 'application/trig',
  '.rdf': 'application/rdf+xml',
  '.xml': 'application/rdf+xml',
};

// Formats that need pre-processing before loading into oxigraph
const JSONLD_EXTS = new Set(['.jsonld', '.json']);

export type LocalQueryResult = {
  ok: boolean;
  status: number;
  headers: { get(h: string): string | null };
  text(): Promise<string>;
};

export class LocalEndpoint {
  public readonly url = 'local://sparql-endpoint';
  private store: import('oxigraph').Store | null = null;
  private tripleCount = 0;
  private loadedFiles: string[] = [];

  isLoaded(): boolean {
    return this.store !== null && this.tripleCount > 0;
  }

  getInfo(): { triples: number; files: string[] } {
    return { triples: this.tripleCount, files: [...this.loadedFiles] };
  }

  async addFile(uri: vscode.Uri): Promise<number> {
    const extMatch = uri.path.match(/(\.\w+)$/);
    const ext = extMatch ? extMatch[1].toLowerCase() : '';
    const { Store } = await import('oxigraph');
    if (!this.store) {
      this.store = new Store();
    }
    const content = new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));
    if (JSONLD_EXTS.has(ext)) {
      // oxigraph WASM does not support JSON-LD natively; convert to N-Quads first
      const { toRDF } = await import('jsonld');
      const nquads = await toRDF(JSON.parse(content) as import('jsonld').JsonLdDocument, {
        format: 'application/n-quads',
        base: uri.toString(),
      });
      this.store.load(nquads as string, { format: 'application/n-quads' });
    } else {
      const mimeType = RDF_MIME_TYPES[ext];
      if (!mimeType) {
        throw new Error(`Unsupported RDF format: ${ext}`);
      }
      this.store.load(content, { format: mimeType, base_iri: uri.toString() });
    }
    this.tripleCount = this.store.size;
    const fileName = uri.path.split('/').pop() ?? uri.path;
    if (!this.loadedFiles.includes(fileName)) {
      this.loadedFiles.push(fileName);
    }
    return this.tripleCount;
  }

  reset(): void {
    this.store = null;
    this.tripleCount = 0;
    this.loadedFiles = [];
  }

  query(query: string, queryType: string): LocalQueryResult {
    if (!this.store) {
      return {
        ok: false,
        status: 500,
        headers: { get: () => 'text/plain' },
        text: async () => 'Local SPARQL endpoint is empty.',
      };
    }
    try {
      const results = this.store.query(query, { use_default_graph_as_union: true });
      if (queryType === 'ASK') {
        const body = JSON.stringify({ head: {}, boolean: results as boolean });
        return {
          ok: true,
          status: 200,
          headers: { get: (h) => (h === 'content-type' ? 'application/sparql-results+json' : null) },
          text: async () => body,
        };
      }
      if (queryType === 'CONSTRUCT' || queryType === 'DESCRIBE') {
        const lines: string[] = [];
        for (const quad of results as Iterable<import('oxigraph').Quad>) {
          lines.push(`${ntTerm(quad.subject)} ${ntTerm(quad.predicate)} ${ntTerm(quad.object)} .`);
        }
        return {
          ok: true,
          status: 200,
          headers: { get: (h) => (h === 'content-type' ? 'application/n-triples' : null) },
          text: async () => lines.join('\n'),
        };
      }
      // SELECT: results is Map<string, Term>[]
      const selectResults = results as Map<string, import('oxigraph').Term>[];
      const variables: string[] = selectResults.length > 0 ? [...selectResults[0].keys()] : [];
      const bindings: Record<string, Record<string, string>>[] = [];
      for (const solution of selectResults) {
        const binding: Record<string, Record<string, string>> = {};
        for (const [k, v] of solution) {
          if (v !== null && v !== undefined) {
            binding[k] = sparqlJsonTerm(v);
          }
        }
        bindings.push(binding);
      }
      const body = JSON.stringify({ head: { vars: variables }, results: { bindings } });
      return {
        ok: true,
        status: 200,
        headers: { get: (h) => (h === 'content-type' ? 'application/sparql-results+json' : null) },
        text: async () => body,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        status: 400,
        headers: { get: () => 'text/plain' },
        text: async () => msg,
      };
    }
  }
}

export const localEndpoint = new LocalEndpoint();

function ntTerm(term: import('oxigraph').Term): string {
  if (term.termType === 'NamedNode') {
    return `<${term.value}>`;
  }
  if (term.termType === 'BlankNode') {
    return `_:${term.value}`;
  }
  if (term.termType === 'Literal') {
    const esc = term.value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
    if (term.language) {
      return `"${esc}"@${term.language}`;
    }
    const dt = term.datatype?.value;
    if (dt && dt !== 'http://www.w3.org/2001/XMLSchema#string') {
      return `"${esc}"^^<${dt}>`;
    }
    return `"${esc}"`;
  }
  return `"${String(term.value)}"`;
}

function sparqlJsonTerm(term: import('oxigraph').Term): Record<string, string> {
  if (term.termType === 'NamedNode') {
    return { type: 'uri', value: term.value };
  }
  if (term.termType === 'BlankNode') {
    return { type: 'bnode', value: term.value };
  }
  if (term.termType === 'Literal') {
    const obj: Record<string, string> = { type: 'literal', value: term.value };
    if (term.language) {
      obj['xml:lang'] = term.language;
    } else {
      const dt = term.datatype?.value;
      if (dt && dt !== 'http://www.w3.org/2001/XMLSchema#string') {
        obj['datatype'] = dt;
      }
    }
    return obj;
  }
  return { type: 'literal', value: String(term.value) };
}
