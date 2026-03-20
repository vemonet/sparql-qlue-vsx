# 🫆 SPARQL Qlue

[![Tests](https://github.com/vemonet/sparql-qlue-vsx/actions/workflows/test.yml/badge.svg)](https://github.com/vemonet/sparql-qlue-vsx/actions/workflows/test.yml)

A VisualStudio Code extension for working with [SPARQL](https://www.w3.org/TR/sparql12-query/) query files (`.rq`, `.sparql`) providing:

- Syntax highlighting,
- Diagnostics, completions, formatting using the [qlue-ls](https://github.com/IoannisNezis/Qlue-ls) language server running via WebAssembly,
- Execute SPARQL query and inspect results with [YASGUI](https://github.com/rdfjs/Yasgui) YASR package.

![Screenshot extension](https://raw.github.com/vemonet/sparql-qlue-vsx/refs/heads/main/docs/screenshot.png)

## Language Server

Use the qlue-ls language server compiled to wasm, running in-process.

- **Context-aware autocomplete**: suggests subjects, predicates, and objects based on your SPARQL endpoint and the current query context
- **Hover information**: shows labels and descriptions for IRIs by querying the endpoint
- **Diagnostics**: reports syntax errors and warnings as you type
- **Auto-formatting**: formats SPARQL documents
- **Code actions**: quick fixes for common issues

## Query Execution

Run the active query with **Ctrl+Enter** / **Cmd+Enter**, the **▶** file header button, or **right-click → Execute SPARQL Query**

Results are displayed in the **SPARQL Results** panel powered by [YASGUI](https://github.com/rdfjs/Yasgui) YASR component

The endpoint URL is resolved from a `#+ endpoint: <url>` comment in the file, or from an `endpoint.txt` file in the same directory or any parent up to the workspace root.

## Language Server Settings

Click the gear ⚙️ button in the file header, or **right-click → Configure SPARQL Language Server** to open the settings editor.

Settings are persisted to workspace configuration (`sparql-qlue.serverSettings`) and enable to:

- Configure the language server behavior,
- Configure backends with custom prefixes and completion queries per endpoint.

![Screenshot extension](https://raw.github.com/vemonet/sparql-qlue-vsx/refs/heads/main/docs/screenshot-settings.png)

## Extension Settings

| Setting                    | Default | Description                                                           |
| -------------------------- | ------- | --------------------------------------------------------------------- |
| `sparql-qlue.formatOnSave` | `false` | Automatically format SPARQL documents via the language server on save |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md)
