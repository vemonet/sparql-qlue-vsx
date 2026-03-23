import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { randomBytes } from 'crypto';
import { DEFAULT_PREFIX_MAP, SparqlExample } from './state';

/**
 * Find the SPARQL endpoint URL from:
 * 1. A comment in the document starting with "#+ endpoint: "
 * 2. An endpoint.txt file in the same directory or any parent up to workspace root
 */
export async function findEndpointUrl(document: vscode.TextDocument): Promise<string> {
  // 1. Check for "#+ endpoint: " comment in the document
  const text = document.getText();
  const match = text.match(/^#\+\s*endpoint:\s*(.+)$/m);
  if (match) {
    return match[1].trim();
  }

  // 2. Look for endpoint.txt in the same folder and parent folders
  const documentDir = path.dirname(document.uri.fsPath);
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
  const rootDir = workspaceFolder?.uri.fsPath ?? path.parse(documentDir).root;
  let currentDir = documentDir;
  while (true) {
    const endpointFile = path.join(currentDir, 'endpoint.txt');
    try {
      if (fs.existsSync(endpointFile)) {
        const content = fs.readFileSync(endpointFile, 'utf-8').trim();
        if (content) {
          // Return the first non-empty line
          const firstLine = content.split(/\r?\n/).find((l) => l.trim());
          if (firstLine) {
            return firstLine.trim();
          }
        }
      }
    } catch {
      /* ignore read errors */
    }

    if (currentDir === rootDir || currentDir === path.dirname(currentDir)) {
      break;
    }
    currentDir = path.dirname(currentDir);
  }
  return '';
}

/** Fetch prefixes declared using SHACL vocabulary from a SPARQL endpoint. */
export async function fetchEndpointPrefixes(endpointUrl: string, timeoutMs = 5000): Promise<Record<string, string>> {
  const query = `PREFIX sh: <http://www.w3.org/ns/shacl#>
SELECT DISTINCT ?prefix ?namespace WHERE {
  [] sh:namespace ?namespace ; sh:prefix ?prefix .
} ORDER BY ?prefix`;
  try {
    const response = await querySparql(endpointUrl, query, AbortSignal.timeout(timeoutMs));
    if (!response.ok) {
      return {};
    }
    const data = (await response.json()) as { results?: { bindings?: Array<Record<string, { value: string }>> } };
    const prefixes: Record<string, string> = {};
    for (const binding of data.results?.bindings ?? []) {
      const prefix = binding['prefix']?.value;
      const ns = binding['namespace']?.value;
      if (prefix && ns) {
        prefixes[prefix] = ns;
      }
    }
    return prefixes;
  } catch {
    return {};
  }
}

/** Merge endpoint-specific prefixes with defaults, deduplicating by namespace value.
 * Endpoint prefixes win; a default is added only when neither its key nor its namespace
 * IRI is already present. The LS Converter rejects maps with duplicate namespace values. */
export function buildPrefixMap(
  prefixMap1: Record<string, string>,
  prefixMap2: Record<string, string> = DEFAULT_PREFIX_MAP,
): Record<string, string> {
  if (!prefixMap1 || Object.keys(prefixMap1).length === 0) {
    return prefixMap2;
  }
  const seen = new Set<string>();
  const map: Record<string, string> = {};
  // Endpoint prefixes are listed first so they win over defaults on duplicate namespaces.
  for (const [prefix, ns] of Object.entries({ ...prefixMap1, ...prefixMap2 })) {
    if (!seen.has(ns)) {
      map[prefix] = ns;
      seen.add(ns);
    }
  }
  return map;
}

/** Generate a cryptographically secure nonce string. */
export function getNonce(): string {
  return randomBytes(16).toString('hex');
}

const PKG_VERSION = (require('../package.json') as { version: string }).version;

/** Send a SPARQL query to an endpoint via HTTP POST and return the raw Response. */
export async function querySparql(
  endpointUrl: string,
  query: string,
  signal: AbortSignal = AbortSignal.timeout(5000),
  accept = 'application/sparql-results+json',
): Promise<Response> {
  return fetch(endpointUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/sparql-query',
      Accept: accept,
      'User-Agent': `sparql-qlue/${PKG_VERSION}`,
    },
    body: query,
    signal,
  });
}

/** Fetch SPARQL query examples declared with the SHACL/spex vocabulary from an endpoint. */
export async function fetchEndpointExamples(endpointUrl: string, timeoutMs = 10000): Promise<SparqlExample[]> {
  const query = `PREFIX sh: <http://www.w3.org/ns/shacl#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX spex: <https://purl.expasy.org/sparql-examples/ontology#>

SELECT DISTINCT ?sq ?comment ?query
WHERE {
    ?sq a sh:SPARQLExecutable ;
        rdfs:comment ?comment ;
        sh:select|sh:ask|sh:construct|spex:describe ?query .
} ORDER BY ?sq`;
  try {
    const response = await querySparql(endpointUrl, query, AbortSignal.timeout(timeoutMs));
    if (!response.ok) {
      return [];
    }
    const data = (await response.json()) as { results?: { bindings?: Array<Record<string, { value: string }>> } };
    const examples: SparqlExample[] = [];
    for (const binding of data.results?.bindings ?? []) {
      const uri = binding['sq']?.value;
      const comment = binding['comment']?.value;
      const queryText = binding['query']?.value;
      if (uri && comment && queryText) {
        examples.push({ uri, comment, query: queryText });
      }
    }
    return examples;
  } catch {
    return [];
  }
}
