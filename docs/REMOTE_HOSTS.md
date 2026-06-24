# Remote hosts — hearing notifications when Claude runs over SSH

When Claude Code runs on a **remote host** (SSH, WSL, a dev container, a cloud
box) the notifier hooks run *there* too — so any sound they play comes out of
the **remote** machine, which is usually headless. That's why remote sessions
were silent (or, at best, fell back to the terminal bell).

**Remote-audio mode** fixes this. A tiny helper — `cn-daemon` — runs on your
**local** machine and plays the sounds there, with your normal sound presets and
volume. The remote pushes each notification to it over an SSH **reverse
forward**. No audio on the remote, no terminal bell, full sound customization.

```
  REMOTE HOST (where Claude runs)              YOUR LOCAL MACHINE
  ┌───────────────────────────┐                ┌──────────────────────┐
  │ notifier hook / extension │                │ cn-daemon (listening)│
  │   pushes {sound, volume} ──┼── SSH reverse ─┼──► plays the sound 🔊 │
  │   to localhost:47291       │    forward     │   afplay/paplay/PS    │
  └───────────────────────────┘                └──────────────────────┘
```

## Setup

### 1. Install `cn-daemon` on your local machine

Download the binary for your platform from the
[latest release](https://github.com/ashmitb95/claude-notifier/releases) and put
it on your `PATH`:

| Platform        | Asset                          |
| --------------- | ------------------------------ |
| macOS (Apple)   | `cn-daemon-darwin-arm64`       |
| macOS (Intel)   | `cn-daemon-darwin-amd64`       |
| Linux (x86-64)  | `cn-daemon-linux-amd64`        |
| Linux (arm64)   | `cn-daemon-linux-arm64`        |
| Windows (x86-64)| `cn-daemon-windows-amd64.exe`  |

```sh
# macOS / Linux example
chmod +x cn-daemon-darwin-arm64
mv cn-daemon-darwin-arm64 /usr/local/bin/cn-daemon
```

The binary is ~2.4 MB, dependency-free, and plays sounds the same way the
notifier does (`afplay` on macOS, `pw-play`/`paplay`/`aplay` on Linux,
PowerShell on Windows).

### 2. Run the daemon

```sh
cn-daemon          # listens on 127.0.0.1:47291
```

Leave it running while you work (run it at login, in a `tmux` pane, or as a
user service). It exits quietly if another instance already holds the port.

### 3. Add the SSH reverse forward

Add `RemoteForward` to the host entry in your **local** `~/.ssh/config`:

```sshconfig
Host my-remote
    HostName ...
    User ...
    RemoteForward 47291 localhost:47291
```

This makes the remote's `localhost:47291` reach the daemon on your machine. It's
honored by plain `ssh` **and** by VS Code Remote-SSH (which reads the same
config). Reconnect after adding it.

> Using a non-default port? Change it in all three places: the daemon
> (`CN_PORT`), the `RemoteForward` line, and the `port` setting below.

### 4. Turn on remote-audio mode (on the remote)

**VS Code Remote-SSH:** in Settings (on the remote), set
`claudeNotifier.remoteAudio.enabled` to `true`. The extension writes it to the
hook config automatically.

**Plain SSH / terminal-only:** add it to `~/.claude/hooks/claude-notifier-config.json`
on the remote:

```json
{ "remoteAudio": { "enabled": true, "port": 47291 } }
```

That's it. Trigger a notification (ask Claude something, or let a task finish)
and you'll hear it on your local machine.

## How it works

- Every notifier hook routes its sound through a single point
  (`hook/_lib/emit.js`). When remote-audio is **on**, it pushes
  `{reason, sound, volume}` to the daemon instead of playing locally; when
  **off**, behavior is exactly as before. Existing, non-remote users are
  unaffected.
- In a VS Code Remote session the extension owns the "done" sound (it debounces
  across multiple Stop signals); it pushes to the daemon the same way, falling
  back to the terminal bell only when remote-audio is off.
- The daemon maps the sound **name** to a file using your *local* OS, so you get
  the right native sound on the machine you're sitting at.

## Troubleshooting

- **No sound.** Confirm the daemon is running locally (`cn-daemon` prints
  `listening on 127.0.0.1:47291`). On the remote, check the port is reachable:
  `nc -z localhost 47291` (or reconnect SSH so `RemoteForward` applies).
- **Wrong machine.** If sound still plays on the remote, remote-audio mode isn't
  enabled there — re-check step 4 and the hook config on the **remote**.
- **Port in use.** Pick another port and update the daemon, the `RemoteForward`
  line, and the `port` setting consistently.

## Scope

- Supported: SSH, VS Code Remote-SSH, WSL, dev containers — anywhere you can add
  an SSH reverse forward and run the daemon locally.
- The remote host running Claude is expected to be Unix (Linux/macOS/WSL); its
  Node-based hooks do the push. A native-Windows *remote* host is not yet
  covered.
