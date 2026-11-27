import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';

const baseline = process.argv.includes('--baseline');
const pins = ['packages/barocss-cad-model/src/engine/pivotStock.ts', 'packages/barocss-cad-model/src/app/pivotFaceCommand.ts',
  'packages/barocss-cad/src/features/prism-wall-offset.ts', 'packages/barocss-cad/src/part/part-face-finish.ts'];
const f = await createFlow({
  name: 'rotated-polygon-pivot-face', output: process.argv[2], envFrozen: 'ROTATED_POLYGON_PIVOT_FACE_FROZEN',
  qualification: 'Pivot a straight octagonal wall about its original cap edge after authored Rotate.',
  limits: ['One original convex octagon with an X-axis Rotate between two Moves.'], initialFiles: pins, requiredFrozen: pins,
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep, faceGeometry } from '@barocss/cad';
import { partSnapshot } from '@barocss/cad-model/engine/part';
const { outputs } = partSnapshot(JSON.parse(readFileSync(process.argv[2], 'utf8')));
const brep = outputs[0].brep, vertices = new Map(brep.vertices.map(v => [v.id, v]));
console.log(JSON.stringify({ count: outputs.length, report: checkBrep(brep, { strict: true }),
  closed: brep.shells.length === 1 && brep.shells[0].closed, volume: brepMassProperties(brep, 1).volume,
  faces: brep.faces.map(face => [face.name, faceGeometry(face)]), vertices: brep.vertices,
  caps: brep.faces.filter(face => /\\.(?:top|bottom)$/.test(face.name)).map(face => [face.name, { face,
    uses: brep.coedges.filter(use => face.loops.includes(use.loop)) }]),
  ids: [brep.faces.map(({ surface, sense, ...face }) => [face, surface.id]), brep.loops,
    brep.edges.map(edge => [edge.id, edge.name, edge.vertices, edge.curve.id]),
    brep.coedges.map(({ pcurve, ...use }) => [use, pcurve?.id]), brep.shells, brep.bodies],
  edges: brep.edges.map(edge => ({ edge, ends: edge.vertices.map(id => vertices.get(id)),
    uses: brep.coedges.filter(use => use.edge === edge.id).map(use => [use.id, use.sense, brep.loops.find(loop => loop.id === use.loop).face]) })),
}));
`,
});
const ring = [[4, 0], [16, 0], [20, 4], [20, 12], [16, 16], [4, 16], [0, 12], [0, 4]];
const source = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 5,
  nodes: [
    { kind: 'sketch', id: 'n0', profile: 'polygon', points: ring },
    { kind: 'extrude', id: 'n1', sketch: 0, height: 10 },
    { kind: 'translate', id: 'n2', parent: { node: 1, side: 'solid' }, offset: [20, -10, 8] },
    { kind: 'rotate', id: 'n3', parent: { node: 2, side: 'solid' }, axis: 'x', angle: 31, pivot: [31, -5, 20] },
    { kind: 'translate', id: 'n4', parent: { node: 3, side: 'solid' }, offset: [3, 2, -4] },
  ], outputs: { b4: { node: 4, side: 'solid' } },
};
const feature = source.nodes.length, faceName = 'n1.side0', upper = 'n1.side0|n1.top', lower = 'n1.bottom|n1.side0';
const angle = Math.atan(1 / 5) * 180 / Math.PI;
const history = 'Edit Pivot face';
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const hud = (name = 'Pivot face') => f.page.getByRole('dialog', { name, exact: true });
const degrees = name => hud(name).getByLabel('Angle', { exact: true });
const fixed = () => hud(history).getByLabel('Fixed edge', { exact: true });
const status = (name, value = 'preview') => hud(name).locator('.status').getByText(value, { exact: true }).waitFor();
const rad = degrees => degrees * Math.PI / 180;
const near = (a, b) => Math.abs(a - b) <= 1e-8;
const same = (a, b) => a.every((value, axis) => near(value, b[axis]));
const dot = (a, b) => a.reduce((sum, value, axis) => sum + value * b[axis], 0);

function world([x, y, z], rotation) {
  const c = Math.cos(rad(rotation)), s = Math.sin(rad(rotation));
  return [x + 23, -3 + (y - 5) * c - (z - 12) * s, 16 + (y - 5) * s + (z - 12) * c];
}
async function pick(local, shifted = false) {
  const pixel = await f.page.evaluate(p => window.__studioScreenOf(p), world(local, 31));
  if (shifted) await f.page.keyboard.down('Shift');
  try { await f.page.mouse.click(...pixel); }
  finally { if (shifted) await f.page.keyboard.up('Shift'); }
}

async function prove(label, doc, original, rotation, topFixed) {
  const actual = await f.inspect(label, doc);
  assert.equal(actual.report.valid, true);
  assert.deepEqual([actual.count, actual.closed, actual.report.counts], [1, true,
    { bodies: 1, shells: 1, faces: 10, loops: 10, coedges: 48, edges: 24, vertices: 16 }]);
  assert.deepEqual(actual.ids, original.ids);
  const hingeName = topFixed ? upper : lower;
  const hinge = actual.edges.find(entry => entry.edge.name === hingeName);
  assert.ok(hinge);
  assert.deepEqual(hinge, original.edges.find(entry => entry.edge.name === hingeName));
  const cap = topFixed ? 'n1.top' : 'n1.bottom';
  const originalCap = new Map(original.caps).get(cap);
  assert.equal(originalCap?.uses.length, 8);
  assert.ok(originalCap.uses.every(use => use.pcurve));
  assert.deepEqual(new Map(actual.caps).get(cap), originalCap);
  for (const x of [4, 16]) assert.ok(hinge.ends.some(vertex => same(vertex.point, world([x, 0, topFixed ? 10 : 0], rotation))));
  const retained = original.vertices.filter(v => JSON.stringify(v) === JSON.stringify(actual.vertices.find(a => a.id === v.id))).length;
  assert.equal(retained, 14);
  const signed = topFixed ? angle : -angle;
  for (const z of [0, 10]) {
    const shift = (topFixed ? 10 - z : z) * Math.tan(rad(signed));
    for (const [x, y] of [[4 - shift, shift], [16 + shift, shift], ...ring.slice(2)]) {
      assert.equal(actual.vertices.filter(v => same(v.point, world([x, y, z], rotation))).length, 1);
    }
  }
  const normalY = -5 / Math.sqrt(26), normalZ = -1 / Math.sqrt(26);
  const c = Math.cos(rad(rotation)), s = Math.sin(rad(rotation));
  const normal = [0, c * normalY - s * normalZ, s * normalY + c * normalZ];
  const faces = new Map(actual.faces);
  for (const [name, before] of original.faces) {
    const after = faces.get(name);
    assert.equal(after.kind, 'plane');
    if (name === faceName) {
      assert.ok(same(after.n, normal));
      for (const end of hinge.ends) assert.ok(near(dot(normal, after.o), dot(normal, end.point)));
    } else {
      assert.ok(same(after.n, before.n));
      assert.ok(near(dot(after.n, after.o), dot(before.n, before.o)));
    }
  }
  const volume = topFixed ? 8240 / 3 : 8960 / 3;
  assert.ok(near(actual.volume, volume));
  assert.ok(near((await f.bodies()).bodies[0].volume, volume));
  const node = doc.nodes[feature];
  assert.deepEqual([node.hingeEdge, node.pull, node.faces], [hingeName, undefined, [faceName]]);
  assert.ok(near(node.angle, signed));
  f.report.observations.push({ label, rotation, hinge: hingeName, ends: hinge.ends.map(v => v.point), volume: actual.volume, retained });
}

await f.run(async () => {
  const input = join(f.output, 'rotated-octagon.bcad');
  await writeFile(input, JSON.stringify(source));
  const original = await f.inspect('original-world-octagon', source);
  await f.freshOpen(input, source, 'original');
  await button('Front', f.page.locator('.views')).click();
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await f.page.waitForFunction(() => window.__studioCamera().ortho);
  await pick([10, 0, 5]);
  await f.page.waitForFunction(() => window.__studioSelection.selection.faces.length === 1);
  await pick([8, 0, 10], true);
  await f.page.waitForFunction(() => window.__studioSelection.selection.edges.length === 1);
  await button('Iso', f.page.locator('.views')).click();
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.page.keyboard.press('Space');
  const palette = f.page.getByRole('dialog', { name: 'Command palette', exact: true });
  await palette.locator('input').fill('Pivot face');
  const choice = palette.getByRole('option', { name: /^Pivot face/ });
  if (baseline) {
    assert.match(await choice.innerText(), /upright convex polygon wall/);
    await f.same(source);
    await f.snapshot('baseline-rotated-octagon-unavailable');
    return;
  }
  await choice.click();
  await degrees().fill(String(angle));
  await status();
  await f.page.locator('.gizmo-handle[data-handle="deg"]').waitFor();
  await f.snapshot('rotated-octagon-positive-preview');
  await f.same(source);
  await button('Apply', hud()).click();
  await f.changed(source);
  const top = await f.doc();
  await prove('upper-original-native', top, original, 31, true);

  await f.openFeatureEditor(feature, 'rotated octagon Pivot');
  await button('Edit pivot face', f.editor()).click();
  await status(history);
  assert.deepEqual(await fixed().locator('option').evaluateAll(options => options.map(option => option.value).sort()), [lower, upper].sort());
  await fixed().selectOption(lower);
  await degrees(history).fill('24');
  await status(history, 'refused');
  assert.ok(await button('Apply', hud(history)).isDisabled());
  await f.same(top);
  await f.snapshot('rotated-octagon-collapse-refused');
  await button('Cancel', hud(history)).click();
  await f.same(top);

  await f.openFeatureEditor(feature, 'rotated octagon hinge replacement');
  await button('Edit pivot face', f.editor()).click();
  await fixed().selectOption(lower);
  await degrees(history).fill(String(-angle));
  await status(history);
  await button('Apply', hud(history)).click();
  await f.changed(top);
  const bottom = await f.doc();
  await prove('lower-original-native', bottom, original, 31, false);
  await f.undo();
  await f.same(top);
  await f.redo();
  await f.same(bottom);

  await f.openFeatureEditor(3, 'upstream Rotate');
  await f.editor().getByLabel('Angle', { exact: true }).fill('43');
  await f.applyEditor(bottom, 'upstream-rotate-updated');
  const updated = await f.doc();
  assert.equal(updated.nodes[3].angle, 43);
  const updatedStock = await f.inspect('updated-world-stock', { ...source, nodes: updated.nodes.slice(0, feature) });
  await prove('upstream-updated-native', updated, updatedStock, 43, false);

  const saved = await f.save('rotated-octagon-pivot');
  await f.freshOpen(saved.file, saved.doc, 'rotated-octagon-native-open');
  await button('Iso', f.page.locator('.views')).click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await prove('reopened-native', saved.doc, updatedStock, 43, false);
  await f.openFeatureEditor(feature, 'reopened rotated polygon Pivot');
  await button('Edit pivot face', f.editor()).click();
  await status(history);
  assert.equal(await fixed().inputValue(), lower);
  await f.snapshot('rotated-octagon-reopened-history');
});
