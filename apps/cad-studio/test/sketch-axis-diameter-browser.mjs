import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const pins = [
  'apps/cad-studio/test/sketch-axis-diameter-browser.mjs',
  'apps/cad-studio/src/ui/ConstraintTools.tsx',
  'apps/cad-studio/src/ui/SketchMarks.tsx',
  'packages/barocss-cad-model/src/sketch/axisDiameter.ts',
  'packages/barocss-cad-model/src/sketch/rules.ts',
  'packages/barocss-cad-model/src/sketch/terms.ts',
  'packages/barocss-cad-model/src/sketch/outlineFields.ts',
];

const f = await createFlow({
  name: 'sketch-axis-diameter',
  output: process.argv[2],
  envFrozen: 'D2020_SOURCE_FROZEN',
  initialFiles: pins,
  requiredFrozen: pins,
  qualification: 'Driving revolve-profile axis diameter (`adia`) maintains radial distance |coord| = D/2 from the explicit local axis across Ø12 -> Ø14 inline edit, Sketch & Document Undo/Redo, .bcad Save/Open, Feature Editor Ø14 -> Ø16 edit, and native Revolve B-rep evaluation.',
  limits: ['Half-profile [(0,0),(6,0),(6,20),(0,20)] revolved 360° about sketch Y axis. Negative side, X-axis, tilted 3D plane, precision 12.0006, and redundant/conflicting refusals are verified in model unit tests.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { emptyDoc, withNode } from '@barocss/cad-model/engine/doc';
import { profileOf } from '@barocss/cad-model/sketch/loops';
import { partSnapshot } from '@barocss/cad-model/engine/part';
import { checkBrep, faceGeometry, massPropertiesOf } from '@barocss/cad';

const d = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (d.seed) {
  const p = profileOf([{
    kind: 'polygon',
    closed: true,
    points: [[0, 0], [6, 0], [6, 20], [0, 20]],
    hv: { h: [0, 2], v: [1, 3] },
  }]);
  assert.ok('node' in p);
  console.log(JSON.stringify(withNode(withNode(emptyDoc(), p.node), { kind: 'revolve', sketch: 0, axis: 'y', origin: [0, 0], angle: 360 })));
} else {
  console.log(JSON.stringify(partSnapshot(d).outputs.map(b => {
    const cyl = b.brep.faces.map(face => faceGeometry(face)).find(g => g.kind === 'cylinder');
    const props = massPropertiesOf(b);
    return {
      valid: checkBrep(b.brep, { strict: true }).valid,
      count: b.bodyCount,
      volume: props.volume,
      radius: cyl && cyl.kind === 'cylinder' ? cyl.r : null,
    };
  })));
}
`,
});

const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const inline = () => f.page.locator('input.dim-edit');
const approx = (a, b, tol = 1e-4) => assert.ok(Math.abs(a - b) <= tol, `expected ${b} ± ${tol}, got ${a}`);

async function verifyNative(doc, label, expectedRadius) {
  const rows = await f.inspect(label, doc);
  assert.equal(rows.length, 1);
  const b = rows[0];
  assert.ok(b.valid, `${label}: invalid B-rep`);
  assert.equal(b.count, 1);
  const expectedVolume = Math.PI * expectedRadius * expectedRadius * 20;
  approx(b.volume, expectedVolume, 1e-3);
  assert.ok(b.radius !== null, `${label}: missing cylindrical outer face`);
  approx(b.radius, expectedRadius, 1e-5);
}

async function waitDimChipText(key, expected) {
  await f.page.waitForFunction(
    ([k, text]) => {
      const el = document.querySelector(`[data-dim="${k}"] text`);
      return el?.textContent?.trim() === text;
    },
    [key, expected],
  );
}

async function editInlineDim(key, valueText) {
  await f.page.locator(`[data-dim="${key}"]`).dblclick({ force: true });
  await inline().waitFor();
  await inline().fill(valueText);
  await inline().press('Enter');
  await inline().waitFor({ state: 'detached' });
}

await f.run(async () => {
  const seed = await f.inspect('seed', { seed: true });
  await f.newPage();
  await f.page.locator('input[aria-label="Model file"]').setInputFiles({
    name: 'axis-diameter-seed.bcad',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(seed)),
  });
  await f.same(seed);
  await f.ready();
  await verifyNative(seed, '01-seed-native', 6);

  // Enter Edit sketch on Revolve's sketch.
  await f.openFeatureEditor(1);
  await button('Edit sketch', f.editor()).click();
  await f.sketchPanel().waitFor();
  await f.frame([[-8, -4], [10, 24]]);

  // Select point 2 at (6, 0): off Y-axis (x = 6), on X-axis (y = 0).
  await f.tool('Select', 's');
  await f.worldClick([6, 0]);
  await button('Diameter about Y axis', f.sketchPanel()).waitFor();
  assert.equal(await button('Diameter about X axis', f.sketchPanel()).count(), 0);

  // Refusal check: zero diameter is refused cleanly without adding adia rule.
  await button('Diameter about Y axis', f.sketchPanel()).click();
  await inline().waitFor();
  assert.equal(await inline().getAttribute('aria-label'), 'Diameter of point 2 about Y axis');
  assert.equal(Number(await inline().inputValue()), 12);
  await inline().fill('0');
  await inline().press('Enter');
  await inline().waitFor({ state: 'detached' });
  await f.sketchPanel().getByText(/at least 0\.002/i).waitFor();
  assert.equal(await f.page.locator('[data-dim="adiay1"]').count(), 0);

  // Add driving Y-axis diameter Ø12 mm.
  await button('Diameter about Y axis', f.sketchPanel()).click();
  await inline().waitFor();
  assert.equal(Number(await inline().inputValue()), 12);
  await inline().press('Enter');
  await inline().waitFor({ state: 'detached' });
  await waitDimChipText('adiay1', 'Ø12');
  await f.page.waitForFunction(() => document.querySelectorAll('[data-dim-line="adiay1"][data-dim-kind="adia"]').length === 1);
  await f.sketchPanel().getByRole('button', { name: /^Remove Axis diameter point 2 about Y = Ø12$/ }).waitFor();
  await f.snapshot('01-axis-diameter-12-added');

  // Edit Ø12 -> Ø14 mm => x1 & x2 move to 7 mm.
  await editInlineDim('adiay1', '14');
  await waitDimChipText('adiay1', 'Ø14');
  await f.sketchPanel().getByRole('button', { name: /^Remove Axis diameter point 2 about Y = Ø14$/ }).waitFor();
  await f.snapshot('02-axis-diameter-14-edited');

  // Sketch-level Undo / Redo.
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.page.keyboard.press('Meta+z');
  await waitDimChipText('adiay1', 'Ø12');
  await f.page.keyboard.press('Meta+Shift+z');
  await waitDimChipText('adiay1', 'Ø14');

  // Finish sketch -> verify stored adia rule, radius 7 mm, and native Revolve B-rep.
  const finished = (await f.finishSketch('03-finished-revolve-14')).doc;
  const adiaRule = finished.nodes[0].outline.rules.find(r => r.kind === 'adia');
  assert.deepEqual(adiaRule, { kind: 'adia', point: 1, axis: 'y', side: 1, value: 14 });
  approx(finished.nodes[0].outline.points[0][0], 0, 1e-6);
  approx(finished.nodes[0].outline.points[1][0], 7, 1e-6);
  approx(finished.nodes[0].outline.points[2][0], 7, 1e-6);
  approx(finished.nodes[0].outline.points[2][1], 20, 1e-6);
  await verifyNative(finished, '03-finished-native', 7);

  // Document-level Undo / Redo.
  await f.undo();
  await f.same(seed);
  await f.redo();
  await f.same(finished);

  // Save .bcad -> fresh Open -> verify persistence & native B-rep.
  const saved = await f.save('sketch-axis-diameter');
  await f.freshOpen(saved.file, saved.doc, '04-reopened-saved');
  await f.same(finished);
  await verifyNative(finished, '04-reopened-native', 7);

  // Feature Editor on reopened document: edit Ø14 -> Ø16 (radius = 8 mm).
  await f.openFeatureEditor(1);
  const diaInput = f.editor().getByLabel(/Diameter of point 2 about Y axis/);
  await diaInput.waitFor();
  assert.equal(Number(await diaInput.inputValue()), 14);
  await diaInput.fill('16');
  await diaInput.press('Enter');
  await f.page.waitForFunction(() => window.__studioDoc?.nodes?.[0]?.outline?.rules?.some(r => r.kind === 'adia' && r.value === 16));
  await f.ready();
  const afterFeatureEdit = await f.doc();
  approx(afterFeatureEdit.nodes[0].outline.points[1][0], 8, 1e-6);
  approx(afterFeatureEdit.nodes[0].outline.points[2][0], 8, 1e-6);
  assert.deepEqual(
    afterFeatureEdit.nodes[0].outline.rules.find(r => r.kind === 'adia'),
    { kind: 'adia', point: 1, axis: 'y', side: 1, value: 16 },
  );
  await verifyNative(afterFeatureEdit, '05-feature-edit-native', 8);
  await f.snapshot('05-reopened-feature-edit-16');
});
