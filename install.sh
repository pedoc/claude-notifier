#!/bin/bash
# Claude Notifier — CLI installer
# Installs the Stop hook so you get sound + notification when Claude finishes.
# Works with Claude Code in terminal, vim, etc. No VSCode needed.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/ashmitb95/claude-notifier/main/install.sh | bash
#
# Uninstall:
#   curl -fsSL https://raw.githubusercontent.com/ashmitb95/claude-notifier/main/uninstall.sh | bash

set -e

CLAUDE_DIR="$HOME/.claude"
HOOKS_DIR="$CLAUDE_DIR/hooks"
HOOK_SCRIPT="$HOOKS_DIR/claude-notifier-on-stop.js"
SETTINGS_FILE="$CLAUDE_DIR/settings.json"
REPO_RAW="https://raw.githubusercontent.com/ashmitb95/claude-notifier/main"

echo "Installing Claude Notifier..."

# Create directories
mkdir -p "$HOOKS_DIR"

# Download hook script
curl -fsSL "$REPO_RAW/hook/claude-notifier-on-stop.js" -o "$HOOK_SCRIPT"
chmod +x "$HOOK_SCRIPT"

# Add hook to Claude settings
if [ ! -f "$SETTINGS_FILE" ]; then
  echo '{}' > "$SETTINGS_FILE"
fi

# Use node to safely merge into settings.json
node -e "
const fs = require('fs');
const settings = JSON.parse(fs.readFileSync('$SETTINGS_FILE', 'utf-8'));
if (!settings.hooks) settings.hooks = {};
if (!settings.hooks.Stop) settings.hooks.Stop = [];

// Remove any existing claude-notifier entries
settings.hooks.Stop = settings.hooks.Stop.filter(
  e => !e.hooks?.some(h => h.command?.includes('claude-notifier-on-stop'))
);

settings.hooks.Stop.push({
  hooks: [{ type: 'command', command: 'node \"$HOOK_SCRIPT\"' }]
});

fs.writeFileSync('$SETTINGS_FILE', JSON.stringify(settings, null, 2) + '\n');
"

echo ""
echo "Done! Claude Notifier is installed."
echo ""
echo "  Sound + notification will play when Claude finishes a task."
echo "  To mute:   touch ~/.claude/hooks/claude-notifier-muted"
echo "  To unmute:  rm ~/.claude/hooks/claude-notifier-muted"
echo ""
echo "  To uninstall: curl -fsSL $REPO_RAW/uninstall.sh | bash"
