import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

let tmpRoot: string;
let tmpHooksDir: string;
let signalFile: string;
let configFile: string;
let playLocalCalls: number;
let popupCalls: number;
// Mutable mock state, read live by the vscode mock below.
let mockFocused: boolean;
let mockAutoMute: boolean;

vi.mock("vscode", () => ({
  workspace: {
    workspaceFolders: [{ uri: { fsPath: "/x" } }],
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
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dispatch-focus-test-"));
  tmpHooksDir = path.join(tmpRoot, ".claude", "hooks");
  signalFile = path.join(tmpHooksDir, "claude-signal");
  configFile = path.join(tmpHooksDir, "claude-notifier-config.json");
  fs.mkdirSync(tmpHooksDir, { recursive: true });
  process.env.HOME = tmpRoot;
  process.env.USERPROFILE = tmpRoot;
  playLocalCalls = 0;
  popupCalls = 0;
  mockFocused = false;
  mockAutoMute = false;
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
  fs.writeFileSync(signalFile, `done ${Date.now()} sess-1 /x`);
  (dispatch as unknown as { __handleSignalForTest: () => void }).__handleSignalForTest();
}

describe("dispatch — auto-mute when focused", () => {
  it("suppresses sound + popup when enabled AND focused", async () => {
    mockAutoMute = true;
    mockFocused = true;
    await fireDone();
    expect(playLocalCalls).toBe(0);
    expect(popupCalls).toBe(0);
  });

  it("fires when enabled but NOT focused (background window still notifies)", async () => {
    mockAutoMute = true;
    mockFocused = false;
    await fireDone();
    expect(playLocalCalls).toBe(1);
    expect(popupCalls).toBe(1);
  });

  it("fires when focused but the setting is disabled", async () => {
    mockAutoMute = false;
    mockFocused = true;
    await fireDone();
    expect(playLocalCalls).toBe(1);
    expect(popupCalls).toBe(1);
  });

  it("fires when disabled and unfocused (default behavior)", async () => {
    mockAutoMute = false;
    mockFocused = false;
    await fireDone();
    expect(playLocalCalls).toBe(1);
    expect(popupCalls).toBe(1);
  });
});
