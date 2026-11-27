import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const baseline = process.argv.includes('--baseline');
const pins = ['test/open-semicircle-radius-history-browser.mjs', 'test/flow-helper.mjs', 'src/sketch/openArcRadiusHistory.ts',
  'src/sketch/useSketchDraftHistory.ts', 'src/ui/SketchPanel.tsx'].map(p => 'apps/cad-studio/' + p);
pins.push('packages/barocss-cad-model/src/sketch/profile.ts');
const f = await createFlow({
  name: 'open-semicircle-radius-history', output: process.argv[2], envFrozen: 'D2040_SOURCE_FROZEN', initialFiles: pins, requiredFrozen: pins,
  qualification: 'Changing a major arc to the exact half-chord radius has its own draft history step.',
  limits: ['One independent XY Line–Line–Arc. No change to how a new edit chooses a branch once an arc is already a semicircle.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep, faceGeometry } from '@barocss/cad';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
console.log(JSON.stringify(partBreps(JSON.parse(readFileSync(process.argv[2], 'utf8'))).map(({ brep }) => ({
  valid: checkBrep(brep, { strict: true }).valid, bodies: brep.bodies.map(b => b.kind),
  volume: brepMassProperties(brep, 1).volume,
  cylinders: brep.faces.flatMap(face => { const g = faceGeometry(face); return g.kind === 'cylinder' ? [g] : []; }),
}))));
`,
});
const points = [[10, 10], [30, 10], [30, 30], [10, 30]];
const button = name => f.page.getByRole('button', { name, exact: true });
const radius = () => f.sketchPanel().getByRole('spinbutton', { name: 'Arc 3 radius', exact: true });
const near = (a, b, tol = 1e-7) => assert.ok(Number.isFinite(a) && Math.abs(a - b) < tol, `${a} vs ${b}`);
async function click(point) {
  const xy = await f.screenOf(point);
  await f.page.mouse.move(...xy, { steps: 4 });
  assert.ok(await f.page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('canvas.vp-canvas'), xy), xy);
  await f.page.mouse.click(...xy);
}
function curve() {
  return f.page.locator('.vp-overlay .sk-shape').evaluateAll(es => es.map(e => e.getAttribute('points')).filter(Boolean));
}
async function check(label, doc) {
  const rows = await f.inspect(label, doc);
  assert.equal(rows.length, 1);
  const [part] = rows;
  assert.equal(part.valid, true);
  assert.deepEqual(part.bodies, ['solid']);
  near(part.volume, 3 * (400 + 50 * Math.PI));
  assert.equal(part.cylinders.length, 1);
  const [g] = part.cylinders;
  near(g.r, 10); near(Math.hypot(g.c[0] - 20, g.c[1] - 30), 0); near(Math.abs(g.a[2]), 1);
  f.report.observations.push({ label, ...part });
}
await f.run(async () => {
  await f.newPage();
  await button('New part').click();
  await f.page.waitForFunction(() => window.__studioDoc.nodes.length === 0);
  await f.ready();
  const empty = await f.doc();
  await f.page.locator('.mode').getByRole('button', { name: 'Sketch', exact: true }).click();
  await f.sketchPanel().waitFor();
  await f.frame([[0, 0], [60, 63]]);
  await f.tool('Line', 'l'); await click(points[0]); await click(points[1]); await click(points[2]);
  await f.tool('Arc', 'a'); await click(points[3]); await click([20, 50]);
  async function draft(expected) {
    near(Number(await radius().inputValue()), expected, 1e-4);
    for (const [i, point] of points.entries()) for (const [j, axis] of ['X', 'Y'].entries()) {
      assert.equal(Number(await f.sketchPanel().getByLabel(`Point ${i+1} ${axis}`, { exact: true }).inputValue()), point[j]);
    }
    await f.same(empty);
  }
  const edit = async v => { await radius().fill(String(v)); await radius().blur(); };
  await draft(12.5);
  const authoredMajor = await curve();
  assert.ok(authoredMajor.length, 'actual sketch overlay is present');
  await edit(10); await draft(10);
  const half = await curve();
  assert.notDeepEqual(half, authoredMajor);
  if (baseline) {
    const undo = await button('Undo').isEnabled();
    if (undo) await button('Undo').click();
    const actual = await radius().count() ? Number(await radius().inputValue()) : null;
    assert.notEqual(actual, 12.5, 'prior history did not restore the former radius');
    f.report.observations.push({ label: 'prior numeric Undo missing', undo, actual });
    await f.snapshot('00-prior-undo-does-not-restore-major');
    return;
  }
  await button('Undo').click(); await draft(12.5);
  assert.deepEqual(await curve(), authoredMajor);
  await f.snapshot('01-undo-restores-major');
  assert.equal(await button('Redo').isEnabled(), true);
  await edit(9); await draft(12.5);
  for (const impossible of [1e16, 1e308]) {
    await edit(impossible); await draft(12.5);
    assert.deepEqual(await curve(), authoredMajor);
    assert.equal(await button('Redo').isEnabled(), true);
  }
  assert.equal(await button('Redo').isEnabled(), true);
  await button('Redo').click(); await draft(10);
  assert.deepEqual(await curve(), half);
  await f.snapshot('02-redo-restores-semicircle');
  await f.tool('Line', 'l'); await click(points[0]);
  const sketch = (await f.finishSketch('03-closed-semicircle')).doc;
  const [node] = sketch.nodes;
  assert.equal(node.profile, 'loop');
  assert.deepEqual(node.segments.map(s => s.start), points);
  assert.deepEqual(node.segments.map(s => s.kind), ['line', 'line', 'arc', 'line']);
  assert.deepEqual(node.segments[2].center, [20, 30]);
  assert.equal(node.segments[2].direction, 'ccw');
  await f.openExtrudeHud();
  const solid = (await f.applyExtrude({ distance: 3, previous: sketch, label: '04-extruded' })).doc;
  await check('native-applied', solid);
  await f.undo(); await f.same(sketch); await f.redo(); await f.same(solid);
  const saved = await f.save('semicircle-radius-history');
  const reopened = await f.freshOpen(saved.file, solid, '05-fresh-open');
  await check('native-reopened', reopened.doc);
});
