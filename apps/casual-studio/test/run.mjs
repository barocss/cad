import { mkdtemp, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';

const scratch = await mkdtemp(join(tmpdir(), 'casual-cad-test-'));
try {
  const test = join(scratch, 'test.mjs');
  await build({ entryPoints: ['test/plate.test.ts'], outfile: test, bundle: true, platform: 'node', format: 'esm' });
  const run = spawnSync(process.execPath, ['--test', test], { stdio: 'inherit' });
  process.exitCode = run.status ?? 1;
} finally { await rm(scratch, { recursive: true, force: true }); }
