# Claude Notifier - PermissionRequest hook (PowerShell)
# Plays sound when Claude needs permission.
$ErrorActionPreference = 'SilentlyContinue'

$hooksDir = Join-Path ($env:USERPROFILE) '.claude' 'hooks'
$muteFlag = Join-Path $hooksDir 'claude-notifier-muted'

$raw = [Console]::In.ReadToEnd()
try { $data = $raw | ConvertFrom-Json } catch { exit 0 }

if (Test-Path $muteFlag) { exit 0 }

$sound = 'C:\Windows\Media\Windows Notify.wav'

# Play sound
try {
    if (Test-Path $sound) { (New-Object Media.SoundPlayer $sound).PlaySync() }
    else { [console]::Beep(800, 300) }
} catch {}

# OS notification
try {
    $tool = if ($data.tool_name) { $data.tool_name } else { 'a tool' }
    $message = "Claude needs permission to use $tool."
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
