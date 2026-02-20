# Claude Notifier - Notification hook (PowerShell)
# Plays sound when Claude sends a notification.
$ErrorActionPreference = 'SilentlyContinue'

$hooksDir = Join-Path ($env:USERPROFILE) '.claude' 'hooks'
$muteFlag = Join-Path $hooksDir 'claude-notifier-muted'

$raw = [Console]::In.ReadToEnd()
try { $data = $raw | ConvertFrom-Json } catch { exit 0 }

if ($data.notification_type -ne 'permission_prompt') { exit 0 }
if (Test-Path $muteFlag) { exit 0 }

$sound = 'C:\Windows\Media\Windows Notify.wav'

# Play sound
try {
    if (Test-Path $sound) { (New-Object Media.SoundPlayer $sound).PlaySync() }
    else { [console]::Beep(800, 300) }
} catch {}

# OS notification
try {
    $message = if ($data.message) { $data.message } else { 'Claude needs your permission.' }
    Add-Type -AssemblyName System.Windows.Forms
    $n = New-Object System.Windows.Forms.NotifyIcon
    $n.Icon = [System.Drawing.SystemIcons]::Information
    $n.Visible = $true
    $n.ShowBalloonTip(3000, 'Claude Notifier', $message, [System.Windows.Forms.ToolTipIcon]::None)
    Start-Sleep -Milliseconds 500
    $n.Dispose()
} catch {}

# Write signal for VSCode extension
try {
    Set-Content -Path (Join-Path $hooksDir 'claude-signal') -Value "input $(Get-Date -UFormat %s)" -NoNewline
} catch {}
