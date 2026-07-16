import { describe, it, expect, beforeEach, afterEach } from "vitest";

// isInsideCursor() reads process.env at call time, so a single import is fine.
const { isInsideCursor } = await import("../../hook/_lib/cursor");

// Snapshot every Cursor-identifying var so tests are hermetic even when the
// suite itself happens to run inside Cursor's terminal.
const CURSOR_KEYS = Object.keys(process.env).filter((k) => k.startsWith("CURSOR_"));
const saved: Record<string, string | undefined> = Object.fromEntries([
  ...CURSOR_KEYS.map((k) => [k, process.env[k]]),
  ["__CFBundleIdentifier", process.env.__CFBundleIdentifier],
]);

function clearCursorSignals() {
  for (const k of Object.keys(process.env)) {
    if (k.startsWith("CURSOR_")) delete process.env[k];
  }
  delete process.env.__CFBundleIdentifier;
}

beforeEach(clearCursorSignals);

afterEach(() => {
  clearCursorSignals();
  for (const [k, v] of Object.entries(saved)) {
    if (v !== undefined) process.env[k] = v;
  }
});

describe("hook/_lib/cursor — isInsideCursor", () => {
  it("false when no Cursor signals are present", () => {
    expect(isInsideCursor()).toBe(false);
  });

  it("true when a CURSOR_* env var is set (Composer hook environment)", () => {
    process.env.CURSOR_VERSION = "3.1.17";
    expect(isInsideCursor()).toBe(true);
  });

  it("true via Cursor's bundle id on macOS", () => {
    process.env.__CFBundleIdentifier = "com.todesktop.230313mzl4w4u92";
    expect(isInsideCursor()).toBe(true);
  });

  it("false under VS Code's bundle id with no CURSOR_* vars", () => {
    process.env.__CFBundleIdentifier = "com.microsoft.VSCode";
    expect(isInsideCursor()).toBe(false);
  });
});
