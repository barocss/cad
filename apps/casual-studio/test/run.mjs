import { mkdtemp, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';

const scratch = await mkdtemp(join(tmpdir(), 'casual-cad-test-'));
try {
  const tests = ['plate.test.mjs', 'sensorEnclosure.test.mjs', 'centeringVise.test.mjs'].map(file => join(scratch, file));
  await build({ entryPoints: ['test/plate.test.ts', 'test/sensorEnclosure.test.ts', 'test/centeringVise.test.ts'], outdir: scratch, outExtension: { '.js': '.mjs' }, bundle: true, platform: 'node', format: 'esm' });
  const run = spawnSync(process.execPath, ['--test', ...tests], { stdio: 'inherit' });
  process.exitCode = run.status ?? 1;
} finally { await rm(scratch, { recursive: true, force: true }); }
