# Claude Notifier - Stop hook (PowerShell)
# Plays "task completed" or "question asked" sound when Claude finishes.
$ErrorActionPreference = 'SilentlyContinue'

$hooksDir = Join-Path ($env:USERPROFILE) '.claude' 'hooks'
$muteFlag = Join-Path $hooksDir 'claude-notifier-muted'

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

$sounds = @{ question = 'C:\Windows\Media\Windows Notify.wav'; done = 'C:\Windows\Media\tada.wav' }
$messages = @{ question = 'Claude is asking you a question.'; done = 'Claude has finished the task.' }

# Play sound
try {
    $s = $sounds[$reason]
    if (Test-Path $s) { (New-Object Media.SoundPlayer $s).PlaySync() }
    else { [console]::Beep(800, 300) }
} catch {}

# OS notification
try {
    Add-Type -AssemblyName System.Windows.Forms
    $n = New-Object System.Windows.Forms.NotifyIcon
    $n.Icon = [System.Drawing.SystemIcons]::Information
    $n.Visible = $true
    $n.ShowBalloonTip(3000, 'Claude Notifier', $messages[$reason], [System.Windows.Forms.ToolTipIcon]::None)
    Start-Sleep -Milliseconds 500
    $n.Dispose()
} catch {}

# Write signal for VSCode extension
try {
    Set-Content -Path (Join-Path $hooksDir 'claude-signal') -Value "$reason $(Get-Date -UFormat %s)" -NoNewline
} catch {}
