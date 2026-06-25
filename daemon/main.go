// claude-notifier remote-audio daemon.
//
// Runs on the LOCAL client machine. Listens on a loopback port and plays a
// notification sound for each event it receives. When Claude runs on a remote
// host, the notifier hook there pushes events to this daemon over an SSH
// reverse forward (`RemoteForward <port> localhost:<port>` in ~/.ssh/config) —
// so the sound plays on the machine you're sitting at, with no audio on the
// remote and no terminal bell.
//
// Stdlib-only, so it cross-compiles to a tiny static binary for GitHub Releases.
// Sound tables mirror src/notifications/sound.ts.
package main

import (
	"bufio"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"math"
	"net"
	"os"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"time"
	"unicode/utf16"
)

const (
	debounceMS = 300
	version    = "3.5.1"
)

var macSounds = map[string]string{
	"Basso": "/System/Library/Sounds/Basso.aiff", "Blow": "/System/Library/Sounds/Blow.aiff",
	"Bottle": "/System/Library/Sounds/Bottle.aiff", "Frog": "/System/Library/Sounds/Frog.aiff",
	"Funk": "/System/Library/Sounds/Funk.aiff", "Glass": "/System/Library/Sounds/Glass.aiff",
	"Hero": "/System/Library/Sounds/Hero.aiff", "Morse": "/System/Library/Sounds/Morse.aiff",
	"Ping": "/System/Library/Sounds/Ping.aiff", "Pop": "/System/Library/Sounds/Pop.aiff",
	"Purr": "/System/Library/Sounds/Purr.aiff", "Sosumi": "/System/Library/Sounds/Sosumi.aiff",
	"Submarine": "/System/Library/Sounds/Submarine.aiff", "Tink": "/System/Library/Sounds/Tink.aiff",
}

var winSounds = map[string]string{
	"Windows Notify": `C:\Windows\Media\Windows Notify.wav`, "tada": `C:\Windows\Media\tada.wav`,
	"chimes": `C:\Windows\Media\chimes.wav`, "chord": `C:\Windows\Media\chord.wav`,
	"ding": `C:\Windows\Media\ding.wav`, "notify": `C:\Windows\Media\notify.wav`,
	"ringin": `C:\Windows\Media\ringin.wav`, "Windows Background": `C:\Windows\Media\Windows Background.wav`,
}

const linuxSoundsDir = "/usr/share/sounds/freedesktop/stereo"

var linuxSounds = map[string]string{
	"Basso": linuxSoundsDir + "/dialog-warning.oga", "Blow": linuxSoundsDir + "/service-logout.oga",
	"Bottle": linuxSoundsDir + "/bell.oga", "Frog": linuxSoundsDir + "/message-new-instant.oga",
	"Funk": linuxSoundsDir + "/message-new-instant.oga", "Glass": linuxSoundsDir + "/bell.oga",
	"Hero": linuxSoundsDir + "/complete.oga", "Morse": linuxSoundsDir + "/message.oga",
	"Ping": linuxSoundsDir + "/message.oga", "Pop": linuxSoundsDir + "/dialog-information.oga",
	"Purr": linuxSoundsDir + "/service-login.oga", "Sosumi": linuxSoundsDir + "/dialog-warning.oga",
	"Submarine": linuxSoundsDir + "/alarm-clock-elapsed.oga", "Tink": linuxSoundsDir + "/bell.oga",
}

const defaultMac = "/System/Library/Sounds/Hero.aiff"
const defaultWin = `C:\Windows\Media\tada.wav`

type event struct {
	Reason string  `json:"reason"`
	Sound  string  `json:"sound"`
	Volume float64 `json:"volume"`
}

func clampVolume(v float64) float64 {
	if math.IsNaN(v) {
		return 1
	}
	return math.Max(0, math.Min(1, v))
}

func play(sound string, volume float64) {
	v := clampVolume(volume)
	var cmd *exec.Cmd
	var resolvedPath string
	switch runtime.GOOS {
	case "windows":
		resolvedPath = winSounds[sound]
		if resolvedPath == "" {
			logf("sound %q not found in windows table, falling back to default", sound)
			resolvedPath = defaultWin
		}
		ps := fmt.Sprintf(`$s='%s'; if(Test-Path $s){(New-Object Media.SoundPlayer $s).PlaySync()}else{[console]::Beep(800,300)}`, resolvedPath)
		cmd = exec.Command("powershell", "-NoProfile", "-NonInteractive", "-EncodedCommand", encodePS(ps))
	case "linux":
		resolvedPath = linuxSounds[sound]
		if resolvedPath == "" {
			logf("sound %q not found in linux table, falling back to default", sound)
			resolvedPath = linuxSoundsDir + "/complete.oga"
		}
		paVol := int(math.Round(v * 65536))
		shell := fmt.Sprintf(`pw-play --volume=%s "%s" 2>/dev/null || paplay --volume=%d "%s" 2>/dev/null || aplay "%s" 2>/dev/null`,
			strconv.FormatFloat(v, 'f', -1, 64), resolvedPath, paVol, resolvedPath, resolvedPath)
		cmd = exec.Command("sh", "-c", shell)
	default: // darwin
		resolvedPath = macSounds[sound]
		if resolvedPath == "" {
			logf("sound %q not found in mac table, falling back to default", sound)
			resolvedPath = defaultMac
		}
		cmd = exec.Command("afplay", "-v", strconv.FormatFloat(v, 'f', -1, 64), resolvedPath)
	}
	logf("running: %s (file=%s)", cmd.String(), resolvedPath)
	if err := cmd.Start(); err != nil {
		logf("play start failed: %v (cmd=%s)", err, cmd.String())
		return
	}
	go func() {
		if err := cmd.Wait(); err != nil {
			logf("play command exited with error: %v (cmd=%s)", err, cmd.String())
		}
	}()
}

// encodePS encodes a PowerShell script as UTF-16LE base64 for -EncodedCommand.
func encodePS(s string) string {
	u := utf16.Encode([]rune(s))
	b := make([]byte, len(u)*2)
	for i, r := range u {
		b[i*2] = byte(r)
		b[i*2+1] = byte(r >> 8)
	}
	return base64.StdEncoding.EncodeToString(b)
}

var lastKey string
var lastAt time.Time

func handleEvent(ev event) {
	key := fmt.Sprintf("%s:%s:%g", ev.Reason, ev.Sound, ev.Volume)
	now := time.Now()
	if key == lastKey && now.Sub(lastAt) < debounceMS*time.Millisecond {
		logf("debounced duplicate: %s", key)
		return
	}
	lastKey, lastAt = key, now
	logf("play %s @ %g (%s)", ev.Sound, ev.Volume, ev.Reason)
	play(ev.Sound, ev.Volume)
}

func logf(format string, a ...any) {
	fmt.Printf("[cn-daemon %s] %s\n", time.Now().Format("15:04:05"), fmt.Sprintf(format, a...))
}

// handleConn reads newline-delimited JSON events from one pushed connection.
func handleConn(conn net.Conn) {
	remote := conn.RemoteAddr().String()
	logf("connection accepted from %s", remote)
	defer func() {
		conn.Close()
		logf("connection closed from %s", remote)
	}()

	scanner := bufio.NewScanner(conn)
	var eventCount int
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		var ev event
		if err := json.Unmarshal([]byte(line), &ev); err != nil {
			logf("bad event from %s: %s (err=%v)", remote, line, err)
			continue
		}
		handleEvent(ev)
		eventCount++
	}
	if err := scanner.Err(); err != nil {
		logf("connection read error from %s after %d events: %v", remote, eventCount, err)
	}
	logf("connection from %s finished (%d events)", remote, eventCount)
}

func main() {
	host := os.Getenv("CN_HOST")
	hostSrc := "default"
	if host == "" {
		host = "127.0.0.1"
	} else {
		hostSrc = "env"
	}
	port := os.Getenv("CN_PORT")
	portSrc := "default"
	if port == "" {
		port = "47291"
	} else {
		portSrc = "env"
	}
	addr := host + ":" + port

	logf("starting v%s (platform=%s go=%s)", version, runtime.GOOS, runtime.Version())
	logf("bind address: %s (host=%s:%s port=%s:%s)", addr, hostSrc, host, portSrc, port)

	ln, err := net.Listen("tcp", addr)
	if err != nil {
		// A bind failure almost always means another daemon already owns the
		// port — exit quietly so a second launch is a no-op rather than a crash.
		fmt.Fprintf(os.Stderr, "cn-daemon: cannot listen on %s: %v\n", addr, err)
		os.Exit(1)
	}
	logf("listening on %s", addr)
	for {
		conn, err := ln.Accept()
		if err != nil {
			logf("accept error: %v", err)
			continue
		}
		go handleConn(conn)
	}
}
