import * as vscode from 'vscode';

// ── Extension state ──────────────────────────────────────────────────────────

/**
 * Typed accessor for all persisted extension state.
 * Centralises key strings, types, and defaults so call-sites stay clean.
 */
export class ExtensionState {
  constructor(private readonly ctx: vscode.ExtensionContext) {}

  // ── Global state ────────────────────────────────────────────────────────────

  getBackends(): Record<string, BackendConfig> {
    return this.ctx.globalState.get<Record<string, BackendConfig>>('sparql-qlue.endpointBackends') ?? {};
  }

  async setBackends(backends: Record<string, BackendConfig>): Promise<void> {
    await this.ctx.globalState.update('sparql-qlue.endpointBackends', backends);
  }

  getSettings(): Record<string, unknown> {
    return this.ctx.globalState.get<Record<string, unknown>>('sparql-qlue.serverSettings') ?? {};
  }

  async setSettings(settings: Record<string, unknown>): Promise<void> {
    await this.ctx.globalState.update('sparql-qlue.serverSettings', settings);
  }

  getSavedEndpoints(): string[] {
    return this.ctx.globalState.get<string[]>('sparql-qlue.savedEndpoints') ?? [];
  }

  async setSavedEndpoints(endpoints: string[]): Promise<void> {
    await this.ctx.globalState.update('sparql-qlue.savedEndpoints', endpoints);
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

export interface BackendConfig {
  prefixMap: Record<string, string>;
  queries: Record<string, string>;
}

export function defaultBackendConfig(): BackendConfig {
  return {
    prefixMap: { ...DEFAULT_PREFIX_MAP },
    queries: { ...DEFAULT_COMPLETION_QUERIES },
  };
}

export const DEFAULT_PREFIX_MAP: Record<string, string> = {
  annotation: 'http://purl.uniprot.org/annotation/',
  bibo: 'http://purl.org/ontology/bibo/',
  busco: 'http://busco.ezlab.org/schema#',
  chebi: 'http://purl.obolibrary.org/obo/CHEBI_',
  citation: 'http://purl.uniprot.org/citations/',
  cito: 'http://purl.org/spar/cito/',
  dcat: 'http://www.w3.org/ns/dcat#',
  dcmit: 'http://purl.org/dc/dcmitype/',
  dcterms: 'http://purl.org/dc/terms/',
  disease: 'http://purl.uniprot.org/diseases/',
  ECO: 'http://purl.obolibrary.org/obo/ECO_',
  'embl-cds': 'http://purl.uniprot.org/embl-cds/',
  ensembl: 'http://rdf.ebi.ac.uk/resource/ensembl/',
  enzyme: 'http://purl.uniprot.org/enzyme/',
  faldo: 'http://biohackathon.org/resource/faldo#',
  foaf: 'http://xmlns.com/foaf/0.1/',
  go: 'http://purl.obolibrary.org/obo/GO_',
  hs: 'https://hamap.expasy.org/rdf/vocab#',
  isoform: 'http://purl.uniprot.org/isoforms/',
  keywords: 'http://purl.uniprot.org/keywords/',
  location: 'http://purl.uniprot.org/locations/',
  obo: 'http://purl.obolibrary.org/obo/',
  oboInOwl: 'http://www.geneontology.org/formats/oboInOwl#',
  owl: 'http://www.w3.org/2002/07/owl#',
  patent: 'http://purl.uniprot.org/EPO/',
  pav: 'http://purl.org/pav/',
  position: 'http://purl.uniprot.org/position/',
  prism: 'http://prismstandard.org/namespaces/basic/2.0/',
  pubmed: 'http://purl.uniprot.org/pubmed/',
  range: 'http://purl.uniprot.org/range/',
  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
  rh: 'http://rdf.rhea-db.org/',
  schema: 'http://schema.org/',
  sd: 'http://www.w3.org/ns/sparql-service-description#',
  sh: 'http://www.w3.org/ns/shacl#',
  skos: 'http://www.w3.org/2004/02/skos/core#',
  sp: 'http://spinrdf.org/sp#',
  stato: 'http://purl.obolibrary.org/obo/STATO_',
  taxon: 'http://purl.uniprot.org/taxonomy/',
  tissue: 'http://purl.uniprot.org/tissues/',
  uniparc: 'http://purl.uniprot.org/uniparc/',
  uniprot: 'http://purl.uniprot.org/uniprot/',
  up: 'http://purl.uniprot.org/core/',
  voag: 'http://voag.linkedmodel.org/schema/voag#',
  void: 'http://rdfs.org/ns/void#',
  xsd: 'http://www.w3.org/2001/XMLSchema#',
  genex: 'http://purl.org/genex#',
};

export const DEFAULT_COMPLETION_QUERIES: Record<string, string> = {
  subjectCompletion: `{% include "prefix_declarations" %}
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX up: <http://purl.uniprot.org/core/>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
SELECT ?qlue_ls_entity (SAMPLE(?label) as ?qlue_ls_label) WHERE {
  ?qlue_ls_entity rdf:type ?type ; rdfs:label ?label .
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
{% if subject is not variable %}
SELECT ?qlue_ls_entity (SAMPLE(?qlue_ls_label_or_null) AS ?qlue_ls_label) ?qlue_ls_count WHERE {
  {
    SELECT ?qlue_ls_entity (COUNT(?qlue_ls_entity) AS ?qlue_ls_count) WHERE {
      {{ local_context }}
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
{% else %}
SELECT ?qlue_ls_entity (SAMPLE(?qlue_ls_label_or_null) AS ?qlue_ls_label) ?qlue_ls_count WHERE {
  {% if not context %}
  {
    SELECT ?qlue_ls_entity (COUNT(?qlue_ls_entity) AS ?qlue_ls_count) WHERE {
      {{ local_context }}
    }
    GROUP BY ?qlue_ls_entity
  }
  {% else %}
  {
    SELECT ?qlue_ls_entity (COUNT(DISTINCT {{ subject }}) AS ?qlue_ls_count) WHERE {
      {{ context }} {{ local_context }}
    }
    GROUP BY ?qlue_ls_entity
  }
  {% endif %}
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
{% endif %}
LIMIT {{ limit }} OFFSET {{ offset }}`,

  objectCompletionContextInsensitive: `{% include "prefix_declarations" %}
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX up: <http://purl.uniprot.org/core/>
SELECT ?qlue_ls_entity (MIN(?name) AS ?qlue_ls_label) (MIN(?alias) AS ?qlue_ls_alias) (MAX(?count) AS ?qlue_ls_count) WHERE {
  {
    { SELECT ?qlue_ls_entity ?name ?alias ?count WHERE {
      { SELECT ?qlue_ls_entity (COUNT(?qlue_ls_entity) AS ?count) WHERE {
        {{local_context}}
      } GROUP BY ?qlue_ls_entity }
      ?qlue_ls_entity rdfs:label ?name BIND(?name AS ?alias)
      {% if search_term_uncompressed %}
      FILTER (REGEX(STR(?qlue_ls_entity), "^{{ search_term_uncompressed }}"))
      {% elif search_term %}
      FILTER REGEX(STR(?alias), "^{{ search_term }}")
      {% endif %}
    } }
  } UNION {
    { SELECT ?qlue_ls_entity ?name ?alias ?count WHERE {
      { SELECT ?qlue_ls_entity (COUNT(?qlue_ls_entity) AS ?count) WHERE {
        {{local_context}}
      } GROUP BY ?qlue_ls_entity }
      ?qlue_ls_entity up:scientificName ?name BIND(?name AS ?alias)
      {% if search_term_uncompressed %}
      FILTER (REGEX(STR(?qlue_ls_entity), "^{{ search_term_uncompressed }}"))
      {% elif search_term %}
      FILTER REGEX(STR(?alias), "^{{ search_term }}")
      {% endif %}
    } }
  } UNION {
    { SELECT ?qlue_ls_entity ?name ?alias ?count WHERE {
      { SELECT ?qlue_ls_entity (COUNT(?qlue_ls_entity) AS ?count) WHERE {
        {{local_context}}
      } GROUP BY ?qlue_ls_entity }
      BIND(?qlue_ls_entity AS ?name) BIND(?qlue_ls_entity AS ?alias)
      {% if search_term_uncompressed %}
      FILTER (REGEX(STR(?qlue_ls_entity), "^{{ search_term_uncompressed }}"))
      {% elif search_term %}
      FILTER REGEX(STR(?alias), "^{{ search_term }}")
      {% endif %}
    } }
  }
} GROUP BY ?qlue_ls_entity ORDER BY DESC(?qlue_ls_count)
LIMIT {{ limit }} OFFSET {{ offset }}`,

  objectCompletionContextSensitive: `{% include "prefix_declarations" %}
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT ?qlue_ls_entity ?qlue_ls_label ?qlue_ls_count WHERE {
  {
    SELECT ?qlue_ls_entity (COUNT(?qlue_ls_entity) AS ?qlue_ls_count) WHERE {
      {{ context }} {{ local_context }} .
    }
    GROUP BY ?qlue_ls_entity
  }
  OPTIONAL {
    ?qlue_ls_entity rdf:type [ rdfs:label ?qlue_ls_label_or_null ] .
  }
  OPTIONAL { ?qlue_ls_entity rdfs:label ?qlue_ls_label_or_null }
  BIND (COALESCE(?qlue_ls_label_or_null, ?qlue_ls_entity) AS ?qlue_ls_label)
  {% if search_term_uncompressed %}
  FILTER (REGEX(STR(?qlue_ls_entity), "^{{ search_term_uncompressed }}"))
  {% elif search_term %}
  FILTER REGEX(STR(?qlue_ls_label), "^{{ search_term }}")
  {% endif %}
}
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
