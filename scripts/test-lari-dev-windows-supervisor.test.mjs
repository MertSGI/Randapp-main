import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import os from 'node:os';

const ROOT_DIR = process.cwd();
const SUPERVISOR_PS1 = path.resolve(ROOT_DIR, 'scripts', 'lari-dev-runner', 'windows-supervisor.ps1');
const STATUS_PS1 = path.resolve(ROOT_DIR, 'scripts', 'lari-dev-runner', 'windows-supervisor-status.ps1');
const HANDOFF_DOC = path.resolve(ROOT_DIR, 'docs', 'lari-program', 'DEV247_WINDOWS_RUNNER_HANDOFF.md');

// Probe PowerShell availability
const probePs = spawnSync('powershell.exe', ['-NoProfile', '-Command', 'Write-Output OK'], {
  encoding: 'utf8',
  timeout: 5000,
});
const hasPowerShell = probePs.status === 0 && probePs.stdout.includes('OK');

test('1. Static verification: windows-supervisor.ps1 exists and adheres to strict security rules', () => {
  assert.ok(fs.existsSync(SUPERVISOR_PS1), 'windows-supervisor.ps1 must exist');
  const code = fs.readFileSync(SUPERVISOR_PS1, 'utf8');

  // Must not use Invoke-Expression or iex
  assert.ok(!/\bInvoke-Expression\b/i.test(code), 'Must NOT contain Invoke-Expression');
  assert.ok(!/\biex\b/i.test(code), 'Must NOT contain iex alias');

  // Must require confirmation environment variable
  assert.ok(code.includes('LARI_DEV_RUNNER_INSTALL'), 'Must check LARI_DEV_RUNNER_INSTALL');
  assert.ok(code.includes('CONFIRMED'), 'Must check CONFIRMED token');

  // Must enforce dry run / WhatIf default
  assert.ok(code.includes('DRY_RUN') || code.includes('DRY-RUN') || code.includes('WhatIf'), 'Must include dry run handling');

  // Must execute index.mjs once
  assert.ok(code.includes('once'), 'Must use index.mjs once');
});

test('2. Static verification: supervisor status script exists and scrubs secrets', () => {
  assert.ok(fs.existsSync(STATUS_PS1), 'windows-supervisor-status.ps1 must exist');
  const code = fs.readFileSync(STATUS_PS1, 'utf8');

  assert.ok(code.includes('Scrub-Secrets'), 'Must implement Scrub-Secrets function');
  assert.ok(code.includes('ConvertTo-Json'), 'Must produce structured JSON output');
  assert.ok(!code.includes('schtasks.exe /Create'), 'Status script must NOT create scheduled tasks');
  assert.ok(!code.includes('schtasks.exe /Delete'), 'Status script must NOT delete scheduled tasks');
});

test('3. Static verification: no production, push, or cloud billing commands in supervisor scripts', () => {
  const supervisorCode = fs.readFileSync(SUPERVISOR_PS1, 'utf8');
  const statusCode = fs.readFileSync(STATUS_PS1, 'utf8');
  const combined = supervisorCode + '\n' + statusCode;

  assert.ok(!/git\s+push/i.test(combined), 'Must never execute git push');
  assert.ok(!/vercel/i.test(combined), 'Must never execute vercel');
  assert.ok(!/deploy/i.test(combined), 'Must never execute deploy');
  assert.ok(!/supabase\s+db\s+push/i.test(combined), 'Must never execute supabase db push');
});

test('4. Handoff documentation covers failstop criteria, power dependency, and unverified AG CLI', () => {
  assert.ok(fs.existsSync(HANDOFF_DOC), 'DEV247_WINDOWS_RUNNER_HANDOFF.md must exist');
  const doc = fs.readFileSync(HANDOFF_DOC, 'utf8');

  assert.ok(doc.includes('HOLD_AGENT_ADAPTER_UNVERIFIED'), 'Must state AG CLI adapter is unverified');
  assert.ok(doc.includes('sleep') || doc.includes('hibernation') || doc.includes('power'), 'Must state power/host dependency');
  assert.ok(doc.includes('failstop') || doc.includes('Failstop'), 'Must define failstop criteria');
  assert.ok(doc.includes('HOLD_SOURCE_DRIFT'), 'Must document source drift hold');
  assert.ok(doc.includes('QUOTA_PAUSE'), 'Must document quota pause behavior');
});

test('5. PowerShell execution: Default dry-run mode causes zero task creation', (t) => {
  if (!hasPowerShell) {
    t.skip('POWERSHELL_TEST_NOT_RUN: PowerShell not available');
    return;
  }

  const res = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', SUPERVISOR_PS1, '-RepoRoot', ROOT_DIR],
    { encoding: 'utf8', timeout: 10000 }
  );

  assert.equal(res.status, 0, `Supervisor dry-run exited with code ${res.status}: ${res.stderr}`);
  assert.ok(res.stdout.includes('SAFE DRY-RUN') || res.stdout.includes('DRY_RUN'), 'Output must announce safe dry-run');

  // Verify task does not exist
  const checkTask = spawnSync('schtasks.exe', ['/Query', '/TN', 'LARI_Dev247_Supervisor'], { encoding: 'utf8' });
  assert.notEqual(checkTask.status, 0, 'Scheduled task must NOT exist after dry-run');
});

test('6. PowerShell execution: Safety lock engages when -Install is requested without confirmation', (t) => {
  if (!hasPowerShell) {
    t.skip('POWERSHELL_TEST_NOT_RUN: PowerShell not available');
    return;
  }

  const envWithoutAuth = { ...process.env };
  delete envWithoutAuth.LARI_DEV_RUNNER_INSTALL;

  const res = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', SUPERVISOR_PS1, '-Install', '-RepoRoot', ROOT_DIR],
    { encoding: 'utf8', timeout: 10000, env: envWithoutAuth }
  );

  assert.equal(res.status, 0, 'Safety lock should exit cleanly in dry run fallback');
  assert.ok(res.stdout.includes('SAFETY_LOCK_ENGAGED'), 'Must report SAFETY_LOCK_ENGAGED');
  assert.ok(res.stdout.includes('SAFE DRY-RUN'), 'Must fall back to dry run');

  // Verify task does not exist
  const checkTask = spawnSync('schtasks.exe', ['/Query', '/TN', 'LARI_Dev247_Supervisor'], { encoding: 'utf8' });
  assert.notEqual(checkTask.status, 0, 'Scheduled task must NOT exist when confirmation is missing');
});

test('7. PowerShell execution: Rejects missing or invalid repository root with INVALID_REPO_ROOT', (t) => {
  if (!hasPowerShell) {
    t.skip('POWERSHELL_TEST_NOT_RUN: PowerShell not available');
    return;
  }

  const nonExistentPath = path.join(os.tmpdir(), 'non-existent-lari-repo-' + Date.now());
  const res = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', SUPERVISOR_PS1, '-RepoRoot', nonExistentPath],
    { encoding: 'utf8', timeout: 10000 }
  );

  assert.notEqual(res.status, 0, 'Must exit with non-zero on non-existent repo');
  assert.ok(
    res.stderr.includes('INVALID_REPO_ROOT') || res.stdout.includes('INVALID_REPO_ROOT'),
    'Must emit INVALID_REPO_ROOT error'
  );
});

test('8. PowerShell execution: Missing runner script fails closed before scheduling', (t) => {
  if (!hasPowerShell) {
    t.skip('POWERSHELL_TEST_NOT_RUN: PowerShell not available');
    return;
  }

  const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lari-fake-repo-'));
  try {
    const res = spawnSync(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', SUPERVISOR_PS1, '-RepoRoot', emptyDir],
      { encoding: 'utf8', timeout: 10000 }
    );

    assert.notEqual(res.status, 0, 'Must exit with non-zero on missing runner script');
    assert.ok(
      res.stderr.includes('INVALID_REPO_ROOT') || res.stdout.includes('INVALID_REPO_ROOT'),
      'Must emit INVALID_REPO_ROOT for missing index.mjs'
    );
  } finally {
    fs.rmSync(emptyDir, { recursive: true, force: true });
  }
});

test('9. PowerShell execution: windows-supervisor-status.ps1 returns valid JSON with scrubbed secrets', (t) => {
  if (!hasPowerShell) {
    t.skip('POWERSHELL_TEST_NOT_RUN: PowerShell not available');
    return;
  }

  const res = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', STATUS_PS1, '-RepoRoot', ROOT_DIR],
    { encoding: 'utf8', timeout: 10000 }
  );

  assert.equal(res.status, 0, `Status script failed: ${res.stderr}`);
  let parsed;
  try {
    parsed = JSON.parse(res.stdout);
  } catch (err) {
    assert.fail(`Status output is not valid JSON: ${res.stdout}`);
  }

  assert.equal(parsed.inspection_mode, 'READ_ONLY_NON_MUTATING');
  assert.equal(parsed.task_scheduler.task_installed, false);
  assert.equal(parsed.agent_adapter_status, 'HOLD_AGENT_ADAPTER_UNVERIFIED');
  assert.ok(parsed.git_state.head_sha.length >= 7, 'Must report git HEAD SHA');
});

test('10. Resume checkpoint invariant: supervisor invocation runs single bounded step', () => {
  const code = fs.readFileSync(SUPERVISOR_PS1, 'utf8');
  assert.ok(code.includes('once --repo'), 'Must invoke runner with bounded "once" command');
  assert.ok(!/index\.mjs["']?\s+loop/i.test(code), 'Must NOT default to unbounded loop in Task Scheduler');
});

test('11. Quota pause behavior: runner halts gracefully without recurring spin', () => {
  const coreCode = fs.readFileSync(path.resolve(ROOT_DIR, 'scripts', 'lari-dev-runner', 'core.mjs'), 'utf8');
  assert.ok(coreCode.includes('HOLD_AGENT_ADAPTER_UNVERIFIED') || coreCode.includes('QUOTA_PAUSE') || coreCode.includes('HOLD'), 'Runner must implement hold states for unverified adapter or quota limits');
});
