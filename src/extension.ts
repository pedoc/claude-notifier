import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

const HOME = process.env.HOME || process.env.USERPROFILE || "~";
const CLAUDE_DIR = path.join(HOME, ".claude");
const HOOKS_DIR = path.join(CLAUDE_DIR, "hooks");
const IS_WIN = process.platform === "win32";
const HOOK_EXT = IS_WIN ? ".ps1" : ".js";
const STOP_HOOK = path.join(HOOKS_DIR, `claude-notifier-on-stop${HOOK_EXT}`);
const PERMISSION_HOOK = path.join(HOOKS_DIR, `claude-notifier-on-permission${HOOK_EXT}`);
const QUESTION_HOOK = path.join(HOOKS_DIR, `claude-notifier-on-question${HOOK_EXT}`);
const MUTE_FLAG = path.join(HOOKS_DIR, "claude-notifier-muted");
const SIGNAL_FILE = path.join(HOOKS_DIR, "claude-signal");
const CONFIG_FILE = path.join(HOOKS_DIR, "claude-notifier-config.json");
const SETTINGS_FILE = path.join(CLAUDE_DIR, "settings.json");

function hookCmd(hookPath: string): string {
  if (IS_WIN) {
    return `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${hookPath}"`;
  }
  return `node "${hookPath}"`;
}

const ALL_HOOK_TYPES = ["Stop", "PermissionRequest", "PreToolUse", "Notification"] as const;

let statusBarItem: vscode.StatusBarItem;
let watcher: fs.FSWatcher | null = null;
let soundEnabled = true;

function playRemoteSound() {
  // In remote sessions, webview audio is blocked by Electron's autoplay policy.
  // Use the terminal bell instead — VS Code forwards BEL to the local client.
  // Ensure terminal bell is enabled in VS Code settings.
  const bellConfig = vscode.workspace.getConfiguration("terminal.integrated");
  if (!bellConfig.get<boolean>("enableBell")) {
    bellConfig.update("enableBell", true, vscode.ConfigurationTarget.Global);
  }
  vscode.commands.executeCommand("workbench.action.terminal.sendSequence", {
    text: "\u0007",
  });
}

export function activate(context: vscode.ExtensionContext) {
  setupHooks(context);
  syncConfig();

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

  const configListener = vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration("claudeNotifier")) {
      syncConfig();
    }
  });
  context.subscriptions.push(configListener);

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

function syncConfig() {
  const cfg = vscode.workspace.getConfiguration("claudeNotifier");
  const config = {
    taskCompleted: {
      level: cfg.get<string>("taskCompleted.level", "sound+popup"),
      sound: cfg.get<string>("taskCompleted.sound", "Hero"),
    },
    needsPermission: {
      level: cfg.get<string>("needsPermission.level", "sound+popup"),
      sound: cfg.get<string>("needsPermission.sound", "Glass"),
    },
    asksQuestion: {
      level: cfg.get<string>("asksQuestion.level", "sound+popup"),
      sound: cfg.get<string>("asksQuestion.sound", "Funk"),
    },
  };
  try {
    fs.mkdirSync(HOOKS_DIR, { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + "\n");
  } catch {}
}

function getEventLevel(eventKey: string): string {
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
    return config[eventKey]?.level ?? "sound+popup";
  } catch {
    return "sound+popup";
  }
}

function handleSignal() {
  let content = "";
  try {
    content = fs.readFileSync(SIGNAL_FILE, "utf-8").trim();
  } catch {
    return;
  }

  const reason = content.split(" ")[0];
  // When running on a remote host the extension process is on the server and
  // cannot play audio. VS Code webviews always render in the local renderer, so
  // we synthesize a tone there instead.
  const isRemote = !!vscode.env.remoteName;

  if (reason === "input") {
    const level = getEventLevel("needsPermission");
    if (isRemote && (level === "sound+popup" || level === "sound")) {
      playRemoteSound();
    }
    if (level === "sound+popup" || level === "popup") {
      vscode.window.showInformationMessage("Claude needs your permission.");
    }
  } else if (reason === "question") {
    const level = getEventLevel("asksQuestion");
    if (isRemote && (level === "sound+popup" || level === "sound")) {
      playRemoteSound();
    }
    if (level === "sound+popup" || level === "popup") {
      vscode.window.showInformationMessage("Claude is asking you a question.");
    }
  } else if (reason === "done") {
    const level = getEventLevel("taskCompleted");
    if (isRemote && (level === "sound+popup" || level === "sound")) {
      playRemoteSound();
    }
    if (level === "sound+popup" || level === "popup") {
      vscode.window.showInformationMessage("Claude has finished the task.");
    }
  }
}

// --- Hook lifecycle ---

function setupHooks(context: vscode.ExtensionContext) {
  fs.mkdirSync(HOOKS_DIR, { recursive: true });

  // Copy bundled hook scripts (only if changed)
  for (const [bundled, dest] of [
    [`claude-notifier-on-stop${HOOK_EXT}`, STOP_HOOK],
    [`claude-notifier-on-permission${HOOK_EXT}`, PERMISSION_HOOK],
    [`claude-notifier-on-question${HOOK_EXT}`, QUESTION_HOOK],
  ]) {
    const src = path.join(context.extensionPath, "hook", bundled);
    const srcContent = fs.readFileSync(src, "utf-8");
    let destContent = "";
    try { destContent = fs.readFileSync(dest, "utf-8"); } catch {}
    if (srcContent !== destContent) {
      fs.writeFileSync(dest, srcContent, { mode: 0o755 });
    }
  }

  // Check if our hooks are already configured with the right runner — skip if so
  const settings = readSettings();
  const expectedPrefix = IS_WIN ? "powershell" : "node";
  const hasHook = (type: string, needle: string) =>
    settings.hooks?.[type]?.some((entry: any) =>
      entry.hooks?.some((h: any) => h.command?.includes(needle) && h.command?.startsWith(expectedPrefix))
    );

  if (
    hasHook("Stop", "claude-notifier-on-stop") &&
    hasHook("PermissionRequest", "claude-notifier-on-permission") &&
    hasHook("PreToolUse", "claude-notifier-on-question")
  ) {
    return; // Already configured with correct runner, don't touch settings.json
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
    hooks: [{ type: "command", command: hookCmd(STOP_HOOK) }],
  });

  // PermissionRequest hook — needs permission
  if (!settings.hooks.PermissionRequest) settings.hooks.PermissionRequest = [];
  settings.hooks.PermissionRequest.push({
    hooks: [{ type: "command", command: hookCmd(PERMISSION_HOOK) }],
  });

  // PreToolUse hook — question asked
  if (!settings.hooks.PreToolUse) settings.hooks.PreToolUse = [];
  settings.hooks.PreToolUse.push({
    matcher: "AskUserQuestion",
    hooks: [{ type: "command", command: hookCmd(QUESTION_HOOK) }],
  });

  writeSettings(settings);
}

function teardownHooks() {
  for (const file of [STOP_HOOK, PERMISSION_HOOK, QUESTION_HOOK, SIGNAL_FILE, MUTE_FLAG, CONFIG_FILE]) {
    try { fs.unlinkSync(file); } catch {}
  }
  // Clean up legacy and cross-platform hook files
  for (const name of ["claude-notifier-on-stop", "claude-notifier-on-permission", "claude-notifier-on-question", "claude-notifier-on-notification"]) {
    for (const ext of [".js", ".ps1", ".sh"]) {
      try { fs.unlinkSync(path.join(HOOKS_DIR, `${name}${ext}`)); } catch {}
    }
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
