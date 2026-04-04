# 🫆 SPARQL Qlue

A Visual Studio Code extension that provides support for the [SPARQL](https://www.w3.org/TR/sparql12-query/) query language (`.rq`, `.sparql` files), using the **[qlue-ls](https://github.com/IoannisNezis/Qlue-ls)** language server:

- **Language intelligence**: autocomplete, diagnostics, hover info
- **Query quality**: formatting, refactoring, code actions
- **Syntax highlighting** using semantic tokens to adapt to themes
- **Query execution & results inspection** with the [YASGUI](https://github.com/rdfjs/Yasgui) YASR component, against remote endpoints, or a local embedded [oxigraph](https://github.com/oxigraph/oxigraph) triplestore
- **Configuration** of the language server

## Installation

Install this extension from the [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=vemonet.sparql-qlue) or [open-vsx](https://open-vsx.org/extension/vemonet/sparql-qlue).

## Usage

Once installed in Visual Studio Code, SPARQL Qlue will automatically execute when you open or edit a `.rq` or `.sparql` file.

Completion and hover requires a target endpoint URL (a `Backend` for Qlue-ls). It can be provided through different ways:

- Define it using a `#+ endpoint:` comment at the start of the query (recommended)
- `endpoint.txt` file in folder or parent folders of the query (grlc.io compatible)
- Change the endpoint URL in the input box of the query panel.

> The extension automatically disables the SPARQL language server from the [`semantic-web-lsp`](https://marketplace.visualstudio.com/items?itemName=ajuvercr.semantic-web-lsp) extension with settings `"swls.sparql": false` to avoid running two SPARQL language servers. We recommend to install it for RDF files support.

## Features

### Qlue-ls Language Server

This extension uses the [qlue-ls](https://github.com/IoannisNezis/Qlue-ls) language server compiled to WebAssembly, running in-process.

- **Context-aware autocomplete**: suggests subjects, predicates, and objects based on your SPARQL endpoint and the current query context
- **Hover information**: shows labels and descriptions for IRIs by querying the endpoint
- **Diagnostics**: reports syntax errors and warnings as you type
- **Auto-formatting**: formats SPARQL documents
- **Code actions**: quick fixes for common issues

![Screenshot extension](https://raw.github.com/vemonet/sparql-qlue-vsx/refs/heads/main/docs/screenshot.png)

### Query Execution

Run the active query with **Ctrl+Enter** / **Cmd+Enter**, the **▶** file header button, or **right-click → Execute SPARQL Query**

The endpoint URL is automatically resolved from a `#+ endpoint: <url>` comment in the file, or from an `endpoint.txt` file in the same directory or any parent up to the workspace root. It can also be changed in a text input in the UI

You can add RDF files (e.g. `.ttl`, `.trig`, `.jsonld`, etc) to a local embedded [oxigraph](https://github.com/oxigraph/oxigraph) SPARQL endpoint by right clicking RDF files in the explorer. Then execute the queries against this embedded endpoint using the `local://sparql-endpoint` URL

Results are displayed in the **SPARQL Results** panel using [YASGUI](https://github.com/rdfjs/Yasgui) YASR component, with plugins for:

- Graph visualization of `CONSTRUCT` query results
- Map visualization of Geo SPARQL results

![Screenshot geo query](https://raw.github.com/vemonet/sparql-qlue-vsx/refs/heads/main/docs/screenshot-geo.png)

### Configuration

Click the ⚙️ button in the file header, or **right-click → Configure SPARQL Language Server** to open the settings editor.

- Language server behavior settings are persisted to workspace settings (`sparql-qlue.`)
- Backends with custom prefixes and completion queries per endpoint stored in global state.

![Screenshot settings](https://raw.github.com/vemonet/sparql-qlue-vsx/refs/heads/main/docs/screenshot-settings.png)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md)
