import * as net from "net";
import * as vscode from "vscode";
import { getRemoteAudio } from "../settings/sync";

/**
 * Remote-audio mode: push a notification event to the local cn-daemon so the
 * sound plays on the client machine, over the SSH reverse forward. Mirrors the
 * hook-side push in hook/_lib/remote-audio.js. The extension is long-running,
 * so this is a plain async fire-and-forget — a connection failure (daemon down
 * / not forwarded) is swallowed.
 *
 * @returns true if remote-audio is enabled (caller skips the terminal-bell
 *   fallback); false if disabled (caller falls back to playRemoteSound).
 */
export function pushRemoteAudio(reason: string, soundName: string, volume: number): boolean {
  const ra = getRemoteAudio();
  if (!ra.enabled) return false;
  try {
    const sock = net.connect(ra.port, "127.0.0.1", () => {
      sock.write(JSON.stringify({ reason, sound: soundName, volume }) + "\n");
      sock.end();
    });
    sock.on("error", () => {});
    sock.setTimeout(2000, () => sock.destroy());
  } catch {
    /* daemon unreachable — stay silent rather than throw */
  }
  return true;
}

export function playRemoteSound(): void {
  // In remote sessions, webview audio is blocked by Electron's autoplay policy.
  // Use the terminal bell instead — VS Code forwards BEL to the local client.
  // `terminal.integrated.enableBell` now only drives the *visual* bell; the
  // audible bell lives under `accessibility.signals.terminalBell.sound`, so
  // enable both or no sound is produced.
  const bellConfig = vscode.workspace.getConfiguration("terminal.integrated");
  if (!bellConfig.get<boolean>("enableBell")) {
    bellConfig.update("enableBell", true, vscode.ConfigurationTarget.Global);
  }
  const signalConfig = vscode.workspace.getConfiguration("accessibility.signals");
  if (signalConfig.get<{ sound?: string }>("terminalBell")?.sound !== "on") {
    signalConfig.update("terminalBell", { sound: "on" }, vscode.ConfigurationTarget.Global);
  }
  vscode.commands.executeCommand("workbench.action.terminal.sendSequence", {
    text: "",
  });
}
