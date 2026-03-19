import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { getNonce } from '../utils';
import type { SparqlLanguageServer } from '../languageServer';
import { type BackendConfig, ExtensionState } from '../state';

export class SettingsPanel {
  public static currentPanel: vscode.WebviewPanel | undefined;

  public static createOrShow(
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
    panel.webview.html = SettingsPanel.getHtmlForWebview(
      panel.webview,
      context.extensionPath,
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
      }
    });
    panel.onDidDispose(() => {
      SettingsPanel.currentPanel = undefined;
    });
  }

  private static getHtmlForWebview(
    webview: vscode.Webview,
    extensionPath: string,
    settings: any,
    endpointBackends: Record<string, BackendConfig>,
  ): string {
    const nonce = getNonce();
    const htmlPath = path.join(extensionPath, 'src', 'panels', 'settingsPanel.html');
    const settingsJson = JSON.stringify(settings ?? {});
    const endpointBackendsJson = JSON.stringify(endpointBackends ?? {});
    return fs
      .readFileSync(htmlPath, 'utf8')
      .replace('__CSP_SOURCE__', webview.cspSource)
      .replaceAll('__NONCE__', nonce)
      .replace('__SETTINGS__', () => settingsJson)
      .replace('__ENDPOINT_BACKENDS__', () => endpointBackendsJson);
  }
}

export default SettingsPanel;
