# 🫆 SPARQL Qlue

A Visual Studio Code extension that provides support for the [SPARQL](https://www.w3.org/TR/sparql12-query/) query language (`.rq`, `.sparql` files), using the **[Qlue-ls](https://github.com/IoannisNezis/Qlue-ls)** language server:

- **Language intelligence**: relevant autocomplete, diagnostics, hover info
- **Query quality**: formatting, refactoring, code actions
- **Syntax highlighting** with semantic tokens to adapt to themes
- **Query execution & results inspection** with the [YASGUI](https://github.com/rdfjs/Yasgui) YASR component, against remote endpoints, or a local embedded [oxigraph](https://github.com/oxigraph/oxigraph) triplestore
- **Configuration** of the language server (queries used for completion, formatting behavior, etc)

## Installation

Install this extension from the [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=vemonet.sparql-qlue) or [open-vsx](https://open-vsx.org/extension/vemonet/sparql-qlue).

## Usage

Once installed in Visual Studio Code, SPARQL Qlue will automatically run when you open or edit a `.rq` or `.sparql` file.

Completion and hover requires a target endpoint URL (a `Backend` for Qlue-ls). It can be provided through different ways:

- Define it using a `#+ endpoint:` comment at the start of the query (recommended)
- `endpoint.txt` file in folder or parent folders of the query (grlc.io compatible)
- Change the endpoint URL in the input box of the query panel.

> The extension automatically disables the SPARQL language server from the [`semantic-web-lsp`](https://marketplace.visualstudio.com/items?itemName=ajuvercr.semantic-web-lsp) extension with settings `"swls.sparql": false` to avoid running two SPARQL language servers. We recommend to install it for RDF files support.

## Features

### Qlue-ls Language Server

This extension uses the [Qlue-ls](https://github.com/IoannisNezis/Qlue-ls) language server compiled to WebAssembly, running in-process.

- **Context-aware autocomplete**: suggests subjects, predicates, and objects based on the SPARQL endpoint content and the current query context, by running a SPARQL query to explore available options
- **Hover information**: shows labels and descriptions for IRIs by querying the endpoint
- **Diagnostics**: reports syntax errors and warnings as you type
- **Auto-formatting**: formats SPARQL documents, configurable
- **Code actions**: quick fixes for common issues, e.g. contract triples with the same subject

![Screenshot extension](https://raw.github.com/vemonet/sparql-qlue-vsx/refs/heads/main/docs/screenshot.png)

### Query Execution

Run the opened query file with **Ctrl+Enter** / **Cmd+Enter**, the **▶** file header button, or **right-click → Execute SPARQL Query**

The endpoint URL is automatically resolved from a `#+ endpoint: <url>` comment in the file, or from an `endpoint.txt` file in the same directory or any parent up to the workspace root. It can also be changed in a text input in the UI.

You can add RDF files (e.g. `.ttl`, `.trig`, `.jsonld`, etc) to a local embedded [oxigraph](https://github.com/oxigraph/oxigraph) SPARQL endpoint by right clicking RDF files in the explorer. Then execute the queries against this embedded endpoint using the `local://sparql-endpoint` URL.

Results are displayed in the **SPARQL Results** panel using the [YASGUI](https://github.com/rdfjs/Yasgui) YASR component, with plugins for:

- [Graph visualization](https://github.com/Matdata-eu/yasgui-graph-plugin) of `CONSTRUCT` query results
- [Map visualization](https://github.com/Thib-G/yasgui-geo-tg) of GeoSPARQL results

![Screenshot geo query](https://raw.github.com/vemonet/sparql-qlue-vsx/refs/heads/main/docs/screenshot-geo.png)

### Configuration

- General Language server behavior for formatting, completion and prefixes are configured in VSCode settings (`sparql-qlue.`)

- Endpoints backends are initialized with defaults and metadata retrieved from endpoint, they can be further configured in the settings panel.

  Click the **SPARQL Qlue** item in the bottom status bar, or use the dropdown button in the file header, or right-click → **Configure SPARQL Language Server** to open the settings editor.

![Screenshot settings](https://raw.github.com/vemonet/sparql-qlue-vsx/refs/heads/main/docs/screenshot-settings.png)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md)
