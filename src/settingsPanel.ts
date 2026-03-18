import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { getNonce } from './utils';
import type { LanguageClient } from 'vscode-languageclient/node';

export class SettingsPanel {
  public static currentPanel: vscode.WebviewPanel | undefined;

  public static createOrShow(
    context: vscode.ExtensionContext,
    getClient: () => LanguageClient | undefined,
    settings: any,
  ) {
    const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;
    if (SettingsPanel.currentPanel) {
      SettingsPanel.currentPanel.reveal(column);
      SettingsPanel.currentPanel.webview.postMessage({ type: 'set', settings });
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
    panel.webview.html = SettingsPanel.getHtmlForWebview(panel.webview, context.extensionPath, settings);
    panel.webview.onDidReceiveMessage(async (message) => {
      if (message.type === 'save') {
        const newSettings = message.settings;
        // Persist in extension globalState — reliable across all projects/restarts
        await context.globalState.update('sparql-qlue.serverSettings', newSettings);
        // Always resolve the live client reference at the time of saving
        const client = getClient();
        if (client) {
          try {
            await client.sendNotification('qlueLs/changeSettings', newSettings);
            // vscode.window.showInformationMessage("SPARQL Qlue: Server settings updated");
          } catch (err) {
            vscode.window.showErrorMessage(`SPARQL Qlue: Failed to send settings to language server: ${String(err)}`);
          }
        } else {
          vscode.window.showInformationMessage('SPARQL Qlue: Settings saved (language server not connected)');
        }
      }
    });
    panel.onDidDispose(() => {
      SettingsPanel.currentPanel = undefined;
    });
  }

  private static getHtmlForWebview(webview: vscode.Webview, extensionPath: string, settings: any): string {
    const nonce = getNonce();
    const htmlPath = path.join(extensionPath, 'src', 'settingsPanel.html');
    const settingsJson = JSON.stringify(settings ?? {});
    return (
      fs
        .readFileSync(htmlPath, 'utf8')
        .replace('__CSP_SOURCE__', webview.cspSource)
        .replaceAll('__NONCE__', nonce)
        // Use a replacer function so special $ characters in JSON don't corrupt output
        .replace('__SETTINGS__', () => settingsJson)
    );
  }
}

export default SettingsPanel;
