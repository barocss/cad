import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const pins = [
  'apps/cad-studio/test/model-preferences-browser.mjs', 'apps/cad-studio/src/App.tsx',
  'apps/cad-studio/src/ui/ModelBrowser.tsx', 'apps/cad-studio/src/ui/ViewDisplayControls.tsx',
];
const f = await createFlow({
  name: 'model-preferences', envFrozen: 'MODEL_PREFERENCES_FROZEN', output: process.argv[2],
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Exercise the actual desktop preference controls, reload storage and retain document geometry and history.',
  limits: ['One isolated desktop Chrome context. Default and user-changed origin-local preferences.'],
});
const stock = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', nextId: 2, parameters: {},
  nodes: [{ kind: 'sketch', id: 'n0', profile: 'rectangle', min: [0, 0], max: [40, 30] },
    { kind: 'extrude', id: 'n1', sketch: 0, height: 10 }],
  outputs: { b1: { node: 1, side: 'solid' } },
};
const explicit = { ...stock, bodies: { b1: { material: 'steel' } } };
const before = {
  'cad-studio-theme': 'dark', 'studio.pick': null, 'studio.snap': null, 'cad-studio.browser': null, 'studio.material': 'al6061',
};
const chosen = {
  'cad-studio-theme': 'light', 'studio.pick': 'face', 'studio.snap': '0.5', 'cad-studio.browser': 'closed', 'studio.material': 'steel',
};
const button = name => f.page.getByRole('button', { name, exact: true });
const material = () => f.page.getByLabel('Material', { exact: true });
const pick = () => button('Selection filter');
const snap = () => button('Grid snap');
const row = () => f.page.locator('.outliner .ol-row > button.ol').first();
const history = () => Promise.all([button('Undo').isEnabled(), button('Redo').isEnabled()]);
const waitStorage = expected => f.page.waitForFunction(entries => entries.every(([key, value]) => localStorage.getItem(key) === value),
  Object.entries(expected));
const rootTheme = () => f.page.locator('html').getAttribute('data-theme');

async function open(doc) {
  await f.openFile({ name: 'Model preferences.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) }, doc.nodes.length);
  await f.same(doc);
}

await f.run(async () => {
  await f.newPage();
  await open(explicit);
  await waitStorage(before);
  assert.equal(await rootTheme(), 'dark');
  assert.match(await pick().innerText(), /Pick all/);
  assert.match(await snap().innerText(), /Grid 1 mm/);
  const previousHistory = await history();
  await row().click();
  assert.equal(await material().inputValue(), 'steel');
  await button('Use as default').click();
  await button('Toggle light or dark theme').click();
  await pick().click();
  await snap().click();
  await button('Collapse the browser').click();
  await waitStorage(chosen);
  assert.equal(await rootTheme(), 'light');
  assert.match(await pick().innerText(), /Faces/);
  assert.match(await snap().innerText(), /Grid 0\.5 mm/);
  await f.same(explicit);
  assert.deepEqual(await history(), previousHistory);
  await f.snapshot('model-preferences-chosen');

  await f.page.reload();
  await f.ready();
  await waitStorage(chosen);
  assert.equal(await rootTheme(), 'light');
  assert.match(await pick().innerText(), /Faces/);
  assert.match(await snap().innerText(), /Grid 0\.5 mm/);
  await button('Expand the browser').waitFor();
  await f.snapshot('model-preferences-after-reload');
  await button('Expand the browser').click();
  await open(stock);
  await row().click();
  assert.equal(await material().inputValue(), 'steel');
  await f.same(stock);
  assert.equal((await f.bodies()).bodies[0].volume, 12000);
  await f.snapshot('unchanged-part-uses-browser-default-material');
  f.report.observations.push({ preferences: chosen, acceptedVolumeMM3: 12000 });
});
