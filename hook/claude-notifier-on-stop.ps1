# Claude Notifier - Stop hook (PowerShell, v3)
# Writes a "done" signal for the VSCode extension to debounce. When no
# extension is active (terminal-only), plays sound/notification directly.
$ErrorActionPreference = 'SilentlyContinue'

$hooksDir = $PSScriptRoot
$muteFlag = Join-Path $hooksDir 'claude-notifier-muted'
$signalFile = Join-Path $hooksDir 'claude-signal'
$activeDir  = Join-Path $hooksDir 'claude-notifier-active.d'
$configFile = Join-Path $hooksDir 'claude-notifier-config.json'

# Extension writes one PID marker file per window into $activeDir. The file's
# content is the window's workspace folder list (one per line). Only treat
# the extension as the owner of a Stop signal when a live PID's workspace
# contains the firing cwd — otherwise fall through to terminal fallback so
# Claude sessions outside any open workspace still get notified.
function Test-CwdInsideFolder([string]$cwd, [string]$folder) {
    if (-not $cwd -or -not $folder) { return $false }
    if ($cwd -eq $folder) { return $true }
    $sep = [IO.Path]::DirectorySeparatorChar
    if (-not $folder.EndsWith($sep)) { $folder = $folder + $sep }
    return $cwd.StartsWith($folder)
}

function Test-ExtensionOwnsCwd([string]$cwd) {
    if (-not (Test-Path $activeDir)) { return $false }
    foreach ($f in Get-ChildItem -Path $activeDir -File -ErrorAction SilentlyContinue) {
        $pidVal = 0
        if (-not [int]::TryParse($f.Name, [ref]$pidVal)) { continue }
        if (-not (Get-Process -Id $pidVal -ErrorAction SilentlyContinue)) { continue }
        $folders = ""
        try { $folders = [IO.File]::ReadAllText($f.FullName) } catch {}
        # Backwards-compat: empty marker means a pre-cwd-routing extension is
        # running. Defer to it; once it reloads the marker will be populated.
        if (-not $folders.Trim()) { return $true }
        foreach ($line in $folders -split "`n") {
            $folder = $line.Trim()
            if ($folder -and (Test-CwdInsideFolder $cwd $folder)) { return $true }
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

$cwd = ""
if ($data.cwd) { $cwd = "$($data.cwd)" }
if (-not $cwd) { $cwd = (Get-Location).Path }

# Write signal for the VSCode extension (which debounces "done" signals
# and routes them to the matching window via cwd).
try {
    Set-Content -Path $signalFile -Value "done $(Get-Date -UFormat %s) $cwd" -NoNewline
} catch {}

# If a VSCode window owns this cwd, the extension handles it. Otherwise
# (terminal Claude or unrelated workspace) play directly here.
if (Test-ExtensionOwnsCwd $cwd) { exit 0 }

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
