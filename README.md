# Claude Notifier

A VSCode extension that plays a sound and shows a notification when [Claude Code](https://claude.com/claude-code) finishes a task or needs your input.

Stop watching the screen — go grab a coffee and let Claude ping you when it's done.

## Sounds

| Event | macOS | Windows | When |
|---|---|---|---|
| Needs input | Glass | Windows Notify | Claude is waiting for permission or asking a question |
| Task completed | Hero | Tada | Claude finished the task |

## Install

Download the latest `.vsix` from [Releases](https://github.com/ashmitb95/claude-notifier/releases), then:

```sh
code --install-extension claude-notifier-*.vsix
```

Or in VSCode: `Cmd+Shift+P` / `Ctrl+Shift+P` → "Extensions: Install from VSIX..."

Reload VSCode after installing.

## How it works

1. The extension automatically registers a [Claude Code Stop hook](https://docs.anthropic.com/en/docs/claude-code/hooks) on activation
2. When Claude finishes responding, the hook writes to a signal file (`~/.claude/hooks/claude-signal`)
3. The extension watches that file and plays the appropriate sound + shows a notification

No manual configuration needed — install and go.

## Usage

- **Toggle sound**: Click the speaker icon in the status bar (bottom-right), or run `Claude Notifier: Toggle Sound` from the command palette
- **Uninstall**: The extension cleans up its hook script and settings entry automatically

## Requirements

- macOS or Windows
- [Claude Code](https://claude.com/claude-code) CLI or VSCode extension

## License

MIT
