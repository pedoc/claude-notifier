# Claude Notifier

[![VS Marketplace](https://img.shields.io/visual-studio-marketplace/v/SingularityInc.claude-notifier)](https://marketplace.visualstudio.com/items?itemName=SingularityInc.claude-notifier)

Plays a sound and shows a notification when [Claude Code](https://claude.com/claude-code) finishes a task, needs permission, or asks a question.

Stop watching the screen — go grab a coffee and let Claude ping you when it needs you.

Works with **VSCode**, **terminal CLI**, **vim**, or any editor where you use Claude Code — on **macOS**, **Windows**, and **WSL**.

## Sounds

| Event            | macOS     | Windows        | When                                |
| ---------------- | --------- | -------------- | ----------------------------------- |
| Needs permission | **Glass** | Windows Notify | Claude needs approval to use a tool |
| Asks a question  | **Funk**  | Windows Notify | Claude is asking you something      |
| Task completed   | **Hero**  | Tada           | Claude finished the task            |

## Install

### Option 1: VSCode Extension

Install from the [VS Marketplace](https://marketplace.visualstudio.com/items?itemName=SingularityInc.claude-notifier):

```sh
code --install-extension SingularityInc.claude-notifier
```

Or search for **"Claude Notifier"** in the Extensions tab (`Cmd+Shift+X` / `Ctrl+Shift+X`).

The extension auto-configures everything on activation. Reload VSCode after installing.

### Option 2: CLI (terminal, vim, etc.)

**macOS / Linux / WSL:**

```sh
curl -fsSL https://raw.githubusercontent.com/ashmitb95/claude-notifier/main/install.sh | bash
```

To uninstall:

```sh
curl -fsSL https://raw.githubusercontent.com/ashmitb95/claude-notifier/main/uninstall.sh | bash
```

**Windows (PowerShell):**

```powershell
irm https://raw.githubusercontent.com/ashmitb95/claude-notifier/main/install.ps1 | iex
```

> If you don't have a PowerShell install script yet, use the VSCode extension — it auto-configures everything on Windows.

## How it works

Three [Claude Code hooks](https://docs.anthropic.com/en/docs/claude-code/hooks) are registered:

| Hook                           | Trigger                    | Sound |
| ------------------------------ | -------------------------- | ----- |
| `Stop`                         | Claude finishes responding | Hero  |
| `PermissionRequest`            | Claude needs tool approval | Glass |
| `PreToolUse` (AskUserQuestion) | Claude asks a question     | Funk  |

Each hook plays the appropriate system sound and shows an OS notification.
If the VSCode extension is installed, it also shows a toast notification inside the editor.

On **macOS**, hooks use `afplay` and `osascript`. On **Windows** and **WSL**, hooks use PowerShell with `NotifyIcon` balloon notifications and Windows system sounds (with a fallback beep if sound files are missing).

## Usage

- **Mute/unmute (VSCode):** Click the speaker icon in the status bar, or run `Claude Notifier: Toggle Sound` from the command palette
- **Mute/unmute (CLI — macOS/Linux/WSL):**
  ```sh
  touch ~/.claude/hooks/claude-notifier-muted   # mute
  rm ~/.claude/hooks/claude-notifier-muted      # unmute
  ```
- **Mute/unmute (CLI — Windows PowerShell):**
  ```powershell
  New-Item "$env:USERPROFILE\.claude\hooks\claude-notifier-muted"   # mute
  Remove-Item "$env:USERPROFILE\.claude\hooks\claude-notifier-muted" # unmute
  ```

## Platform support

| Platform | VSCode Extension | CLI Install | Hook runner                                               |
| -------- | ---------------- | ----------- | --------------------------------------------------------- |
| macOS    | Yes              | Yes         | Node.js                                                   |
| Windows  | Yes              | VSCode only | PowerShell                                                |
| WSL      | Yes              | Yes         | Node.js (calls `powershell.exe` for sounds/notifications) |

## Issues and Updates

## License

MIT
