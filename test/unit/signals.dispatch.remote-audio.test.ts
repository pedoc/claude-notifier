import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

let tmpRoot: string;
let tmpHooksDir: string;
let signalFile: string;
let configFile: string;

// Spies for the remote module: track push calls + bell fallback, and control
// what pushRemoteAudio returns (mirrors enabled/disabled).
let pushCalls: Array<{ reason: string; sound: string; volume: number }>;
let bellCalls: number;
let pushReturn: boolean;

vi.mock("vscode", () => ({
  workspace: {
    workspaceFolders: [{ uri: { fsPath: "/x" } }],
    onDidChangeWorkspaceFolders: () => ({ dispose() {} }),
    getConfiguration: () => ({ get: () => undefined, inspect: () => undefined }),
  },
  window: { showInformationMessage: () => Promise.resolve(undefined) },
  // A remote session.
  env: { remoteName: "ssh-remote" },
}));

vi.mock("../../src/notifications/remote", () => ({
  playRemoteSound: () => {
    bellCalls++;
  },
  pushRemoteAudio: (reason: string, sound: string, volume: number) => {
    pushCalls.push({ reason, sound, volume });
    return pushReturn;
  },
}));

vi.mock("../../src/notifications/sound", () => ({ playLocalSound: () => {} }));
vi.mock("../../src/notifications/local", () => ({ showLocalNotification: () => {} }));
vi.mock("../../src/routing/cwd", () => ({
  getOwnWorkspaceFolders: () => ["/x"],
  cwdMatchesFolder: (a: string, b: string) => a.startsWith(b),
  anotherWindowOwnsCwd: () => false,
}));
vi.mock("../../src/routing/focus", () => ({
  rememberDone: () => {},
  getRememberedDone: () => undefined,
  revealClaudeTab: () => Promise.resolve(),
  startFocusSignalWatcher: () => ({ dispose() {} }),
}));

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dispatch-remote-audio-"));
  tmpHooksDir = path.join(tmpRoot, ".claude", "hooks");
  signalFile = path.join(tmpHooksDir, "claude-signal");
  configFile = path.join(tmpHooksDir, "claude-notifier-config.json");
  fs.mkdirSync(tmpHooksDir, { recursive: true });
  process.env.HOME = tmpRoot;
  process.env.USERPROFILE = tmpRoot;
  pushCalls = [];
  bellCalls = 0;
  pushReturn = true;
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
  vi.resetModules();
});

function writeConfig(remoteAudioEnabled: boolean) {
  fs.writeFileSync(
    configFile,
    JSON.stringify({
      taskCompleted: { level: "sound", sound: "Hero" },
      needsPermission: { level: "sound", sound: "Glass" },
      asksQuestion: { level: "sound", sound: "Funk" },
      soundVolume: 1,
      minTaskDurationThreshold: 0,
      remoteAudio: { enabled: remoteAudioEnabled, port: 47291 },
    })
  );
}

async function fire(line: string) {
  vi.resetModules();
  const dispatch = await import("../../src/signals/dispatch");
  fs.writeFileSync(signalFile, line);
  (dispatch as unknown as { __handleSignalForTest: () => void }).__handleSignalForTest();
}

describe("dispatch — remote-audio wiring (remote session)", () => {
  it("done: pushes to the daemon, no terminal bell, when remote-audio is on", async () => {
    writeConfig(true);
    pushReturn = true;
    await fire(`done ${Date.now()} sess-1 /x`);
    expect(pushCalls).toEqual([{ reason: "done", sound: "Hero", volume: 1 }]);
    expect(bellCalls).toBe(0);
  });

  it("done: falls back to the terminal bell when remote-audio is off", async () => {
    writeConfig(false);
    pushReturn = false; // disabled → push returns false → bell fallback
    await fire(`done ${Date.now()} sess-1 /x`);
    expect(pushCalls).toEqual([{ reason: "done", sound: "Hero", volume: 1 }]);
    expect(bellCalls).toBe(1);
  });

  it("input: no terminal bell when remote-audio is on (the hook pushes it)", async () => {
    writeConfig(true);
    await fire(`input ${Date.now()} sess-1 /x`);
    expect(bellCalls).toBe(0);
  });

  it("input: rings the terminal bell when remote-audio is off", async () => {
    writeConfig(false);
    await fire(`input ${Date.now()} sess-1 /x`);
    expect(bellCalls).toBe(1);
  });
});
