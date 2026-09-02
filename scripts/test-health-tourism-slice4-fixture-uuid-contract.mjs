// ============================================================================
// STATIC FIXTURE UUID CONTRACT SCANNER
// File: scripts/test-health-tourism-slice4-fixture-uuid-contract.mjs
// Purpose:
//   Scans all 8 mandatory pgTAP test files for UUID-shaped alphanumeric tokens
//   (8-4-4-4-12 pattern). Any token that fails strict hexadecimal UUID syntax
//   ([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})
//   is reported with file, token, and occurrence count, causing non-zero exit.
// ============================================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const testSuites = [
  'supabase/tests/health_tourism_foundation_server_authority_tests.sql',
  'supabase/tests/health_tourism_lead_ops_ai_assist_tests.sql',
  'supabase/tests/health_tourism_clinic_acceptance_tests.sql',
  'supabase/tests/health_tourism_clinic_acceptance_workspace_tests.sql',
  'supabase/tests/clinic_domain_server_authority_tests.sql',
  'supabase/tests/clinic_operational_integration_tests.sql',
  'supabase/tests/clinic_workspace_authority_hardening_tests.sql',
  'supabase/tests/public_booking_rpc_behavioral_tests.sql',
];

const uuidShapeRegex = /\b[0-9a-zA-Z]{8}-[0-9a-zA-Z]{4}-[0-9a-zA-Z]{4}-[0-9a-zA-Z]{4}-[0-9a-zA-Z]{12}\b/g;
const validHexUuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

function main() {
  console.log('🏁 Scanning 8 mandatory pgTAP files for UUID fixture integrity...\n');

  const invalidTokensMap = new Map(); // token -> { count, files: Set }
  let totalInvalidOccurrences = 0;

  for (const relPath of testSuites) {
    const fullPath = path.join(rootDir, relPath);
    if (!fs.existsSync(fullPath)) {
      console.error(`❌ Missing mandatory test suite: ${relPath}`);
      process.exit(1);
    }

    const content = fs.readFileSync(fullPath, 'utf8');
    const matches = content.match(uuidShapeRegex) || [];

    for (const token of matches) {
      if (!validHexUuidRegex.test(token)) {
        totalInvalidOccurrences++;
        if (!invalidTokensMap.has(token)) {
          invalidTokensMap.set(token, { count: 0, files: new Set() });
        }
        const entry = invalidTokensMap.get(token);
        entry.count++;
        entry.files.add(relPath);
      }
    }
  }

  const distinctInvalidCount = invalidTokensMap.size;

  if (distinctInvalidCount > 0) {
    console.error(`❌ INVALID UUID FIXTURES DETECTED! (${distinctInvalidCount} distinct, ${totalInvalidOccurrences} occurrences):\n`);
    for (const [token, data] of invalidTokensMap.entries()) {
      console.error(`Token: "${token}" | Occurrences: ${data.count} | Files: ${Array.from(data.files).join(', ')}`);
    }
    console.log(`\nFIXTURE_UUID_STATIC_RESULT=FAIL`);
    console.log(`INVALID_UUID_DISTINCT_COUNT=${distinctInvalidCount}`);
    console.log(`INVALID_UUID_OCCURRENCE_COUNT=${totalInvalidOccurrences}`);
    process.exit(1);
  }

  console.log('✅ All matched UUID tokens in all 8 pgTAP suites satisfy strict hexadecimal syntax!');
  console.log('FIXTURE_UUID_STATIC_RESULT=PASS');
  console.log('INVALID_UUID_DISTINCT_COUNT=0');
  console.log('INVALID_UUID_OCCURRENCE_COUNT=0');
  process.exit(0);
}

main();
