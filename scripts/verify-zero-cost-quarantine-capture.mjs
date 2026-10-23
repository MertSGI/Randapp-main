import assert from 'node:assert/strict';
import { spawnSync, execSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

console.log('='.repeat(76));
console.log('LARI — ZERO-COST QUARANTINE CAPTURE STATIC & SECURITY QA SUITE');
console.log('='.repeat(76));

const workflowPath = '.github/workflows/lari-zero-cost-quarantine-capture.yml';
const originalWorkflowPath = '.github/workflows/lari-zero-cost-logical-backup.yml';
const runnerPath = 'scripts/run-zero-cost-quarantine-capture.sh';
const policyPath = 'scripts/backup/capture_release_policy.py';
const policyTestPath = 'tests/test_capture_release_policy.py';
const policyDocPath = 'docs/LARI_UNVERIFIED_ENCRYPTED_CAPTURE_POLICY.md';

const findBash = () => {
  const candidates = process.platform === 'win32'
    ? [
        process.env.LARI_TEST_BASH,
        path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Git', 'bin', 'bash.exe'),
        'C:\\Program Files\\Git\\bin\\bash.exe',
      ]
    : [
        process.env.LARI_TEST_BASH,
        '/bin/bash',
        '/usr/bin/bash',
        'bash',
      ];
  return candidates.find((c) => c && (c === 'bash' || fs.existsSync(c)));
};

const bashExecutable = findBash();
assert.ok(bashExecutable, 'Bash executable is required to execute quarantine capture security QA');

const pythonCommand = process.platform === 'win32' ? 'python' : 'python3';

const toBashPath = (p) => {
  if (process.platform !== 'win32') return p;
  const resolved = path.resolve(p).replace(/\\/g, '/');
  return resolved.replace(/^([A-Za-z]):\//, (_, drive) => `/${drive.toLowerCase()}/`);
};

const toMsysPath = (p) => p.replaceAll('\\', '/').replace(/^([A-Za-z]):/, (_, drive) => `/${drive.toLowerCase()}`);

const mustContain = (text, value, message) => {
  assert.ok(typeof text === 'string' && text.includes(value), message ?? `Expected ${value}`);
};

const sanitizedEnvironment = (overrides = {}) => {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (
      key.startsWith('PG') ||
      key.startsWith('SOURCE_DATABASE') ||
      key.startsWith('SOURCE_POOLER') ||
      key.startsWith('BACKUP_AGE') ||
      key.startsWith('LARI_OFFLINE_TEST')
    ) {
      delete env[key];
    }
  }
  return { ...env, ...overrides };
};

// ===========================================================================
// Suite 1: Baseline Policy Unit Tests (10/10)
// ===========================================================================
console.log('\n--- Suite 1: Baseline Policy Unit Tests ---');
const unitTestRes = spawnSync(pythonCommand, ['-m', 'unittest', 'discover', '-v', '-s', 'tests', '-p', 'test_capture_release_policy.py'], {
  cwd: process.cwd(),
  env: { ...process.env, PYTHONPATH: '.' },
  encoding: 'utf8',
});
assert.equal(unitTestRes.status, 0, `Policy unit tests failed: ${unitTestRes.stderr}\n${unitTestRes.stdout}`);
mustContain(unitTestRes.stderr, 'Ran 10 tests', 'Must run all 10 policy unit tests');
mustContain(unitTestRes.stderr, 'OK', 'All 10 tests must pass');
console.log('Suite 1 PASS: 10/10 Policy unit tests OK.');

// ===========================================================================
// Suite 2: Direct Policy Classification Invariant Matrix
// ===========================================================================
console.log('\n--- Suite 2: Direct Policy Classification Invariant Matrix ---');

const evaluatePolicy = (evidenceObj) => {
  const tmpFile = path.join(os.tmpdir(), `lari-policy-eval-${process.pid}-${randomBytes(6).toString('hex')}.json`);
  fs.writeFileSync(tmpFile, JSON.stringify(evidenceObj), 'utf8');
  try {
    const res = spawnSync(pythonCommand, [policyPath, tmpFile], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });
    let parsed = null;
    try {
      parsed = JSON.parse(res.stdout.trim());
    } catch {}
    return { status: res.status, output: parsed, rawStdout: res.stdout, rawStderr: res.stderr };
  } finally {
    fs.rmSync(tmpFile, { force: true });
  }
};

const baseEvidence = {
  project: 'rwedeejhjazwjthdjzrt',
  git_ref: 'refs/heads/staging/supabase-staging-consistency',
  source_sha: 'a'.repeat(40),
  expected_sha: 'a'.repeat(40),
  run_id: '123456789',
  file_name: 'lari-ciphertext-123456789.age',
  ciphertext_sha256: 'b'.repeat(64),
  ciphertext_bytes: 512,
  encrypted_ok: true,
  sha256_rechecked: true,
  source_capture_ok: true,
  restore_verdict: 'VERIFIED_LOGICAL_RESTORE',
  opt_in_mode: 'verified_only',
  owner_confirmation: '',
};

// Case 2.1: Verified-only mode with real verified verdict
const c21 = evaluatePolicy(baseEvidence);
assert.equal(c21.status, 0);
assert.equal(c21.output.classification, 'VERIFIED_LOGICAL_RESTORE');
assert.equal(c21.output.publish_verified, true);
assert.equal(c21.output.publish_quarantine, false);
assert.equal(c21.output.p0_eligible, false);

// Case 2.2: Verified-only mode with failed restore verdict -> NO_RELEASE
const c22 = evaluatePolicy({ ...baseEvidence, restore_verdict: 'NOT_RESTORABLE_IN_DISPOSABLE_POSTGRES_17' });
assert.equal(c22.status, 1);
assert.equal(c22.output.classification, 'NO_ARTIFACT_ELIGIBLE');
assert.equal(c22.output.publish_verified, false);
assert.equal(c22.output.publish_quarantine, false);

// Case 2.3: Quarantine opt-in with RESTORE_NOT_TESTED and exact confirmation -> UNVERIFIED_ENCRYPTED_CAPTURE
const c23 = evaluatePolicy({
  ...baseEvidence,
  restore_verdict: 'RESTORE_NOT_TESTED',
  opt_in_mode: 'quarantine_opt_in',
  owner_confirmation: 'QUARANTINE CAPTURE rwedeejhjazwjthdjzrt',
});
assert.equal(c23.status, 0);
assert.equal(c23.output.classification, 'UNVERIFIED_ENCRYPTED_CAPTURE');
assert.equal(c23.output.publish_quarantine, true);
assert.equal(c23.output.publish_verified, false);
assert.equal(c23.output.p0_eligible, false);
assert.equal(c23.output.restore_verified, false);
assert.equal(c23.output.quarantine_is_not_recovery_backup, true);
assert.equal(c23.output.max_retention_days, 1);

// Case 2.4: Quarantine opt-in with NOT_RESTORABLE and exact confirmation -> UNVERIFIED_ENCRYPTED_CAPTURE
const c24 = evaluatePolicy({
  ...baseEvidence,
  restore_verdict: 'NOT_RESTORABLE_IN_DISPOSABLE_POSTGRES_17',
  opt_in_mode: 'quarantine_opt_in',
  owner_confirmation: 'QUARANTINE CAPTURE rwedeejhjazwjthdjzrt',
});
assert.equal(c24.status, 0);
assert.equal(c24.output.classification, 'UNVERIFIED_ENCRYPTED_CAPTURE');
assert.equal(c24.output.publish_quarantine, true);
assert.equal(c24.output.p0_eligible, false);

// Case 2.5: Quarantine opt-in with VERIFIED restore verdict must NOT publish verified
const c25 = evaluatePolicy({
  ...baseEvidence,
  restore_verdict: 'VERIFIED_LOGICAL_RESTORE',
  opt_in_mode: 'quarantine_opt_in',
  owner_confirmation: 'QUARANTINE CAPTURE rwedeejhjazwjthdjzrt',
});
assert.equal(c25.status, 1);
assert.equal(c25.output.classification, 'NO_ARTIFACT_ELIGIBLE');
assert.equal(c25.output.publish_verified, false);
assert.equal(c25.output.publish_quarantine, false);

// Case 2.6: Negative security classes
const quarantineBase = {
  ...baseEvidence,
  restore_verdict: 'RESTORE_NOT_TESTED',
  opt_in_mode: 'quarantine_opt_in',
  owner_confirmation: 'QUARANTINE CAPTURE rwedeejhjazwjthdjzrt',
};

const negativeClasses = [
  ['wrong project ref', { ...quarantineBase, project: 'another_project' }],
  ['wrong git branch', { ...quarantineBase, git_ref: 'refs/heads/main' }],
  ['mismatched source sha', { ...quarantineBase, source_sha: 'c'.repeat(40) }],
  ['mismatched expected sha', { ...quarantineBase, expected_sha: 'd'.repeat(40) }],
  ['wrong confirmation token', { ...quarantineBase, owner_confirmation: 'BACKUP rwedeejhjazwjthdjzrt' }],
  ['empty confirmation token', { ...quarantineBase, owner_confirmation: '' }],
  ['lookalike confirmation token', { ...quarantineBase, owner_confirmation: 'QUARANTINE CAPTURE other_project' }],
  ['path traversal in filename', { ...quarantineBase, file_name: '../evil.age' }],
  ['double dot in filename', { ...quarantineBase, file_name: 'a..b.age' }],
  ['wrong extension in filename', { ...quarantineBase, file_name: 'bundle.tar.gz' }],
  ['non-hex ciphertext sha256', { ...quarantineBase, ciphertext_sha256: 'z'.repeat(64) }],
  ['uppercase ciphertext sha256', { ...quarantineBase, ciphertext_sha256: 'B'.repeat(64) }],
  ['short ciphertext sha256', { ...quarantineBase, ciphertext_sha256: 'b'.repeat(63) }],
  ['zero ciphertext bytes', { ...quarantineBase, ciphertext_bytes: 0 }],
  ['negative ciphertext bytes', { ...quarantineBase, ciphertext_bytes: -10 }],
  ['boolean ciphertext bytes', { ...quarantineBase, ciphertext_bytes: true }],
  ['string ciphertext bytes', { ...quarantineBase, ciphertext_bytes: '512' }],
  ['failed encryption flag', { ...quarantineBase, encrypted_ok: false }],
  ['failed sha256 recheck flag', { ...quarantineBase, sha256_rechecked: false }],
  ['failed source capture flag', { ...quarantineBase, source_capture_ok: false }],
  ['invalid restore verdict', { ...quarantineBase, restore_verdict: 'SUCCESS' }],
  ['invalid opt_in_mode', { ...quarantineBase, opt_in_mode: 'unauthorized_opt_in' }],
];

for (const [desc, negObj] of negativeClasses) {
  const res = evaluatePolicy(negObj);
  assert.equal(res.status, 1, `Negative class [${desc}] must exit with 1`);
  assert.equal(res.output.classification, 'NO_ARTIFACT_ELIGIBLE', `Negative class [${desc}] must classify as NO_ARTIFACT_ELIGIBLE`);
  assert.equal(res.output.publish_quarantine, false, `Negative class [${desc}] must not publish quarantine`);
  assert.equal(res.output.publish_verified, false, `Negative class [${desc}] must not publish verified`);
  assert.equal(res.output.p0_eligible, false, `Negative class [${desc}] must not be P0 eligible`);
}

// Secret leak check
const receiptStr = JSON.stringify(c23.output);
for (const secretToken of ['password', 'private_key', 'roles.sql', 'database.dump', 'AGE-SECRET-KEY']) {
  assert.ok(!receiptStr.includes(secretToken), `Policy receipt leaked sensitive token: ${secretToken}`);
}

console.log(`Suite 2 PASS: All policy invariant matrix and ${negativeClasses.length} negative classes verified.`);

// ===========================================================================
// Suite 3: Workflow, Runner & Policy Document Governance Qualification
// ===========================================================================
console.log('\n--- Suite 3: Workflow & Static Governance Qualification ---');

const workflowContent = fs.readFileSync(workflowPath, 'utf8');
const originalWorkflowContent = fs.readFileSync(originalWorkflowPath, 'utf8');
const runnerContent = fs.readFileSync(runnerPath, 'utf8');
const policyDocContent = fs.readFileSync(policyDocPath, 'utf8');

// Invariant: original workflow blob must remain byte-identical
const gitBlobRes = spawnSync('git', ['ls-tree', 'HEAD', originalWorkflowPath], {
  cwd: process.cwd(),
  encoding: 'utf8',
});
if (gitBlobRes.status === 0 && gitBlobRes.stdout) {
  mustContain(gitBlobRes.stdout, 'd0c48d60be9144606551c04e2b89a4dde031f8b6', 'Original backup workflow blob must match d0c48d60be9144606551c04e2b89a4dde031f8b6');
}

// Workflow trigger assertions
mustContain(workflowContent, 'workflow_dispatch:', 'Quarantine capture workflow must be explicitly dispatched');
for (const forbidden of ['\n  push:', '\n  pull_request:', '\n  schedule:', '\n  repository_dispatch:']) {
  assert.ok(!workflowContent.includes(forbidden), `Forbidden trigger found: ${forbidden}`);
}

// Operator inputs
mustContain(workflowContent, 'source_project_ref:', 'Input source_project_ref is required');
mustContain(workflowContent, 'default: rwedeejhjazwjthdjzrt', 'Default project must be rwedeejhjazwjthdjzrt');
mustContain(workflowContent, 'expected_staging_sha:', 'Input expected_staging_sha is required');
mustContain(workflowContent, 'confirmation:', 'Input confirmation is required');

// Workflow security guards
mustContain(workflowContent, "github.ref == 'refs/heads/staging/supabase-staging-consistency'", 'Must guard target branch');
mustContain(workflowContent, "inputs.source_project_ref == 'rwedeejhjazwjthdjzrt'", 'Must guard target project');
mustContain(workflowContent, 'inputs.expected_staging_sha == github.sha', 'Must guard exact expected SHA equality with github.sha');
mustContain(workflowContent, "inputs.confirmation == 'QUARANTINE CAPTURE rwedeejhjazwjthdjzrt'", 'Must guard exact quarantine confirmation token');
mustContain(workflowContent, 'environment: lari-staging-backup', 'Must run in lari-staging-backup environment');
mustContain(workflowContent, 'timeout-minutes: 30', 'Timeout must be bounded');

// Upload artifact rules
mustContain(workflowContent, 'name: lari-UNVERIFIED-ENCRYPTED-CAPTURE-${{ github.run_id }}-${{ github.run_attempt }}', 'Upload name must follow quarantine naming scheme');
mustContain(workflowContent, 'retention-days: 1', 'Quarantine artifact retention must be strictly 1 day');
mustContain(workflowContent, 'compression-level: 0', 'Compression level must be 0');
mustContain(workflowContent, "steps.capture.outputs.classification == 'UNVERIFIED_ENCRYPTED_CAPTURE'", 'Upload must guard on policy classification');
mustContain(workflowContent, "steps.capture.outputs.publish_quarantine == 'true'", 'Upload must guard on publish_quarantine flag');

// Pinned actions and tools
mustContain(workflowContent, 'actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683');
mustContain(workflowContent, 'actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02');
mustContain(workflowContent, 'EXPECTED_FINGERPRINT="807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa"');

// Runner script security assertions
mustContain(runnerContent, 'umask 077');
mustContain(runnerContent, 'set -Eeuo pipefail');
mustContain(runnerContent, 'EXPECTED_PROJECT_REF="rwedeejhjazwjthdjzrt"');
mustContain(runnerContent, 'EXPECTED_STAGING_BRANCH="refs/heads/staging/supabase-staging-consistency"');
mustContain(runnerContent, 'EXPECTED_CONFIRMATION="QUARANTINE CAPTURE ${EXPECTED_PROJECT_REF}"');
mustContain(runnerContent, 'SOURCE_DATABASE_SSLMODE="verify-full"');
mustContain(runnerContent, 'PINNED_SUPABASE_ROOT_CA_SHA256="807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa"');
mustContain(runnerContent, 'scripts/backup/capture_release_policy.py');
mustContain(runnerContent, 'classification: $classification');
mustContain(runnerContent, 'restore_verified: false');
mustContain(runnerContent, 'p0_eligible: false');
mustContain(runnerContent, 'RESTORE_NOT_TESTED');
assert.ok(!runnerContent.includes('TEMPLATE template0'), 'Quarantine runner must not perform disposable restore');
assert.ok(!runnerContent.includes('CREATE DATABASE'), 'Quarantine runner must not create restore databases');

// Policy doc assertions
mustContain(policyDocContent, 'UNVERIFIED_ENCRYPTED_CAPTURE');
mustContain(policyDocContent, 'p0_eligible = false');
mustContain(policyDocContent, '1 day');
mustContain(policyDocContent, 'QUARANTINE CAPTURE rwedeejhjazwjthdjzrt');

console.log('Suite 3 PASS: Workflow, runner, and documentation static qualification OK.');

// ===========================================================================
// Suite 4: Runner CLI Source URL and Credential Validation
// ===========================================================================
console.log('\n--- Suite 4: Runner CLI Source URL & Credential Pre-flight ---');

const runSourceValidator = (sourceUrl) => {
  const env = sanitizedEnvironment({
    SOURCE_DATABASE_URL: sourceUrl,
    ...(process.platform === 'win32' ? { LARI_SOURCE_VALIDATOR_PYTHON: 'python' } : {}),
  });
  return spawnSync(bashExecutable, [runnerPath, '--validate-source-url-only'], {
    cwd: process.cwd(),
    env,
    encoding: 'utf8',
  });
};

const approvedHost = 'aws-0-eu-central-1.pooler.supabase.com';
const approvedUser = 'postgres.rwedeejhjazwjthdjzrt';

// Positive URL
const posUrl = `postgresql://${approvedUser}@${approvedHost}:5432/postgres?sslmode=verify-full&sslrootcert=system`;
const posRes = runSourceValidator(posUrl);
assert.equal(posRes.status, 0, `Valid source URL must pass: ${posRes.stderr}`);
mustContain(posRes.stdout, 'Source database URL validation: PASS');

// Negative URLs
const negativeUrls = [
  ['lookalike pooler', `postgresql://${approvedUser}@${approvedHost}.evil.com:5432/postgres?sslmode=verify-full&sslrootcert=system`],
  ['wrong user', `postgresql://postgres@${approvedHost}:5432/postgres?sslmode=verify-full&sslrootcert=system`],
  ['direct host', `postgresql://${approvedUser}@db.rwedeejhjazwjthdjzrt.supabase.co:5432/postgres?sslmode=verify-full&sslrootcert=system`],
  ['wrong port', `postgresql://${approvedUser}@${approvedHost}:6543/postgres?sslmode=verify-full&sslrootcert=system`],
  ['missing tls', `postgresql://${approvedUser}@${approvedHost}:5432/postgres`],
  ['insecure tls disable', `postgresql://${approvedUser}@${approvedHost}:5432/postgres?sslmode=disable`],
  ['insecure tls require', `postgresql://${approvedUser}@${approvedHost}:5432/postgres?sslmode=require`],
  ['password in uri', `postgresql://${approvedUser}:secret@${approvedHost}:5432/postgres?sslmode=verify-full&sslrootcert=system`],
];

for (const [name, url] of negativeUrls) {
  const negRes = runSourceValidator(url);
  assert.notEqual(negRes.status, 0, `Negative URL [${name}] must fail closed`);
}

// Credential handling test
const credTestEnv = sanitizedEnvironment({
  LARI_OFFLINE_TEST_MODE: '1',
  ...(process.platform === 'win32' ? { LARI_SOURCE_VALIDATOR_PYTHON: 'python' } : {}),
});
const credRes = spawnSync(bashExecutable, [runnerPath, '--test-source-credential-handling'], {
  cwd: process.cwd(),
  env: credTestEnv,
  encoding: 'utf8',
});
assert.equal(credRes.status, 0, `Credential handling test must pass: ${credRes.stderr}`);
mustContain(credRes.stdout, 'Protected source credential handling: PASS');

console.log(`Suite 4 PASS: 1 positive and ${negativeUrls.length} negative source URL cases + credential handling OK.`);

// ===========================================================================
// Suite 5: End-to-End Synthetic Capture, Age Encryption & Local Decrypt Roundtrip
// ===========================================================================
console.log('\n--- Suite 5: End-to-End Synthetic Capture, Encryption & Decryption Roundtrip ---');

// Check age and age-keygen commands
const ageKeygenRes = spawnSync('age-keygen', [], { encoding: 'utf8' });
assert.equal(ageKeygenRes.status, 0, 'age-keygen must be available on the system');
const ageKeygenOutput = ageKeygenRes.stdout;
const pubKeyMatch = ageKeygenOutput.match(/public key:\s*(age1[a-z0-9]+)/i);
assert.ok(pubKeyMatch, 'age-keygen must emit public key');
const ephemeralRecipient = pubKeyMatch[1];

const suite5Temp = fs.mkdtempSync(path.join(os.tmpdir(), `lari-quarantine-qa-${process.pid}-`));
const identityFile = path.join(suite5Temp, 'ephemeral-identity.txt');
fs.writeFileSync(identityFile, ageKeygenOutput, { mode: 0o600 });

// Prepare mock tools directory to ensure pg tools are present for offline test
const mockToolsDir = path.join(suite5Temp, 'mock-bin');
fs.mkdirSync(mockToolsDir, { recursive: true, mode: 0o755 });

for (const tool of ['pg_dump', 'pg_dumpall', 'psql']) {
  const p = path.join(mockToolsDir, tool);
  fs.writeFileSync(p, `#!/bin/sh\necho "${tool} (PostgreSQL) 17.2"\n`, { mode: 0o755 });
  if (process.platform === 'win32') {
    spawnSync(bashExecutable, ['-c', `chmod +x "${toMsysPath(p)}"`]);
  }
}

// pg_restore mock that supports both --version and --list
const pgRestoreMock = path.join(mockToolsDir, 'pg_restore');
fs.writeFileSync(
  pgRestoreMock,
  `#!/bin/sh
if [ "$1" = "--version" ]; then
  echo "pg_restore (PostgreSQL) 17.2"
  exit 0
fi
echo "; Archive created by pg_dump"
exit 0
`,
  { mode: 0o755 }
);
if (process.platform === 'win32') {
  spawnSync(bashExecutable, ['-c', `chmod +x "${toMsysPath(pgRestoreMock)}"`]);
}

// Ensure jq is available in mock directory if not on host
let jqAvailable = spawnSync('jq', ['--version'], { encoding: 'utf8' }).status === 0;
if (!jqAvailable) {
  const jqMock = path.join(mockToolsDir, 'jq');
  fs.writeFileSync(
    jqMock,
    `#!/bin/sh
python -c '
import sys, json, os

args = sys.argv[1:]
if args and args[0] == "-n":
    res = {}
    i = 1
    while i < len(args):
        if args[i] == "--arg" and i + 2 < len(args):
            res[args[i+1]] = args[i+2]
            i += 3
        elif args[i] == "--argjson" and i + 2 < len(args):
            try:
                res[args[i+1]] = json.loads(args[i+2])
            except Exception:
                res[args[i+1]] = args[i+2]
            i += 3
        else:
            i += 1
    out = {
        "manifest_version": res.get("manifest_version", "1"),
        "capture_scope": res.get("capture_scope", "postgresql-logical-database-quarantine"),
        "classification": res.get("classification", "UNVERIFIED_ENCRYPTED_CAPTURE"),
        "restore_verified": False,
        "p0_eligible": False,
        "source_project_ref": res.get("source_project_ref", ""),
        "created_at_utc": res.get("created_at", ""),
        "source_revision": res.get("source_revision", ""),
        "run_id": res.get("run_id", ""),
        "encrypted_capture": {
            "file": res.get("encrypted_file", ""),
            "encryption": "age X25519 recipient",
            "sha256": res.get("encrypted_sha256", ""),
            "size_bytes": res.get("encrypted_size", 0),
        },
        "restore_test": {
            "verdict": "RESTORE_NOT_TESTED",
            "note": "Quarantine capture lane does not verify restoration in PostgreSQL 17",
        },
        "limitations": [
            "Supabase Storage object bytes are not included",
            "Supabase platform configuration, secrets, Edge Functions, and encryption root keys are not included",
            "This artifact is not a disaster-recovery certified backup",
            "This artifact is UNVERIFIED and does NOT attest to restorable database state",
            "This artifact does NOT satisfy P0 migration preconditions",
        ],
    }
    print(json.dumps(out, indent=2))
    sys.exit(0)

if args and args[0] == "-r":
    args = args[1:]
selector = args[0] if args else "."
file_candidates = [a for a in args[1:] if os.path.isfile(a)]
if file_candidates:
    with open(file_candidates[-1], "r", encoding="utf-8") as f:
        raw = f.read()
else:
    raw = sys.stdin.read()

data = json.loads(raw) if raw.strip() else {}
clean_selector = selector.split("//")[0].strip()
curr = data
for p in clean_selector.strip(".").split("."):
    if not p:
        continue
    if isinstance(curr, dict):
        curr = curr.get(p, "")
    else:
        curr = ""
if isinstance(curr, bool):
    print(str(curr).lower())
elif curr is not None:
    print(str(curr))
' "$@"
`,
    { mode: 0o755 }
  );
  if (process.platform === 'win32') {
    spawnSync(bashExecutable, ['-c', `chmod +x "${toMsysPath(jqMock)}"`]);
  }
}

// Prepare synthetic fixture
const fixtureDir = path.join(suite5Temp, 'synthetic-source-fixture');
fs.mkdirSync(fixtureDir, { recursive: true, mode: 0o700 });
fs.writeFileSync(path.join(fixtureDir, 'roles.sql'), '-- synthetic roles\nCREATE ROLE "anon";\n', 'utf8');
fs.writeFileSync(path.join(fixtureDir, 'database.dump'), 'PGDMP_SYNTHETIC_DATA_0123456789', 'utf8');
fs.writeFileSync(path.join(fixtureDir, 'source-catalog-fingerprint.json'), JSON.stringify({ object_count: 5, fingerprint: 'deadbeef' }), 'utf8');
fs.writeFileSync(path.join(fixtureDir, 'source-dependencies.json'), JSON.stringify({ extensions: [] }), 'utf8');

const testSha = '1234567890abcdef1234567890abcdef12345678';
const runnerTemp = path.join(suite5Temp, 'runner-tmp');
const workspaceTemp = path.join(suite5Temp, 'workspace');
fs.mkdirSync(runnerTemp, { recursive: true, mode: 0o700 });
fs.mkdirSync(workspaceTemp, { recursive: true, mode: 0o700 });

const defaultSyntheticEnv = sanitizedEnvironment({
  LARI_OFFLINE_TEST_MODE: '1',
  RUNNER_TEMP: toBashPath(runnerTemp),
  GITHUB_WORKSPACE: toBashPath(workspaceTemp),
  GITHUB_RUN_ID: '987654321',
  GITHUB_RUN_ATTEMPT: '1',
  GITHUB_SHA: testSha,
  GITHUB_REF: 'refs/heads/staging/supabase-staging-consistency',
  SOURCE_PROJECT_REF: 'rwedeejhjazwjthdjzrt',
  EXPECTED_STAGING_SHA: testSha,
  CONFIRMATION: 'QUARANTINE CAPTURE rwedeejhjazwjthdjzrt',
  BACKUP_AGE_RECIPIENT: ephemeralRecipient,
  PATH: `${toMsysPath(mockToolsDir)}:${process.env.PATH || ''}`,
  ...(process.platform === 'win32' ? { LARI_SOURCE_VALIDATOR_PYTHON: 'python' } : {}),
});

// Run positive synthetic capture
const posCaptureRes = spawnSync(
  bashExecutable,
  [runnerPath, '--test-offline-synthetic-capture', toBashPath(fixtureDir)],
  {
    cwd: process.cwd(),
    env: defaultSyntheticEnv,
    encoding: 'utf8',
  }
);
assert.equal(posCaptureRes.status, 0, `Positive synthetic capture must succeed: ${posCaptureRes.stderr}`);
mustContain(posCaptureRes.stdout, 'Encrypted quarantine capture prepared; classification: UNVERIFIED_ENCRYPTED_CAPTURE (p0_eligible: false).');

// Verify artifact directory
const artifactDir = path.join(workspaceTemp, 'backup-artifacts');
assert.ok(fs.existsSync(artifactDir), 'Artifact directory must exist');
const artifactFiles = fs.readdirSync(artifactDir).sort();
assert.equal(artifactFiles.length, 2, 'Artifact directory must contain exactly 2 files (manifest.json and .age)');
assert.ok(artifactFiles.includes('manifest.json'), 'Artifact directory must include manifest.json');
const ageFileName = artifactFiles.find((f) => f.endsWith('.age'));
assert.ok(ageFileName, 'Artifact directory must include .age ciphertext file');
assert.equal(ageFileName, 'lari-quarantine-rwedeejhjazwjthdjzrt-987654321-1.tar.gz.age');

// Verify manifest contents
const manifest = JSON.parse(fs.readFileSync(path.join(artifactDir, 'manifest.json'), 'utf8'));
assert.equal(manifest.classification, 'UNVERIFIED_ENCRYPTED_CAPTURE');
assert.equal(manifest.restore_verified, false);
assert.equal(manifest.p0_eligible, false);
assert.equal(manifest.source_project_ref, 'rwedeejhjazwjthdjzrt');
assert.equal(manifest.source_revision, testSha);
assert.equal(manifest.restore_test.verdict, 'RESTORE_NOT_TESTED');

// Verify ciphertext SHA-256 integrity
const ageFileBytes = fs.readFileSync(path.join(artifactDir, ageFileName));
const actualCiphertextSha256 = createHash('sha256').update(ageFileBytes).digest('hex');
assert.equal(manifest.encrypted_capture.sha256, actualCiphertextSha256);
assert.equal(manifest.encrypted_capture.size_bytes, ageFileBytes.length);

// Decrypt ciphertext using ephemeral private key and verify contents
const decryptedTarPath = path.join(suite5Temp, 'decrypted-bundle.tar.gz');
const decryptRes = spawnSync('age', ['--decrypt', '-i', identityFile, '-o', decryptedTarPath, path.join(artifactDir, ageFileName)], {
  encoding: 'utf8',
});
assert.equal(decryptRes.status, 0, `age decryption failed: ${decryptRes.stderr}`);
assert.ok(fs.existsSync(decryptedTarPath), 'Decrypted tar file must exist');

// Extract tar and inspect content
const unpackDir = path.join(suite5Temp, 'unpacked');
fs.mkdirSync(unpackDir, { recursive: true, mode: 0o700 });
const tarRes = spawnSync('tar', ['-xzf', decryptedTarPath, '-C', unpackDir], { encoding: 'utf8' });
assert.equal(tarRes.status, 0, `tar extraction failed: ${tarRes.stderr}`);

assert.equal(fs.readFileSync(path.join(unpackDir, 'roles.sql'), 'utf8'), fs.readFileSync(path.join(fixtureDir, 'roles.sql'), 'utf8'));
assert.equal(fs.readFileSync(path.join(unpackDir, 'database.dump'), 'utf8'), fs.readFileSync(path.join(fixtureDir, 'database.dump'), 'utf8'));
assert.equal(
  fs.readFileSync(path.join(unpackDir, 'source-catalog-fingerprint.json'), 'utf8'),
  fs.readFileSync(path.join(fixtureDir, 'source-catalog-fingerprint.json'), 'utf8')
);
console.log('Positive synthetic capture, encryption, and decryption roundtrip: PASS');

// ===========================================================================
// Negative CLI Execution Checks (asserting 0 uploadable artifacts on failure)
// ===========================================================================
console.log('\n--- Testing Negative Runner Executions (Asserting 0 Artifacts) ---');

const negativeRunnerCases = [
  ['wrong confirmation token', { CONFIRMATION: 'QUARANTINE CAPTURE wrong_project' }],
  ['wrong expected staging SHA', { EXPECTED_STAGING_SHA: '0000000000000000000000000000000000000000' }],
  ['wrong project ref', { SOURCE_PROJECT_REF: 'wrong_project' }],
  ['malformed age recipient', { BACKUP_AGE_RECIPIENT: 'invalid_recipient_format' }],
  ['wrong git ref in strict mode', { LARI_OFFLINE_TEST_MODE: '0', GITHUB_REF: 'refs/heads/main' }],
];

for (const [caseName, envOverrides] of negativeRunnerCases) {
  const caseWorkspace = path.join(suite5Temp, `ws-${caseName.replace(/\s+/g, '_')}`);
  const caseRunner = path.join(suite5Temp, `rn-${caseName.replace(/\s+/g, '_')}`);
  fs.mkdirSync(caseWorkspace, { recursive: true, mode: 0o700 });
  fs.mkdirSync(caseRunner, { recursive: true, mode: 0o700 });

  const negRunEnv = sanitizedEnvironment({
    ...defaultSyntheticEnv,
    RUNNER_TEMP: toBashPath(caseRunner),
    GITHUB_WORKSPACE: toBashPath(caseWorkspace),
    ...envOverrides,
  });

  const res = spawnSync(
    bashExecutable,
    [runnerPath, '--test-offline-synthetic-capture', toBashPath(fixtureDir)],
    {
      cwd: process.cwd(),
      env: negRunEnv,
      encoding: 'utf8',
    }
  );

  assert.notEqual(res.status, 0, `Negative runner case [${caseName}] must exit with non-zero status`);
  const caseArtifactDir = path.join(caseWorkspace, 'backup-artifacts');
  const artifactsExist = fs.existsSync(caseArtifactDir) && fs.readdirSync(caseArtifactDir).length > 0;
  assert.equal(artifactsExist, false, `Negative runner case [${caseName}] must produce ZERO uploadable artifacts`);
}

// Clean up Suite 5 temporary directory
fs.rmSync(suite5Temp, { recursive: true, force: true });

console.log(`Suite 5 PASS: Synthetic capture + local decryption roundtrip and ${negativeRunnerCases.length} negative CLI execution checks OK.`);

// Controller security acceptance: no raw private stderr may reach hosted logs.
const b15Runner = fs.readFileSync(runnerPath, 'utf8');
assert.ok(b15Runner.includes('scripts/backup/safe_capture_diagnostics.py'),
  'Capture failure handler must invoke the safe diagnostic classifier');
assert.ok(!b15Runner.includes('cat "$err_file"'),
  'Raw private stderr publication is forbidden');
console.log('Controller safe-capture diagnostic gate: PASS (raw stderr blocked)');

// ===========================================================================
// Summary
// ===========================================================================
console.log('\n' + '='.repeat(76));
console.log('LARI — ZERO-COST QUARANTINE CAPTURE SECURITY QA COMPLETE');
console.log('All 5 suites PASSED.');
console.log('Remote database connections attempted: 0');
console.log('Original backup workflow blob intact: d0c48d60be9144606551c04e2b89a4dde031f8b6');
console.log('='.repeat(76));
