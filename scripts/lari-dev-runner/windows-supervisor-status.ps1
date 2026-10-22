<#
.SYNOPSIS
    LARI 24/7 AI Dev Runner — Windows Supervisor Read-Only Status Inspector
.DESCRIPTION
    Inspects Windows Task Scheduler state, pinned repository git status,
    local runner checkpoint, and execution health.
    Operates strictly in READ-ONLY mode. Zero filesystem or scheduler mutations.
    Automatically scrubs sensitive credentials and secrets from output.
.PARAMETER TaskName
    Windows Task Scheduler task name to inspect. Defaults to 'LARI_Dev247_Supervisor'.
.PARAMETER RepoRoot
    Target repository worktree path. Defaults to parent directory of scripts/.
#>
param(
    [string]$TaskName = "LARI_Dev247_Supervisor",
    [string]$RepoRoot = ""
)

$ErrorActionPreference = 'Continue'

# Function to mask secrets
function Scrub-Secrets([string]$inputStr) {
    if ([string]::IsNullOrEmpty($inputStr)) { return "" }
    $masked = $inputStr -replace '(?i)(bearer\s+|token[:=]\s*|key[:=]\s*|password[:=]\s*)([^\s,"'']+)', '$1[REDACTED]'
    $masked = $masked -replace 'sbp_[a-zA-Z0-9_-]{20,}', '[REDACTED_SUPABASE_TOKEN]'
    $masked = $masked -replace 'ghp_[a-zA-Z0-9_-]{20,}', '[REDACTED_GITHUB_TOKEN]'
    return $masked
}

if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
    $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
    $RepoRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path
}

$status = [ordered]@{
    timestamp = (Get-Date).ToString("yyyy-MM-ddTHH:mm:sszzz")
    inspection_mode = "READ_ONLY_NON_MUTATING"
    task_name = $TaskName
    repo_root = $RepoRoot
    task_scheduler = [ordered]@{
        task_installed = $false
        raw_status = "UNKNOWN"
        next_run_time = "N/A"
        last_run_time = "N/A"
        last_result = "N/A"
    }
    git_state = [ordered]@{
        head_sha = "UNKNOWN"
        branch = "UNKNOWN"
        is_clean = $false
    }
    checkpoint_state = [ordered]@{
        checkpoint_exists = $false
        last_task_id = "NONE"
        status = "NONE"
        lease_active = $false
    }
    agent_adapter_status = "HOLD_AGENT_ADAPTER_UNVERIFIED"
}

# 1. Query Scheduled Task
try {
    $taskOutput = (& schtasks.exe /Query /TN "$TaskName" /FO LIST 2>&1) | Out-String
    if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace($taskOutput)) {
        $status.task_scheduler.task_installed = $true
        if ($taskOutput -match "Status:\s+(.+)") { $status.task_scheduler.raw_status = $matches[1].Trim() }
        if ($taskOutput -match "Next Run Time:\s+(.+)") { $status.task_scheduler.next_run_time = $matches[1].Trim() }
        if ($taskOutput -match "Last Run Time:\s+(.+)") { $status.task_scheduler.last_run_time = $matches[1].Trim() }
        if ($taskOutput -match "Last Result:\s+(.+)") { $status.task_scheduler.last_result = $matches[1].Trim() }
    } else {
        $status.task_scheduler.raw_status = "NOT_INSTALLED"
    }
} catch {
    $status.task_scheduler.raw_status = "SCHEDULER_QUERY_ERROR"
}

# 2. Query Git State
if (Test-Path (Join-Path $RepoRoot ".git")) {
    Push-Location $RepoRoot
    try {
        $head = (& git rev-parse HEAD 2>$null)
        if ($head) { $status.git_state.head_sha = $head.Trim() }
        $branch = (& git branch --show-current 2>$null)
        if ($branch) { $status.git_state.branch = $branch.Trim() }
        $porcelain = (& git status --porcelain 2>$null)
        $status.git_state.is_clean = [string]::IsNullOrWhiteSpace($porcelain)
    } finally {
        Pop-Location
    }
}

# 3. Query Checkpoint State
$stateFile = Join-Path $RepoRoot ".lari-dev247\state.json"
if (Test-Path $stateFile) {
    try {
        $stateJson = Get-Content -Path $stateFile -Raw | ConvertFrom-Json
        $status.checkpoint_state.checkpoint_exists = $true
        $status.checkpoint_state.last_task_id = $stateJson.last_completed_task_id
        $status.checkpoint_state.status = $stateJson.status
        $status.checkpoint_state.lease_active = ($stateJson.lease_expires_at -gt [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
    } catch {
        $status.checkpoint_state.status = "STATE_READ_ERROR"
    }
}

$jsonOutput = $status | ConvertTo-Json -Depth 5
$scrubbedOutput = Scrub-Secrets $jsonOutput
Write-Output $scrubbedOutput
