import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
import { twoGuideInspector, verifyTwoGuideLoft } from './loft-two-guides-oracle.mjs';
const pins = ['apps/cad-studio/src/ui/Hud.tsx', 'apps/cad-studio/src/app/loftTwoGuideFeedback.ts', 'packages/barocss-cad-model/src/app/profileCommands.ts', 'packages/barocss-cad/src/features/loft-two-guides.ts'];
const f = await createFlow({ name: 'loft-two-guide-feedback', output: process.argv[2], envFrozen: 'D1317_SOURCE_FROZEN', initialFiles: pins, requiredFrozen: pins,
  qualification: 'Identify missing, duplicate, endpoint and midplane errors beside the responsible guide; recover without losing inputs.',
  limits: ['Two congruent XY rectangles and quadratic guides at 1024 desktop; assistive technology NOT_RUN.'], inspectorSource: twoGuideInspector });
const curve = (x, mid, end = 12, z = 6) => `@model rail { version:0; length-unit:mm; @curve #curve {type:nurbs; degree:2; knots:[0,0,0,1,1,1]; control-points:[[${x},0,0],[${mid},0,${z}],[${x},0,${end}]]; weights:[1,1,1];}}`;
const sources = { a: curve(0, 2), b: curve(10, 14), end: curve(10, 14, 11), mid: curve(10, 14, 12, 5) };
const seed = { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 2, outputs: {},
  nodes: [0, 12].map((height, i) => ({ id: 'n' + i, kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [10, 6], ...(height ? { plane: { origin: [0, 0, height], normal: [0, 0, 1], xAxis: [1, 0, 0] } } : {}) })),
  direct: { sources, objects: Object.keys(sources).map(id => ({ id, name: id, source: id, geometry: 'curve' })) } };
const hud = () => f.page.getByRole('dialog', { name: 'Loft', exact: true });
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
await f.run(async () => {
  await f.newPage(); await f.page.setViewportSize({ width: 1024, height: 800 });
  await f.openFile({ name: 'two-guide-feedback.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) }, 2); await f.same(seed);
  await button('Sketch 2').click(); await button('Sketch 1').click({ modifiers: ['Shift'] }); await f.page.evaluate(() => document.activeElement?.blur());
  await f.command('Loft'); await hud().locator('.status.ok').waitFor();
  const selection = await f.page.evaluate(() => window.__studioSelection.selection);
  const first = hud().getByLabel('Guide (copied)', { exact: true }), second = hud().getByLabel('Second guide (copied)', { exact: true });
  const refuse = async (field, expected, label) => {
    await hud().locator('.status.error').waitFor();
    assert.equal(await field.getAttribute('aria-invalid'), 'true');
    const description = await field.getAttribute('aria-describedby');
    assert.match(await hud().locator(`#${description}`).textContent(), expected);
    assert.equal(await hud().getByRole('status').count(), 1);
    assert.equal(await hud().getByText('Invalid input', { exact: true }).count(), 0);
    assert.equal(await hud().locator('.hud-step.done').filter({ hasText: 'Guides' }).count(), 0);
    assert.equal(await button('Apply', hud()).isDisabled(), true); await f.same(seed); assert.deepEqual(await f.page.evaluate(() => window.__studioSelection.selection), selection); await f.snapshot(label);
  };
  await second.selectOption('b'); await refuse(first, /Choose Guide 1/, 'missing-first');
  await first.selectOption('b'); await refuse(second, /different curve for Guide 2/, 'duplicate-guide');
  await first.selectOption('a'); await hud().locator('.status.ok').waitFor();
  for (const [value, expected] of [['end', /Guide 2 endpoints.*max X, min Y/], ['mid', /Guide 2.*halfway/]]) {
    await second.selectOption(value); await refuse(second, expected, `invalid-${value}`);
    assert.equal(await first.inputValue(), 'a'); assert.equal(await second.inputValue(), value);
  }
  await second.selectOption('b'); await hud().locator('.status.ok').waitFor();
  assert.equal(await first.getAttribute('aria-invalid'), null); assert.equal(await second.getAttribute('aria-invalid'), null);
  assert.equal(await hud().getByRole('status').count(), 0); await f.same(seed); await f.snapshot('recovered-preview');
  await button('Apply', hud()).click(); await f.changed(seed); const accepted = await f.doc();
  await verifyTwoGuideLoft(f, accepted, 2, 4, 'accepted');
  await f.undo(); await f.same(seed); await f.redo(); await f.same(accepted);
  const saved = await f.save('two-guide-recovered'); await f.freshOpen(saved.file, saved.doc, 'reopened');
  await verifyTwoGuideLoft(f, saved.doc, 2, 4, 'reopened');
});
