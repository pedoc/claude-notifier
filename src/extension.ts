import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { exec } from "child_process";

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
const ACTIVE_FLAG = path.join(HOOKS_DIR, "claude-notifier-active");
const CONFIG_FILE = path.join(HOOKS_DIR, "claude-notifier-config.json");
const SETTINGS_FILE = path.join(CLAUDE_DIR, "settings.json");

const MACOS_SOUNDS: Record<string, string> = {
  Basso: "/System/Library/Sounds/Basso.aiff", Blow: "/System/Library/Sounds/Blow.aiff",
  Bottle: "/System/Library/Sounds/Bottle.aiff", Frog: "/System/Library/Sounds/Frog.aiff",
  Funk: "/System/Library/Sounds/Funk.aiff", Glass: "/System/Library/Sounds/Glass.aiff",
  Hero: "/System/Library/Sounds/Hero.aiff", Morse: "/System/Library/Sounds/Morse.aiff",
  Ping: "/System/Library/Sounds/Ping.aiff", Pop: "/System/Library/Sounds/Pop.aiff",
  Purr: "/System/Library/Sounds/Purr.aiff", Sosumi: "/System/Library/Sounds/Sosumi.aiff",
  Submarine: "/System/Library/Sounds/Submarine.aiff", Tink: "/System/Library/Sounds/Tink.aiff",
};
const WIN_SOUNDS: Record<string, string> = {
  "Windows Notify": "C:\\Windows\\Media\\Windows Notify.wav", "tada": "C:\\Windows\\Media\\tada.wav",
  "chimes": "C:\\Windows\\Media\\chimes.wav", "chord": "C:\\Windows\\Media\\chord.wav",
  "ding": "C:\\Windows\\Media\\ding.wav", "notify": "C:\\Windows\\Media\\notify.wav",
  "ringin": "C:\\Windows\\Media\\ringin.wav", "Windows Background": "C:\\Windows\\Media\\Windows Background.wav",
};

function playLocalSound(soundName: string, defaultMac: string, defaultWin: string) {
  if (IS_WIN) {
    const soundPath = WIN_SOUNDS[soundName] || defaultWin;
    const ps = `$s='${soundPath}'; if(Test-Path $s){(New-Object Media.SoundPlayer $s).PlaySync()}else{[console]::Beep(800,300)}`;
    exec(`powershell -NoProfile -NonInteractive -EncodedCommand ${Buffer.from(ps, "utf16le").toString("base64")}`, { timeout: 5000 });
  } else {
    const soundPath = MACOS_SOUNDS[soundName] || defaultMac;
    exec(`afplay "${soundPath}"`);
  }
}

function showLocalNotification(message: string) {
  if (IS_WIN) {
    const safeMsg = message.replace(/'/g, "''");
    const ps = `Add-Type -AssemblyName System.Windows.Forms; $n=New-Object System.Windows.Forms.NotifyIcon; $n.Icon=[System.Drawing.SystemIcons]::Information; $n.Visible=$true; $n.ShowBalloonTip(3000,'Claude Notifier','${safeMsg}',[System.Windows.Forms.ToolTipIcon]::None); Start-Sleep -m 500; $n.Dispose()`;
    exec(`powershell -NoProfile -NonInteractive -EncodedCommand ${Buffer.from(ps, "utf16le").toString("base64")}`, { timeout: 5000 });
  } else {
    exec(`osascript -e 'display notification "${message}" with title "Claude Notifier"'`);
  }
}

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
let doneDebounceTimer: ReturnType<typeof setTimeout> | null = null;

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

  // Signal to hook scripts that the extension is running and will handle
  // "done" sound/notification with debounce. Without this flag, hooks play
  // sounds directly as a fallback for terminal-only users.
  try { fs.writeFileSync(ACTIVE_FLAG, String(process.pid)); } catch {}

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

function getEventConfig(eventKey: string): { level: string; sound: string } {
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
    return {
      level: config[eventKey]?.level ?? "sound+popup",
      sound: config[eventKey]?.sound ?? "",
    };
  } catch {
    return { level: "sound+popup", sound: "" };
  }
}

function getEventLevel(eventKey: string): string {
  return getEventConfig(eventKey).level;
}

function handleSignal() {
  let content = "";
  try {
    content = fs.readFileSync(SIGNAL_FILE, "utf-8").trim();
  } catch {
    return;
  }

  const reason = content.split(" ")[0];

  if (reason === "done") {
    // Debounce "done" signals — Claude fires Stop hooks between subtasks.
    // Only notify after 3 seconds of silence (no new signals).
    if (doneDebounceTimer) clearTimeout(doneDebounceTimer);
    doneDebounceTimer = setTimeout(() => {
      doneDebounceTimer = null;
      showNotification("done");
    }, 3000);
  } else {
    // "question" and "input" signals are immediate — user action is needed.
    // Cancel any pending "done" notification (the stop after a question is expected).
    if (doneDebounceTimer) {
      clearTimeout(doneDebounceTimer);
      doneDebounceTimer = null;
    }
    if (reason === "input" || reason === "question") {
      showNotification(reason);
    }
  }
}

function showNotification(reason: string) {
  // Architecture note: "question" and "input" local sounds are played by their
  // respective hook scripts (PreToolUse / PermissionRequest) — not the extension.
  // Only "done" local sounds are played here, because the extension debounces them.
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
    if (level === "sound+popup" || level === "sound") {
      if (isRemote) {
        playRemoteSound();
      } else {
        const cfg = getEventConfig("taskCompleted");
        playLocalSound(cfg.sound, "/System/Library/Sounds/Hero.aiff", "C:\\Windows\\Media\\tada.wav");
      }
    }
    if (level === "sound+popup" || level === "popup") {
      vscode.window.showInformationMessage("Claude has finished the task.");
      if (!isRemote) {
        showLocalNotification("Claude has finished the task.");
      }
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
  const hasHook = (type: string, needle: string, matcher?: string) =>
    settings.hooks?.[type]?.some((entry: any) =>
      (matcher === undefined || entry.matcher === matcher) &&
      entry.hooks?.some((h: any) => h.command?.includes(needle) && h.command?.startsWith(expectedPrefix))
    );

  if (
    hasHook("Stop", "claude-notifier-on-stop") &&
    hasHook("PermissionRequest", "claude-notifier-on-permission") &&
    hasHook("PreToolUse", "claude-notifier-on-question", "AskUserQuestion")
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
  for (const file of [STOP_HOOK, PERMISSION_HOOK, QUESTION_HOOK, SIGNAL_FILE, MUTE_FLAG, CONFIG_FILE, ACTIVE_FLAG]) {
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
  try { fs.unlinkSync(ACTIVE_FLAG); } catch {}
  teardownHooks();
}
