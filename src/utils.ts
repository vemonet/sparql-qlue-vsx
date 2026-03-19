import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

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

export function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/** Fetch prefixes declared using SHACL vocabulary from a SPARQL endpoint. */
export async function fetchEndpointPrefixes(endpointUrl: string): Promise<Record<string, string>> {
  const query = `PREFIX sh: <http://www.w3.org/ns/shacl#>
SELECT DISTINCT ?prefix ?namespace WHERE {
  [] sh:namespace ?namespace ; sh:prefix ?prefix .
} ORDER BY ?prefix`;
  try {
    const url = new URL(endpointUrl);
    url.searchParams.set('query', query);
    const response = await fetch(url.toString(), {
      headers: { Accept: 'application/sparql-results+json' },
      signal: AbortSignal.timeout(5000),
    });
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
