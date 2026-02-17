#!/usr/bin/env node
// Claude Notifier — Stop hook script
// Plays a sound and shows an OS notification when Claude finishes.
// Works standalone (CLI/vim) or alongside the VSCode extension.
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const HOOKS_DIR = path.join(process.env.HOME || process.env.USERPROFILE || "~", ".claude", "hooks");
const MUTE_FLAG = path.join(HOOKS_DIR, "claude-notifier-muted");
const IS_WIN = process.platform === "win32";

const SOUNDS = {
  input: {
    darwin: "/System/Library/Sounds/Glass.aiff",
    win32: "C:\\Windows\\Media\\Windows Notify.wav",
  },
  done: {
    darwin: "/System/Library/Sounds/Hero.aiff",
    win32: "C:\\Windows\\Media\\tada.wav",
  },
};

const MESSAGES = {
  input: "Claude is waiting for your input.",
  done: "Claude has finished the task.",
};

function playSound(type) {
  const platform = IS_WIN ? "win32" : "darwin";
  const file = SOUNDS[type]?.[platform];
  if (!file) return;
  try {
    if (IS_WIN) {
      execSync(`powershell -c "(New-Object Media.SoundPlayer '${file}').PlaySync()"`, { stdio: "ignore" });
    } else {
      execSync(`afplay "${file}"`, { stdio: "ignore" });
    }
  } catch {}
}

function showNotification(message) {
  try {
    if (IS_WIN) {
      execSync(`powershell -c "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show('${message}', 'Claude Notifier')"`, { stdio: "ignore", timeout: 5000 });
    } else {
      execSync(`osascript -e 'display notification "${message}" with title "Claude Notifier"'`, { stdio: "ignore" });
    }
  } catch {}
}

let raw = "";
process.stdin.setEncoding("utf-8");
process.stdin.on("data", (chunk) => (raw += chunk));
process.stdin.on("end", () => {
  let input = {};
  try { input = JSON.parse(raw); } catch { process.exit(0); }

  if (input.stop_hook_active) process.exit(0);

  const muted = fs.existsSync(MUTE_FLAG);

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
            if (last.type === "tool_use") {
              reason = "input";
            } else if (last.type === "text" && last.text && last.text.trim().endsWith("?")) {
              reason = "input";
            }
            break;
          }
        } catch {}
      }
    } catch {}
  }

  if (!muted) {
    playSound(reason);
    showNotification(MESSAGES[reason] || MESSAGES.done);
  }

  // Write signal file for VSCode extension (if installed)
  try {
    fs.writeFileSync(path.join(HOOKS_DIR, "claude-signal"), reason + " " + Date.now());
  } catch {}

  process.exit(0);
});
