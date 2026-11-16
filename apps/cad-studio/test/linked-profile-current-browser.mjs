import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const baseline = process.argv.includes('--baseline');
const pins = ['apps/cad-studio/test/linked-profile-current-browser.mjs', 'apps/cad-studio/src/App.tsx'];
const f = await createFlow({ name: 'linked-profile-current', output: process.argv[2], envFrozen: 'LINKED_PROFILE_CURRENT_FROZEN',
  qualification: baseline ? 'Reproduce stale free associated inset profile picks after source width changes.' : 'Current associated inset profile picks follow the accepted source width.',
  limits: ['One free planar associated inset on a 40×24×8 box, source Width changed to 60. Real canvas hits; no injected selection.'],
  initialFiles: pins, requiredFrozen: pins });
const solid = node => ({ node, side: 'solid' });
const source = { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nodes: [
  { kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [40, 24], id: 'n0' },
  { kind: 'extrude', sketch: 0, height: 8, id: 'n1' },
  { kind: 'sketch', profile: 'polygon', points: [[0, 24], [0, 0], [40, 0], [40, 24]],
    holes: [[[2, 22], [2, 2], [38, 2], [38, 22]].map(start => ({ kind: 'line', start }))],
    sideTags: { outer: ['e1', 'e2', 'e3', 'e4'], holes: [['e5', 'e6', 'e7', 'e8']] },
    plane: { origin: [0, 0, 8], normal: [0, 0, 1], xAxis: [1, 0, 0] },
    association: { kind: 'planar-face-outline-inset', version: 1, source: solid(1), sourceFeature: 'n1', face: 'n1.top', insetMM: 2 },
    on: solid(1), id: 'n2' },
], outputs: { b1: solid(1) }, nextId: 3 };
const button = name => f.page.getByRole('button', { name, exact: true });
const settle = () => f.page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
async function hit(label, world, sketchExpected) {
  await f.page.keyboard.press('Escape');
  const pixel = await f.page.evaluate(p => window.__studioScreenOf(p), world);
  assert.equal(await f.page.evaluate(p => document.elementFromPoint(...p)?.matches('canvas.vp-canvas'), pixel), true, `${label}: unobstructed canvas`);
  await f.page.mouse.click(...pixel); await settle();
  const state = await f.page.evaluate(() => window.__studioSelection);
  const selectedSketch = state.selection.sketches?.includes(2) ?? false;
  const selectedFace = state.selection.faces?.length > 0;
  f.report.observations.push({ label, world, pixel, state, selectedSketch, selectedFace, sketchExpected });
  await f.snapshot(label);
  assert.equal(selectedSketch, sketchExpected, `${label}: exact free sketch selection`);
  assert.equal(selectedFace, !sketchExpected, `${label}: solid face fallback`);
}
await f.run(async () => {
  await f.newPage(); await f.page.setViewportSize({ width: 1440, height: 1000 });
  await f.openFile({ name: 'linked-profile-current.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(source)) }, 3);
  await f.same(source);
  await button('View cube directions').click();
  await f.page.getByRole('menuitem', { name: 'Top', exact: true }).click();
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await f.frame([[0, 0], [65, 24]]); await settle();
  await hit('01-original-strip', [39, 12, 8], true); await f.same(source);
  await f.openFeatureEditor(1);
  await f.editor().getByLabel('Width', { exact: true }).fill('60');
  await f.applyEditor(source, '02-source-width-60');
  const current = await f.doc();
  assert.equal(current.nodes[0].max[0], 60);
  assert.deepEqual(current.nodes[2], source.nodes[2], 'association remains authored, no implicit rewrite');
  assert.deepEqual(current.nodes[1], source.nodes[1]);
  await hit('03-current-strip', [59, 12, 8], !baseline); await f.same(current);
  await hit('04-old-strip', [39, 12, 8], baseline); await f.same(current);
  f.report.observations.push({ expectedCurrent: !baseline, result: 'both current and old strip assertions passed' });
  await f.undo(); await f.same(source); await hit('05-undo-original', [39, 12, 8], true);
  await f.redo(); await f.same(current); await hit('06-redo-current', [59, 12, 8], !baseline);
  if (!baseline) {
    await f.openFeatureEditor(1); await f.editor().getByLabel('Width', { exact: true }).fill('64');
    await f.applyEditor(current,'07-second-width-64'); const second=await f.doc();
    assert.deepEqual(second.nodes[2],source.nodes[2]);
    await hit('08-second-current-strip',[63,12,8],true); await hit('09-former-current-strip',[59,12,8],false);
    const saved=await f.save('linked-profile-width-64'); assert.deepEqual(saved.doc,second);
    await f.freshOpen(saved.file,second,'10-fresh-open');
    await button('View cube directions').click(); await f.page.getByRole('menuitem',{name:'Top',exact:true}).click();
    if(await button('Ortho').getAttribute('aria-pressed')!=='true') await button('Ortho').click();
    await f.frame([[0,0],[68,24]]); await settle();
    await hit('11-reopened-current-strip',[63,12,8],true); await hit('12-reopened-old-strip',[39,12,8],false); await f.same(second);
  }

});
