import * as fs from "fs";
import * as path from "path";

const HOME = process.env.HOME || process.env.USERPROFILE || "~";
const CLAUDE_DIR = path.join(HOME, ".claude");
const HOOKS_DIR = path.join(CLAUDE_DIR, "hooks");
const SETTINGS_FILE = path.join(CLAUDE_DIR, "settings.json");

for (const name of [
  "claude-notifier-on-stop",
  "claude-notifier-on-permission",
  "claude-notifier-on-question",
  "claude-notifier-on-notification",
]) {
  for (const ext of [".js", ".ps1", ".sh"]) {
    try { fs.unlinkSync(path.join(HOOKS_DIR, `${name}${ext}`)); } catch {}
  }
}
for (const file of ["claude-notifier-muted", "claude-signal", "claude-notifier-config.json", "notifier-target", ".claude-notifier-stamp"]) {
  try { fs.unlinkSync(path.join(HOOKS_DIR, file)); } catch {}
}
// Older versions shipped a generated AppleScript shim — remove if present.
try { fs.rmSync(path.join(HOOKS_DIR, "ClaudeNotifier.app"), { recursive: true, force: true }); } catch {}

try {
  const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8"));
  for (const hookType of ["Stop", "PermissionRequest", "PreToolUse", "Notification"]) {
    if (settings.hooks?.[hookType]) {
      settings.hooks[hookType] = settings.hooks[hookType].filter(
        (entry: any) => !entry.hooks?.some((h: any) => h.command?.includes("claude-notifier"))
      );
      if (settings.hooks[hookType].length === 0) delete settings.hooks[hookType];
    }
  }
  if (settings.hooks && Object.keys(settings.hooks).length === 0) delete settings.hooks;
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2) + "\n");
} catch {}
