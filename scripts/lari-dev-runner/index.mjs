import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  runOnce,
  getStatusNonMutating,
  acknowledgeReconciliation,
  TASK_STATES,
} from './core.mjs';

export function parseCliArgs(argv) {
  const args = argv.slice(2);
  let command = 'status';
  let repoRoot = process.cwd();
  let maxIterations = 1;
  let intervalMs = 250;
  let taskId = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === 'status' || arg === 'once' || arg === 'loop' || arg === 'reconcile-ack') {
      command = arg;
    } else if (arg === '--repo' && args[i + 1]) {
      repoRoot = path.resolve(args[i + 1]);
      i += 1;
    } else if (arg === '--max-iterations' && args[i + 1]) {
      maxIterations = Math.max(1, Math.min(20, Number.parseInt(args[i + 1], 10) || 1));
      i += 1;
    } else if (arg === '--interval-ms' && args[i + 1]) {
      intervalMs = Math.max(50, Math.min(10000, Number.parseInt(args[i + 1], 10) || 250));
      i += 1;
    } else if (arg === '--task-id' && args[i + 1]) {
      taskId = args[i + 1];
      i += 1;
    }
  }

  return { command, repoRoot, maxIterations, intervalMs, taskId };
}

export async function runCli(argv = process.argv) {
  const { command, repoRoot, maxIterations, intervalMs, taskId } = parseCliArgs(argv);

  if (command === 'status') {
    const statusReport = getStatusNonMutating(repoRoot);
    process.stdout.write(JSON.stringify(statusReport, null, 2) + '\n');
    return statusReport.ok ? 0 : 1;
  }

  if (command === 'once') {
    const result = await runOnce(repoRoot);
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    if (result.status === TASK_STATES.FAILED_STOP || result.status === 'HOLD_SOURCE_DRIFT') {
      return 1;
    }
    return 0;
  }

  if (command === 'loop') {
    const results = [];
    for (let i = 0; i < maxIterations; i++) {
      const res = await runOnce(repoRoot);
      results.push(res);
      if (res.status !== TASK_STATES.ACCEPTED_SOURCE) {
        break;
      }
      if (i + 1 < maxIterations) {
        await new Promise((r) => setTimeout(r, intervalMs));
      }
    }
    process.stdout.write(
      JSON.stringify(
        {
          mode: 'BOUNDED_FOREGROUND_LOOP',
          daemon_started: false,
          iterations: results.length,
          results,
        },
        null,
        2
      ) + '\n'
    );
    const failed = results.some(
      (r) => r.status === TASK_STATES.FAILED_STOP || r.status === 'HOLD_SOURCE_DRIFT'
    );
    return failed ? 1 : 0;
  }

  if (command === 'reconcile-ack') {
    if (!taskId) {
      process.stderr.write('Missing --task-id for reconcile-ack\n');
      return 1;
    }
    const updated = acknowledgeReconciliation(repoRoot, taskId);
    process.stdout.write(JSON.stringify(updated, null, 2) + '\n');
    return 0;
  }

  process.stderr.write(`Unknown command: ${command}\n`);
  return 1;
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  runCli(process.argv)
    .then((code) => {
      process.exitCode = code;
    })
    .catch((err) => {
      process.stderr.write(`Runner error: ${err?.message || String(err)}\n`);
      process.exitCode = 1;
    });
}
