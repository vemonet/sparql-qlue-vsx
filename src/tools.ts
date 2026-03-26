import * as vscode from 'vscode';
import { querySparql } from './utils';
import { type SearchDoc, type SearchIndex } from './searchIndex';

const MAX_RESULT_CHARS = 8000;

export function registerTools(
  context: vscode.ExtensionContext,
  getActiveEndpoint: () => string,
  getIndex: () => SearchIndex,
): void {
  context.subscriptions.push(
    vscode.lm.registerTool<{ query: string; endpoint?: string }>('sparql-qlue_execute_query', {
      async invoke(options, _token) {
        const { query } = options.input;
        const endpoint = options.input.endpoint?.trim() || getActiveEndpoint();
        if (!endpoint) {
          return {
            content: [
              new vscode.LanguageModelTextPart(
                'Error: no active SPARQL endpoint. Specify an endpoint URL or open a .rq file first.',
              ),
            ],
          };
        }
        try {
          const accept = /\b(CONSTRUCT|DESCRIBE)\b/i.test(query)
            ? 'text/turtle, application/n-triples, application/ld+json'
            : 'application/sparql-results+json';
          const response = await querySparql(endpoint, query, AbortSignal.timeout(30_000), accept);
          if (!response.ok) {
            const err = await response.text();
            return { content: [new vscode.LanguageModelTextPart(`HTTP ${response.status}: ${err.slice(0, 500)}`)] };
          }
          const text = await response.text();
          const out =
            text.length > MAX_RESULT_CHARS
              ? `${text.slice(0, MAX_RESULT_CHARS)}\n…(truncated — ${text.length} total chars)`
              : text;
          return { content: [new vscode.LanguageModelTextPart(out)] };
        } catch (err) {
          return {
            content: [new vscode.LanguageModelTextPart(`Error: ${err instanceof Error ? err.message : String(err)}`)],
          };
        }
      },
    }),

    vscode.lm.registerTool<{ query: string; endpoint?: string }>('sparql-qlue_get_examples', {
      invoke(options, _token) {
        const { query } = options.input;
        const endpoint = options.input.endpoint?.trim() || getActiveEndpoint() || undefined;
        const index = getIndex();
        if (index.endpointCount === 0) {
          return {
            content: [
              new vscode.LanguageModelTextPart(
                'No indexed endpoints yet. Execute a query against a SPARQL endpoint first to trigger indexing.',
              ),
            ],
          };
        }
        const results = index.search(query, endpoint);
        const header = endpoint ? `— ${endpoint}` : `(${index.endpointCount} endpoint(s))`;
        if (results.length === 0) {
          return { content: [new vscode.LanguageModelTextPart(`No results found for "${query}" ${header}.`)] };
        }
        return {
          content: [
            new vscode.LanguageModelTextPart(
              `# Search results for "${query}" ${header}\n\n${renderResultDocs(results)}`,
            ),
          ],
        };
      },
    }),
  );
}

function renderResultDocs(results: SearchDoc[]): string {
  const sections: string[] = [];
  const examples = results.filter((r) => r.type === 'example');
  const classes = results.filter((r) => r.type === 'class');
  if (examples.length) {
    sections.push('### Example Queries\n');
    sections.push(...examples.map((r) => r.formatted));
  }
  if (classes.length) {
    sections.push('\n### Class Schemas\n');
    sections.push(...classes.map((r) => r.formatted));
  }
  return sections.join('\n');
}
