const fs = require("fs");
const { CONFIG_FILE, MUTE_FLAG } = require("./paths");

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
  } catch {
    return null;
  }
}

function isMuted() {
  return fs.existsSync(MUTE_FLAG);
}

// Per-session opt-out: set CLAUDE_NOTIFIER_DISABLE in the shell to silence all
// hook output (sound, popup, and signal) for that session only. Unlike the
// machine-wide mute flag, this is scoped to the process environment, so an SSH
// user on a shared host can disable just their own sessions. Any non-empty
// value other than "0"/"false" counts as disabled.
function isDisabled() {
  const v = process.env.CLAUDE_NOTIFIER_DISABLE;
  return !!v && v !== "0" && v.toLowerCase() !== "false";
}

module.exports = { readConfig, isMuted, isDisabled };
