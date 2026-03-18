const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
  name: 'esbuild-problem-matcher',

  setup(build) {
    build.onStart(() => {
      console.log('[watch] build started');
    });
    build.onEnd((result) => {
      result.errors.forEach(({ text, location }) => {
        console.error(`✘ [ERROR] ${text}`);
        console.error(`    ${location.file}:${location.line}:${location.column}:`);
      });
      console.log('[watch] build finished');
    });
  },
};

/**
 * Plugin to copy the qlue-ls WASM file to dist/
 * @type {import('esbuild').Plugin}
 */
const copyWasmPlugin = {
  name: 'copy-wasm',
  setup(build) {
    build.onEnd(() => {
      const wasmSrc = path.resolve(__dirname, 'node_modules/qlue-ls/qlue_ls_bg.wasm');
      const wasmDest = path.resolve(__dirname, 'dist/qlue_ls_bg.wasm');
      if (fs.existsSync(wasmSrc)) {
        fs.copyFileSync(wasmSrc, wasmDest);
        console.log('[wasm] copied qlue_ls_bg.wasm to dist/');
      }
      const htmlSrc = path.resolve(__dirname, 'src/queryPanel.html');
      const htmlDest = path.resolve(__dirname, 'dist/queryPanel.html');
      if (fs.existsSync(htmlSrc)) {
        fs.copyFileSync(htmlSrc, htmlDest);
        console.log('[html] copied queryPanel.html to dist/');
      }
      const settingsSrc = path.resolve(__dirname, 'src/settingsPanel.html');
      const settingsDest = path.resolve(__dirname, 'dist/settingsPanel.html');
      if (fs.existsSync(settingsSrc)) {
        fs.copyFileSync(settingsSrc, settingsDest);
        console.log('[html] copied settingsPanel.html to dist/');
      }
    });
  },
};

async function main() {
  const ctx = await esbuild.context({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    format: 'cjs',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'node',
    outfile: 'dist/extension.js',
    external: ['vscode'],
    logLevel: 'silent',
    plugins: [copyWasmPlugin, esbuildProblemMatcherPlugin],
  });
  if (watch) {
    await ctx.watch();
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
