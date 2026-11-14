import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
import { twoGuideInspector, verifyTwoGuideLoft } from './loft-two-guides-oracle.mjs';

const pins = ['apps/cad-studio/test/loft-two-guides-browser.mjs', 'apps/cad-studio/test/loft-two-guides-oracle.mjs', 'apps/cad-studio/src/ui/NodeEditor.tsx',
  'apps/cad-studio/src/ui/FeatureFailureNotice.tsx', 'apps/cad-studio/src/styles.css',
  'packages/barocss-cad-model/src/app/profileCommands.ts', 'packages/barocss-cad-model/src/app/editFields.ts',
  'packages/barocss-cad-model/src/app/profiles.ts',
  'packages/barocss-cad-model/src/engine/errors.ts',
  'packages/barocss-cad-model/src/engine/doc.ts', 'packages/barocss-cad-model/src/engine/part.ts',
  'packages/barocss-cad/src/features/loft.ts', 'packages/barocss-cad/src/features/loft-two-guides.ts',
  'packages/barocss-cad/src/part/part-profile-solid.ts'];
const f = await createFlow({
  name: 'loft-two-guides', envFrozen: 'D1275_SOURCE_FROZEN', output: process.argv[2],
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Create a two-guide Loft, identify each guide by its endpoints, refuse touching guides, edit each guide independently, and reopen the saved Studio document.',
  limits: ['Two congruent XY rectangles and two ordered quadratic Bézier rails with affine Z.'],
  inspectorSource: twoGuideInspector,
});
const checkHidden = process.argv.includes('--check-hidden');
const bezier = (name, x0, midX, x1, end = 12) => `@model ${name} {
  version: 0; length-unit: mm;
  @curve #curve { type: nurbs; degree: 2; knots: [0,0,0,1,1,1]; control-points:
    [[${x0},0,0],[${midX},0,6],[${x1},0,${end}]]; weights: [1,1,1]; }
}`;
const seed = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 2,
  nodes: [0, 12].map((height, i) => ({ id: 'n' + i, kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [10, 6],
    ...(height ? { plane: { origin: [0, 0, height], normal: [0, 0, 1], xAxis: [1, 0, 0] } } : {}),
  })),
  outputs: {},
  direct: {
    sources: { a: bezier('left', 0, 2, 0), b: bezier('right', 10, 14, 10), bad: bezier('bad', 10, 14, 10, 11) },
    objects: [{ id: 'a', name: 'Rail A', source: 'a', geometry: 'curve' },
      { id: 'b', name: 'Rail B', source: 'b', geometry: 'curve' },
      { id: 'bad', name: 'Wrong end', source: 'bad', geometry: 'curve' }],
  },
};
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const hud = () => f.page.getByRole('dialog', { name: 'Loft', exact: true });
const preview = () => hud().locator('.status').filter({ hasText: /^preview$/ }).waitFor();
const openFeature = () => f.openFeatureEditor(4, 'edit the two-guide Loft');
const guideField = (slot, axis = 'X') => f.editor().getByLabel(`Guide ${slot} middle ${axis}`, { exact: true });
async function verifyGuideLabels() {
  for (const [slot, x] of [[1, 0], [2, 10]]) {
    const endpoints = `Guide ${slot} · (${x}, 0, 0) → (${x}, 0, 12) mm`;
    await f.editor().getByText(endpoints, { exact: true }).waitFor();
    for (const axis of ['X', 'Y']) {
      const description = await guideField(slot, axis).evaluate(input => input.getAttribute('aria-describedby')?.split(' ').map(id => document.getElementById(id)?.textContent?.trim()).join(' '));
      assert.ok(description?.includes(endpoints), description);
    }
  }
}
const change = async (doc, slot, x, label) => {
  await openFeature();
  await f.editor().getByText('Two guides', { exact: true }).waitFor();
  await guideField(slot).fill(String(x));
  await f.applyEditor(doc, label);
  return f.doc();
};


await f.run(async () => {
  const origin = new URL(f.server.resolvedUrls.local[0]).origin;
  const newContext = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async options => {
    const context = await newContext({ ...options, serviceWorkers: 'block' });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      return ['http:', 'https:'].includes(url.protocol) && url.origin !== origin ? route.abort() : route.continue();
    });
    return context;
  };
  f.phase = 'Open two sketches and three direct guide candidates';
  await f.newPage();
  const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await chooser.setFiles({ name: 'two-loft-guides.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) });
  await f.same(seed);
  const startLoft = async () => {
    await button('Sketch 2').click();
    await button('Sketch 1').click({ modifiers: ['Shift'] });
    await f.page.evaluate(() => document.activeElement?.blur());
    await f.command('Loft');
    await preview();
  };
  const hiddenRow = () => f.page.getByTitle('Hidden: click to show').filter({ hasText: /^Rail B$/ });
  let initial = seed;
  if (checkHidden) {
    f.phase = 'Hide the source Rail B through Direct geometry';
    await button('Rail B').click();
    await button('Hide', f.page.getByRole('complementary', { name: 'Direct geometry' })).click();
    await f.changed(seed);
    initial = { ...seed, direct: { ...seed.direct, objects: seed.direct.objects.map(object => object.id === 'b' ? { ...object, hidden: true } : object) } };
    await f.same(initial);
    await hiddenRow().waitFor();

    f.phase = 'Make a single-guide circular Loft from a hidden curve';
    const singleSource = {
      ...seed,
      nodes: seed.nodes.map(({ id, kind, plane }) => ({ id, kind, profile: 'circle', center: [0, 0], radius: 3, ...(plane ? { plane } : {}) })),
      direct: {
        sources: { a: bezier('left', 3, 5, 3) },
        objects: [seed.direct.objects[0]],
      },
    };
    await f.freshOpen({ name: 'single-guide.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(singleSource)) }, singleSource, 'single-source');
    await button('Rail A').click();
    await button('Hide', f.page.getByRole('complementary', { name: 'Direct geometry' })).click();
    await f.changed(singleSource);
    const hiddenSingle = { ...singleSource, direct: { ...singleSource.direct, objects: [{ ...singleSource.direct.objects[0], hidden: true }] } };
    await f.same(hiddenSingle);
    await button('Sketch 1').click();
    await button('Sketch 2').click({ modifiers: ['Shift'] });
    await f.page.evaluate(() => document.activeElement?.blur());
    await f.command('Loft');
    await preview();
    const single = hud().getByLabel('Guide (copied)', { exact: true });
    assert.equal(await single.locator('option[value="a"]').textContent(), 'Rail A (hidden)');
    await single.selectOption('a');
    await preview();
    assert.equal(await single.locator('option:checked').textContent(), 'Rail A (hidden)');
    await f.same(hiddenSingle);
    await f.snapshot('single-hidden-guide');
    await button('Apply', hud()).click();
    await f.changed(hiddenSingle);
    const singlyGuided = await f.doc();
    assert.deepEqual(singlyGuided.nodes.at(-1).guide.controlPoints, [[3, 0, 0], [5, 0, 6], [3, 0, 12]]);
    assert.deepEqual(singlyGuided.direct, hiddenSingle.direct);
    assert.ok(Math.abs((await f.bodies()).bodies[0].volume - 108 * Math.PI) < 1e-8);
    await f.undo();
    await f.same(hiddenSingle);
    await f.redo();
    await f.same(singlyGuided);
    await f.freshOpen({ name: 'two-hidden-guide.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(initial)) }, initial, 'two-source');
    await hiddenRow().waitFor();
  }
  await startLoft();
  const first = hud().getByLabel('Guide (copied)', { exact: true });
  const second = hud().getByLabel('Second guide (copied)', { exact: true });
  await first.selectOption('a');
  await second.selectOption('bad');
  await hud().locator('.status').filter({ hasText: /^refused$/ }).waitFor();
  assert.equal(await button('Apply', hud()).isEnabled(), false);
  await hud().getByText('A guide misses a section corner', { exact: true }).waitFor();
  await f.same(initial);
  await f.snapshot('wrong-end-refused');
  await second.selectOption('b');
  await preview();
  if (checkHidden) {
    assert.equal(await first.locator('option:checked').textContent(), 'Rail A');
    assert.equal(await second.locator('option:checked').textContent(), 'Rail B (hidden)');
    await f.same(initial);
    await f.snapshot('second-hidden-guide');
  }
  await button('Apply', hud()).click();
  await f.changed(initial);
  const loft = await f.doc();
  assert.deepEqual(loft.direct, initial.direct);
  await verifyTwoGuideLoft(f, loft, 2, 4, 'original');
  await f.snapshot('original');

  f.phase = 'Reject touching guides and associate the error with both X inputs';
  await openFeature();
  await verifyGuideLabels();
  const border = input => input.evaluate(element => getComputedStyle(element).borderTopColor);
  const originalBorders = await Promise.all([border(guideField(1)), border(guideField(2))]);
  await guideField(1).fill('14');
  await button('Apply', f.editor()).click();
  await f.editor().getByText('The Loft guides are too close', { exact: true }).waitFor();
  assert.equal(await guideField(2).inputValue(), '14');
  for (const slot of [1, 2]) {
    assert.equal(await guideField(slot).getAttribute('aria-invalid'), 'true');
    assert.equal(await guideField(slot, 'Y').getAttribute('aria-invalid'), null);
    assert.notEqual(await border(guideField(slot)), originalBorders[slot - 1]);
    assert.equal(await border(guideField(slot, 'Y')), originalBorders[slot - 1]);
    const hasError = await guideField(slot).evaluate(input => input.getAttribute('aria-describedby').split(' ').some(id => document.getElementById(id)?.textContent.includes('Guide 2 must stay to the right of Guide 1')));
    assert.ok(hasError);
  }
  await f.same(loft);
  await f.snapshot('history-guide-gap-refused');
  await guideField(1).fill('3');
  assert.equal(await guideField(1).getAttribute('aria-invalid'), null);
  await f.applyEditor(loft, 'edit-first');
  const aEdited = await f.doc();
  assert.deepEqual(aEdited.nodes[4].guides[1], loft.nodes[4].guides[1]);
  await verifyTwoGuideLoft(f, aEdited, 3, 4, 'edit-first');
  await f.undo();
  await f.same(loft);
  const bEdited = await change(loft, 2, 16, 'edit-second');
  assert.deepEqual(bEdited.nodes[4].guides[0], loft.nodes[4].guides[0]);
  await verifyTwoGuideLoft(f, bEdited, 2, 6, 'edit-second');
  await f.undo();
  await f.same(loft);
  await f.redo();
  await f.same(bEdited);
  const saved = await f.save('two-guide-loft');
  await f.freshOpen(saved.file, bEdited, 'reopened');
  if (checkHidden) await hiddenRow().waitFor();
  await verifyTwoGuideLoft(f, await f.doc(), 2, 6, 'reopened');
  await openFeature();
  await verifyGuideLabels();
  await f.snapshot('reopened-guide-history');
});
