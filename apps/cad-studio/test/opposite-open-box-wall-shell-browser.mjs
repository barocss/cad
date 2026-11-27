import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { clickModelCommand } from './model-rail-helper.mjs';

const baseline = process.argv.includes('--baseline');
const pins = ['packages/barocss-cad-model/src/app/boxShellSelection.ts', 'packages/barocss-cad-model/src/engine/shellWalls.ts',
  'packages/barocss-cad/src/part/part-box-shell.ts', 'packages/barocss-cad/src/part/part-shell.ts'];
const f = await createFlow({
  name: 'opposite-open-box-wall-shell', output: process.argv[2], envFrozen: 'OPPOSITE_OPEN_BOX_WALL_SHELL_FROZEN',
  qualification: 'Original top and bottom openings with four independent side walls.',
  limits: ['One zero-draft 40×30×20 mm rectangular extrusion.'], initialFiles: pins, requiredFrozen: pins,
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
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const hud = () => f.page.getByRole('dialog', { name: 'Shell', exact: true });
const frame = () => f.page.getByTitle('Frame all (F)', { exact: true }).click();
const near = (a, b) => assert.ok(Number.isFinite(a) && Math.abs(a - b) < 1e-7, `${a} versus ${b}`);
const coordinates = (a, b) => a.forEach((value, i) => near(value, b[i]));

async function pick(point, shifted = false) {
  const xy = await f.page.evaluate(p => window.__studioScreenOf(p), point);
  if (shifted) await f.page.keyboard.down('Shift');
  try { await f.page.mouse.click(...xy); }
  finally { if (shifted) await f.page.keyboard.up('Shift'); }
}

async function prove(label, doc, thickness, uniform = false) {
  const native = await f.inspect(label, doc);
  const left = uniform ? 2 : 3, front = 2, back = uniform ? 2 : 4;
  const cavity = (40 - left - thickness) * (30 - front - back) * 20;
  const volume = 24000 - cavity, centre = [(left + 40 - thickness) / 2, (front + 30 - back) / 2, 10];
  const centroid = [20, 15, 10].map((value, i) => (24000 * value - cavity * centre[i]) / volume);
  assert.deepEqual([native.report.valid, native.count, native.closed, native.report.topology[0].genus], [true, 1, true, 1]);
  assert.deepEqual(native.report.counts, { bodies: 1, shells: 1, faces: 10, loops: 12, coedges: 48, edges: 24, vertices: 16 });
  assert.equal(native.pcurves, 48);
  const body = (await f.bodies()).bodies[0];
  for (const result of [native, body]) {
    near(result.volume, volume);
    coordinates(result.centroid, centroid);
  }
  for (const [name, station, sign] of [['n1.top', 20, 1], ['n1.bottom', 0, -1]]) {
    const face = native.faces.find(face => face.name === name);
    assert.ok(face && face.geometry.kind === 'plane');
    assert.deepEqual(face.loops, [4, 4]);
    near(face.geometry.o[2], station);
    coordinates(face.geometry.n, [0, 0, sign]);
  }
  if (!uniform) {
    const node = doc.nodes[2];
    assert.deepEqual([node.kind, node.opening, node.secondOpening, node.walls],
      ['shell-walls', 'n1.top', 'n1.bottom', { 'n1.side0': front, 'n1.side1': thickness, 'n1.side2': back, 'n1.side3': left }]);
    const inner = [['n2.in.n1.side0', 1, front, [0, 1, 0]], ['n2.in.n1.side1', 0, 40 - thickness, [-1, 0, 0]],
      ['n2.in.n1.side2', 1, 30 - back, [0, -1, 0]], ['n2.in.n1.side3', 0, left, [1, 0, 0]]];
    for (const [name, axis, station, normal] of inner) {
      const face = native.faces.find(face => face.name === name);
      assert.ok(face && face.geometry.kind === 'plane');
      near(face.geometry.o[axis], station);
      coordinates(face.geometry.n, normal);
    }
  }
  f.report.observations.push({ label, thickness, volume, centroid, genus: native.report.topology[0].genus, pcurves: native.pcurves });
}

await f.run(async () => {
  const file = join(f.output, 'opposite-open-stock.bcad');
  await writeFile(file, JSON.stringify(stock));
  await f.freshOpen(file, stock, 'stock');
  const filter = button('Selection filter');
  for (let attempt = 0; attempt < 6 && !(await filter.innerText()).includes('Faces'); attempt++) await filter.click();
  assert.match(await filter.innerText(), /Faces/);
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await button('Top', f.page.locator('.views')).click();
  await f.page.waitForFunction(() => window.__studioCamera?.().pitch > 1.3);
  await frame();
  await pick([20, 12, 20]);
  await f.page.waitForFunction(() => window.__studioSelection.selection.faces.length === 1);
  await button('View cube directions').click();
  await f.page.getByRole('menuitem', { name: 'Bottom', exact: true }).click();
  await f.page.waitForFunction(() => window.__studioCamera?.().pitch < -1.3);
  await frame();
  await pick([20, 12, 0], true);
  await f.page.waitForFunction(() => window.__studioSelection.selection.faces.length === 2);
  await button('Iso', f.page.locator('.views')).click();
  await clickModelCommand(f.page, 'Modify', 'Shell');
  const mode = hud().getByLabel('Wall thickness', { exact: true });
  if (baseline) {
    assert.equal(await mode.count(), 0);
  } else {
    await mode.selectOption('per-face');
    for (const [name, value] of [['Left wall', 3], ['Right wall', 5], ['Back wall', 4], ['Front wall', 2]]) {
      await hud().getByLabel(name, { exact: true }).fill(String(value));
    }
    assert.equal(await hud().getByLabel('Top wall', { exact: true }).count(), 0);
    assert.equal(await hud().getByLabel('Bottom wall', { exact: true }).count(), 0);
  }
  await hud().locator('.status').getByText('preview', { exact: true }).waitFor();
  await f.snapshot(baseline ? 'baseline-opposite-uniform-only' : 'opposite-per-face-preview');
  await button('Apply', hud()).click();
  await f.changed(stock);
  const created = await f.doc();
  await prove('created-opposite-shell', created, baseline ? 2 : 5, baseline);
  if (baseline) {
    assert.deepEqual(created.nodes[2].open, ['n1.top', 'n1.bottom']);
    return;
  }

  await f.openFeatureEditor(2, 'collapse the through cavity');
  await f.editor().getByLabel('Left wall', { exact: true }).fill('36');
  await button('Apply', f.editor()).click();
  await f.editor().locator('.hud-error').waitFor();
  await f.same(created);
  await f.snapshot('opposite-cavity-refused');
  await f.closeEditor();

  await f.openFeatureEditor(2, 'edit the right wall');
  await f.editor().getByLabel('Right wall', { exact: true }).fill('7');
  await f.applyEditor(created, 'opposite-right-wall-edit');
  const edited = await f.doc();
  await prove('edited-opposite-shell', edited, 7);
  await f.undo();
  await f.same(created);
  await f.redo();
  await f.same(edited);
  const saved = await f.save('opposite-wall-shell');
  await f.freshOpen(saved.file, saved.doc, 'opposite-shell-reopened');
  await prove('reopened-opposite-shell', saved.doc, 7);
  await button('Iso', f.page.locator('.views')).click();
  await frame();
  await f.openFeatureEditor(2, 'reopened four side walls');
  assert.equal(await f.editor().getByLabel('Right wall', { exact: true }).inputValue(), '7');
  await f.snapshot('opposite-shell-reopened-history');
  await f.closeEditor();
  await button('View cube directions').click();
  await f.page.getByRole('menuitem', { name: 'Bottom', exact: true }).click();
  await f.page.waitForFunction(() => window.__studioCamera?.().pitch < -1.3);
  await frame();
  await f.snapshot('opposite-shell-reopened-bottom');
});
