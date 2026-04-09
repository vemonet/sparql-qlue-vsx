# 📜 Changelog

## [0.0.9](https://github.com/vemonet/sparql-qlue-vsx/compare/v0.0.8..v0.0.9) - 2026-04-09

### ⛰️ Features

- Users can now load local RDF files (.ttl, .nt, .trig, .nq, .rdf, .xml, .json, .jsonld) in a local embedded Oxigraph triplestore and use it as target endpoint when running the SPARQL queries - ([d5607b0](https://github.com/vemonet/sparql-qlue-vsx/commit/d5607b00bf7b6c6ea0dca6f512a112cf97886c3d))
- When opening settings panel the backend of the current file is highlighted - ([4704a67](https://github.com/vemonet/sparql-qlue-vsx/commit/4704a6717a9c4e01a1b8eb90c52638d0d00e85fe))
- Add section to summarize local endpoint in settings - ([2e2205e](https://github.com/vemonet/sparql-qlue-vsx/commit/2e2205e21204de59232f799a0632dce71b9fbb09))
- Feat: show local endpoint info (triples count, files loaded) in the settings panel
  fix: fix loaded file uri in info msg - ([a4bd7d4](https://github.com/vemonet/sparql-qlue-vsx/commit/a4bd7d477bf1ca5ca9ef3d489d4832620571bfba))

### 🐛 Bug Fixes

- Improve how we wait for LS to be ready to fix issues with backend undefined - ([a881d39](https://github.com/vemonet/sparql-qlue-vsx/commit/a881d39dc09e29d774d411fd25619b9a866e98de))

### 🚜 Refactor

- Improve how backend is retrieved to avoid blocking UI while indexing endpoint - ([55f0fd6](https://github.com/vemonet/sparql-qlue-vsx/commit/55f0fd6db70fcbac8c824d5a7dacb5e55fe339b4))
- Remove general config from settings panel and add link to SPARQL Qlue in VSCode settings - ([e7df7cd](https://github.com/vemonet/sparql-qlue-vsx/commit/e7df7cda9b881bf6066a05c4a675080db1e93758))
- Improve settings panel, add markdown tooltip on statusBarItem to show currently active backend - ([2b03452](https://github.com/vemonet/sparql-qlue-vsx/commit/2b034525a2bb97b4ff32b1b8a7ff9635c7341f2a))
- Improve backend activation handling - ([40cf537](https://github.com/vemonet/sparql-qlue-vsx/commit/40cf5374001ac81380f3d42fd95d20be07367abf))

### 🧪 Testing

- Fix tests for hover and completion - ([e380629](https://github.com/vemonet/sparql-qlue-vsx/commit/e380629eb88f5f24e102b9936115a02c796e0212))

## [0.0.8](https://github.com/vemonet/sparql-qlue-vsx/compare/v0.0.7..v0.0.8) - 2026-04-01

### 🐛 Bug Fixes

- Fix default completion queries and add space between prefixed IRI and label in completion suggestions dropdown - ([a1340b7](https://github.com/vemonet/sparql-qlue-vsx/commit/a1340b7098ad3b9469937a46d6594222ec5f50b0))

### 🚜 Refactor

- Remove status bar icon, add dropdown menu next to execute button in file frame - ([5404ad0](https://github.com/vemonet/sparql-qlue-vsx/commit/5404ad0d2466cd2efa7d07906bdf408245aca17f))

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
