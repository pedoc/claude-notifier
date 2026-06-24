# cn-daemon — claude-notifier remote-audio daemon

A tiny, dependency-free helper that runs on your **local machine** and plays
notification sounds for Claude sessions running on a **remote host** (SSH, WSL,
dev container). It listens on a loopback port; the notifier hook on the remote
pushes events to it over an SSH reverse forward, so the sound plays where you
are — not on the remote, and without the terminal bell.

See [docs/REMOTE_HOSTS.md](../docs/REMOTE_HOSTS.md) for the end-user setup.

## Protocol

Newline-delimited JSON, one event per line:

```json
{"reason":"done","sound":"Hero","volume":0.4}
```

- `reason` — `done` | `question` | `input` (informational; used for logging)
- `sound` — a preset name (e.g. `Hero`, `Funk`, `Windows Notify`); mapped to a
  file using the **client's** OS table, with a default fallback per platform
- `volume` — `0.0`–`1.0`

Identical events within 300 ms are debounced (collapses duplicate signals).

## Configuration

| Env var   | Default     | Meaning                       |
| --------- | ----------- | ----------------------------- |
| `CN_HOST` | `127.0.0.1` | Listen address (keep loopback) |
| `CN_PORT` | `47291`     | Listen port                   |

## Build

Stdlib-only Go — cross-compiles to a ~2.4 MB static binary, no runtime deps.

```sh
go build -ldflags="-s -w" -o cn-daemon .

# cross-compile (example):
CGO_ENABLED=0 GOOS=darwin GOARCH=arm64 go build -ldflags="-s -w" -o cn-daemon-darwin-arm64 .
```

Release binaries for all platforms are built and published by
[.github/workflows/daemon-release.yml](../.github/workflows/daemon-release.yml)
on a `daemon-v*` tag. Contributors change this code; CI compiles and publishes.
