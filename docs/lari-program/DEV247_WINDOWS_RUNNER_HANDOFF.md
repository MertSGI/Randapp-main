# LARI — 24/7 AI Dev Runner: Windows Supervisor Handoff & Operations Guide

**Document Status:** `SOURCE_PROPOSED_ONLY / OPERATIONAL_GUIDE`  
**Batch Authority:** `LARI-AG-BATCH-20261021-03` (WP-L)  
**Security Classification:** Level 2 — Internal Development Infrastructure  
**Default State:** `INACTIVE_DRY_RUN_BY_DEFAULT`  

---

## 1. Executive Summary & Safety Policy

The LARI 24/7 AI Dev Runner is designed to orchestrate autonomous local development queue execution. To prevent unauthorized execution, uncontrolled looping, or unreviewed modifications:

1. **The runner supervisor is strictly inactive by default.**
2. It operates in **-WhatIf / Dry-Run** mode unless explicitly confirmed by a human developer.
3. **No daemon is auto-run** in this batch.
4. **No paid third-party hosting, VPS, or cloud service** is requested or required.
5. **Antigravity CLI (AG CLI) integration remains unverified (`HOLD_AGENT_ADAPTER_UNVERIFIED`).**

> [!IMPORTANT]
> The Antigravity UI conversation session is **not directly callable by Windows Task Scheduler or cron**. Task Scheduler can only trigger the offline Node runner (`node scripts/lari-dev-runner/index.mjs once`), which processes autonomous queue tasks locally and records checkpoints.

---

## 2. Windows Supervisor Scripts Overview

The supervisor infrastructure consists of two audited PowerShell scripts located in `scripts/lari-dev-runner/`:

1. `windows-supervisor.ps1`:
   - Configures or removes the Windows Scheduled Task.
   - Defaults to safe dry-run preview (`-WhatIf`).
   - Requires explicit switch `-Install` AND literal confirmation environment variable `$env:LARI_DEV_RUNNER_INSTALL = 'CONFIRMED'`.
   - Free of `Invoke-Expression` / shell injections. All paths and arguments are strictly quoted.
   - Enforces execution under current user context without session elevation.
2. `windows-supervisor-status.ps1`:
   - Purely read-only diagnostic inspector.
   - Queries Task Scheduler, pinned Git branch/HEAD, `.lari-dev247/state.json`, and queue state.
   - Automatically scrubs secrets, tokens, and authorization credentials.
   - Causes zero filesystem or scheduler mutations.

---

## 3. Manual Operator Instructions

### 3.1 Status Check (Safe & Read-Only)
Inspect current supervisor and runner state at any time without side-effects:

```powershell
powershell.exe -ExecutionPolicy Bypass -File scripts\lari-dev-runner\windows-supervisor-status.ps1
```

### 3.2 Dry-Run Preview (Default)
Verify the would-be Task Scheduler command line without creating any task:

```powershell
powershell.exe -ExecutionPolicy Bypass -File scripts\lari-dev-runner\windows-supervisor.ps1
```

### 3.3 Explicit Manual Installation (Requires Operator Consent)
To intentionally register the supervisor task under Windows Task Scheduler:

```powershell
$env:LARI_DEV_RUNNER_INSTALL = "CONFIRMED"
powershell.exe -ExecutionPolicy Bypass -File scripts\lari-dev-runner\windows-supervisor.ps1 -Install -IntervalMinutes 15
Remove-Item Env:\LARI_DEV_RUNNER_INSTALL
```

### 3.4 Uninstallation & Cleanup
To unregister and delete the scheduled task:

```powershell
$env:LARI_DEV_RUNNER_INSTALL = "CONFIRMED"
powershell.exe -ExecutionPolicy Bypass -File scripts\lari-dev-runner\windows-supervisor.ps1 -Uninstall
Remove-Item Env:\LARI_DEV_RUNNER_INSTALL
```

Or execute directly:
```cmd
schtasks.exe /Delete /TN "LARI_Dev247_Supervisor" /F
```

---

## 4. Operational Invariants & Failstop Criteria

The runner halts immediately and emits a failstop state when any of the following conditions occur:

1. **Source Tree Dirty / Git Divergence (`HOLD_SOURCE_DRIFT`):**
   If uncommitted local modifications or unexpected branch checkout is detected, the runner stops to prevent overwriting developer work.
2. **Quota Exhaustion or Model Rate Limit (`QUOTA_PAUSE`):**
   If LLM provider quota or rate limits are reached, the runner enters backoff mode and will not retry in a tight loop.
3. **QA Failure / Contract Regression (`FAILED_STOP`):**
   If verification scripts or test suites fail, the task is marked `FAILED_STOP`. No subsequent dependent DAG tasks will be attempted.
4. **Host Sleep & Power Dependency:**
   Execution depends on the host machine being awake and connected. Laptop lid closure, system hibernation, or power outage will pause scheduled invocations without corrupting the atomic state checkpoint (`.lari-dev247/state.json`).
5. **No Production or Push Action:**
   The runner command strictly executes `index.mjs once`. It never contains `git push`, remote pull-request merges, or live staging SQL migrations.
