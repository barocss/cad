import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { withMcpSession } from './mcp-browser-session.mjs';

const baseline = process.argv.includes('--expect-refused');
const turn = Math.atan2(3, 4), turnDegrees = turn * 180 / Math.PI;
const points = [[0, 0], [30, 0], [50, 15], [50, 45], [0, 45]];
const contacts = [[24, 0], [34.8, 3.6]];
const shape = { kind: 'polygon', closed: true, points, hv: { h: [0, 3], v: [2, 4] },
  ids: ['e1', 'e2', 'e3', 'e4', 'e5'], rules: [
    { kind: 'fix', point: 0, at: points[0] }, { kind: 'fix', point: 2, at: points[2] },
    { kind: 'angle', a: 0, b: 1, value: 180 - turnDegrees },
  ] };
const pins = [
  'packages/barocss-cad-model/src/sketch/corner.ts',
  'packages/barocss-cad-model/src/chat/part/sketchCorner.ts',
  'apps/cad-studio/src/sketch/cornerDraft.ts', 'apps/cad-studio/src/ui/SketchCornerTools.tsx',
];
const f = await createFlow({
  name: 'angle-constrained-sketch-chamfer', output: process.argv[2], envFrozen: 'D1758_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Chamfer two angle-constrained straight sides in desktop Studio and verify both native setbacks.',
  limits: ['One XY 3:4:5 corner with an authored angle, 6 mm equal setbacks and a 10 mm extrusion.'],
  inspectorSource: `
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkBrep, faceGeometry, massPropertiesOf } from '@barocss/cad';
import { emptyDoc, withNode } from '@barocss/cad-model/engine/doc';
import { partSnapshot } from '@barocss/cad-model/engine/part';
import { profileOf } from '@barocss/cad-model/sketch/loops';
import { digestOf } from '@barocss/cad-model/util/digest';
const input = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (JSON.parse(process.argv[3])) {
  const profile = profileOf([input]);
  assert.ok('node' in profile, JSON.stringify(profile));
  console.log(JSON.stringify(withNode(withNode(emptyDoc(), profile.node), { kind: 'extrude', sketch: 0, height: 10 })));
} else {
  const { outputs: [body] } = partSnapshot(input), { brep } = body;
  const topology = checkBrep(brep, { strict: true });
  assert.ok(topology.valid && brep.shells.every(shell => shell.closed), topology.issues.join(' '));
  const bevel = brep.faces.find(face => face.name === 'n1.side[e6]');
  const edgeIds = new Set(brep.coedges.filter(use => bevel?.loops.includes(use.loop)).map(use => use.edge));
  const vertexIds = new Set(brep.edges.filter(edge => edgeIds.has(edge.id)).flatMap(edge => edge.vertices));
  const corners = brep.vertices.filter(vertex => vertexIds.has(vertex.id)).map(vertex => vertex.point);
  console.log(JSON.stringify({ volume: massPropertiesOf(body).volume, digest: digestOf(brep), corners,
    walls: brep.faces.filter(face => face.name?.startsWith('n1.side[')).map(face => [face.name, faceGeometry(face)]) }));
}
`,
});
const near = (value, expected, tolerance = 1e-7) =>
  assert.ok(Math.abs(value - expected) <= tolerance, JSON.stringify({ value, expected, tolerance }));
const button = (label, scope = f.sketchPanel()) => scope.getByRole('button', { name: label, exact: true });

async function verify(label, doc, original) {
  const native = await f.inspect(label, doc, false);
  near(native.volume, 20892);
  const walls = new Map(native.walls);
  assert.equal(walls.size, 6);
  for (const [name, before] of original.walls) {
    const after = walls.get(name);
    assert.equal(after.kind, 'plane');
    after.n.forEach((value, i) => near(value, before.n[i]));
    near(after.n.reduce((sum, value, i) => sum + value * (after.o[i] - before.o[i]), 0), 0);
  }
  assert.equal(walls.get('n1.side[e6]').kind, 'plane');
  assert.equal(native.corners.length, 4);
  for (const [x, y] of contacts) for (const z of [0, 10]) {
    assert.ok(native.corners.some(point => Math.hypot(point[0] - x, point[1] - y, point[2] - z) < 1e-7));
    near(Math.hypot(x - 30, y), 6);
  }
  const { outline, sideTags } = doc.nodes[0];
  assert.deepEqual(sideTags.outer, ['e1', 'e6', 'e2', 'e3', 'e4', 'e5']);
  assert.deepEqual(outline.points, [points[0], ...contacts, ...points.slice(2)]);
  const carrier = outline.rules.find(rule => rule.kind === 'angle' && rule.a === 0 && rule.b === 2);
  const bevel = outline.rules.find(rule => rule.kind === 'angle' && rule.a === 0 && rule.b === 1);
  near(carrier.value, turnDegrees);
  near(bevel.value, 180 - turnDegrees / 2);
  near(outline.lengths[1], 12 * Math.cos(turn / 2));
  f.report.observations.push({ label, volume: native.volume, digest: native.digest, corners: native.corners,
    carrierAngle: carrier.value, bevelAngle: bevel.value, bevelLength: outline.lengths[1] });
  return native;
}

async function approve(source, expected, native) {
  const file = join(f.output, 'chamfer-proposal.bcad'), bytes = JSON.stringify(source);
  await writeFile(file, bytes);
  await withMcpSession({ app: f.app, output: f.output, clientName: f.name }, file, 'angle-chamfer', async call => {
    const read = await call('query', { action: 'edit_fields', index: 0, includeSketchCorners: true });
    assert.ok(read.sketchCorners.some(corner => corner.sides.join(',') === 'e1,e2'));
    const args = { action: 'edit', index: 0, expectedRevision: read.revision,
      sketchChamfer: { sketch: read.id, sides: ['e1', 'e2'], distance: 6 } };
    const propose = (edit, refused) => call('proposals', {
      action: 'propose', title: 'Chamfer both sides at D6', ops: [{ tool: 'features', args: edit }],
    }, refused);
    assert.match((await propose({ ...args, expectedRevision: '0'.repeat(16) }, true)).error, /part changed/i);
    assert.equal(await readFile(file, 'utf8'), bytes);
    const staged = await propose(args);
    assert.deepEqual([staged.proposal, staged.applied], ['P1', false]);
  });
  const pending = JSON.parse(await readFile(file, 'utf8'));
  assert.deepEqual([pending.nodes, pending.outputs], [source.nodes, source.outputs]);
  await f.freshOpen(file, pending, '06-agent-pending');
  await button('Chat', f.page).first().click();
  const card = f.page.getByRole('listitem', { name: 'Proposal P1', exact: true });
  await button('Preview', card).click();
  await button('Hide', card).waitFor();
  await f.same(pending);
  await button('Accept', card).click();
  await f.changed(pending);
  const accepted = (await f.snapshot('07-agent-approved')).doc;
  assert.deepEqual([accepted.nodes, accepted.outputs], [expected.nodes, expected.outputs]);
  assert.deepEqual(await f.inspect('approved-native', accepted, false), native);
}

await f.run(async () => {
  const origin = new URL(f.server.resolvedUrls.local[0]).origin;
  const newContext = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async options => {
    const context = await newContext({ ...options, serviceWorkers: 'block' });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      return url.origin === origin ? route.continue() : route.abort();
    });
    return context;
  };
  const source = await f.inspect('seed', shape, true);
  const file = join(f.output, 'angle-corner.bcad');
  await writeFile(file, JSON.stringify(source));
  await f.freshOpen(file, source, '01-angle-corner-open');
  const original = await f.inspect('native-source', source, false);
  near(original.volume, 21000);
  await f.openFeatureEditor(1, 'extrude');
  await button('Edit sketch', f.editor()).click();
  await f.sketchPanel().waitFor();
  await f.tool('Select', 's');
  await f.frame(points);
  f.phase = 'Pick both straight sides and preview an equal-setback Chamfer';
  await f.worldClick([15, 0]);
  const second = await f.screenOf([40, 7.5]);
  await f.page.keyboard.down('Shift');
  try { await f.page.mouse.click(...second); } finally { await f.page.keyboard.up('Shift'); }
  for (const edge of [0, 1])
    await f.page.locator(`.vp-overlay .sk-pick-edge.on[data-sketch-entity="edge:${edge}"]`).waitFor({ state: 'attached' });
  assert.equal(await f.page.locator('.vp-overlay .sk-pick-edge.on').count(), 2);
  await button('Chamfer').click();
  const group = f.sketchPanel().getByRole('group', { name: 'Chamfer', exact: true });
  const distance = group.getByLabel('Distance', { exact: true });
  const apply = button('Apply', group);
  if (baseline) {
    await distance.fill('6');
    await group.getByRole('alert').filter({ hasText: /remove the constraints/i }).waitFor();
    assert.ok(await apply.isDisabled());
    await f.same(source);
    await f.snapshot('02-authored-angle-refused');
    return;
  }
  await distance.fill('100');
  await group.getByRole('alert').waitFor();
  assert.ok(await apply.isDisabled());
  await f.same(source);
  await f.snapshot('02-oversize-refused');
  await distance.fill('6');
  await f.page.locator('.sk-corner-preview').waitFor();
  await f.same(source);
  await f.snapshot('03-d6-preview');
  await apply.click();
  const chamfered = (await f.finishSketch('04-d6-finished')).doc;
  assert.deepEqual(chamfered.nodes[1], source.nodes[1]);
  const native = await verify('native-d6', chamfered, original);
  await f.undo();
  await f.same(source);
  await f.redo();
  await f.same(chamfered);
  const saved = await f.save('angle-chamfer-d6');
  const reopened = (await f.freshOpen(saved.file, chamfered, '05-d6-fresh-open')).doc;
  assert.deepEqual(await verify('reopened-d6', reopened, original), native);
  await approve(source, chamfered, native);
});
