import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { withMcpSession } from './mcp-browser-session.mjs';

const output = process.argv[2], app = resolve(import.meta.dirname, '..');
assert.ok(output && isAbsolute(output) && relative(resolve(app, '../..'), output).startsWith('../'));
await mkdir(output);
const file = join(output, 'accepted.bcad');
const names = doc => doc.nodes.map(node => node.id);

await withMcpSession({ app, output, clientName: 'barocss-reviewed-delete', autonomy: 3 }, file, 'delete', async (call, request) => {
  const { input } = await call('describe', { tool: 'features', action: 'delete' });
  assert.deepEqual(input.required, ['index']);
  assert.equal(input.properties.expectedRevision.pattern, '^[a-f0-9]{16}$');
  for (const [w, d, h, x] of [[40, 20, 8, 0], [20, 10, 5, 60], [15, 12, 10, 120]]) {
    await call('features', { action: 'command', command: 'box', values: { w, d, h, x, y: 0, z: 0 } });
  }
  async function review(label) {
    const reply = await request('tools/call', { name: 'query', arguments: { action: 'render', highlight: ['n3.top'] } });
    assert.equal(reply.isError, false);
    const data = JSON.parse(reply.content[0].text);
    assert.match(data.revision, /^[a-f0-9]{16}$/);
    const png = Buffer.from(reply.content.find(entry => entry.type === 'image').data, 'base64');
    assert.equal(createHash('sha256').update(png).digest('hex'), data.imageSha256);
    await writeFile(join(output, label + '.png'), png);
    return data.revision;
  }
  const a = await review('review-a');
  assert.equal(JSON.parse(await readFile(file)).nodes[3].id, 'n3');
  await call('features', { action: 'delete', index: 1, expectedRevision: a });

  const b = await review('review-b');
  assert.notEqual(b, a);
  assert.equal((await call('query', { action: 'rebuild' })).revision, b);
  const before = await readFile(file);
  const doc = JSON.parse(before);
  assert.deepEqual(names(doc), ['n2', 'n3', 'n4', 'n5']);
  await copyFile(file, join(output, 'review-b.bcad'));

  const stale = await call('features', { action: 'delete', index: 3, expectedRevision: a }, true);
  assert.deepEqual([stale.code, stale.expectedRevision, stale.revision], ['DELETE_STALE', a, b]);
  const malformed = await call('features', { action: 'delete', index: 3, expectedRevision: 'bad-pin' }, true);
  assert.equal(malformed.code, 'DELETE_INPUT');
  assert.deepEqual(await readFile(file), before);
  const rejected = await call('features', { action: 'batch', ops: [
    { tool: 'features', args: { action: 'edit', index: 1, values: { h: 6 }, expectedRevision: b } },
    { tool: 'features', args: { action: 'delete', index: 3, expectedRevision: b } },
  ] }, true);
  assert.equal(rejected.failed_op, 1);
  assert.match(rejected.error, /part changed since the requested revision/);
  assert.deepEqual(await readFile(file), before);

  const { bodies: current } = await call('query', { action: 'summary' });
  assert.deepEqual(current.map(({ key, volume }) => [key, volume]), [['b3', 1000], ['b5', 1800]]);
  await call('features', { action: 'delete', index: 1, expectedRevision: b });
  const { bodies: after } = await call('query', { action: 'summary' });
  assert.deepEqual(after.map(({ key, volume }) => [key, volume]), [['b5', 1800]]);
  const accepted = await readFile(file);
  assert.deepEqual(names(JSON.parse(accepted)), ['n4', 'n5']);
  const replay = await call('features', { action: 'delete', index: 1, expectedRevision: b }, true);
  assert.equal(replay.code, 'DELETE_STALE');
  assert.deepEqual(await readFile(file), accepted);
  await writeFile(join(output, 'revisions.json'), JSON.stringify({ reviewed: a, current: b }));
  process.stdout.write(JSON.stringify({ a, b, stale: stale.code, malformed: malformed.code, remaining: [['b5', 1800]] }) + '\n');
});
