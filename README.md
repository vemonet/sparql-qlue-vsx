# 🫆 SPARQL Qlue

A VisualStudio Code extension for working with SPARQL query files (`.rq`, `.sparql`)

- Syntax highlighting
- Diagnostics, autocomplete, formatting using the [qlue-ls](https://github.com/IoannisNezis/Qlue-ls) language server running via WebAssembly
- Execute SPARQL query and inspect results

![Screenshot extension](screenshot.png)

## Language Server (qlue-ls)

- **Context-aware autocomplete**: suggests subjects, predicates, and objects based on your SPARQL endpoint and the current query context
- **Hover information**: shows labels and descriptions for IRIs by querying the endpoint
- **Diagnostics**: reports syntax errors and warnings as you type
- **Auto-formatting**: formats SPARQL documents on demand or automatically on save with `sparql-qlue.formatOnSave` setting
- **Code actions**: quick fixes for common issues

## Query Execution

- Run the active query with **Ctrl+Enter** / **Cmd+Enter**, the **▶** toolbar button, or **right-click → Execute SPARQL Query**
- Results displayed in the **SPARQL Results** panel powered by [YASGUI](https://github.com/rdfjs/Yasgui)
- Endpoint resolved from a `#+ endpoint: <url>` comment in the file, or from an `endpoint.txt` file in the same directory or any parent up to the workspace root

## Extension Settings

| Setting | Default | Description |
| --- | --- | --- |
| `sparql-qlue.formatOnSave` | `false` | Automatically format SPARQL documents via the language server on save |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md)
