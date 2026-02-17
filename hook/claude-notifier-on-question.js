#!/usr/bin/env node
// Claude Notifier — PreToolUse hook for AskUserQuestion
// Plays the Funk sound when Claude asks the user a question.
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const HOOKS_DIR = path.join(process.env.HOME || process.env.USERPROFILE || "~", ".claude", "hooks");
const MUTE_FLAG = path.join(HOOKS_DIR, "claude-notifier-muted");
const IS_WIN = process.platform === "win32";

const SOUND = IS_WIN
  ? "C:\\Windows\\Media\\Windows Notify.wav"
  : "/System/Library/Sounds/Funk.aiff";

let raw = "";
process.stdin.setEncoding("utf-8");
process.stdin.on("data", (chunk) => (raw += chunk));
process.stdin.on("end", () => {
  let input = {};
  try { input = JSON.parse(raw); } catch { process.exit(0); }

  if (fs.existsSync(MUTE_FLAG)) process.exit(0);

  // Play sound
  try {
    if (IS_WIN) {
      execSync(`powershell -c "(New-Object Media.SoundPlayer '${SOUND}').PlaySync()"`, { stdio: "ignore" });
    } else {
      execSync(`afplay "${SOUND}"`, { stdio: "ignore" });
    }
  } catch {}

  // OS notification
  try {
    if (IS_WIN) {
      execSync(`powershell -c "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show('Claude is asking you a question.', 'Claude Notifier')"`, { stdio: "ignore", timeout: 5000 });
    } else {
      execSync(`osascript -e 'display notification "Claude is asking you a question." with title "Claude Notifier"'`, { stdio: "ignore" });
    }
  } catch {}

  // Write signal for VSCode extension
  try {
    fs.writeFileSync(path.join(HOOKS_DIR, "claude-signal"), "question " + Date.now());
  } catch {}

  process.exit(0);
});
