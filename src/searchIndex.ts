export interface SearchDoc {
  type: 'example' | 'class';
  /** Short human-readable label used for display. */
  label: string;
  /** Search keywords derived from the doc (lower-cased). */
  keywords: string;
  /** Markdown string returned to the LLM / user. */
  formatted: string;
}

/**
 * Lightweight grep-style search index.
 * Docs are stored per endpoint and matched at query time via substring search.
 */
export class SearchIndex {
  private readonly store = new Map<string, SearchDoc[]>();

  add(endpoint: string, docs: SearchDoc[]): void {
    this.store.set(endpoint, docs);
  }

  hasEndpoint(endpoint: string): boolean {
    return this.store.has(endpoint);
  }

  search(queryText: string, endpoint?: string, topK = 8): SearchDoc[] {
    const terms = queryText
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 1);
    const sources = endpoint ? (this.store.get(endpoint) ?? []) : [...this.store.values()].flat();
    if (terms.length === 0) {
      return sources.slice(0, topK);
    }
    const scored: Array<{ doc: SearchDoc; score: number }> = [];
    for (const doc of sources) {
      let score = 0;
      for (const term of terms) {
        if (doc.keywords.includes(term)) {
          score++;
        }
      }
      if (score > 0) {
        scored.push({ doc, score });
      }
    }
    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map((s) => s.doc);
  }

  get endpointCount(): number {
    return this.store.size;
  }

  get size(): number {
    return [...this.store.values()].reduce((n, docs) => n + docs.length, 0);
  }
}
