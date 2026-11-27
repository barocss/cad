// Run this driver first. Pass the emitted edited-stock-part.bcad to agent-review-part-browser.mjs.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { withMcpSession } from './mcp-browser-session.mjs';

assert.ok(process.argv[2], 'Supply a new external output directory');
const app = resolve(import.meta.dirname, '..');
const output = resolve(process.argv[2]);
assert.ok(relative(resolve(app, '../..'), output).startsWith('../'));
await mkdir(output);
const file = join(output, 'edited-stock-part.bcad');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const textJSON = result => JSON.parse(result.content.find(c => c.type === 'text').text);
const exchanges = [];

async function render(call, label, expectedRevision) {
  const before = await readFile(file);
  const result = await call('query', { action: 'render', ...(expectedRevision ? { expectedRevision } : {}) }, label);
  const data = textJSON(result), images = result.content.filter(c => c.type === 'image');
  assert.equal(images.length, 1);
  assert.equal(images[0].mimeType, 'image/png');
  const image = Buffer.from(images[0].data, 'base64');
  assert.deepEqual([...image.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.deepEqual([image.readUInt32BE(16), image.readUInt32BE(20)], [1000, 1000]);
  assert.deepEqual(Object.keys(data.views).sort(), ['front', 'iso', 'right', 'top']);
  assert.match(data.revision, /^[a-f0-9]{16}$/);
  assert.equal(data.imageSha256, sha256(image), 'public digest binds the exact decoded PNG bytes');
  if (expectedRevision) assert.equal(data.revision, expectedRevision);
  assert.deepEqual(result.structuredContent, data);
  assert.deepEqual(await readFile(file), before, 'read-only render preserves exact saved file bytes');
  await writeFile(join(output, label + '.png'), image);
  await writeFile(join(output, label + '.json'), JSON.stringify(data, null, 2));
  return data;
}

await withMcpSession({
  app, output, clientName: 'barocss-agent-review-part', autonomy: 2,
  telemetry: row => exchanges.push({ label: 'initialize', ...row }),
}, file, 'review', async (_read, request) => {
  const call = async (name, args, label = name, expectError = false) => {
    const reply = await request('tools/call', { name, arguments: args }, { label });
    assert.equal(reply.isError, expectError, label + ': ' + reply.content[0].text);
    return reply;
  };
  const describe = (tool, action) => call('describe', { tool, action }, `describe ${tool}.${action}`);
  const listed = await request('tools/list', {}, { label: 'tools/list' });
  assert.ok(listed.tools.some(t => t.name === 'query') && listed.tools.some(t => t.name === 'describe'));
  assert.equal(listed.tools.length, 13);
  await describe('features', 'command');
  await call('describe', { command: 'box' }, 'describe box');
  await call('features', { action: 'command', command: 'box', values: { w: 40, d: 20, h: 8 } });
  await describe('requirements', 'set');
  await call('requirements', { action: 'set', requirements: [{ id: 'VOLUME', source: 'Synthetic review fixture: 40 by 20 by 12 mm', basis: 'assumed', hard: true,
    check: { op: '==', query: { fn: 'volume' }, value: 9600, tol: 1e-6 } }] });
  await describe('query', 'summary');
  const summary = textJSON(await call('query', { action: 'summary' }));
  const extrusion = summary.features.find(f => f.node?.kind === 'extrude');
  assert.ok(extrusion);
  await describe('query', 'render');
  await describe('query', 'rebuild');
  const rebuildA = textJSON(await call('query', { action: 'rebuild' }, 'rebuild-A'));
  const a = await render(call, 'review-A');
  assert.equal(a.revision, rebuildA.revision, 'render A and rebuild A identify the same reviewed model');
  // A valid picture must never turn a failing engineering requirement into a pass.
  await describe('requirements', 'check');
  const mismatch = textJSON(await call('requirements', { action: 'check' }));
  assert.deepEqual([mismatch.summary.pass, mismatch.summary.fail, mismatch.summary.unknown], [0, 1, 0]);
  const pinnedA = await render(call, 'review-A-pinned', a.revision);
  assert.equal(pinnedA.imageSha256, a.imageSha256);
  const source = await readFile(file);
  const invalidAction = await call('query', { action: 'review-missing' }, 'unknown review action', true);
  assert.match(textJSON(invalidAction).error, /query takes "action".*render/);
  const extraField = await call('query', { action: 'render', expectedRevision: a.revision, invented: true }, 'unknown review argument', true);
  assert.match(extraField.content[0].text, /UNKNOWN_ARGUMENT.*invented/);
  assert.ok([invalidAction, extraField].every(result => result.content.every(block => block.type === 'text')));
  assert.deepEqual(await readFile(file), source);
  const editSchema = textJSON(await describe('features', 'edit')).input;
  assert.deepEqual(editSchema.properties.expectedRevision, { type: 'string', pattern: '^[a-f0-9]{16}$' });
  assert.ok(!editSchema.required.includes('expectedRevision'));
  await call('features', { action: 'edit', index: extrusion.index, values: { h: 12 }, expectedRevision: a.revision }, 'edit reviewed A');
  const check = textJSON(await call('requirements', { action: 'check' }));
  assert.deepEqual([check.summary.pass, check.summary.fail, check.summary.unknown], [1, 0, 0]);
  const beforeRefusal = await readFile(file);
  const stale = await call('query', { action: 'render', expectedRevision: a.revision }, 'review-A-stale-after-edit', true);
  assert.equal(stale.isError, true);
  assert.match(JSON.stringify(stale.content), /RENDER_STALE/);
  const refused = textJSON(stale);
  assert.equal(refused.expectedRevision, a.revision);
  assert.match(refused.revision, /^[a-f0-9]{16}$/);
  assert.equal(stale.content.filter(c => c.type === 'image').length, 0);
  assert.deepEqual(await readFile(file), beforeRefusal);
  const rebuildB = textJSON(await call('query', { action: 'rebuild' }, 'rebuild-B'));
  const staleEdit = await call('features', {
    action: 'edit', index: extrusion.index, values: { from: 2 }, expectedRevision: a.revision,
  }, 'refuse edit from review A against B', true);
  const editRefusal = textJSON(staleEdit);
  assert.deepEqual([editRefusal.code, editRefusal.expectedRevision, editRefusal.revision], ['EDIT_STALE', a.revision, rebuildB.revision]);
  assert.deepEqual(await readFile(file), beforeRefusal, 'the stale edit preserves B byte for byte');
  const invalidEdit = await call('features', {
    action: 'edit', index: extrusion.index, values: { from: 2 }, expectedRevision: 'invalid',
  }, 'refuse invalid revision', true);
  assert.equal(textJSON(invalidEdit).code, 'EDIT_INPUT');
  assert.deepEqual(await readFile(file), beforeRefusal);
  const b = await render(call, 'review-B');
  assert.equal(b.revision, rebuildB.revision, 'render B and rebuild B identify the same reviewed model');
  assert.equal(refused.revision, b.revision);
  assert.notEqual(b.revision, a.revision);
  assert.notEqual(b.imageSha256, a.imageSha256);
  const pinnedB = await render(call, 'review-B-pinned', b.revision);
  assert.equal(pinnedB.imageSha256, b.imageSha256);
  const saved = JSON.parse(await readFile(file, 'utf8'));
  assert.equal(saved.nodes[extrusion.index].height, 12);
});
await writeFile(join(output, 'review-wire-measurements.json'), JSON.stringify({ node: process.version, exchanges }, null, 2));
process.stdout.write('PASS: A and B render pins, stale refusal, PNG digests and native volume\n');
