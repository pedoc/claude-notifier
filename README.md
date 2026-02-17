# Claude Notifier

Plays a sound and shows a notification when [Claude Code](https://claude.com/claude-code) finishes a task or needs your input.

Stop watching the screen — go grab a coffee and let Claude ping you when it's done.

Works with **VSCode**, **terminal CLI**, **vim**, or any editor where you use Claude Code.

## Sounds

| Event | macOS | Windows | When |
|---|---|---|---|
| Needs input | Glass | Windows Notify | Claude is waiting for permission or asking a question |
| Task completed | Hero | Tada | Claude finished the task |

## Install

### Option 1: VSCode Extension

Download the latest `.vsix` from [Releases](https://github.com/ashmitb95/claude-notifier/releases), then:

```sh
code --install-extension claude-notifier-*.vsix
```

Or in VSCode: `Cmd+Shift+P` / `Ctrl+Shift+P` → "Extensions: Install from VSIX..."

The extension auto-configures everything on activation. Reload VSCode after installing.

### Option 2: CLI (terminal, vim, etc.)

One-line install — no VSCode needed:

```sh
curl -fsSL https://raw.githubusercontent.com/ashmitb95/claude-notifier/main/install.sh | bash
```

This registers a [Claude Code Stop hook](https://docs.anthropic.com/en/docs/claude-code/hooks) that plays a sound and shows an OS notification whenever Claude finishes.

To uninstall:

```sh
curl -fsSL https://raw.githubusercontent.com/ashmitb95/claude-notifier/main/uninstall.sh | bash
```

## How it works

1. A [Claude Code Stop hook](https://docs.anthropic.com/en/docs/claude-code/hooks) runs whenever Claude finishes responding
2. The hook reads the transcript to determine if Claude is done or needs input
3. It plays the appropriate system sound and shows an OS notification
4. If the VSCode extension is installed, it also shows a toast notification inside the editor

## Usage

- **Mute/unmute (VSCode):** Click the speaker icon in the status bar, or run `Claude Notifier: Toggle Sound` from the command palette
- **Mute/unmute (CLI):**
  ```sh
  # Mute
  touch ~/.claude/hooks/claude-notifier-muted
  # Unmute
  rm ~/.claude/hooks/claude-notifier-muted
  ```

## Requirements

- macOS or Windows
- [Claude Code](https://claude.com/claude-code) CLI or VSCode extension
- Node.js (ships with Claude Code)

## License

MIT
