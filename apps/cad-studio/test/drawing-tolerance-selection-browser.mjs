import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';

const fixture = 'apps/cad-studio/test/fixtures/assembly-cut.bcad';
const pins = [
  fixture, 'apps/cad-studio/test/drawing-tolerance-selection-browser.mjs', 'apps/cad-studio/src/ui/drawing/ToleranceEditor.tsx',
  'apps/cad-studio/src/ui/DrawingWorkspace.tsx', 'apps/cad-studio/src/ui/drawing/ExportActions.tsx',
  'apps/cad-studio/src/App.tsx', 'apps/cad-studio/src/ui/drawing/DimensionsList.tsx',
];
const f = await createFlow({
  name: 'drawing-tolerance-selection', output: process.argv[2], envFrozen: 'TOLERANCE_SELECTION_SOURCE_FROZEN',
  qualification: 'Tolerance blur retains first-click dimension selection and original edit ownership.',
  limits: ['Two-occurrence assembly sheet, desktop Chrome 1024/1440; no full-suite claim.'],
  initialFiles: pins, requiredFrozen: pins,
});
const button = (name, within = f.page) => within.getByRole('button', { name, exact: true });
const mode = name => button(name, f.page.locator('.mode')).click();
const drawing = () => f.page.getByRole('complementary', { name: 'Drawing settings', exact: true });
const instance = () => f.page.getByRole('complementary', { name: 'Instance', exact: true });
const file = 'drawing-lost-dimension-delete.bcad';

async function saveToProject(doc, fileName) {
  const project = 'Tolerance selection regression', file = fileName + '.bcad';
  f.phase = 'local project Save ' + file;
  await f.page.locator('.doc-tab input').fill(fileName);
  const panel = f.page.getByRole('complementary', { name: 'Versions panel', exact: true });
  if (!await panel.isVisible()) await button('Project and versions').click();
  if (!await panel.getByLabel('Project', { exact: true }).isVisible()) {
    await panel.getByRole('textbox', { name: 'Browser project name', exact: true }).fill(project);
    await panel.getByRole('button', { name: 'Project in this browser', exact: true }).click();
    await panel.getByLabel('Project', { exact: true }).waitFor();
  }
  await button('Save').click();
  await panel.getByRole('list', { name: 'Project documents', exact: true }).getByText(file, { exact: true }).waitFor();
  const saved = await f.page.evaluate(async ({ project, file }) => {
    const root = await navigator.storage.getDirectory();
    const projects = await root.getDirectoryHandle('projects');
    const folder = await projects.getDirectoryHandle(project);
    return (await (await folder.getFileHandle(file)).getFile()).text();
  }, { project, file });
  assert.deepEqual(JSON.parse(saved), doc);
  f.report.files.push({ file, semanticEquality: true, destination: 'OPFS' });
  return Buffer.from(saved);
}


await f.run(async () => {
  const origin = new URL(f.server.resolvedUrls.local[0]).origin;
  const newContext = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async options => {
    const context = await newContext({ ...options, acceptDownloads: false, serviceWorkers: 'block' });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      return url.origin === origin ? route.continue() : route.abort();
    });
    return context;
  };
  for (const width of [1024, 1440]) {
  await f.newPage(); await f.page.setViewportSize({ width, height: 1000 });
  const doc = JSON.parse(await readFile(join(f.repo, fixture), 'utf8'));
  const holed = (part, radius) => ({
    ...part, nodes: [...part.nodes, { kind: 'hole', parent: { node: 1, side: 'solid' }, radius, center: [30, 20], face: 'n1.top', id: 'n2' }],
    outputs: { b2: { node: 2, side: 'solid' } }, nextId: 3,
  });
  doc.instances[0].doc = holed(doc.instances[0].doc, 4);
  Object.assign(doc.instances[1], { doc: holed(doc.instances[1].doc, 6), position: [76, -10, 5], part: { id: 'wide-plate', rev: 'A' } });
  doc.drawing = { sheet: 'A4', scope: { kind: 'assembly' }, projection: 'third', hidden: true, dimensions: [
    { id: 'd1', view: 'top', kind: 'diameter', edge: 'p1/n1.bottom|n2.side0#2', near: [30,20,0], place: [8,20] },
    { id: 'd2', view: 'top', kind: 'diameter', edge: 'p2/n1.bottom|n2.side0#1', near: [56,20,5], place: [80,20] },
  ] };
  const [open] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await open.setFiles({ name: file, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) });
  await f.page.waitForFunction(() => window.__studioDoc.drawing?.dimensions.length === 2);
  await f.ready();
  const stock = await f.doc();
  await mode('Drawing');
  await f.page.waitForFunction(() => window.__studioDrawing?.()?.dimensions.length === 2);
  const row = i => f.page.locator('.dw-dim').nth(i).locator('.dw-annotation-select');
  const tolerance = () => f.page.getByLabel('Tolerance', { exact: true });
  const value = () => f.page.getByLabel('Tolerance ±', { exact: true });
  f.phase = 'Escape discards first-owner tolerance draft before selecting second';
  await row(0).click(); await tolerance().selectOption('symmetric');
  await f.changed(stock); const symmetric = await f.doc();
  assert.deepEqual(symmetric.drawing.dimensions[0].tol, {kind:'symmetric',value:0.1});
  await value().fill('0.35'); await value().press('Escape');
  assert.equal(await value().inputValue(), '0.1');
  await row(1).click(); await f.same(symmetric);
  assert.equal(await tolerance().inputValue(), 'none');
  await row(0).click(); assert.equal(await value().inputValue(), '0.1');
  f.phase = 'Blur commits to old owner before the next dimension is selected';
  await value().fill('0.35');
  await f.page.evaluate(() => { window.__qaEvents=[]; for(const k of ['pointerdown','pointerup','click']) document.addEventListener(k,e=>window.__qaEvents.push({type:k,text:e.target.textContent?.slice(0,100),cls:e.target.className}),true); });
  await row(1).click(); await f.changed(symmetric);
  f.report.switchEvents = await f.page.evaluate(() => window.__qaEvents);
  f.report.firstSwitchKind = await tolerance().inputValue();
  await f.snapshot(`${width}-first-switch-after-blur`);
  assert.equal(await tolerance().inputValue(), 'none', 'first click must select d2 after blur reflow');
  assert.equal(await row(1).evaluate(element => element === document.activeElement), true, 'clicked row keeps focus after blur');

  const committed = await f.doc();
  assert.deepEqual(committed.drawing.dimensions[0].tol,{kind:'symmetric',value:0.35});
  assert.deepEqual(committed.drawing.dimensions[1],stock.drawing.dimensions[1]);
  assert.equal(await tolerance().inputValue(),'none');
  await f.snapshot(`${width}-blur-keeps-first-owner-second-selected`);
  await f.undo(); await f.same(symmetric); await f.redo(); await f.same(committed);
  f.phase = 'Second owner invalid draft refuses and switching retains first-owner tolerance';
  await row(1).click(); await tolerance().selectOption('symmetric');
  await f.changed(committed); const both = await f.doc();
  await value().fill('-1'); await row(0).click(); await f.same(both);
  assert.equal(await value().inputValue(),'0.35');
  await row(1).click(); assert.equal(await value().inputValue(),'0.1');
  await f.snapshot(`${width}-invalid-second-draft-owner-preserved`);
  await value().fill('0.22'); await value().press('Enter'); await f.changed(both);
  const accepted = await f.doc();
  assert.deepEqual(accepted.drawing.dimensions.map(d=>d.tol.value),[0.35,0.22]);
  await f.undo(); await f.same(both); await f.redo(); await f.same(accepted);
  await f.snapshot(`${width}-independent-tolerances-after-redo`);
  f.phase = 'Reverse reflow and keyboard selection';
  await row(0).click(); await value().fill('0.1'); await row(1).click();
  assert.equal(await value().inputValue(), '0.22', 'reverse reflow selects d2 on the first click');
  const reverse = await f.doc(); assert.deepEqual(reverse.drawing.dimensions.map(d => d.tol.value), [0.1, 0.22]);
  await f.undo(); await f.same(accepted); await f.redo(); await f.same(reverse);
  await row(0).click(); await value().fill('0.35'); await row(1).focus(); await row(1).press('Enter');
  assert.equal(await value().inputValue(), '0.22');
  await f.same(accepted);
  await row(0).focus(); await row(0).press('Space');
  assert.equal(await value().inputValue(), '0.35');
  await row(0).click(); await value().fill('0.4');
  const target = await row(1).boundingBox(); assert.ok(target);
  await f.page.mouse.move(target.x + target.width / 2, target.y + target.height / 2);
  await f.page.mouse.down(); await f.page.mouse.move(10, 10); await f.page.mouse.up();
  assert.equal(await value().inputValue(), '0.4', 'cancelled pointer leaves d1 draft focused');
  await value().press('Escape'); await f.same(accepted);
  await mode('Model');
  const saved = await saveToProject(accepted, `tolerance-${width}`);
  await f.newPage(); await f.page.setViewportSize({ width, height: 1000 });
  const [reopen] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await reopen.setFiles({ name: file, mimeType: 'application/json', buffer: saved });
  await f.same(accepted); await mode('Drawing');
  await f.page.waitForFunction(() => window.__studioDrawing?.()?.dimensions.length === 2);
  await row(0).click(); assert.equal(await value().inputValue(), '0.35');
  await row(1).click(); assert.equal(await value().inputValue(), '0.22');
  await f.snapshot(`${width}-saved-tolerances-reopened`);
  f.report.observations.push({ width, firstClickAfterBlurSelected: true, reverseReflow: true, keyboard: true, cancelledPointer: true, saveFreshOpen: true, escape: true, invalidDraftOwnerPreserved: true, undoRedo: true });
  }
  assert.deepEqual(f.report.downloads, []);
});
