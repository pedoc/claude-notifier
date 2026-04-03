# Changelog

## [2.1.1] - 2026-04-03

### Fixed
- Windows hook scripts now correctly read VS Code settings. `$env:USERPROFILE` was not resolving when Claude Code spawned PowerShell with `-NoProfile -NonInteractive`, causing sound and notification level settings to be silently ignored and always falling back to defaults. Replaced with `$PSScriptRoot`, which reliably points to the hooks directory in all execution contexts. ([#4](https://github.com/ashmitb95/claude-notifier/issues/4))

## [2.1.0] - 2026-03-20

### Added
- Remote session support: when Claude Code runs on a remote host (SSH, Dev Containers, WSL), the extension now plays a terminal bell via VS Code's BEL sequence, which is forwarded to the local client. Webview audio is blocked by Electron's autoplay policy in remote contexts, making this the reliable fallback.

## [2.0.1] - 2026-03-10

### Fixed
- Marketplace republish to resolve extension visibility issue.

## [2.0.0] - 2026-03-05

### Added
- Per-event notification levels: `sound+popup`, `sound`, `popup`, or `off` — configurable independently for task completion, permission requests, and questions.
- Per-event sound presets for both macOS (Basso, Blow, Bottle, Frog, Funk, Glass, Hero, Morse, Ping, Pop, Purr, Sosumi, Submarine, Tink) and Windows (Windows Notify, tada, chimes, chord, ding, notify, ringin, Windows Background).
- Settings sync: VS Code settings are written to `~/.claude/hooks/claude-notifier-config.json` and picked up by hook scripts at runtime.

## [1.0.0] - 2026-02-20

### Added
- Three distinct hooks: `Stop` (task completed), `PermissionRequest` (needs tool approval), `PreToolUse` for `AskUserQuestion` (question asked).
- macOS and Windows support via platform-specific hook scripts (Node.js / PowerShell).
- WSL detection: WSL sessions call `powershell.exe` for sounds and notifications.
- Mute toggle via status bar icon or command palette (`Claude Notifier: Toggle Sound`).
- Auto-configures `~/.claude/settings.json` on activation, cleans up on uninstall.
- Homebrew tap support for macOS/Linux CLI install.
