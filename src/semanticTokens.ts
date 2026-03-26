import * as vscode from 'vscode';

export const SPARQL_TOKEN_TYPES = [
  'sparqlKeyword', // SELECT, WHERE, DISTINCT, PREFIX, …
  'sparqlFunction', // CONCAT, STRDT, COUNT, …
  'sparqlVariable', // ?x, $x
  'sparqlPrefixedName', // rdf:type, rdfs:, :local
  'sparqlIri', // <http://…>
  'sparqlBlankNode', // _:label
  'sparqlString', // "…", '…', """…"""
  'sparqlNumber', // 42, 3.14, 1e5
] as const;

export const SPARQL_LEGEND = new vscode.SemanticTokensLegend([...SPARQL_TOKEN_TYPES], []);

const TI = Object.fromEntries(SPARQL_TOKEN_TYPES.map((t, i) => [t, i])) as Record<
  (typeof SPARQL_TOKEN_TYPES)[number],
  number
>;

// Patterns mirror the scopes defined in sparql.tmLanguage.json
const KEYWORD_RE =
  /\b(PREFIX|BASE|SELECT|CONSTRUCT|DESCRIBE|ASK|WHERE|FROM|NAMED|ORDER|BY|LIMIT|OFFSET|DISTINCT|REDUCED|OPTIONAL|GRAPH|UNION|FILTER|GROUP|HAVING|VALUES|BIND|AS|SERVICE|SILENT|INSERT|DELETE|DATA|LOAD|CLEAR|DROP|CREATE|ADD|MOVE|COPY|WITH|USING|DEFAULT|ALL|TO|INTO|NOT|IN|EXISTS|MINUS|true|false)\b/gi;

const FUNCTION_RE =
  /\b(STR|LANG|LANGMATCHES|DATATYPE|BOUND|IRI|URI|BNODE|RAND|ABS|CEIL|FLOOR|ROUND|CONCAT|STRLEN|UCASE|LCASE|ENCODE_FOR_URI|CONTAINS|STRSTARTS|STRENDS|STRBEFORE|STRAFTER|YEAR|MONTH|DAY|HOURS|MINUTES|SECONDS|TIMEZONE|TZ|NOW|UUID|STRUUID|MD5|SHA1|SHA256|SHA384|SHA512|COALESCE|IF|STRLANG|STRDT|sameTerm|isIRI|isURI|isBLANK|isLITERAL|isNUMERIC|REGEX|SUBSTR|REPLACE|COUNT|SUM|MIN|MAX|AVG|SAMPLE|GROUP_CONCAT)\b/gi;

interface SkipRange {
  start: number;
  end: number;
  tokenType?: number; // when set, also emit this range as a token
}

/**
 * Collect ranges that should be skipped during token matching (strings, comments, IRIs).
 * String and IRI ranges also carry a tokenType so they can be emitted as tokens.
 */
function collectRanges(text: string): SkipRange[] {
  const ranges: SkipRange[] = [];
  const add = (start: number, end: number, tokenType?: number) => {
    if (!ranges.some((r) => start >= r.start && start < r.end)) {
      ranges.push({ start, end, tokenType });
    }
  };
  // Comments first, so quoted strings inside comments are not tokenized as strings.
  for (const m of text.matchAll(/#[^\n]*/g)) {
    add(m.index!, m.index! + m[0].length);
  }
  // Triple-quoted strings
  for (const m of text.matchAll(/"""[\s\S]*?"""|'''[\s\S]*?'''/g)) {
    add(m.index!, m.index! + m[0].length, TI.sparqlString);
  }
  // Single-quoted strings
  for (const m of text.matchAll(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g)) {
    add(m.index!, m.index! + m[0].length, TI.sparqlString);
  }
  // IRIs: exclude whitespace inside so comparison operators (<, >) are not matched
  for (const m of text.matchAll(/<[^>\s]*>/g)) {
    add(m.index!, m.index! + m[0].length, TI.sparqlIri);
  }
  return ranges;
}

function overlaps(ranges: SkipRange[], start: number, end: number): boolean {
  return ranges.some((r) => start < r.end && end > r.start);
}

/** Emit a token range, splitting across lines for multi-line string literals. */
function pushRange(
  builder: vscode.SemanticTokensBuilder,
  document: vscode.TextDocument,
  start: number,
  end: number,
  typeIndex: number,
): void {
  let offset = start;
  while (offset < end) {
    const pos = document.positionAt(offset);
    const lineEnd = document.offsetAt(new vscode.Position(pos.line + 1, 0));
    const segEnd = Math.min(end, lineEnd - 1); // -1: exclude the newline character
    const len = segEnd - offset;
    if (len > 0) {
      builder.push(pos.line, pos.character, len, typeIndex, 0);
    }
    offset = lineEnd;
  }
}

export class SparqlSemanticTokensProvider implements vscode.DocumentSemanticTokensProvider {
  provideDocumentSemanticTokens(document: vscode.TextDocument): vscode.SemanticTokens {
    const builder = new vscode.SemanticTokensBuilder(SPARQL_LEGEND);
    const text = document.getText();
    const ranges = collectRanges(text);

    // Collect all candidate tokens as [offset, length, typeIndex]
    const tokens: [number, number, number][] = [];

    // Emit pre-computed string and IRI ranges as tokens
    for (const r of ranges) {
      if (r.tokenType !== undefined) {
        tokens.push([r.start, r.end - r.start, r.tokenType]);
      }
    }

    const collect = (pattern: RegExp, typeIndex: number) => {
      for (const m of text.matchAll(pattern)) {
        const start = m.index!;
        const end = start + m[0].length;
        if (!overlaps(ranges, start, end)) {
          tokens.push([start, m[0].length, typeIndex]);
        }
      }
    };

    // Functions before keywords: IRI() is a function, not a keyword
    collect(FUNCTION_RE, TI.sparqlFunction);
    collect(KEYWORD_RE, TI.sparqlKeyword);
    // 'a' as rdf:type shorthand — must be surrounded by whitespace/punctuation
    collect(/(?<=\s)a(?=[\s.,;])/g, TI.sparqlKeyword);
    collect(/[?$][a-zA-Z_][a-zA-Z0-9_]*/g, TI.sparqlVariable);
    collect(/_:[a-zA-Z_][a-zA-Z0-9_.-]*/g, TI.sparqlBlankNode);
    // Full prefixed name: prefix:localname
    collect(/[A-Za-z][A-Za-z0-9_.-]*:[A-Za-z0-9_][A-Za-z0-9_.:-]*/g, TI.sparqlPrefixedName);
    // Namespace-only: prefix: before space or IRI (PREFIX declarations)
    collect(/[A-Za-z][A-Za-z0-9_.-]*:(?=[<\s])/g, TI.sparqlPrefixedName);
    // Bare :localname (default prefix)
    collect(/:[A-Za-z0-9_][A-Za-z0-9_.:-]*/g, TI.sparqlPrefixedName);
    collect(/\b\d+(?:\.\d*)?(?:[eE][+-]?\d+)?\b|\b\.\d+(?:[eE][+-]?\d+)?\b/g, TI.sparqlNumber);

    // Sort by offset; for ties prefer the longer match (e.g. LANGMATCHES over LANG)
    tokens.sort((a, b) => a[0] - b[0] || b[1] - a[1]);

    let lastEnd = -1;
    for (const [offset, length, typeIndex] of tokens) {
      if (offset < lastEnd) {
        continue;
      }
      if (typeIndex === TI.sparqlString) {
        // Strings may span multiple lines
        pushRange(builder, document, offset, offset + length, typeIndex);
      } else {
        const pos = document.positionAt(offset);
        builder.push(pos.line, pos.character, length, typeIndex, 0);
      }
      lastEnd = offset + length;
    }

    return builder.build();
  }
}
