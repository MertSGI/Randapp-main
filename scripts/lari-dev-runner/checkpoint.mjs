import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const RUNTIME_DIR_NAME = '.lari-dev-runtime';
export const STATE_FILE_NAME = 'state.json';
export const EVENTS_FILE_NAME = 'events.jsonl';
export const LOCK_FILE_NAME = 'runner.lock';

export function getRuntimePaths(repoRoot) {
  const resolvedRoot = path.resolve(repoRoot);
  const runtimeDir = path.join(resolvedRoot, RUNTIME_DIR_NAME);
  return {
    repoRoot: resolvedRoot,
    runtimeDir,
    stateFile: path.join(runtimeDir, STATE_FILE_NAME),
    eventsFile: path.join(runtimeDir, EVENTS_FILE_NAME),
    lockFile: path.join(runtimeDir, LOCK_FILE_NAME),
  };
}

export function ensureRuntimeDir(repoRoot) {
  const paths = getRuntimePaths(repoRoot);
  if (!fs.existsSync(paths.runtimeDir)) {
    fs.mkdirSync(paths.runtimeDir, { recursive: true });
  }
  return paths;
}

export function acquireExclusiveLock(repoRoot, metadata = {}) {
  const paths = ensureRuntimeDir(repoRoot);
  const instanceId = metadata.instanceId || `runner-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
  const payload = JSON.stringify({
    instance_id: instanceId,
    pid: process.pid,
    acquired_at: new Date().toISOString(),
    ...metadata,
  });

  let fd;
  try {
    fd = fs.openSync(paths.lockFile, 'wx');
    fs.writeFileSync(fd, payload, 'utf8');
  } catch (err) {
    if (err && err.code === 'EEXIST') {
      return {
        acquired: false,
        code: 'LOCK_HELD',
        lockFile: paths.lockFile,
        instanceId,
        release() {
          return false;
        },
      };
    }
    throw err;
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {
        // ignore close error
      }
    }
  }

  let released = false;
  return {
    acquired: true,
    code: 'LOCK_ACQUIRED',
    lockFile: paths.lockFile,
    instanceId,
    release() {
      if (released) return false;
      released = true;
      try {
        if (fs.existsSync(paths.lockFile)) {
          const current = JSON.parse(fs.readFileSync(paths.lockFile, 'utf8'));
          if (current.instance_id === instanceId) {
            fs.unlinkSync(paths.lockFile);
            return true;
          }
        }
      } catch {
        try {
          if (fs.existsSync(paths.lockFile)) {
            fs.unlinkSync(paths.lockFile);
            return true;
          }
        } catch {
          return false;
        }
      }
      return false;
    },
  };
}

export function writeStateAtomic(repoRoot, stateData) {
  const paths = ensureRuntimeDir(repoRoot);
  const suffix = `${process.pid}.${Date.now()}.${crypto.randomBytes(4).toString('hex')}`;
  const tempFile = `${paths.stateFile}.tmp.${suffix}`;
  const serialized = JSON.stringify(stateData, null, 2) + '\n';

  const fd = fs.openSync(tempFile, 'wx');
  try {
    fs.writeFileSync(fd, serialized, 'utf8');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }

  fs.renameSync(tempFile, paths.stateFile);
  return paths.stateFile;
}

export function readState(repoRoot) {
  const paths = getRuntimePaths(repoRoot);
  if (!fs.existsSync(paths.stateFile)) {
    return null;
  }
  const raw = fs.readFileSync(paths.stateFile, 'utf8');
  return JSON.parse(raw);
}

export function appendEventReceipt(repoRoot, eventPayload) {
  const paths = ensureRuntimeDir(repoRoot);
  const record = {
    event_id: eventPayload.event_id || `evt-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
    timestamp: eventPayload.timestamp || new Date().toISOString(),
    ...eventPayload,
  };
  const line = JSON.stringify(record) + '\n';
  fs.appendFileSync(paths.eventsFile, line, { encoding: 'utf8', flag: 'a' });
  return record;
}

export function readEventReceipts(repoRoot) {
  const paths = getRuntimePaths(repoRoot);
  if (!fs.existsSync(paths.eventsFile)) {
    return [];
  }
  const content = fs.readFileSync(paths.eventsFile, 'utf8');
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}
