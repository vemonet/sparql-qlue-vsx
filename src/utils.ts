import * as vscode from 'vscode';
import { DEFAULT_PREFIX_MAP, SparqlExample, type ClassSchema } from './state';

function getExtensionVersion(): string {
  return (
    (vscode.extensions.getExtension('vemonet.sparql-qlue')?.packageJSON as Record<string, string> | undefined)
      ?.version ?? 'unknown'
  );
}

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
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
  const rootUri = workspaceFolder?.uri;
  let currentUri = vscode.Uri.joinPath(document.uri, '..');
  while (true) {
    const endpointFileUri = vscode.Uri.joinPath(currentUri, 'endpoint.txt');
    try {
      const bytes = await vscode.workspace.fs.readFile(endpointFileUri);
      const content = new TextDecoder().decode(bytes).trim();
      if (content) {
        const firstLine = content.split(/\r?\n/).find((l) => l.trim());
        if (firstLine) {
          return firstLine.trim();
        }
      }
    } catch {
      /* not found — keep walking up */
    }
    if (rootUri && currentUri.toString() === rootUri.toString()) {
      break;
    }
    const parentUri = vscode.Uri.joinPath(currentUri, '..');
    if (parentUri.toString() === currentUri.toString()) {
      break;
    }
    currentUri = parentUri;
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
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

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
      'User-Agent': `sparql-qlue/${getExtensionVersion()}`,
    },
    body: query,
    signal,
  });
}

/** Fetch class/property schema from VoID descriptions at a SPARQL endpoint. */
export async function fetchEndpointClasses(endpointUrl: string, timeoutMs = 15000): Promise<ClassSchema[]> {
  const query = `PREFIX void: <http://rdfs.org/ns/void#>
PREFIX void-ext: <http://ldf.fi/void-ext#>

SELECT DISTINCT ?subjectClass ?prop ?objectClass ?objectDatatype
WHERE {
  {
    ?cp void:class ?subjectClass ;
        void:propertyPartition ?pp .
    ?pp void:property ?prop .
    OPTIONAL {
        {
            ?pp  void:classPartition [ void:class ?objectClass ] .
        } UNION {
            ?pp void-ext:datatypePartition [ void-ext:datatype ?objectDatatype ] .
        }
    }
  } UNION {
    ?linkset void:subjectsTarget [ void:class ?subjectClass ] ;
      void:linkPredicate ?prop ;
      void:objectsTarget [ void:class ?objectClass ] .
  }
}
LIMIT 500`;
  try {
    const response = await querySparql(endpointUrl, query, AbortSignal.timeout(timeoutMs));
    if (!response.ok) {
      return [];
    }
    const data = (await response.json()) as { results?: { bindings?: Array<Record<string, { value: string }>> } };
    const schemas: ClassSchema[] = [];
    for (const b of data.results?.bindings ?? []) {
      const subjectClass = b['subjectClass']?.value;
      const prop = b['prop']?.value;
      if (subjectClass && prop) {
        schemas.push({
          subjectClass,
          prop,
          objectClass: b['objectClass']?.value,
          objectDatatype: b['objectDatatype']?.value,
        });
      }
    }
    return schemas;
  } catch {
    return [];
  }
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
