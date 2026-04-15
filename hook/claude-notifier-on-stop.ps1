# Claude Notifier - Stop hook (PowerShell, v3)
# Writes a "done" signal for the VSCode extension to debounce. When no
# extension is active (terminal-only), plays sound/notification directly.
$ErrorActionPreference = 'SilentlyContinue'

$hooksDir = $PSScriptRoot
$muteFlag = Join-Path $hooksDir 'claude-notifier-muted'
$signalFile = Join-Path $hooksDir 'claude-signal'
$activeDir  = Join-Path $hooksDir 'claude-notifier-active.d'
$configFile = Join-Path $hooksDir 'claude-notifier-config.json'

# Extension writes one PID marker file per window into $activeDir. Only
# treat the extension as active when a marker names a live process, so a
# stale marker from a crashed window doesn't silence terminal fallback.
function Test-ExtensionActive {
    if (-not (Test-Path $activeDir)) { return $false }
    foreach ($f in Get-ChildItem -Path $activeDir -File -ErrorAction SilentlyContinue) {
        $pidVal = 0
        if ([int]::TryParse($f.Name, [ref]$pidVal)) {
            if (Get-Process -Id $pidVal -ErrorAction SilentlyContinue) { return $true }
        }
    }
    return $false
}

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

# Write signal for the VSCode extension (which debounces "done" signals).
try {
    Set-Content -Path $signalFile -Value "done $(Get-Date -UFormat %s)" -NoNewline
} catch {}

# If the extension is active it handles sound/notification with debounce.
# Only play directly when running in terminal without the extension.
if (Test-ExtensionActive) { exit 0 }

$config = $null
try { $config = (Get-Content $configFile -Raw) | ConvertFrom-Json } catch {}

$eventCfg = if ($config -and $config.taskCompleted) { $config.taskCompleted } else { $null }
$level = if ($eventCfg -and $eventCfg.level) { $eventCfg.level } else { 'sound+popup' }

if ($level -eq 'off') { exit 0 }

$soundName = if ($eventCfg -and $eventCfg.sound) { $eventCfg.sound } else { '' }
$soundPath = if ($winSounds.ContainsKey($soundName)) { $winSounds[$soundName] } else { 'C:\Windows\Media\tada.wav' }

if ($level -eq 'sound+popup' -or $level -eq 'sound') {
    try {
        if (Test-Path $soundPath) { (New-Object Media.SoundPlayer $soundPath).PlaySync() }
        else { [console]::Beep(800, 300) }
    } catch {}
}

if ($level -eq 'sound+popup' -or $level -eq 'popup') {
    try {
        Add-Type -AssemblyName System.Windows.Forms
        $n = New-Object System.Windows.Forms.NotifyIcon
        $n.Icon = [System.Drawing.SystemIcons]::Information
        $n.Visible = $true
        $n.ShowBalloonTip(3000, 'Claude Notifier', 'Claude has finished the task.', [System.Windows.Forms.ToolTipIcon]::None)
        Start-Sleep -Milliseconds 500
        $n.Dispose()
    } catch {}
}
