import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { execFile, execSync } from "child_process";

const HOME = process.env.HOME || "~";
const CLAUDE_DIR = path.join(HOME, ".claude");
const HOOKS_DIR = path.join(CLAUDE_DIR, "hooks");
const SIGNAL_FILE = path.join(HOOKS_DIR, "claude-signal");
const HOOK_SCRIPT = path.join(HOOKS_DIR, "claude-notifier-on-stop.sh");
const SETTINGS_FILE = path.join(CLAUDE_DIR, "settings.json");

const SOUNDS = {
  input: "/System/Library/Sounds/Glass.aiff",
  done: "/System/Library/Sounds/Hero.aiff",
};

const HOOK_SCRIPT_CONTENT = `#!/bin/bash
# Auto-managed by Claude Notifier VSCode extension — do not edit manually.

INPUT=$(cat)
STOP_HOOK_ACTIVE=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('stop_hook_active', False))" 2>/dev/null)

if [ "$STOP_HOOK_ACTIVE" = "True" ]; then
  exit 0
fi

TRANSCRIPT=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('transcript_path', ''))" 2>/dev/null)

REASON="done"

if [ -n "$TRANSCRIPT" ] && [ -f "$TRANSCRIPT" ]; then
  LAST_MSG=$(tail -20 "$TRANSCRIPT" | python3 -c "
import sys, json
lines = sys.stdin.read().strip().split('\\n')
for line in reversed(lines):
    try:
        msg = json.loads(line)
        if msg.get('role') == 'assistant':
            content = msg.get('content', [])
            if isinstance(content, list) and len(content) > 0:
                last_block = content[-1]
                if last_block.get('type') == 'tool_use':
                    print('input')
                elif last_block.get('type') == 'text':
                    text = last_block.get('text', '')
                    if text.strip().endswith('?'):
                        print('input')
                    else:
                        print('done')
                else:
                    print('done')
            else:
                print('done')
            break
    except:
        continue
else:
    print('done')
" 2>/dev/null)

  if [ -n "$LAST_MSG" ]; then
    REASON="$LAST_MSG"
  fi
fi

echo "$REASON $(date +%s)" > ~/.claude/hooks/claude-signal
exit 0
`;

const HOOK_ENTRY = {
  hooks: [
    {
      type: "command",
      command: HOOK_SCRIPT,
    },
  ],
};

let statusBarItem: vscode.StatusBarItem;
let watcher: fs.FSWatcher | null = null;
let soundEnabled = true;

export function activate(context: vscode.ExtensionContext) {
  setupHook();

  // Ensure signal file exists
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
    playSound(SOUNDS.input);
  } else if (reason === "done") {
    vscode.window.showInformationMessage("Claude has finished the task.");
    playSound(SOUNDS.done);
  }
}

function playSound(soundFile: string) {
  if (!soundEnabled) {
    return;
  }
  execFile("afplay", [soundFile], () => {});
}

// --- Hook lifecycle ---

function setupHook() {
  // Create hook script
  fs.mkdirSync(HOOKS_DIR, { recursive: true });
  fs.writeFileSync(HOOK_SCRIPT, HOOK_SCRIPT_CONTENT, { mode: 0o755 });

  // Add hook to Claude settings
  const settings = readSettings();
  if (!settings.hooks) {
    settings.hooks = {};
  }
  if (!settings.hooks.Stop) {
    settings.hooks.Stop = [];
  }

  const alreadyInstalled = settings.hooks.Stop.some((entry: any) =>
    entry.hooks?.some(
      (h: any) => h.type === "command" && h.command === HOOK_SCRIPT
    )
  );

  if (!alreadyInstalled) {
    settings.hooks.Stop.push(HOOK_ENTRY);
    writeSettings(settings);
  }
}

function teardownHook() {
  // Remove hook script
  try {
    fs.unlinkSync(HOOK_SCRIPT);
  } catch {}

  // Remove signal file
  try {
    fs.unlinkSync(SIGNAL_FILE);
  } catch {}

  // Remove our entry from Claude settings
  const settings = readSettings();
  if (settings.hooks?.Stop) {
    settings.hooks.Stop = settings.hooks.Stop.filter(
      (entry: any) =>
        !entry.hooks?.some(
          (h: any) => h.type === "command" && h.command === HOOK_SCRIPT
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
