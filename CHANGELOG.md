# 📜 Changelog

## [0.0.7](https://github.com/vemonet/sparql-qlue-vsx/compare/v0.0.6..v0.0.7) - 2026-03-26

### ⛰️ Features

- Feat: update extension to make it compatible with web install
  feat: make the extension work in browser monaco editor - ([ed5a443](https://github.com/vemonet/sparql-qlue-vsx/commit/ed5a4433a1ea9b42f591cc9505c0193aa11ade5d))
- Add 2 tools for agents (execute SPARQL query and search examples/classes extracted from endpoints) - ([a1f4a71](https://github.com/vemonet/sparql-qlue-vsx/commit/a1f4a713898519a50999a233e3ef062c3f3f1f99))

### 🚜 Refactor

- Add `formatOnSave` to settings panel, reduce amount of warning notifications from completion and hover of the language server, add integration tests for the extension, add query run time - ([15bd154](https://github.com/vemonet/sparql-qlue-vsx/commit/15bd1547cdd554c92f86801bd1609ebfbe1596f5))

## [0.0.6](https://github.com/vemonet/sparql-qlue-vsx/compare/v0.0.5..v0.0.6) - 2026-03-23

### ⛰️ Features

- Add command to create query file from examples extracted from the endpoint (declared with SHACL) - ([2cea55c](https://github.com/vemonet/sparql-qlue-vsx/commit/2cea55c9d90f06fa7133659f6a2683f05d38cd00))

## [0.0.5](https://github.com/vemonet/sparql-qlue-vsx/compare/v0.0.4..v0.0.5) - 2026-03-22

### ⛰️ Features

- Create a `SparqlSemanticTokensProvider` to enable semantic highlighting and better adapt directly to themes colors instead of providing 2 themes, disable settings `sparql.swls` by default to avoid conflicts - ([e1593c9](https://github.com/vemonet/sparql-qlue-vsx/commit/e1593c9827384e9bb0f5592d401757a2bcf20d28))

## [0.0.4](https://github.com/vemonet/sparql-qlue-vsx/compare/v0.0.3..v0.0.4) - 2026-03-21

### 🐛 Bug Fixes

- Fix YASGUI YASR CSS inclusion in query results webview - ([e10afe6](https://github.com/vemonet/sparql-qlue-vsx/commit/e10afe61226315930f88de7dde95c190f85be278))

## [0.0.3](https://github.com/vemonet/sparql-qlue-vsx/compare/v0.0.2..v0.0.3) - 2026-03-21

### 🐛 Bug Fixes

- Fix import paths from src to dist - ([88af67c](https://github.com/vemonet/sparql-qlue-vsx/commit/88af67c12adebe09b889d993daf92508f16a1a19))

### 📚 Documentation

- Update icon - ([b96faf6](https://github.com/vemonet/sparql-qlue-vsx/commit/b96faf62d725eb41996e999796f8d3af8b17e6c1))

### 🚜 Refactor

- Improve webviews static imports and fix tag in publish workflow - ([7041751](https://github.com/vemonet/sparql-qlue-vsx/commit/70417518681e9b84f2f11b05a1585499c5e6240d))
- Improve endpoints list rendering - ([9789855](https://github.com/vemonet/sparql-qlue-vsx/commit/9789855d6b0470cdef4154d52b35c533ffa05184))

## [0.0.2](https://github.com/vemonet/sparql-qlue-vsx/compare/v0.0.1..v0.0.2) - 2026-03-21

### ⚙️ Continuous Integration

- Fix precommit hooks - ([014de6c](https://github.com/vemonet/sparql-qlue-vsx/commit/014de6cf59f6ea356bfc2a70872c3a015cec6b43))
- Ci: improve scripts, fix workflow
  doc: improve readme - ([f6ff9ab](https://github.com/vemonet/sparql-qlue-vsx/commit/f6ff9aba833c5b36ae1ef3c2d32fd99ac7656d39))

### ⛰️ Features

- Add geo and graph YASR plugins for results visualisation, get settings fields descriptions from `package.json`, add prefixes to YASR - ([5c1b0dd](https://github.com/vemonet/sparql-qlue-vsx/commit/5c1b0dd941a8794857402d11c06479d18425ffbd))

### 🐛 Bug Fixes

- Fix query file path in test - ([1b6e1b2](https://github.com/vemonet/sparql-qlue-vsx/commit/1b6e1b253228ea3a819b8aa126915eeff16ea369))

### 📚 Documentation

- Update docs - ([25d73d6](https://github.com/vemonet/sparql-qlue-vsx/commit/25d73d62fa3153c61dd8e4932a1773372ae6f696))

### 🚜 Refactor

- Improve settings to use VSCode extension settings instead of global state, fix release process - ([1c7dd4a](https://github.com/vemonet/sparql-qlue-vsx/commit/1c7dd4ace354b685b02929d2acd682300283a875))

## [0.0.1](https://github.com/vemonet/sparql-qlue-vsx/tree/v0.0.1) - 2026-03-20

### ⚙️ Continuous Integration

- Add precommit hooks - ([2984a16](https://github.com/vemonet/sparql-qlue-vsx/commit/2984a165a502da455b923137e8011a785be2ce04))
- Fix workflow - ([9173060](https://github.com/vemonet/sparql-qlue-vsx/commit/9173060600c1753137d37df6bcf0aba2e2bb001f))

### ⛰️ Features

- Initial commit - ([79b909b](https://github.com/vemonet/sparql-qlue-vsx/commit/79b909ba3c9e25be8feecfd0d029937702bd267e))
- Add dropdown list to choose from saved endpoints, add settings panel to change the language server settings - ([b9fb329](https://github.com/vemonet/sparql-qlue-vsx/commit/b9fb329f75c37108a4b43a1f6ee9964147a9b835))
- Customize backend completions queries, and prefixes per endpoint in the settings panel - ([1579b9f](https://github.com/vemonet/sparql-qlue-vsx/commit/1579b9fd678de504d14f975ca0b07b5fbc016faf))

### 📚 Documentation

- Doc: add icon, improve readme
  refactor: improve docs, improve YASGUI dark theme, - ([3841969](https://github.com/vemonet/sparql-qlue-vsx/commit/3841969b6afe60e35d941214b892415c1d2b5529))

### 🚜 Refactor

- Create a `ExtensionState` class to make it easier accessing and updating the global state - ([11dadd7](https://github.com/vemonet/sparql-qlue-vsx/commit/11dadd726dcc553ee051df303d1ff2c078f53dbb))
- Move panels code in a subfolder - ([afb0514](https://github.com/vemonet/sparql-qlue-vsx/commit/afb0514405a6356a484ecadaadf83fa7557812bd))
- Simplify completion queries - ([39a3219](https://github.com/vemonet/sparql-qlue-vsx/commit/39a3219428a825f231b94d07e8bc3bcf7d298a4a))
