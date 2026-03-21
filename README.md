# 🫆 SPARQL Qlue

A Visual Studio Code extension with support for the [SPARQL](https://www.w3.org/TR/sparql12-query/) query language (`.rq`, `.sparql` files), using the **[qlue-ls](https://github.com/IoannisNezis/Qlue-ls)** language server, providing:

- **Language intelligence**: autocomplete, diagnostics, hover info
- **Query quality**: formatting, refactoring, code actions
- **Syntax highlighting**
- **Query execution & results inspection** with the [YASGUI](https://github.com/rdfjs/Yasgui) YASR component
- **Configuration** of the language server

![Screenshot extension](https://raw.github.com/vemonet/sparql-qlue-vsx/refs/heads/main/docs/screenshot.png)

## 🔧 Language Server

Use the [qlue-ls](https://github.com/IoannisNezis/Qlue-ls) language server compiled to WebAssembly, running in-process.

- **Context-aware autocomplete**: suggests subjects, predicates, and objects based on your SPARQL endpoint and the current query context
- **Hover information**: shows labels and descriptions for IRIs by querying the endpoint
- **Diagnostics**: reports syntax errors and warnings as you type
- **Auto-formatting**: formats SPARQL documents
- **Code actions**: quick fixes for common issues

## ▶️ Query Execution

Run the active query with **Ctrl+Enter** / **Cmd+Enter**, the **▶** file header button, or **right-click → Execute SPARQL Query**

Results are displayed in the **SPARQL Results** panel using [YASGUI](https://github.com/rdfjs/Yasgui) YASR component, with plugins for:

- Graph visualization of `CONSTRUCT` query results
- Map visualization of Geo SPARQL results

![Screenshot geo query](https://raw.github.com/vemonet/sparql-qlue-vsx/refs/heads/main/docs/screenshot-geo.png)

> The endpoint URL is automatically resolved from a `#+ endpoint: <url>` comment in the file, or from an `endpoint.txt` file in the same directory or any parent up to the workspace root.

## ⚙️ Configuration

Click the ⚙️ button in the file header, or **right-click → Configure SPARQL Language Server** to open the settings editor.

- Language server behavior settings are persisted to workspace settings (`sparql-qlue.`)
- Backends with custom prefixes and completion queries per endpoint stored in global state.

![Screenshot settings](https://raw.github.com/vemonet/sparql-qlue-vsx/refs/heads/main/docs/screenshot-settings.png)

## 🛠️ Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md)
