import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
import { clickModelCommand, modelRail } from './model-rail-helper.mjs';
import { choosePriorCutSource, inspectorSource, later, older, shift, verifyPriorCut } from './prior-cut-pattern-browser-fixture.mjs';

const f = await createFlow({
  name: 'prior-path-cut-pattern', output: process.argv[2], envFrozen: 'D1832_SOURCE_FROZEN',
  qualification: '#25 repeat the direct earlier rectangular through-cut on a Studio-authored straight-segment XY path.',
  limits: ['One original rectangular stock, two disjoint full-height rectangular cuts, fixed orientation and a linked two-span planar path.'],
  initialFiles: [import.meta.filename, 'apps/cad-studio/test/prior-cut-pattern-browser-fixture.mjs',
    'apps/cad-studio/src/app/cutPatternSource.ts', 'packages/barocss-cad-model/src/app/commands.ts',
    'packages/barocss-cad-model/src/chat/part/features.ts', 'packages/barocss-cad-model/src/engine/curveFeaturePattern.ts',
    'packages/barocss-cad/src/features/curve-cut-pattern.ts', 'packages/barocss-cad/src/part/part-prior-rectangular-cut.ts'],
  inspectorSource,
});
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const field = (scope, name) => scope.getByLabel(name, { exact: true });
const phase = (scope, state) => scope.locator('.status').filter({ hasText: new RegExp(`^${state}$`) }).waitFor();
const apertures16 = [older, later, shift(older, 16, 0), shift(older, 16, 16)];
const apertures14 = [older, later, shift(older, 14, 0), shift(older, 16, 12)];

async function createPath() {
  f.phase = 'Create the linked XY path through Sketch and Make curves';
  await button('Sketch', modelRail(f.page)).click();
  await f.sketchPanel().waitFor();
  await field(f.sketchPanel(), 'Sketch plane').selectOption('xy');
  await button('Line').click();
  await f.page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  for (const point of [[0, 0, 0], [16, 0, 0], [16, 24, 0]]) {
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
  assert.deepEqual([raw.degree, raw.knots, raw.weights], [2, [0, 0, 0, 1, 1, 2, 2, 2], [1, 1, 1, 1, 1]]);
  assert.deepEqual(raw.controlPoints, [[0, 0, 0], [8, 0, 0], [16, 0, 0], [16, 12, 0], [16, 24, 0]]);
  return { doc, objectId };
}

await f.run(async () => {
  const seed = await f.inspect('seed', {});
  await f.newPage();
  await field(f.page, 'Model file').setInputFiles({ name: 'two-rectangular-through-cuts.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) });
  await f.same(seed);
  await button('Top', f.page.locator('.views')).click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  const { doc: source, objectId } = await createPath();
  assert.deepEqual(source.nodes, seed.nodes);
  const browser = f.page.getByRole('complementary', { name: 'Browser', exact: true });
  await button('Show its features', browser).click();
  await verifyPriorCut(f, 'original-two-cuts', source, [older, later]);

  const open = async (entry, count) => {
    await choosePriorCutSource(f, entry);
    await clickModelCommand(f.page, 'Pattern', 'Path cut pattern');
    const panel = f.page.getByRole('dialog', { name: 'Path cut pattern', exact: true });
    await panel.getByText(entry ? 'Subtract 1 (n4)' : 'Subtract 2 (n7)', { exact: true }).waitFor();
    await field(panel, 'Path').selectOption(objectId);
    await field(panel, 'Count').fill(String(count));
    await field(panel, 'Spacing').fill('16');
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
    assert.deepEqual(node.parent, { node: 7, side: 'solid' });
    assert.deepEqual(node.source, earlier ? { node: 4, side: 'solid' } : undefined);
    assert.deepEqual([node.kind, node.spacing, node.count], ['curve-feature-pattern', 16, earlier ? 3 : 2]);
    return doc;
  };
  const control = await apply(await open(null, 2), '02-path-current-control', false);
  await verifyPriorCut(f, 'current-cut-path', control, [older, later, shift(later, 16, 0)]);
  await f.undo();
  await f.same(source);

  const panel = await open('Browser', 3), undo = await button('Undo').getAttribute('data-tip');
  for (const [spacing, reason] of [[21, /exceeds.*path length/i], [3, /disjoint from the newer cut/]]) {
    await field(panel, 'Spacing').fill(String(spacing));
    await phase(panel, 'refused');
    const error = panel.locator('.hud-error'), details = error.locator('details:not([open]) > summary');
    if (await details.count()) await details.click();
    assert.match(await error.innerText(), reason);
    assert.ok(await button('Apply', panel).isDisabled());
    await f.same(source);
    assert.equal(await button('Undo').getAttribute('data-tip'), undo);
  }
  await f.snapshot('03-path-overlap-refused');
  await field(panel, 'Spacing').fill('16');
  const fromBrowser = await apply(panel, '04-path-earlier-applied', true);
  await verifyPriorCut(f, 'earlier-cut-spacing-16', fromBrowser, apertures16);
  await f.undo();
  await f.same(source);
  const history = await apply(await open('History', 3), '05-path-history-applied', true);
  assert.deepEqual(history, fromBrowser);

  await f.openFeatureEditor(source.nodes.length, 'path cut spacing');
  await f.editor().getByText('Subtract 1 (n4)', { exact: true }).waitFor();
  await field(f.editor(), 'Spacing').fill('14');
  const edited = (await f.applyEditor(history, '06-path-spacing-edited')).doc;
  assert.deepEqual(edited.nodes.at(-1), { ...history.nodes.at(-1), spacing: 14 });
  await verifyPriorCut(f, 'earlier-cut-spacing-14', edited, apertures14);
  await f.undo();
  await f.same(history);
  await f.redo();
  await f.same(edited);
  const saved = await f.save('path-earlier-cut');
  await f.freshOpen(saved.file, edited, 'path-saved-fresh-open');
  await button('Top', f.page.locator('.views')).click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await verifyPriorCut(f, 'earlier-cut-after-open', edited, apertures14);
  await f.openFeatureEditor(source.nodes.length, 'path and earlier cut links');
  await f.editor().getByText('Subtract 1 (n4)', { exact: true }).waitFor();
  assert.equal(await field(f.editor(), 'Path').inputValue(), objectId);
  await f.snapshot('07-path-reopened-source');
  await f.closeEditor();
  await f.same(edited);
});
