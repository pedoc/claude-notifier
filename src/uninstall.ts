// Runs on extension uninstall to clean up Claude Code hooks.
import * as fs from "fs";
import * as path from "path";

const HOME = process.env.HOME || process.env.USERPROFILE || "~";
const CLAUDE_DIR = path.join(HOME, ".claude");
const HOOKS_DIR = path.join(CLAUDE_DIR, "hooks");
const SETTINGS_FILE = path.join(CLAUDE_DIR, "settings.json");

// Remove hook script (both .js and legacy .sh) and signal file
for (const file of [
  "claude-notifier-on-stop.js",
  "claude-notifier-on-stop.sh",
  "claude-signal",
]) {
  try { fs.unlinkSync(path.join(HOOKS_DIR, file)); } catch {}
}

// Remove our entry from Claude settings
try {
  const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8"));
  if (settings.hooks?.Stop) {
    settings.hooks.Stop = settings.hooks.Stop.filter(
      (entry: any) =>
        !entry.hooks?.some(
          (h: any) =>
            h.type === "command" &&
            h.command.includes("claude-notifier-on-stop")
        )
    );
    if (settings.hooks.Stop.length === 0) delete settings.hooks.Stop;
    if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2) + "\n");
  }
} catch {}
