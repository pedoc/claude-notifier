import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// Set HOME before importing the lib (paths.js binds HOOKS_DIR at module
// load).
const HOME_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claude-notifier-config-"));
const HOOKS_DIR = path.join(HOME_DIR, ".claude", "hooks");
const CONFIG_FILE = path.join(HOOKS_DIR, "claude-notifier-config.json");
const MUTE_FLAG = path.join(HOOKS_DIR, "claude-notifier-muted");
fs.mkdirSync(HOOKS_DIR, { recursive: true });

const ORIG_HOME = process.env.HOME;
process.env.HOME = HOME_DIR;

const config = await import("../../hook/_lib/config");

beforeAll(() => {
  process.env.HOME = HOME_DIR;
});
beforeEach(() => {
  try {
    fs.unlinkSync(CONFIG_FILE);
  } catch {}
  try {
    fs.unlinkSync(MUTE_FLAG);
  } catch {}
});
afterAll(() => {
  process.env.HOME = ORIG_HOME;
  try {
    fs.rmSync(HOME_DIR, { recursive: true, force: true });
  } catch {}
});

describe("hook/_lib/config — isMuted", () => {
  it("false when mute flag does not exist", () => {
    expect(config.isMuted()).toBe(false);
  });

  it("true when mute flag file exists", () => {
    fs.writeFileSync(MUTE_FLAG, "");
    expect(config.isMuted()).toBe(true);
  });
});

describe("hook/_lib/config — isDisabled", () => {
  const ORIG = process.env.CLAUDE_NOTIFIER_DISABLE;
  // isDisabled() also returns true under Cursor (via isInsideCursor), so clear
  // any Cursor signals to isolate the env-var behavior; the suite may itself run
  // inside Cursor's terminal.
  const CURSOR_KEYS = Object.keys(process.env).filter((k) => k.startsWith("CURSOR_"));
  const savedCursor: Record<string, string | undefined> = Object.fromEntries([
    ...CURSOR_KEYS.map((k) => [k, process.env[k]]),
    ["__CFBundleIdentifier", process.env.__CFBundleIdentifier],
  ]);
  function clearCursor() {
    for (const k of Object.keys(process.env)) {
      if (k.startsWith("CURSOR_")) delete process.env[k];
    }
    delete process.env.__CFBundleIdentifier;
  }
  afterAll(() => {
    if (ORIG === undefined) delete process.env.CLAUDE_NOTIFIER_DISABLE;
    else process.env.CLAUDE_NOTIFIER_DISABLE = ORIG;
    clearCursor();
    for (const [k, v] of Object.entries(savedCursor)) {
      if (v !== undefined) process.env[k] = v;
    }
  });
  beforeEach(() => {
    delete process.env.CLAUDE_NOTIFIER_DISABLE;
    clearCursor();
  });

  it("false when env var is unset", () => {
    expect(config.isDisabled()).toBe(false);
  });

  it("false for empty, '0', and 'false' (case-insensitive)", () => {
    for (const v of ["", "0", "false", "False", "FALSE"]) {
      process.env.CLAUDE_NOTIFIER_DISABLE = v;
      expect(config.isDisabled()).toBe(false);
    }
  });

  it("true for any other non-empty value", () => {
    for (const v of ["1", "true", "yes", "on"]) {
      process.env.CLAUDE_NOTIFIER_DISABLE = v;
      expect(config.isDisabled()).toBe(true);
    }
  });

  it("true when running under Cursor even with the env var unset", () => {
    process.env.CURSOR_VERSION = "3.1.17";
    expect(config.isDisabled()).toBe(true);
  });
});

describe("hook/_lib/config — readConfig", () => {
  it("returns null when config file does not exist", () => {
    expect(config.readConfig()).toBeNull();
  });

  it("returns parsed JSON when config file exists", () => {
    fs.writeFileSync(
      CONFIG_FILE,
      JSON.stringify({ taskCompleted: { level: "sound+popup", sound: "Hero" } })
    );
    expect(config.readConfig()).toEqual({
      taskCompleted: { level: "sound+popup", sound: "Hero" },
    });
  });

  it("returns null when config file is malformed JSON", () => {
    fs.writeFileSync(CONFIG_FILE, "{ not valid json");
    expect(config.readConfig()).toBeNull();
  });
});
