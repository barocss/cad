import assert from 'node:assert/strict';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { withMcpSession } from './mcp-browser-session.mjs';

const [output, variant = 'height'] = process.argv.slice(2), app = resolve(import.meta.dirname, '..');
assert.ok(output && isAbsolute(output) && relative(resolve(app, '../..'), output).startsWith('../'));
assert.ok(['height', 'diagonal'].includes(variant));
const diagonal = variant === 'diagonal';
const unit = vector => vector.map(value => value / Math.hypot(...vector));
const profile = diagonal
  ? { kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [8, 8],
    plane: { origin: [48, 60, 10], normal: unit([-10, 1, 5]), xAxis: unit([1, 10, 0]) } }
  : { kind: 'sketch', profile: 'polygon', points: [[28, 0], [37, 0], [42, 10], [32, 10]],
    plane: { origin: [0, 70, 0], normal: [0, -1, 0], xAxis: [1, 0, 0] } };
await mkdir(output);
const file = join(output, 'mcp-replaced.bcad');
const source = join(output, 'box-and-reference.bcad');

await withMcpSession({ app, output, clientName: 'barocss-replace-face', autonomy: 3 }, file, 'replace-face', async call => {
  await call('features', { action: 'command', command: 'box', values: { w: 40, d: 30, h: 10, x: 0, y: 0, z: 0 } });
  await call('features', { action: 'add', features: [
    profile,
    { kind: 'extrude', sketch: 2, height: diagonal ? 3 : 10 },
    { kind: 'translate', parent: { node: 3, side: 'solid' }, offset: [0, 0, 0] },
  ] });
  await copyFile(file, source);
  const before = await readFile(file);
  const faces = ['n1.side1', diagonal ? 'n3.bottom' : 'n3.side1'];
  const review = await call('query', { action: 'render', highlight: faces });
  assert.match(review.revision, /^[0-9a-f]{16}$/);
  assert.deepEqual(await readFile(file), before);
  const replace = { action: 'command', command: 'replace-face', faces, expectedRevision: review.revision };
  await call('features', replace);
  const accepted = await readFile(file);
  const doc = JSON.parse(accepted), node = doc.nodes[5];
  assert.deepEqual(doc.nodes.slice(0, 5), JSON.parse(before).nodes);
  assert.equal(node.kind, 'replace-face');
  assert.deepEqual(node.faces, ['n1.side1']);
  assert.equal(node.target.feature, 'n4');
  assert.equal(node.target.face, faces[1]);
  const { bodies } = await call('query', { action: 'summary' });
  assert.equal(bodies.length, 2);
  assert.ok(Math.abs(bodies.find(body => body.key === 'b5').volume - (diagonal ? 12300 : 11850)) < 1e-7);
  assert.ok(Math.abs(bodies.find(body => body.key === 'b4').volume - (diagonal ? 192 : 950)) < 1e-7);
  const stale = await call('features', replace, true);
  assert.equal(stale.code, 'COMMAND_STALE');
  assert.deepEqual(await readFile(file), accepted);
  process.stdout.write(JSON.stringify({ faces, revision: review.revision, volumes: bodies.map(({ key, volume }) => [key, volume]), replay: stale.code }) + '\n');
});
