import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const required = (name, pattern) => {
  const value = process.env[name];
  if (!value || !pattern.test(value)) {
    throw new Error('Missing or invalid ' + name);
  }
  return value;
};

const candidateSha = required('GITHUB_SHA', /^[0-9a-f]{40}$/);
const runId = required('GITHUB_RUN_ID', /^[0-9]+$/);
const runAttempt = required('GITHUB_RUN_ATTEMPT', /^[0-9]+$/);
const workflow = required('GITHUB_WORKFLOW', /^.{1,200}$/);
const outputDirectory = process.env.RELEASE_GATE_EVIDENCE_DIR
  || path.join('test-results', 'release-gate-evidence');

const evidence = {
  evidence_format_version: 1,
  result: 'REQUIRED_JOBS_COMPLETED_BEFORE_EVIDENCE_GENERATION',
  accepted_product_sha: 'b0abd72536d665aaed334c48f69b68e1d8806942',
  candidate_sha: candidateSha,
  github: {
    workflow,
    run_id: runId,
    run_attempt: runAttempt,
  },
  accepted_product_preview: {
    deployment_id: 'dpl_GU7az4n1kdrAYBoGLdNhmNAvQCJA',
    target: null,
  },
  supabase_project_ref: 'rwedeejhjazwjthdjzrt',
  migration: {
    version: '20261011155623',
    canonical_git_lf_sha256: '260F727516CFF4CF0754295206A10E56505A9CA9E22AEC099BB7F21099BD5E13',
    windows_crlf_sha256: '5FCE2EEE8D21A29C68D7685A744234EAC779FB7BB4D92B6E59CBCBD109826970',
    live_staging_applied_by_this_run: false,
  },
  prohibited_actions: {
    backup_dispatched: false,
    live_staging_mutated: false,
    default_branch_merged: false,
    production_promoted: false,
  },
};

fs.mkdirSync(outputDirectory, { recursive: true });
const outputPath = path.join(outputDirectory, 'release-gate-evidence.json');
fs.writeFileSync(outputPath, JSON.stringify(evidence, null, 2) + '\n', 'utf8');
console.log('Release-gate evidence generated: ' + outputPath);
