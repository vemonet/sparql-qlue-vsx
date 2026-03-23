import * as vscode from 'vscode';

// ── Extension state ──────────────────────────────────────────────────────────

/**
 * Typed accessor for all persisted extension state.
 * Centralises key strings, types, and defaults so call-sites stay clean.
 */
export class ExtensionState {
  constructor(private readonly ctx: vscode.ExtensionContext) {}

  // ── VSCode Settings ────────────────────────────────────────────────────────

  getSettings(): Record<string, unknown> {
    const config = vscode.workspace.getConfiguration('sparql-qlue');
    return {
      format: {
        alignPredicates: config.get<boolean>('format.alignPredicates', false),
        alignPrefixes: config.get<boolean>('format.alignPrefixes', false),
        separatePrologue: config.get<boolean>('format.separatePrologue', true),
        capitalizeKeywords: config.get<boolean>('format.capitalizeKeywords', true),
        insertSpaces: config.get<boolean>('format.insertSpaces', true),
        tabSize: config.get<number>('format.tabSize', 2),
        whereNewLine: config.get<boolean>('format.whereNewLine', false),
        filterSameLine: config.get<boolean>('format.filterSameLine', true),
        lineLength: config.get<number>('format.lineLength', 120),
        contractTriples: config.get<boolean>('format.contractTriples', true),
        keepEmptyLines: config.get<boolean>('format.keepEmptyLines', false),
      },
      completion: {
        timeoutMs: config.get<number>('completion.timeoutMs', 10000),
        resultSizeLimit: config.get<number>('completion.resultSizeLimit', 50),
        subjectCompletionTriggerLength: config.get<number>('completion.subjectCompletionTriggerLength', 3),
        objectCompletionSuffix: config.get<boolean>('completion.objectCompletionSuffix', true),
        variableCompletionLimit: config.get<number>('completion.variableCompletionLimit', 10),
        sameSubjectSemicolon: config.get<boolean>('completion.sameSubjectSemicolon', true),
      },
      prefixes: {
        addMissing: config.get<boolean>('prefixes.addMissing', true),
        removeUnused: config.get<boolean>('prefixes.removeUnused', false),
      },
    };
  }

  async setSettings(settings: Record<string, unknown>): Promise<void> {
    const config = vscode.workspace.getConfiguration('sparql-qlue');
    const updates: Promise<void>[] = [];
    for (const [section, values] of Object.entries(settings)) {
      if (values && typeof values === 'object') {
        for (const [key, value] of Object.entries(values as Record<string, unknown>)) {
          updates.push(Promise.resolve(config.update(`${section}.${key}`, value, vscode.ConfigurationTarget.Global)));
        }
      }
    }
    await Promise.all(updates);
  }

  // ── Global state ────────────────────────────────────────────────────────────

  getBackends(): Record<string, BackendConfig> {
    return this.ctx.globalState.get<Record<string, BackendConfig>>('sparql-qlue.endpointBackends') ?? {};
  }

  async setBackends(backends: Record<string, BackendConfig>): Promise<void> {
    await this.ctx.globalState.update('sparql-qlue.endpointBackends', backends);
  }

  getSavedEndpoints(): string[] {
    return this.ctx.globalState.get<string[]>('sparql-qlue.savedEndpoints') ?? [];
  }

  async setSavedEndpoints(endpoints: string[]): Promise<void> {
    await this.ctx.globalState.update('sparql-qlue.savedEndpoints', endpoints);
  }

  async resetAll(): Promise<void> {
    await this.ctx.globalState.update('sparql-qlue.endpointBackends', undefined);
    await this.ctx.globalState.update('sparql-qlue.savedEndpoints', undefined);
    await this.ctx.workspaceState.update('sparql-qlue.fileEndpoints', undefined);
    const config = vscode.workspace.getConfiguration('sparql-qlue');
    const keys = [
      'format.alignPredicates',
      'format.alignPrefixes',
      'format.separatePrologue',
      'format.capitalizeKeywords',
      'format.insertSpaces',
      'format.tabSize',
      'format.whereNewLine',
      'format.filterSameLine',
      'format.lineLength',
      'format.contractTriples',
      'format.keepEmptyLines',
      'completion.timeoutMs',
      'completion.resultSizeLimit',
      'completion.subjectCompletionTriggerLength',
      'completion.objectCompletionSuffix',
      'completion.variableCompletionLimit',
      'completion.sameSubjectSemicolon',
      'prefixes.addMissing',
      'prefixes.removeUnused',
    ];
    await Promise.all(keys.map((k) => config.update(k, undefined, vscode.ConfigurationTarget.Global)));
  }

  // ── Workspace state ──────────────────────────────────────────────────────────

  getFileEndpoints(): Record<string, string> {
    return this.ctx.workspaceState.get<Record<string, string>>('sparql-qlue.fileEndpoints') ?? {};
  }

  async setFileEndpoints(overrides: Record<string, string>): Promise<void> {
    await this.ctx.workspaceState.update('sparql-qlue.fileEndpoints', overrides);
  }
}

// ── Backend configuration ────────────────────────────────────────────────────

export interface SparqlExample {
  uri: string;
  comment: string;
  query: string;
}

export interface BackendConfig {
  prefixMap: Record<string, string>;
  queries: Record<string, string>;
  examples?: SparqlExample[];
}

export function defaultBackendConfig(): BackendConfig {
  return {
    prefixMap: { ...DEFAULT_PREFIX_MAP },
    queries: { ...DEFAULT_COMPLETION_QUERIES },
  };
}

export const DEFAULT_PREFIX_MAP: Record<string, string> = {
  activitystreams: 'https://www.w3.org/ns/activitystreams#',
  bd: 'http://www.bigdata.com/rdf#',
  bibo: 'http://purl.org/ontology/bibo/',
  busco: 'http://busco.ezlab.org/schema#',
  chebi: 'http://purl.obolibrary.org/obo/CHEBI_',
  cito: 'http://purl.org/spar/cito/',
  csvw: 'http://purl.org/csvw/vocab#',
  dblp: 'https://dblp.org/rdf/schema#',
  dc: 'http://purl.org/dc/elements/1.1/',
  dcat: 'http://www.w3.org/ns/dcat#',
  dcmit: 'http://purl.org/dc/dcmitype/',
  dcterms: 'http://purl.org/dc/terms/',
  ECO: 'http://purl.obolibrary.org/obo/ECO_',
  ensembl: 'http://rdf.ebi.ac.uk/resource/ensembl/',
  hydra: 'http://www.w3.org/ns/hydra/core#',
  faldo: 'http://biohackathon.org/resource/faldo#',
  foaf: 'http://xmlns.com/foaf/0.1/',
  genex: 'http://purl.org/genex#',
  geo: 'http://www.opengis.net/ont/geosparql#',
  geof: 'http://www.opengis.net/def/function/geosparql/',
  go: 'http://purl.obolibrary.org/obo/GO_',
  mondo: 'http://purl.obolibrary.org/obo/MONDO_',
  np: 'http://www.nanopub.org/nschema#',
  npx: 'http://purl.org/nanopub/x/',
  obo: 'http://purl.obolibrary.org/obo/',
  oboInOwl: 'http://www.geneontology.org/formats/oboInOwl#',
  owl: 'http://www.w3.org/2002/07/owl#',
  pav: 'http://purl.org/pav/',
  prov: 'http://www.w3.org/ns/prov#',
  pubmed: 'http://purl.uniprot.org/pubmed/',
  qudt: 'http://qudt.org/schema/qudt/',
  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
  rh: 'http://rdf.rhea-db.org/',
  schema: 'http://schema.org/',
  sd: 'http://www.w3.org/ns/sparql-service-description#',
  sh: 'http://www.w3.org/ns/shacl#',
  shex: 'http://www.w3.org/ns/shex#',
  sio: 'http://semanticscience.org/resource/',
  sioc: 'http://rdfs.org/sioc/ns#',
  skos: 'http://www.w3.org/2004/02/skos/core#',
  sp: 'http://spinrdf.org/sp#',
  stato: 'http://purl.obolibrary.org/obo/STATO_',
  taxon: 'http://purl.uniprot.org/taxonomy/',
  time: 'http://www.w3.org/2006/time#',
  uniparc: 'http://purl.uniprot.org/uniparc/',
  uniprot: 'http://purl.uniprot.org/uniprot/',
  up: 'http://purl.uniprot.org/core/',
  vcard: 'http://www.w3.org/2006/vcard/ns#',
  voag: 'http://voag.linkedmodel.org/schema/voag#',
  void: 'http://rdfs.org/ns/void#',
  wd: 'http://www.wikidata.org/entity/',
  wdt: 'http://www.wikidata.org/prop/direct/',
  wikibase: 'http://wikiba.se/ontology#',
  xsd: 'http://www.w3.org/2001/XMLSchema#',
};

export const DEFAULT_ENDPOINTS: string[] = [
  'https://sparql.uniprot.org/sparql',
  'https://sparql.dblp.org/sparql',
  'https://query.wikidata.org/sparql',
  'https://commons-query.wikimedia.org/sparql',
  'https://qlever.dev/api/wikidata',
  'https://qlever.dev/api/wikimedia-commons',
  'https://qlever.dev/api/osm-planet',
  'https://qlever.dev/api/freebase',
  'https://qlever.dev/api/imdb',
  'https://www.bgee.org/sparql/',
  'https://sparql.omabrowser.org/sparql/',
  'https://beta.sparql.swisslipids.org/',
  'https://sparql.rhea-db.org/sparql/',
  'https://sparql.cellosaurus.org/sparql',
  'https://sparql.sibils.org/sparql',
  'https://kg.earthmetabolome.org/metrin/api/',
  'https://hamap.expasy.org/sparql/',
  'https://rdf.metanetx.org/sparql/',
  'https://sparql.orthodb.org/sparql',
  'https://sparql.wikipathways.org/sparql/',
  'https://id.nlm.nih.gov/mesh/sparql',
  'https://agrovoc.fao.org/sparql',
  'https://data.europa.eu/sparql',
];

export const DEFAULT_COMPLETION_QUERIES: Record<string, string> = {
  subjectCompletion: `{% include "prefix_declarations" %}
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT ?qlue_ls_entity (SAMPLE(?label) as ?qlue_ls_label) WHERE {
  ?qlue_ls_entity a ?type ; rdfs:label ?label .
  {% if search_term_uncompressed %}
  FILTER (REGEX(STR(?qlue_ls_entity), "^{{ search_term_uncompressed }}"))
  {% elif search_term %}
  FILTER REGEX(?label, "^{{ search_term }}")
  {% endif %}
}
GROUP BY ?qlue_ls_entity
ORDER BY DESC(COUNT(?qlue_ls_entity))
LIMIT {{ limit }} OFFSET {{ offset }}`,

  predicateCompletionContextInsensitive: `{% include "prefix_declarations" %}
SELECT ?qlue_ls_entity ?qlue_ls_score WHERE {
  { SELECT ?qlue_ls_entity (COUNT(?qlue_ls_entity) AS ?qlue_ls_score) WHERE
    {
      {{local_context}}
    }
    GROUP BY ?qlue_ls_entity }
  {% if search_term_uncompressed %}
  FILTER (REGEX(STR(?qlue_ls_entity), "^{{ search_term_uncompressed }}"))
  {% elif search_term %}
  FILTER REGEX(STR(?qlue_ls_entity), "{{ search_term }}", "i")
  {% endif %}
} ORDER BY DESC(?qlue_ls_score)
LIMIT {{ limit }} OFFSET {{ offset }}`,

  predicateCompletionContextSensitive: `{% include "prefix_declarations" %}
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT ?qlue_ls_entity (SAMPLE(?qlue_ls_label_or_null) AS ?qlue_ls_label) ?qlue_ls_count WHERE {
  {
    SELECT ?qlue_ls_entity (
      {% if subject is variable and context %}
      COUNT(DISTINCT {{ subject }})
      {% else %}
      COUNT(?qlue_ls_entity)
      {% endif %}
      AS ?qlue_ls_count) WHERE {
      {% if subject is variable and context %}
      {{ context }} {{ local_context }}
      {% else %}
      {{ local_context }}
      {% endif %}
    }
    GROUP BY ?qlue_ls_entity
  }
  OPTIONAL { ?qlue_ls_entity rdfs:label ?qlue_ls_label_or_null }
  BIND (COALESCE(?qlue_ls_label_or_null, ?qlue_ls_entity) AS ?label)
  {% if search_term_uncompressed %}
  FILTER (REGEX(STR(?qlue_ls_entity), "^{{ search_term_uncompressed }}"))
  {% elif search_term %}
  FILTER REGEX(STR(?label), "{{ search_term }}", "i")
  {% endif %}
}
GROUP BY ?qlue_ls_entity ?qlue_ls_count
ORDER BY DESC(?qlue_ls_count)
LIMIT {{ limit }} OFFSET {{ offset }}`,

  objectCompletionContextInsensitive: `{% include "prefix_declarations" %}
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT ?qlue_ls_entity (SAMPLE(?name) AS ?qlue_ls_label) ?qlue_ls_count WHERE {
  {
    SELECT ?qlue_ls_entity (COUNT(?qlue_ls_entity) AS ?qlue_ls_count) WHERE {
      {{ local_context }}
    }
    GROUP BY ?qlue_ls_entity
  }
  OPTIONAL { ?qlue_ls_entity rdfs:label ?label }
  BIND(COALESCE(?label, STR(?qlue_ls_entity)) AS ?name)
  {% if search_term_uncompressed %}
  FILTER (REGEX(STR(?qlue_ls_entity), "^{{ search_term_uncompressed }}"))
  {% elif search_term %}
  FILTER REGEX(?name, "^{{ search_term }}")
  {% endif %}
}
GROUP BY ?qlue_ls_entity ?qlue_ls_count
ORDER BY DESC(?qlue_ls_count)
LIMIT {{ limit }} OFFSET {{ offset }}`,

  objectCompletionContextSensitive: `{% include "prefix_declarations" %}
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT ?qlue_ls_entity (SAMPLE(?name) AS ?qlue_ls_label) ?qlue_ls_count WHERE {
  {
    SELECT ?qlue_ls_entity (COUNT(?qlue_ls_entity) AS ?qlue_ls_count) WHERE {
      {{ context }} {{ local_context }} .
    }
    GROUP BY ?qlue_ls_entity
  }
  OPTIONAL { ?qlue_ls_entity rdfs:label ?label }
  BIND(COALESCE(?label, STR(?qlue_ls_entity)) AS ?name)
  {% if search_term_uncompressed %}
  FILTER (REGEX(STR(?qlue_ls_entity), "^{{ search_term_uncompressed }}"))
  {% elif search_term %}
  FILTER REGEX(?name, "^{{ search_term }}")
  {% endif %}
}
GROUP BY ?qlue_ls_entity ?qlue_ls_count
ORDER BY DESC(?qlue_ls_count)
LIMIT {{ limit }} OFFSET {{ offset }}`,

  hover: `{% include "prefix_declarations" %}
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT ?qlue_ls_label WHERE {
  OPTIONAL { {{ entity }} rdfs:label ?label }
  OPTIONAL { {{ entity }} rdfs:comment ?comment }
  BIND (
    IF(BOUND(?label) && BOUND(?comment),
      CONCAT(STR(?label), ": ", STR(?comment)),
      COALESCE(STR(?label), STR(?comment), STR({{ entity }}))
    ) AS ?qlue_ls_label
  )
}
LIMIT 1`,
};
