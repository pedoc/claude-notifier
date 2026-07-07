import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { ACTIVE_DIR, OWN_PID_FILE } from "../paths";

export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function getOwnWorkspaceFolders(): string[] {
  return (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);
}

export function writeOwnPidFile(): void {
  try {
    const folders = getOwnWorkspaceFolders().join("\n");
    fs.writeFileSync(OWN_PID_FILE, folders);
  } catch {}
}

export function cwdMatchesFolder(cwd: string, folder: string): boolean {
  if (!cwd || !folder) return false;
  // On Windows, paths are case-insensitive — normalize to lowercase for
  // parity with Test-CwdInsideFolder in hook/_lib.ps1 and cwdInsideFolder
  // in hook/_lib/active.js.
  const isWindows = process.platform === "win32";
  const normalize = (p: string) => (isWindows ? p.toLowerCase() : p);
  const normCwd = normalize(cwd);
  const normFolder = normalize(folder);
  if (normCwd === normFolder) return true;
  return normCwd.startsWith(normFolder.endsWith(path.sep) ? normFolder : normFolder + path.sep);
}

/**
 * True when a *different* live window has a workspace folder that contains
 * `cwd`. Reads the same per-window active markers the hooks use, skipping this
 * window's own marker and dead pids. Empty markers (windows with no folder
 * open) contribute no folders, so they never count as owners.
 *
 * Used by a no-folder window to decide whether to act as the fallback handler
 * for a signal: it should stay out of the way when some folder window already
 * owns the cwd, but still handle a cwd that nobody else owns (e.g. a Claude
 * session running inside that folderless window).
 */
export function anotherWindowOwnsCwd(cwd: string): boolean {
  if (!cwd) return false;
  let entries: string[];
  try {
    entries = fs.readdirSync(ACTIVE_DIR);
  } catch {
    return false;
  }
  for (const name of entries) {
    const markerPath = path.join(ACTIVE_DIR, name);
    if (markerPath === OWN_PID_FILE) continue; // skip our own marker
    const pid = parseInt(name, 10);
    if (!Number.isFinite(pid) || !isPidAlive(pid)) continue;
    let folders = "";
    try {
      folders = fs.readFileSync(markerPath, "utf-8");
    } catch {}
    for (const folder of folders
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)) {
      if (cwdMatchesFolder(cwd, folder)) return true;
    }
  }
  return false;
}

export function cleanStalePidFiles(): void {
  try {
    for (const name of fs.readdirSync(ACTIVE_DIR)) {
      const pid = parseInt(name, 10);
      if (!Number.isFinite(pid) || !isPidAlive(pid)) {
        try {
          fs.unlinkSync(path.join(ACTIVE_DIR, name));
        } catch {}
      }
    }
  } catch {}
}
