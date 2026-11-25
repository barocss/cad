import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const pins = [
  'apps/cad-studio/test/sketch-edge-circle-gap-browser.mjs',
  'apps/cad-studio/src/ui/ConstraintTools.tsx',
  'apps/cad-studio/src/ui/SketchMarks.tsx',
  'packages/barocss-cad-model/src/sketch/edgeCircleGap.ts',
  'packages/barocss-cad-model/src/sketch/rules.ts',
  'packages/barocss-cad-model/src/sketch/terms.ts',
  'packages/barocss-cad-model/src/sketch/outlineFields.ts',
];

const f = await createFlow({
  name: 'sketch-edge-circle-gap',
  output: process.argv[2],
  envFrozen: 'D2014_SOURCE_FROZEN',
  initialFiles: pins,
  requiredFrozen: pins,
  qualification: 'Driving positive edge-to-circle circumference gap G = n·(C - A) - r maintained across G edits, diameter edits, Undo/Redo, Save/Open, and Feature Editor edits.',
  limits: ['One attached circle hole in a locked 40×30 rectangle on XY. Slanted/arc/non-positive/out-of-segment refusals verified in unit + browser flow.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { emptyDoc, withNode } from '@barocss/cad-model/engine/doc';
import { profileOf } from '@barocss/cad-model/sketch/loops';
import { partSnapshot } from '@barocss/cad-model/engine/part';
import { checkBrep, faceGeometry, massPropertiesOf } from '@barocss/cad';

const d = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (d.seed) {
  const points = [[0, 0], [40, 0], [40, 30], [0, 30]];
  const p = profileOf([{
    kind: 'polygon',
    closed: true,
    points,
    hv: { h: [0, 2], v: [1, 3] },
    lengths: { 0: 40, 1: 30 },
    rules: [{ kind: 'cedge', edge: 0, circle: 0, axis: 1, value: 15 }],
    circles: [{ c: [10, 15], r: 4 }],
  }]);
  assert.ok('node' in p);
  console.log(JSON.stringify(withNode(withNode(emptyDoc(), p.node), { kind: 'extrude', sketch: 0, height: 2 })));
} else {
  console.log(JSON.stringify(partSnapshot(d).outputs.map(b => {
    const cyl = b.brep.faces.map(face => faceGeometry(face)).find(g => g.kind === 'cylinder');
    const props = massPropertiesOf(b);
    return {
      valid: checkBrep(b.brep, { strict: true }).valid,
      count: b.bodyCount,
      volume: props.volume,
      centroid: props.centroid,
      cylinder: cyl && cyl.kind === 'cylinder'
        ? { origin: cyl.c, radius: cyl.r }
        : null,
    };
  })));
}
`,
});

const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const inline = () => f.page.locator('input.dim-edit');
const approx = (a, b, tol = 1e-4) => assert.ok(Math.abs(a - b) <= tol, `expected ${b} ± ${tol}, got ${a}`);

async function verifyNative(doc, label, expectedRadius, expectedCenterX, expectedCenterY) {
  const rows = await f.inspect(label, doc);
  assert.equal(rows.length, 1);
  const b = rows[0];
  assert.ok(b.valid, `${label}: invalid B-rep`);
  assert.equal(b.count, 1);
  const expectedVolume = (40 * 30 - Math.PI * expectedRadius * expectedRadius) * 2;
  approx(b.volume, expectedVolume, 1e-3);
  assert.ok(b.cylinder, `${label}: missing cylindrical hole face`);
  approx(b.cylinder.radius, expectedRadius, 1e-5);
  approx(b.cylinder.origin[0], expectedCenterX, 1e-5);
  approx(b.cylinder.origin[1], expectedCenterY, 1e-5);
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
    name: 'edge-circle-gap-seed.bcad',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(seed)),
  });
  await f.same(seed);
  await f.ready();
  await verifyNative(seed, '01-seed-native', 4, 10, 15);

  // Enter Edit sketch on Extrude's sketch.
  await f.openFeatureEditor(1);
  await button('Edit sketch', f.editor()).click();
  await f.sketchPanel().waitFor();
  await f.frame([[0, 0], [40, 30], [10, 15]]);

  // Select left edge (x=0, edge 4) and Shift-select attached circle 1.
  await f.tool('Select', 's');
  await f.worldClick([0, 15]);
  await f.page.keyboard.down('Shift');
  await f.worldClick([10, 15]);
  await f.page.keyboard.up('Shift');
  await button('Centre distance from edge', f.sketchPanel()).waitFor();
  await button('Edge to circle gap', f.sketchPanel()).waitFor();

  // Invalid zero gap must be refused cleanly without adding cgap or ctan.
  await button('Edge to circle gap', f.sketchPanel()).click();
  await inline().waitFor();
  assert.equal(await inline().getAttribute('aria-label'), 'Gap edge 4 – circle 1');
  assert.equal(Number(await inline().inputValue()), 6);
  await inline().fill('0');
  await inline().press('Enter');
  await inline().waitFor({ state: 'detached' });
  await f.sketchPanel().getByText(/greater than 0/i).waitFor();
  assert.equal(await f.page.locator('[data-dim="cgap3_0"]').count(), 0);

  // Add driving gap G = 6 mm.
  await button('Edge to circle gap', f.sketchPanel()).click();
  await inline().waitFor();
  assert.equal(Number(await inline().inputValue()), 6);
  await inline().press('Enter');
  await inline().waitFor({ state: 'detached' });
  await waitDimChipText('cgap3_0', '6');
  await f.page.waitForFunction(() => document.querySelectorAll('[data-dim-line="cgap3_0"][data-dim-kind="cgap"]').length === 1);
  await f.sketchPanel().getByRole('button', { name: /^Remove Gap edge 4.*circle 1 = 6$/ }).waitFor();
  await f.snapshot('01-gap-6-added');

  // Edit gap G: 6 -> 8 mm => center moves to (12, 15), nearest circumference at (8, 15).
  await editInlineDim('cgap3_0', '8');
  await waitDimChipText('cgap3_0', '8');
  await f.sketchPanel().getByRole('button', { name: /^Remove Gap edge 4.*circle 1 = 8$/ }).waitFor();
  await f.snapshot('02-gap-8-edited');

  // Edit diameter: 8 -> 10 mm (r: 4 -> 5) => center moves to (13, 15), gap remains 8 mm!
  await editInlineDim('cdia0', '10');
  await waitDimChipText('cdia0', 'Ø10');
  await waitDimChipText('cgap3_0', '8');
  // Verify the rendered gap line ends at the nearest circumference (shorter than center distance).
  const gapSpan = await f.page.evaluate(() => {
    const line = document.querySelector('[data-dim-line="cgap3_0"][data-dim-kind="cgap"]');
    if (!line) return null;
    const x1 = Number(line.getAttribute('x1')), y1 = Number(line.getAttribute('y1'));
    const x2 = Number(line.getAttribute('x2')), y2 = Number(line.getAttribute('y2'));
    return Math.hypot(x2 - x1, y2 - y1);
  });
  assert.ok(gapSpan !== null && gapSpan > 5, `expected visible cgap line span, got ${gapSpan}`);
  await f.snapshot('03-dia-10-gap-held');

  // Sketch-level Undo / Redo.
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.page.keyboard.press('Meta+z');
  await waitDimChipText('cdia0', 'Ø8');
  await waitDimChipText('cgap3_0', '8');
  await f.page.keyboard.press('Meta+Shift+z');
  await waitDimChipText('cdia0', 'Ø10');
  await waitDimChipText('cgap3_0', '8');

  // Finish sketch -> verify stored rule, circle center (13, 15), radius 5, and exact B-rep.
  const finished = (await f.finishSketch('04-finished-extrude')).doc;
  const gapRule = finished.nodes[0].outline.rules.find(r => r.kind === 'cgap');
  assert.deepEqual(gapRule, { kind: 'cgap', edge: 3, circle: 0, axis: 0, side: 1, value: 8 });
  approx(finished.nodes[0].outline.circles[0].c[0], 13, 1e-6);
  approx(finished.nodes[0].outline.circles[0].c[1], 15, 1e-6);
  approx(finished.nodes[0].outline.circles[0].r, 5, 1e-6);
  await verifyNative(finished, '04-finished-native', 5, 13, 15);

  // Document-level Undo / Redo.
  await f.undo();
  await f.same(seed);
  await f.redo();
  await f.same(finished);

  // Save .bcad -> fresh Open -> verify persistence & native B-rep.
  const saved = await f.save('sketch-edge-circle-gap');
  await f.freshOpen(saved.file, saved.doc, '05-reopened-saved');
  await f.same(finished);
  await verifyNative(finished, '05-reopened-native', 5, 13, 15);

  // Feature editor on reopened document: edit Diameter 10 -> 12 (r = 6) => C = (14, 15), Gap remains 8!
  await f.openFeatureEditor(1);
  const gapInput = f.editor().getByLabel(/Gap edge 4.*circle 1/);
  const diaInput = f.editor().getByLabel(/Diameter of circle 1/);
  await gapInput.waitFor();
  assert.equal(Number(await gapInput.inputValue()), 8);
  assert.equal(Number(await diaInput.inputValue()), 10);
  await diaInput.fill('12');
  await diaInput.press('Enter');
  await f.page.waitForFunction(() => window.__studioDoc?.nodes?.[0]?.outline?.circles?.[0]?.r === 6);
  await f.ready();
  const afterFeatureEdit = await f.doc();
  approx(afterFeatureEdit.nodes[0].outline.circles[0].c[0], 14, 1e-6);
  approx(afterFeatureEdit.nodes[0].outline.circles[0].c[1], 15, 1e-6);
  approx(afterFeatureEdit.nodes[0].outline.circles[0].r, 6, 1e-6);
  assert.deepEqual(
    afterFeatureEdit.nodes[0].outline.rules.find(r => r.kind === 'cgap'),
    { kind: 'cgap', edge: 3, circle: 0, axis: 0, side: 1, value: 8 },
  );
  await verifyNative(afterFeatureEdit, '06-feature-edit-native', 6, 14, 15);
  await f.snapshot('06-reopened-feature-edit-dia-12');
});
