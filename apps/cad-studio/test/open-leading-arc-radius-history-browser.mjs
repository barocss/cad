import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const baseline = process.argv.includes('--baseline');
const pins = ['apps/cad-studio/test/open-leading-arc-radius-history-browser.mjs', 'apps/cad-studio/src/sketch/openArcRadiusHistory.ts',
  'apps/cad-studio/src/sketch/useSketchDraftHistory.ts', 'apps/cad-studio/src/sketch/draftHistory.ts', 'apps/cad-studio/src/ui/SketchPanel.tsx'];
const f = await createFlow({
  name: 'open-leading-arc-radius-history', output: process.argv[2], envFrozen: 'D2045_SOURCE_FROZEN', initialFiles: pins, requiredFrozen: pins,
  qualification: 'Undo and Redo affect the numeric radius of a leading arc in one new open Arc–Line–Line draft.',
  limits: ['Only one open four-point XY chain with no added constraints.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep, faceGeometry } from '@barocss/cad';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
console.log(JSON.stringify(partBreps(JSON.parse(readFileSync(process.argv[2], 'utf8'))).map(({ brep }) => ({
  valid: checkBrep(brep, { strict: true }).valid, kind: brep.bodies.map(b => b.kind),
  volume: brepMassProperties(brep, 1).volume,
  cylinders: brep.faces.flatMap(face => { const g = faceGeometry(face); return g.kind === 'cylinder' ? [g] : []; }),
}))));
`,
});

const points = [[30, 30], [10, 30], [10, 10], [30, 10]];
const button = name => f.page.getByRole('button', { name, exact: true });
const field = () => f.sketchPanel().getByRole('spinbutton', { name: 'Arc 1 radius', exact: true });
const near = (a, b, tol = 1e-7) => assert.ok(Number.isFinite(a) && Math.abs(a - b) < tol, `${a} vs ${b}`);
async function click(point) {
  const pixel = await f.screenOf(point);
  await f.page.mouse.move(...pixel, { steps: 4 });
  assert.ok(await f.page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('canvas.vp-canvas'), pixel));
  await f.page.mouse.click(...pixel);
}
async function checkNative(label, doc) {
  const [part, ...other] = await f.inspect(label, doc);
  assert.equal(other.length, 0);
  assert.equal(part.valid, true);
  assert.deepEqual(part.kind, ['solid']);
  near(part.volume, 3 * (400 + 225 * Math.asin(10/15) - 10 * Math.sqrt(125)), 3e-5);
  assert.equal(part.cylinders.length, 1);
  const [cylinder] = part.cylinders;
  near(cylinder.r, 15, 1e-6);
  near(Math.hypot(cylinder.c[0] - 20, cylinder.c[1] - (30 - Math.sqrt(125))), 0, 1e-6);
  near(Math.abs(cylinder.a[2]), 1);
  f.report.observations.push({ label, ...part });
}
await f.run(async () => {
  await f.newPage();
  f.page.setDefaultTimeout(12000);
  await button('New part').click();
  await f.page.waitForFunction(() => window.__studioDoc.nodes.length === 0);
  await f.ready();
  const empty = await f.doc();
  await f.page.locator('.mode').getByRole('button', { name: 'Sketch', exact: true }).click();
  await f.sketchPanel().waitFor();
  await f.frame([[0, 0], [55, 45]]);
  f.phase = 'author the leading arc and two subsequent lines';
  await f.tool('Arc', 'a');
  await click(points[0]); await click(points[1]); await click([20, 35]);
  await f.tool('Line', 'l'); await click(points[2]); await click(points[3]);
  async function state(radius) {
    near(Number(await field().inputValue()), radius, 1e-4);
    assert.equal(await f.sketchPanel().locator('input[aria-label^="Point "][aria-label$=" X"]').count(), points.length);
    for (const [i, point] of points.entries()) for (const [j, axis] of ['X', 'Y'].entries()) {
      assert.equal(Number(await f.sketchPanel().getByLabel(`Point ${i + 1} ${axis}`, { exact: true }).inputValue()), point[j]);
    }
    await f.same(empty);
  }
  async function edit(radius) { await field().fill(String(radius)); await field().blur(); }
  await state(12.5); await edit(15); await state(15);
  f.phase = 'Undo must restore radius without removing the last line';
  if (baseline) {
    if (await button('Undo').isEnabled()) await button('Undo').click();
    const pointsAfter = await f.sketchPanel().locator('input[aria-label^="Point "][aria-label$=" X"]').count();
    const radiusAfter = Number(await field().inputValue());
    assert.ok(pointsAfter !== 4 || radiusAfter !== 12.5, 'Prior unexpectedly restores the numeric edit exactly');
    f.report.observations.push({ label: 'prior', pointsAfter, radiusAfter });
    await f.snapshot('00-prior');
    return;
  }
  await button('Undo').click(); await state(12.5);
  await f.snapshot('01-undo');
  assert.equal(await button('Redo').isEnabled(), true);
  await edit(9); await state(12.5);
  assert.equal(await button('Redo').isEnabled(), true);
  await button('Redo').click(); await state(15);
  await f.snapshot('02-redo');
  await click(points[0]);
  const sketch = (await f.finishSketch('03-finished')).doc;
  const [node] = sketch.nodes;
  assert.equal(node.kind, 'sketch'); assert.equal(node.profile, 'loop');
  assert.deepEqual(node.segments.map(s => s.start), points);
  assert.deepEqual(node.segments.map(s => s.kind), ['arc', 'line', 'line', 'line']);
  assert.equal(node.segments[0].direction, 'ccw');
  await f.openExtrudeHud();
  const solid = (await f.applyExtrude({ distance: 3, previous: sketch, label: '04-extruded' })).doc;
  await checkNative('native', solid);
  await f.undo(); await f.same(sketch); await f.redo(); await f.same(solid);
  const saved = await f.save('leading-arc');
  const reopened = await f.freshOpen(saved.file, solid, '05-fresh-open');
  await checkNative('native-reopened', reopened.doc);
});
