import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { clickModelCommand } from './model-rail-helper.mjs';

const baseline = process.argv.includes('--baseline');
const pins = ['packages/barocss-cad-model/src/app/boxShellSelection.ts', 'packages/barocss-cad-model/src/engine/shellWalls.ts',
  'packages/barocss-cad/src/part/part-box-shell.ts', 'packages/barocss-cad/src/part/part-shell.ts'];
const f = await createFlow({
  name: 'box-opening-pairs', output: process.argv[2], envFrozen: 'BOX_OPENING_PAIRS_FROZEN',
  qualification: 'Open two original lateral faces of a rectangular extrusion and set all four kept wall thicknesses.',
  limits: ['One upright zero-draft 40×30×20 mm rectangular extrusion.'], initialFiles: pins, requiredFrozen: pins,
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { partSnapshot } from '@barocss/cad-model/engine/part';
import { checkBrep, faceGeometry, massPropertiesOf } from '@barocss/cad';
const { outputs } = partSnapshot(JSON.parse(readFileSync(process.argv[2], 'utf8')));
const body = outputs[0], { brep } = body, loops = new Map(brep.loops.map(loop => [loop.id, loop]));
const { volume, centroid } = massPropertiesOf(body);
const report = checkBrep(brep, { strict: true });
console.log(JSON.stringify({ count: outputs.length, volume, centroid, report, closed: brep.shells.every(shell => shell.closed),
  pcurves: brep.coedges.filter(use => use.pcurve).length,
  faces: brep.faces.map(face => ({ name: face.name, geometry: faceGeometry(face),
    loops: face.loops.map(id => loops.get(id).coedges.length) })) }));
`,
});
const stock = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 2,
  nodes: [{ kind: 'sketch', id: 'n0', profile: 'rectangle', min: [0, 0], max: [40, 30] },
    { kind: 'extrude', id: 'n1', sketch: 0, height: 20 }],
  outputs: { b1: { node: 1, side: 'solid' } },
};
const right = { view: 'Right', yaw: 0, point: [40, 15, 10], name: 'n1.side1' };
const left = { view: 'Left', yaw: Math.PI, point: [0, 15, 10], name: 'n1.side3' };
const back = { view: 'Back', yaw: Math.PI / 2, point: [20, 30, 10], name: 'n1.side2' };
const examples = [
  { id: 'opposite', openings: [right, left], walls: { 'Bottom wall': 2, 'Front wall': 3, 'Back wall': 4 },
    values: { 'n1.bottom': 2, 'n1.side0': 3, 'n1.side2': 4 }, cavity: top => [[0, 40], [3, 26], [2, 20 - top]], tube: true },
  { id: 'adjacent', openings: [right, back], walls: { 'Bottom wall': 2, 'Front wall': 4, 'Left wall': 3 },
    values: { 'n1.bottom': 2, 'n1.side0': 4, 'n1.side3': 3 }, cavity: top => [[3, 40], [4, 30], [2, 20 - top]], tube: false },
];
const faces = [
  ['n1.bottom', 2, 0, -1], ['n1.top', 2, 20, 1], ['n1.side0', 1, 0, -1],
  ['n1.side1', 0, 40, 1], ['n1.side2', 1, 30, 1], ['n1.side3', 0, 0, -1],
];
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const hud = () => f.page.getByRole('dialog', { name: 'Shell', exact: true });
const frame = () => f.page.getByTitle('Frame all (F)', { exact: true }).click();
const near = (a, b) => assert.ok(Number.isFinite(a) && Math.abs(a - b) < 1e-7, `${a} versus ${b}`);

async function viewOpening(opening) {
  await button('View cube directions').click();
  await f.page.getByRole('menuitem', { name: opening.view, exact: true }).click();
  await f.page.waitForFunction(yaw => {
    const camera = window.__studioCamera?.();
    return camera && Math.abs(camera.pitch) < 0.01 && Math.cos(camera.yaw - yaw) > 0.99999;
  }, opening.yaw);
  await frame();
}

async function pick(opening, selectionCount) {
  await viewOpening(opening);
  const xy = await f.page.evaluate(point => window.__studioScreenOf(point), opening.point);
  if (selectionCount === 2) await f.page.keyboard.down('Shift');
  try { await f.page.mouse.click(...xy); }
  finally { if (selectionCount === 2) await f.page.keyboard.up('Shift'); }
  await f.page.waitForFunction(count => window.__studioSelection.selection.faces.length === count, selectionCount);
}

async function prove(label, doc, example, top) {
  const native = await f.inspect(label, doc), names = example.openings.map(face => face.name);
  const ranges = example.cavity(top);
  const cavity = ranges.reduce((volume, [low, high]) => volume * (high - low), 1);
  const volume = 24000 - cavity;
  const centroid = [20, 15, 10].map((value, i) => (24000 * value - cavity * (ranges[i][0] + ranges[i][1]) / 2) / volume);
  const { tube } = example;
  assert.deepEqual([native.report.valid, native.count, native.closed, native.report.topology[0].genus], [true, 1, true, Number(tube)]);
  assert.deepEqual(native.report.counts, { bodies: 1, shells: 1, faces: tube ? 10 : 12, loops: 12,
    coedges: tube ? 48 : 56, edges: tube ? 24 : 28, vertices: tube ? 16 : 18 });
  assert.equal(native.pcurves, native.report.counts.coedges);
  for (const result of [native, (await f.bodies()).bodies[0]]) {
    near(result.volume, volume);
    result.centroid.forEach((value, i) => near(value, centroid[i]));
  }
  const node = doc.nodes[2];
  assert.equal(node.kind, 'shell-walls');
  assert.deepEqual([node.opening, node.secondOpening].sort(), [...names].sort());
  assert.deepEqual(node.walls, { ...example.values, 'n1.top': top });
  const rimPieces = [];
  for (const [name, axis, station, sign] of faces) {
    const original = native.faces.filter(face => face.name.replace(/#\d+$/, '') === name);
    assert.ok(original.length);
    for (const { geometry } of original) {
      assert.equal(geometry.kind, 'plane');
      near(geometry.o[axis], station);
      geometry.n.forEach((value, i) => near(value, i === axis ? sign : 0));
    }
    const inner = native.faces.find(face => face.name === 'n2.in.' + name);
    if (names.includes(name)) {
      assert.equal(inner, undefined);
      rimPieces.push(...original.map(face => face.loops.length));
    } else {
      assert.ok(inner?.geometry.kind === 'plane');
      near(inner.geometry.o[axis], ranges[axis][sign > 0 ? 1 : 0]);
      inner.geometry.n.forEach((value, i) => near(value, i === axis ? -sign : 0));
    }
  }
  assert.deepEqual(rimPieces, tube ? [2, 2] : [1, 1, 1, 1]);
  f.report.observations.push({ label, volume, centroid, genus: native.report.topology[0].genus, pcurves: native.pcurves });
}

await f.run(async () => {
  const file = join(f.output, 'rectangular-stock.bcad');
  await writeFile(file, JSON.stringify(stock));
  for (const example of examples) {
    f.phase = 'Select the two original ' + example.id + ' sides';
    await f.freshOpen(file, stock, example.id + '-stock');
    const filter = button('Selection filter');
    for (let count = 0; count < 6 && !(await filter.innerText()).includes('Faces'); count++) await filter.click();
    assert.match(await filter.innerText(), /Faces/);
    if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
    await pick(example.openings[0], 1);
    await pick(example.openings[1], 2);
    await button('Iso', f.page.locator('.views')).click();
    await clickModelCommand(f.page, 'Modify', 'Shell');
    const mode = hud().getByLabel('Wall thickness', { exact: true });
    if (baseline) {
      assert.equal(await mode.count(), 0);
      await f.same(stock);
      await f.snapshot(example.id + '-baseline-uniform-only');
      continue;
    }

    f.phase = 'Preview and apply the ' + example.id + ' per face shell';
    const preview = async () => {
      await mode.selectOption('per-face');
      for (const [name, value] of Object.entries({ ...example.walls, 'Top wall': 5 }))
        await hud().getByLabel(name, { exact: true }).fill(String(value));
      for (const { view } of example.openings) assert.equal(await hud().getByLabel(view + ' wall', { exact: true }).count(), 0);
      await hud().locator('.status').getByText('preview', { exact: true }).waitFor();
      await f.same(stock);
    };
    await preview();
    await f.snapshot(example.id + '-preview');
    await button('Cancel', hud()).click();
    await f.same(stock);
    await clickModelCommand(f.page, 'Modify', 'Shell');
    await preview();
    await button('Apply', hud()).click();
    await f.changed(stock);
    const created = await f.doc();
    await prove(example.id + '-applied-native', created, example, 5);

    await f.openFeatureEditor(2, example.id + ' cavity limit');
    await f.editor().getByLabel('Top wall', { exact: true }).fill('18');
    await button('Apply', f.editor()).click();
    await f.editor().locator('.hud-error').waitFor();
    await f.same(created);
    await f.snapshot(example.id + '-collapse-refused');
    await f.closeEditor();

    await f.openFeatureEditor(2, example.id + ' top wall');
    await f.editor().getByLabel('Top wall', { exact: true }).fill('7');
    await f.applyEditor(created, example.id + '-top-edited');
    const edited = await f.doc();
    await prove(example.id + '-edited-native', edited, example, 7);
    await f.undo();
    await f.same(created);
    await f.redo();
    await f.same(edited);

    const saved = await f.save(example.id + '-per-face-shell');
    await f.freshOpen(saved.file, saved.doc, example.id + '-reopened');
    await prove(example.id + '-reopened-native', saved.doc, example, 7);
    await button('Iso', f.page.locator('.views')).click();
    await frame();
    await f.openFeatureEditor(2, example.id + ' reopened walls');
    assert.equal(await f.editor().getByLabel('Top wall', { exact: true }).inputValue(), '7');
    await f.snapshot(example.id + '-reopened-history');
    await f.closeEditor();
    await viewOpening(example.openings[1]);
    await f.snapshot(example.id + '-reopened-second-opening');
  }
});
