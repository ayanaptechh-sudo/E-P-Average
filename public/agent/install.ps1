# ==============================================================================
# PromptShield Enterprise Endpoint DLP & Monitoring Agent (v2.4.0)
# Local-First Architecture • Offline & LAN Telemetry
# ==============================================================================

param (
    [string]$Server = "http://127.0.0.1:8000",
    [string]$Token = "",
    [string]$AgentName = $env:COMPUTERNAME
)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " PromptShield Enterprise Endpoint DLP Agent v2.4.0" -ForegroundColor Green
Write-Host " Host: $AgentName | Server: $Server" -ForegroundColor Cyan
Write-Host " Status: Continuous Clipboard & Prompt Protection Active" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan

# Enterprise DLP Detection Regex Patterns
$Patterns = @{
    "OpenAI Secret Key" = "\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b"
    "Anthropic Claude Key" = "\bsk-ant-[A-Za-z0-9_-]{40,}\b"
    "GitHub Access Token" = "\bgh[pousr]_[A-Za-z0-9_]{36,255}\b"
    "Payment Card (PCI-DSS)" = "\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b"
    "Cryptographic Private Key" = "-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----"
    "US Social Security Number" = "\b(?!000|666|9\d{2})\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b"
}

# Function to show prominent security alert dialog
function Show-PromptShieldAlert([string]$Category, [string]$Source) {
    [System.Windows.Forms.MessageBox]::Show(
        "SECURITY ALERT: Sensitive Data in AI Prompt Blocked`n`n" +
        "Category: $Category`n" +
        "Source: $Source`n`n" +
        "PromptShield Local DLP intercepted and cleared sensitive data to prevent unauthorized external AI transmission.",
        "PromptShield Enterprise DLP Alert",
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Warning
    )
}

# Function to send telemetry to local Admin server
function Send-Telemetry([string]$Category, [string]$Details, [string]$Action) {
    try {
        $body = @{
            endpoint_id = $AgentName
            hostname = $AgentName
            user_account = $env:USERNAME
            event_type = "CLIPBOARD_DLP_BLOCKED"
            ai_tool = "Endpoint System Buffer"
            violation_category = $Category
            action_taken = $Action
            details = $Details
            timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
            alert_displayed = 1
        } | ConvertTo-Json

        $headers = @{
            "Content-Type" = "application/json"
            "Authorization" = "Bearer $Token"
        }

        Invoke-RestMethod -Uri "$Server/api/endpoints/telemetry" -Method Post -Body $body -Headers $headers -TimeoutSec 3 -ErrorAction SilentlyContinue | Out-Null
    } catch {
        # Offline resilience: Silently log locally if admin server temporarily unreachable
        Write-Verbose "Telemetry delivery queued (offline): $_"
    }
}

# Initial Heartbeat Handshake
Send-Telemetry -Category "Heartbeat Handshake" -Details "Agent initialized and bound to local EDR" -Action "ONLINE"

$lastText = ""

# Main Monitoring Loop (Check clipboard every 1000ms)
while ($true) {
    Start-Sleep -Milliseconds 1000

    try {
        if ([System.Windows.Forms.Clipboard]::ContainsText()) {
            $currentText = [System.Windows.Forms.Clipboard]::GetText()

            if ($currentText -and $currentText -ne $lastText -and $currentText -ne "[SENSITIVE DATA BLOCKED BY PROMPTSHIELD]") {
                foreach ($cat in $Patterns.Keys) {
                    $regex = $Patterns[$cat]
                    if ($currentText -match $regex) {
                        # Instant Remediation: Overwrite clipboard
                        [System.Windows.Forms.Clipboard]::SetText("[SENSITIVE DATA BLOCKED BY PROMPTSHIELD]")
                        $lastText = "[SENSITIVE DATA BLOCKED BY PROMPTSHIELD]"

                        Write-Host "[DLP BLOCKED] Intercepted $cat on $AgentName at $(Get-Date -Format 'HH:mm:ss')" -ForegroundColor Red

                        # Report Telemetry
                        Send-Telemetry -Category $cat -Details "Sensitive credential or data matched pattern. Clipboard sanitized." -Action "BLOCKED & NOTIFIED"

                        # Display prominent Windows OS alert window
                        Show-PromptShieldAlert -Category $cat -Source "System Clipboard / AI Prompt Buffer"
                        break
                    }
                }
                $lastText = $currentText
            }
        }
    } catch {
        # Handle transient clipboard access locks gracefully
    }
}
