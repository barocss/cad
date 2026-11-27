import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { openModelGroup } from './model-rail-helper.mjs';

const baseline = process.argv.includes('--baseline');
const axialX = process.argv.includes('axial-x');
const placedZ = process.argv.includes('placed-z');
const historyBaseline = process.argv.includes('--history-neutral-baseline');
const historyNeutral = historyBaseline || process.argv.includes('--history-neutral');
const plane = axialX
  ? { origin: [10, 20, 30], normal: [1, 0, 0], xAxis: [0, 1, 0] }
  : placedZ ? { origin: [10, 20, 30], normal: [0, 0, 1], xAxis: [1, 0, 0] } : undefined;
const worldPoint = ([x, y, z]) => axialX ? [10 + z, 20 + x, 30 + y] : placedZ ? [10 + x, 20 + y, 30 + z] : [x, y, z];
const cylinderPoint = ([x, y, z]) => axialX ? [y - 20, z - 30, x - 10] : placedZ ? [x - 10, y - 20, z - 30] : [x, y, z];
const pins = [
  'packages/barocss-cad-model/src/app/commands.ts',
  'packages/barocss-cad-model/src/app/draftInputs.ts',
  'packages/barocss-cad-model/src/app/draftEdit.ts',
  'packages/barocss-cad/src/part/part-face-finish.ts',
  'packages/barocss-cad/src/features/bored-cap-offset.ts',
];
const f = await createFlow({
  name: 'cylindrical-wall-draft', output: process.argv[2], envFrozen: 'CYLINDRICAL_WALL_DRAFT_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Pick the original cylindrical wall in Studio and use a fixed neutral coordinate.',
  limits: [axialX ? 'One original YZ circular extrusion without a bore, +X pull and fixed neutral coordinate.'
    : `One original ${placedZ ? 'translated' : 'default'} XY circular extrusion without a bore, +Z pull and fixed neutral coordinate.`],
  inspectorSource: `
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { checkBrep, evaluateSurface, faceGeometry, massPropertiesOf, surfaceDomain } from '@barocss/cad';
import { partSnapshot } from '@barocss/cad-model/engine/part';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const { outputs } = partSnapshot(doc), output = outputs[0], { brep } = output;
const supports = brep.faces.map(face => {
  const kind = faceGeometry(face).kind, { u, v } = surfaceDomain(face.surface);
  return { name: face.name, kind, samples: [0.15, 0.5, 0.85].flatMap(a => [0, 0.2, 0.5, 0.8, 1].map(b =>
    evaluateSurface(face.surface, u[0] + a * (u[1] - u[0]), v[0] + b * (v[1] - v[0])))) };
});
const incidence = { bodies: brep.bodies, shells: brep.shells, loops: brep.loops, coedges: brep.coedges,
  faces: brep.faces.map(({ surface, ...face }) => face), edges: brep.edges.map(({ curve, ...edge }) => edge),
  vertices: brep.vertices.map(vertex => vertex.id) };
console.log(JSON.stringify({ outputs: outputs.length, topology: checkBrep(brep, { strict: true }), supports,
  incidence, points: brep.vertices.map(vertex => vertex.point), mass: massPropertiesOf(output),
  digest: createHash('sha256').update(JSON.stringify(brep)).digest('hex') }));
`,
});
const stock = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 2,
  nodes: [
    { id: 'n0', kind: 'sketch', profile: 'circle', center: [12, -7], radius: 10,
      ...(plane ? { plane } : {}) },
    { id: 'n1', kind: 'extrude', sketch: 0, from: 3, height: 20 },
  ],
  outputs: { b1: { node: 1, side: 'solid' } },
};
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const hud = () => f.page.getByRole('dialog', { name: 'Draft', exact: true });
const historyHud = () => f.page.getByRole('dialog', { name: 'Edit Draft', exact: true });
const field = (name, scope = hud()) => scope.getByLabel(name, { exact: true });
const near = (a, b, tolerance = 1e-8) => assert.ok(Number.isFinite(a) && Math.abs(a - b) < tolerance, `${a} vs ${b}`);
const originAt = axialX ? 10 : placedZ ? 30 : 0;
const neutral = originAt + 11, capStart = originAt + 3;

async function verify(label, doc, angle, original) {
  const n = await f.inspect(label, doc), slope = Math.tan(angle * Math.PI / 180);
  const radius = z => 10 - slope * (z - 11), bottom = radius(3), top = radius(23);
  const sum = bottom ** 2 + bottom * top + top ** 2;
  const volume = Math.PI * 20 / 3 * sum;
  const middle = 3 + 20 * (bottom ** 2 + 2 * bottom * top + 3 * top ** 2) / (4 * sum);
  const centroid = worldPoint([12, -7, middle]);
  assert.equal(n.outputs, 1);
  assert.ok(n.topology.valid, n.topology.issues.join('\n'));
  assert.deepEqual(n.topology.counts, { bodies: 1, shells: 1, faces: 4, loops: 4, coedges: 12, edges: 6, vertices: 4 });
  assert.deepEqual(n.incidence, original.incidence);
  const circular = n.supports.filter(face => face.kind !== 'plane');
  assert.equal(circular.length, 2);
  for (const { samples } of circular) for (const [x, y, z] of samples.map(cylinderPoint)) near(Math.hypot(x - 12, y + 7), radius(z));
  for (const [x, y, z] of n.points.map(cylinderPoint)) {
    assert.ok(z === 3 || z === 23);
    near(Math.hypot(x - 12, y + 7), radius(z));
  }
  near(n.mass.volume, volume, 1e-7);
  n.mass.centroid.forEach((value, axis) => near(value, centroid[axis], 1e-7));
  const worker = (await f.bodies()).bodies;
  assert.equal(worker.length, 1);
  near(worker[0].volume, volume, 1e-7);
  f.report.observations.push({ label, angle, neutral, volume, nativeVolume: n.mass.volume, centroid, ends: [bottom, top], digest: n.digest });
  return n;
}

async function switchHistoryNeutral(draft, original) {
  await draft.click();
  assert.equal(await field('Neutral plane').inputValue(), 'auto');
  await field('Angle').fill('10');
  await hud().locator('.status').getByText('preview', { exact: true }).waitFor();
  await button('Apply', hud()).click();
  await f.changed(stock);
  const automatic = await f.doc();
  assert.equal(automatic.nodes[2].neutral, undefined);
  async function openHistory() {
    await f.openFeatureEditor(2, 'cylinder Draft neutral');
    await button('Edit draft', f.editor()).click();
    return historyHud();
  }
  const edit = await openHistory();
  await field('Neutral plane', edit).selectOption('fixed');
  assert.equal(await field('Neutral coordinate', edit).inputValue(), historyBaseline ? '' : String(capStart));
  await f.same(automatic);
  await f.snapshot('history-fixed-coordinate-default');
  if (historyBaseline) return;

  await field('Neutral coordinate', edit).fill(String(neutral));
  await edit.locator('.status').getByText('preview', { exact: true }).waitFor();
  await button('Cancel', edit).click();
  await f.same(automatic);
  await openHistory();
  await field('Neutral plane', edit).selectOption('fixed');
  await field('Neutral coordinate', edit).fill(String(neutral));
  await edit.locator('.status').getByText('preview', { exact: true }).waitFor();
  await button('Apply', edit).click();
  await f.changed(automatic);
  const edited = await f.doc();
  assert.deepEqual(edited.nodes[2], { ...automatic.nodes[2], neutral });
  const accepted = await verify('history-neutral-native', edited, 10, original);
  await f.undo(); await f.same(automatic);
  await f.redo(); await f.same(edited);
  const saved = await f.save('cylinder-draft-history-neutral');
  const opened = (await f.freshOpen(saved.file, edited, 'history-neutral-reopened')).doc;
  assert.equal((await verify('history-neutral-reopened-native', opened, 10, original)).digest, accepted.digest);
  const reopenedEdit = await openHistory();
  assert.equal(await field('Neutral plane', reopenedEdit).inputValue(), 'fixed');
  assert.equal(await field('Neutral coordinate', reopenedEdit).inputValue(), String(neutral));
  await button('Cancel', reopenedEdit).click();
  await f.same(edited);
}

await f.run(async () => {
  const seed = join(f.output, 'cylindrical-draft-stock.bcad');
  await writeFile(seed, JSON.stringify(stock));
  await f.freshOpen(seed, stock, 'original-cylinder');
  f.phase = 'Pick the native cylinder wall and inspect Draft availability';
  const filter = button('Selection filter');
  for (let attempt = 0; attempt < 6 && !(await filter.innerText()).includes('Faces'); attempt++) await filter.click();
  assert.match(await filter.innerText(), /Faces/);
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await button('Front', f.page.locator('.views')).click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await f.page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const pixel = await f.page.evaluate(point => window.__studioScreenOf(point), worldPoint([12, -17, 13]));
  await f.page.mouse.click(...pixel);
  await f.page.waitForFunction(() => window.__studioSelection.selection.faces.length === 1);
  const modify = await openModelGroup(f.page, 'Modify');
  const draft = button('Draft', modify);
  await f.same(stock);
  if (baseline) {
    assert.match(await draft.getAttribute('data-tip-off'), /flat side faces/);
    await draft.click();
    await f.page.getByText(/^Draft can.t run here$/).waitFor();
    assert.equal(await f.page.getByRole('dialog', { name: 'Draft', exact: true }).count(), 0);
    await f.snapshot('original-cylinder-draft-unavailable');
    return;
  }
  assert.equal(await draft.getAttribute('data-tip-off'), '');
  const original = await f.inspect('original-native', stock);
  if (historyNeutral) {
    await switchHistoryNeutral(draft, original);
    return;
  }
  const openPreview = async () => {
    await draft.click();
    assert.equal(await field('Pull').inputValue(), axialX ? 'x' : 'z');
    await field('Neutral plane').selectOption('fixed');
    assert.equal(await field('Neutral coordinate').inputValue(), String(capStart));
    await field('Neutral coordinate').fill(String(neutral));
    await field('Angle').fill('10');
    await hud().locator('.status').getByText('preview', { exact: true }).waitFor();
  };
  await openPreview();
  const undoWasEnabled = await button('Undo').isEnabled();
  await f.same(stock);
  await f.snapshot('fixed-neutral-preview');
  await button('Cancel', hud()).click();
  await hud().waitFor({ state: 'hidden' });
  await f.same(stock);
  assert.equal(await button('Undo').isEnabled(), undoWasEnabled);
  await openPreview();
  await button('Apply', hud()).click();
  await f.changed(stock);
  const applied = await f.doc();
  assert.deepEqual(applied.nodes.slice(0, 2), stock.nodes);
  assert.deepEqual(applied.nodes[2], {
    id: 'n2', kind: 'draft', parent: { node: 1, side: 'solid' }, faces: ['n1.side0#1', 'n1.side0#2'], angle: 10, neutral,
    ...(axialX ? { pull: 'x' } : {}),
  });
  await verify('inward-native', applied, 10, original);

  await f.openFeatureEditor(2, 'fixed-neutral cylinder Draft');
  const editor = f.editor();
  await field('Angle', editor).fill('44');
  await button('Apply', editor).click();
  await editor.getByText('Draft reaches the cylinder axis', { exact: true }).waitFor();
  await f.same(applied);
  await f.snapshot('cylinder-collapse-refused');
  await button('Reset', editor).click();
  assert.equal(await field('Angle', editor).inputValue(), '10');
  await field('Angle', editor).fill('-10');
  const edited = (await f.applyEditor(applied, 'cylinder-draft-edited')).doc;
  assert.deepEqual(edited.nodes[2], { ...applied.nodes[2], angle: -10 });
  const accepted = await verify('outward-native', edited, -10, original);
  await f.undo();
  await f.same(applied);
  await f.redo();
  await f.same(edited);
  const saved = await f.save('fixed-neutral-cylinder-draft');
  const reopened = (await f.freshOpen(saved.file, edited, 'cylinder-draft-reopened')).doc;
  assert.equal((await verify('reopened-native', reopened, -10, original)).digest, accepted.digest);
  await f.openFeatureEditor(2, 'reopened fixed-neutral cylinder Draft');
  assert.equal(await field('Neutral coordinate', f.editor()).inputValue(), String(neutral));
  assert.equal(await field('Angle', f.editor()).inputValue(), '-10');
  await button('Edit draft', f.editor()).click();
  const fullEditor = historyHud();
  assert.equal(await field('Pull', fullEditor).inputValue(), axialX ? 'x' : 'z');
  await button('Cancel', fullEditor).click();
  await f.same(edited);
});
