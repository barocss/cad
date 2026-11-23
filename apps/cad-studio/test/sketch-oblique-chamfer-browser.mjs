import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { withMcpSession } from './mcp-browser-session.mjs';

const baseline = process.argv.includes('--expect-refused');
const resize = process.argv.includes('--resize');
const turn = Math.atan2(3, 4), turnDegrees = turn * 180 / Math.PI;
const points = [[0, 0], [30, 0], [50, 15], [50, 45], [0, 45]];
const contactsOf = distance => [[30 - distance, 0], [30 + .8 * distance, .6 * distance]];
const outlineOf = distance => [points[0], ...contactsOf(distance), ...points.slice(2)];
const midpoint = distance => [30 - .1 * distance, .3 * distance];
const shape = { kind: 'polygon', closed: true, points, hv: { h: [0, 3], v: [2, 4] },
  ids: ['e1', 'e2', 'e3', 'e4', 'e5'], rules: [
    { kind: 'fix', point: 0, at: points[0] }, { kind: 'fix', point: 2, at: points[2] },
    { kind: 'angle', a: 0, b: 1, value: 180 - turnDegrees },
  ] };
const pins = [
  'packages/barocss-cad-model/src/sketch/corner.ts',
  'packages/barocss-cad-model/src/chat/part/sketchCorner.ts',
  'apps/cad-studio/src/sketch/cornerDraft.ts', 'apps/cad-studio/src/ui/SketchCornerTools.tsx',
  ...(resize ? ['packages/barocss-cad-model/src/sketch/chamferEdit.ts', 'apps/cad-studio/src/viewport/SketchCornerSizeHandle.tsx'] : []),
];
const f = await createFlow({
  name: 'angle-constrained-sketch-chamfer', output: process.argv[2], envFrozen: resize ? 'D1759_SOURCE_FROZEN' : 'D1758_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: (resize ? 'Resize a saved Chamfer between' : 'Chamfer') + ' two angle-constrained straight sides and verify both native setbacks.',
  limits: ['One XY 3:4:5 corner with an authored angle, equal setbacks and a 10 mm extrusion.'],
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

async function verify(label, doc, original, setback = 6) {
  const native = await f.inspect(label, doc, false);
  near(native.volume, 21000 - 3 * setback ** 2);
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
  for (const [x, y] of contactsOf(setback)) for (const z of [0, 10]) {
    assert.ok(native.corners.some(point => Math.hypot(point[0] - x, point[1] - y, point[2] - z) < 1e-7));
    near(Math.hypot(x - 30, y), setback);
  }
  const { outline, sideTags } = doc.nodes[0];
  assert.deepEqual(sideTags.outer, ['e1', 'e6', 'e2', 'e3', 'e4', 'e5']);
  const expected = outlineOf(setback);
  assert.equal(outline.points.length, expected.length);
  outline.points.forEach((point, i) => point.forEach((value, j) => near(value, expected[i][j])));
  const carrier = outline.rules.find(rule => rule.kind === 'angle' && rule.a === 0 && rule.b === 2);
  const bevel = outline.rules.find(rule => rule.kind === 'angle' && rule.a === 0 && rule.b === 1);
  near(carrier.value, turnDegrees);
  near(bevel.value, 180 - turnDegrees / 2);
  near(outline.lengths[1], 2 * setback * Math.cos(turn / 2));
  f.report.observations.push({ label, setback, volume: native.volume, digest: native.digest, corners: native.corners,
    carrierAngle: carrier.value, bevelAngle: bevel.value, bevelLength: outline.lengths[1] });
  return native;
}

async function approve(source, expected, native) {
  const file = join(f.output, 'chamfer-proposal.bcad'), bytes = JSON.stringify(source);
  await writeFile(file, bytes);
  await withMcpSession({ app: f.app, output: f.output, clientName: f.name }, file, 'angle-chamfer', async call => {
    const read = await call('query', { action: 'edit_fields', index: 0, includeSketchCorners: true });
    if (resize) assert.deepEqual(read.sketchChamfers, [{ bevel: 'e6', distance: 6 }]);
    else assert.ok(read.sketchCorners.some(corner => corner.sides.join(',') === 'e1,e2'));
    const sketchChamfer = resize ? { sketch: read.id, bevel: 'e6', distance: 9 }
      : { sketch: read.id, sides: ['e1', 'e2'], distance: 6 };
    const args = { action: 'edit', index: 0, expectedRevision: read.revision,
      sketchChamfer };
    const propose = (edit, refused) => call('proposals', {
      action: 'propose', title: resize ? 'Set the saved Chamfer to D9' : 'Chamfer both sides at D6',
      ops: [{ tool: 'features', args: edit }],
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

async function openSketch(frame) {
  await f.openFeatureEditor(1, 'extrude');
  await button('Edit sketch', f.editor()).click();
  await f.sketchPanel().waitFor();
  await f.tool('Select', 's');
  await f.frame(frame);
}

async function pickBevel(distance) {
  await openSketch(outlineOf(distance));
  await f.worldClick(midpoint(distance));
  await f.page.locator('.vp-overlay .sk-pick-edge.on[data-sketch-entity="edge:1"]').waitFor({ state: 'attached' });
}

async function resizeSaved(chamfered, original) {
  await pickBevel(6);
  const edit = () => button('Edit Chamfer');
  const group = () => f.sketchPanel().getByRole('group', { name: 'Edit Chamfer', exact: true });
  const field = () => group().getByLabel('Distance', { exact: true });
  const apply = () => button('Apply', group());
  const handle = () => f.page.getByRole('button', { name: 'Chamfer setback handle', exact: true });
  if (baseline) {
    assert.equal(await edit().count(), 0);
    assert.equal(await handle().count(), 0);
    await f.same(chamfered);
    await f.snapshot('06-saved-setback-unavailable');
    return;
  }
  f.phase = 'Resize the saved oblique Chamfer with its numeric control';
  await edit().click();
  assert.equal(await field().inputValue(), '6');
  await field().fill('6');
  assert.equal(await apply().isDisabled(), true);
  await field().fill('100');
  await group().getByRole('alert').waitFor();
  assert.equal(await apply().isDisabled(), true);
  await f.same(chamfered);
  await field().fill('9');
  await f.page.locator('.sk-corner-preview').waitFor();
  await f.same(chamfered);
  await f.snapshot('06-typed-d9-preview');
  await apply().click();
  const typed = (await f.finishSketch('07-typed-d9-applied')).doc;
  const typedNative = await verify('typed-d9', typed, original, 9);
  await f.undo();
  await f.same(chamfered);
  await f.redo();
  await f.same(typed);
  const saved = await f.save('edited-oblique-chamfer-d9');
  const reopened = (await f.freshOpen(saved.file, typed, '08-d9-fresh-open')).doc;
  assert.deepEqual(await verify('reopened-d9', reopened, original, 9), typedNative);

  await pickBevel(9);
  f.phase = 'Drag the native bevel midpoint to grow the setback';
  await edit().click();
  const [start, target] = await Promise.all([f.screenOf(midpoint(9)), f.screenOf(midpoint(12))]);
  await handle().waitFor();
  const box = await handle().boundingBox();
  const center = [box.x + box.width / 2, box.y + box.height / 2];
  near(Math.hypot(center[0] - start[0], center[1] - start[1]), 0, .75);
  await f.page.mouse.move(...center);
  await f.page.mouse.down();
  await f.page.mouse.move(center[0] + target[0] - start[0], center[1] + target[1] - start[1], { steps: 8 });
  await f.page.mouse.up();
  const dragged = Number(await field().inputValue());
  near(dragged, 12, .2);
  await f.same(typed);
  await f.snapshot('09-reopened-pointer-preview');
  await apply().click();
  const accepted = (await f.finishSketch('10-pointer-applied')).doc;
  await verify('pointer-native', accepted, original, dragged);
  await approve(chamfered, typed, typedNative);
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
  await openSketch(points);
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
  if (baseline && !resize) {
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
  if (resize) await resizeSaved(reopened, original);
  else await approve(source, chamfered, native);
});
