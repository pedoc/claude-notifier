import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { execFile } from "child_process";

const SIGNAL_FILE = path.join(
  process.env.HOME || "~",
  ".claude",
  "hooks",
  "claude-signal"
);

const SOUNDS = {
  input: "/System/Library/Sounds/Glass.aiff", // needs user input / permission
  done: "/System/Library/Sounds/Hero.aiff", // task completed
};

let statusBarItem: vscode.StatusBarItem;
let watcher: fs.FSWatcher | null = null;
let soundEnabled = true;

export function activate(context: vscode.ExtensionContext) {
  const signalDir = path.dirname(SIGNAL_FILE);
  if (!fs.existsSync(signalDir)) {
    fs.mkdirSync(signalDir, { recursive: true });
  }
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

  // Signal file format: "input <timestamp>" or "done <timestamp>"
  const reason = content.split(" ")[0];

  if (reason === "input") {
    vscode.window.showInformationMessage(
      "Claude is waiting for your input."
    );
    playSound(SOUNDS.input);
  } else if (reason === "done") {
    vscode.window.showInformationMessage(
      "Claude has finished the task."
    );
    playSound(SOUNDS.done);
  }
}

function playSound(soundFile: string) {
  if (!soundEnabled) {
    return;
  }
  execFile("afplay", [soundFile], (err) => {
    if (err) {
      vscode.window.showWarningMessage(
        "Claude Notifier: could not play sound."
      );
    }
  });
}

export function deactivate() {
  if (watcher) {
    watcher.close();
    watcher = null;
  }
}
