import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFlow } from './flow-helper.mjs';
import { clickModelCommand } from './model-rail-helper.mjs';
const f = await createFlow({ name: 'body-selection-query-interruption', output: process.argv[2], envFrozen: 'BODY_QUERY_INTERRUPTION_FROZEN',
  initialFiles: ['apps/cad-studio/test/body-selection-query-interruption-browser.mjs', 'apps/cad-studio/test/fixtures/instance-pattern.bcad'],
  requiredFrozen: ['apps/cad-studio/src/App.tsx', 'apps/cad-studio/src/ui/BodySelectionQuery.tsx'],
  qualification: 'Actual public mode transitions cannot apply a stale body query or silently cancel another edit.',
  limits: ['Synthetic two-box fixture, plus the existing inline instance fixture for public in-place editing.', 'No Physics/Motion/manufacturing activation. No solver or geometry edits.', 'Delayed Worker replies, material edits, deletion/Undo and unsupported topology are tested separately, not by this driver.'] });
const seed = { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nodes: [
  { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [20, 12] },
  { id: 'n1', kind: 'extrude', sketch: 0, height: 8 },
  { id: 'n2', kind: 'sketch', profile: 'rectangle', min: [30, 0], max: [50, 12] },
  { id: 'n3', kind: 'extrude', sketch: 2, height: 8 }],
  outputs: { b1: { node: 1, side: 'solid' }, b3: { node: 3, side: 'solid' } }, nextId: 4,
  bodies: { b1: { name: 'Plate A', material: 'steel' }, b3: { name: 'Plate B', material: 'steel' } } };
const button = (label, scope = f.page) => scope.getByRole('button', { name: label, exact: true });
const input = () => f.page.getByLabel('Body name contains', { exact: true });
const query = () => input().locator('xpath=ancestor::details[1]');
const select = () => button('Select matches', query());
const status = () => f.page.getByRole('status', { name: 'Body query results', exact: true });
async function open(doc, label) {
  await f.page.locator('input[aria-label="Model file"]').setInputFiles({ name: `${label}.bcad`, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) }); await f.same(doc);
}
async function openQuery() {
  if (!await input().isVisible()) await f.page.getByText('Select bodies by properties', { exact: true }).click();
  await input().waitFor();
}
async function read() {
  return f.page.evaluate(() => ({ doc: JSON.parse(JSON.stringify(window.__studioDoc)), selection: JSON.parse(JSON.stringify(window.__studioSelection)),
    dirty: !!document.querySelector('[aria-label="Unsaved changes"]'),
    history: ['Undo', 'Redo'].map(label => { const b = document.querySelector(`button[aria-label="${label}"]`); return [b?.disabled, b?.getAttribute('data-tip')]; }),
    modes: [...document.querySelectorAll('.workspace-tabs button')].map(b => [b.textContent, b.getAttribute('aria-pressed')]) }));
}
async function prepare() {
  await openQuery(); await input().fill('plate'); assert.equal(await select().isDisabled(), false);
  await f.page.locator('[data-browser-body-key="b1"]').click();
  await f.page.waitForFunction(() => JSON.stringify(window.__studioSelection.selection.bodies) === '[0]');
}
async function blocked(label) {
  await openQuery(); await status().filter({ hasText: /Selection unavailable/ }).waitFor();
  assert.equal(await select().isDisabled(), true); assert.equal(await input().isDisabled(), true);
  const before = await read();
  // Real pointer click on a disabled button must not apply, cancel a mode, or discard a draft.
  await select().scrollIntoViewIfNeeded();
  const box = await select().boundingBox(); assert.ok(box);
  await f.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  assert.deepEqual(await read(), before);
  await f.snapshot(label); f.report.observations.push({ label, blocked: true, preserved: ['document', 'selection at mode entry', 'dirty', 'history', 'current mode'] });
}
async function refresh(label, expected = [0, 1]) {
  await f.ready(); await openQuery();
  const before = await read();
  if (await input().inputValue()) {
    await button('Refresh matches', query()).waitFor(); assert.equal(await select().isDisabled(), true);
    await button('Refresh matches', query()).click(); assert.deepEqual(await read(), before, 'Refresh does not apply selection');
  } else {
    // An accepted document-session replacement may remount the query instead of retaining stale text.
    assert.equal(await select().isDisabled(), true); await input().fill('plate');
    f.report.observations.push({ label, queryResetBySessionReplacement: true });
  }
  await select().click();
  await f.page.waitForFunction(expected => JSON.stringify(window.__studioSelection.selection.bodies) === JSON.stringify(expected), expected);
  assert.deepEqual(await f.doc(), before.doc);
}
await f.run(async () => {
  await f.newPage(); await f.page.setViewportSize({ width: 1440, height: 900 }); await open(seed, 'query-interruptions');
  await prepare(); await clickModelCommand(f.page, 'Inspect', 'Measure');
  const measurement = f.page.getByLabel('Measurement', { exact: true }); await measurement.waitFor();
  await blocked('01-measure-blocked'); assert.equal(await measurement.isVisible(), true);
  await button('Done measuring', measurement).click(); await f.same(seed); await refresh('measure-return');
  await prepare(); await button('Section view').click();
  await f.page.waitForFunction(() => window.__studioSection?.().clip !== undefined);
  await blocked('02-section-blocked'); await button('Section view').click(); await refresh('section-return'); await f.same(seed);
  for (const mode of ['Render', 'Drawing']) {
    await prepare(); await button(mode).click(); await blocked(`03-${mode.toLowerCase()}-blocked`);
    await button('Model').click(); await f.same(seed); await refresh(`${mode}-return`);
  }
  await prepare(); await f.openFeatureEditor(1, 'source sketch');
  await button('Edit sketch', f.editor()).click();
  const sketch = f.page.getByRole('complementary', { name: 'Sketch', exact: true }); await sketch.waitFor();
  await blocked('04-sketch-blocked'); assert.equal(await sketch.isVisible(), true);
  await f.page.evaluate(() => document.activeElement?.blur());
  for (let i = 0; i < 3 && await sketch.isVisible(); i++) await f.page.keyboard.press('Escape');
  await sketch.waitFor({ state: 'hidden' });
  if (await f.editor().isVisible()) await button('Close editor').click();
  await f.same(seed); await refresh('sketch-return');
  // Ordinary public Edit part is not Physics/Motion; enter and cancel without changing its content.
  const fixture = JSON.parse(await readFile(new URL('./fixtures/instance-pattern.bcad', import.meta.url), 'utf8'));
  const assembly = { ...seed, instances: fixture.instances };
  await open(assembly, 'query-in-place'); await prepare();
  await f.page.locator('[data-browser-instance-path="cube"]').click();
  const instance = f.page.getByRole('complementary', { name: 'Instance', exact: true }); await instance.waitFor();
  await button('Edit part', instance).click();
  const inPlace = f.page.getByRole('status', { name: 'Editing a part in place', exact: true }); await inPlace.waitFor(); await f.ready();
  await blocked('05-in-place-blocked'); assert.equal(await inPlace.isVisible(), true);
  await button('Cancel', inPlace).click(); await inPlace.waitFor({ state: 'hidden' }); await f.same(assembly);
  await refresh('in-place-return'); await f.snapshot('06-returned-current-query');
});
