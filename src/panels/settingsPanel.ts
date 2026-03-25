import * as vscode from 'vscode';
import { getNonce } from '../utils';
import type { SparqlLanguageServer } from '../languageServer';
import { type BackendConfig, ExtensionState } from '../state';

export class SettingsPanel {
  public static currentPanel: vscode.WebviewPanel | undefined;

  public static async createOrShow(
    context: vscode.ExtensionContext,
    lsServer: SparqlLanguageServer,
    state: ExtensionState,
    onSaveEndpointBackend?: (endpointUrl: string, config: BackendConfig) => Promise<void>,
  ) {
    const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;
    if (SettingsPanel.currentPanel) {
      SettingsPanel.currentPanel.reveal(column);
      SettingsPanel.currentPanel.webview.postMessage({
        type: 'set',
        settings: state.getSettings(),
        endpointBackends: state.getBackends(),
      });
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'sparqlQlueSettings',
      'SPARQL Qlue Language Server Settings',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [],
        retainContextWhenHidden: true,
      },
    );
    SettingsPanel.currentPanel = panel;
    panel.webview.html = await SettingsPanel.getHtmlForWebview(
      panel.webview,
      context.extensionUri,
      state.getSettings(),
      state.getBackends(),
    );
    panel.webview.onDidReceiveMessage(async (message) => {
      if (message.type === 'save') {
        const newSettings = message.settings;
        await state.setSettings(newSettings);
        // Always resolve the live client reference at the time of saving
        try {
          await lsServer.updateSettings(newSettings);
        } catch (err) {
          vscode.window.showErrorMessage(`SPARQL Qlue: Failed to send settings to language server: ${String(err)}`);
        }
      } else if (message.type === 'saveEndpointBackend') {
        if (onSaveEndpointBackend) {
          await onSaveEndpointBackend(message.endpointUrl, message.config as BackendConfig);
        }
      } else if (message.type === 'deleteEndpointBackend') {
        const backends = state.getBackends();
        delete backends[message.endpointUrl as string];
        await state.setBackends(backends);
      } else if (message.type === 'resetAll') {
        const answer = await vscode.window.showWarningMessage(
          'Reset all SPARQL Qlue settings? This will clear all saved endpoints, backend configurations, and extension settings.',
          { modal: true },
          'Reset',
        );
        if (answer !== 'Reset') {
          return;
        }
        await state.resetAll();
        try {
          await lsServer.updateSettings(state.getSettings());
        } catch (_) {
          // best-effort — server may not be running
        }
        panel.webview.postMessage({
          type: 'set',
          settings: state.getSettings(),
          endpointBackends: state.getBackends(),
        });
      }
    });
    panel.onDidDispose(() => {
      SettingsPanel.currentPanel = undefined;
    });
  }

  private static async getSettingsFields(
    extensionUri: vscode.Uri,
  ): Promise<Record<string, Array<{ key: string; type: string; default: boolean | number; description: string }>>> {
    const pkgUri = vscode.Uri.joinPath(extensionUri, 'package.json');
    const pkgBytes = await vscode.workspace.fs.readFile(pkgUri);
    const pkg = JSON.parse(new TextDecoder().decode(pkgBytes)) as {
      contributes?: {
        configuration?: {
          properties?: Record<string, { type: string; default: boolean | number; description?: string }>;
        };
      };
    };
    const props = pkg.contributes?.configuration?.properties ?? {};
    const sections: Record<
      string,
      Array<{ key: string; type: string; default: boolean | number; description: string }>
    > = { general: [], format: [], completion: [], prefixes: [] };
    const PREFIX = 'sparql-qlue.';
    for (const [fullKey, def] of Object.entries(props) as [string, any][]) {
      const noPrefix = fullKey.slice(PREFIX.length);
      const dotIdx = noPrefix.indexOf('.');
      if (dotIdx === -1) {
        // Top-level key (no sub-section) — place in 'general'
        sections['general'].push({
          key: noPrefix,
          type: def.type === 'boolean' ? 'bool' : 'number',
          default: def.default,
          description: (def.description ?? '').replace(/\.$/, ''),
        });
        continue;
      }
      const section = noPrefix.slice(0, dotIdx);
      const key = noPrefix.slice(dotIdx + 1);
      if (!(section in sections)) {
        continue;
      }
      sections[section].push({
        key,
        type: def.type === 'boolean' ? 'bool' : 'number',
        default: def.default,
        description: (def.description ?? '').replace(/\.$/, ''),
      });
    }
    return sections;
  }

  private static async getHtmlForWebview(
    webview: vscode.Webview,
    extensionUri: vscode.Uri,
    settings: unknown,
    endpointBackends: Record<string, BackendConfig>,
  ): Promise<string> {
    const replacements: Record<string, string> = {
      __NONCE__: getNonce(),
      __CSP_SOURCE__: webview.cspSource,
      __SETTINGS__: JSON.stringify(settings ?? {}),
      __ENDPOINT_BACKENDS__: JSON.stringify(endpointBackends ?? {}),
      __SETTINGS_FIELDS__: JSON.stringify(await SettingsPanel.getSettingsFields(extensionUri)),
    };
    const htmlUri = vscode.Uri.joinPath(extensionUri, 'dist', 'panels', 'settingsPanel.html');
    const htmlBytes = await vscode.workspace.fs.readFile(htmlUri);
    return new TextDecoder().decode(htmlBytes).replace(/__[A-Z_]+__/g, (m) => replacements[m] ?? m);
  }
}

export default SettingsPanel;
