#!/usr/bin/env node
// Claude Notifier — Notification hook script
// Plays the "needs input" sound when Claude needs permission.
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const HOOKS_DIR = path.join(process.env.HOME || process.env.USERPROFILE || "~", ".claude", "hooks");
const MUTE_FLAG = path.join(HOOKS_DIR, "claude-notifier-muted");
const IS_WIN = process.platform === "win32";

const SOUND = IS_WIN
  ? "C:\\Windows\\Media\\Windows Notify.wav"
  : "/System/Library/Sounds/Glass.aiff";

let raw = "";
process.stdin.setEncoding("utf-8");
process.stdin.on("data", (chunk) => (raw += chunk));
process.stdin.on("end", () => {
  let input = {};
  try { input = JSON.parse(raw); } catch { process.exit(0); }

  if (input.notification_type !== "permission_prompt") process.exit(0);
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
    const message = input.message || "Claude needs your permission.";
    if (IS_WIN) {
      execSync(`powershell -c "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show('${message}', 'Claude Notifier')"`, { stdio: "ignore", timeout: 5000 });
    } else {
      execSync(`osascript -e 'display notification "${message}" with title "Claude Notifier"'`, { stdio: "ignore" });
    }
  } catch {}

  // Write signal for VSCode extension
  try {
    fs.writeFileSync(path.join(HOOKS_DIR, "claude-signal"), "input " + Date.now());
  } catch {}

  process.exit(0);
});
