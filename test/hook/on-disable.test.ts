import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { tmpHome, runHook, readSignal, hookScript } from "./_helpers";

// CLAUDE_NOTIFIER_DISABLE is a per-session opt-out: when set, every hook must
// exit silently without writing a signal, playing sound, or showing a popup —
// even on the terminal-fallback path (no active extension marker is created
// here, so the hooks would otherwise fall through to direct playback).
const CASES = [
  { name: "claude-notifier-on-stop", stdin: { session_id: "s-1", cwd: "/tmp/x" } },
  { name: "claude-notifier-on-subagent-stop", stdin: { session_id: "s-1", cwd: "/tmp/x" } },
  { name: "claude-notifier-on-prompt", stdin: { session_id: "s-1" } },
  {
    name: "claude-notifier-on-permission",
    stdin: { session_id: "s-1", tool_name: "Bash", cwd: "/tmp/x" },
  },
  {
    name: "claude-notifier-on-question",
    stdin: { session_id: "s-1", tool_name: "AskUserQuestion", cwd: "/tmp/x" },
  },
  {
    name: "claude-notifier-on-notification",
    stdin: { session_id: "s-1", notification_type: "permission_prompt" },
  },
];

describe("hooks: CLAUDE_NOTIFIER_DISABLE", () => {
  let home: ReturnType<typeof tmpHome>;
  beforeEach(() => (home = tmpHome()));
  afterEach(() => home.dispose());

  for (const c of CASES) {
    it(`${c.name}: exits 0 with no signal when disabled`, () => {
      const res = runHook(hookScript(c.name), c.stdin, home.root, {
        extraEnv: { CLAUDE_NOTIFIER_DISABLE: "1" },
      });
      expect(res.status).toBe(0);
      expect(readSignal(home.signalFile)).toBe("");
      // Fast exit confirms no sound spawn was attempted.
      expect(res.durationMs).toBeLessThan(500);
    });

    it(`${c.name}: CLAUDE_NOTIFIER_DISABLE=0 does not suppress (signal still written)`, () => {
      const res = runHook(hookScript(c.name), c.stdin, home.root, {
        extraEnv: { CLAUDE_NOTIFIER_DISABLE: "0" },
      });
      expect(res.status).toBe(0);
      expect(readSignal(home.signalFile)).not.toBe("");
    });
  }
});
