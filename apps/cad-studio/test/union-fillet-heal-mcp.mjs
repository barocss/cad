import assert from 'node:assert/strict';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { withMcpSession } from './mcp-browser-session.mjs';

const output = process.argv[2];
const app = resolve(import.meta.dirname, '..');
assert.ok(output && isAbsolute(output) && relative(resolve(app, '../..'), output).startsWith('../'));
await mkdir(output);
const file = join(output, 'agent-healed.bcad');

await withMcpSession({ app, output, clientName: 'barocss-union-fillet-heal', autonomy: 3 }, file, 'union-fillet', async call => {
  const command = (command, values, selection = {}) => call('features', { action: 'command', command, values, ...selection });
  await command('box', { w: 40, d: 20, h: 3, x: 0, y: 0, z: 0 });
  await command('box', { w: 3, d: 20, h: 30, x: 0, y: 0, z: 0 });
  await command('union', {}, { bodies: ['b1', 'b3'] });
  await command('fillet', { radius: 2 }, { edges: [{ between: ['n1.top', 'n3.side1'] }] });
  const face = 'n5.face';
  await copyFile(file, join(output, 'union-bracket-r2.bcad'));
  const original = await readFile(file);
  const review = await call('query', { action: 'render', highlight: [face] });
  assert.match(review.revision, /^[0-9a-f]{16}$/);
  assert.deepEqual(await readFile(file), original);
  const heal = { action: 'command', command: 'delete-face', faces: [face], expectedRevision: review.revision };
  await call('features', heal);
  const accepted = await readFile(file);
  const { nodes } = JSON.parse(accepted);
  assert.deepEqual(nodes.slice(0, -1), JSON.parse(original).nodes);
  assert.equal(nodes.at(-1).kind, 'delete-face');
  assert.deepEqual(nodes.at(-1).faces, [face]);
  const summary = await call('query', { action: 'summary' });
  assert.equal(summary.bodies.length, 1);
  assert.ok(Math.abs(summary.bodies[0].volume - 4020) < 1e-7);
  const refused = await call('features', heal, true);
  assert.equal(refused.code, 'COMMAND_STALE');
  assert.equal(refused.expectedRevision, review.revision);
  assert.deepEqual(await readFile(file), accepted);
  process.stdout.write(JSON.stringify({ selected: face, revision: review.revision, volume: summary.bodies[0].volume,
    replay: refused.code }) + '\n');
});
