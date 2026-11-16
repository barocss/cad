// #265: authored definitions only; public OPFS project/version and Drawing controls.
import assert from 'node:assert/strict';
import { createFlow, sha256 } from './flow-helper.mjs';
const f = await createFlow({ name: 'drawing-dimension-comparison', output: process.argv[2], envFrozen: 'DRAWING_DIMENSION_COMPARISON_FROZEN',
  initialFiles: ['apps/cad-studio/test/drawing-dimension-comparison-browser.mjs'],
  requiredFrozen: ['apps/cad-studio/src/storage/VersionsPanel.tsx'],
  qualification: 'Saved OPFS version to working document: tolerance detail, read-only interactions, Undo/Redo and fresh project Open.',
  limits: ['Synthetic 20 × 10 × 5 mm box. Auto authors valid source references; expectations use independently known dimensions and explicit tolerance literals.',
    'Existing Compare may request a geometry overlay. Only opening/closing the authored detail must issue no Worker requests.',
    'Native-folder storage, external files, manufacturing approval, nominal-difference comparison and all raw malformed/schema cases are outside this browser run.'] });
const seed = { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nodes: [
  { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [20, 10] },
  { id: 'n1', kind: 'extrude', sketch: 0, height: 5 }], outputs: { b1: { node: 1, side: 'solid' } }, nextId: 2 };
const project = 'Drawing definition comparison', file = 'comparison-box.bcad';
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const panel = () => f.page.getByRole('complementary', { name: 'Versions panel', exact: true });
const detail = () => f.page.locator('details').filter({ has: f.page.locator('summary').filter({ hasText: /^Drawing dimension definitions$/ }) });
const row = i => f.page.locator('.dw-dims .dw-dim').nth(i);
let dimension;
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
async function tolerance(value) {
  await button('Drawing').click();
  const doc = await f.doc(), index = doc.drawing.dimensions.findIndex(d => d.id === dimension);
  assert.ok(index >= 0); await row(index).locator('button.dw-annotation-select').click();
  await f.page.getByLabel('Tolerance', { exact: true }).selectOption('symmetric');
  const input = f.page.getByLabel('Tolerance ±', { exact: true }); await input.fill(String(value)); await input.press('Enter');
  await f.page.waitForFunction(({ id, value }) => window.__studioDoc.drawing.dimensions.find(d => d.id === id)?.tol?.value === value, { id: dimension, value });
  await button('Model').click();
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
  await f.page.locator('input[aria-label="Model file"]').setInputFiles({ name: file, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) }); await f.same(seed);
  await button('Drawing').click(); await button('Auto-dimension').click();
  await f.page.waitForFunction(() => window.__studioDrawing?.()?.dimensions?.length >= 2);
  const dimensions = await f.page.evaluate(() => window.__studioDrawing().dimensions);
  const authored = (await f.doc()).drawing.dimensions;
  const width = dimensions.find(d => d.value === 20 && authored.find(a => a.id === d.id)?.view === 'front'); assert.ok(width); dimension = width.id;
  // Retain the known width and one independent companion; remove only other annotations through UI.
  const companion = authored.find(d => d.view === 'top' && d.id !== dimension); assert.ok(companion);
  for (let i = authored.length - 1; i >= 0; i--) if (![dimension, companion.id].includes(authored[i].id)) await row(i).getByRole('button', { name: /Remove dimension/ }).click();
  await tolerance(0.1); await attach(); await version('V1 tolerance 0.1');
  const v1 = await f.doc(), v1Bytes = await storage();
  assert.equal(v1.drawing.dimensions.length, 2);
  assert.ok(Math.abs((await f.bodies()).bodies[0].volume - 1000) < 1e-9);
  await tolerance(0.05); const v2 = await f.doc();
  assert.deepEqual(v2.nodes, v1.nodes);
  assert.deepEqual(v2.drawing.dimensions.find(d => d.id === companion.id), v1.drawing.dimensions.find(d => d.id === companion.id));
  assert.deepEqual({ ...v2.drawing.dimensions.find(d => d.id === dimension), tol: { kind: 'symmetric', value: 0.1 } }, v1.drawing.dimensions.find(d => d.id === dimension));
  await readonly('Compare V1 to working', async () => { await button('Compare V1 tolerance 0.1', panel()).click(); await expanded(); });
  const text = await detail().innerText(); assert.ok(text.includes(dimension)); assert.match(text, /0\.1/); assert.match(text, /0\.05/); assert.match(text, /mm/);
  // Settle existing overlay before isolating disclosure-only worker effects.
  await f.ready(); await f.page.waitForTimeout(500);
  const count = await f.page.evaluate(() => window.__comparisonWorkerMessages.length);
  await readonly('Collapse/reopen details', async () => { await detail().locator(':scope > summary').click(); await detail().locator(':scope > summary').click(); });
  assert.equal(await f.page.evaluate(() => window.__comparisonWorkerMessages.length), count);
  await readonly('Hide/recompare', async () => { await button('Compare V1 tolerance 0.1', panel()).click(); await detail().waitFor({ state: 'hidden' }); await button('Compare V1 tolerance 0.1', panel()).click(); await expanded(); });
  await button('Undo').click(); await f.same(v1); await expanded(); assert.doesNotMatch(await detail().innerText(), /0\.05/);
  await button('Redo').click(); await f.same(v2); await expanded(); assert.match(await detail().innerText(), /0\.05/);
  assert.equal((await storage()).log, v1Bytes.log); assert.deepEqual((await storage()).snapshots, v1Bytes.snapshots);
  await version('V2 tolerance 0.05');
  const saved = await storage(), versions = JSON.parse(saved.log).versions;
  const v2id = versions.find(v => v.name === 'V2 tolerance 0.05').id;
  await readonly('Saved-target scope excluded', async () => { await panel().getByLabel('Compare to', { exact: true }).selectOption(v2id); await detail().waitFor({ state: 'hidden' });
    await panel().getByLabel('Compare to', { exact: true }).selectOption(''); await expanded(); });
  await f.snapshot('01-working-tolerance-detail');
  await button('Close project', panel()).click(); await detail().waitFor({ state: 'hidden' }); await f.page.reload(); await f.ready();
  await attach(); await button('Open ' + file, panel()).click(); await f.same(v2);
  assert.deepEqual(await storage(), saved);
  await readonly('Fresh project compare', async () => { await button('Compare V1 tolerance 0.1', panel()).click(); await expanded(); });
  assert.match(await detail().innerText(), /0\.05/); assert.ok((await detail().innerText()).includes(dimension));
  await f.snapshot('02-fresh-project-compare');
  f.report.observations.push({ dimension, companion: companion.id, views: { from: 'front', companion: 'top' }, expected: { from: 0.1, to: 0.05, unit: 'mm', volume: 1000 },
    logSHA256: sha256(saved.log), snapshots: Object.fromEntries(Object.entries(saved.snapshots).map(([k, text]) => [k, sha256(text)])), preserved: ['whole Doc', 'log bytes', 'snapshot keys/bytes', 'part bytes', 'selection', 'dirty', 'Undo/Redo state'] });
});
