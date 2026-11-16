import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
import { clickModelCommand } from './model-rail-helper.mjs';

const f = await createFlow({ name: 'body-selection-query', output: process.argv[2], envFrozen: 'BODY_SELECTION_QUERY_FROZEN',
  initialFiles: ['apps/cad-studio/test/body-selection-query-browser.mjs'],
  requiredFrozen: ['apps/cad-studio/src/App.tsx', 'apps/cad-studio/src/ui/BodySelectionQuery.tsx'],
  qualification: 'Explicit visible base-body selection by literal name and current material, with source-qualified refresh.',
  limits: ['Desktop Model only; no assembly/nested/direct geometry search or saved filters.', 'Synthetic independent six-box fixture; M1=steel and M2=abs are real IDs, not manufacturer specifications.', 'No real IME composition or device-specific text-service qualification.', 'Actual Measure/section/assembly/Render/Drawing/failed-evaluation gating, body-array reorder, material edit, delete/Undo identity and injected delayed replies are NOT_RUN; active command and external rename are the exercised interruption controls.'],
});
// Independent manifest: original evaluated indices are fixed by six unrelated authored outputs.
const manifest = [
  { key: 'b1', name: 'Plate', material: 'steel' },
  { key: 'b3', name: 'Plate', material: 'steel' },
  { key: 'b5', name: 'Plate', material: 'abs' },
  { key: 'b7', name: 'Bolt', material: 'steel' },
  { key: 'b9', name: 'Plate', material: 'steel', hidden: true },
  { key: 'b11', name: '[Plate]' },
];
const base = { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nodes: [], outputs: {}, nextId: 12, bodies: {} };
for (const [i, body] of manifest.entries()) {
  const x = i * 14, sketch = i * 2;
  base.nodes.push({ kind: 'sketch', id: `n${sketch}`, profile: 'rectangle', min: [x, 0], max: [x + 10, 8] },
    { kind: 'extrude', id: `n${sketch + 1}`, sketch, height: 6 });
  base.outputs[body.key] = { node: sketch + 1, side: 'solid' };
  base.bodies[body.key] = { name: body.name, ...(body.material ? { material: body.material } : {}), ...(body.hidden ? { hidden: true } : {}) };
}
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const row = key => f.page.locator(`[data-browser-body-key="${key}"]`);
const name = () => f.page.getByLabel('Body name contains', { exact: true });
const material = () => f.page.getByLabel('Body material', { exact: true });
const query = () => name().locator('xpath=ancestor::details[1]');
const apply = () => button('Select matches', query());
async function openQuery() {
  const summary = f.page.getByText('Select bodies by properties', { exact: true });
  if (!await name().isVisible()) await summary.click();
  await name().waitFor();
}
async function chooseMaterial(label) {
  const option = await material().locator('option').evaluateAll((options, label) => options.find(o => o.textContent.trim() === label || o.textContent.trim().startsWith(`${label} ·`))?.value, label);
  assert.notEqual(option, undefined, `Material option ${label}`);
  await material().selectOption(option);
}
function observeWorkerRequests() {
  const NativeWorker = window.Worker;
  window.__queryWorkerRequests = [];
  window.Worker = class extends NativeWorker {
    postMessage(...args) {
      const value = args[0];
      window.__queryWorkerRequests.push({ type: value?.type, kind: value?.kind, method: value?.method });
      return super.postMessage(...args);
    }
  };
}
async function open(doc, label) {
  await f.page.locator('input[aria-label="Model file"]').setInputFiles({ name: `${label}.bcad`, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) });
  await f.same(doc);
}
async function state() {
  return f.page.evaluate(() => ({ doc: JSON.parse(JSON.stringify(window.__studioDoc)), selection: JSON.parse(JSON.stringify(window.__studioSelection)),
    bodies: window.__studioBodies(), eye: window.__studioEye(), dirty: !!document.querySelector('[aria-label="Unsaved changes"]'),
    history: ['Undo', 'Redo'].map(label => { const b = document.querySelector(`button[aria-label="${label}"]`); return [b?.disabled, b?.getAttribute('data-tip')]; }),
    workerRequests: window.__queryWorkerRequests?.length ?? 0 }));
}
async function selected(indices) {
  await f.page.waitForFunction(indices => JSON.stringify(window.__studioSelection?.selection?.bodies) === JSON.stringify(indices), indices);
  const actual = await f.page.evaluate(() => window.__studioSelection);
  assert.deepEqual(actual.selection.bodies, indices);
  for (const domain of ['faces', 'edges', 'vertices', 'sketches', 'segments', 'points']) assert.equal(actual.selection[domain]?.length ?? 0, 0, `${domain} cleared`);
  for (const key of ['direct', 'directSel', 'instances', 'instanceSel']) if (Array.isArray(actual[key])) assert.equal(actual[key].length, 0);
  for (let i = 0; i < manifest.length; i++) assert.equal(await row(manifest[i].key).evaluate(el => el.classList.contains('sel')), indices.includes(i));
}
async function applyOnly(indices) {
  const before = await state();
  await apply().click(); await selected(indices);
  const after = await state();
  assert.deepEqual({ ...after, selection: before.selection }, before, 'Explicit selection changes only selection, with no Worker request');
  await apply().click(); assert.deepEqual(await state(), after, 'Repeated explicit selection is idempotent');
}
await f.run(async () => {
  await f.newPage(); await f.context.addInitScript(observeWorkerRequests); await f.page.reload(); await f.ready();
  await f.page.setViewportSize({ width: 1440, height: 900 }); await open(base, 'body-query-manifest');
  assert.deepEqual((await f.bodies()).bodies.map(b => b.key), manifest.map(b => b.key));
  await row('b7').click(); await openQuery();
  assert.equal(await name().getAttribute('maxlength'), '256');
  const initial = await state(); assert.equal(await apply().isDisabled(), true);
  await name().fill('pLaTe'); await chooseMaterial('steel'); assert.match(await f.page.getByRole('status', { name: 'Body query results', exact: true }).innerText(), /2 matching bodies/); assert.equal(await query().locator('li').count(), 2); assert.deepEqual(await state(), initial, 'Typing only previews candidates');
  await applyOnly([0, 1]); await f.snapshot('01-duplicate-names-exact-material');
  await chooseMaterial('abs'); await applyOnly([2]);
  await chooseMaterial('Any'); await name().fill('[Plate]'); await applyOnly([5]);
  await name().fill(''); await chooseMaterial('Unspecified'); await applyOnly([5]);
  const kept = await state(); await name().fill('no such body'); assert.equal(await apply().isDisabled(), true); assert.deepEqual(await state(), kept);
  await button('Clear query', query()).click(); assert.equal(await name().inputValue(), ''); assert.equal(await apply().isDisabled(), true); assert.deepEqual(await state(), kept, 'Clear only clears conditions');
  // Native text selection/undo/Escape must not become document shortcuts.
  await name().fill('plate'); const keyboard = await state(); await name().press('Meta+a');
  assert.deepEqual(await name().evaluate(el => [el.selectionStart, el.selectionEnd]), [0, 5]);
  await name().press('End'); await name().press('x'); await name().press('Meta+z'); assert.equal(await name().inputValue(), 'plate');
  await name().press('Escape'); assert.deepEqual(await state(), keyboard);
  await chooseMaterial('steel'); await applyOnly([0, 1]);
  // Query disclosure must not blur/commit an external, unaccepted name input.
  await row('b7').dblclick();
  const pendingName = f.page.getByRole('textbox', { name: 'Body name', exact: true });
  await pendingName.fill('Uncommitted bolt name');
  const pendingRename = await state();
  assert.equal(await apply().isDisabled(), true); assert.equal(await name().isDisabled(), true);
  assert.equal(await material().isDisabled(), true); assert.equal(await button('Clear query', query()).isDisabled(), true);
  assert.equal(await query().getByText('Selected 2 bodies.', { exact: true }).count(), 0);
  const summary = f.page.getByText('Select bodies by properties', { exact: true });
  await summary.click(); await summary.click();
  assert.equal(await pendingName.inputValue(), 'Uncommitted bolt name');
  assert.equal(await pendingName.evaluate(el => document.activeElement === el), true);
  assert.deepEqual(await state(), pendingRename, 'Disclosure clicks cannot commit or discard the external rename draft');
  await f.snapshot('01b-external-rename-preserved');
  await pendingName.press('Escape'); await f.same(base);
  // A live geometry command remains active; query cannot cancel it or replace its selection.
  await row('b7').click();
  await clickModelCommand(f.page, 'Pattern', 'Linear pattern');
  const hud = f.page.getByRole('dialog', { name: 'Linear pattern', exact: true });
  await hud.waitFor();
  await f.page.waitForFunction(() => /preview|refused/.test(document.querySelector('.hud .status')?.textContent ?? ''));
  const active = await state();
  const hudValues = await hud.locator('input,select').evaluateAll(fields => fields.map(el => [el.getAttribute('aria-label'), el.value]));
  assert.equal(await apply().isDisabled(), true); assert.equal(await name().isDisabled(), true);
  assert.match(await f.page.getByRole('status', { name: 'Body query results', exact: true }).innerText(), /Selection unavailable/);
  await summary.click(); await summary.click();
  assert.equal(await hud.isVisible(), true);
  assert.deepEqual(await hud.locator('input,select').evaluateAll(fields => fields.map(el => [el.getAttribute('aria-label'), el.value])), hudValues);
  assert.deepEqual(await state(), active, 'Query disclosure leaves the live command, document and selection untouched');
  await f.snapshot('01c-active-command-blocked');
  await button('Cancel', hud).click(); await f.same(base); await openQuery();
  // Rename must invalidate the preview, not silently apply changed two/one-body sets.
  await row('b1').dblclick(); const rename = f.page.getByRole('textbox', { name: 'Body name', exact: true });
  await rename.fill('Bracket'); await rename.press('Enter'); await f.ready();
  await button('Refresh matches', query()).waitFor(); assert.equal(await apply().isDisabled(), true);
  const renamed = await state(); await button('Refresh matches', query()).click(); assert.deepEqual(await state(), renamed);
  await applyOnly([1]);
  await row('b3').locator('xpath=..').getByRole('button', { name: 'Hide body', exact: true }).click(); await f.ready();
  await button('Refresh matches', query()).waitFor(); const hidden = await state(); assert.equal(await apply().isDisabled(), true);
  await button('Refresh matches', query()).click(); assert.equal(await apply().isDisabled(), true); assert.deepEqual(await state(), hidden, 'Zero refreshed matches preserves current selection');
  await f.snapshot('02-stale-hide-and-explicit-refresh');
  // Open a different document with the same keys resets query; brief inheritance is a separate fact.
  const inherited = { ...base, brief: { version: 1, material: { value: 'steel', basis: 'stated', source: 'steel' } } };
  await open(inherited, 'same-keys-inherited-material'); await openQuery(); assert.equal(await name().inputValue(), ''); assert.equal(await apply().isDisabled(), true);
  await name().fill('plate'); await chooseMaterial('steel'); await applyOnly([0, 1, 5]);
  await name().fill(''); await chooseMaterial('Unspecified'); assert.equal(await apply().isDisabled(), true);
  await name().fill('plate'); await chooseMaterial('steel'); await f.snapshot('03-inherited-material');
  const save = await f.save('body-query-session-only'); assert.deepEqual(save.doc, inherited);
  await f.freshOpen(save.file, inherited, '04-fresh-open'); await openQuery(); assert.equal(await name().inputValue(), ''); assert.equal(await apply().isDisabled(), true);
  await f.page.setViewportSize({ width: 1024, height: 800 }); await name().fill('plate'); await chooseMaterial('steel'); await applyOnly([0, 1, 5]); await f.snapshot('05-narrow-explicit-selection');
  await button('New part').click(); await f.ready(); await openQuery(); assert.equal(await name().inputValue(), ''); assert.equal(await apply().isDisabled(), true);
  f.report.observations.push({ fixture: manifest, expectedIndices: { plateSteel: [0, 1], plateAbs: [2], literalBracket: [5], unspecified: [5], inheritedPlateSteel: [0, 1, 5] }, typingClearZeroPreserveSelection: true, staleRenameHideRequireRefresh: true, externalRenameDraftPreserved: true, activeCommandPreserved: true, explicitOnly: true, noGeometryWorkerOnSelection: true, saveOpenReset: true });
});
