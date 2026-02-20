#!/usr/bin/env node
// Claude Notifier — Notification hook script
// Plays the "needs input" sound when Claude needs permission.
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const HOOKS_DIR = path.join(process.env.HOME || process.env.USERPROFILE || "~", ".claude", "hooks");
const MUTE_FLAG = path.join(HOOKS_DIR, "claude-notifier-muted");
const IS_WIN = process.platform === "win32";
const IS_WSL = !IS_WIN && process.platform === "linux" && (() => {
  try { return fs.readFileSync("/proc/version", "utf-8").toLowerCase().includes("microsoft"); } catch { return false; }
})();
const USE_WIN = IS_WIN || IS_WSL;
const PS_BIN = IS_WSL ? "powershell.exe" : "powershell";

const SOUND = USE_WIN
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
    if (USE_WIN) {
      const ps = `$s='${SOUND}'; if(Test-Path $s){(New-Object Media.SoundPlayer $s).PlaySync()}else{[console]::Beep(800,300)}`;
      execSync(`${PS_BIN} -NoProfile -NonInteractive -EncodedCommand ${Buffer.from(ps, "utf16le").toString("base64")}`, { stdio: "ignore", timeout: 5000 });
    } else {
      execSync(`afplay "${SOUND}"`, { stdio: "ignore" });
    }
  } catch {}

  // OS notification
  try {
    const message = input.message || "Claude needs your permission.";
    if (USE_WIN) {
      const safeMsg = message.replace(/'/g, "''");
      const ps = `Add-Type -AssemblyName System.Windows.Forms; $n=New-Object System.Windows.Forms.NotifyIcon; $n.Icon=[System.Drawing.SystemIcons]::Information; $n.Visible=$true; $n.ShowBalloonTip(3000,'Claude Notifier','${safeMsg}',[System.Windows.Forms.ToolTipIcon]::None); Start-Sleep -m 500; $n.Dispose()`;
      execSync(`${PS_BIN} -NoProfile -NonInteractive -EncodedCommand ${Buffer.from(ps, "utf16le").toString("base64")}`, { stdio: "ignore", timeout: 5000 });
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
