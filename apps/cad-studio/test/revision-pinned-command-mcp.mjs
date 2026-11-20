import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { withMcpSession } from './mcp-browser-session.mjs';

assert.ok(process.argv[2], 'Supply a new external output directory');
const app = resolve(import.meta.dirname, '..');
const output = resolve(process.argv[2]);
assert.ok(relative(resolve(app, '../../'), output).startsWith('../'));
await mkdir(output);
const file = join(output, 'mcp-bored-plate.bcad');
const stock = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {},
  nodes: [
    { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [40, 30] },
    { id: 'n1', kind: 'extrude', sketch: 0, height: 8 },
  ],
  outputs: { b1: { node: 1, side: 'solid' } }, nextId: 2,
};
await writeFile(file, JSON.stringify(stock));

await withMcpSession({ app, output, clientName: 'barocss-revision-pinned-command', autonomy: 3 }, file, 'command', async (call, request) => {
  const action = { action: 'command', command: 'hole', faces: ['n1.top'], values: { type: 'through', x: 11, y: 9, d: 6 } };
  async function review(label) {
    const reply = await request('tools/call', { name: 'query', arguments: { action: 'render', highlight: ['n1.top'] } });
    assert.equal(reply.isError, false, JSON.stringify(reply));
    const data = JSON.parse(reply.content[0].text);
    assert.match(data.revision, /^[a-f0-9]{16}$/);
    const png = Buffer.from(reply.content.find(item => item.type === 'image').data, 'base64');
    assert.equal(createHash('sha256').update(png).digest('hex'), data.imageSha256);
    await writeFile(join(output, label + '.png'), png);
    return data.revision;
  }

  const a = await review('review-a');
  await call('features', { action: 'edit', index: 1, values: { h: 10 }, expectedRevision: a });
  const before = await readFile(file);
  const b = (await call('query', { action: 'rebuild' })).revision;
  assert.notEqual(b, a);
  const refused = await call('features', { ...action, expectedRevision: a }, true);
  assert.deepEqual([refused.code, refused.expectedRevision, refused.revision], ['COMMAND_STALE', a, b]);
  assert.deepEqual(await readFile(file), before);
  assert.equal(await review('review-b'), b);
  await call('features', { ...action, expectedRevision: b });
  const after = JSON.parse(await readFile(file, 'utf8'));
  assert.deepEqual(after.nodes.slice(0, 2), JSON.parse(before.toString('utf8')).nodes);
  const node = after.nodes[2];
  assert.deepEqual([node.kind, node.parent, node.radius, node.center], ['hole', { node: 1, side: 'solid' }, 3, [11, 9]]);
  process.stdout.write(`PASS: current MCP revision ${b} accepted; stale revision ${a} preserved saved bytes\n`);
});
