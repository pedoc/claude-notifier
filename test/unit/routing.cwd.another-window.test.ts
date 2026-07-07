import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

vi.mock("vscode", () => ({ workspace: { workspaceFolders: [] } }));

let tmpRoot: string;
let activeDir: string;
const ALIVE_PID = process.ppid; // a real, different, alive pid
const DEAD_PID = 4000001; // above the usual PID_MAX → not a live process

// cwdMatchesFolder uses path.sep at runtime, so build platform-correct paths
// (\ on Windows, / elsewhere) rather than hardcoding forward slashes.
const OWNED = path.join(path.sep, "proj");
const OWNED_SUB = path.join(OWNED, "sub");
const UNOWNED = path.join(path.sep, "other");

// paths.js binds ACTIVE_DIR from HOME at module load, so import after setting it.
async function loadCwd() {
  vi.resetModules();
  return await import("../../src/routing/cwd");
}

function marker(pid: number, content: string) {
  fs.writeFileSync(path.join(activeDir, String(pid)), content);
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "another-window-test-"));
  activeDir = path.join(tmpRoot, ".claude", "hooks", "claude-notifier-active.d");
  fs.mkdirSync(activeDir, { recursive: true });
  process.env.HOME = tmpRoot;
  process.env.USERPROFILE = tmpRoot;
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
  vi.resetModules();
});

describe("anotherWindowOwnsCwd", () => {
  it("false when no markers exist", async () => {
    const { anotherWindowOwnsCwd } = await loadCwd();
    expect(anotherWindowOwnsCwd(OWNED_SUB)).toBe(false);
  });

  it("true when a live window's folder contains the cwd", async () => {
    marker(ALIVE_PID, OWNED);
    const { anotherWindowOwnsCwd } = await loadCwd();
    expect(anotherWindowOwnsCwd(OWNED_SUB)).toBe(true);
  });

  it("false when the live window's folder does not contain the cwd", async () => {
    marker(ALIVE_PID, UNOWNED);
    const { anotherWindowOwnsCwd } = await loadCwd();
    expect(anotherWindowOwnsCwd(OWNED_SUB)).toBe(false);
  });

  it("ignores dead pids", async () => {
    marker(DEAD_PID, OWNED);
    const { anotherWindowOwnsCwd } = await loadCwd();
    expect(anotherWindowOwnsCwd(OWNED_SUB)).toBe(false);
  });

  it("ignores an empty marker (a folderless window)", async () => {
    marker(ALIVE_PID, "");
    const { anotherWindowOwnsCwd } = await loadCwd();
    expect(anotherWindowOwnsCwd(OWNED_SUB)).toBe(false);
  });

  it("skips our own marker", async () => {
    marker(process.pid, OWNED); // this is OWN_PID_FILE
    const { anotherWindowOwnsCwd } = await loadCwd();
    expect(anotherWindowOwnsCwd(OWNED_SUB)).toBe(false);
  });
});
