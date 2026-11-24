import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const width = 40, depth = 30, height = 40;
const three = process.argv.includes('--three');
const interior = process.argv.includes('--interior');
const neutral = interior ? 4 : 0;
const baseline = process.argv.includes('--baseline');
const pins = [
  'apps/cad-studio/src/App.tsx',
  'apps/cad-studio/src/ui/NodeEditor.tsx',
  'packages/barocss-cad-model/src/app/commands.ts',
  'packages/barocss-cad-model/src/app/draftEdit.ts',
  'packages/barocss-cad-model/src/engine/part.ts',
  'packages/barocss-cad/src/part/part-face-finish.ts',
  'packages/barocss-cad/src/part/part-box-draft.ts',
  'packages/barocss-cad/src/part/part-box-shell.ts',
];
const f = await createFlow({
  name: 'adjacent-planar-draft', output: process.argv[2], envFrozen: interior && three ? 'D1969_SOURCE_FROZEN' : interior ? 'D1968_SOURCE_FROZEN' : three ? 'D1934_SOURCE_FROZEN' : 'D1252_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: `Author Draft on ${three ? 'three' : 'two'} rectangular stock sides, edit the angle, reject collapse, and reopen.`,
  limits: [`One rectangular solid, +Z pull, selected planar sides and the ${interior ? 'fixed interior' : 'body-end'} neutral plane.`],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { checkBrep, faceGeometry, massPropertiesOf } from '@barocss/cad';
import { partSnapshot } from '@barocss/cad-model/engine/part';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const { outputs } = partSnapshot(doc);
const body = outputs[0], brep = body.brep;
const vertexOf = new Map(brep.vertices.map(v => [v.id, v.point]));
const loopOf = new Map(brep.loops.map(l => [l.id, l]));
const coedgeOf = new Map(brep.coedges.map(c => [c.id, c]));
const faces = Object.fromEntries(brep.faces.map(face => [face.name, face.loops.flatMap(id =>
  loopOf.get(id).coedges.map(use => coedgeOf.get(use).edge))]));
const edges = brep.edges.map(e => ({ id: e.id, name: e.name,
  endpoints: e.vertices.map(v => vertexOf.get(v)), degree: e.curve.degree, poles: e.curve.controlPoints }));
const mass = massPropertiesOf(body);
const normals = Object.fromEntries(brep.faces.map(face => [face.name, faceGeometry(face).n]));
console.log(JSON.stringify({ outputs: outputs.length, shellClosed: brep.shells[0].closed,
  faces, normals, edges, points: [...vertexOf.values()], volume: mass.volume, centroid: mass.centroid,
  check: checkBrep(brep, { strict: true }) }));
`,
});
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const hud = name => f.page.getByRole('dialog', { name, exact: true });
const status = (panel, state) => panel.locator('.status').filter({ hasText: new RegExp('^' + state + '$') }).waitFor();
const near = (a, b) => Math.abs(a - b) < 1e-7;
const samePoint = (a, b) => a.every((v, i) => near(v, b[i]));

async function pick(view, point, count) {
  if (view === 'Back') {
    await button('View cube directions').click();
    await f.page.getByRole('menuitem', { name: 'Back', exact: true }).click();
    await f.page.locator('.vc-label').getByText('BACK', { exact: true }).waitFor();
  } else await button(view, f.page.locator('.views')).click();
  await f.page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
  const pixel = await f.page.evaluate(point => window.__studioScreenOf(point), point);
  assert.ok(await f.page.evaluate(pixel => document.elementFromPoint(...pixel)?.matches('canvas.vp-canvas'), pixel), pixel);
  if (count > 1) await f.page.keyboard.down('Shift');
  try { await f.page.mouse.click(...pixel); }
  finally { if (count > 1) await f.page.keyboard.up('Shift'); }
  await f.page.waitForFunction(n => window.__studioSelection.selection.faces.length === n, count);
}

async function inspect(label, doc, angle, source) {
  const read = await f.inspect(label, doc);
  assert.equal(read.outputs, 1);
  assert.equal(read.check.valid, true, read.check.issues.join('\n'));
  assert.equal(read.shellClosed, true);
  assert.deepEqual(read.check.counts, { bodies: 1, shells: 1, faces: 6, loops: 6, coedges: 24, edges: 12, vertices: 8 });
  const slope = Math.tan(angle * Math.PI / 180);
  const movingY = three ? 2 : 1;
  const areaSlope = (movingY * width + depth) * slope;
  const areaCurve = movingY * slope ** 2;
  const offset = z => z - neutral;
  const integral = degree => (offset(height) ** (degree + 1) - offset(0) ** (degree + 1)) / (degree + 1);
  const volume = width * depth * integral(0) - areaSlope * integral(1) + areaCurve * integral(2);
  const centreOffset = (width * depth * integral(1) - areaSlope * integral(2) + areaCurve * integral(3)) / volume;
  const centroid = [(width - slope * centreOffset) / 2, (depth + (three ? 0 : slope * centreOffset)) / 2, neutral + centreOffset];
  assert.ok(samePoint(read.centroid, centroid), JSON.stringify({ label, actual: read.centroid, centroid }));
  assert.ok(near(read.volume, volume), JSON.stringify({ label, actual: read.volume, volume }));
  const current = (await f.bodies()).bodies;
  assert.equal(current.length, 1);
  assert.ok(near(current[0].volume, volume), JSON.stringify({ label, studioVolume: current[0].volume, volume }));
  for (const z of [0, height]) for (const x of [0, width - offset(z) * slope]) for (const y of [offset(z) * slope, depth - (three ? offset(z) * slope : 0)]) {
    assert.ok(read.points.some(point => samePoint(point, [x, y, z])), JSON.stringify({ label, missing: [x, y, z], points: read.points }));
  }
  if (source) {
    assert.deepEqual(Object.keys(read.faces).sort(), Object.keys(source.faces).sort());
    assert.deepEqual(read.edges.map(edge => edge.name).sort(), source.edges.map(edge => edge.name).sort());
    const nameAt = normal => Object.keys(source.normals).find(name => samePoint(source.normals[name], normal));
    const xHigh = nameAt([1, 0, 0]), yLow = nameAt([0, -1, 0]), yHigh = nameAt([0, 1, 0]);
    const picked = [xHigh, yLow, ...(three ? [yHigh] : [])];
    assert.deepEqual(new Set(doc.nodes.at(-1).faces), new Set(picked));
    const scale = Math.hypot(1, slope);
    const supports = [
      [xHigh, [1 / scale, 0, slope / scale]],
      [yLow, [0, -1 / scale, slope / scale]],
      [yHigh, three ? [0, 1 / scale, slope / scale] : [0, 1, 0]],
      [nameAt([-1, 0, 0]), [-1, 0, 0]],
      [nameAt([0, 0, -1]), [0, 0, -1]],
      [nameAt([0, 0, 1]), [0, 0, 1]],
    ];
    for (const [name, normal] of supports) assert.ok(samePoint(read.normals[name], normal));
    const shared = [];
    for (const [yFace, yAt] of [[yLow, z => offset(z) * slope], ...(three ? [[yHigh, z => depth - offset(z) * slope]] : [])]) {
      const along = read.faces[xHigh].filter(id => read.faces[yFace].includes(id));
      assert.equal(along.length, 1);
      const edge = read.edges.find(edge => edge.id === along[0]);
      assert.equal(edge.degree, 1);
      assert.equal(edge.poles.length, 2);
      for (const z of [0, height]) {
        const point = [width - offset(z) * slope, yAt(z), z];
        assert.ok(edge.endpoints.some(end => samePoint(end, point)), JSON.stringify({ label, edge, point }));
        assert.ok(edge.poles.some(pole => samePoint(pole, point)));
      }
      if (interior) {
        const start = edge.endpoints.find(point => near(point[2], 0));
        const end = edge.endpoints.find(point => near(point[2], height));
        const cross = start.map((value, axis) => value + (end[axis] - value) * neutral / height);
        assert.ok(samePoint(cross, [width, yAt(neutral), neutral]));
      }
      shared.push(edge.endpoints);
    }
    assert.equal(read.faces[yLow].some(id => read.faces[yHigh].includes(id)), false);
    f.report.observations.push({ label, angle, volume: read.volume, expectedVolume: volume, centroid, shared,
      studioVolume: current[0].volume, maximumEdgeSurfaceGap: read.check.maximumEdgeSurfaceGap });
  }
  return read;
}

async function edit(index) {
  await f.openFeatureEditor(index, 'selected-face Draft');
  await button('Edit draft', f.editor()).click();
  const panel = hud('Edit Draft');
  await status(panel, 'preview');
  return panel;
}

await f.run(async () => {
  await f.newPage();
  f.phase = 'Create an exact 40 × 30 × 40 Box in Studio';
  await button('New part').click();
  await f.page.locator('canvas.vp-canvas').click({ position: { x: 300, y: 220 } });
  await f.page.keyboard.press('b');
  const box = hud('Box');
  for (const [name, value] of [['Width X', width], ['Depth Y', depth], ['Height Z', height], ['At X', 0], ['At Y', 0], ['At Z', 0]])
    await box.getByLabel(name, { exact: true }).fill(String(value));
  const empty = await f.doc();
  await status(box, 'preview');
  await button('Apply', box).click();
  await f.changed(empty);
  const source = await f.doc();
  const original = await inspect('rectangular-stock', source, 0);
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  const filter = button('Selection filter');
  for (let i = 0; i < 5 && !(await filter.innerText()).includes('Faces'); i++) await filter.click();
  assert.match(await filter.innerText(), /Faces/);

  f.phase = 'Pick the box sides and start Draft';
  await pick('Front', [width * 0.4, 0, height * 0.4], 1);
  await pick('Right', [width, depth * 0.4, height * 0.4], 2);
  if (three) await pick('Back', [width * 0.5, depth, height * 0.45], 3);
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.command('Draft');
  const creation = hud('Draft'), angle = creation.getByLabel('Angle', { exact: true });
  assert.equal(await creation.getByLabel('Pull', { exact: true }).inputValue(), 'z');
  assert.equal(await creation.getByLabel('Neutral plane', { exact: true }).inputValue(), 'auto');
  if (interior) {
    await creation.getByLabel('Neutral plane', { exact: true }).selectOption('fixed');
    await creation.getByLabel('Neutral coordinate', { exact: true }).fill(String(neutral));
  }
  if (baseline) {
    assert.ok(three || interior);
    await angle.fill('10');
    await status(creation, 'refused');
    await creation.getByText('Kernel detail', { exact: true }).click();
    assert.match(await creation.innerText(), interior ? /neutral plane.*at or below the face/i : /meet along an edge/);
    await f.same(source);
    await f.snapshot(interior ? 'interior-neutral-refused-on-baseline' : 'three-sides-refused-on-baseline');
    return;
  }
  for (const raw of ['0', '45', '-45']) {
    await angle.fill(raw); await status(creation, 'refused');
    assert.equal(await button('Apply', creation).isEnabled(), false);
    assert.match(await creation.innerText(), /non.?zero|excluding 0/i); assert.match(await creation.innerText(), /45/);
    await f.same(source);
  }
  await f.snapshot('creation-angle-refused');
  await angle.fill('10');
  await status(creation, 'preview');
  await f.same(source);
  await f.snapshot('adjacent-draft-preview');
  await button('Apply', creation).click();
  await f.changed(source);
  const inward = (await f.snapshot('adjacent-draft-inward')).doc;
  const index = inward.nodes.length - 1, node = inward.nodes[index];
  assert.equal(index, source.nodes.length);
  assert.deepEqual(inward.nodes.slice(0, index), source.nodes);
  assert.equal(node.kind, 'draft');
  assert.equal(node.angle, 10);
  if (interior) assert.equal(node.neutral, neutral);
  assert.equal(new Set(node.faces).size, three ? 3 : 2);
  await inspect('inward-native', inward, 10, original);

  await f.openFeatureEditor(index, 'numeric Draft angle');
  for (const raw of ['0', '45', '-45']) {
    await f.editor().getByLabel('Angle', { exact: true }).fill(raw);
    await button('Apply', f.editor()).click();
    await f.editor().getByText(/non.?zero/i).waitFor();
    assert.match(await f.editor().innerText(), /45/);
    assert.equal(await f.editor().getByLabel('Angle', { exact: true }).inputValue(), raw);
    await f.same(inward);
  }
  await f.snapshot('numeric-history-angle-refused');
  await button('Reset', f.editor()).click();

  f.phase = 'History refuses a collapsing taper and applies an outward taper';
  const history = await edit(index);
  const editAngle = history.getByLabel('Angle', { exact: true });
  for (const raw of ['0', '45', '-45']) {
    await editAngle.fill(raw); await status(history, 'refused');
    assert.equal(await button('Apply', history).isEnabled(), false);
    assert.match(await history.innerText(), /non.?zero|excluding 0/i); assert.match(await history.innerText(), /45/);
    await f.same(inward);
  }
  await f.snapshot('edit-draft-angle-refused');
  await editAngle.fill('40');
  await status(history, 'refused');
  assert.equal(await button('Apply', history).isEnabled(), false);
  await history.getByText('Kernel detail', { exact: true }).click();
  assert.match(await history.innerText(), /closes a box wall|collapse|vanish|topology/i);
  await f.same(inward);
  await f.snapshot('adjacent-draft-collapse-refused');
  await editAngle.fill('-12');
  await status(history, 'preview');
  await f.same(inward);
  await button('Apply', history).click();
  await f.changed(inward);
  const outward = (await f.snapshot('adjacent-draft-outward')).doc;
  assert.deepEqual(outward.nodes[index], { ...node, angle: -12 });
  await inspect('outward-native', outward, -12, original);
  await f.undo();
  await f.same(inward);
  await f.redo();
  await f.same(outward);

  const file = await f.save('adjacent-planar-draft');
  const reopened = await f.freshOpen(file.file, outward, 'adjacent-draft-reopened');
  await inspect('reopened-native', reopened.doc, -12, original);
  const replay = await edit(index);
  assert.equal(await replay.getByLabel('Angle', { exact: true }).inputValue(), '-12');
  if (interior) assert.equal(await replay.getByLabel('Neutral coordinate', { exact: true }).inputValue(), String(neutral));
  await button('Cancel', replay).click();
  await f.same(outward);
});
