// #262 remaining bounded lifecycle, without repeating the output suite.
import assert from 'node:assert/strict';
import { createFlow, sha256 } from './flow-helper.mjs';
const f = await createFlow({ name: 'drawing-section-hatch-lifecycle', output: process.argv[2], envFrozen: 'SECTION_HATCH_LIFECYCLE_FROZEN', initialFiles: ['apps/cad-studio/test/drawing-section-hatch-lifecycle-browser.mjs'],
  qualification: 'Legacy single A OPFS persistence, parent-Top sheet movement/merge, pending-depth pointer protection.',
  limits: ['Own 20×10×8 mm box. No repeat SVG/DXF/PDF output suite. No source-edit/late-Worker or Open/New race claims. No native-folder storage or HOLD activation.'] });
const seed = { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nodes: [{ id: 'n0', kind: 'sketch', profile: 'rectangle', min: [0,0], max: [20,10] }, { id: 'n1', kind: 'extrude', sketch: 0, height: 8 }], outputs: { b1: { node: 1, side: 'solid' } }, nextId: 2,
  drawing: { sheet: 'A4', projection: 'third', scope: { kind: 'part' }, hidden: true, scale: 2, section: { y: 5 }, dimensions: [] } };
const project = 'Hatch lifecycle', file = 'legacy-section.bcad';
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const panel = () => f.page.getByRole('complementary', { name: 'Versions panel', exact: true });
const check = id => f.page.getByLabel(`Section ${id} hatch`, { exact: true });
const sections = doc => doc.drawing.sections ?? (doc.drawing.section ? [{ id: 'A', view: 'front', at: doc.drawing.section.y }] : []);
async function state() { return f.page.evaluate(() => ({ doc: structuredClone(window.__studioDoc), selection: structuredClone(window.__studioSelection), dirty: !!document.querySelector('[aria-label="Unsaved changes"]'), history: ['Undo','Redo'].map(x => { const b = document.querySelector(`button[aria-label="${x}"]`); return [b?.disabled, b?.getAttribute('data-tip')]; }), requests: window.__hatchLifeRequests.filter(x => x === 'drawing').length })); }
async function drawing() { await button('Drawing').click(); await f.page.waitForFunction(() => !!window.__studioDrawing?.() && window.__studioDrawing().sections.every(s => !s.error && s.rings > 0)); }
async function group(id) { return f.page.evaluate(id => { const g = document.querySelector(`svg[aria-label="Drawing sheet"] g.section[data-dim="${id}"]`); if (!g) return null;
  return { html: g.innerHTML, diagonal: [...g.querySelectorAll('line')].filter(e => e.getAttribute('x1') !== e.getAttribute('x2') && e.getAttribute('y1') !== e.getAttribute('y2')).length }; }, id); }
async function attach() { await button('Model').click(); if (!await panel().isVisible()) await button('Project and versions').click(); if (await panel().getByLabel('Project', { exact: true }).isVisible()) return; await panel().getByLabel('Browser project name', { exact: true }).fill(project); await button('Project in this browser', panel()).click(); await panel().getByLabel('Project', { exact: true }).waitFor(); }
async function savedBytes() { return f.page.evaluate(async ({ project, file }) => { const p = await (await (await navigator.storage.getDirectory()).getDirectoryHandle('projects')).getDirectoryHandle(project); return (await (await p.getFileHandle(file)).getFile()).text(); }, { project, file }); }
async function saveFresh(name) {
  await attach(); await panel().getByLabel('Version name', { exact: true }).fill(name); await button('Make version', panel()).click(); await panel().getByLabel('Version ' + name, { exact: true }).waitFor(); await f.page.getByLabel('Unsaved changes', { exact: true }).waitFor({ state: 'hidden' });
  const accepted = await f.doc(), bytes = await savedBytes(); assert.deepEqual(JSON.parse(bytes), accepted);
  await button('Close project', panel()).click(); await f.page.reload(); await f.ready(); await attach(); await button('Open ' + file, panel()).click(); await f.same(accepted); assert.equal(await savedBytes(), bytes); await drawing();
  f.report.observations.push({ savedFresh: name, bytesSHA256: sha256(bytes), drawing: accepted.drawing }); return accepted;
}
async function sheet(n) { await f.page.getByRole('tab', { name: `Sheet ${n}`, exact: true }).click(); await f.page.waitForTimeout(50); }
await f.run(async () => {
  const make = f.browser.newContext.bind(f.browser); f.browser.newContext = async options => { const c = await make(options); await c.addInitScript(() => { window.__hatchLifeRequests = []; const post = Worker.prototype.postMessage; Worker.prototype.postMessage = function (r, ...rest) { window.__hatchLifeRequests.push(r?.type); return post.call(this, r, ...rest); }; }); return c; };
  await f.newPage(); await f.page.getByLabel('Model file', { exact: true }).setInputFiles({ name: file, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) }); await f.page.waitForFunction(() => window.__studioDoc?.drawing?.section?.y === 5); await f.ready(); assert.deepEqual(await f.doc(), seed); await drawing();
  assert.ok((await group('A')).diagonal > 0); await check('A').uncheck(); await f.page.waitForFunction(() => window.__studioDoc.drawing.sections?.[0]?.hideHatch === true);
  let doc = await f.doc(); assert.equal(doc.drawing.section, undefined); assert.deepEqual(sections(doc), [{ id: 'A', view: 'front', at: 5, hideHatch: true }]); assert.equal((await group('A')).diagonal, 0);
  const hidden = await saveFresh('Legacy A hidden'); assert.equal((await group('A')).diagonal, 0); assert.equal(await check('A').isChecked(), false); await f.snapshot('01-legacy-A-fresh-hidden');
  await check('A').check(); await f.page.waitForFunction(() => window.__studioDoc.drawing.section?.y === 5 && !window.__studioDoc.drawing.sections); const shown = await f.doc(); assert.ok((await group('A')).diagonal > 0);
  await button('Undo').click(); await f.same(hidden); assert.equal((await group('A')).diagonal, 0); await button('Redo').click(); await f.same(shown);
  // Pending input must remain local when clicking the hatch label, not blur-commit a depth edit.
  const before = await state(), depth = f.page.getByLabel('Section Y', { exact: true }); await depth.fill('6'); assert.equal(await check('A').isDisabled(), true);
  const label = f.page.getByText('Section A hatch', { exact: true }); await label.scrollIntoViewIfNeeded(); const box = await label.boundingBox(); assert.ok(box); await f.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2); assert.equal(await depth.inputValue(), '6'); assert.equal(await depth.evaluate(el => el === document.activeElement), true); assert.deepEqual(await state(), before);
  await f.snapshot('02-pending-depth-click-preserved'); await depth.press('Enter'); await f.page.waitForFunction(() => window.__studioDoc.drawing.section?.y === 6); await button('Undo').click(); await f.same(shown);
  await check('A').uncheck(); await f.page.waitForFunction(() => window.__studioDoc.drawing.sections?.[0]?.hideHatch === true); await button('Add section').click(); await f.page.waitForFunction(() => window.__studioDoc.drawing.sections?.length === 2); await drawing();
  doc = await f.doc(); assert.deepEqual(sections(doc), [{ id: 'A', view: 'front', at: 5, hideHatch: true }, { id: 'B', view: 'top', at: -4 }]); const geometry = doc.nodes, definitions = sections(doc).map(({ hideHatch, ...rest }) => rest);
  await button('Add sheet').click(); const menu = f.page.locator('details.dw-sheet-set'); if (!await menu.evaluate(el => el.open)) await menu.locator(':scope > summary').click();
  await f.page.getByLabel('Move Top view to sheet', { exact: true }).selectOption('2'); await f.page.waitForFunction(() => window.__studioDoc.drawing.sheets?.[0]?.views.includes('top'));
  await sheet(2); await check('B').waitFor(); assert.equal(await group('A'), null); assert.ok((await group('B')).diagonal > 0); await check('B').uncheck(); await f.page.waitForFunction(() => window.__studioDoc.drawing.sections.find(s => s.id === 'B').hideHatch === true);
  const bothHidden = await f.doc(); await sheet(1); assert.equal(await group('B'), null); assert.equal((await group('A')).diagonal, 0); await check('A').check(); await f.page.waitForFunction(() => !window.__studioDoc.drawing.sections.find(s => s.id === 'A').hideHatch);
  const merged = await f.doc(); assert.deepEqual(merged.nodes, geometry); assert.deepEqual(sections(merged).map(({ hideHatch, ...rest }) => rest), definitions); assert.equal(sections(merged).find(s => s.id === 'B').hideHatch, true);
  await button('Undo').click(); await f.same(bothHidden); await button('Redo').click(); await f.same(merged); await sheet(2); assert.equal((await group('B')).diagonal, 0); await f.snapshot('03-sheet2-B-hidden-A-kept');
  await saveFresh('Split sheets merged hatch'); await sheet(1); assert.ok((await group('A')).diagonal > 0); assert.equal(await group('B'), null); await sheet(2); assert.equal((await group('B')).diagonal, 0); assert.equal(await group('A'), null); assert.deepEqual(await f.doc(), merged); await f.snapshot('04-fresh-split-sheet-flags');
  f.report.observations.push({ legacyCanonicalSaveFresh: 'PASS', pendingDepthPointer: 'PASS; typed6/focus/accepted5/doc/dirty/Undo/selection/worker unchanged', sheetMovement: 'B follows parent Top to sheet2', crossSheetMerge: 'A on / B off, same IDs and cuts; Undo/Redo/fresh Open', outputSuite: 'NOT_REPEATED', lateSourceResponse: 'NOT_RUN' });
});
