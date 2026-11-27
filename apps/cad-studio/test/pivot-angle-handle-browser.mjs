import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';

const baseline = process.argv.includes('--baseline');
const pins = ['packages/barocss-cad-model/src/app/pivotFaceCommand.ts', 'packages/barocss-cad-model/src/app/draftEdit.ts',
  'apps/cad-studio/src/viewport/viewportPointerInput.ts', 'apps/cad-studio/src/viewport/useCommandGizmos.ts',
  'apps/cad-studio/src/viewport/localTurnDrag.ts', 'apps/cad-studio/src/viewport/Viewport.tsx'];
const f = await createFlow({
  name: 'pivot-angle-handle', output: process.argv[2], envFrozen: 'PIVOT_ANGLE_HANDLE_FROZEN',
  qualification: 'Drag a real viewport angle around an oblique original fixed edge and preserve the native result.',
  limits: ['One original rectangular extrusion with authored Rotate and Move.'], initialFiles: pins, requiredFrozen: pins,
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep } from '@barocss/cad';
import { partSnapshot } from '@barocss/cad-model/engine/part';
const { outputs } = partSnapshot(JSON.parse(readFileSync(process.argv[2], 'utf8')));
const brep = outputs[0].brep, mass = brepMassProperties(brep, 1);
const vertices = Object.fromEntries(brep.vertices.map(v => [v.id, v]));
console.log(JSON.stringify({ strict: checkBrep(brep, { strict: true }).valid,
  topology: [outputs.length, brep.faces.length, brep.edges.length, brep.vertices.length],
  hinge: brep.edges.filter(edge => edge.name === 'n1.side0|n1.top').map(edge => ({
    edge, vertices: edge.vertices.map(id => vertices[id]),
    uses: brep.coedges.filter(use => use.edge === edge.id).map(use => [use.id, use.sense, brep.loops.find(loop => loop.id === use.loop).face]),
  })), points: Object.values(vertices).map(v => v.point), volume: mass.volume }));
`,
});
const stock = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', nextId: 4, parameters: {},
  nodes: [
    { kind: 'sketch', id: 'n0', profile: 'rectangle', min: [4, -3], max: [44, 17] },
    { kind: 'extrude', id: 'n1', sketch: 0, from: 6, height: 12 },
    { kind: 'rotate', id: 'n2', parent: { node: 1, side: 'solid' }, axis: 'y', angle: 37, pivot: [10, 20, 30] },
    { kind: 'translate', id: 'n3', parent: { node: 2, side: 'solid' }, offset: [7, -11, 13] },
  ], outputs: { b3: { node: 3, side: 'solid' } },
};
const fixName = 'n1.side0|n1.top', index = stock.nodes.length;
const radians = degrees => degrees * Math.PI / 180;
function placed([x, y, z]) {
  const c = Math.cos(radians(37)), s = Math.sin(radians(37));
  return [17 + (x - 10) * c + (z - 30) * s, y - 11, 43 - (x - 10) * s + (z - 30) * c];
}
const grip = degrees => placed([24, -3 + 6 * Math.sin(radians(degrees)), 18 - 6 * Math.cos(radians(degrees))]);
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const hud = (name = 'Pivot face') => f.page.getByRole('dialog', { name, exact: true });
const field = name => hud(name).getByLabel('Angle', { exact: true });
const waitStatus = (name, status = 'preview') => hud(name).locator('.status').getByText(status, { exact: true }).waitFor();
const handle = () => f.page.locator('.gizmo-handle[data-handle="deg"]');
const screen = point => f.page.evaluate(p => window.__studioScreenOf(p), point);
const near = (a, b) => Math.abs(a - b) < 1e-6;
const samePoint = (a, b) => a.every((value, i) => near(value, b[i]));

async function clickAt(point, shifted = false) {
  if (shifted) await f.page.keyboard.down('Shift');
  try { await f.page.mouse.click(...await screen(point)); }
  finally { if (shifted) await f.page.keyboard.up('Shift'); }
}
async function pressGrip(degrees) {
  await handle().waitFor();
  const [x, y] = await screen(grip(degrees));
  assert.ok(Number.isFinite(x) && Number.isFinite(y));
  await f.page.mouse.move(x, y);
  await handle().filter({ has: f.page.locator('polyline.arc') }).waitFor();
  await f.page.mouse.down();
}
async function moveGrip(degrees) {
  await f.page.mouse.move(...await screen(grip(degrees)), { steps: 6 });
}
async function prove(label, doc, angle, original) {
  const actual = await f.inspect(label, doc);
  assert.deepEqual([actual.strict, actual.topology, actual.hinge], [true, [1, 6, 12, 8], original.hinge]);
  assert.deepEqual([doc.nodes[index].angle, doc.nodes[index].hingeEdge], [angle, fixName]);
  const inset = 12 * Math.tan(radians(angle));
  for (const x of [4, 44]) {
    for (const local of [[x, -3 + inset, 6], [x, 17, 6], [x, -3, 18], [x, 17, 18]])
      assert.ok(actual.points.some(point => samePoint(point, placed(local))), JSON.stringify(local));
  }
  assert.ok(near(actual.volume, 40 * 12 * (20 - inset / 2)));
  f.report.observations.push({ label, angle, volume: actual.volume, fixedEdge: actual.hinge[0].edge.id,
    hingeVertices: actual.hinge[0].vertices.map(vertex => vertex.point) });
}

await f.run(async () => {
  const file = join(f.output, 'angle-stock.bcad');
  await writeFile(file, JSON.stringify(stock));
  const original = await f.inspect('01-original', stock);
  assert.equal(original.hinge.length, 1);
  await f.freshOpen(file, stock, '01-oblique-hinge-stock');
  await button('Front', f.page.locator('.views')).click();
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await f.page.waitForFunction(() => window.__studioCamera().ortho);
  await clickAt(placed([24, -3, 12]));
  await f.page.waitForFunction(() => window.__studioSelection.selection.faces.length === 1);
  await clickAt(placed([16, -3, 18]), true);
  await f.page.waitForFunction(() => window.__studioSelection.selection.edges.length === 1);
  await button('Iso', f.page.locator('.views')).click();
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.command('Pivot face');
  await waitStatus();
  assert.equal(await field().inputValue(), '5');
  if (baseline) {
    assert.equal(await handle().count(), 0);
    await f.snapshot('02-baseline-angle-field-without-handle');
    await f.same(stock);
    return;
  }

  await pressGrip(5);
  await moveGrip(15);
  await waitStatus();
  assert.equal(await field().inputValue(), '15');
  await f.same(stock);
  await f.snapshot('02-positive-drag-preview');
  await f.page.keyboard.press('Escape');
  await f.page.mouse.up();
  await waitStatus();
  assert.equal(await field().inputValue(), '5');
  await f.same(stock);
  await f.snapshot('03-escape-restores-start');

  await pressGrip(5);
  await moveGrip(15);
  await waitStatus();
  await f.page.mouse.wheel(0, -100);
  await f.page.mouse.up();
  await waitStatus();
  assert.equal(await field().inputValue(), '5');
  await f.same(stock);
  await f.snapshot('03-camera-change-restores-start');

  await pressGrip(5);
  await moveGrip(15);
  await waitStatus();
  await f.page.mouse.up();
  assert.equal(await field().inputValue(), '15');
  await button('Apply', hud()).click();
  await f.changed(stock);
  const positive = await f.doc();
  await prove('04-applied-positive', positive, 15, original);

  const history = 'Edit Pivot face';
  await button('Ortho').click();
  await f.page.waitForFunction(() => !window.__studioCamera().ortho);
  await f.openFeatureEditor(index, 'saved Pivot face');
  await button('Edit pivot face', f.editor()).click();
  await waitStatus(history);
  // The zero field is still refused. Dragging on to a negative angle recovers.
  await pressGrip(15);
  await moveGrip(0);
  await waitStatus(history, 'refused');
  assert.equal(await field(history).inputValue(), '0');
  assert.equal(await button('Apply', hud(history)).isEnabled(), false);
  await moveGrip(-5);
  await waitStatus(history);
  await f.page.mouse.up();
  assert.equal(await field(history).inputValue(), '-5');
  await f.same(positive);
  await f.snapshot('05-history-negative-preview');
  await button('Apply', hud(history)).click();
  await f.changed(positive);
  const negative = await f.doc();
  await prove('06-applied-negative', negative, -5, original);
  await f.undo();
  await f.same(positive);
  await f.redo();
  await f.same(negative);
  const saved = await f.save('pivot-angle-native');
  await f.freshOpen(saved.file, saved.doc, '07-native-reopen');
  await prove('07-reopened-native', saved.doc, -5, original);
  await button('Iso', f.page.locator('.views')).click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await f.openFeatureEditor(index, 'reopened Pivot face');
  await button('Edit pivot face', f.editor()).click();
  await waitStatus(history);
  await handle().waitFor();
  await f.snapshot('08-reopened-history-angle-handle');
});
