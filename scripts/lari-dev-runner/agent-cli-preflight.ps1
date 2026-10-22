<#
.SYNOPSIS
    LARI 24/7 AI Dev Runner — Agent CLI Reality Check Preflight
.DESCRIPTION
    Performs read-only inspection of candidate AI agent CLIs (codex, antigravity, ag)
    from the local environment. Does NOT activate inference, start daemons, invoke
    external LLMs, prompt for authentication, or accept license agreements.
    Emits structured JSON with status and strictly enforces runnerActive = false.
.PARAMETER RepoRoot
    Target repository worktree path. Defaults to parent directory of scripts/.
.PARAMETER CandidateOverride
    Optional candidate to test for test isolation.
.PARAMETER TimeoutSeconds
    Timeout limit per probe in seconds. Defaults to 5.
#>
[CmdletBinding()]
param(
    [string]$RepoRoot = '',
    [string]$CandidateOverride = '',
    [int]$TimeoutSeconds = 5
)

$ErrorActionPreference = 'Stop'

function Scrub-Secrets([string]$InputText) {
    if ([string]::IsNullOrEmpty($InputText)) { return '' }
    $scrubbed = $InputText -replace '(?i)(token|bearer|key|secret|password|auth|credential|api_key)\s*[:=]\s*[^\s]+', '$1=[REDACTED]'
    $scrubbed = $scrubbed -replace 'eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}', '[REDACTED_JWT]'
    $scrubbed = $scrubbed -replace 'ghp_[a-zA-Z0-9]{30,}', '[REDACTED_GH_TOKEN]'
    return $scrubbed
}

# 1. Resolve and Validate RepoRoot
if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
    $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
    $RepoRoot = (Resolve-Path (Join-Path $scriptDir '..\..')).Path
}

if (-not (Test-Path -LiteralPath $RepoRoot -PathType Container)) {
    $errObj = [PSCustomObject]@{
        status = 'UNVERIFIED'
        runnerActive = $false
        holdReason = 'INVALID_REPO_ROOT'
        error = "Target repo directory does not exist: $(Scrub-Secrets $RepoRoot)"
        timestamp = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
    }
    Write-Output ($errObj | ConvertTo-Json -Compress)
    exit 1
}

# Validate pinned source ancestry / repo identity
$packageJsonPath = Join-Path $RepoRoot 'package.json'
if (-not (Test-Path -LiteralPath $packageJsonPath -PathType Leaf)) {
    $errObj = [PSCustomObject]@{
        status = 'UNVERIFIED'
        runnerActive = $false
        holdReason = 'REPO_IDENTITY_MISMATCH'
        error = 'Target directory is not a valid LARI repository (missing package.json)'
        timestamp = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
    }
    Write-Output ($errObj | ConvertTo-Json -Compress)
    exit 1
}

# Check for malicious or unsafe characters in parameters
if ($CandidateOverride -match '[&|;<>$`]') {
    $errObj = [PSCustomObject]@{
        status = 'UNVERIFIED'
        runnerActive = $false
        holdReason = 'UNSAFE_ARGUMENTS_DETECTED'
        error = 'Candidate contains unsafe command separator characters'
        timestamp = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
    }
    Write-Output ($errObj | ConvertTo-Json -Compress)
    exit 1
}

# 2. Determine Candidate Tools
$candidates = @('codex', 'antigravity', 'ag')
if (-not [string]::IsNullOrWhiteSpace($CandidateOverride)) {
    $candidates = @($CandidateOverride.Trim())
}

$probeResults = @()
$foundCli = $null
$detectedUiOnly = $false

# Check for known Antigravity desktop UI environment (UI_ONLY evidence)
$userProfile = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::UserProfile)
$agBrainDir = Join-Path $userProfile '.gemini\antigravity'
if (Test-Path -LiteralPath $agBrainDir -PathType Container) {
    $detectedUiOnly = $true
}

# 3. Bounded Execution Probing
foreach ($cand in $candidates) {
    $candRecord = [PSCustomObject]@{
        command = $cand
        found = $false
        path = $null
        version = $null
        status = 'NOT_FOUND'
    }

    $cmdInfo = Get-Command $cand -ErrorAction SilentlyContinue
    if ($cmdInfo -and $cmdInfo.Source) {
        $candRecord.found = $true
        $candRecord.path = Scrub-Secrets $cmdInfo.Source

        # Test bounded execution with timeout
        try {
            $psi = New-Object System.Diagnostics.ProcessStartInfo
            $psi.FileName = $cmdInfo.Source
            $psi.Arguments = '--version'
            $psi.RedirectStandardOutput = $true
            $psi.RedirectStandardError = $true
            $psi.UseShellExecute = $false
            $psi.CreateNoWindow = $true

            $proc = [System.Diagnostics.Process]::Start($psi)
            $completed = $proc.WaitForExit($TimeoutSeconds * 1000)

            if ($completed) {
                $out = $proc.StandardOutput.ReadToEnd().Trim()
                $candRecord.version = Scrub-Secrets $out
                $candRecord.status = 'CLI_AVAILABLE'
                $foundCli = $candRecord
            } else {
                try { $proc.Kill() } catch {}
                $candRecord.status = 'PROBE_TIMEOUT'
            }
        } catch {
            $candRecord.status = 'PROBE_ERROR'
        }
    } else {
        $candRecord.status = 'NOT_FOUND'
    }

    $probeResults += $candRecord
}

# 4. Resolve Overall Status
$finalStatus = 'NOT_FOUND'
$holdReason = 'HOLD_AGENT_ADAPTER_UNVERIFIED'

if ($foundCli) {
    $finalStatus = 'CLI_AVAILABLE'
    $holdReason = 'CLI_DETECTED_STANDBY_ONLY'
} elseif ($detectedUiOnly) {
    $finalStatus = 'UI_ONLY'
    $holdReason = 'HOLD_AGENT_ADAPTER_UNVERIFIED'
} else {
    $finalStatus = 'NOT_FOUND'
    $holdReason = 'HOLD_AGENT_ADAPTER_UNVERIFIED'
}

# 5. Emit Structured JSON with strictly runnerActive = false
$outputObj = [PSCustomObject]@{
    status = $finalStatus
    runnerActive = $false
    holdReason = $holdReason
    cliAvailable = ($foundCli -ne $null)
    detectedUiOnly = $detectedUiOnly
    repoRoot = Scrub-Secrets $RepoRoot
    candidates = $probeResults
    timestamp = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
}

Write-Output ($outputObj | ConvertTo-Json -Depth 5 -Compress)
exit 0
