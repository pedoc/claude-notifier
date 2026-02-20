#!/usr/bin/env node
// Claude Notifier — Stop hook script
// Plays "task completed" or "question asked" sound when Claude finishes.
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

const SOUNDS = {
  question: USE_WIN ? "C:\\Windows\\Media\\Windows Notify.wav" : "/System/Library/Sounds/Pop.aiff",
  done: USE_WIN ? "C:\\Windows\\Media\\tada.wav" : "/System/Library/Sounds/Hero.aiff",
};

const MESSAGES = {
  question: "Claude is asking you a question.",
  done: "Claude has finished the task.",
};

let raw = "";
process.stdin.setEncoding("utf-8");
process.stdin.on("data", (chunk) => (raw += chunk));
process.stdin.on("end", () => {
  let input = {};
  try { input = JSON.parse(raw); } catch { process.exit(0); }

  if (input.stop_hook_active) process.exit(0);
  if (fs.existsSync(MUTE_FLAG)) process.exit(0);

  let reason = "done";
  const transcript = input.transcript_path || "";

  if (transcript && fs.existsSync(transcript)) {
    try {
      const data = fs.readFileSync(transcript, "utf-8").trim();
      const lines = data.split("\n").slice(-20);
      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const msg = JSON.parse(lines[i]);
          if (msg.role === "assistant" && Array.isArray(msg.content) && msg.content.length > 0) {
            const last = msg.content[msg.content.length - 1];
            // Check if Claude used AskUserQuestion
            if (last.type === "tool_use" && last.name === "AskUserQuestion") {
              reason = "question";
            }
            // Check if the text response ends with a question
            else if (last.type === "text" && last.text && last.text.trim().endsWith("?")) {
              reason = "question";
            }
            break;
          }
        } catch {}
      }
    } catch {}
  }

  // Play sound
  const sound = SOUNDS[reason];
  try {
    if (USE_WIN) {
      const ps = `$s='${sound}'; if(Test-Path $s){(New-Object Media.SoundPlayer $s).PlaySync()}else{[console]::Beep(800,300)}`;
      execSync(`${PS_BIN} -NoProfile -NonInteractive -EncodedCommand ${Buffer.from(ps, "utf16le").toString("base64")}`, { stdio: "ignore", timeout: 5000 });
    } else {
      execSync(`afplay "${sound}"`, { stdio: "ignore" });
    }
  } catch {}

  // OS notification
  const message = MESSAGES[reason];
  try {
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
    fs.writeFileSync(path.join(HOOKS_DIR, "claude-signal"), reason + " " + Date.now());
  } catch {}

  process.exit(0);
});
