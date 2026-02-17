import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

const HOME = process.env.HOME || process.env.USERPROFILE || "~";
const CLAUDE_DIR = path.join(HOME, ".claude");
const HOOKS_DIR = path.join(CLAUDE_DIR, "hooks");
const STOP_HOOK = path.join(HOOKS_DIR, "claude-notifier-on-stop.js");
const PERMISSION_HOOK = path.join(HOOKS_DIR, "claude-notifier-on-permission.js");
const QUESTION_HOOK = path.join(HOOKS_DIR, "claude-notifier-on-question.js");
const MUTE_FLAG = path.join(HOOKS_DIR, "claude-notifier-muted");
const SIGNAL_FILE = path.join(HOOKS_DIR, "claude-signal");
const SETTINGS_FILE = path.join(CLAUDE_DIR, "settings.json");

const ALL_HOOK_TYPES = ["Stop", "PermissionRequest", "PreToolUse", "Notification"] as const;

let statusBarItem: vscode.StatusBarItem;
let watcher: fs.FSWatcher | null = null;
let soundEnabled = true;

export function activate(context: vscode.ExtensionContext) {
  setupHooks(context);

  soundEnabled = !fs.existsSync(MUTE_FLAG);

  if (!fs.existsSync(SIGNAL_FILE)) {
    fs.writeFileSync(SIGNAL_FILE, "");
  }

  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.command = "claudeNotifier.toggleSound";
  updateStatusBar();
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

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
    vscode.window.showInformationMessage("Claude needs your permission.");
  } else if (reason === "question") {
    vscode.window.showInformationMessage("Claude is asking you a question.");
  } else if (reason === "done") {
    vscode.window.showInformationMessage("Claude has finished the task.");
  }
}

// --- Hook lifecycle ---

function setupHooks(context: vscode.ExtensionContext) {
  fs.mkdirSync(HOOKS_DIR, { recursive: true });

  // Copy bundled hook scripts (only if changed)
  for (const [bundled, dest] of [
    ["claude-notifier-on-stop.js", STOP_HOOK],
    ["claude-notifier-on-permission.js", PERMISSION_HOOK],
    ["claude-notifier-on-question.js", QUESTION_HOOK],
  ]) {
    const src = path.join(context.extensionPath, "hook", bundled);
    const srcContent = fs.readFileSync(src, "utf-8");
    let destContent = "";
    try { destContent = fs.readFileSync(dest, "utf-8"); } catch {}
    if (srcContent !== destContent) {
      fs.writeFileSync(dest, srcContent, { mode: 0o755 });
    }
  }

  // Check if our hooks are already configured — skip settings write if so
  const settings = readSettings();
  const hasHook = (type: string, needle: string) =>
    settings.hooks?.[type]?.some((entry: any) =>
      entry.hooks?.some((h: any) => h.command?.includes(needle))
    );

  if (
    hasHook("Stop", "claude-notifier-on-stop") &&
    hasHook("PermissionRequest", "claude-notifier-on-permission") &&
    hasHook("PreToolUse", "claude-notifier-on-question")
  ) {
    return; // Already configured, don't touch settings.json
  }

  if (!settings.hooks) {
    settings.hooks = {};
  }

  // Remove stale claude-notifier entries
  for (const hookType of ALL_HOOK_TYPES) {
    if (settings.hooks[hookType]) {
      settings.hooks[hookType] = settings.hooks[hookType].filter(
        (entry: any) => !entry.hooks?.some((h: any) => h.command?.includes("claude-notifier"))
      );
      if (settings.hooks[hookType].length === 0) {
        delete settings.hooks[hookType];
      }
    }
  }

  // Stop hook — task completed
  if (!settings.hooks.Stop) settings.hooks.Stop = [];
  settings.hooks.Stop.push({
    hooks: [{ type: "command", command: `node "${STOP_HOOK}"` }],
  });

  // PermissionRequest hook — needs permission
  if (!settings.hooks.PermissionRequest) settings.hooks.PermissionRequest = [];
  settings.hooks.PermissionRequest.push({
    hooks: [{ type: "command", command: `node "${PERMISSION_HOOK}"` }],
  });

  // PreToolUse hook — question asked
  if (!settings.hooks.PreToolUse) settings.hooks.PreToolUse = [];
  settings.hooks.PreToolUse.push({
    matcher: "AskUserQuestion",
    hooks: [{ type: "command", command: `node "${QUESTION_HOOK}"` }],
  });

  writeSettings(settings);
}

function teardownHooks() {
  for (const file of [STOP_HOOK, PERMISSION_HOOK, QUESTION_HOOK, SIGNAL_FILE, MUTE_FLAG]) {
    try { fs.unlinkSync(file); } catch {}
  }
  for (const legacy of ["claude-notifier-on-stop.sh", "claude-notifier-on-notification.js"]) {
    try { fs.unlinkSync(path.join(HOOKS_DIR, legacy)); } catch {}
  }

  const settings = readSettings();
  for (const hookType of ALL_HOOK_TYPES) {
    if (settings.hooks?.[hookType]) {
      settings.hooks[hookType] = settings.hooks[hookType].filter(
        (entry: any) => !entry.hooks?.some((h: any) => h.command?.includes("claude-notifier"))
      );
      if (settings.hooks[hookType].length === 0) {
        delete settings.hooks[hookType];
      }
    }
  }
  if (settings.hooks && Object.keys(settings.hooks).length === 0) {
    delete settings.hooks;
  }
  writeSettings(settings);
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
  teardownHooks();
}
