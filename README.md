# Claude Notifier

[![VS Marketplace](https://img.shields.io/visual-studio-marketplace/v/SingularityInc.claude-notifier)](https://marketplace.visualstudio.com/items?itemName=SingularityInc.claude-notifier)

Plays a sound and shows a notification when [Claude Code](https://claude.com/claude-code) finishes a task, needs permission, or asks a question.

Stop watching the screen — go grab a coffee and let Claude ping you when it needs you.

Works with **VSCode**, **terminal CLI**, **vim**, or any editor where you use Claude Code.

## Sounds

| Event | macOS | Windows | When |
|---|---|---|---|
| Needs permission | **Glass** | Windows Notify | Claude needs approval to use a tool |
| Asks a question | **Funk** | Windows Notify | Claude is asking you something |
| Task completed | **Hero** | Tada | Claude finished the task |

## Install

### Option 1: VSCode Extension

Install from the [VS Marketplace](https://marketplace.visualstudio.com/items?itemName=SingularityInc.claude-notifier):

```sh
code --install-extension SingularityInc.claude-notifier
```

Or search for **"Claude Notifier"** in the Extensions tab (`Cmd+Shift+X` / `Ctrl+Shift+X`).

The extension auto-configures everything on activation. Reload VSCode after installing.

### Option 2: CLI (terminal, vim, etc.)

One-line install — no VSCode needed:

```sh
curl -fsSL https://raw.githubusercontent.com/ashmitb95/claude-notifier/main/install.sh | bash
```

To uninstall:

```sh
curl -fsSL https://raw.githubusercontent.com/ashmitb95/claude-notifier/main/uninstall.sh | bash
```

## How it works

Three [Claude Code hooks](https://docs.anthropic.com/en/docs/claude-code/hooks) are registered:

| Hook | Trigger | Sound |
|---|---|---|
| `Stop` | Claude finishes responding | Hero |
| `PermissionRequest` | Claude needs tool approval | Glass |
| `PreToolUse` (AskUserQuestion) | Claude asks a question | Funk |

Each hook plays the appropriate system sound and shows an OS notification.
If the VSCode extension is installed, it also shows a toast notification inside the editor.

## Usage

- **Mute/unmute (VSCode):** Click the speaker icon in the status bar, or run `Claude Notifier: Toggle Sound` from the command palette
- **Mute/unmute (CLI):**
  ```sh
  touch ~/.claude/hooks/claude-notifier-muted   # mute
  rm ~/.claude/hooks/claude-notifier-muted      # unmute
  ```

## Requirements

- macOS or Windows
- [Claude Code](https://claude.com/claude-code) CLI or VSCode extension
- Node.js (ships with Claude Code)

## License

MIT
