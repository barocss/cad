import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const pins = [
  'apps/cad-studio/test/sketch-linear-pattern-browser.mjs',
  'apps/cad-studio/src/ui/ConstraintTools.tsx',
  'apps/cad-studio/src/ui/SketchMarks.tsx',
  'packages/barocss-cad-model/src/sketch/linearPattern.ts',
  'packages/barocss-cad-model/src/sketch/rules.ts',
  'packages/barocss-cad-model/src/sketch/terms.ts',
  'packages/barocss-cad-model/src/sketch/loops.ts',
  'packages/barocss-cad-model/src/sketch/reopen.ts',
  'packages/barocss-cad-model/src/sketch/select.ts',
  'packages/barocss-cad-model/src/sketch/outlineFields.ts',
];

const f = await createFlow({
  name: 'sketch-linear-pattern',
  output: process.argv[2],
  envFrozen: 'D2025_SOURCE_FROZEN',
  initialFiles: pins,
  requiredFrozen: pins,
  qualification: 'Linear sketch circle pattern (#223) on [0,50]x[0,20] plate with seed (5,10) R=2, +X spacing 10 mm, count 3: copy k=2 X driving dimension 25->27 drives seed 5->7, count 3->2 refusal preserves accepted sketch, Sketch & Doc Undo/Redo, Finish -> native Extrude 3 holes (3000 - 36*pi mm^3), .bcad Save/Open, and post-Open Feature Editor 27->29 edit.',
  limits: ['1D linear circle patterns on a closed outline; count reduction atomic constraint drop, pattern delete/recreate non-reused ID sp2, and negative/malformed saved-file refusals are verified in model unit tests.'],
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
    points: [[0, 0], [50, 0], [50, 20], [0, 20]],
    hv: { h: [0, 2], v: [1, 3] },
    lengths: { 0: 50, 1: 20 },
    circles: [{ c: [5, 10], r: 2 }],
    rules: [{ kind: 'cdy', a: 0, circle: 0, value: 10 }],
  }]);
  assert.ok('node' in p);
  console.log(JSON.stringify(withNode(withNode(emptyDoc(), p.node), { kind: 'extrude', sketch: 0, height: 3 })));
} else {
  console.log(JSON.stringify(partSnapshot(d).outputs.map(b => {
    const seen = new Map();
    for (const face of b.brep.faces) {
      const g = faceGeometry(face);
      if (g.kind !== 'cylinder') continue;
      const key = Math.round(g.c[0] * 1e3) + ',' + Math.round(g.c[1] * 1e3);
      if (!seen.has(key)) seen.set(key, { x: g.c[0], y: g.c[1], r: g.r });
    }
    const cyls = [...seen.values()].sort((a, b) => a.x - b.x);
    const props = massPropertiesOf(b);
    return {
      valid: checkBrep(b.brep, { strict: true }).valid,
      count: b.bodyCount,
      volume: props.volume,
      cylinders: cyls,
    };
  })));
}
`,
});

const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const inline = () => f.page.locator('input.dim-edit');
const approx = (a, b, tol = 1e-3) => assert.ok(Math.abs(a - b) <= tol, `expected ${b} ± ${tol}, got ${a}`);

async function verifyNative(doc, label, expectedXs) {
  const rows = await f.inspect(label, doc);
  assert.equal(rows.length, 1);
  const b = rows[0];
  assert.ok(b.valid, `${label}: invalid B-rep`);
  assert.equal(b.count, 1);
  const expectedVolume = 50 * 20 * 3 - expectedXs.length * Math.PI * 2 * 2 * 3;
  approx(b.volume, expectedVolume, 1e-2);
  assert.equal(b.cylinders.length, expectedXs.length, `${label}: expected ${expectedXs.length} cylinder faces, got ${b.cylinders.length}`);
  expectedXs.forEach((x, idx) => {
    approx(b.cylinders[idx].x, x, 1e-4);
    approx(b.cylinders[idx].y, 10, 1e-4);
    approx(b.cylinders[idx].r, 2, 1e-4);
  });
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
    name: 'linear-pattern-seed.bcad',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(seed)),
  });
  await f.same(seed);
  await f.ready();
  await verifyNative(seed, '01-seed-native', [5]);

  // Enter Edit sketch on Extrude's sketch.
  await f.openFeatureEditor(1);
  await button('Edit sketch', f.editor()).click();
  await f.sketchPanel().waitFor();
  await f.frame([[-6, -4], [56, 26]]);

  // Select attached seed circle at (5, 10) and add +X linear pattern (spacing 10 mm, count 3).
  await f.tool('Select', 's');
  await f.worldClick([5, 10]);
  await button('Add linear pattern', f.sketchPanel()).waitFor();
  await button('Add linear pattern', f.sketchPanel()).click();
  await f.page.locator('[data-pattern-copy="sp1:1"]').waitFor();
  await f.page.locator('[data-pattern-copy="sp1:2"]').waitFor();

  // Select origin point (0, 0) + Shift-click derived copy #2 at (25, 10), then add Horizontal driving dim = 25.
  await f.worldClick([0, 0]);
  await f.page.keyboard.down('Shift');
  await f.worldClick([25, 10]);
  await f.page.keyboard.up('Shift');
  await button('Horizontal distance to pattern copy', f.sketchPanel()).waitFor();
  await button('Horizontal distance to pattern copy', f.sketchPanel()).click();
  await inline().waitFor();
  assert.equal(Number(await inline().inputValue()), 25);
  await inline().press('Enter');
  await inline().waitFor({ state: 'detached' });
  await waitDimChipText('pcdx0_sp1_2', '25');
  await f.snapshot('01-pattern-copy-constrained');

  // Edit copy #2 X dimension 25 -> 27 mm (drives seed X from 5 -> 7 mm).
  await editInlineDim('pcdx0_sp1_2', '27');
  await waitDimChipText('pcdx0_sp1_2', '27');
  await f.snapshot('02-copy-driven-27');

  // Refusal check: count 3 -> 2 while copy #2 is referenced must be refused and leave sketch untouched.
  const countInput = f.sketchPanel().getByLabel('Pattern sp1 count', { exact: true });
  await countInput.fill('2');
  await button('Update pattern sp1', f.sketchPanel()).click();
  await f.sketchPanel().getByText(/Cannot reduce pattern sp1 count to 2/i).waitFor();
  await button('Remove affected constraints and apply pattern change', f.sketchPanel()).waitFor();
  await button('Cancel pattern constraint removal', f.sketchPanel()).click();
  assert.equal(await f.page.locator('[data-pattern-copy="sp1:2"]').count(), 1);

  // Sketch-level Undo / Redo.
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.page.keyboard.press('Meta+z');
  await waitDimChipText('pcdx0_sp1_2', '25');
  await f.page.keyboard.press('Meta+Shift+z');
  await waitDimChipText('pcdx0_sp1_2', '27');

  // Finish sketch -> verify native Extrude with 3 holes at X = 7, 17, 27 and exact volume 3000 - 36*pi.
  const finished = (await f.finishSketch('03-finished-extrude-3holes')).doc;
  assert.equal(finished.nodes[0].holes.length, 3);
  assert.deepEqual(finished.nodes[0].sideTags.holes, [['e5'], ['sp1_k1'], ['sp1_k2']]);
  assert.deepEqual(finished.nodes[0].outline.patterns, [{ id: 'sp1', seedCircle: 0, axis: 'x', sign: 1, spacing: 10, count: 3 }]);
  await verifyNative(finished, '03-finished-native', [7, 17, 27]);

  // Document-level Undo / Redo.
  await f.undo();
  await f.same(seed);
  await f.redo();
  await f.same(finished);

  // Save .bcad -> fresh Open -> verify persistence & native 3-hole B-rep.
  const saved = await f.save('sketch-linear-pattern');
  await f.freshOpen(saved.file, saved.doc, '04-reopened-saved');
  await f.same(finished);
  await verifyNative(finished, '04-reopened-native', [7, 17, 27]);

  // Feature Editor on reopened document: edit copy #2 X 27 -> 29 mm => holes move to 9, 19, 29.
  await f.openFeatureEditor(1);
  const copyInput = f.editor().getByLabel(/Horizontal distance point 1 – pattern sp1 copy #2/);
  await copyInput.waitFor();
  assert.equal(Number(await copyInput.inputValue()), 27);
  await copyInput.fill('29');
  await copyInput.press('Enter');
  await f.page.waitForFunction(() => window.__studioDoc?.nodes?.[0]?.outline?.rules?.some(r => r.kind === 'pcdx' && r.value === 29));
  await f.ready();
  const afterFeatureEdit = await f.doc();
  approx(afterFeatureEdit.nodes[0].outline.circles[0].c[0], 9, 1e-5);
  await verifyNative(afterFeatureEdit, '05-feature-edit-native', [9, 19, 29]);
  await f.snapshot('04-reopened-feature-edit-29');
});
