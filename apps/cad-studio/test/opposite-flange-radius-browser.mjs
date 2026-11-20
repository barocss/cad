import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const name = 'opposite-flange-radius.bcad', project = 'opposite-flange-radius-proof';
const ref = node => ({ node, side: 'solid' });
const flange = (index, side, bendRadius) => ({
  id: 'n' + index, kind: 'sheet-flange', parent: ref(index - 1),
  edges: ['n1.side' + side + '|n1.top'], length: 20, bendRadius,
});
const seed = { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nodes: [
  { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [80, 50] },
  { id: 'n1', kind: 'sheet-base', sketch: 0, thickness: 1.5, bendRadius: 1.5, kFactor: .44 },
  flange(2, 0, 2), flange(3, 2, 2),
], outputs: { b3: ref(3) }, nextId: 4 };
const pins = [
  'apps/cad-studio/test/opposite-flange-radius-browser.mjs', 'apps/cad-studio/src/App.tsx',
  'apps/cad-studio/src/ui/FlatPatternDialog.tsx', 'apps/cad-studio/src/ui/NodeEditor.tsx',
  'apps/cad-studio/src/state/oppositeFlangeRadiusHistory.ts', 'apps/cad-studio/src/state/historyFeatureApply.ts',
];
const f = await createFlow({
  name: 'opposite-flange-radius-1711', output: process.argv[2], envFrozen: 'CAD27_RADIUS_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Desktop Studio: opposite 90° Flange, individually-owned terminal radius, preview and exact persistence.',
  limits: ['Synthetic 80 × 50 × 1.5 mm base, opposite exact edges, no bend table or manufacturing acceptance.',
    'Private OPFS project only; no export or browser download.'],
  inspectorSource: `
    import assert from 'node:assert/strict';
    import {readFileSync} from 'node:fs';
    import {evaluateDoc} from '@barocss/cad-model/engine/evaluate';
    const doc=JSON.parse(readFileSync(process.argv[2],'utf8'));
    const result=evaluateDoc(doc,41); assert.ok(result.ok,JSON.stringify(result));
    assert.deepEqual(result.bodies.map(b=>b.key),['b3']);
    const {flat,sheetBendOwners:owners,sheet,volume}=result.bodies[0];
    assert.ok(flat&&sheet); assert.equal(owners.length,2); assert.equal(flat.bends.length,2);
    console.log(JSON.stringify({flat,owners,sheet,volume}));
  `,
});
const button = (name, inside = f.page) => inside.getByRole('button', { name, exact: true });
const dialog = () => f.page.getByRole('dialog', { name: 'Flat pattern', exact: true });
const field = () => f.editor().getByLabel('Bend radius', { exact: true });
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
const span = flat => flat.box.max.map((value, i) => value - flat.box.min[i]);

function nativeBend(report, id, radius) {
  const owners = report.owners.filter(x => x.featureId === id);
  assert.equal(owners.length, 1);
  assert.deepEqual(owners[0].faces, [id + '.bend.inner']);
  const rows = report.flat.bends.filter(x => JSON.stringify(x.faces) === JSON.stringify(owners[0].faces));
  assert.equal(rows.length, 1);
  near(rows[0].radius, radius);
  near(rows[0].allowance, Math.PI / 2 * (radius + .44 * 1.5));
  near(rows[0].angle, 90);
  return rows[0];
}
async function openFlat(label, radius) {
  const body = f.page.locator('.outliner .ol-row > button.ol').first();
  const show = button('Show the flat pattern');
  if (!(await show.isVisible())) await body.click();
  await show.click();
  const flat = dialog(); await flat.waitFor();
  assert.equal(await flat.getByLabel('Flat pattern drawing', { exact: true }).count(), 1);
  for (const id of ['n2', 'n3']) {
    const source = flat.getByLabel('Bend source ' + id, { exact: true });
    assert.match(await source.innerText(), new RegExp('own Flange ' + id));
    const matches = flat.locator('svg g[aria-label]').filter({ hasText: new RegExp('^' + id + ' ·') });
    assert.equal(await matches.count(), 1);
    assert.match(await matches.textContent(), new RegExp('R' + (id === 'n2' ? 2 : radius) + '$'));
  }
  await f.snapshot(label);
  return flat;
}
async function openRadius(flat, expected) {
  await button('Open Flange n3 in History', flat.getByLabel('Bend source n3', { exact: true })).click();
  await flat.waitFor({state:'hidden'}); await f.editor().waitFor();
  assert.equal(await f.page.locator('.history .hs[data-node-index="3"].edit').count(), 1);
  assert.equal(Number(await field().inputValue()), expected);
}
function projectPanel() { return f.page.getByRole('complementary', { name: 'Versions panel', exact: true }); }
async function projectOpen() {
  const panel = projectPanel();
  if (!(await panel.isVisible())) await button('Project and versions').click();
  if (await panel.getByLabel('Project', { exact: true }).isVisible()) return panel;
  await panel.getByRole('textbox', { name: 'Browser project name', exact: true }).fill(project);
  await button('Project in this browser', panel).click();
  await panel.getByLabel('Project', { exact: true }).waitFor();
  return panel;
}
async function saveAndReopen(expected) {
  const panel = await projectOpen();
  await button('Save').click();
  await panel.getByRole('list', { name: 'Project documents', exact: true }).getByText(name, { exact: true }).waitFor();
  await f.page.getByLabel('Unsaved changes', { exact: true }).waitFor({ state: 'hidden' });
  const saved = await f.page.evaluate(async ([project, name]) => {
    const root = await (await navigator.storage.getDirectory()).getDirectoryHandle('projects');
    const dir = await root.getDirectoryHandle(project);
    return (await (await dir.getFileHandle(name)).getFile()).text();
  }, [project, name]);
  assert.deepEqual(JSON.parse(saved), expected);
  await button('Close project', panel).click();
  await panel.getByLabel('Project', { exact: true }).waitFor({ state: 'hidden' });
  await f.page.reload();
  await f.page.waitForSelector('.viewport[data-renderer="webgpu"]');
  await f.ready();
  const freshPanel = await projectOpen();
  await button('Open ' + name, freshPanel).click();
  await f.same(expected);
}
function sameStableState(before, after) {
  for (const key of ['doc','selection','history']) assert.deepEqual(after[key],before[key],key);
  const accepted = ({fresh,massReady,bodies}) => ({fresh,massReady,bodies});
  assert.deepEqual(accepted(after.bodies), accepted(before.bodies));
}
await f.run(async () => {
  f.phase = 'Open exact opposite-flange model and match both original Flat and History owners';
  await f.newPage();
  await f.page.getByLabel('Model file', { exact: true }).setInputFiles({name, mimeType:'application/json', buffer:Buffer.from(JSON.stringify(seed))});
  await f.page.waitForFunction(() => window.__studioDoc?.nodes?.length === 4);
  await f.ready();
  const before = await f.doc();
  const next = structuredClone(before); next.nodes[3].bendRadius = 3;
  assert.equal(before.nodes[2].bendRadius,2); assert.equal(before.nodes[3].bendRadius,2);
  const n0 = await f.inspect('native-before', before);
  const earlier = nativeBend(n0,'n2',2); nativeBend(n0,'n3',2);
  await openRadius(await openFlat('01-both-r2',2),2);

  f.phase = 'Refuse R19 preview without changing accepted geometry, then recover exact R3 preview';
  const acceptedBefore = await f.snapshot('02-open-terminal-editor');
  await field().fill('19');
  await f.editor().getByText(/The bend radius preview is unavailable/).waitFor();
  assert.equal(await button('Apply',f.editor()).isEnabled(),false);
  const refused = await f.snapshot('03-r19-refused');
  sameStableState(acceptedBefore,refused);
  const status = await f.editor().getByRole('status').allTextContents();
  const notices = await f.toasts();
  await field().press('Enter');
  await f.page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.ok(await f.editor().isVisible());
  assert.equal(await field().inputValue(),'19');
  assert.equal(await button('Apply',f.editor()).isEnabled(),false);
  assert.deepEqual(await f.toasts(),notices);
  assert.deepEqual(await f.editor().getByRole('status').allTextContents(),status);
  sameStableState(refused,await f.snapshot('03b-r19-enter-blocked'));
  await field().fill('3');
  await f.editor().getByText('Bend radius preview',{exact:true}).waitFor();
  assert.equal(await button('Apply',f.editor()).isEnabled(),true);
  sameStableState(acceptedBefore,await f.snapshot('04-r3-preview'));

  f.phase = 'Apply R3 once and compare unrounded native flat shape';
  await button('Apply',f.editor()).click();
  await f.same(next);
  await f.closeEditor();
  const changed = await f.inspect('native-r3', next);
  assert.deepEqual(nativeBend(changed,'n2',2),earlier);
  nativeBend(changed,'n3',3);
  near(span(changed.flat)[0],span(n0.flat)[0]);
  near(span(n0.flat)[1]-span(changed.flat)[1],2-Math.PI/2);
  const updated = await openFlat('05-terminal-r3',3);
  await button('Close the flat pattern',updated).click();

  f.phase = 'Undo, Redo, project Save, fresh project Open and rerun native panel oracle';
  await f.undo(); await f.same(before);
  assert.deepEqual(await f.inspect('native-undone',await f.doc()),n0);
  await f.redo(); await f.same(next);
  assert.deepEqual(await f.inspect('native-redone',await f.doc()),changed);
  await saveAndReopen(next);
  assert.deepEqual(await f.inspect('native-fresh-open',await f.doc()),changed);
  await openFlat('06-fresh-open-terminal-r3',3);
  assert.deepEqual(f.report.downloads,[]);
});
