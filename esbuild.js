const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));

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
      const panelsDist = path.resolve(__dirname, 'dist/panels');
      fs.mkdirSync(panelsDist, { recursive: true });
      const htmlSrc = path.resolve(__dirname, 'src/panels/queryPanel.html');
      const htmlDest = path.resolve(__dirname, 'dist/panels/queryPanel.html');
      if (fs.existsSync(htmlSrc)) {
        fs.copyFileSync(htmlSrc, htmlDest);
        console.log('[html] copied queryPanel.html to dist/');
      }
      // Copy YASR and graph-plugin pre-built files so they are included in the packaged extension
      const yasrBuild = path.resolve(__dirname, 'node_modules/@zazuko/yasr/build');
      for (const file of ['yasr.min.js', 'yasr.min.css']) {
        const src = path.join(yasrBuild, file);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, path.join(panelsDist, file));
          console.log(`[yasr] copied ${file} to dist/panels/`);
        }
      }
      const graphPluginDist = path.resolve(__dirname, 'node_modules/@matdata/yasgui-graph-plugin/dist');
      const graphCss = 'yasgui-graph-plugin.min.css';
      const graphCssSrc = path.join(graphPluginDist, graphCss);
      if (fs.existsSync(graphCssSrc)) {
        fs.copyFileSync(graphCssSrc, path.join(panelsDist, graphCss));
        console.log(`[graph-plugin] copied ${graphCss} to dist/panels/`);
      }
      const settingsSrc = path.resolve(__dirname, 'src/panels/settingsPanel.html');
      const settingsDest = path.resolve(__dirname, 'dist/panels/settingsPanel.html');
      if (fs.existsSync(settingsSrc)) {
        fs.copyFileSync(settingsSrc, settingsDest);
        console.log('[html] copied settingsPanel.html to dist/');
      }
      // Copy static resources (grammar, etc.) to dist/resources/
      const resourcesSrc = path.resolve(__dirname, 'src/resources');
      const resourcesDest = path.resolve(__dirname, 'dist/resources');
      fs.mkdirSync(resourcesDest, { recursive: true });
      for (const file of fs.readdirSync(resourcesSrc)) {
        fs.copyFileSync(path.join(resourcesSrc, file), path.join(resourcesDest, file));
      }
      console.log('[resources] copied src/resources to dist/resources/');
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
    define: { PACKAGE_VERSION: JSON.stringify(pkg.version) },
    logLevel: 'silent',
    plugins: [copyWasmPlugin, esbuildProblemMatcherPlugin],
  });

  // Browser bundle for vscode.dev / web extension support
  const ctxBrowser = await esbuild.context({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    format: 'cjs',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'browser',
    outfile: 'dist/extension.browser.js',
    external: ['vscode'],
    define: { PACKAGE_VERSION: JSON.stringify(pkg.version) },
    logLevel: 'silent',
    plugins: [copyWasmPlugin, esbuildProblemMatcherPlugin],
  });

  // Browser bundle: YASR plugins (Graph + Geo) registered on window.Yasr
  // https://www.npmjs.com/package/yasgui-geo-tg
  // https://www.npmjs.com/package/@matdata/yasgui-graph-plugin
  const ctxPlugins = await esbuild.context({
    stdin: {
      contents: `
import GraphPlugin from '@matdata/yasgui-graph-plugin';
import GeoPlugin from 'yasgui-geo-tg';
const Y = globalThis.Yasr;
if (Y) {
  Y.registerPlugin('Graph', GraphPlugin);
  Y.registerPlugin('Geo', GeoPlugin);
}`,
      resolveDir: __dirname,
      loader: 'js',
    },
    bundle: true,
    format: 'iife',
    platform: 'browser',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    outfile: 'dist/panels/yasrPlugins.js',
    // Inline binary assets referenced by CSS (leaflet marker images, etc.)
    loader: { '.png': 'dataurl', '.gif': 'dataurl', '.svg': 'dataurl' },
    logLevel: 'silent',
    plugins: [esbuildProblemMatcherPlugin],
  });

  if (watch) {
    await ctx.watch();
    await ctxBrowser.watch();
    await ctxPlugins.watch();
  } else {
    await ctx.rebuild();
    await ctx.dispose();
    await ctxBrowser.rebuild();
    await ctxBrowser.dispose();
    await ctxPlugins.rebuild();
    await ctxPlugins.dispose();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
