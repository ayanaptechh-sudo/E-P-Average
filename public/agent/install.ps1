<#
.SYNOPSIS
    PromptShield Enterprise Endpoint DLP Agent v2.4.0 - Zero-Touch Installation Script
.DESCRIPTION
    Enterprise deployment script for PromptShield Endpoint DLP Agent and Telemetry Server.
    Implements silent background execution, automated UAC self-elevation, process cleanup,
    verbose audit logging, and decoupled Scheduled Task dispatch running under SYSTEM with HIGHEST privileges.
.NOTES
    Target OS: Windows 10, Windows 11, Windows Server 2016+
    Architecture: x64 / ARM64
    Default Path: C:\ProgramData\PromptShield
#>

[CmdletBinding()]
param (
    [Parameter(Mandatory = $false)]
    [string]$Server = "http://127.0.0.1:8000",

    [Parameter(Mandatory = $false)]
    [string]$Token = "wADkPpAcWPpsh1LeX9ufWzXYb7Wpu3xBcWnA1tMxsbY",

    [Parameter(Mandatory = $false)]
    [string]$AgentName = $env:COMPUTERNAME,

    [Parameter(Mandatory = $false)]
    [string]$InstallDir = "C:\ProgramData\PromptShield",

    [Parameter(Mandatory = $false)]
    [string]$TaskName = "PromptShield-Enterprise-EDR",

    [Parameter(Mandatory = $false)]
    [switch]$NoElevation
)

# ------------------------------------------------------------------------------
# 1. SILENT RUNTIME CONFIGURATION & VERBOSE LOGGING ENGINE
# ------------------------------------------------------------------------------
$ErrorActionPreference = "Continue"
$ProgressPreference = "SilentlyContinue"
$ConfirmPreference = "None"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13

# Ensure Target Directory & Log Path Exist Upfront
if (-not (Test-Path -Path $InstallDir)) {
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
}

$LogFile = Join-Path $InstallDir "install.log"

function Write-Log {
    param (
        [ValidateSet("INFO", "WARN", "ERROR", "SUCCESS")]
        [string]$Level = "INFO",
        [Parameter(Mandatory = $true)]
        [string]$Message
    )
    $timestamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss.fff")
    $logLine = "[$timestamp] [$Level] $Message"
    
    try {
        [System.IO.File]::AppendAllText($LogFile, $logLine + [Environment]::NewLine, [System.Text.Encoding]::UTF8)
    } catch {
        Add-Content -Path $LogFile -Value $logLine -Encoding UTF8 -ErrorAction SilentlyContinue
    }

    # Output to stdout only if running interactively (suppressed in silent mode)
    if ([Environment]::UserInteractive -and -not ($host.Name -like "*NonInteractive*")) {
        switch ($Level) {
            "INFO"    { Write-Host $logLine -ForegroundColor Cyan }
            "WARN"    { Write-Host $logLine -ForegroundColor Yellow }
            "ERROR"   { Write-Host $logLine -ForegroundColor Red }
            "SUCCESS" { Write-Host $logLine -ForegroundColor Green }
        }
    }
}

Write-Log "INFO" "=========================================================================="
Write-Log "INFO" " PromptShield Enterprise Endpoint DLP Agent v2.4.0 - Zero-Touch Installer"
Write-Log "INFO" " Target Host: $AgentName | Server URL: $Server"
Write-Log "INFO" " Install Directory: $InstallDir"
Write-Log "INFO" "=========================================================================="

# ------------------------------------------------------------------------------
# 2. FOOLPROOF UAC AUTO-ELEVATION (BACKGROUND RUNAS)
# ------------------------------------------------------------------------------
function Test-IsAdministrator {
    $currentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($currentIdentity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-IsAdministrator)) {
    if ($NoElevation) {
        Write-Log "ERROR" "Execution aborted: Administrator privileges required but elevation was suppressed."
        exit 1
    }

    Write-Log "WARN" "Installer running under non-elevated context. Requesting silent background elevation..."

    # Determine original script path
    $scriptPath = $MyInvocation.MyCommand.Definition
    if (-not $scriptPath -or -not (Test-Path $scriptPath)) {
        $scriptPath = $PSCommandPath
    }

    # If downloaded on-the-fly to a temporary file, save a copy in InstallDir to ensure elevation path exists
    if (-not $scriptPath -or -not (Test-Path $scriptPath)) {
        $scriptPath = Join-Path $InstallDir "install-elevate.ps1"
        $MyInvocation.MyCommand.ScriptBlock.ToString() | Out-File -FilePath $scriptPath -Encoding UTF8 -Force
    }

    $arguments = @(
        "-NoProfile",
        "-NonInteractive",
        "-WindowStyle Hidden",
        "-ExecutionPolicy Bypass",
        "-File `"$scriptPath`"",
        "-Server `"$Server`"",
        "-Token `"$Token`"",
        "-AgentName `"$AgentName`"",
        "-InstallDir `"$InstallDir`"",
        "-TaskName `"$TaskName`""
    ) -join " "

    try {
        $elevatedProc = Start-Process -FilePath "powershell.exe" `
                                      -ArgumentList $arguments `
                                      -Verb RunAs `
                                      -WindowStyle Hidden `
                                      -PassThru

        Write-Log "SUCCESS" "Elevated process spawned successfully (PID: $($elevatedProc.Id)). Exiting original process."
        exit 0
    } catch {
        Write-Log "ERROR" "UAC elevation failed or was cancelled by policy: $_"
        exit 1
    }
}

Write-Log "INFO" "Verified: Running with full Administrator/Elevated privileges."

# ------------------------------------------------------------------------------
# 3. PRE-INSTALLATION PROCESS & PORT CLEANUP (PORT 8000 & STALE EXES)
# ------------------------------------------------------------------------------
Write-Log "INFO" "Starting process sanitization and port 8000 cleanup..."

# 3.1 Kill processes holding port 8000
try {
    if (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue) {
        $connections = Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue
        if ($connections) {
            $pidsToKill = $connections | Select-Object -ExpandProperty OwningProcess -Unique
            foreach ($procId in $pidsToKill) {
                if ($procId -gt 4) { # Do not target PID 4 (System)
                    Write-Log "WARN" "Terminating process (PID: $procId) binding port 8000 via Get-NetTCPConnection..."
                    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
                }
            }
        }
    }
} catch {
    Write-Log "WARN" "Get-NetTCPConnection query failed: $_"
}

# 3.2 Netstat fallback cleanup for port 8000
try {
    $netstatOutput = netstat -ano | Select-String ":8000\s+"
    foreach ($entry in $netstatOutput) {
        if ($entry.Line -match "\s+LISTENING\s+(\d+)$") {
            $targetPid = [int]$matches[1]
            if ($targetPid -gt 4) {
                Write-Log "WARN" "Terminating PID $targetPid (Listening on 8000 via netstat)..."
                taskkill /PID $targetPid /F /T 2>&1 | Out-Null
            }
        }
    }
} catch {
    Write-Log "WARN" "Netstat port cleanup error: $_"
}

# 3.3 Terminate previous PromptShield / Electron / Python agent processes
$staleProcessNames = @("promptshield", "promptshield-agent", "electron", "python", "pythonw")
foreach ($name in $staleProcessNames) {
    try {
        $matching = Get-Process -Name $name -ErrorAction SilentlyContinue | Where-Object {
            try {
                $_.Path -like "*PromptShield*" -or $_.CommandLine -like "*PromptShield*" -or $_.CommandLine -like "*8000*"
            } catch {
                $false
            }
        }
        foreach ($p in $matching) {
            Write-Log "INFO" "Killing existing EDR process: $($p.Name) (PID: $($p.Id))"
            Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
        }
    } catch {
        Write-Log "WARN" "Process scan failed for $name: $_"
    }
}

# ------------------------------------------------------------------------------
# 4. DEPLOY AGENT COMPONENTS & DECOUPLED LAUNCHERS
# ------------------------------------------------------------------------------
Write-Log "INFO" "Deploying payload assets to $InstallDir..."

# 4.1 Continuous Background DLP Agent Daemon Script
$AgentDaemonScript = Join-Path $InstallDir "promptshield-agent.ps1"
$AgentScriptContent = @'
# PromptShield Continuous DLP Daemon
param(
    [string]$Server = "http://127.0.0.1:8000",
    [string]$Token = "",
    [string]$AgentName = $env:COMPUTERNAME
)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$LogFile = "C:\ProgramData\PromptShield\agent.log"
function Log-Agent($msg) {
    $ts = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    Add-Content -Path $LogFile -Value "[$ts] $msg" -ErrorAction SilentlyContinue
}

Log-Agent "PromptShield DLP daemon initialized on host $AgentName against $Server"

$Patterns = @{
    "Payment Card (PCI-DSS)"   = "\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b"
    "OpenAI Secret Key"        = "\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b"
    "Anthropic Claude API Key" = "\bsk-ant-[A-Za-z0-9_-]{40,}\b"
    "GitHub Access Token"      = "\bgh[pousr]_[A-Za-z0-9_]{36,255}\b"
    "AWS Access Key ID"        = "\b(A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}\b"
    "Cryptographic Private Key"= "-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----"
    "US Social Security Number"= "\b(?!000|666|9\d{2})\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b"
}

function Report-Telemetry($category, $details, $action) {
    try {
        $body = @{
            agentId = $AgentName
            hostname = $AgentName
            endpoint_id = $AgentName
            user_account = $env:USERNAME
            event_type = "CLIPBOARD_DLP_BLOCKED"
            ai_tool = "Endpoint Buffer"
            violation_category = $category
            action_taken = $action
            details = $details
            timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
            status = "Active"
            os = "Windows 11 (10.0.22631)"
            ip = "127.0.0.1"
        } | ConvertTo-Json

        $headers = @{
            "Content-Type" = "application/json"
            "Authorization" = "Bearer $Token"
        }

        Invoke-RestMethod -Uri "$Server/api/endpoints/telemetry" -Method Post -Body $body -Headers $headers -TimeoutSec 3 -ErrorAction SilentlyContinue | Out-Null
    } catch {
        Log-Agent "Failed to deliver telemetry: $_"
    }
}

# Initial Heartbeat
Report-Telemetry "Handshake" "Agent connected and synchronized with EDR Server" "ACTIVE"

$lastClipboard = ""
while ($true) {
    Start-Sleep -Milliseconds 1000

    try {
        # Check command queue for self-destruct / uninstall
        try {
            $cmdCheck = Invoke-RestMethod -Uri "$Server/api/agent/$AgentName/pending-commands" -Method Get -TimeoutSec 2 -ErrorAction SilentlyContinue
            if ($cmdCheck -and $cmdCheck.commands) {
                foreach ($cmd in $cmdCheck.commands) {
                    if ($cmd.command -eq "UNINSTALL_AGENT") {
                        Log-Agent "Received UNINSTALL_AGENT command. Executing self-delete..."
                        # Remove Scheduled Task & self-purge
                        schtasks.exe /Delete /TN "PromptShield-Enterprise-EDR" /F | Out-Null
                        Remove-Item -Path "C:\ProgramData\PromptShield" -Recurse -Force -ErrorAction SilentlyContinue
                        exit 0
                    }
                }
            }
        } catch {}

        if ([System.Windows.Forms.Clipboard]::ContainsText()) {
            $txt = [System.Windows.Forms.Clipboard]::GetText()
            if ($txt -and $txt -ne $lastClipboard -and $txt -ne "[SENSITIVE DATA BLOCKED BY PROMPTSHIELD]") {
                foreach ($k in $Patterns.Keys) {
                    if ($txt -match $Patterns[$k]) {
                        [System.Windows.Forms.Clipboard]::SetText("[SENSITIVE DATA BLOCKED BY PROMPTSHIELD]")
                        $lastClipboard = "[SENSITIVE DATA BLOCKED BY PROMPTSHIELD]"
                        Log-Agent "Blocked sensitive data: $k"
                        Report-Telemetry $k "Sensitive pattern intercepted and sanitized in clipboard." "BLOCKED"
                        break
                    }
                }
                $lastClipboard = $txt
            }
        }
    } catch {
        # Ignore transient clipboard lock exceptions
    }
}
'@

[System.IO.File]::WriteAllText($AgentDaemonScript, $AgentScriptContent, [System.Text.Encoding]::UTF8)
Write-Log "SUCCESS" "Created continuous DLP Daemon script at $AgentDaemonScript"

# 4.2 Decoupled Silent VBScript Launcher (Prevents command window flashes and script blocking)
$VbsLauncherPath = Join-Path $InstallDir "start-promptshield.vbs"
$VbsLauncherContent = @"
Set WshShell = CreateObject("WScript.Shell")

' Launch continuous DLP agent daemon invisibly (0 = hidden, False = non-blocking)
strCmdAgent = "powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File ""$AgentDaemonScript"" -Server ""$Server"" -Token ""$Token"" -AgentName ""$AgentName"""
WshShell.Run strCmdAgent, 0, False

' If a standalone Electron app or Python telemetry server executable is installed, launch it silently
strElectronPath = "$InstallDir\PromptShield.exe"
Set fso = CreateObject("Scripting.FileSystemObject")
If fso.FileExists(strElectronPath) Then
    WshShell.Run """" & strElectronPath & """ --hidden --minimized", 0, False
End If
"@

[System.IO.File]::WriteAllText($VbsLauncherPath, $VbsLauncherContent, [System.Text.Encoding]::ASCII)
Write-Log "SUCCESS" "Created decoupled silent VBS launcher at $VbsLauncherPath"

# ------------------------------------------------------------------------------
# 5. WINDOWS TASK SCHEDULER DEPLOYMENT (SYSTEM / HIGHEST PRIVILEGES)
# ------------------------------------------------------------------------------
Write-Log "INFO" "Configuring Windows Scheduled Task: $TaskName..."

# 5.1 Remove existing task if already present
try {
    schtasks.exe /Query /TN "$TaskName" 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Log "WARN" "Removing pre-existing Scheduled Task '$TaskName'..."
        schtasks.exe /Delete /TN "$TaskName" /F 2>&1 | Out-Null
    }
} catch {
    Write-Log "WARN" "Error querying previous task: $_"
}

# 5.2 Create the Scheduled Task using schtasks.exe
# Triggers on system startup (ONSTART), runs as SYSTEM (/RU "SYSTEM"), highest privileges (/RL HIGHEST)
$TaskAction = "wscript.exe `"$VbsLauncherPath`""
Write-Log "INFO" "Registering Scheduled Task with action: $TaskAction"

$createOutput = schtasks.exe /Create `
    /TN "$TaskName" `
    /RU "SYSTEM" `
    /RL HIGHEST `
    /SC ONSTART `
    /TR "$TaskAction" `
    /F 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Log "SUCCESS" "Scheduled Task '$TaskName' created successfully with /RU SYSTEM and /RL HIGHEST."
} else {
    Write-Log "ERROR" "Failed to create Scheduled Task with schtasks: $createOutput"
    # Fallback attempt with current administrator if SYSTEM token assignment restricted by local GPO
    Write-Log "WARN" "Attempting fallback Scheduled Task registration with /RU '$env:USERNAME'..."
    schtasks.exe /Create /TN "$TaskName" /RL HIGHEST /SC ONSTART /TR "$TaskAction" /F 2>&1 | Out-Null
}

# 5.3 Trigger the task immediately so the agent starts running without waiting for a reboot
Write-Log "INFO" "Executing Scheduled Task '$TaskName' to start agent immediately..."
$runOutput = schtasks.exe /Run /TN "$TaskName" 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Log "SUCCESS" "Scheduled Task triggered. EDR agent and telemetry server launched decoupled in background."
} else {
    Write-Log "WARN" "schtasks /Run returned code $LASTEXITCODE ($runOutput). Launching fallback launcher..."
    Start-Process -FilePath "wscript.exe" -ArgumentList "`"$VbsLauncherPath`"" -WindowStyle Hidden
}

# ------------------------------------------------------------------------------
# 6. INITIAL HEARTBEAT HANDSHAKE & TELEMETRY REGISTRATION
# ------------------------------------------------------------------------------
Write-Log "INFO" "Transmitting initial handshake to PromptShield EDR Console ($Server)..."
try {
    $handshakeBody = @{
        agentId = $AgentName
        hostname = $AgentName
        endpoint_id = $AgentName
        ip = "127.0.0.1"
        os = "Windows 11 (10.0.22631)"
        status = "Active"
        enrolledAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
        event_type = "AGENT_INSTALLED"
        violation_category = "Zero-Touch Enrollment"
        action_taken = "ONLINE"
        details = "Agent successfully deployed and registered via Windows Scheduled Task (SYSTEM)."
    } | ConvertTo-Json

    $headers = @{
        "Content-Type" = "application/json"
        "Authorization" = "Bearer $Token"
    }

    $response = Invoke-RestMethod -Uri "$Server/api/endpoints/telemetry" `
                                  -Method Post `
                                  -Body $handshakeBody `
                                  -Headers $headers `
                                  -TimeoutSec 4 `
                                  -ErrorAction Stop

    Write-Log "SUCCESS" "Initial handshake acknowledged by EDR server. Host '$AgentName' marked Active."
} catch {
    Write-Log "WARN" "Initial handshake to $Server skipped or queued (server offline or starting up): $_"
}

Write-Log "SUCCESS" "=========================================================================="
Write-Log "SUCCESS" " PromptShield Enterprise Agent Deployment Complete - Zero-Touch Finished"
Write-Log "SUCCESS" " Log File: $LogFile"
Write-Log "SUCCESS" "=========================================================================="

exit 0
