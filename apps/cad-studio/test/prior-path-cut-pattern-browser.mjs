import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
import { clickModelCommand, modelRail } from './model-rail-helper.mjs';
import { choosePriorCutSource, inspectorSource, later, newest, older, shift, verifyPriorCut } from './prior-cut-pattern-browser-fixture.mjs';

const quadratic = process.argv.includes('--quadratic');
const quarter = process.argv.includes('--quarter');
const baseline = process.argv.includes('--baseline');
assert.ok(!baseline || quarter);
assert.ok(!quarter || !quadratic);
const curved = quadratic || quarter;
const third = curved || process.argv.includes('--three');
const stock = third ? [older, later, newest] : [older, later];
const spacing = curved ? 10 : third ? 20 : 16;
const revisedSpacing = curved ? 12 : third ? 22 : 14;
const points = quadratic ? [[0, 0, 0], [20, 20, 0]] : third ? [[0, 0, 0], [34, 0, 0], [34, 18, 0], [0, 18, 0]] : [[0, 0, 0], [16, 0, 0], [16, 24, 0]];

const f = await createFlow({
  name: 'prior-path-cut-pattern', output: process.argv[2], envFrozen: quarter ? 'D1872_SOURCE_FROZEN' : quadratic ? 'D1862_SOURCE_FROZEN' : third ? 'D1853_SOURCE_FROZEN' : 'D1832_SOURCE_FROZEN',
  qualification: `#25 repeat an earlier rectangular through-cut on a Studio-authored ${quarter ? 'quarter-circle' : quadratic ? 'quadratic' : 'straight-segment'} XY path.`,
  limits: ['One original rectangular stock, two or three full-height rectangular cuts, fixed orientation and a linked planar path.'],
  initialFiles: ['apps/cad-studio/test/prior-path-cut-pattern-browser.mjs', 'apps/cad-studio/test/prior-cut-pattern-browser-fixture.mjs',
    'apps/cad-studio/src/app/cutPatternSource.ts', 'packages/barocss-cad-model/src/app/commands.ts',
    'packages/barocss-cad-model/src/chat/part/features.ts', 'packages/barocss-cad-model/src/engine/curveFeaturePattern.ts',
    'packages/barocss-cad/src/features/curve-cut-pattern.ts', 'packages/barocss-cad/src/features/quadratic-cut-plan.ts', 'packages/barocss-cad/src/part/part-prior-rectangular-cut.ts'],
  inspectorSource,
});
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const field = (scope, name) => scope.getByLabel(name, { exact: true });
const phase = (scope, state) => scope.locator('.status').filter({ hasText: new RegExp(`^${state}$`) }).waitFor();
// Integrate 40·sqrt((1-t)²+t²) and invert it independently of the placement planner.
const lengthPrimitive = x => 5 * Math.SQRT2 * (x * Math.hypot(1, x) + Math.asinh(x));
function quadraticOffset(distance) {
  let lower = 0, upper = 1;
  for (let iteration = 0; iteration < 53; iteration++) {
    const t = (lower + upper) / 2;
    if (lengthPrimitive(2 * t - 1) - lengthPrimitive(-1) < distance) lower = t;
    else upper = t;
  }
  const t = (lower + upper) / 2;
  return [40 * t - 20 * t ** 2, 20 * t ** 2];
}
const quarterOffset = distance => [20 * Math.sin(distance / 20), 20 * (1 - Math.cos(distance / 20))];
const curveOffset = quarter ? quarterOffset : quadraticOffset;
const curveApertures = pitch => [pitch, 2 * pitch].map(distance => shift(older, ...curveOffset(distance)));
const positionTolerance = curved ? 1e-7 : 1e-8;
const apertures = curved ? [...stock, ...curveApertures(spacing)] : third ? [...stock, shift(older, 20, 0), shift(older, 34, 6)] : [...stock, shift(older, 16, 0), shift(older, 16, 16)];
const revisedApertures = curved ? [...stock, ...curveApertures(revisedSpacing)] : third ? [...stock, shift(older, 22, 0), shift(older, 34, 10)] : [...stock, shift(older, 14, 0), shift(older, 16, 12)];

async function createPath() {
  f.phase = 'Create the linked XY path through Sketch and Make curves';
  await button('Sketch', modelRail(f.page)).click();
  await f.sketchPanel().waitFor();
  await field(f.sketchPanel(), 'Sketch plane').selectOption('xy');
  if (quarter) {
    const center = [6, 24], start = [6, 4], end = [26, 24];
    await f.frame([center, start, end]);
    await f.tool('Centre arc', 'q');
    await f.worldClick(center);
    await f.worldClick(start);
    for (const point of [[18, 8], [22, 12], end]) {
      const pixel = await f.screenOf(point);
      await f.page.mouse.move(...pixel, { steps: 3 });
    }
    await f.worldClick(end);
    assert.equal(Number(await field(f.sketchPanel(), 'Arc 1 radius').inputValue()), 20);
    await button('Make curves', f.sketchPanel()).click();
    await f.page.waitForFunction(() => window.__studioDoc.direct?.objects.length === 1);
    await f.ready();
    const { doc } = await f.snapshot('01-path-made-in-studio'), objectId = doc.direct.objects[0].id;
    const raw = await f.inspect('authored-quarter', { pathDocument: doc, objectId, rawPath: true });
    assert.deepEqual([raw.degree, raw.knots, raw.weights], [2, [0, 0, 0, 1, 1, 1], [1, Math.SQRT1_2, 1]]);
    assert.deepEqual(raw.controlPoints, [[6, 4, 0], [26, 4, 0], [26, 24, 0]]);
    return { doc, objectId };
  }
  await button('Line').click();
  await f.page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  for (const point of points) {
    const pixel = await f.page.evaluate(world => window.__studioScreenOf(world), point);
    assert.ok(pixel, 'Path point is in the sketch viewport');
    await f.page.mouse.click(pixel[0], pixel[1]);
  }
  await button('Select').click();
  await button('Make curves').click();
  await f.page.waitForFunction(() => window.__studioDoc.direct?.objects.length === 1);
  await f.ready();
  const { doc } = await f.snapshot('01-path-made-in-studio'), objectId = doc.direct.objects[0].id;
  const raw = await f.inspect('authored-path', { pathDocument: doc, objectId });
  const poles = [points[0]], knots = [0, 0, 0];
  points.slice(1).forEach((end, i) => {
    poles.push(points[i].map((value, axis) => (value + end[axis]) / 2), end);
    knots.push(i + 1, i + 1);
  });
  knots.push(points.length - 1);
  assert.deepEqual([raw.degree, raw.knots, raw.weights], [2, knots, poles.map(() => 1)]);
  assert.deepEqual(raw.controlPoints, poles);
  if (!quadratic) return { doc, objectId };
  f.phase = 'Edit the real Direct middle control point';
  const selectPath = async () => {
    await f.page.locator('.ol.direct').filter({ hasText: doc.direct.objects[0].name }).click();
    const direct = f.page.getByRole('complementary', { name: 'Direct geometry' });
    await field(direct, 'Control point').selectOption('1');
    return direct;
  };
  let before = doc;
  for (const [axis, value] of [['X', 20], ['Y', 0]]) {
    const direct = await selectPath(), input = field(direct, axis);
    await input.fill(String(value));
    await input.press('Enter');
    await f.changed(before);
    before = await f.doc();
  }
  const authored = await f.inspect('authored-quadratic', { pathDocument: before, objectId });
  assert.deepEqual(authored.controlPoints, [[0, 0, 0], [20, 0, 0], [20, 20, 0]]);
  assert.deepEqual([authored.degree, authored.knots, authored.weights], [2, [0, 0, 0, 1, 1, 1], [1, 1, 1]]);
  await f.snapshot('01a-authored-quadratic');
  return { doc: before, objectId };
}

await f.run(async () => {
  const seed = await f.inspect('seed', { third });
  await f.newPage();
  await field(f.page, 'Model file').setInputFiles({ name: 'path-cut-stock.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) });
  await f.same(seed);
  await button('Top', f.page.locator('.views')).click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  const { doc: source, objectId } = await createPath();
  assert.deepEqual(source.nodes, seed.nodes);
  const browser = f.page.getByRole('complementary', { name: 'Browser', exact: true });
  await button('Show its features', browser).click();
  await verifyPriorCut(f, 'original-cuts', source, stock);

  const currentSpacing = third ? 8 : 16;
  const open = async (entry, count) => {
    await choosePriorCutSource(f, entry);
    await clickModelCommand(f.page, 'Pattern', 'Path cut pattern');
    const panel = f.page.getByRole('dialog', { name: 'Path cut pattern', exact: true });
    await panel.getByText(entry ? 'Subtract 1 (n4)' : third ? 'Subtract 3 (n10)' : 'Subtract 2 (n7)', { exact: true }).waitFor();
    if (baseline) return panel;
    await field(panel, 'Path').selectOption(objectId);
    await field(panel, 'Count').fill(String(count));
    await field(panel, 'Spacing').fill(String(entry ? spacing : currentSpacing));
    return panel;
  };
  const apply = async (panel, label, earlier) => {
    await phase(panel, 'preview');
    await f.same(source);
    await button('Apply', panel).click();
    await f.changed(source);
    const { doc } = await f.snapshot(label), node = doc.nodes.at(-1);
    assert.deepEqual(doc.nodes.slice(0, -1), source.nodes);
    assert.deepEqual(doc.direct, source.direct);
    assert.deepEqual(node.path, { objectId });
    assert.deepEqual(node.parent, { node: source.nodes.length - 1, side: 'solid' });
    assert.deepEqual(node.source, earlier ? { node: 4, side: 'solid' } : undefined);
    assert.deepEqual([node.kind, node.spacing, node.count], ['curve-feature-pattern', earlier ? spacing : currentSpacing, earlier ? 3 : 2]);
    return doc;
  };
  if (baseline) {
    const panel = await open('Browser', 3);
    assert.equal(await field(panel, 'Path').locator(`option[value="${objectId}"]`).count(), 0);
    assert.ok(await button('Apply', panel).isDisabled());
    await f.same(source);
    await f.snapshot('02-authored-quarter-not-offered');
    f.report.observations.push({ quarterPathAdmission: 'FAIL: exact authored quarter omitted from the Path selector' });
    return;
  }
  const control = await apply(await open(null, 2), '02-path-current-control', false);
  const currentOffset = curved ? curveOffset(currentSpacing) : [currentSpacing, 0];
  await verifyPriorCut(f, 'current-cut-path', control, [...stock, shift(third ? newest : later, ...currentOffset)], positionTolerance);
  await f.undo();
  await f.same(source);

  const panel = await open('Browser', 3), undo = await button('Undo').getAttribute('data-tip');
  const attempts = curved ? [[17, 3, /exceeds.*path length/i, '03-curved-path-too-short']]
    : third ? [[44, 3, /exceeds.*path length/i, '03-path-too-short'], [32, 3, /disjoint from the newer cut/, '03a-path-third-collision'], [86, 2, /disjoint from the newer cut/, '03b-path-second-collision']]
    : [[21, 3, /exceeds.*path length/i, '03-path-too-short'], [3, 3, /disjoint from the newer cut/, '03-path-overlap-refused']];
  for (const [attempt, count, reason, label] of attempts) {
    await field(panel, 'Count').fill(String(count));
    await phase(panel, 'preview');
    await field(panel, 'Spacing').fill(String(attempt));
    await phase(panel, 'refused');
    const error = panel.locator('.hud-error'), details = error.locator('details:not([open]) > summary');
    if (await details.count()) await details.click();
    assert.match(await error.innerText(), reason);
    assert.ok(await button('Apply', panel).isDisabled());
    await f.same(source);
    assert.equal(await button('Undo').getAttribute('data-tip'), undo);
    await f.snapshot(label);
    await field(panel, 'Spacing').fill(String(spacing));
  }
  await field(panel, 'Count').fill('3');
  const fromBrowser = await apply(panel, '04-path-earlier-applied', true);
  await verifyPriorCut(f, 'earlier-cut-spacing', fromBrowser, apertures, positionTolerance);
  await f.undo();
  await f.same(source);
  const history = await apply(await open('History', 3), '05-path-history-applied', true);
  assert.deepEqual(history, fromBrowser);

  await f.openFeatureEditor(source.nodes.length, 'path cut spacing');
  await f.editor().getByText('Subtract 1 (n4)', { exact: true }).waitFor();
  await field(f.editor(), 'Spacing').fill(String(revisedSpacing));
  const edited = (await f.applyEditor(history, '06-path-spacing-edited')).doc;
  assert.deepEqual(edited.nodes.at(-1), { ...history.nodes.at(-1), spacing: revisedSpacing });
  await verifyPriorCut(f, 'earlier-cut-revised-spacing', edited, revisedApertures, positionTolerance);
  await f.undo();
  await f.same(history);
  await f.redo();
  await f.same(edited);
  const saved = await f.save('path-earlier-cut');
  await f.freshOpen(saved.file, edited, 'path-saved-fresh-open');
  await button('Top', f.page.locator('.views')).click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await verifyPriorCut(f, 'earlier-cut-after-open', edited, revisedApertures, positionTolerance);
  await f.openFeatureEditor(source.nodes.length, 'path and earlier cut links');
  await f.editor().getByText('Subtract 1 (n4)', { exact: true }).waitFor();
  assert.equal(await field(f.editor(), 'Path').inputValue(), objectId);
  await f.snapshot('07-path-reopened-source');
  await f.closeEditor();
  await f.same(edited);
});
