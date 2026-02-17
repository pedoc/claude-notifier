#!/usr/bin/env node
// Claude Notifier — Stop hook script
// Plays "task completed" or "question asked" sound when Claude finishes.
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const HOOKS_DIR = path.join(process.env.HOME || process.env.USERPROFILE || "~", ".claude", "hooks");
const MUTE_FLAG = path.join(HOOKS_DIR, "claude-notifier-muted");
const IS_WIN = process.platform === "win32";

const SOUNDS = {
  question: IS_WIN ? "C:\\Windows\\Media\\Windows Notify.wav" : "/System/Library/Sounds/Pop.aiff",
  done: IS_WIN ? "C:\\Windows\\Media\\tada.wav" : "/System/Library/Sounds/Hero.aiff",
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
    if (IS_WIN) {
      execSync(`powershell -c "(New-Object Media.SoundPlayer '${sound}').PlaySync()"`, { stdio: "ignore" });
    } else {
      execSync(`afplay "${sound}"`, { stdio: "ignore" });
    }
  } catch {}

  // OS notification
  const message = MESSAGES[reason];
  try {
    if (IS_WIN) {
      execSync(`powershell -c "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show('${message}', 'Claude Notifier')"`, { stdio: "ignore", timeout: 5000 });
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
