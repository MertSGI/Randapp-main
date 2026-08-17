import fs from 'fs';
import path from 'path';

function validateProjectControl() {
  console.log('=== RUNNING PROJECT CONTROL PLANE VALIDATION ===');
  let errors = [];

  const rootDir = process.cwd();
  const statePath = path.join(rootDir, 'docs', 'project-control', 'STATE.json');
  const roadmapPath = path.join(rootDir, 'docs', 'project-control', 'ROADMAP_12W.md');
  const evidencePath = path.join(rootDir, 'docs', 'project-control', 'EVIDENCE.jsonl');

  // 1. Validate STATE.json
  if (!fs.existsSync(statePath)) {
    errors.push('STATE.json does not exist');
  } else {
    try {
      const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));

      // Validate required fields
      const requiredFields = [
        'schema_version', 'updated_at', 'product', 'repository',
        'delivery_commitment', 'master_delivery_train', 'current_milestone',
        'current_status', 'canonical_refs', 'accepted_gates',
        'active_workstreams', 'external_dependencies', 'non_blocking_validation',
        'current_blockers', 'next_action', 'evidence_policy', 'reopen_policy'
      ];
      for (const field of requiredFields) {
        if (!(field in state)) {
          errors.push(`STATE.json missing required top-level field: ${field}`);
        }
      }

      // Delivery commitment validation
      if (state.delivery_commitment) {
        if (state.delivery_commitment.duration_weeks !== 12) {
          errors.push(`STATE.json delivery_commitment.duration_weeks must be 12 (found ${state.delivery_commitment.duration_weeks})`);
        }
        if (state.delivery_commitment.reset_from_today_allowed !== false) {
          errors.push('STATE.json delivery_commitment.reset_from_today_allowed must be false');
        }
      }

      // Check accepted gate statuses and SHAs
      const allowedStatuses = ['CLOSED', 'CLOSED_PROVEN', 'CLOSED_VERIFIED', 'HOLD', 'HOLD_PENDING_LITERAL_EXECUTION_TRUTH', 'NOT_STARTED'];
      const allowedLevels = ['E0_CLAIM_ONLY', 'E1_SOURCE_PROVEN', 'E2_EXECUTABLE_EXACT_SHA_CI', 'E3_ISOLATED_RUNTIME_E2E', 'E4_SHARED_STAGING_LIVE', 'E5_EXTERNAL_FIELD_UAT'];

      if (Array.isArray(state.accepted_gates)) {
        for (const gate of state.accepted_gates) {
          if (!allowedStatuses.includes(gate.status)) {
            errors.push(`Gate ${gate.gate} has invalid status: ${gate.status}`);
          }
          if (!allowedLevels.includes(gate.evidence_level)) {
            errors.push(`Gate ${gate.gate} has invalid evidence_level: ${gate.evidence_level}`);
          }
          if (gate.tested_sha && !/^[0-9a-f]{40}$/i.test(gate.tested_sha)) {
            errors.push(`Gate ${gate.gate} has invalid tested_sha format: ${gate.tested_sha}`);
          }
          if (gate.run_ids) {
            for (const rid of gate.run_ids) {
              if (!/^\d+$/.test(rid)) {
                errors.push(`Gate ${gate.gate} has non-numeric run_id: ${rid}`);
              }
            }
          }
        }
      }

      // CORE-RC.3 state check
      if (state.active_workstreams?.core_rc3?.status === 'CLOSED' || state.active_workstreams?.core_rc3?.status === 'CLOSED_PROVEN') {
        errors.push('CORE-RC.3 must NOT be marked CLOSED in initial STATE.json');
      }

      // UI V2 state check
      if (state.active_workstreams?.core_rc3?.ui_v2_state === 'ACCEPTED') {
        errors.push('UI V2 must NOT be marked ACCEPTED in initial STATE.json');
      }

    } catch (err) {
      errors.push(`STATE.json JSON parse error: ${err.message}`);
    }
  }

  // 2. Validate EVIDENCE.jsonl
  if (!fs.existsSync(evidencePath)) {
    errors.push('EVIDENCE.jsonl does not exist');
  } else {
    const lines = fs.readFileSync(evidencePath, 'utf8').trim().split('\n');
    let hasRejectedCoreRc3 = false;

    lines.forEach((line, idx) => {
      if (!line.trim()) return;
      try {
        const rec = JSON.parse(line);
        if (!rec.evidence_id || !rec.timestamp || !rec.gate || !rec.record_state) {
          errors.push(`EVIDENCE.jsonl line ${idx + 1} missing required record fields`);
        }
        if (rec.gate === 'CORE-RC.3' && rec.record_state === 'REJECTED') {
          hasRejectedCoreRc3 = true;
        }
      } catch (err) {
        errors.push(`EVIDENCE.jsonl line ${idx + 1} invalid JSON: ${err.message}`);
      }
    });

    if (!hasRejectedCoreRc3) {
      errors.push('EVIDENCE.jsonl must contain rejected CORE-RC.3 evidence record');
    }
  }

  // 3. Secret & PII Scan in control files
  const controlFiles = [
    'AGENTS.md', 'PROJECT_CONTROL.md',
    path.join('docs', 'project-control', 'STATE.json'),
    path.join('docs', 'project-control', 'ROADMAP_12W.md'),
    path.join('docs', 'project-control', 'TIMELINE.md'),
    path.join('docs', 'project-control', 'EVIDENCE.jsonl'),
    path.join('docs', 'project-control', 'DECISIONS.md'),
    path.join('docs', 'project-control', 'NOMENCLATURE.md'),
    path.join('docs', 'project-control', 'AI_HANDOFF.md'),
    path.join('docs', 'project-control', 'UPDATE_PROTOCOL.md')
  ];

  const forbiddenRegexes = [
    /eyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+/, // JWT pattern
    /sbp_[a-f0-9]{40}/i, // Supabase service role key pattern
    /larilocaloperator\d+/i // Specific secret key
  ];

  for (const relPath of controlFiles) {
    const fullPath = path.join(rootDir, relPath);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf8');
      for (const regex of forbiddenRegexes) {
        if (regex.test(content)) {
          errors.push(`Security Violation: Found forbidden token pattern in ${relPath}`);
        }
      }
    }
  }

  if (errors.length > 0) {
    console.error('❌ PROJECT CONTROL VALIDATION FAILED:');
    errors.forEach(e => console.error('  - ' + e));
    process.exit(1);
  } else {
    console.log('✅ PROJECT CONTROL VALIDATION PASSED COMPLETELY.');
  }
}

validateProjectControl();
