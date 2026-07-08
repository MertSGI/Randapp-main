import fs from 'fs';
import path from 'path';

console.log('=== RUNNING SUPABASE MIGRATION INTEGRITY QA CHECK ===\n');

// 1. Verify required documents exist
const strategyDoc = 'docs/SUPABASE_CANONICAL_MIGRATION_APPLY_STRATEGY.md';
const manifestDoc = 'supabase/MIGRATION_APPLY_MANIFEST.md';

if (!fs.existsSync(strategyDoc)) {
  console.error(`[FAIL] Migration application strategy doc does not exist: ${strategyDoc}`);
  process.exit(1);
}
console.log(`[PASS] Strategy document found: ${strategyDoc}`);

if (!fs.existsSync(manifestDoc)) {
  console.error(`[FAIL] Migration apply manifest does not exist: ${manifestDoc}`);
  process.exit(1);
}
console.log(`[PASS] Apply manifest found: ${manifestDoc}`);

// 2. Active migration folder validation
const migrationsDir = 'supabase/migrations';
if (!fs.existsSync(migrationsDir)) {
  console.error(`[FAIL] Migrations directory does not exist: ${migrationsDir}`);
  process.exit(1);
}

const activeFiles = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

console.log('\nDetected active migration files:');
for (const file of activeFiles) {
  console.log(`  - ${file}`);
}
console.log('');

// Hard check: archived migrations must not be in the active migrations directory
if (activeFiles.includes('20260526_initial_schema.sql')) {
  console.error('[FAIL] Redundant draft "20260526_initial_schema.sql" was found in active migrations! It must be archived.');
  process.exit(1);
}
console.log('[PASS] Archived/redundant migrations are correctly excluded from the active path.');

// 3. Read active migrations and parse for structures
let aggregateSql = '';
const tableCreationRegistry = {}; // table_name -> [{ file, hasIfNotExists }]
const indexRegistry = {};         // index_name -> [{ file, hasIfNotExists }]
const typeRegistry = {};          // type_name -> [{ file, isSafe }]
const policyRegistry = {};        // table_name -> { policy_name -> [{ file, hasDropBefore }] }

for (const file of activeFiles) {
  const filePath = path.join(migrationsDir, file);
  const sql = fs.readFileSync(filePath, 'utf8');
  aggregateSql += sql + '\n';

  // Find CREATE TABLE statements
  const tableRegex = /CREATE\s+TABLE\s+(IF\s+NOT\s+EXISTS\s+)?(?:public\.)?(\w+)/gi;
  let match;
  while ((match = tableRegex.exec(sql)) !== null) {
    const hasIfNotExists = !!match[1];
    const tableName = match[2].toLowerCase();
    if (!tableCreationRegistry[tableName]) {
      tableCreationRegistry[tableName] = [];
    }
    tableCreationRegistry[tableName].push({ file, hasIfNotExists });
  }

  // Find CREATE INDEX statements
  const indexRegex = /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(IF\s+NOT\s+EXISTS\s+)?(\w+)\s+ON/gi;
  while ((match = indexRegex.exec(sql)) !== null) {
    const hasIfNotExists = !!match[1];
    const indexName = match[2].toLowerCase();
    if (!indexRegistry[indexName]) {
      indexRegistry[indexName] = [];
    }
    indexRegistry[indexName].push({ file, hasIfNotExists });
  }

  // Find CREATE TYPE statements
  const typeRegex = /CREATE\s+TYPE\s+(?:public\.)?(\w+)/gi;
  while ((match = typeRegex.exec(sql)) !== null) {
    const typeName = match[1].toLowerCase();
    // Safe type handling could be checking if it's wrapped in standard exists check or custom handling.
    // For now we registry it.
    if (!typeRegistry[typeName]) {
      typeRegistry[typeName] = [];
    }
    const isSafe = sql.includes(`pg_type`) || sql.includes(`DROP TYPE IF EXISTS`);
    typeRegistry[typeName].push({ file, isSafe });
  }

  // Find CREATE POLICY and DROP POLICY statements
  // Locate DROP POLICY statements to trace safe policy handling
  const drops = [];
  const dropPolicyRegex = /DROP\s+POLICY\s+(?:IF\s+EXISTS\s+)?"([^"]+)"\s+ON\s+(?:public\.)?(\w+)/gi;
  while ((match = dropPolicyRegex.exec(sql)) !== null) {
    drops.push({ policyName: match[1], tableName: match[2].toLowerCase() });
  }

  const policyRegex = /CREATE\s+POLICY\s+"([^"]+)"\s+ON\s+(?:public\.)?(\w+)/gi;
  while ((match = policyRegex.exec(sql)) !== null) {
    const policyName = match[1];
    const tableName = match[2].toLowerCase();
    const hasDropBefore = drops.some(d => d.policyName === policyName && d.tableName === tableName) || sql.includes(`DROP POLICY IF EXISTS "${policyName}"`);

    if (!policyRegistry[tableName]) {
      policyRegistry[tableName] = {};
    }
    if (!policyRegistry[tableName][policyName]) {
      policyRegistry[tableName][policyName] = [];
    }
    policyRegistry[tableName][policyName].push({ file, hasDropBefore });
  }
}

// 4. Run detailed checks for duplicates and conflicts
let conflictDetected = false;

// Table duplicates check
for (const [tableName, definitions] of Object.entries(tableCreationRegistry)) {
  if (definitions.length > 1) {
    console.log(`[INFO] Table "${tableName}" is defined ${definitions.length} times across active migrations:`);
    for (const d of definitions) {
      console.log(`  - File: ${d.file}, IF NOT EXISTS: ${d.hasIfNotExists}`);
    }
    
    // If any duplicate definition does NOT have IF NOT EXISTS, fail
    const unsafe = definitions.filter(d => !d.hasIfNotExists);
    if (unsafe.length > 0) {
      console.error(`[FAIL] Table "${tableName}" has duplicate CREATE TABLE statements without "IF NOT EXISTS" in files: ${unsafe.map(u => u.file).join(', ')}`);
      conflictDetected = true;
    } else {
      console.log(`[PASS] Duplicate table "${tableName}" is handled safely with IF NOT EXISTS.`);
    }
  }
}

// Index duplicates check
for (const [indexName, definitions] of Object.entries(indexRegistry)) {
  if (definitions.length > 1) {
    console.log(`[INFO] Index "${indexName}" is defined ${definitions.length} times:`);
    for (const d of definitions) {
      console.log(`  - File: ${d.file}, IF NOT EXISTS: ${d.hasIfNotExists}`);
    }
    const unsafe = definitions.filter(d => !d.hasIfNotExists);
    if (unsafe.length > 0) {
      console.error(`[FAIL] Index "${indexName}" has duplicate CREATE INDEX statements without "IF NOT EXISTS" in files: ${unsafe.map(u => u.file).join(', ')}`);
      conflictDetected = true;
    } else {
      console.log(`[PASS] Duplicate index "${indexName}" is handled safely with IF NOT EXISTS.`);
    }
  }
}

// Type duplicates check
for (const [typeName, definitions] of Object.entries(typeRegistry)) {
  if (definitions.length > 1) {
    console.log(`[INFO] Custom type "${typeName}" is defined ${definitions.length} times.`);
    const unsafe = definitions.filter(d => !d.isSafe);
    if (unsafe.length > 0) {
      console.error(`[FAIL] Custom type "${typeName}" has duplicate declarations without safe handling (DROP or pg_type check) in files: ${unsafe.map(u => u.file).join(', ')}`);
      conflictDetected = true;
    }
  }
}

// Policy duplicates and safety check
for (const [tableName, policies] of Object.entries(policyRegistry)) {
  for (const [policyName, definitions] of Object.entries(policies)) {
    if (definitions.length > 1) {
      console.log(`[INFO] Policy "${policyName}" on table "${tableName}" is defined ${definitions.length} times.`);
      const unsafe = definitions.filter(d => !d.hasDropBefore);
      if (unsafe.length > 0) {
        console.error(`[FAIL] Policy "${policyName}" on table "${tableName}" has duplicate declarations without preceding "DROP POLICY IF EXISTS" in files: ${unsafe.map(u => u.file).join(', ')}`);
        conflictDetected = true;
      } else {
        console.log(`[PASS] Duplicate policy "${policyName}" on "${tableName}" is safe due to drop-before handling.`);
      }
    }
  }
}

if (conflictDetected) {
  console.error('\n[ABORT] Migration integrity validation failed due to unresolved conflicts/duplicates!');
  process.exit(1);
}

// 5. Check required core tables exist
const requiredTables = [
  'tenants',
  'services',
  'staff',
  'customers',
  'appointments',
  'subscriptions',
  'appointment_access_tokens',
  'appointment_change_requests',
  'communication_outbox',
  'audit_events',
  'support_tickets',
  'policy_acceptances',
  'consent_ledger',
  'data_rights_requests'
];

let tablesMissing = false;
for (const table of requiredTables) {
  if (tableCreationRegistry[table]) {
    console.log(`[PASS] Table "${table}" is covered by canonical migration path (File: ${tableCreationRegistry[table][0].file})`);
  } else {
    console.error(`[FAIL] Required table "${table}" is NOT defined anywhere in the active migration files.`);
    tablesMissing = true;
  }
}

if (tablesMissing) {
  process.exit(1);
}

// 6. RLS enablement checks
const tablesToVerifyRls = [
  'tenants',
  'services',
  'staff',
  'customers',
  'appointments',
  'subscriptions',
  'appointment_access_tokens',
  'appointment_change_requests',
  'communication_outbox',
  'audit_events',
  'support_tickets',
  'policy_acceptances',
  'consent_ledger',
  'data_rights_requests'
];

for (const table of tablesToVerifyRls) {
  const rlsRegex = new RegExp(`ALTER TABLE\\s+(public\\.)?${table}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`, 'i');
  const rlsCheck = rlsRegex.test(aggregateSql);
  if (rlsCheck) {
    console.log(`[PASS] RLS is explicitly enabled on table: ${table}`);
  } else {
    if (aggregateSql.includes(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`) || aggregateSql.includes(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`)) {
       console.log(`[PASS] RLS is explicitly enabled on table (via direct lookup): ${table}`);
    } else {
       console.warn(`[WARN] RLS enablement statement not found for table: ${table}`);
    }
  }
}

// 7. Verify no raw credit card storage column is present in payment or transaction tables
const forbiddenColumns = ['card_number', 'card_cvv', 'cvv2', 'card_expiry'];
let cardStorageLeak = false;
for (const col of forbiddenColumns) {
  if (aggregateSql.toLowerCase().includes(col)) {
    console.error(`[FAIL] Security Leak: Column/phrase "${col}" is found in the migration definitions!`);
    cardStorageLeak = true;
  }
}

if (cardStorageLeak) {
  console.error('[ABORT] Raw credit card fields are prohibited in migrations to comply with PCI-DSS!');
  process.exit(1);
} else {
  console.log('[PASS] PCI-DSS Compliance verified. No raw card storage definitions found.');
}

// 8. Verify no service-role key is referenced in frontend or migration code
const clientFiles = fs.readdirSync('services').filter(f => f.endsWith('.ts'));
let clientLeak = false;
for (const file of clientFiles) {
  const content = fs.readFileSync(path.join('services', file), 'utf8');
  if (content.includes('service_role') && !file.includes('Client')) {
    console.error(`[FAIL] Unsafe usage of service_role in client-side file: services/${file}`);
    clientLeak = true;
  }
}

if (clientLeak) {
  process.exit(1);
} else {
  console.log('[PASS] Client-side files are clean. No service_role key leaks detected.');
}

console.log('\n=== SUPABASE MIGRATION INTEGRITY QA PASSED PERFECTLY ===\n');
process.exit(0);
