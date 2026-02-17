import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { execFile, exec } from "child_process";

const HOME = process.env.HOME || process.env.USERPROFILE || "~";
const CLAUDE_DIR = path.join(HOME, ".claude");
const HOOKS_DIR = path.join(CLAUDE_DIR, "hooks");
const SIGNAL_FILE = path.join(HOOKS_DIR, "claude-signal");
const HOOK_SCRIPT = path.join(HOOKS_DIR, "claude-notifier-on-stop.js");
const SETTINGS_FILE = path.join(CLAUDE_DIR, "settings.json");

const IS_WIN = process.platform === "win32";

const SOUNDS: Record<string, { darwin: string; win32: string }> = {
  input: {
    darwin: "/System/Library/Sounds/Glass.aiff",
    win32: "C:\\Windows\\Media\\Windows Notify.wav",
  },
  done: {
    darwin: "/System/Library/Sounds/Hero.aiff",
    win32: "C:\\Windows\\Media\\tada.wav",
  },
};

// Node.js hook script — works on macOS, Windows, and Linux.
const HOOK_SCRIPT_CONTENT = `#!/usr/bin/env node
// Auto-managed by Claude Notifier VSCode extension — do not edit manually.
const fs = require("fs");
const path = require("path");

let raw = "";
process.stdin.setEncoding("utf-8");
process.stdin.on("data", (chunk) => (raw += chunk));
process.stdin.on("end", () => {
  let input = {};
  try { input = JSON.parse(raw); } catch { process.exit(0); }

  if (input.stop_hook_active) process.exit(0);

  let reason = "done";
  const transcript = input.transcript_path || "";

  if (transcript && fs.existsSync(transcript)) {
    try {
      const data = fs.readFileSync(transcript, "utf-8").trim();
      const lines = data.split("\\n").slice(-20);
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

  const signalFile = path.join(__dirname, "claude-signal");
  fs.writeFileSync(signalFile, reason + " " + Date.now());
  process.exit(0);
});
`;

let statusBarItem: vscode.StatusBarItem;
let watcher: fs.FSWatcher | null = null;
let soundEnabled = true;

export function activate(context: vscode.ExtensionContext) {
  setupHook();

  if (!fs.existsSync(SIGNAL_FILE)) {
    fs.writeFileSync(SIGNAL_FILE, "");
  }

  // Status bar
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.command = "claudeNotifier.toggleSound";
  updateStatusBar();
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Toggle command
  const toggleCmd = vscode.commands.registerCommand(
    "claudeNotifier.toggleSound",
    () => {
      soundEnabled = !soundEnabled;
      updateStatusBar();
      vscode.window.showInformationMessage(
        `Claude Notifier sound: ${soundEnabled ? "ON" : "OFF"}`
      );
    }
  );
  context.subscriptions.push(toggleCmd);

  // Watch signal file
  watcher = fs.watch(SIGNAL_FILE, (eventType) => {
    if (eventType === "change") {
      handleSignal();
    }
  });
  context.subscriptions.push({ dispose: () => watcher?.close() });
}

function updateStatusBar() {
  statusBarItem.text = soundEnabled ? "$(unmute) Claude" : "$(mute) Claude";
  statusBarItem.tooltip = `Claude Notifier — sound ${soundEnabled ? "on" : "off"} (click to toggle)`;
}

function handleSignal() {
  let content = "";
  try {
    content = fs.readFileSync(SIGNAL_FILE, "utf-8").trim();
  } catch {
    return;
  }

  const reason = content.split(" ")[0];

  if (reason === "input") {
    vscode.window.showInformationMessage("Claude is waiting for your input.");
    playSound("input");
  } else if (reason === "done") {
    vscode.window.showInformationMessage("Claude has finished the task.");
    playSound("done");
  }
}

function playSound(type: string) {
  if (!soundEnabled) {
    return;
  }

  const platform = process.platform === "win32" ? "win32" : "darwin";
  const soundFile = SOUNDS[type]?.[platform];
  if (!soundFile) {
    return;
  }

  if (IS_WIN) {
    exec(
      `powershell -c "(New-Object Media.SoundPlayer '${soundFile}').PlaySync()"`,
      () => {}
    );
  } else {
    execFile("afplay", [soundFile], () => {});
  }
}

// --- Hook lifecycle ---

function hookCommand(): string {
  return IS_WIN
    ? `node "${HOOK_SCRIPT}"`
    : `node "${HOOK_SCRIPT}"`;
}

function setupHook() {
  fs.mkdirSync(HOOKS_DIR, { recursive: true });
  fs.writeFileSync(HOOK_SCRIPT, HOOK_SCRIPT_CONTENT, { mode: 0o755 });

  const settings = readSettings();
  if (!settings.hooks) {
    settings.hooks = {};
  }
  if (!settings.hooks.Stop) {
    settings.hooks.Stop = [];
  }

  const cmd = hookCommand();

  // Remove any stale entries (old .sh script or current .js script)
  settings.hooks.Stop = settings.hooks.Stop.filter(
    (entry: any) =>
      !entry.hooks?.some(
        (h: any) =>
          h.type === "command" &&
          (h.command === cmd ||
            h.command === HOOK_SCRIPT ||
            h.command.includes("claude-notifier-on-stop"))
      )
  );

  settings.hooks.Stop.push({
    hooks: [{ type: "command", command: cmd }],
  });

  writeSettings(settings);
}

function teardownHook() {
  try { fs.unlinkSync(HOOK_SCRIPT); } catch {}
  try { fs.unlinkSync(SIGNAL_FILE); } catch {}

  // Also clean up legacy .sh script if it exists
  const legacyScript = path.join(HOOKS_DIR, "claude-notifier-on-stop.sh");
  try { fs.unlinkSync(legacyScript); } catch {}

  const settings = readSettings();
  if (settings.hooks?.Stop) {
    settings.hooks.Stop = settings.hooks.Stop.filter(
      (entry: any) =>
        !entry.hooks?.some(
          (h: any) =>
            h.type === "command" &&
            h.command.includes("claude-notifier-on-stop")
        )
    );
    if (settings.hooks.Stop.length === 0) {
      delete settings.hooks.Stop;
    }
    if (Object.keys(settings.hooks).length === 0) {
      delete settings.hooks;
    }
    writeSettings(settings);
  }
}

function readSettings(): any {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function writeSettings(settings: any) {
  fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2) + "\n");
}

export function deactivate() {
  if (watcher) {
    watcher.close();
    watcher = null;
  }
  teardownHook();
}
