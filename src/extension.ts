import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

const HOME = process.env.HOME || process.env.USERPROFILE || "~";
const CLAUDE_DIR = path.join(HOME, ".claude");
const HOOKS_DIR = path.join(CLAUDE_DIR, "hooks");
const HOOK_SCRIPT = path.join(HOOKS_DIR, "claude-notifier-on-stop.js");
const MUTE_FLAG = path.join(HOOKS_DIR, "claude-notifier-muted");
const SIGNAL_FILE = path.join(HOOKS_DIR, "claude-signal");
const SETTINGS_FILE = path.join(CLAUDE_DIR, "settings.json");

let statusBarItem: vscode.StatusBarItem;
let watcher: fs.FSWatcher | null = null;
let soundEnabled = true;

export function activate(context: vscode.ExtensionContext) {
  setupHook(context);

  // Sync mute state from flag file
  soundEnabled = !fs.existsSync(MUTE_FLAG);

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

  // Toggle command — writes/removes mute flag so the hook script respects it
  const toggleCmd = vscode.commands.registerCommand(
    "claudeNotifier.toggleSound",
    () => {
      soundEnabled = !soundEnabled;
      if (soundEnabled) {
        try { fs.unlinkSync(MUTE_FLAG); } catch {}
      } else {
        fs.writeFileSync(MUTE_FLAG, "");
      }
      updateStatusBar();
      vscode.window.showInformationMessage(
        `Claude Notifier sound: ${soundEnabled ? "ON" : "OFF"}`
      );
    }
  );
  context.subscriptions.push(toggleCmd);

  // Watch signal file for VSCode notification toasts
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

  // Only show VSCode toast — sound + OS notification already handled by the hook
  if (reason === "input") {
    vscode.window.showInformationMessage("Claude is waiting for your input.");
  } else if (reason === "done") {
    vscode.window.showInformationMessage("Claude has finished the task.");
  }
}

// --- Hook lifecycle ---

function setupHook(context: vscode.ExtensionContext) {
  fs.mkdirSync(HOOKS_DIR, { recursive: true });

  // Copy the bundled hook script to the Claude hooks directory
  const bundledHook = path.join(context.extensionPath, "hook", "claude-notifier-on-stop.js");
  fs.copyFileSync(bundledHook, HOOK_SCRIPT);
  fs.chmodSync(HOOK_SCRIPT, 0o755);

  const cmd = `node "${HOOK_SCRIPT}"`;
  const settings = readSettings();
  if (!settings.hooks) {
    settings.hooks = {};
  }
  if (!settings.hooks.Stop) {
    settings.hooks.Stop = [];
  }

  // Remove any stale entries
  settings.hooks.Stop = settings.hooks.Stop.filter(
    (entry: any) =>
      !entry.hooks?.some(
        (h: any) =>
          h.type === "command" &&
          h.command.includes("claude-notifier-on-stop")
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
  try { fs.unlinkSync(MUTE_FLAG); } catch {}

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
