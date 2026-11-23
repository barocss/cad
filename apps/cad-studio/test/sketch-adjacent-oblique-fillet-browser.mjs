import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { currentPartRevision, withMcpSession } from './mcp-browser-session.mjs';

const baseline = process.argv.includes('--observe-base');
const turn = Math.atan2(3, 4);
const points = [[0, 0], [30, 0], [50, 15], [50, 45], [0, 45]];
const shape = { kind: 'polygon', closed: true, points, hv: { h: [0, 3], v: [2, 4] },
  ids: ['e1', 'e2', 'e3', 'e4', 'e5'], rules: [
    { kind: 'fix', point: 2, at: points[2] },
    { kind: 'fix', point: 4, at: points[4] },
    { kind: 'angle', a: 0, b: 1, value: 180 - turn * 180 / Math.PI },
  ] };
const pins = [
  'apps/cad-studio/test/sketch-adjacent-oblique-fillet-browser.mjs',
  'apps/cad-studio/src/sketch/cornerDraft.ts', 'apps/cad-studio/src/ui/SketchCornerTools.tsx',
  'packages/barocss-cad-model/src/sketch/corner.ts', 'packages/barocss-cad-model/src/sketch/cornerBatch.ts',
  'packages/barocss-cad-model/src/chat/part/sketchCorner.ts',
];
const f = await createFlow({
  name: 'sketch-adjacent-oblique-fillet', output: process.argv[2], envFrozen: 'D1766_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Round adjacent right and authored oblique corners while retaining their shared straight side.',
  limits: ['One independent XY outline and one 10 mm Extrude, desktop WebGPU.'],
  inspectorSource: `
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkBrep, faceGeometry, massPropertiesOf } from '@barocss/cad';
import { emptyDoc, withNode } from '@barocss/cad-model/engine/doc';
import { partSnapshot } from '@barocss/cad-model/engine/part';
import { profileOf } from '@barocss/cad-model/sketch/loops';
import { digestOf } from '@barocss/cad-model/util/digest';
const input = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (JSON.parse(process.argv[3] ?? 'false')) {
  const profile = profileOf([input]);
  assert.ok('node' in profile, JSON.stringify(profile));
  console.log(JSON.stringify(withNode(withNode(emptyDoc(), profile.node), { kind: 'extrude', sketch: 0, height: 10 })));
} else {
  const { outputs: [output] } = partSnapshot(input), { brep } = output;
  const report = checkBrep(brep, { strict: true });
  console.log(JSON.stringify({ valid: report.valid, issues: report.issues, volume: massPropertiesOf(output).volume,
    walls: brep.faces.map(face => [face.name, faceGeometry(face)]), digest: digestOf(brep) }));
}
`,
});
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const controls = () => f.sketchPanel().getByRole('group', { name: 'Fillet', exact: true });
const preview = () => f.page.locator('.sk-corner-preview');
const radius = () => controls().getByLabel('Radius', { exact: true });
const acceptedPoints = [[0, 6], [6, 0], [28, 0], [31.6, 1.2], ...points.slice(2)];
const acceptedTags = ['e6', 'e1', 'e7', 'e2', 'e3', 'e4', 'e5'];
const near = (actual, expected, tolerance = 1e-7) =>
  assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance, JSON.stringify({ actual, expected, tolerance }));

async function openSketch() {
  await f.openFeatureEditor(1, 'extrude');
  await button('Edit sketch', f.editor()).click();
  await f.sketchPanel().waitFor();
  await f.tool('Select', 's');
  await f.frame(points);
}

async function start() {
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
  const source = await f.inspect('sharp-source', shape, true);
  const input = join(f.output, 'adjacent-angle-corners.bcad');
  await writeFile(input, JSON.stringify(source));
  await f.freshOpen(input, source, '01-sharp-source');
  return source;
}

function verifyPair(source, rounded, native) {
  const sketch = rounded.nodes[0], outline = sketch.outline;
  assert.deepEqual(outline.points, acceptedPoints);
  assert.deepEqual(sketch.sideTags.outer, acceptedTags);
  assert.deepEqual(outline.radii, { 0: 6, 2: 6 });
  assert.deepEqual(outline.tangents, [0, 1, 2, 3]);
  assert.deepEqual(outline.rules.filter(rule => rule.kind === 'fix'), [
    { kind: 'fix', point: 4, at: [50, 15] }, { kind: 'fix', point: 6, at: [0, 45] },
  ]);
  const angle = outline.rules.find(rule => rule.kind === 'angle');
  assert.deepEqual([angle.a, angle.b], [1, 3]);
  near(angle.value, turn * 180 / Math.PI);
  assert.equal(outline.points[2][0] - outline.points[1][0], 22);
  assert.deepEqual([rounded.nodes[1], rounded.outputs], [source.nodes[1], source.outputs]);
  assert.ok(native.valid, native.issues.join('\n'));
  const wallByName = new Map(native.walls);
  assert.equal(wallByName.get('n1.side[e1]').kind, 'plane');
  for (const [tag, x] of [['e6', 6], ['e7', 28]]) {
    const wall = wallByName.get(`n1.side[${tag}]`);
    assert.equal(wall.kind, 'cylinder');
    assert.equal(wall.out, 1);
    near(wall.r, 6);
    near(wall.c[0], x);
    near(wall.c[1], 6);
  }
  near(native.volume, 21000 - 360 * (1 - Math.PI / 4 + 1 / 3 - turn / 2));
}

async function selectWithShift(picks) {
  await f.worldClick(picks[0]);
  await f.page.keyboard.down('Shift');
  try { for (const point of picks.slice(1)) await f.worldClick(point); }
  finally { await f.page.keyboard.up('Shift'); }
}

async function approveWithAgent(source, native) {
  const file = join(f.output, 'adjacent-angle-fillet-proposal.bcad');
  const bytes = JSON.stringify(source);
  await writeFile(file, bytes);
  await withMcpSession({ app: f.app, output: f.output, clientName: f.name }, file, 'adjacent-fillets', async call => {
    const fields = await call('query', { action: 'edit_fields', index: 0, includeSketchCorners: true });
    assert.equal(fields.revision, await currentPartRevision(call));
    const corners = fields.sketchCorners.filter(({ point }) => point[1] === 0 && [0, 30].includes(point[0])).map(item => item.sides);
    assert.deepEqual(corners, [['e5', 'e1'], ['e1', 'e2']]);
    const input = value => ({ tool: 'features', args: { action: 'edit', index: 0, expectedRevision: fields.revision,
      sketchRound: { sketch: fields.id, corners, radius: value } } });
    const propose = (value, error) => call('proposals', { action: 'propose', title: 'Round the adjacent sketch corners', ops: [input(value)] }, error);
    assert.match((await propose(24, true)).error, /shared edge/i);
    assert.equal(await readFile(file, 'utf8'), bytes);
    const dry = await call('features', { action: 'batch', dryRun: true, ops: [input(6)] });
    assert.ok(dry.dryRun);
    assert.deepEqual(dry.diff.changed.map(feature => feature.id), ['n0']);
    assert.equal(await readFile(file, 'utf8'), bytes);
    const staged = await propose(6, false);
    assert.deepEqual([staged.proposal, staged.applied], ['P1', false]);
  });
  const pending = JSON.parse(await readFile(file, 'utf8'));
  assert.deepEqual([pending.nodes, pending.outputs], [source.nodes, source.outputs]);
  await f.freshOpen(file, pending, '09-proposal-open');
  await button('Chat').first().click();
  const card = f.page.getByRole('listitem', { name: 'Proposal P1', exact: true });
  await button('Preview', card).click();
  await button('Hide', card).waitFor();
  await f.same(pending);
  await f.snapshot('10-proposal-preview');
  await button('Accept', card).click();
  await f.changed(pending);
  const approved = (await f.snapshot('11-proposal-approved')).doc;
  const read = await f.inspect('approved-native', approved);
  verifyPair(source, approved, read);
  assert.equal(read.digest, native.digest);
}

await f.run(async () => {
  const source = await start();
  const sourceNative = await f.inspect('sharp-native', source);
  assert.ok(sourceNative.valid, sourceNative.issues.join('\n'));
  near(sourceNative.volume, 21000);
  await openSketch();
  f.phase = 'Select the two adjacent corners';
  await selectWithShift(points.slice(0, 2));
  assert.deepEqual(await f.page.locator('.vp-overlay .sk-pick-point.on').evaluateAll(nodes => nodes.map(node => node.dataset.sketchEntity)),
    ['point:0', 'point:1']);
  await button('Fillet').click();
  const apply = button('Apply', controls());
  if (!baseline) {
    await radius().fill('24');
    await controls().getByRole('alert').getByText(/too little of a shared edge/i).waitFor();
    await preview().first().waitFor({ state: 'hidden' });
    assert.ok(await apply.isDisabled());
    await f.same(source);
    await f.snapshot('02-r24-shared-carrier-refused');
  }
  await radius().fill('6');
  await f.same(source);
  const previewState = await f.snapshot('02-r6-preview-or-refusal');
  if (!await apply.isEnabled()) {
    f.report.observations.push({ label: 'r6-refused', sketch: previewState.sketchPanel, alert: previewState.sketchAlert });
    assert.ok(baseline, 'Both adjacent R6 rounds should fit.');
    return;
  }
  await preview().first().waitFor();
  await apply.click();
  const rounded = (await f.finishSketch('03-adjacent-fillets-finished')).doc;
  const native = await f.inspect('rounded-native', rounded);
  f.report.observations.push({ label: 'r6-accepted', outline: rounded.nodes[0].outline, native });
  if (baseline) return;
  verifyPair(source, rounded, native);
  await f.undo();
  await f.same(source);
  await f.redo();
  await f.same(rounded);
  const saved = await f.save('adjacent-angle-fillets');
  const reopened = (await f.freshOpen(saved.file, rounded, '04-r6-fresh-open')).doc;
  const reopenedNative = await f.inspect('reopened-native', reopened);
  verifyPair(source, reopened, reopenedNative);
  assert.equal(reopenedNative.digest, native.digest);

  await f.freshOpen(join(f.output, 'adjacent-angle-corners.bcad'), source, '05-source-reopen');
  await openSketch();
  f.phase = 'Select three shared straight carriers';
  await selectWithShift([[0, 20], [15, 0], [40, 7.5]]);
  const selected = f.page.locator('.vp-overlay .sk-pick-edge.on');
  assert.deepEqual(await selected.evaluateAll(nodes => nodes.map(node => node.dataset.sketchEntity).sort()), ['edge:0', 'edge:1', 'edge:4']);
  await button('Fillet').click();
  await radius().fill('6');
  await preview().first().waitFor();
  await f.same(source);
  await f.snapshot('06-three-carriers-preview');
  await button('Apply', controls()).click();
  const fromEdges = (await f.finishSketch('07-three-carriers-applied')).doc;
  const edgeNative = await f.inspect('three-carriers-native', fromEdges);
  verifyPair(source, fromEdges, edgeNative);
  assert.equal(edgeNative.digest, native.digest);
  await approveWithAgent(source, native);
});
