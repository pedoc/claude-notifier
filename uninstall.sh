#!/bin/bash
# Claude Notifier — CLI uninstaller
# Removes the Stop hook and cleans up all files.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/ashmitb95/claude-notifier/main/uninstall.sh | bash

set -e

CLAUDE_DIR="$HOME/.claude"
HOOKS_DIR="$CLAUDE_DIR/hooks"
SETTINGS_FILE="$CLAUDE_DIR/settings.json"

echo "Uninstalling Claude Notifier..."

# Remove hook files
rm -f "$HOOKS_DIR/claude-notifier-on-stop.js"
rm -f "$HOOKS_DIR/claude-notifier-on-stop.sh"
rm -f "$HOOKS_DIR/claude-notifier-muted"
rm -f "$HOOKS_DIR/claude-signal"

# Remove hook from Claude settings
if [ -f "$SETTINGS_FILE" ]; then
  node -e "
const fs = require('fs');
const settings = JSON.parse(fs.readFileSync('$SETTINGS_FILE', 'utf-8'));
if (settings.hooks?.Stop) {
  settings.hooks.Stop = settings.hooks.Stop.filter(
    e => !e.hooks?.some(h => h.command?.includes('claude-notifier-on-stop'))
  );
  if (settings.hooks.Stop.length === 0) delete settings.hooks.Stop;
  if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
  fs.writeFileSync('$SETTINGS_FILE', JSON.stringify(settings, null, 2) + '\n');
}
"
fi

echo "Done! Claude Notifier has been removed."
