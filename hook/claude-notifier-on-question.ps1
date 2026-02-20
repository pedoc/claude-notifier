# Claude Notifier - PreToolUse hook for AskUserQuestion (PowerShell)
# Plays sound when Claude asks the user a question.
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
    Add-Type -AssemblyName System.Windows.Forms
    $n = New-Object System.Windows.Forms.NotifyIcon
    $n.Icon = [System.Drawing.SystemIcons]::Information
    $n.Visible = $true
    $n.ShowBalloonTip(3000, 'Claude Notifier', 'Claude is asking you a question.', [System.Windows.Forms.ToolTipIcon]::None)
    Start-Sleep -Milliseconds 500
    $n.Dispose()
} catch {}

# Write signal for VSCode extension
try {
    Set-Content -Path (Join-Path $hooksDir 'claude-signal') -Value "question $(Get-Date -UFormat %s)" -NoNewline
} catch {}
