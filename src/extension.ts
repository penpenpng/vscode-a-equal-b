import { window, ExtensionContext } from "vscode";
import { LanguageClient, TransportKind } from "vscode-languageclient/node";
import * as path from "path";
import { SERVICE_NAME, LANG_ID, SERVICE_ID } from "./consts";

let client: LanguageClient;

export const activate = async (context: ExtensionContext) => {
  const serverModule = context.asAbsolutePath(path.join("out", "server.js"));

  try {
    client = new LanguageClient(
      SERVICE_ID,
      SERVICE_NAME,
      {
        run: { module: serverModule, transport: TransportKind.ipc },
        debug: {
          module: serverModule,
          transport: TransportKind.ipc,
          options: { execArgv: ["--nolazy", "--inspect=6009"] },
        },
      },
      {
        documentSelector: [
          {
            scheme: "file",
            language: LANG_ID,
          },
        ],
      }
    );
    await client.start();
  } catch (e) {
    window.showErrorMessage(`${SERVICE_NAME} couldn't be started.`);
  }
};

export const deactivate = () => {
  client?.stop();
};
