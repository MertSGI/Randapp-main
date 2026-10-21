<#
.SYNOPSIS
    LARI 24/7 AI Dev Runner — Safe Windows Supervisor & Task Scheduler Provisioner
.DESCRIPTION
    Provides guarded setup and dry-run planning for Windows Scheduled Task execution.
    By default, operates strictly in -WhatIf / Dry-Run mode.
    Does NOT register scheduled tasks, start background daemons, or execute remote operations
    unless explicitly invoked with -Install and confirmed via the LARI_DEV_RUNNER_INSTALL environment variable.
.PARAMETER Install
    Requests installation of the scheduled task. Requires $env:LARI_DEV_RUNNER_INSTALL = 'CONFIRMED'.
.PARAMETER Uninstall
    Requests unregistration of the scheduled task.
.PARAMETER RepoRoot
    Target repository worktree path. Defaults to parent directory of scripts/.
.PARAMETER TaskName
    Windows Task Scheduler task name. Defaults to 'LARI_Dev247_Supervisor'.
.PARAMETER IntervalMinutes
    Execution frequency in minutes. Defaults to 15.
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [switch]$Install,
    [switch]$Uninstall,
    [string]$RepoRoot = '',
    [string]$TaskName = 'LARI_Dev247_Supervisor',
    [int]$IntervalMinutes = 15
)

$ErrorActionPreference = 'Stop'

# 1. Resolve and Validate RepoRoot
if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
    $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
    $RepoRoot = (Resolve-Path (Join-Path $scriptDir '..\..')).Path
}

if (-not (Test-Path -Path $RepoRoot)) {
    Write-Error "INVALID_REPO_ROOT: Directory does not exist: '$RepoRoot'"
    exit 1
}

$runnerScript = Join-Path $RepoRoot 'scripts\lari-dev-runner\index.mjs'
$queueFile = Join-Path $RepoRoot 'docs\lari-program\DEVELOPMENT_QUEUE.json'

if (-not (Test-Path -Path $runnerScript)) {
    Write-Error "INVALID_REPO_ROOT: Missing runner entrypoint: '$runnerScript'"
    exit 1
}

if (-not (Test-Path -Path $queueFile)) {
    Write-Error "INVALID_REPO_ROOT: Missing development queue: '$queueFile'"
    exit 1
}

# 2. Determine Node executable
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if ($nodeCmd -and $nodeCmd.Source) {
    $nodeExe = $nodeCmd.Source
} else {
    $nodeExe = 'node.exe'
}

# 3. Construct Bound Safe Execution Command
# STRICT: strictly invokes 'index.mjs once', single bounded run, never pushes to remote
$taskActionArg = '"{0}" once --repo "{1}"' -f $runnerScript, $RepoRoot
$fullCommand = '"{0}" {1}' -f $nodeExe, $taskActionArg

Write-Host '================================================================='
Write-Host 'LARI 24/7 AI DEV RUNNER — WINDOWS SUPERVISOR'
Write-Host '================================================================='
Write-Host ('Target Repository: ' + $RepoRoot)
Write-Host ('Runner Entry:      ' + $runnerScript)
Write-Host ('Task Name:         ' + $TaskName)
Write-Host ('Interval:          Every ' + $IntervalMinutes + ' minutes')
Write-Host ('Target Command:    ' + $fullCommand)
Write-Host '-----------------------------------------------------------------'

# Check if WhatIf was passed explicitly
$isWhatIf = ($PSBoundParameters.ContainsKey('WhatIf') -and $PSBoundParameters['WhatIf'])

# 4. Handle Uninstall Flow
if ($Uninstall) {
    if ($isWhatIf -or $PSCmdlet.ShouldProcess($TaskName, 'Remove Scheduled Task')) {
        $delCmd = 'schtasks.exe /Delete /TN "{0}" /F' -f $TaskName
        Write-Host ('[DRY_RUN] Would delete task: ' + $delCmd)
        if (-not $isWhatIf -and $env:LARI_DEV_RUNNER_INSTALL -eq 'CONFIRMED') {
            & schtasks.exe /Delete /TN $TaskName /F
            Write-Host ('Task ' + $TaskName + ' removed successfully.')
        } else {
            Write-Host '[SAFETY_LOCK] Task deletion skipped (WhatIf mode or unconfirmed environment).'
        }
    }
    exit 0
}

# 5. Handle Install Flow with Mandatory Safety Lock
$isConfirmed = ($env:LARI_DEV_RUNNER_INSTALL -eq 'CONFIRMED')

if ($Install -and -not $isConfirmed) {
    Write-Host '[SAFETY_LOCK_ENGAGED] -Install requested, but mandatory confirmation environment variable is missing.'
    Write-Host "Required: `$env:LARI_DEV_RUNNER_INSTALL = 'CONFIRMED'"
    Write-Host 'Action: Falling back to side-effect-free DRY RUN preview. No task registered.'
    Write-Host ''
}

# 6. Dry Run / WhatIf Mode (DEFAULT)
if (-not $Install -or -not $isConfirmed -or $isWhatIf) {
    Write-Host '[STATUS] Operating in SAFE DRY-RUN mode. Zero system modifications performed.'
    Write-Host '[WHAT_IF] To register this task in the future under Windows Task Scheduler:'
    $createCmd = 'schtasks.exe /Create /SC MINUTE /MO {0} /TN "{1}" /TR "{2}" /F' -f $IntervalMinutes, $TaskName, $fullCommand
    Write-Host ('  ' + $createCmd)
    Write-Host '[NOTE] Antigravity CLI adapter remains unverified; no external agent sessions started.'
    Write-Host 'Dry run completed successfully.'
    exit 0
}

# 7. Live Installation (Only if explicitly confirmed)
Write-Host ('[ACTION] Registering scheduled task ' + $TaskName + '...')
& schtasks.exe /Create /SC MINUTE /MO $IntervalMinutes /TN $TaskName /TR $fullCommand /F
if ($LASTEXITCODE -eq 0) {
    Write-Host ('SUCCESS: Scheduled task ' + $TaskName + ' registered successfully.')
} else {
    Write-Error ('Failed to register scheduled task. Exit code: ' + $LASTEXITCODE)
    exit $LASTEXITCODE
}
