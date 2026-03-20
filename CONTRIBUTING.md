# Contributing

[![Tests](https://github.com/vemonet/sparql-qlue-vsx/actions/workflows/test.yml/badge.svg)](https://github.com/vemonet/sparql-qlue-vsx/actions/workflows/test.yml)

## 📥 Install

```sh
npm i
```

## 🛠️ Development

Press `F5` in VS Code (or use **Run → Start Debugging**) to launch the extension in a new Extension Development Host window.

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

Bump the version in `package.json`: `fix` | `minor` | `major`

```sh
npm version fix
```

Then package:

```sh
npm run package
```

And publish:

```sh
npm run publish:vsce    # VS Code Marketplace
npm run publish:ovsx    # Open VSX
npm run publish:all     # both
```

> [!WARNING]
>
> Get a VS Code Marketplace PAT from [Azure DevOps](https://dev.azure.com), and an Open VSX token from [open-vsx.org/user-settings/tokens](https://open-vsx.org/user-settings/tokens).

## 📝 Notes

VSCode Icons: https://code.visualstudio.com/api/references/icons-in-labels

VSCode marketplace publisher: https://marketplace.visualstudio.com/manage/

Run tests:

- Install the [Extension Test Runner](https://marketplace.visualstudio.com/items?itemName=ms-vscode.extension-test-runner)
- Run the "watch" task via the **Tasks: Run Task** command. Make sure this is running, or tests might not be discovered.
- Open the Testing view from the activity bar and click the Run Test" button, or use the hotkey `Ctrl/Cmd + ; A`
- See the output of the test result in the Test Results view.
- Make changes to `src/test/extension.test.ts` or create new test files inside the `test` folder.
  - The provided test runner will only consider files matching the name pattern `**.test.ts`.
  - You can create folders inside the `test` folder to structure your tests any way you want.

Go further:

- Reduce the extension size and improve the startup time by [bundling your extension](https://code.visualstudio.com/api/working-with-extensions/bundling-extension).
- [Publish your extension](https://code.visualstudio.com/api/working-with-extensions/publishing-extension) on the VS Code extension marketplace.
- Automate builds by setting up [Continuous Integration](https://code.visualstudio.com/api/working-with-extensions/continuous-integration).
