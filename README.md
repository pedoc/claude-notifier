# Claude Notifier

[![VS Marketplace](https://img.shields.io/visual-studio-marketplace/v/SingularityInc.claude-notifier)](https://marketplace.visualstudio.com/items?itemName=SingularityInc.claude-notifier)

Plays a sound and shows a notification when [Claude Code](https://claude.com/claude-code) finishes a task, needs permission, or asks a question.

Stop watching the screen — go grab a coffee and let Claude ping you when it needs you.

Works with **VSCode**, **terminal CLI**, **vim**, or any editor where you use Claude Code — on **macOS**, **Windows**, and **WSL**.

## Install

### Option 1: VSCode Extension

Install from the [VS Marketplace](https://marketplace.visualstudio.com/items?itemName=SingularityInc.claude-notifier):

```sh
code --install-extension SingularityInc.claude-notifier
```

Or search for **"Claude Notifier"** in the Extensions tab (`Cmd+Shift+X` / `Ctrl+Shift+X`).

The extension auto-configures everything on activation. Reload VSCode after installing.

### Option 2: Homebrew (macOS / Linux)

```sh
brew tap ashmitb95/claude-notifier
brew install claude-notifier
```

If `brew install` fails (e.g. outdated Command Line Tools), use the curl method below.

To uninstall:

```sh
brew uninstall claude-notifier
claude-notifier-uninstall  # remove hooks from ~/.claude/settings.json
```

### Option 3: CLI (curl)

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

## Settings

Open **Settings** → search **"Claude Notifier"** (`Cmd+,` / `Ctrl+,`), or add to your `settings.json`:

```jsonc
{
  // Per-event notification level: "sound+popup" | "sound" | "popup" | "off"
  "claudeNotifier.taskCompleted.level": "sound+popup",
  "claudeNotifier.needsPermission.level": "sound+popup",
  "claudeNotifier.asksQuestion.level": "sound+popup",

  // Per-event sound preset (see list below)
  "claudeNotifier.taskCompleted.sound": "Hero",
  "claudeNotifier.needsPermission.sound": "Glass",
  "claudeNotifier.asksQuestion.sound": "Funk"
}
```

**Notification levels:**

| Level         | Sound | OS notification | VSCode toast |
| ------------- | ----- | --------------- | ------------ |
| `sound+popup` | Yes   | Yes             | Yes          |
| `sound`       | Yes   | No              | No           |
| `popup`       | No    | Yes             | Yes          |
| `off`         | No    | No              | No           |

**Sound presets:**
- macOS: Basso, Blow, Bottle, Frog, Funk, Glass, Hero, Morse, Ping, Pop, Purr, Sosumi, Submarine, Tink
- Windows: Windows Notify, tada, chimes, chord, ding, notify, ringin, Windows Background

The global **mute toggle** (status bar speaker icon or `Claude Notifier: Toggle Sound` in the command palette) overrides all per-event settings.

## How it works

Three [Claude Code hooks](https://docs.anthropic.com/en/docs/claude-code/hooks) are registered:

| Hook                           | Trigger                    |
| ------------------------------ | -------------------------- |
| `Stop`                         | Claude finishes responding |
| `PermissionRequest`            | Claude needs tool approval |
| `PreToolUse` (AskUserQuestion) | Claude asks a question     |

Each hook reads `~/.claude/hooks/claude-notifier-config.json` (synced from VSCode settings) to determine which sound to play and whether to show notifications.

On **macOS**, hooks use `afplay` and `osascript`. On **Windows** and **WSL**, hooks use PowerShell with `NotifyIcon` balloon tips and system sounds.

## Mute/unmute (CLI)

**macOS / Linux / WSL:**

```sh
touch ~/.claude/hooks/claude-notifier-muted   # mute
rm ~/.claude/hooks/claude-notifier-muted      # unmute
```

**Windows PowerShell:**

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

## Contributing

Bug reports and feature requests are welcome — please [open an issue](https://github.com/ashmitb95/claude-notifier/issues/new) first so we can discuss the change before code is written. For pull requests:

- Branch from `main` and keep changes focused — one fix or feature per PR.
- Follow the existing commit style (`fix:`, `feat:`, `chore:` …).
- Test your changes locally on the platform(s) you've touched (macOS, Windows, or WSL) and note what you verified in the PR description.

### Contributors

Thanks to everyone who has contributed to this project:

[![Contributors](https://contrib.rocks/image?repo=ashmitb95/claude-notifier)](https://github.com/ashmitb95/claude-notifier/graphs/contributors)

## License

[GPL-3.0](LICENSE.md)
