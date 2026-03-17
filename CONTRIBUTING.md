# Contributing

## 📥 Install

```sh
npm i
```

## 🛠️ Development

Press `F5` in VS Code (or use **Run → Start Debugging**) to launch the extension in a new Extension Development Host window.

Run tests:

```sh
npm test
```

## 🎛️ Extension Settings

Include if your extension adds any VS Code settings through the `contributes.configuration` extension point.

> [!NOTE]
>
> TODO: support [qlue-ls config](https://github.com/IoannisNezis/Qlue-ls?tab=readme-ov-file#example-configuration)

Extension guidelines:

* [Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)
* [Visual Studio Code's Markdown Support](http://code.visualstudio.com/docs/languages/markdown)
* [Markdown Syntax Reference](https://help.github.com/articles/markdown-basics/)

## 🏷️ Release

Install the packaging tools once:

```sh
npm install -g @vscode/vsce ovsx
```

Bump the version in `package.json`, then build and publish:

```sh
# Package the extension
npm run package
npm run publish:vsce
```

Or use the combined npm scripts:

```sh
npm run publish:vsce    # VS Code Marketplace
npm run publish:ovsx    # Open VSX
npm run publish:all     # both
```

> [!WARNING]
>
> Tokens: get a VS Code Marketplace PAT from [Azure DevOps](https://dev.azure.com), and an Open VSX token from [open-vsx.org/user-settings/tokens](https://open-vsx.org/user-settings/tokens).
