import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
import { clickModelCommand } from './model-rail-helper.mjs';

const baseline = process.argv.includes('--baseline');
const f = await createFlow({
  name: 'joined-boss-pattern', output: process.argv[2], envFrozen: 'D2057_SOURCE_FROZEN',
  qualification: 'Create and edit three linked rectangular bosses on one original plate.',
  limits: ['One original rectangular plate, one rectangular boss with four upper fillets, one horizontal pattern.'],
  initialFiles: ['apps/cad-studio/test/joined-boss-pattern-browser.mjs',
    'packages/barocss-cad-model/src/app/bodyPatternCommands.ts', 'packages/barocss-cad-model/src/engine/part.ts',
    'packages/barocss-cad-model/src/engine/references.ts', 'apps/cad-studio/src/ui/NodeEditor.tsx',
    'packages/barocss-cad-model/src/engine/joinedBossPattern.ts'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
import { brepMassProperties, checkBrep, faceGeometry } from '@barocss/cad';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
console.log(JSON.stringify(partBreps(doc).map(({key, brep}) => ({
  key, report: checkBrep(brep, { strict: true }), volume: brepMassProperties(brep, 1).volume,
  points: brep.vertices.map(vertex => vertex.point),
  cylinders: brep.faces.flatMap(face => {
    const geometry = faceGeometry(face);
    return geometry.kind === 'cylinder' ? [{ name: face.name, ...geometry }] : [];
  }),
}))));
`,
});
const button = (name, root = f.page) => root.getByRole('button', { name, exact: true });
const hud = () => f.page.locator('.hud');
const field = (name, root = hud()) => root.getByLabel(name, { exact: true });
const row = key => f.page.locator(`button[data-browser-body-key="${key}"]`);
const stack = () => Promise.all(['Undo', 'Redo'].map(name => button(name).isEnabled()));
const near = (value, expected) => assert.ok(Math.abs(value - expected) < 1e-7, `${value} vs ${expected}`);
const state = (x = 10, width = 10, height = 6, radius = 1) => ({ x, width, height, radius });

async function view(name = 'Top') {
  await button(name, f.page.locator('.views')).click();
  const orthographic = button('Ortho');
  if (await orthographic.getAttribute('aria-pressed') !== 'true') await orthographic.click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
}
async function apply(previous) {
  await hud().locator('.status').filter({ hasText: /^preview$/ }).waitFor();
  await button('Apply', hud()).click();
  await f.changed(previous);
  return f.doc();
}
async function pickFilter(name) {
  const filter = button('Selection filter');
  for (let i = 0; i < 6 && !(await filter.innerText()).includes(name); i++) await filter.click();
  assert.ok((await filter.innerText()).includes(name));
}
async function verify(doc, label, { x, width, height, radius }) {
  const [body, ...other] = await f.inspect(label, doc);
  assert.equal(other.length, 0);
  assert.ok(body.report.valid, JSON.stringify(body.report.issues));
  assert.deepEqual([body.report.counts.bodies, body.report.counts.shells, body.report.topology[0].genus], [1, 1, 0]);
  const depth = 8;
  const one = height * width * depth - 2 * (width + depth) * (1 - Math.PI / 4) * radius ** 2
    + 4 * (5 / 3 - Math.PI / 2) * radius ** 3;
  near(body.volume, 25000 + 3 * one);
  near((await f.bodies()).bodies[0].volume, body.volume);
  assert.equal(body.cylinders.length, 12);
  for (let i = 0; i < 3; i++) {
    const min = x + 25 * i, max = min + width, top = 5 + height;
    const xs = body.points.filter(point => point[2] > 5 && point[0] >= min - 1e-8 && point[0] <= max + 1e-8).map(point => point[0]);
    near(Math.min(...xs), min);
    near(Math.max(...xs), max);
    const suffix = i ? `@${i}` : '';
    const cylinders = body.cylinders.filter(face => /^n4\.face#\d+(?:@\d+)?$/.test(face.name) && (i ? face.name.endsWith(suffix) : !face.name.includes('@')));
    assert.equal(cylinders.length, 4);
    const offsets = [[], []];
    for (const cylinder of cylinders) {
      const axis = Math.abs(cylinder.a[0]) > 0.99 ? 0 : 1;
      near(Math.abs(cylinder.a[axis]), 1);
      near(cylinder.a[2], 0);
      offsets[axis].push(cylinder.c[1 - axis]);
      near(cylinder.r, radius);
      near(cylinder.c[2], top - radius);
      assert.equal(cylinder.out, 1);
    }
    const expected = [[12 + radius, 20 - radius], [min + radius, max - radius]];
    for (const [axis, positions] of offsets.entries()) {
      positions.sort((a, b) => a - b);
      assert.equal(positions.length, 2);
      positions.forEach((position, i) => near(position, expected[axis][i]));
    }
  }
  f.report.observations.push({ label, x, width, height, radius, volume: body.volume });
  return body;
}
async function edit(index, name, value, previous, label) {
  await f.openFeatureEditor(index, label);
  await field(name, f.editor()).fill(String(value));
  return (await f.applyEditor(previous, label)).doc;
}
async function refused(index, name, value, previous, reason, label) {
  const originalHistory = await stack();
  await f.openFeatureEditor(index, label);
  if (index === 5) {
    assert.equal(await field('Distance mode', f.editor()).count(), 0);
    assert.deepEqual(await field('Direction', f.editor()).locator('option').evaluateAll(options => options.map(option => option.value)), ['x', 'y']);
  }
  await field(name, f.editor()).fill(String(value));
  await button('Apply', f.editor()).click();
  await f.editor().getByRole('status').filter({ hasText: reason }).waitFor();
  await f.same(previous);
  assert.deepEqual(await stack(), originalHistory);
  await f.snapshot(label);
  await f.closeEditor();
  await f.dismissToasts();
}
await f.run(async () => {
  await f.newPage();
  f.phase = 'Create the original 100 × 50 × 5 mm plate';
  await button('New part').click();
  await f.page.locator('canvas.vp-canvas').click({ position: { x: 300, y: 220 } });
  const empty = await f.doc();
  await f.page.keyboard.press('b');
  for (const [name, value] of [['Width X', 100], ['Depth Y', 50], ['Height Z', 5], ['At X', 0], ['At Y', 0], ['At Z', 0]]) {
    await field(name).fill(String(value));
  }
  const stock = await apply(empty);
  assert.equal(stock.nodes.length, 2);
  near((await f.bodies()).bodies[0].volume, 25000);
  await view();
  await pickFilter('Faces');
  await f.worldClick([50, 25, 5]);
  await f.page.waitForFunction(() => window.__studioSelection.selection.faces.length === 1);
  await button('Sketch', f.page.locator('.mode')).click();
  await f.sketchPanel().waitFor();
  await f.worldClick([10, 12, 5]);
  await f.worldClick([20, 20, 5]);
  assert.equal(await button('Add linear pattern', f.sketchPanel()).count(), 0);
  const { doc: sketch } = await f.finishSketch('01-single-boss-sketch');
  assert.equal(sketch.nodes[2].profile, 'rectangle');
  assert.deepEqual(sketch.nodes[2].on, { node: 1, side: 'solid' });
  await f.openExtrudeHud();
  const { doc: raised } = await f.applyExtrude({ previous: sketch, distance: 6, label: '02-seed' });
  await view();
  await pickFilter('Edges');
  for (const [i, point] of [[15, 12, 11], [20, 16, 11], [15, 20, 11], [10, 16, 11]].entries()) {
    if (i) await f.page.keyboard.down('Shift');
    try { await f.worldClick(point); } finally { if (i) await f.page.keyboard.up('Shift'); }
    await f.page.waitForFunction(count => window.__studioSelection.selection.edges.length === count, i + 1);
  }
  if (await button('Close chat').isVisible()) await button('Close chat').click();
  await f.command('Fillet');
  await field('Radius').fill('1');
  const seed = await apply(raised);
  assert.equal(seed.nodes[4].edges.length, 4);

  async function startPattern() {
    await row('b4').click();
    await clickModelCommand(f.page, 'Pattern', 'Linear pattern');
    await field('Spacing').fill('25');
    await field('Count').fill('3');
    if (!baseline) await field('Result').selectOption('join-plate');
  }
  await startPattern();
  if (!baseline) {
    await hud().locator('.status').filter({ hasText: /^preview$/ }).waitFor();
    await f.snapshot('03-preview');
    assert.deepEqual(await f.doc(), seed);
    const beforeCancel = await stack();
    await button('Cancel', hud()).click();
    await f.same(seed);
    assert.deepEqual(await stack(), beforeCancel);
    await startPattern();
  }
  let joined = await apply(seed);
  if (baseline) {
    await row('b1').click();
    await row('b5').click({ modifiers: ['Shift'] });
    await clickModelCommand(f.page, 'Combine', 'Union');
    await f.changed(joined);
    joined = await f.doc();
  }
  assert.deepEqual(joined.nodes[5], { id: 'n5', kind: 'linear-pattern', parent: { node: 4, side: 'solid' }, axis: 'x', spacing: 25, count: 3 });
  assert.equal(joined.nodes[6].kind, 'union');
  if (!baseline) assert.equal(joined.nodes[6].bossPattern, true);
  await verify(joined, 'joined-native', state());
  await view('Iso');
  await f.snapshot(baseline ? '03-generic-joined' : '03-joined-boss-pattern');

  if (baseline) {
    const outside = await edit(3, 'Corner X', 42, joined, 'baseline-outside-accepted');
    await verify(outside, 'baseline-outside-native', state(42));
    assert.equal(outside.nodes[2].max[0] - outside.nodes[2].min[0], 10);
    return;
  }

  const moved = await edit(3, 'Corner X', 12, joined, '04-position');
  await verify(moved, 'moved-native', state(12));
  const wider = await edit(3, 'Width', 12, moved, '05-width');
  await verify(wider, 'wider-native', state(12, 12));
  const taller = await edit(3, 'Distance', 8, wider, '06-height');
  await verify(taller, 'taller-native', state(12, 12, 8));
  const finished = await edit(4, 'Radius', 2, taller, '07-shared-radius');
  const finishedNative = await verify(finished, 'finished-native', state(12, 12, 8, 2));
  assert.deepEqual(finished.nodes[4].edges, joined.nodes[4].edges);
  assert.deepEqual(finished.nodes[5], joined.nodes[5]);
  assert.deepEqual(finished.nodes[6], joined.nodes[6]);
  assert.deepEqual(finished.nodes.slice(0, 2), stock.nodes);
  await f.undo();
  await f.same(taller);
  await refused(3, 'Corner X', 40, taller, /inside.*plate/i, '08-outside-refused');
  await refused(5, 'Spacing', 11, taller, /overlap or touch/i, '09-overlap-refused');
  await refused(4, 'Radius', 20, taller, /fillet|radius/i, '10-radius-refused');
  const beforeSuppression = await stack();
  await f.page.locator('.history .hs[data-node-index="4"]').click({ button: 'right' });
  await f.page.getByRole('menuitem', { name: 'Suppress', exact: true }).click();
  await f.page.getByRole('alert').filter({ hasText: /original rectangular boss.*Fillet edges/i }).waitFor();
  await f.same(taller);
  assert.deepEqual(await stack(), beforeSuppression);
  await f.snapshot('11-source-suppression-refused');
  await f.dismissToasts();
  await f.redo();
  await f.same(finished);

  const saved = await f.save('three-joined-bosses');
  const opened = await f.freshOpen(saved.file, finished, '12-fresh-open');
  assert.deepEqual(await verify(opened.doc, 'reopened-native', state(12, 12, 8, 2)), finishedNative);
  await f.snapshot('13-reopened-bosses');
});
