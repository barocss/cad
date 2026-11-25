import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const pins = [
  'apps/cad-studio/test/sketch-reference-dimensions-browser.mjs',
  'apps/cad-studio/src/ui/ConstraintTools.tsx',
  'apps/cad-studio/src/ui/ConstraintList.tsx',
  'apps/cad-studio/src/ui/SketchMarks.tsx',
  'apps/cad-studio/src/ui/constraints.css',
  'packages/barocss-cad-model/src/sketch/referenceDimensions.ts',
  'packages/barocss-cad-model/src/sketch/rules.ts',
  'packages/barocss-cad-model/src/sketch/loops.ts',
  'packages/barocss-cad-model/src/sketch/reopen.ts',
];

const f = await createFlow({
  name: 'sketch-reference-dimensions',
  output: process.argv[2],
  envFrozen: 'D2016_SOURCE_FROZEN',
  initialFiles: pins,
  requiredFrozen: pins,
  qualification: 'Persistent read-only sketch reference dimensions bound by stable side IDs: zero solver equation overhead, live update on width resize, Driving <-> Reference conversion with over-defined refusal, Undo/Redo, and .bcad Save/Open persistence.',
  limits: ['Closed numeric 30×40 rectangle on XY. Circles/arcs/angles/open chains/parameter-bound driven-sketch stay outside first scope.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { emptyDoc, withNode } from '@barocss/cad-model/engine/doc';
import { profileOf } from '@barocss/cad-model/sketch/loops';
import { rectangleOutline } from '@barocss/cad-model/sketch/select';
import { commitDimension } from '@barocss/cad-model/sketch/rules';
import { partSnapshot } from '@barocss/cad-model/engine/part';
import { checkBrep, massPropertiesOf } from '@barocss/cad';

const d = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (d.seed) {
  let shape = rectangleOutline({ kind: 'rectangle', a: [0, 0], b: [30, 40], ids: ['e1', 'e2', 'e3', 'e4'] });
  shape = commitDimension(shape, 'len0', 30).shape;
  shape = commitDimension(shape, 'len1', 40).shape;
  const p = profileOf([shape]);
  assert.ok('node' in p);
  console.log(JSON.stringify(withNode(withNode(emptyDoc(), p.node), { kind: 'extrude', sketch: 0, height: 5 })));
} else {
  console.log(JSON.stringify(partSnapshot(d).outputs.map(b => ({
    valid: checkBrep(b.brep, { strict: true }).valid,
    volume: massPropertiesOf(b).volume,
  }))));
}
`,
});

const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const approx = (a, b, tol = 1e-3) => assert.ok(Math.abs(a - b) <= tol, `expected ${b} ± ${tol}, got ${a}`);

await f.run(async () => {
  const seed = await f.inspect('seed', { seed: true });
  await f.newPage();
  await f.page.locator('input[aria-label="Model file"]').setInputFiles({
    name: 'sketch-reference-dims-seed.bcad',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(seed)),
  });
  await f.same(seed);
  await f.ready();

  // Open Edit sketch on locked 30x40 rectangle (0 DOF).
  await f.openFeatureEditor(1);
  await button('Edit sketch', f.editor()).click();
  await f.sketchPanel().waitFor();
  await f.frame([[0, 0], [30, 40]]);
  await f.sketchPanel().getByText('Fully defined', { exact: true }).waitFor();

  // 1) Pick opposite corners (0, 0) and (30, 40), add aligned Reference distance (50 mm).
  await f.tool('Select', 's');
  await f.worldClick([0, 0]);
  await f.page.keyboard.down('Shift');
  await f.worldClick([30, 40]);
  await f.page.keyboard.up('Shift');
  await button('Add reference distance', f.sketchPanel()).waitFor();
  await button('Add reference distance', f.sketchPanel()).click();

  // Verify read-only REF chip `(50)` on canvas, Fully defined unchanged, and sidebar row.
  await f.page.waitForFunction(() => document.querySelector('[data-dim-ref="ref1"] text')?.textContent?.trim() === '(50)');
  await f.sketchPanel().getByText('Fully defined', { exact: true }).waitFor();
  await f.sketchPanel().locator('[data-reference-id="ref1"]').getByText('(50) REF').waitFor();
  await f.snapshot('01-diagonal-ref-50');

  // Trying to make over-defined diagonal reference driving must be refused while keeping ref1 intact.
  await f.sketchPanel().locator('[data-reference-id="ref1"]').getByRole('button', { name: /Make .* driving/ }).click();
  await f.sketchPanel().getByText(/over-define/i).waitFor();
  assert.equal(await f.sketchPanel().locator('[data-reference-id="ref1"]').count(), 1);

  // 2) Convert driving Width (edge 1 = 30) -> Reference: DOF becomes 1, geometry unchanged!
  await f.sketchPanel().getByRole('button', { name: /^Convert Length edge 1 = 30 to reference$/ }).click();
  await f.sketchPanel().getByText(/1 DOF left/).waitFor();
  await f.sketchPanel().locator('[data-reference-id="ref2"]').getByText('(30) REF').waitFor();
  await f.snapshot('02-width-converted-to-ref');

  // Convert ref2 back to driving -> Fully defined again, ref2 removed, len0 restored!
  await f.sketchPanel().locator('[data-reference-id="ref2"]').getByRole('button', { name: /Make .* driving/ }).click();
  await f.sketchPanel().getByText('Fully defined', { exact: true }).waitFor();
  assert.equal(await f.sketchPanel().locator('[data-reference-id="ref2"]').count(), 0);
  assert.equal(await f.sketchPanel().locator('[data-reference-id="ref1"]').count(), 1);

  // 3) Finish sketch -> verify persistent compact rectangle with ref1 & exact 6000 mm^3 volume.
  const finished = (await f.finishSketch('03-finished-30x40')).doc;
  assert.equal(finished.nodes[0].profile, 'rectangle');
  assert.deepEqual(finished.nodes[0].outline.references, [{ id: 'ref1', kind: 'distance', aId: 'e1', bId: 'e3' }]);
  const n1 = await f.inspect('03-native-6000', finished);
  approx(n1[0].volume, 6000);

  // Undo / Redo at document level.
  await f.undo();
  await f.same(seed);
  await f.redo();
  await f.same(finished);

  // 4) Save .bcad -> fresh Open -> edit Width 30 -> 60 in Feature Editor -> verify volume 12000 & reopened diagonal `(72.11)`!
  const saved = await f.save('sketch-reference-dims');
  await f.freshOpen(saved.file, saved.doc, '04-reopened-saved');
  await f.same(finished);

  await f.openFeatureEditor(1);
  const widthInput = f.editor().getByLabel('Width', { exact: true });
  await widthInput.fill('60');
  await widthInput.press('Enter');
  await f.page.waitForFunction(() => window.__studioDoc?.nodes?.[0]?.max?.[0] === 60);
  await f.ready();
  const resized = await f.doc();
  const n2 = await f.inspect('05-native-12000', resized);
  approx(n2[0].volume, 12000);

  await f.openFeatureEditor(1);
  await button('Edit sketch', f.editor()).click();
  await f.sketchPanel().waitFor();
  await f.frame([[0, 0], [60, 40]]);
  await f.page.waitForFunction(() => document.querySelector('[data-dim-ref="ref1"] text')?.textContent?.trim() === '(72.11)');
  await f.sketchPanel().locator('[data-reference-id="ref1"]').getByText('(72.111) REF').waitFor();
  await f.snapshot('05-reopened-width-60-ref-72');
});
