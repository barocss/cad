import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';

const baseline = process.argv.includes('--baseline');
const pins = ['packages/barocss-cad-model/src/app/nativeOffsetFace.ts', 'packages/barocss-cad-model/src/app/offsetFaceEdit.ts',
  'packages/barocss-cad-model/src/engine/doc.ts',
  'packages/barocss-cad/src/features/prism-wall-offset.ts', 'packages/barocss-cad/src/part/part-model.ts'];
const f = await createFlow({
  name: 'offset-polygon-wall', output: process.argv[2], envFrozen: 'OFFSET_POLYGON_WALL_FROZEN',
  qualification: 'Signed Offset face on an original triangular and octagonal extrusion wall.',
  limits: ['Original straight convex polygon profiles, upright uncut extrusion, signed distance mode.'],
  initialFiles: pins, requiredFrozen: pins,
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { partSnapshot } from '@barocss/cad-model/engine/part';
import { checkBrep, faceGeometry, massPropertiesOf } from '@barocss/cad';
const { outputs } = partSnapshot(JSON.parse(readFileSync(process.argv[2], 'utf8')));
const body = outputs[0], { brep } = body, report = checkBrep(brep, { strict: true });
console.log(JSON.stringify({ count: outputs.length, volume: massPropertiesOf(body).volume, report,
  closed: brep.shells.every(shell => shell.closed), vertices: brep.vertices,
  faces: brep.faces.map(face => [face.name, faceGeometry(face)]),
  ids: [brep.faces.map(({ surface, ...face }) => [face, surface.id]), brep.edges.map(edge => [edge.id, edge.name, edge.vertices, edge.curve.id]),
    brep.coedges.map(({ pcurve, ...use }) => [use, pcurve?.id]), brep.loops, brep.shells, brep.bodies] }));
`,
});
const examples = [
  { id: 'triangle', x: 12, footprint: [[0, 0], [24, 0], [6, 16]], refused: [-16],
    corners: y => [[3 * y / 8, y], [24 - 9 * y / 8, y]], volume: mm => 7.5 * (16 + mm) ** 2 },
  { id: 'octagon', x: 10, footprint: [[4, 0], [16, 0], [20, 4], [20, 12], [16, 16], [4, 16], [0, 12], [0, 4]],
    refused: [-4, 6], corners: y => [[4 - y, y], [16 + y, y]], volume: mm => 2880 + 120 * mm - 10 * mm ** 2 },
];
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const hud = (name = 'Offset face') => f.page.getByRole('dialog', { name, exact: true });
const status = (scope, value) => scope.locator('.status').getByText(value, { exact: true }).waitFor();
const offset = scope => scope.getByLabel('Offset', { exact: true });
const near = (a, b) => Math.abs(a - b) <= 1e-8;
const same = (a, b) => a.every((value, i) => near(value, b[i]));
const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);

function source(footprint) {
  return { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 2,
    nodes: [{ kind: 'sketch', id: 'n0', profile: 'polygon', points: footprint }, { kind: 'extrude', id: 'n1', sketch: 0, height: 10 }],
    outputs: { b1: { node: 1, side: 'solid' } } };
}

async function prove(label, doc, from, example, distance) {
  const actual = await f.inspect(label, doc), count = example.footprint.length;
  assert.ok(actual.report.valid && actual.closed);
  assert.deepEqual([actual.count, actual.report.counts], [1, {
    bodies: 1, shells: 1, faces: count + 2, loops: count + 2, coedges: 6 * count, edges: 3 * count, vertices: 2 * count,
  }]);
  assert.deepEqual(actual.ids, from.ids);
  const wanted = [...example.corners(-distance), ...example.footprint.slice(2)];
  for (const z of [0, 10]) for (const [x, y] of wanted) {
    assert.equal(actual.vertices.filter(vertex => same(vertex.point, [x, y, z])).length, 1);
  }
  const faces = new Map(actual.faces);
  for (const [name, before] of from.faces) {
    const after = faces.get(name);
    assert.ok(after.kind === 'plane' && same(after.n, before.n));
    assert.ok(near(dot(after.n, after.o), dot(before.n, before.o) + (name === 'n1.side0' ? distance : 0)));
  }
  const volume = example.volume(distance);
  assert.ok(near(actual.volume, volume) && near((await f.bodies()).bodies[0].volume, volume));
  const node = doc.nodes[2];
  assert.deepEqual([node.kind, node.faces, node.distance], ['offset-face', ['n1.side0'], distance]);
  f.report.observations.push({ label, profile: example.id, distance, volume: actual.volume });
}

await f.run(async () => {
  for (const example of examples) {
    const stock = source(example.footprint), file = join(f.output, example.id + '-stock.bcad');
    await writeFile(file, JSON.stringify(stock));
    const original = await f.inspect(example.id + '-stock', stock);
    await f.freshOpen(file, stock, example.id + '-original');
    await button('Front', f.page.locator('.views')).click();
    if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
    await f.page.getByTitle('Frame all (F)', { exact: true }).click();
    const pixel = await f.page.evaluate(x => window.__studioScreenOf([x, 0, 5]), example.x);
    await f.page.mouse.click(...pixel);
    await f.page.waitForFunction(() => window.__studioSelection.selection.faces.length === 1);
    await button('Iso', f.page.locator('.views')).click();
    await f.page.evaluate(() => document.activeElement?.blur());
    await f.command('Offset face');
    const dialog = hud();
    await offset(dialog).fill('2');
    if (baseline) {
      await status(dialog, 'refused');
      assert.ok(await button('Apply', dialog).isDisabled());
      await f.same(stock);
      await f.snapshot(example.id + '-baseline-refused');
      continue;
    }
    await status(dialog, 'preview');
    await f.same(stock);
    await f.snapshot(example.id + '-outward-preview');
    assert.equal(await dialog.getByText('To plane', { exact: true }).count(), 0);
    await button('Cancel', dialog).click();
    await f.same(stock);
    await f.command('Offset face');
    await offset(dialog).fill('2');
    await status(dialog, 'preview');
    await button('Apply', dialog).click();
    await f.changed(stock);
    const outward = await f.doc();
    await prove(example.id + '-outward-native', outward, original, example, 2);

    await f.openFeatureEditor(2, example.id + ' original side Offset');
    await button('Edit offset', f.editor()).click();
    const history = hud('Edit Offset face');
    assert.equal(await history.getByText('To plane', { exact: true }).count(), 0);
    for (const refused of example.refused) {
      await offset(history).fill(String(refused));
      await status(history, 'refused');
      assert.ok(await button('Apply', history).isDisabled());
      await f.same(outward);
      await f.snapshot(example.id + '-refused-' + refused);
    }
    await offset(history).fill('-2');
    await status(history, 'preview');
    await button('Apply', history).click();
    await f.changed(outward);
    const inward = await f.doc();
    await prove(example.id + '-inward-native', inward, original, example, -2);
    await f.undo();
    await f.same(outward);
    await f.redo();
    await f.same(inward);

    const saved = await f.save(example.id + '-wall-offset');
    await f.freshOpen(saved.file, saved.doc, example.id + '-reopened');
    await prove(example.id + '-reopened-native', saved.doc, original, example, -2);
    await button('Iso', f.page.locator('.views')).click();
    await f.page.getByTitle('Frame all (F)', { exact: true }).click();
    await f.openFeatureEditor(2, example.id + ' reopened Offset');
    await button('Edit offset', f.editor()).click();
    assert.equal(await offset(hud('Edit Offset face')).inputValue(), '-2');
    await f.snapshot(example.id + '-reopened-history');
  }
});
