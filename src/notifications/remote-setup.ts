import * as vscode from "vscode";
import { DEFAULT_REMOTE_AUDIO_PORT } from "../settings/sync";

const RELEASES_URL = "https://github.com/ashmitb95/claude-notifier/releases";
const GUIDE_URL = "https://github.com/ashmitb95/claude-notifier/blob/main/docs/REMOTE_HOSTS.md";

/**
 * "Set up remote audio…" command. Does the parts the (remote-side) extension
 * can do, and hands off the parts that must happen on the client:
 *
 *   1. enable remote-audio mode (a setting — the extension owns it),
 *   2. open the GitHub release page in the *local* browser (openExternal
 *      resolves on the client) so the user grabs the binary for their OS,
 *   3. show the remaining one-time local steps (run the daemon + add the SSH
 *      reverse forward), with copy / guide actions.
 *
 * A fully hands-off install isn't possible from a remote window — the daemon
 * runs on the client, which the remote extension host can't reach. See
 * docs/REMOTE_HOSTS.md.
 */
export async function setupRemoteAudio(): Promise<void> {
  const cfg = vscode.workspace.getConfiguration("claudeNotifier");
  const port = cfg.get<number>("remoteAudio.port", DEFAULT_REMOTE_AUDIO_PORT);

  await cfg.update("remoteAudio.enabled", true, vscode.ConfigurationTarget.Global);
  await vscode.env.openExternal(vscode.Uri.parse(RELEASES_URL));

  const forwardLine = `RemoteForward ${port} localhost:${port}`;
  const pick = await vscode.window.showInformationMessage(
    `Remote audio enabled. Opened the releases page in your browser. Two one-time steps on ` +
      `your local machine remain: (1) run the downloaded cn-daemon, and (2) add ` +
      `"${forwardLine}" to this host in ~/.ssh/config, then reconnect.`,
    "Copy RemoteForward line",
    "Open setup guide"
  );
  if (pick === "Copy RemoteForward line") {
    await vscode.env.clipboard.writeText(forwardLine);
  } else if (pick === "Open setup guide") {
    await vscode.env.openExternal(vscode.Uri.parse(GUIDE_URL));
  }
}
