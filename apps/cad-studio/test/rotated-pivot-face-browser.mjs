import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { currentPartRevision, withMcpSession } from './mcp-browser-session.mjs';

const baseline = process.argv.includes('--baseline');
const pins = ['packages/barocss-cad-model/src/app/pivotFaceCommand.ts', 'packages/barocss-cad-model/src/app/draftEdit.ts',
  'packages/barocss-cad-model/src/engine/references.ts',
  'packages/barocss-cad/src/part/part-model.ts', 'packages/barocss-cad/src/part/part-face-finish.ts',
  'packages/barocss-cad/src/part/part-box-draft.ts'];
const f = await createFlow({
  name: 'rotated-pivot-face', output: process.argv[2], envFrozen: 'ROTATED_PIVOT_FACE_FROZEN',
  qualification: 'Pivot an original planar box face after an oblique authored Rotate.',
  limits: ['One translated rectangular stock with an X-axis Rotate about a nonzero pivot.'], initialFiles: pins, requiredFrozen: pins,
  extraFrozen: baseline ? [] : ['packages/barocss-cad-model/src/engine/pivotStock.ts'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep, faceGeometry } from '@barocss/cad';
import { partSnapshot } from '@barocss/cad-model/engine/part';
const { outputs } = partSnapshot(JSON.parse(readFileSync(process.argv[2], 'utf8')));
const brep = outputs[0].brep, mass = brepMassProperties(brep, 1);
const vertices = Object.fromEntries(brep.vertices.map(v => [v.id, v]));
console.log(JSON.stringify({ count: outputs.length, strict: checkBrep(brep, { strict: true }).valid,
  closed: brep.shells.every(shell => shell.closed),
  topology: [brep.bodies.length, brep.shells.length, brep.faces.length, brep.loops.length, brep.coedges.length, brep.edges.length, brep.vertices.length],
  edges: brep.edges.map(edge => ({ edge, vertices: edge.vertices.map(id => vertices[id]),
    uses: brep.coedges.filter(use => use.edge === edge.id).map(use => [use.id, use.sense, brep.faces.find(face => face.loops.includes(use.loop)).id]) })),
  vertices: Object.values(vertices).map(v => v.point), volume: mass.volume, centroid: mass.centroid,
  support: faceGeometry(brep.faces.find(face => face.name === 'n1.side0')) }));
`,
});
const source = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', nextId: 5, parameters: {},
  nodes: [
    { kind: 'sketch', id: 'n0', profile: 'rectangle', min: [4, -3], max: [44, 17] },
    { kind: 'extrude', id: 'n1', sketch: 0, from: 6, height: 12 },
    { kind: 'translate', id: 'n2', parent: { node: 1, side: 'solid' }, offset: [20, -10, 8] },
    { kind: 'rotate', id: 'n3', parent: { node: 2, side: 'solid' }, axis: 'x', angle: 31, pivot: [31, -5, 20] },
    { kind: 'translate', id: 'n4', parent: { node: 3, side: 'solid' }, offset: [3, 2, -4] },
  ], outputs: { b4: { node: 4, side: 'solid' } },
};
const feature = source.nodes.length, faceName = 'n1.side0', upper = 'n1.side0|n1.top', lower = 'n1.bottom|n1.side0';
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const hud = (name = 'Pivot face') => f.page.getByRole('dialog', { name, exact: true });
const preview = name => hud(name).locator('.status').getByText('preview', { exact: true }).waitFor();
const fixedEdge = () => hud('Edit Pivot face').getByRole('combobox', { name: 'Fixed edge', exact: true });
const near = (a, b) => Math.abs(a - b) < 1e-6;
const samePoint = (a, b) => a.every((value, i) => near(value, b[i]));

function world([x, y, z], rotation) {
  const a = rotation * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  const py = y - 5, pz = z - 12;
  return [x + 23, -3 + py * c - pz * s, 16 + py * s + pz * c];
}
async function clickAt(point, shifted = false) {
  const pixel = await f.page.evaluate(worldPoint => window.__studioScreenOf(worldPoint), point);
  if (shifted) await f.page.keyboard.down('Shift');
  try { await f.page.mouse.click(...pixel); }
  finally { if (shifted) await f.page.keyboard.up('Shift'); }
}

async function prove(label, doc, original, angle, rotation, bottomFixed = false) {
  const actual = await f.inspect(label, doc);
  assert.deepEqual([actual.count, actual.strict, actual.closed, actual.topology], [1, true, true, [1, 1, 6, 6, 24, 12, 8]]);
  const hingeName = bottomFixed ? lower : upper, hinge = actual.edges.find(entry => entry.edge.name === hingeName);
  const exact = original.edges.find(entry => entry.edge.name === hingeName);
  assert.ok(exact);
  assert.deepEqual(hinge, exact);
  const incline = angle * Math.PI / 180, inset = 12 * Math.tan(incline);
  for (const x of [4, 44]) {
    for (const pt of [[x, -3 + (bottomFixed ? 0 : inset), 6], [x, 17, 6], [x, -3 + (bottomFixed ? inset : 0), 18], [x, 17, 18]]) {
      assert.ok(actual.vertices.some(vertex => samePoint(vertex, world(pt, rotation))), JSON.stringify(world(pt, rotation)));
    }
  }
  const radians = rotation * Math.PI / 180, c = Math.cos(radians), s = Math.sin(radians);
  const sideZ = (bottomFixed ? 1 : -1) * Math.sin(incline), sideY = -Math.cos(incline);
  const normal = [0, c * sideY - s * sideZ, s * sideY + c * sideZ];
  assert.equal(actual.support.kind, 'plane');
  assert.ok(samePoint(actual.support.n, normal));
  const volume = 40 * 12 * (20 - inset / 2);
  assert.ok(near(actual.volume, volume), `${actual.volume} versus ${volume}`);
  const anchor = hinge.vertices[0].point;
  const planeGap = Math.abs(normal.reduce((sum, value, i) => sum + value * (actual.support.o[i] - anchor[i]), 0));
  assert.ok(planeGap < 1e-9, `moving support must pass through its hinge (${planeGap} mm)`);
  f.report.observations.push({ label, angle, rotation, hingeName, nativeEdge: hinge.edge.id, points: hinge.vertices.map(v => v.point),
    volume: actual.volume, planeGap });
}

await f.run(async () => {
  const file = join(f.output, 'rotated-stock.bcad');
  await writeFile(file, JSON.stringify(source));
  const original = await f.inspect('01-original-world-stock', source);
  const originalHinge = original.edges.find(entry => entry.edge.name === upper);
  assert.ok(originalHinge?.vertices.every(v => [4, 44].some(x => samePoint(v.point, world([x, -3, 18], 31)))));
  await f.freshOpen(file, source, '01-rotated-stock');
  await button('Front', f.page.locator('.views')).click();
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await f.page.waitForFunction(() => window.__studioCamera().ortho);
  await clickAt(world([24, -3, 12], 31));
  await f.page.waitForFunction(() => window.__studioSelection.selection.faces.length === 1);
  await clickAt(world([18, -3, 18], 31), true);
  await f.page.waitForFunction(() => window.__studioSelection.selection.edges.length === 1);
  await button('Iso', f.page.locator('.views')).click();
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.page.keyboard.press('Space');
  const palette = f.page.getByRole('dialog', { name: 'Command palette', exact: true });
  await palette.locator('input').fill('Pivot face');
  const choice = palette.getByRole('option', { name: /^Pivot face/ });
  if (baseline) {
    assert.match(await choice.innerText(), /rectangular extrusion/);
    await f.snapshot('02-baseline-rotated-pivot-refused');
    await f.same(source);
    return;
  }

  await choice.click();
  await hud().getByLabel('Angle', { exact: true }).fill('12');
  await preview();
  await f.snapshot('02-rotated-upper-preview');
  await button('Apply', hud()).click();
  await f.changed(source);
  const pivoted = await f.doc(), pivot = pivoted.nodes[feature];
  assert.deepEqual([pivot.faces, pivot.hingeEdge, pivot.pull, pivot.angle], [[faceName], upper, undefined, 12]);
  await prove('03-applied-upper', pivoted, original, 12, 31);

  await f.openFeatureEditor(feature, 'Pivot face on rotated stock');
  await button('Edit pivot face', f.editor()).click();
  await preview('Edit Pivot face');
  assert.equal(await fixedEdge().inputValue(), upper);
  assert.equal(await fixedEdge().locator('option').count(), 4);
  await fixedEdge().selectOption(lower);
  await preview('Edit Pivot face');
  await f.same(pivoted);
  await f.snapshot('03-rotated-lower-preview');
  await button('Apply', hud('Edit Pivot face')).click();
  await f.changed(pivoted);
  const rebound = await f.doc();
  assert.deepEqual([rebound.nodes[feature].hingeEdge, rebound.nodes[feature].pull, rebound.nodes[feature].angle], [lower, undefined, 12]);
  await prove('04-applied-lower', rebound, original, 12, 31, true);
  await f.undo();
  await f.same(pivoted);
  await f.redo();
  await f.same(rebound);

  await f.openFeatureEditor(3, 'upstream Rotate');
  await f.editor().getByLabel('Angle', { exact: true }).fill('43');
  await f.applyEditor(rebound, '04-upstream-rotate');
  const rotated = await f.doc();
  assert.equal(rotated.nodes[3].angle, 43);
  const changedStock = { ...source, nodes: rotated.nodes.slice(0, feature) };
  const changedOriginal = await f.inspect('05-retuned-original-world-stock', changedStock);
  await prove('05-retuned-pivot', rotated, changedOriginal, 12, 43, true);

  const saved = await f.save('rotated-pivot-native');
  await f.freshOpen(saved.file, saved.doc, '06-reopened-rotated-pivot');
  await button('Iso', f.page.locator('.views')).click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await prove('06-reopened-native', await f.doc(), changedOriginal, 12, 43, true);
  await f.openFeatureEditor(feature, 'reopened rotated Pivot');
  await button('Edit pivot face', f.editor()).click();
  await preview('Edit Pivot face');
  assert.equal(await fixedEdge().inputValue(), lower);
  await f.snapshot('06-reopened-rotated-hinge-history');

  await withMcpSession({ app: f.app, output: f.output, clientName: 'rotated-pivot-review' }, file, 'rotated-agent', async call => {
    const expectedRevision = await currentPartRevision(call);
    const make = edges => ({ action: 'propose', title: 'Pivot the rotated stock', ops: [{ tool: 'features',
      args: { action: 'command', command: 'pivot-face', faces: [faceName], edges, expectedRevision, values: { deg: 12 } },
    }] });
    const refusal = await call('proposals', make(['n1.side2|n1.top']), true);
    assert.match(JSON.stringify(refusal), /edge on that face/);
    const staged = await call('proposals', make([upper]));
    assert.deepEqual([staged.proposal, staged.applied], ['P1', false]);
    assert.ok(Math.abs(staged.change.volume + 40 * 12 * 12 * Math.tan(Math.PI / 15) / 2) < 0.001);
    assert.deepEqual(JSON.parse(await readFile(file, 'utf8')).nodes, source.nodes);
  });
});
