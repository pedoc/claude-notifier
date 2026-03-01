# Changelog

All notable changes to Claude Notifier will be documented in this file.

## [2.2.0] - 2026-03-01

### Added
- Configurable duration threshold (`claudeNotifier.durationThreshold`) — suppress all notification sounds until Claude has been working for at least N seconds
- Status bar tooltip shows threshold value when configured
- PreToolUse hook now fires for all tools to reliably track task start time

### Changed
- Threshold applies to all notification types (completion, permission, question), not just task completion

### Fixed
- Text-only responses no longer trigger false completion sounds when threshold is enabled
- Auto-approved tools (no permission prompt) now correctly record task start time

## [2.1.0] - 2026-02-28

### Added
- Homebrew install support (`brew tap ashmitb95/claude-notifier && brew install claude-notifier`)

## [2.0.1] - 2026-02-27

### Fixed
- Marketplace republish with correct publisher ID

## [2.0.0] - 2026-02-27

### Added
- Per-event notification levels: `sound+popup`, `sound`, `popup`, `off`
- Per-event sound presets (14 macOS sounds, 8 Windows sounds)
- Three separate hooks: Stop, PermissionRequest, PreToolUse (AskUserQuestion)
- Configuration synced to `~/.claude/hooks/claude-notifier-config.json`

### Changed
- Replaced single notification hook with three event-specific hooks
- Sound and popup can now be controlled independently per event type

## [1.0.0] - 2026-02-26

### Added
- Three distinct hooks for permission, question, and task completion events
- CLI install/uninstall scripts for terminal-only usage
- Windows and WSL support via PowerShell hooks
- Global mute toggle in status bar
- Auto-setup on extension activation, teardown on uninstall

## [0.1.0] - 2026-02-25

### Added
- Initial release
- Plays a sound when Claude Code finishes a task
- macOS support with `afplay`
- VSCode status bar toggle
