# Claude Notifier - Stop hook (PowerShell, v2)
# Plays "task completed" or "question asked" sound when Claude finishes.
$ErrorActionPreference = 'SilentlyContinue'

$hooksDir = Join-Path ($env:USERPROFILE) '.claude' 'hooks'
$muteFlag = Join-Path $hooksDir 'claude-notifier-muted'
$configFile = Join-Path $hooksDir 'claude-notifier-config.json'
$taskStartFile = Join-Path $hooksDir 'claude-notifier-taskstart'

$winSounds = @{
    'Windows Notify' = 'C:\Windows\Media\Windows Notify.wav'
    'tada'           = 'C:\Windows\Media\tada.wav'
    'chimes'         = 'C:\Windows\Media\chimes.wav'
    'chord'          = 'C:\Windows\Media\chord.wav'
    'ding'           = 'C:\Windows\Media\ding.wav'
    'notify'         = 'C:\Windows\Media\notify.wav'
    'ringin'         = 'C:\Windows\Media\ringin.wav'
    'Windows Background' = 'C:\Windows\Media\Windows Background.wav'
}

$raw = [Console]::In.ReadToEnd()
try { $data = $raw | ConvertFrom-Json } catch { exit 0 }

if ($data.stop_hook_active) { exit 0 }
if (Test-Path $muteFlag) { exit 0 }

$reason = 'done'

$transcript = $data.transcript_path
if ($transcript -and (Test-Path $transcript)) {
    try {
        $lines = Get-Content $transcript -Tail 20
        for ($i = $lines.Count - 1; $i -ge 0; $i--) {
            try {
                $msg = $lines[$i] | ConvertFrom-Json
                if ($msg.role -eq 'assistant' -and $msg.content -and $msg.content.Count -gt 0) {
                    $last = $msg.content[$msg.content.Count - 1]
                    if ($last.type -eq 'tool_use' -and $last.name -eq 'AskUserQuestion') {
                        $reason = 'question'
                    } elseif ($last.type -eq 'text' -and $last.text -and $last.text.Trim().EndsWith('?')) {
                        $reason = 'question'
                    }
                    break
                }
            } catch {}
        }
    } catch {}
}

# Read config
$config = $null
try { $config = (Get-Content $configFile -Raw) | ConvertFrom-Json } catch {}

$configKey = if ($reason -eq 'question') { 'asksQuestion' } else { 'taskCompleted' }
$eventCfg = if ($config -and $config.$configKey) { $config.$configKey } else { $null }
$level = if ($eventCfg -and $eventCfg.level) { $eventCfg.level } else { 'sound+popup' }

if ($level -eq 'off') {
    Remove-Item -Path $taskStartFile -Force -ErrorAction SilentlyContinue
    exit 0
}

# Duration threshold check — only skip for "done" events, not "question"
$threshold = if ($config -and $config.durationThreshold) { $config.durationThreshold } else { 0 }
if ($reason -eq 'done' -and $threshold -gt 0) {
    $startTime = 0
    if (Test-Path $taskStartFile) {
        try { $startTime = [long](Get-Content $taskStartFile -Raw).Trim() } catch {}
    }
    Remove-Item -Path $taskStartFile -Force -ErrorAction SilentlyContinue
    if ($startTime -gt 0) {
        $nowMs = [long]([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
        $elapsed = ($nowMs - $startTime) / 1000
        if ($elapsed -lt $threshold) { exit 0 }
    }
} else {
    Remove-Item -Path $taskStartFile -Force -ErrorAction SilentlyContinue
}

$defaultSounds = @{ question = 'C:\Windows\Media\Windows Notify.wav'; done = 'C:\Windows\Media\tada.wav' }
$soundName = if ($eventCfg -and $eventCfg.sound) { $eventCfg.sound } else { '' }
$soundPath = if ($winSounds.ContainsKey($soundName)) { $winSounds[$soundName] } else { $defaultSounds[$reason] }

$messages = @{ question = 'Claude is asking you a question.'; done = 'Claude has finished the task.' }

# Play sound
if ($level -eq 'sound+popup' -or $level -eq 'sound') {
    try {
        if (Test-Path $soundPath) { (New-Object Media.SoundPlayer $soundPath).PlaySync() }
        else { [console]::Beep(800, 300) }
    } catch {}
}

# OS notification
if ($level -eq 'sound+popup' -or $level -eq 'popup') {
    try {
        Add-Type -AssemblyName System.Windows.Forms
        $n = New-Object System.Windows.Forms.NotifyIcon
        $n.Icon = [System.Drawing.SystemIcons]::Information
        $n.Visible = $true
        $n.ShowBalloonTip(3000, 'Claude Notifier', $messages[$reason], [System.Windows.Forms.ToolTipIcon]::None)
        Start-Sleep -Milliseconds 500
        $n.Dispose()
    } catch {}
}

# Write signal for VSCode extension
try {
    Set-Content -Path (Join-Path $hooksDir 'claude-signal') -Value "$reason $(Get-Date -UFormat %s)" -NoNewline
} catch {}
