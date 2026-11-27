import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';

const baseline = process.argv.includes('--baseline');
const pins = ['packages/barocss-cad-model/src/app/pivotFaceCommand.ts', 'packages/barocss-cad-model/src/app/draftEdit.ts',
  'apps/cad-studio/src/app/useHistoryReferenceActions.ts', 'apps/cad-studio/src/ui/HistoryFeatureEditor.tsx'];
const f = await createFlow({
  name: 'pivot-hinge-history', output: process.argv[2], envFrozen: 'PIVOT_HINGE_HISTORY_FROZEN',
  qualification: 'Replace the fixed edge of an accepted Pivot face in History.',
  limits: ['One native rectangular extrusion and one planar face.'], initialFiles: pins, requiredFrozen: pins,
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep } from '@barocss/cad';
import { partSnapshot } from '@barocss/cad-model/engine/part';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const { outputs } = partSnapshot(doc);
const brep = outputs[0].brep;
const vertices = Object.fromEntries(brep.vertices.map(v => [v.id, v.point]));
console.log(JSON.stringify({ outputs: outputs.length, strict: checkBrep(brep, { strict: true }).valid,
  closed: brep.shells.every(shell => shell.closed),
  topology: [brep.bodies.length, brep.shells.length, brep.faces.length, brep.loops.length, brep.coedges.length, brep.edges.length, brep.vertices.length],
  edges: brep.edges.map(edge => ({ edge, endpoints: edge.vertices.map(id => vertices[id]), uses: brep.coedges.filter(use => use.edge === edge.id)
    .map(use => [use.id, use.sense, brep.faces.find(face => face.loops.includes(use.loop)).id]) })),
  vertices: Object.values(vertices), volume: brepMassProperties(brep, 1).volume }));
`,
});
const stock = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', nextId: 2, parameters: {},
  nodes: [
    { kind: 'sketch', id: 'n0', profile: 'rectangle', min: [4, -3], max: [44, 17] },
    { kind: 'extrude', id: 'n1', sketch: 0, from: 6, height: 12 },
  ], outputs: { b1: { node: 1, side: 'solid' } },
};
const face = 'n1.side0', upper = 'n1.side0|n1.top', lower = 'n1.bottom|n1.side0', rear = 'n1.side2|n1.top';
const angle = 12;
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const hud = (name = 'Edit Pivot face') => f.page.getByRole('dialog', { name, exact: true });
const fixedEdge = () => hud().getByRole('combobox', { name: 'Fixed edge', exact: true });
const expectPreview = name => hud(name).locator('.status').getByText('preview', { exact: true }).waitFor();
const near = (a, b) => Math.abs(a - b) < 1e-6;
const samePoint = (a, b) => a.every((value, i) => near(value, b[i]));
const frame = () => f.page.getByTitle('Frame all (F)', { exact: true }).click();

async function clickAt(point, shifted = false) {
  const pixel = await f.page.evaluate(world => window.__studioScreenOf(world), point);
  if (shifted) await f.page.keyboard.down('Shift');
  try { await f.page.mouse.click(...pixel); }
  finally { if (shifted) await f.page.keyboard.up('Shift'); }
}

async function prove(label, doc, original, bottomFixed) {
  const actual = await f.inspect(label, doc);
  assert.deepEqual([actual.outputs, actual.strict, actual.closed, actual.topology], [1, true, true, [1, 1, 6, 6, 24, 12, 8]]);
  const hingeName = bottomFixed ? lower : upper;
  const hinge = actual.edges.find(entry => entry.edge.name === hingeName);
  const source = original.edges.find(entry => entry.edge.name === hingeName);
  assert.deepEqual(hinge, source, 'The original native edge, endpoints, vertices and incident face uses must match.');
  const inset = 12 * Math.tan(angle * Math.PI / 180);
  for (const x of [4, 44]) {
    for (const point of [[x, -3 + (bottomFixed ? 0 : inset), 6], [x, 17, 6], [x, -3 + (bottomFixed ? inset : 0), 18], [x, 17, 18]]) {
      assert.ok(actual.vertices.some(vertex => samePoint(vertex, point)), JSON.stringify(point));
    }
  }
  const volume = 40 * 12 * (20 - inset / 2);
  assert.ok(near(actual.volume, volume));
  return { hingeName, nativeEdge: hinge.edge.id, endpoints: hinge.endpoints, volume: actual.volume };
}

async function historyEdit() {
  await f.openFeatureEditor(2, 'Pivot face');
  await button('Edit pivot face', f.editor()).click();
  await expectPreview();
}

await f.run(async () => {
  const file = join(f.output, 'stock.bcad');
  await writeFile(file, JSON.stringify(stock));
  const original = await f.inspect('01-original-native', stock);
  assert.ok(original.edges.some(entry => entry.edge.name === rear));
  await f.freshOpen(file, stock, '01-stock');
  await button('Front', f.page.locator('.views')).click();
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await frame();
  await f.page.waitForFunction(() => window.__studioCamera().ortho);
  await clickAt([24, -3, 12]);
  await f.page.waitForFunction(() => window.__studioSelection.selection.faces.length === 1);
  await clickAt([18, -3, 18], true);
  await f.page.waitForFunction(() => window.__studioSelection.selection.edges.length === 1);
  await button('Iso', f.page.locator('.views')).click();
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.page.keyboard.press('Space');
  const palette = f.page.getByRole('dialog', { name: 'Command palette', exact: true });
  await palette.locator('input').fill('Pivot face');
  await palette.getByRole('option', { name: /^Pivot face/ }).click();
  await hud('Pivot face').getByLabel('Angle', { exact: true }).fill(String(angle));
  await expectPreview('Pivot face');
  await button('Apply', hud('Pivot face')).click();
  await f.changed(stock);
  const accepted = await f.doc(), pivot = accepted.nodes[2];
  assert.deepEqual([pivot.faces, pivot.hingeEdge, pivot.pull, pivot.angle], [[face], upper, '-z', angle]);
  const before = await prove('02-upper-native', accepted, original, false);
  await historyEdit();
  if (baseline) {
    assert.equal(await fixedEdge().count(), 0);
    await f.snapshot('02-baseline-angle-only');
    await f.same(accepted);
    f.report.observations.push({ ...before, historyOnlyOffersAngle: true });
    return;
  }

  assert.equal(await fixedEdge().inputValue(), upper);
  const options = await fixedEdge().locator('option').evaluateAll(items => items.map(item => item.value));
  assert.deepEqual([...options].sort(), [upper, lower, 'n1.side0|n1.side1', 'n1.side0|n1.side3'].sort());
  assert.ok(!options.includes(rear));
  await f.snapshot('02-eligible-stock-edges');

  await fixedEdge().selectOption(lower);
  await expectPreview();
  assert.equal(await hud().getByLabel('Angle', { exact: true }).inputValue(), String(angle));
  await f.same(accepted);
  await f.snapshot('03-bottom-edge-preview');
  await button('Cancel', hud()).click();
  await hud().waitFor({ state: 'hidden' });
  await f.same(accepted);
  await f.snapshot('04-cancelled-upper-edge');

  await historyEdit();
  assert.equal(await fixedEdge().inputValue(), upper);
  await fixedEdge().selectOption(lower);
  await expectPreview();
  await button('Apply', hud()).click();
  await f.changed(accepted);
  await hud().waitFor({ state: 'hidden' });
  const changed = await f.doc(), next = changed.nodes[2];
  assert.deepEqual(changed.nodes.slice(0, 2), accepted.nodes.slice(0, 2));
  assert.deepEqual([changed.nodes.length, next.id, next.parent, next.faces, next.angle, next.hingeEdge, next.pull],
    [3, pivot.id, pivot.parent, pivot.faces, angle, lower, 'z']);
  assert.deepEqual(next.sigs[face], pivot.sigs[face]);
  assert.ok(!(upper in next.sigs));
  const target = next.sigs[lower];
  assert.deepEqual([target.k, target.p, target.d, target.s], ['line', [24, -3, 6], [1, 0, 0], 40]);
  const after = await prove('05-lower-native', changed, original, true);
  await f.snapshot('05-applied-lower-edge');

  await f.undo();
  await f.same(accepted);
  await f.redo();
  await f.same(changed);
  const saved = await f.save('new-fixed-edge');
  await f.freshOpen(saved.file, saved.doc, '06-fresh-open');
  await button('Iso', f.page.locator('.views')).click();
  await frame();
  await prove('06-reopened-native', await f.doc(), original, true);
  await historyEdit();
  assert.equal(await fixedEdge().inputValue(), lower);
  await button('Cancel', hud()).click();
  await f.snapshot('06-reopened-lower-edge');
  f.report.observations.push({ before, after, rejectedChoice: rear, options, exactAngle: angle });
});
