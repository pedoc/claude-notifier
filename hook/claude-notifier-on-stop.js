#!/usr/bin/env node
// Claude Notifier — Stop hook script (v3)
// Writes a "done" signal for the VSCode extension to debounce. When no
// extension is active (terminal-only), plays sound/notification directly as
// a fallback. The extension writes a claude-notifier-active marker file so
// the hook knows to defer to it.
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const HOOKS_DIR = path.join(process.env.HOME || process.env.USERPROFILE || "~", ".claude", "hooks");
const MUTE_FLAG = path.join(HOOKS_DIR, "claude-notifier-muted");
const SIGNAL_FILE = path.join(HOOKS_DIR, "claude-signal");
const ACTIVE_FLAG = path.join(HOOKS_DIR, "claude-notifier-active");
const IS_WIN = process.platform === "win32";
const IS_WSL = !IS_WIN && process.platform === "linux" && (() => {
  try { return fs.readFileSync("/proc/version", "utf-8").toLowerCase().includes("microsoft"); } catch { return false; }
})();
const USE_WIN = IS_WIN || IS_WSL;
const PS_BIN = IS_WSL ? "powershell.exe" : "powershell";

const MACOS_SOUNDS = {
  Basso: "/System/Library/Sounds/Basso.aiff", Blow: "/System/Library/Sounds/Blow.aiff",
  Bottle: "/System/Library/Sounds/Bottle.aiff", Frog: "/System/Library/Sounds/Frog.aiff",
  Funk: "/System/Library/Sounds/Funk.aiff", Glass: "/System/Library/Sounds/Glass.aiff",
  Hero: "/System/Library/Sounds/Hero.aiff", Morse: "/System/Library/Sounds/Morse.aiff",
  Ping: "/System/Library/Sounds/Ping.aiff", Pop: "/System/Library/Sounds/Pop.aiff",
  Purr: "/System/Library/Sounds/Purr.aiff", Sosumi: "/System/Library/Sounds/Sosumi.aiff",
  Submarine: "/System/Library/Sounds/Submarine.aiff", Tink: "/System/Library/Sounds/Tink.aiff",
};
const WIN_SOUNDS = {
  "Windows Notify": "C:\\Windows\\Media\\Windows Notify.wav", "tada": "C:\\Windows\\Media\\tada.wav",
  "chimes": "C:\\Windows\\Media\\chimes.wav", "chord": "C:\\Windows\\Media\\chord.wav",
  "ding": "C:\\Windows\\Media\\ding.wav", "notify": "C:\\Windows\\Media\\notify.wav",
  "ringin": "C:\\Windows\\Media\\ringin.wav", "Windows Background": "C:\\Windows\\Media\\Windows Background.wav",
};

function resolveSound(name, defaultMac, defaultWin) {
  if (USE_WIN) return WIN_SOUNDS[name] || defaultWin;
  return MACOS_SOUNDS[name] || defaultMac;
}

function readConfig() {
  try { return JSON.parse(fs.readFileSync(path.join(HOOKS_DIR, "claude-notifier-config.json"), "utf-8")); }
  catch { return null; }
}

let raw = "";
process.stdin.setEncoding("utf-8");
process.stdin.on("data", (chunk) => (raw += chunk));
process.stdin.on("end", () => {
  let input = {};
  try { input = JSON.parse(raw); } catch { process.exit(0); }

  if (input.stop_hook_active) process.exit(0);
  if (fs.existsSync(MUTE_FLAG)) process.exit(0);

  // Write signal for the VSCode extension (which debounces "done" signals).
  try {
    fs.writeFileSync(SIGNAL_FILE, "done " + Date.now());
  } catch {}

  // If the extension is active it handles sound/notification with debounce.
  // Only play directly when running in terminal without the extension.
  if (fs.existsSync(ACTIVE_FLAG)) process.exit(0);

  const config = readConfig();
  const eventCfg = config?.taskCompleted ?? {};
  const level = eventCfg.level ?? "sound+popup";

  if (level === "off") process.exit(0);

  const sound = resolveSound(eventCfg.sound, "/System/Library/Sounds/Hero.aiff", "C:\\Windows\\Media\\tada.wav");

  if (level === "sound+popup" || level === "sound") {
    try {
      if (USE_WIN) {
        const ps = `$s='${sound}'; if(Test-Path $s){(New-Object Media.SoundPlayer $s).PlaySync()}else{[console]::Beep(800,300)}`;
        execSync(`${PS_BIN} -NoProfile -NonInteractive -EncodedCommand ${Buffer.from(ps, "utf16le").toString("base64")}`, { stdio: "ignore", timeout: 5000 });
      } else {
        execSync(`afplay "${sound}"`, { stdio: "ignore" });
      }
    } catch {}
  }

  if (level === "sound+popup" || level === "popup") {
    try {
      if (USE_WIN) {
        const ps = `Add-Type -AssemblyName System.Windows.Forms; $n=New-Object System.Windows.Forms.NotifyIcon; $n.Icon=[System.Drawing.SystemIcons]::Information; $n.Visible=$true; $n.ShowBalloonTip(3000,'Claude Notifier','Claude has finished the task.',[System.Windows.Forms.ToolTipIcon]::None); Start-Sleep -m 500; $n.Dispose()`;
        execSync(`${PS_BIN} -NoProfile -NonInteractive -EncodedCommand ${Buffer.from(ps, "utf16le").toString("base64")}`, { stdio: "ignore", timeout: 5000 });
      } else {
        execSync(`osascript -e 'display notification "Claude has finished the task." with title "Claude Notifier"'`, { stdio: "ignore" });
      }
    } catch {}
  }

  process.exit(0);
});
