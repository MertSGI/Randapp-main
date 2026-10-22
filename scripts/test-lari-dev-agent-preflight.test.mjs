import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT_DIR = process.cwd();
const SCRIPT_PATH = path.resolve(ROOT_DIR, 'scripts', 'lari-dev-runner', 'agent-cli-preflight.ps1');

// Probe PowerShell availability
const probePs = spawnSync('powershell.exe', ['-NoProfile', '-Command', 'Write-Output OK'], {
  encoding: 'utf8',
  timeout: 5000,
});
const hasPowerShell = probePs.status === 0 && probePs.stdout.includes('OK');

test('1. Nonexistent executable: Probing nonexistent tool reports NOT_FOUND without throwing', (t) => {
  if (!hasPowerShell) {
    t.skip('POWERSHELL_NOT_AVAILABLE');
    return;
  }

  const res = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT_PATH, '-RepoRoot', ROOT_DIR, '-CandidateOverride', 'nonexistent_agent_tool_xyz'],
    { encoding: 'utf8', timeout: 10000 }
  );

  assert.equal(res.status, 0, `Script must exit 0 on clean inspection: ${res.stderr}`);
  const data = JSON.parse(res.stdout.trim());
  assert.equal(data.runnerActive, false, 'runnerActive must be strictly false');
  assert.equal(data.candidates[0].command, 'nonexistent_agent_tool_xyz');
  assert.equal(data.candidates[0].status, 'NOT_FOUND');
  assert.equal(data.candidates[0].found, false);
});

test('2. Malicious arguments: Candidate override with command separators is rejected', (t) => {
  if (!hasPowerShell) {
    t.skip('POWERSHELL_NOT_AVAILABLE');
    return;
  }

  const res = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT_PATH, '-RepoRoot', ROOT_DIR, '-CandidateOverride', 'codex; rm -rf /'],
    { encoding: 'utf8', timeout: 10000 }
  );

  assert.notEqual(res.status, 0, 'Script must exit non-zero on unsafe arguments');
  const data = JSON.parse(res.stdout.trim());
  assert.equal(data.status, 'UNVERIFIED');
  assert.equal(data.runnerActive, false);
  assert.equal(data.holdReason, 'UNSAFE_ARGUMENTS_DETECTED');
});

test('3. Wrong repo path: Nonexistent or invalid directory is rejected fail-closed', (t) => {
  if (!hasPowerShell) {
    t.skip('POWERSHELL_NOT_AVAILABLE');
    return;
  }

  const alienPath = path.resolve(ROOT_DIR, '..', 'fake_alien_repo_dir_123');
  const res = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT_PATH, '-RepoRoot', alienPath],
    { encoding: 'utf8', timeout: 10000 }
  );

  assert.notEqual(res.status, 0, 'Script must reject invalid repo root');
  const data = JSON.parse(res.stdout.trim());
  assert.equal(data.status, 'UNVERIFIED');
  assert.equal(data.runnerActive, false);
  assert.equal(data.holdReason, 'INVALID_REPO_ROOT');
});

test('4. Bounded timeout: Script enforces timeout limit parameter', (t) => {
  if (!hasPowerShell) {
    t.skip('POWERSHELL_NOT_AVAILABLE');
    return;
  }

  const startTime = Date.now();
  const res = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT_PATH, '-RepoRoot', ROOT_DIR, '-TimeoutSeconds', '2'],
    { encoding: 'utf8', timeout: 15000 }
  );
  const elapsed = Date.now() - startTime;

  assert.equal(res.status, 0);
  assert.ok(elapsed < 12000, `Execution should finish within bounded window, took ${elapsed}ms`);
  const data = JSON.parse(res.stdout.trim());
  assert.equal(data.runnerActive, false);
});

test('5. Secret redaction: Scrub-Secrets removes tokens and credentials from outputs', (t) => {
  if (!hasPowerShell) {
    t.skip('POWERSHELL_NOT_AVAILABLE');
    return;
  }

  const tokenString = 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const res = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT_PATH, '-RepoRoot', `${ROOT_DIR}?token=${tokenString}`],
    { encoding: 'utf8', timeout: 10000 }
  );

  assert.ok(!res.stdout.includes(tokenString), 'Token must be scrubbed from output');
  assert.ok(!res.stderr.includes(tokenString), 'Token must be scrubbed from stderr');
});

test('6. UI_ONLY reality check: Desktop Antigravity environment does not trigger active runner', (t) => {
  if (!hasPowerShell) {
    t.skip('POWERSHELL_NOT_AVAILABLE');
    return;
  }

  const res = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT_PATH, '-RepoRoot', ROOT_DIR],
    { encoding: 'utf8', timeout: 10000 }
  );

  assert.equal(res.status, 0);
  const data = JSON.parse(res.stdout.trim());

  // In our environment where AG UI is installed in user profile, it must be diagnosed as UI_ONLY
  if (data.detectedUiOnly) {
    assert.equal(data.status, 'UI_ONLY', 'Must classify detected IDE as UI_ONLY, not CLI_AVAILABLE');
    assert.equal(data.cliAvailable, false, 'Desktop UI must not be claimed as supported CLI');
  }

  // In all cases, runnerActive must remain strictly false and holdReason must be unverified hold
  assert.equal(data.runnerActive, false, 'runnerActive must remain false');
  assert.equal(data.holdReason, 'HOLD_AGENT_ADAPTER_UNVERIFIED');
});

test('7. Static safety audit: agent-cli-preflight.ps1 strictly read-only', () => {
  assert.ok(fs.existsSync(SCRIPT_PATH), 'agent-cli-preflight.ps1 must exist');
  const code = fs.readFileSync(SCRIPT_PATH, 'utf8');

  // Must not invoke dangerous creation/remote commands
  assert.ok(!/Invoke-WebRequest/i.test(code), 'Must not use Invoke-WebRequest');
  assert.ok(!/curl/i.test(code), 'Must not use curl');
  assert.ok(!/git\s+push/i.test(code), 'Must not use git push');
  assert.ok(!/schtasks/i.test(code), 'Must not use schtasks');
  assert.ok(!/Invoke-Expression/i.test(code), 'Must not use Invoke-Expression');
  assert.ok(!/\biex\b/i.test(code), 'Must not use iex');
  assert.ok(code.includes('runnerActive = $false'), 'Must enforce runnerActive = $false');
});
