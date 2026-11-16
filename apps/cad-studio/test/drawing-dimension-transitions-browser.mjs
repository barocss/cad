// #265: authored definitions only; public OPFS project/version and Drawing controls.
import assert from 'node:assert/strict';
import { createFlow, sha256 } from './flow-helper.mjs';
const f = await createFlow({ name: 'drawing-dimension-transitions', output: process.argv[2], envFrozen: 'DRAWING_DIMENSION_TRANSITIONS_FROZEN',
  initialFiles: ['apps/cad-studio/test/drawing-dimension-transitions-browser.mjs'],
  requiredFrozen: ['apps/cad-studio/src/storage/VersionsPanel.tsx'],
  qualification: 'Public sheet movement/rename/renumber, rapid saved-source changes and Open/New comparison retirement.',
  limits: ['Synthetic 20 × 10 × 5 mm box. Auto authors valid source references; expectations use independently known dimensions and explicit tolerance literals.',
    'Existing Compare may request a geometry overlay. Only opening/closing the authored detail must issue no Worker requests.',
    'Direct sheet reorder has no public UI: delete an earlier empty sheet to prove renumbering. Native folder, manufacturing, delayed-worker injection and malformed raw schemas are NOT_RUN.'] });
const seed = { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nodes: [
  { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [20, 10] },
  { id: 'n1', kind: 'extrude', sketch: 0, height: 5 }], outputs: { b1: { node: 1, side: 'solid' } }, nextId: 2 };
const project = 'Drawing definition transitions', file = 'comparison-box.bcad';
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const panel = () => f.page.getByRole('complementary', { name: 'Versions panel', exact: true });
const detail = () => f.page.locator('details').filter({ has: f.page.locator('summary').filter({ hasText: /^Drawing dimension definitions$/ }) });
const row = i => f.page.locator('.dw-dims .dw-dim').nth(i);

async function readFile(path) {
  return f.page.evaluate(async ({ project, path }) => {
    let d = await (await (await navigator.storage.getDirectory()).getDirectoryHandle('projects')).getDirectoryHandle(project);
    for (const name of path.slice(0, -1)) d = await d.getDirectoryHandle(name);
    return (await (await d.getFileHandle(path.at(-1))).getFile()).text();
  }, { project, path });
}
async function storage() {
  const log = await readFile(['.barocss', 'versions', file + '.json']);
  const snapshots = {};
  for (const version of JSON.parse(log).versions) snapshots[version.snapshot] = await readFile(['.barocss', 'snapshots', version.snapshot + '.bcad']);
  return { log, snapshots, part: await readFile([file]) };
}
async function state() {
  return f.page.evaluate(() => ({ doc: JSON.parse(JSON.stringify(window.__studioDoc)), selection: JSON.parse(JSON.stringify(window.__studioSelection)),
    dirty: !!document.querySelector('[aria-label="Unsaved changes"]'),
    history: ['Undo', 'Redo'].map(label => { const b = document.querySelector(`button[aria-label="${label}"]`); return [b?.disabled, b?.getAttribute('data-tip')]; }) }));
}
async function attach() {
  await button('Model').click();
  if (!await panel().isVisible()) await button('Project and versions').click();
  await panel().getByLabel('Browser project name', { exact: true }).fill(project);
  await button('Project in this browser', panel()).click(); await panel().getByLabel('Project', { exact: true }).waitFor();
}
async function version(name) {
  await panel().getByLabel('Version name', { exact: true }).fill(name); await button('Make version', panel()).click();
  await panel().getByLabel('Version ' + name, { exact: true }).waitFor();
  await f.page.getByLabel('Unsaved changes', { exact: true }).waitFor({ state: 'hidden' });
}
async function readonly(label, action) {
  const before = await state(), bytes = await storage(); await action();
  assert.deepEqual(await state(), before, label + ': document/selection/dirty/history');
  assert.deepEqual(await storage(), bytes, label + ': immutable log/snapshots and saved part');
}
async function expanded() {
  await detail().waitFor(); if (!await detail().evaluate(el => el.open)) await detail().locator(':scope > summary').click();
  await detail().getByText(/^Stored definitions only\. Nominal measurements, other drawing annotations and manufacturing approval are not compared here\./).waitFor();
}
await f.run(async () => {
  await f.newPage();
  await f.page.addInitScript(() => { const original = Worker.prototype.postMessage; window.__comparisonWorkerMessages = [];
    Worker.prototype.postMessage = function (...args) { window.__comparisonWorkerMessages.push(args[0]?.type ?? args[0]?.kind ?? 'unknown'); return original.apply(this, args); }; });
  await f.page.reload(); await f.ready();
  const open = async (doc, name) => {
    await f.page.locator('input[aria-label="Model file"]').setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) }); await f.same(doc);
  };
  await open(seed, file); await button('Drawing').click(); await button('Auto-dimension').click();
  await f.page.waitForFunction(() => window.__studioDrawing?.()?.dimensions?.length >= 2);
  const authored = (await f.doc()).drawing.dimensions;
  const resolved = await f.page.evaluate(() => window.__studioDrawing().dimensions);
  const width = resolved.find(d => d.value === 20 && authored.find(a => a.id === d.id)?.view === 'front'); assert.ok(width);
  const companion = authored.find(d => d.view === 'top'); assert.ok(companion);
  for (let i = authored.length - 1; i >= 0; i--) if (![width.id, companion.id].includes(authored[i].id)) await row(i).getByRole('button', { name: /Remove dimension/ }).click();
  await attach(); await version('V1 first sheet'); const v1 = await f.doc();
  await button('Compare V1 first sheet', panel()).click(); await expanded();
  assert.match(await detail().innerText(), /No authored dimension definition changes/);
  await button('Drawing').click(); await button('Add sheet').click(); await button('Add sheet').click();
  const sheets = () => f.page.locator('details.dw-sheet-set');
  await sheets().locator(':scope > summary').click();
  await f.page.getByLabel('Sheet name', { exact: true }).fill('Inspection'); await f.page.getByLabel('Sheet name', { exact: true }).press('Enter');
  await f.page.getByLabel('Move Front view to sheet', { exact: true }).selectOption('3');
  await f.page.waitForFunction(() => window.__studioDoc.drawing.sheets?.[1]?.views?.includes('front'));
  const moved = await f.doc(), sheetID = moved.drawing.sheets[1].id;
  assert.deepEqual(moved.drawing.dimensions, v1.drawing.dimensions, 'sheet moves do not rewrite dimension definitions');
  assert.deepEqual(moved.nodes, v1.nodes);
  await button('Model').click(); await expanded();
  const item = () => detail().locator(`[data-dimension-change="${width.id}"]`);
  assert.equal(await detail().locator('[data-dimension-change]').count(), 1);
  assert.match(await item().innerText(), /sheet:/); assert.match(await item().innerText(), /1: Sheet 1/); assert.match(await item().innerText(), /3: Inspection/);
  assert.ok((await item().innerText()).includes(sheetID));
  await f.snapshot('01-moved-sheet'); await version('V2 sheet three'); const v2 = await f.doc();
  await button('Drawing').click();
  await f.page.getByRole('tab', { name: 'Sheet 2', exact: true }).click();
  if (!await sheets().evaluate(el => el.open)) await sheets().locator(':scope > summary').click();
  await button('Delete sheet').click();
  await f.page.waitForFunction(id => window.__studioDoc.drawing.sheets?.length === 1 && window.__studioDoc.drawing.sheets[0].id === id, sheetID);
  await f.page.getByRole('tab', { name: 'Inspection', exact: true }).click();
  if (!await sheets().evaluate(el => el.open)) await sheets().locator(':scope > summary').click();
  await f.page.getByLabel('Sheet name', { exact: true }).fill('Final inspection'); await f.page.getByLabel('Sheet name', { exact: true }).press('Enter');
  const final = await f.doc(); assert.deepEqual(final.drawing.dimensions, v1.drawing.dimensions); assert.equal(final.drawing.sheets[0].id, sheetID);
  await button('Model').click();
  await readonly('Rapid source changes', async () => {
    await button('Compare V2 sheet three', panel()).click(); await button('Compare V1 first sheet', panel()).click(); await button('Compare V2 sheet three', panel()).click(); await expanded();
  });
  assert.match(await item().innerText(), /3: Inspection/); assert.match(await item().innerText(), /2: Final inspection/);
  assert.equal(await detail().locator('[data-dimension-change]').count(), 1);
  await f.ready(); await f.page.waitForTimeout(500);
  const count = await f.page.evaluate(() => window.__comparisonWorkerMessages.length);
  await readonly('Disclosure only', async () => { await detail().locator(':scope > summary').click(); await detail().locator(':scope > summary').click(); });
  assert.equal(await f.page.evaluate(() => window.__comparisonWorkerMessages.length), count);
  await button('Undo').click(); await expanded(); assert.match(await item().innerText(), /2: Inspection/); assert.doesNotMatch(await item().innerText(), /Final inspection/);
  await button('Redo').click(); await f.same(final); await expanded(); assert.match(await item().innerText(), /2: Final inspection/);
  await button('Save').click(); await f.page.getByLabel('Unsaved changes', { exact: true }).waitFor({ state: 'hidden' }); const saved = await storage();
  await f.snapshot('02-renamed-renumbered');
  // Public Open retires the comparison even when model feature IDs and geometry match.
  await open(seed, 'unrelated-same-feature-ids.bcad'); await detail().waitFor({ state: 'hidden' });
  assert.deepEqual(await storage(), saved);
  if (!await panel().isVisible()) await button('Project and versions').click();
  await button('Open ' + file, panel()).click(); await f.same(final);
  await button('Compare V1 first sheet', panel()).click(); await expanded(); assert.match(await item().innerText(), /2: Final inspection/);
  await button('New part').click(); await f.page.waitForFunction(() => window.__studioDoc.nodes.length === 0); await detail().waitFor({ state: 'hidden' });
  assert.deepEqual(await storage(), saved);
  await f.snapshot('03-new-retires-comparison');
  f.report.observations.push({ dimension: width.id, companion: companion.id, stableSheetID: sheetID,
    transitions: ['Sheet 1 → Sheet 3 Inspection', 'Delete empty Sheet 2: stable ID becomes Sheet 2', 'Inspection → Final inspection', 'rapid V2/V1/V2', 'same-feature-IDs Open', 'New'],
    unchangedDefinitions: true, v2Sheets: v2.drawing.sheets, expectedVolume: 1000, logSHA256: sha256(saved.log),
    snapshotSHA256: Object.fromEntries(Object.entries(saved.snapshots).map(([k, text]) => [k, sha256(text)])) });
});
