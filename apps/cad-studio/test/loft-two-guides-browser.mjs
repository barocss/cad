import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
import { twoGuideInspector, verifyTwoGuideLoft } from './loft-two-guides-oracle.mjs';

const pins = ['apps/cad-studio/test/loft-two-guides-browser.mjs', 'apps/cad-studio/test/loft-two-guides-oracle.mjs', 'apps/cad-studio/src/ui/NodeEditor.tsx',
  'packages/barocss-cad-model/src/app/profileCommands.ts', 'packages/barocss-cad-model/src/app/editFields.ts',
  'packages/barocss-cad-model/src/app/profiles.ts',
  'packages/barocss-cad-model/src/engine/errors.ts',
  'packages/barocss-cad-model/src/engine/doc.ts', 'packages/barocss-cad-model/src/engine/part.ts',
  'packages/barocss-cad/src/features/loft.ts', 'packages/barocss-cad/src/features/loft-two-guides.ts',
  'packages/barocss-cad/src/part/part-profile-solid.ts'];
const f = await createFlow({
  name: 'loft-two-guides', envFrozen: 'D1275_SOURCE_FROZEN', output: process.argv[2],
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Create a two-guide Loft, edit each guide independently, and reopen the saved Studio document.',
  limits: ['Two congruent XY rectangles and two ordered quadratic Bézier rails with affine Z.'],
  inspectorSource: twoGuideInspector,
});
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
const change = async (doc, slot, x, label) => {
  await openFeature();
  await f.editor().getByText('Two guides', { exact: true }).waitFor();
  await f.editor().getByLabel(`Guide ${slot} middle X`, { exact: true }).fill(String(x));
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
  await button('Sketch 2').click();
  await button('Sketch 1').click({ modifiers: ['Shift'] });
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.command('Loft');
  await preview();
  const first = hud().getByLabel('Guide (copied)', { exact: true });
  const second = hud().getByLabel('Second guide (copied)', { exact: true });
  await first.selectOption('a');
  await second.selectOption('bad');
  await hud().locator('.status').filter({ hasText: /^refused$/ }).waitFor();
  assert.equal(await button('Apply', hud()).isEnabled(), false);
  await hud().getByText('A guide misses a section corner', { exact: true }).waitFor();
  await f.same(seed);
  await f.snapshot('wrong-end-refused');
  await second.selectOption('b');
  await preview();
  await button('Apply', hud()).click();
  await f.changed(seed);
  const loft = await f.doc();
  await verifyTwoGuideLoft(f, loft, 2, 4, 'original');
  await f.snapshot('original');

  const aEdited = await change(loft, 1, 3, 'edit-first');
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
  await verifyTwoGuideLoft(f, await f.doc(), 2, 6, 'reopened');
});
