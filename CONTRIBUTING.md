# Contributing

[![Open VSX Version](https://img.shields.io/open-vsx/v/vemonet/sparql-qlue)](https://open-vsx.org/extension/vemonet/sparql-qlue) [![VS Marketplace](https://img.shields.io/badge/VisualStudio-Marketplace-blue.svg)](https://marketplace.visualstudio.com/items?itemName=vemonet.sparql-qlue) [![Tests](https://github.com/vemonet/sparql-qlue-vsx/actions/workflows/test.yml/badge.svg)](https://github.com/vemonet/sparql-qlue-vsx/actions/workflows/test.yml)

## 📥 Install

```sh
npm i
```

## 🛠️ Development

Press **`F5`** in VS Code (or use **Run → Start Debugging**) to launch the extension in a new Extension Development Host window.

### Run tests

```sh
npm test
```

### Format

```sh
npm run fmt
```

### Upgrade dependencies

```sh
npm run upgrade
```

## 🏷️ Release

Bump the version in `package.json`: `patch` | `minor` | `major`

```sh
npm version patch
```

> [!NOTE]
>
> This will automatically update the changelog, create a git tag, package, and publish.

> [!IMPORTANT]
>
> Get a VS Code Marketplace PAT from [Azure DevOps](https://dev.azure.com), and an Open VSX token from [open-vsx.org/user-settings/tokens](https://open-vsx.org/user-settings/tokens).

## 📝 Notes

To do:

- [ ] Instead of having all general settings in the settings panel we should just have the backends config, and a link to SPARQL Qlue settings in VSCode.
- [ ] Support `qlue-ls.toml`: If present at root of project, load settings from there. When changes are made in settings tab. Edit the `qlue-ls.toml` if one, or editor settings. Otherwise we could simplify the system by not including settings there, and just putting backends config.
- [ ] When we store the class schema should we store it as a formatted string? So we can also easily support extracting and using SHACL/ShEx shapes without having to parse them. Migrate to SHACL shapes generated with with shapetrospection
- [ ] Make the fetch request sent for executing the SPARQL query configurable at the endpoint level: GET/POST, headers, basic auth. It can all be configured in a new section inside the backend expand
- [ ] Enable to have backend profiles with a set of pre-optimized completion queries for a given triplestore/ontology.
- [ ] In qlue-ls
  - [ ] `uvx qlue-ls format` should support reading `qlue-ls.toml` file auto when present, or to pass custom config with optional `--config`
  - [ ] `uvx qlue-ls format **/*.rq` should work
  - [ ] Make it so format put all comments `#+` at the start of the query

Run tests:

- Install the [Extension Test Runner](https://marketplace.visualstudio.com/items?itemName=ms-vscode.extension-test-runner)
- Run the "watch" task via the **Tasks: Run Task** command. Make sure this is running, or tests might not be discovered.
- Open the Testing view from the activity bar and click the Run Test" button, or use the hotkey `Ctrl/Cmd + ; A`
- See the output of the test result in the Test Results view.
- Make changes to `src/test/extension.test.ts` or create new test files inside the `test` folder.
  - The provided test runner will only consider files matching the name pattern `**.test.ts`.
  - You can create folders inside the `test` folder to structure your tests any way you want.

Go further:

- [Browse VSCode Icons](https://code.visualstudio.com/api/references/icons-in-labels)
- [VSCode marketplace publisher manage page](https://marketplace.visualstudio.com/manage/)

- Reduce the extension size and improve the startup time by [bundling your extension](https://code.visualstudio.com/api/working-with-extensions/bundling-extension).
- Automate builds by setting up [Continuous Integration](https://code.visualstudio.com/api/working-with-extensions/continuous-integration).
