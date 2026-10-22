import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const P0_EXPECTED_LF_HASH = '260F727516CFF4CF0754295206A10E56505A9CA9E22AEC099BB7F21099BD5E13';

export const EXPECTED_COLLISION_GROUPS = new Set([
  'COLLISION_20260920',
  'COLLISION_20260921',
  'COLLISION_20260925',
  'COLLISION_20260928',
]);

export function verifyMigrationPlan(matrixData, repoRoot = process.cwd()) {
  const errors = [];

  if (!matrixData || typeof matrixData !== 'object') {
    return { valid: false, errors: ['MATRIX_NOT_AN_OBJECT'] };
  }

  if (matrixData.total_differences_count !== 25) {
    errors.push(`EXPECTED_25_DIFFERENCES_FOUND_${matrixData.total_differences_count}`);
  }

  if (matrixData.p0_cutover_count !== 1) {
    errors.push(`EXPECTED_1_P0_CUTOVER_FOUND_${matrixData.p0_cutover_count}`);
  }

  const items = Array.isArray(matrixData.items) ? matrixData.items : [];
  if (items.length !== 26) {
    errors.push(`EXPECTED_26_ITEMS_FOUND_${items.length}`);
  }

  const seenHashes = new Map();
  const seenCollisionGroups = new Set();
  let p0Found = false;
  let remoteOnlyCount = 0;
  let localOnlyCount = 0;

  for (const item of items) {
    if (item.side === 'SECURITY_CUTOVER_ONLY') {
      p0Found = true;
      if (item.class !== 'SECURITY_CUTOVER_ONLY') {
        errors.push(`P0_CLASS_MUST_BE_SECURITY_CUTOVER_ONLY:${item.class}`);
      }
      if (item.target_forward_operation !== 'SQL_WRITE_STAGING_P0') {
        errors.push(`P0_TARGET_OP_INVALID:${item.target_forward_operation}`);
      }
      const fullPath = path.join(repoRoot, 'supabase', 'migrations', item.local_filename);
      if (fs.existsSync(fullPath)) {
        const raw = fs.readFileSync(fullPath, 'utf8').replace(/\r\n/g, '\n');
        const hash = crypto.createHash('sha256').update(raw, 'utf8').digest('hex').toUpperCase();
        if (hash !== P0_EXPECTED_LF_HASH) {
          errors.push(`P0_LF_HASH_MISMATCH:disk=${hash},expected=${P0_EXPECTED_LF_HASH}`);
        }
      }
      continue;
    }

    if (item.side === 'REMOTE_ONLY') {
      remoteOnlyCount++;
      if (item.class === 'SEMANTIC_EQUIVALENT_PROVEN') {
        errors.push(`REMOTE_ONLY_CANNOT_BE_SEMANTIC_EQUIVALENT_PROVEN:${item.version}`);
      }
      continue;
    }

    if (item.side === 'LOCAL_ONLY') {
      localOnlyCount++;
      if (!item.local_filename) {
        errors.push(`MISSING_LOCAL_FILENAME:${item.item_id}`);
        continue;
      }

      if (item.collision_group) {
        seenCollisionGroups.add(item.collision_group);
      }

      const fullPath = path.join(repoRoot, 'supabase', 'migrations', item.local_filename);
      if (!fs.existsSync(fullPath)) {
        errors.push(`LOCAL_FILE_DOES_NOT_EXIST:${item.local_filename}`);
      } else {
        const raw = fs.readFileSync(fullPath);
        const actualHash = crypto.createHash('sha256').update(raw).digest('hex').toLowerCase();
        const text = raw.toString('utf8');
        const crlfHash = crypto.createHash('sha256').update(text.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n'), 'utf8').digest('hex').toLowerCase();
        const lfHash = crypto.createHash('sha256').update(text.replace(/\r\n/g, '\n'), 'utf8').digest('hex').toLowerCase();

        const expected = (item.source_sha256 || '').toLowerCase();
        if (expected && actualHash !== expected && crlfHash !== expected && lfHash !== expected) {
          errors.push(`HASH_MISMATCH:${item.local_filename}`);
        }
        if (seenHashes.has(lfHash)) {
          errors.push(`DUPLICATE_SOURCE_SHA256:${item.local_filename} duplicates ${seenHashes.get(lfHash)}`);
        } else {
          seenHashes.set(lfHash, item.local_filename);
        }
      }

      // Check clone diff requirement for overlapping objects
      if (
        item.local_filename.includes('customer360') ||
        item.local_filename.includes('package_limits_multibranch') ||
        item.local_filename.includes('clinic_practitioners') ||
        item.local_filename.includes('scheduling_buffer_parity')
      ) {
        if (item.required_catalog_proof !== 'NEEDS_CLONE_DIFF') {
          errors.push(`OVERLAPPING_OBJECT_REQUIRES_CLONE_DIFF:${item.local_filename}`);
        }
      }
    }
  }

  if (!p0Found) {
    errors.push('P0_SECURITY_MIGRATION_NOT_FOUND');
  }

  if (remoteOnlyCount !== 4) {
    errors.push(`EXPECTED_4_REMOTE_ONLY_FOUND_${remoteOnlyCount}`);
  }

  if (localOnlyCount !== 21) {
    errors.push(`EXPECTED_21_LOCAL_ONLY_FOUND_${localOnlyCount}`);
  }

  for (const cg of EXPECTED_COLLISION_GROUPS) {
    if (!seenCollisionGroups.has(cg)) {
      errors.push(`MISSING_COLLISION_GROUP:${cg}`);
    }
  }

  // Schema check & DAG cycle detection
  const itemIds = new Set(items.map((it) => it.item_id).filter(Boolean));
  const adj = new Map();

  for (const item of items) {
    if (!item.item_id || !item.side || !item.version || !item.class) {
      errors.push(`INVALID_ITEM_SCHEMA:${item.item_id || 'UNKNOWN'}`);
    }
    const deps = Array.isArray(item.blocked_by) ? item.blocked_by : [];
    const itemDeps = deps.filter((d) => itemIds.has(d));
    adj.set(item.item_id, itemDeps);
  }

  const visited = new Map(); // id -> 0: unvisited, 1: visiting, 2: visited
  function detectCycle(node, pathStack) {
    visited.set(node, 1);
    pathStack.push(node);
    const neighbors = adj.get(node) || [];
    for (const neighbor of neighbors) {
      if (visited.get(neighbor) === 1) {
        errors.push(`CIRCULAR_DEPENDENCY_DETECTED:${pathStack.join(' -> ')} -> ${neighbor}`);
        return true;
      }
      if (!visited.has(neighbor) || visited.get(neighbor) === 0) {
        if (detectCycle(neighbor, pathStack)) return true;
      }
    }
    pathStack.pop();
    visited.set(node, 2);
    return false;
  }

  for (const id of itemIds) {
    if (!visited.has(id) || visited.get(id) === 0) {
      detectCycle(id, []);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    summary: {
      total_entries: items.length,
      local_only: localOnlyCount,
      remote_only: remoteOnlyCount,
      p0_cutover: p0Found ? 1 : 0,
      collision_groups_found: [...seenCollisionGroups],
    },
  };
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  const matrixPath = path.resolve(process.cwd(), 'docs', 'lari-program', 'MIGRATION_RECONCILIATION_MATRIX.json');
  if (!fs.existsSync(matrixPath)) {
    console.error(`Matrix file not found at ${matrixPath}`);
    process.exit(1);
  }
  const matrix = JSON.parse(fs.readFileSync(matrixPath, 'utf8'));
  const res = verifyMigrationPlan(matrix, process.cwd());

  if (res.valid) {
    console.log('✅ Migration Reconciliation Plan verification passed!');
    console.log(JSON.stringify(res.summary, null, 2));
    process.exit(0);
  } else {
    console.error('❌ Migration Reconciliation Plan verification failed:');
    res.errors.forEach((e) => console.error(`  - ${e}`));
    process.exit(1);
  }
}
