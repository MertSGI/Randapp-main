import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const evidencePath = path.join(
  projectRoot,
  'docs',
  'evidence',
  'migration-reconciliation-20261011.json',
);
const migrationsPath = path.join(projectRoot, 'supabase', 'migrations');
const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));

assert.equal(evidence.schema_version, '1.0');
assert.equal(evidence.project_ref, 'rwedeejhjazwjthdjzrt');
assert.equal(evidence.mode, 'READ_ONLY');
assert.equal(evidence.evidence_basis?.remote_mutation_performed, false);

const repairMigration = evidence.baseline?.repair_migration_excluded;
assert.equal(
  repairMigration,
  '20261011155623_appointment_access_tokens_table_access_hardening.sql',
);

const migrationFiles = fs
  .readdirSync(migrationsPath)
  .filter((file) => file.endsWith('.sql'))
  .sort();
assert(migrationFiles.includes(repairMigration));
assert.equal(
  migrationFiles.filter((file) => file !== repairMigration).length,
  evidence.baseline.source_sql_count,
);

const sideCounts = Object.create(null);
const classificationCounts = Object.create(null);
for (const difference of evidence.differences) {
  sideCounts[difference.side] = (sideCounts[difference.side] ?? 0) + 1;
  classificationCounts[difference.classification] =
    (classificationCounts[difference.classification] ?? 0) + 1;
}

assert.equal(sideCounts.LOCAL_ONLY, evidence.baseline.local_only_count);
assert.equal(sideCounts.REMOTE_ONLY, evidence.baseline.remote_only_count);
assert.equal(
  evidence.baseline.common_identity_count + evidence.baseline.remote_only_count,
  evidence.baseline.remote_ledger_count,
);
assert.equal(
  evidence.differences.length,
  evidence.baseline.local_only_count + evidence.baseline.remote_only_count,
);

for (const classification of [
  'MISSING_UNAPPLIED_PROVEN',
  'DRIFT_OR_CONFLICT',
  'UNKNOWN',
]) {
  assert.equal(
    classificationCounts[classification] ?? 0,
    evidence.classification_summary[classification],
  );
}
assert.equal(
  evidence.classification_summary.unresolved_count,
  evidence.classification_summary.DRIFT_OR_CONFLICT +
    evidence.classification_summary.UNKNOWN,
);

console.log('migration reconciliation evidence consistency: PASS');
