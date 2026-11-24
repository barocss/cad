import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const baseline = process.argv.includes('--baseline');
const pins = [
  'apps/cad-studio/test/box-wall-shell-browser.mjs',
  'packages/barocss-cad-model/src/app/commands.ts',
  'packages/barocss-cad-model/src/app/editFields.ts',
  'packages/barocss-cad-model/src/engine/migrate.ts',
  'packages/barocss-cad/src/part/part-box-shell.ts',
  'packages/barocss-cad/src/part/part-shell.ts',
];
const f = await createFlow({
  name: 'box-wall-shell', output: process.argv[2], envFrozen: 'D1938_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Make and edit five named walls on one exact top-open box.',
  limits: ['One ordinary 40 × 30 × 20 mm upright rectangular extrusion. Native desktop Studio and exact .bcad.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { partSnapshot } from '@barocss/cad-model/engine/part';
import { checkBrep, faceGeometry, massPropertiesOf } from '@barocss/cad';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const [output] = partSnapshot(doc).outputs;
console.log(JSON.stringify({
  key: output.id, mass: massPropertiesOf(output), report: checkBrep(output.brep, { strict: true }),
  faces: output.brep.faces.map(face => {
    const g = faceGeometry(face);
    if (g.kind !== 'plane') throw Error('Expected plane: ' + face.name);
    return { name: face.name, loops: face.loops.length, origin: g.o, normal: g.n };
  }),
}));
`,
});
const source = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 2,
  nodes: [{ id: 'n0', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [40, 30] },
    { id: 'n1', kind: 'extrude', sketch: 0, height: 20 }],
  outputs: { b1: { node: 1, side: 'solid' } },
};
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const hud = () => f.page.getByRole('dialog', { name: 'Shell', exact: true });
const field = (scope, name) => scope.getByLabel(name, { exact: true });
const near = (a, b) => Math.abs(a - b) < 1e-7;
const uniform = { 'n1.bottom': 2, 'n1.side0': 2, 'n1.side1': 2, 'n1.side2': 2, 'n1.side3': 2 };
const equalSides = { ...uniform, 'n1.bottom': 4 };
const unequal = { ...equalSides, 'n1.side1': 5, 'n1.side2': 4, 'n1.side3': 3 };

async function verify(label, doc, walls) {
  assert.deepEqual(doc.nodes.slice(0, 2), source.nodes);
  const feature = doc.nodes[2];
  if (feature.kind === 'shell-walls') {
    assert.equal(doc.schema, 3);
    assert.deepEqual(feature.walls, walls);
    assert.equal(feature.opening, 'n1.top');
  } else {
    assert.equal(feature.kind, 'shell');
    assert.equal(feature.thickness, 2);
    assert.deepEqual(feature.open, ['n1.top']);
  }
  const lo = [walls['n1.side3'], walls['n1.side0'], walls['n1.bottom']];
  const hi = [40 - walls['n1.side1'], 30 - walls['n1.side2'], 20];
  const removed = hi.reduce((volume, limit, i) => volume * (limit - lo[i]), 1);
  const expectedVolume = 24000 - removed;
  const expectedCentroid = [20, 15, 10].map((value, i) => (24000 * value - removed * (hi[i] + lo[i]) / 2) / expectedVolume);
  const n = await f.inspect(label, doc);
  assert.ok(n.report.valid);
  assert.equal(n.report.topology[0].genus, 0);
  assert.deepEqual(n.report.counts, { bodies: 1, shells: 1, faces: 11, loops: 12, coedges: 48, edges: 24, vertices: 16 });
  assert.ok(near(n.mass.volume, expectedVolume) && n.mass.centroid.every((x, i) => near(x, expectedCentroid[i])));
  const [body] = (await f.bodies()).bodies;
  assert.ok(near(body.volume, expectedVolume));
  const plane = (axis, value, sign, loops = 1) => {
    const found = n.faces.filter(face => near(face.origin[axis], value) && near(face.normal[axis], sign));
    assert.equal(found.length, 1, JSON.stringify({ axis, value, sign, faces: n.faces }));
    assert.equal(found[0].loops, loops);
    return found[0];
  };
  plane(0, 0, -1); plane(0, 40, 1); plane(1, 0, -1); plane(1, 30, 1); plane(2, 0, -1);
  plane(2, 20, 1, 2);
  for (const axis of [0, 1, 2]) plane(axis, lo[axis], 1);
  for (const axis of [0, 1]) plane(axis, hi[axis], -1);
  f.report.observations.push({ label, volume: n.mass.volume, centroid: n.mass.centroid, opening: hi, innerCorner: lo });
  return n;
}

await f.run(async () => {
  await f.newPage();
  await f.page.getByLabel('Model file', { exact: true }).setInputFiles({
    name: 'shell-wall-stock.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(source)),
  });
  await f.same(source);
  await button('Top', f.page.locator('.views')).click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await f.worldClick([20, 15, 20]);
  await f.page.waitForFunction(() => window.__studioSelection?.selection?.faces?.length === 1);
  await f.command('Shell');
  if (baseline) {
    await field(hud(), 'Wall').waitFor();
    assert.equal(await field(hud(), 'Wall thickness').count(), 0);
    await hud().locator('.status').filter({ hasText: /^preview$/ }).waitFor();
    await f.same(source);
    await f.snapshot('00-previous-uniform-wall-only');
  } else {
    await field(hud(), 'Wall thickness').selectOption({ label: 'Per face' });
    await field(hud(), 'Bottom wall').fill('4');
    await hud().locator('.status').filter({ hasText: /^preview$/ }).waitFor();
    await f.same(source);
    await f.snapshot('01-per-face-preview');
  }
  await button('Apply', hud()).click();
  await f.changed(source);
  await hud().waitFor({ state: 'hidden' });
  const made = await f.doc();
  await verify('applied', made, baseline ? uniform : equalSides);
  await button('Iso', f.page.locator('.views')).click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  const applied = await f.snapshot(baseline ? '00-previous-uniform-solid' : '02-applied');
  if (baseline) return;

  await f.openFeatureEditor(2, 'Separate shell wall thicknesses');
  const editor = f.editor();
  await field(editor, 'Left wall').fill('3');
  await field(editor, 'Right wall').fill('37');
  await button('Apply', editor).click();
  await editor.getByText('Wall thicknesses leave no cavity', { exact: true }).waitFor();
  await f.same(made);
  assert.ok(near((await f.bodies()).bodies[0].volume, 9024));
  const refused = await f.snapshot('03-closed-cavity-refused');
  assert.deepEqual(refused.history, applied.history);
  await field(editor, 'Right wall').fill('5');
  await field(editor, 'Back wall').fill('4');
  const edited = (await f.applyEditor(made, '04-asymmetric-wall-edit')).doc;
  const accepted = await verify('asymmetric', edited, unequal);
  await f.undo(); await f.same(made);
  await f.redo(); await f.same(edited);
  const saved = await f.save('per-face-box-shell');
  await f.freshOpen(saved.file, edited, '05-fresh-open');
  assert.deepEqual(await verify('reopened', edited, unequal), accepted);
  await f.openFeatureEditor(2, 'Reopened separate shell wall thicknesses');
  assert.equal(await field(f.editor(), 'Left wall').inputValue(), '3');
  assert.equal(await field(f.editor(), 'Right wall').inputValue(), '5');
  await field(f.editor(), 'Bottom wall').fill('5');
  const final = (await f.applyEditor(edited, '06-floor-edited-after-open')).doc;
  await verify('post-open-floor-edit', final, { ...unequal, 'n1.bottom': 5 });
  await f.undo(); await f.same(edited);
});
