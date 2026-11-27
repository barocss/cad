import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const baseline = process.argv.includes('--baseline');
const pins = ['apps/cad-studio/test/open-two-arc-radius-history-browser.mjs', 'apps/cad-studio/src/sketch/openArcRadiusHistory.ts',
  'apps/cad-studio/src/sketch/useSketchDraftHistory.ts', 'apps/cad-studio/src/sketch/draftHistory.ts', 'apps/cad-studio/src/ui/SketchPanel.tsx'];
const f = await createFlow({
  name: 'open-two-arc-radius-history', output: process.argv[2], envFrozen: 'D2039_SOURCE_FROZEN', initialFiles: pins, requiredFrozen: pins,
  qualification: 'Undo and Redo affect only the numerically edited arc in one new open Line–Arc–Line–Arc draft.',
  limits: ['Only one open five-point XY chain, disjoint circular segments without added constraints.'],
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
const points = [[10, 10], [30, 10], [30, 30], [10, 30], [10, 15]];
const button = name => f.page.getByRole('button', { name, exact: true });
const field = arc => f.sketchPanel().getByRole('spinbutton', { name: `Arc ${arc} radius`, exact: true });
const near = (a, b, tol = 1e-8) => assert.ok(Number.isFinite(a) && Math.abs(a - b) < tol, `${a} vs ${b}`);
async function click(point) {
  const pixel = await f.screenOf(point);
  await f.page.mouse.move(...pixel, { steps: 4 });
  assert.ok(await f.page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('canvas.vp-canvas'), pixel));
  await f.page.mouse.click(...pixel);
}
const segment = (a, r) => r * r * Math.asin(a / r) - a * Math.sqrt(r * r - a * a);
async function check(label, doc) {
  const rows = await f.inspect(label, doc);
  assert.equal(rows.length, 1);
  const [part] = rows;
  assert.equal(part.valid, true);
  assert.deepEqual(part.kind, ['solid']);
  // Finish quantizes closed-loop centers to 1e-6 mm; compare against independent unrounded geometry.
  near(part.volume, 3 * (400 + segment(10, 16) + segment(7.5, 10)), 3e-5);
  const cylinders = part.cylinders.sort((a, b) => a.r - b.r);
  assert.equal(cylinders.length, 2);
  for (const [i, [r, x, y]] of [[10, 10 + Math.sqrt(100 - 56.25), 22.5], [16, 30 - Math.sqrt(256 - 100), 20]].entries()) {
    const g = cylinders[i];
    near(g.r, r, 1e-6); near(Math.hypot(g.c[0] - x, g.c[1] - y), 0, 1e-6); near(Math.abs(g.a[2]), 1);
  }
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
  f.phase = 'author two arcs with unequal chords';
  await f.tool('Line', 'l'); await click(points[0]); await click(points[1]);
  await f.tool('Arc', 'a'); await click(points[2]); await click([35, 20]);
  await f.tool('Line', 'l'); await click(points[3]);
  await f.tool('Arc', 'a'); await click(points[4]); await click([6.25, 22.5]);
  async function radii(a, b) {
    near(Number(await field(2).inputValue()), a, 1e-4);
    near(Number(await field(4).inputValue()), b, 1e-4);
    for (const [i, point] of points.entries()) for (const [j, axis] of ['X', 'Y'].entries()) {
      assert.equal(Number(await f.sketchPanel().getByLabel(`Point ${i+1} ${axis}`, { exact: true }).inputValue()), point[j]);
    }
    await f.same(empty);
  }
  const edit = async (arc, radius) => { await field(arc).fill(String(radius)); await field(arc).blur(); };
  await radii(12.5, 9.375);
  await edit(2, 14); await radii(14, 9.375);
  await edit(4, 10); await radii(14, 10);
  await edit(2, 16); await radii(16, 10);
  if (baseline) {
    assert.equal(await button('Undo').isEnabled(), false, 'Exact prior source lacks a numeric Undo in this two-arc draft');
    await f.snapshot('00-prior-undo-disabled'); return;
  }
  f.phase = 'undo and redo each indexed radius separately';
  await button('Undo').click(); await radii(14, 10);
  await f.snapshot('01-undo-first-arc-keeps-second');
  assert.equal(await button('Redo').isEnabled(), true);
  await edit(4, 7); await radii(14, 10);
  assert.equal(await button('Redo').isEnabled(), true);
  await f.snapshot('02-impossible-radius-preserves-redo');
  await button('Undo').click(); await radii(14, 9.375);
  await button('Undo').click(); await radii(12.5, 9.375);
  for (const [a, b] of [[14, 9.375], [14, 10], [16, 10]]) {
    await button('Redo').click(); await radii(a, b);
  }
  await f.tool('Line', 'l'); await click(points[0]);
  const sketch = (await f.finishSketch('03-closed-sketch')).doc;
  const [node] = sketch.nodes;
  assert.equal(node.kind, 'sketch'); assert.equal(node.profile, 'loop');
  assert.deepEqual(node.segments.map(s => s.start), points);
  assert.deepEqual(node.segments.map(s => s.kind), ['line', 'arc', 'line', 'arc', 'line']);
  assert.equal(node.segments[1].direction, 'ccw'); assert.equal(node.segments[3].direction, 'ccw');
  await f.openExtrudeHud();
  const solid = (await f.applyExtrude({ distance: 3, previous: sketch, label: '04-extruded' })).doc;
  await check('native-accepted', solid);
  await f.undo(); await f.same(sketch); await f.redo(); await f.same(solid);
  const saved = await f.save('open-two-arc-radius-history');
  const reopened = await f.freshOpen(saved.file, solid, '05-fresh-open');
  await check('native-reopened', reopened.doc);
});
