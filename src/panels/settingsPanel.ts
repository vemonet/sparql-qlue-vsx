import * as vscode from 'vscode';
import { getNonce } from '../utils';
import { type BackendConfig, ExtensionState } from '../state';

export class SettingsPanel {
  public static currentPanel: vscode.WebviewPanel | undefined;

  public static async createOrShow(
    context: vscode.ExtensionContext,
    state: ExtensionState,
    activeEndpointUrl?: string,
    onSaveEndpointBackend?: (endpointUrl: string, config: BackendConfig) => Promise<void>,
  ) {
    if (SettingsPanel.currentPanel) {
      SettingsPanel.currentPanel.reveal(vscode.ViewColumn.Beside);
      SettingsPanel.currentPanel.webview.postMessage({
        type: 'set',
        endpointBackends: state.getBackends(),
        activeEndpointUrl: activeEndpointUrl ?? '',
      });
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'sparqlQlueSettings',
      'SPARQL Qlue Language Server Settings',
      vscode.ViewColumn.Beside,
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
      state.getBackends(),
      activeEndpointUrl ?? '',
    );
    panel.webview.onDidReceiveMessage(async (message) => {
      if (message.type === 'openExamplesForEndpoint') {
        const endpointUrl = message.endpointUrl as string;
        const examples = state.getBackends()[endpointUrl]?.examples ?? [];
        if (examples.length === 0) {
          vscode.window.showInformationMessage(`No examples indexed for ${endpointUrl}.`);
          return;
        }
        const picked = await vscode.window.showQuickPick(
          examples.map((ex) => ({
            label: ex.comment,
            detail: ex.query.replace(/\s+/g, ' ').slice(0, 120),
            query: ex.query,
          })),
          { placeHolder: `Pick an example from ${endpointUrl}`, matchOnDetail: true },
        );
        if (!picked) {
          return;
        }
        const doc = await vscode.workspace.openTextDocument({
          language: 'sparql',
          content: `#+ endpoint: ${endpointUrl}\n${picked.query}`,
        });
        await vscode.window.showTextDocument(doc);
      } else if (message.type === 'openVscodeSettings') {
        await vscode.commands.executeCommand('workbench.action.openSettings', 'sparql-qlue');
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

  private static async getHtmlForWebview(
    webview: vscode.Webview,
    extensionUri: vscode.Uri,
    endpointBackends: Record<string, BackendConfig>,
    activeEndpointUrl: string,
  ): Promise<string> {
    const replacements: Record<string, string> = {
      __NONCE__: getNonce(),
      __CSP_SOURCE__: webview.cspSource,
      __ENDPOINT_BACKENDS__: JSON.stringify(endpointBackends ?? {}),
      __ACTIVE_ENDPOINT__: JSON.stringify(activeEndpointUrl),
    };
    const htmlUri = vscode.Uri.joinPath(extensionUri, 'dist', 'panels', 'settingsPanel.html');
    const htmlBytes = await vscode.workspace.fs.readFile(htmlUri);
    return new TextDecoder().decode(htmlBytes).replace(/__[A-Z_]+__/g, (m) => replacements[m] ?? m);
  }
}

export default SettingsPanel;
