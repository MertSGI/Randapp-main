import fs from 'fs';
import path from 'path';

function validateProjectControl() {
  console.log('=== RUNNING ENHANCED PROJECT CONTROL PLANE VALIDATION ===');
  let errors = [];

  const rootDir = process.cwd();
  const statePath = path.join(rootDir, 'docs', 'project-control', 'STATE.json');
  const roadmapPath = path.join(rootDir, 'docs', 'project-control', 'ROADMAP_12W.md');
  const evidencePath = path.join(rootDir, 'docs', 'project-control', 'EVIDENCE.jsonl');
  const projectControlPath = path.join(rootDir, 'PROJECT_CONTROL.md');

  // 1. Validate STATE.json
  let state = null;
  if (!fs.existsSync(statePath)) {
    errors.push('STATE.json does not exist');
  } else {
    try {
      state = JSON.parse(fs.readFileSync(statePath, 'utf8'));

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

      if (state.delivery_commitment) {
        if (state.delivery_commitment.duration_weeks !== 12) {
          errors.push(`STATE.json delivery_commitment.duration_weeks must be 12 (found ${state.delivery_commitment.duration_weeks})`);
        }
        if (state.delivery_commitment.reset_from_today_allowed !== false) {
          errors.push('STATE.json delivery_commitment.reset_from_today_allowed must be false');
        }
      }

      const allowedStatuses = [
        'CLOSED', 'CLOSED_PROVEN', 'CLOSED_VERIFIED', 'CLOSED_PROVEN_TECHNICAL_ACCEPTANCE_COMPLETE',
        'HOLD', 'HOLD_PENDING_LITERAL_EXECUTION_TRUTH', 'NOT_STARTED', 'PRESENT_ON_CORE_BASELINE',
        'INTEGRATION_ALREADY_SATISFIED', 'READY_TO_EXECUTE', 'INPUT_PENDING'
      ];
      const allowedLevels = [
        'E0_CLAIM_ONLY', 'E1_SOURCE_PROVEN', 'E2_EXECUTABLE_EXACT_SHA_CI',
        'E3_ISOLATED_RUNTIME_E2E', 'E4_SHARED_STAGING_LIVE', 'E5_EXTERNAL_FIELD_UAT'
      ];

      const closedGateNames = new Set();
      if (Array.isArray(state.accepted_gates)) {
        for (const gate of state.accepted_gates) {
          closedGateNames.add(gate.gate);

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
              // Rule K: Run 31797365055 must strictly be bound to P2A gates only
              if (rid === '31797365055' && !gate.gate.startsWith('P2A')) {
                errors.push(`Rule Violation (K): Run 31797365055 cannot be reused for non-P2A gate ${gate.gate}`);
              }
            }
          }

          // Rule D: P1D.1A cannot simultaneously contain CLOSED and ARMED semantics
          if (gate.gate === 'P1D.1A') {
            if (gate.status.includes('ARMED')) {
              errors.push('Rule Violation (D): P1D.1A status cannot contain ARMED when closed.');
            }
          }
        }
      }

      // Rule C: current_milestone cannot contain a gate already present in accepted_gates
      if (state.current_milestone && closedGateNames.has(state.current_milestone)) {
        errors.push(`Rule Violation (C): current_milestone '${state.current_milestone}' is already present as a closed gate.`);
      }

      // Rule E: CORE-RC.2B must map to Public Booking Anti-Abuse
      const rc2b = state.accepted_gates?.find(g => g.gate === 'CORE-RC.2B');
      if (rc2b && rc2b.scope && !rc2b.scope.includes('Public Booking Anti-Abuse')) {
        errors.push(`Rule Violation (E): CORE-RC.2B scope must map to Public Booking Anti-Abuse (found: ${rc2b.scope})`);
      }

      // Rule I: CORE-RC.3 can be CLOSED when proven at level E3 or higher
      const rc3Gate = state.accepted_gates?.find(g => g.gate === 'CORE-RC.3');
      const validE3OrHigher = rc3Gate && ['E3_ISOLATED_RUNTIME_E2E', 'E4_SHARED_STAGING_LIVE', 'E5_EXTERNAL_FIELD_UAT'].includes(rc3Gate.evidence_level);
      if ((state.active_workstreams?.core_rc3?.status === 'CLOSED' || state.active_workstreams?.core_rc3?.status === 'CLOSED_PROVEN') && !validE3OrHigher) {
        errors.push('Rule Violation (I): CORE-RC.3 cannot be marked CLOSED while execution truth is pending or level is below E3.');
      }

      // Check Next Action rule: Must NOT say "Await UI V2 before doing anything"
      if (state.next_action && state.next_action.includes('Await UI V2 before doing anything')) {
        errors.push('Rule Violation: next_action must not block core execution waiting for UI V2.');
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
    const allowedRecordStates = ['ACCEPTED', 'REJECTED', 'SUPERSEDED', 'INFORMATIONAL'];
    const evidenceIds = new Set();
    let hasP1d1aE4Acceptance = false;

    lines.forEach((line, idx) => {
      if (!line.trim()) return;
      try {
        const rec = JSON.parse(line);
        if (!rec.evidence_id || !rec.timestamp || !rec.gate || !rec.record_state) {
          errors.push(`EVIDENCE.jsonl line ${idx + 1} missing required record fields`);
        }

        // Rule A: record_state vocabulary check
        if (!allowedRecordStates.includes(rec.record_state)) {
          errors.push(`Rule Violation (A): EVIDENCE.jsonl line ${idx + 1} uses invalid record_state '${rec.record_state}'`);
        }

        // Rule B: evidence_id uniqueness check
        if (evidenceIds.has(rec.evidence_id)) {
          errors.push(`Rule Violation (B): Duplicate evidence_id '${rec.evidence_id}' in EVIDENCE.jsonl`);
        }
        evidenceIds.add(rec.evidence_id);

        // Rule J: P1D.1A E4 acceptance must reference technical browser acceptance
        if (rec.gate === 'P1D.1A' && rec.record_state === 'ACCEPTED' && rec.evidence_level === 'E4_SHARED_STAGING_LIVE') {
          if (rec.claim && rec.claim.toLowerCase().includes('technical') && rec.claim.toLowerCase().includes('browser')) {
            hasP1d1aE4Acceptance = true;
          }
        }

      } catch (err) {
        errors.push(`EVIDENCE.jsonl line ${idx + 1} invalid JSON: ${err.message}`);
      }
    });

    if (!hasP1d1aE4Acceptance) {
      errors.push('Rule Violation (J): EVIDENCE.jsonl must contain an ACCEPTED E4 record for P1D.1A technical browser acceptance.');
    }
  }

  // 3. Document Content Rules & Anti-Drift Checks
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
    /eyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+/, // JWT
    /sbp_[a-f0-9]{40}/i, // Supabase service key
    /larilocaloperator\d+/i, // Local operator secret
    /file:\/\/\/[A-Z]:\//i, // Rule G: Local file:/// links
    /[A-Z]:\\tmp\\/i, // Rule G: C:\tmp paths
    /\bPKG-\d+\b/, /\bCLN-\d+\b/, /\bHT-\d+\b/, /\bLAUNCH-\d+\b/, /\bP2B\.\d+\b/ // Rule F: Synthetic forward gate IDs
  ];

  for (const relPath of controlFiles) {
    const fullPath = path.join(rootDir, relPath);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf8');

      for (const regex of forbiddenRegexes) {
        if (regex.test(content)) {
          // Exclude explanatory historical mentions in NOMENCLATURE.md if matched
          if (relPath.includes('NOMENCLATURE.md') && (content.includes('REJECTED') || content.includes('Historical'))) {
            // allow explanatory mentions of P2B in NOMENCLATURE
            if (regex.source.includes('P2B')) continue;
          }
          errors.push(`Security/Format Violation: Found forbidden pattern (${regex}) in ${relPath}`);
        }
      }

      // Rule H: Product Brand check (Must use LARİ, Randapp only allowed for repo/path references)
      if (content.includes('Randapp') && !content.includes('MertSGI/Randapp-main') && !content.includes('repository') && !content.includes('path') && !content.includes('history')) {
        errors.push(`Rule Violation (H): 'Randapp' used outside repository/history context in ${relPath}`);
      }
    }
  }

  // 5. DECISIONS.md Structural Integrity Check
  const decisionsPath = path.join(rootDir, 'docs', 'project-control', 'DECISIONS.md');
  if (!fs.existsSync(decisionsPath)) {
    errors.push('DECISIONS.md does not exist');
  } else {
    const decisionsContent = fs.readFileSync(decisionsPath, 'utf8');

    const headerMatches = decisionsContent.match(/^# Architectural & Product Decision Register$/gm);
    const headerCount = headerMatches ? headerMatches.length : 0;
    if (headerCount !== 1) {
      errors.push(`Rule Violation (DECISIONS-HEADER): Architectural & Product Decision Register header must appear exactly once (found ${headerCount}).`);
    }

    const decisionIdMatches = decisionsContent.match(/^## (DECISION-[0-9]{3}):/gm);
    if (!decisionIdMatches || decisionIdMatches.length === 0) {
      errors.push('Rule Violation (DECISIONS-EMPTY): DECISIONS.md contains no valid decision entries.');
    } else {
      const seenDecisionIds = new Set();
      for (const rawMatch of decisionIdMatches) {
        const decisionId = rawMatch.replace(/^##\s+/, '').replace(/:$/, '');
        if (seenDecisionIds.has(decisionId)) {
          errors.push(`Rule Violation (DECISIONS-ID): Duplicate decision id '${decisionId}' in DECISIONS.md.`);
        }
        seenDecisionIds.add(decisionId);
      }
    }
  }

  if (errors.length > 0) {
    console.error('❌ ENHANCED PROJECT CONTROL VALIDATION FAILED:');
    errors.forEach(e => console.error('  - ' + e));
    process.exit(1);
  } else {
    console.log('✅ ENHANCED PROJECT CONTROL VALIDATION PASSED COMPLETELY.');
  }
}

validateProjectControl();


