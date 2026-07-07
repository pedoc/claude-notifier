import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// A window with NO workspace folder open. It should act as a fallback owner:
// handle a cwd signal only when no other live window owns that cwd.
let tmpRoot: string;
let signalFile: string;
let configFile: string;
let playLocalCalls: number;
let popupCalls: number;
// Mutable mock state read live by the mocks below.
let mockAnotherOwns: boolean;
let mockAutoMute: boolean;
let mockFocused: boolean;

vi.mock("vscode", () => ({
  workspace: {
    workspaceFolders: [],
    onDidChangeWorkspaceFolders: () => ({ dispose() {} }),
    getConfiguration: () => ({
      get: (key: string) => (key === "autoMuteWhenFocused" ? mockAutoMute : undefined),
      inspect: () => undefined,
    }),
  },
  window: {
    get state() {
      return { focused: mockFocused };
    },
    showInformationMessage: (..._args: unknown[]) => {
      popupCalls++;
      return Promise.resolve(undefined);
    },
  },
  env: { remoteName: undefined },
}));

vi.mock("../../src/notifications/sound", () => ({
  playLocalSound: () => {
    playLocalCalls++;
  },
}));

vi.mock("../../src/notifications/remote", () => ({
  playRemoteSound: () => {},
  pushRemoteAudio: () => false,
}));

vi.mock("../../src/notifications/local", () => ({
  showLocalNotification: () => {},
}));

vi.mock("../../src/routing/cwd", () => ({
  // No workspace folders → this window is a folderless "loose tab".
  getOwnWorkspaceFolders: () => [],
  cwdMatchesFolder: (a: string, b: string) => a.startsWith(b),
  anotherWindowOwnsCwd: () => mockAnotherOwns,
}));

vi.mock("../../src/routing/focus", () => ({
  rememberDone: () => {},
  getRememberedDone: () => undefined,
  revealClaudeTab: () => Promise.resolve(),
  startFocusSignalWatcher: () => ({ dispose() {} }),
}));

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dispatch-no-folder-test-"));
  const hooksDir = path.join(tmpRoot, ".claude", "hooks");
  signalFile = path.join(hooksDir, "claude-signal");
  configFile = path.join(hooksDir, "claude-notifier-config.json");
  fs.mkdirSync(hooksDir, { recursive: true });
  process.env.HOME = tmpRoot;
  process.env.USERPROFILE = tmpRoot;
  playLocalCalls = 0;
  popupCalls = 0;
  mockAnotherOwns = false;
  mockAutoMute = false;
  mockFocused = false;
  fs.writeFileSync(
    configFile,
    JSON.stringify({
      taskCompleted: { level: "sound+popup", sound: "Hero" },
      soundVolume: 1,
      minTaskDurationThreshold: 0,
    })
  );
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
  vi.resetModules();
});

async function fireDone(): Promise<void> {
  vi.resetModules();
  const dispatch = await import("../../src/signals/dispatch");
  fs.writeFileSync(signalFile, `done ${Date.now()} sess-1 /some/project`);
  (dispatch as unknown as { __handleSignalForTest: () => void }).__handleSignalForTest();
}

describe("dispatch — no-folder window routing", () => {
  it("does NOT handle a done another window already owns (stray-tab bug)", async () => {
    mockAnotherOwns = true;
    await fireDone();
    expect(playLocalCalls).toBe(0);
    expect(popupCalls).toBe(0);
  });

  it("handles a done nobody else owns (a Claude session inside this window)", async () => {
    mockAnotherOwns = false;
    await fireDone();
    expect(playLocalCalls).toBe(1);
    expect(popupCalls).toBe(1);
  });

  it("applies normal focus rules to its own session: suppressed when focused", async () => {
    mockAnotherOwns = false;
    mockAutoMute = true;
    mockFocused = true;
    await fireDone();
    expect(playLocalCalls).toBe(0);
    expect(popupCalls).toBe(0);
  });

  it("applies normal focus rules to its own session: fires when not focused", async () => {
    mockAnotherOwns = false;
    mockAutoMute = true;
    mockFocused = false;
    await fireDone();
    expect(playLocalCalls).toBe(1);
    expect(popupCalls).toBe(1);
  });
});
