// Runs on extension uninstall to clean up Claude Code hooks.
import * as fs from "fs";
import * as path from "path";

const HOME = process.env.HOME || "~";
const CLAUDE_DIR = path.join(HOME, ".claude");
const HOOKS_DIR = path.join(CLAUDE_DIR, "hooks");
const HOOK_SCRIPT = path.join(HOOKS_DIR, "claude-notifier-on-stop.sh");
const SIGNAL_FILE = path.join(HOOKS_DIR, "claude-signal");
const SETTINGS_FILE = path.join(CLAUDE_DIR, "settings.json");

// Remove hook script and signal file
try { fs.unlinkSync(HOOK_SCRIPT); } catch {}
try { fs.unlinkSync(SIGNAL_FILE); } catch {}

// Remove our entry from Claude settings
try {
  const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8"));
  if (settings.hooks?.Stop) {
    settings.hooks.Stop = settings.hooks.Stop.filter(
      (entry: any) =>
        !entry.hooks?.some(
          (h: any) => h.type === "command" && h.command === HOOK_SCRIPT
        )
    );
    if (settings.hooks.Stop.length === 0) delete settings.hooks.Stop;
    if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2) + "\n");
  }
} catch {}
