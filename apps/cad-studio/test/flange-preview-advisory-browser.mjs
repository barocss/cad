import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
import { clickModelCommand } from './model-rail-helper.mjs';

const pins = [
  'apps/cad-studio/test/flow-helper.mjs',
  'apps/cad-studio/test/model-rail-helper.mjs',
  'apps/cad-studio/src/App.tsx',
  'apps/cad-studio/src/app/commandState.ts',
  'apps/cad-studio/src/engine/client.ts',
  'apps/cad-studio/src/engine/engine.worker.ts',
  'apps/cad-studio/src/state/useCommandPreview.ts',
  'apps/cad-studio/src/ui/Hud.tsx',
  'packages/barocss-cad-model/src/app/sheetCommands.ts',
  'packages/barocss-cad-model/src/engine/evaluate.ts',
];
const f = await createFlow({
  name: 'flange-preview-advisory-1427', envFrozen: 'CAD27_FLANGE_ADVISORY_FROZEN', output: process.argv[2],
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Top Ortho native edge picking, early curved-edge refusal, advisory-only partial-width Flange preview, accepted solid, and Undo.',
  limits: ['Synthetic reconstructed obround rather than recovered historical document.', 'One rectangular relief and one full-width rectangular positive control. No DXF or manufacturing acceptance.'],
  inspectorSource: `
    import assert from 'node:assert/strict';
    import { readFileSync } from 'node:fs';
    import { evaluateDoc } from '@barocss/cad-model/engine/evaluate';
    const result = evaluateDoc(JSON.parse(readFileSync(process.argv[2], 'utf8')), 41);
    assert.ok(result.ok, JSON.stringify(result));
    assert.equal(result.bodies.length, 1);
    const { key, volume, flat, flatRefused, mesh } = result.bodies[0];
    console.log(JSON.stringify({ key, volume, flat, flatRefused, edges: mesh.edges.map(({index,names,straight}) => ({index,names,straight})) }));
  `,
});

const ref = node => ({ node, side: 'solid' });
const base = sketch => ({
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nodes: [
    { id:'n0', kind:'sketch', ...sketch },
    { id:'n1', kind:'sheet-base', sketch:0, thickness:1.5, bendRadius:1.5, kFactor:.44 },
  ], outputs: { b1:ref(1) }, nextId:2,
});
const obround = base({ profile:'loop', segments:[
  {kind:'line',start:[10,5]}, {kind:'arc',start:[45,5],center:[45,15],direction:'ccw'},
  {kind:'line',start:[45,25]}, {kind:'arc',start:[10,25],center:[10,15],direction:'ccw'},
] });
const rectangle = base({ profile:'rectangle', min:[0,0], max:[80,50] });
const button = (name, root = f.page) => root.getByRole('button', { name, exact:true });
const hud = () => f.page.getByRole('dialog', { name:'Flange', exact:true });
const preview = () => hud().locator('.hud-title .status.ok');
const warning = () => hud().getByRole('status').filter({ hasText:'No flat pattern for this Flange preview. The bend can still be applied.' });
const flat = () => f.page.getByRole('dialog', { name:'Flat pattern', exact:true });
const near = (actual, expected) => assert.ok(Math.abs(actual-expected)<1e-7, `${actual} != ${expected}`);

async function open(name, doc) {
  await f.page.getByLabel('Model file', { exact:true }).setInputFiles({ name, mimeType:'application/json', buffer:Buffer.from(JSON.stringify(doc)) });
  // Verify fixture by values; capture the Studio-normalized document for exact transaction checks.
  await f.page.waitForFunction(profile => window.__studioDoc?.nodes?.length === 2 && window.__studioDoc.nodes[0].profile === profile, doc.nodes[0].profile);
  await f.ready();
  const actual = await f.doc();
  assert.deepEqual(actual.nodes, doc.nodes);
  assert.deepEqual(actual.outputs, doc.outputs);
  return actual;
}
async function topEdges() {
  await button('Top', f.page.getByRole('group', { name:'Views', exact:true })).click();
  const ortho = button('Ortho');
  if (await ortho.getAttribute('aria-pressed') !== 'true') await ortho.click();
  await f.page.getByTitle('Frame all (F)', { exact:true }).click();
  const filter = button('Selection filter');
  for (let i=0;i<4 && !(await filter.innerText()).trim().endsWith('Edges'); i++) await filter.click();
  assert.match((await filter.innerText()).trim(), /Edges$/);
  await f.page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
}
async function pick(world, native, name, straight) {
  const candidates = native.edges.filter(e => e.names[0] === name);
  assert.equal(candidates.length, 1, name);
  assert.equal(candidates[0].straight, straight);
  const pixel = await f.page.evaluate(point => window.__studioScreenOf(point), world);
  assert.ok(pixel?.length===2 && pixel.every(Number.isFinite), JSON.stringify(pixel));
  await f.page.mouse.click(...pixel);
  await f.page.waitForFunction(index => {
    const edges = window.__studioSelection?.selection.edges;
    return edges?.length === 1 && edges[0].body === 0 && edges[0].edge === index;
  }, candidates[0].index, {timeout:5000});
  f.report.observations.push({ world, pixel, ...candidates[0] });
}
async function launch() {
  await clickModelCommand(f.page, 'Modify', 'Flange');
}
async function setPartial() {
  const field = name => hud().getByLabel(name, {exact:true});
  assert.equal(await field('Length').inputValue(),'20');
  await field('Offset at start').fill('5');
  await field('Offset at end').fill('5');
  await field('Relief').selectOption('rectangular');
  await field('Relief width (0: T, estimate)').fill('1.5');
  await field('Relief depth (0: T, estimate)').fill('1.5');
}
async function waitWarning() {
  await preview().waitFor();
  await warning().waitFor();
  assert.match(await warning().innerText(), /\[NON_NORMAL_CUT\]/);
  assert.equal(await button('Apply', hud()).isEnabled(), true);
}
async function showFlat(label, size) {
  await f.page.locator('.outliner .ol-row > button.ol').first().click();
  await button('Show the flat pattern').click();
  await flat().getByLabel('Flat pattern drawing', {exact:true}).waitFor();
  if (size) assert.ok((await flat().locator('.toast-hint').innerText()).startsWith(size + ' mm'));
  await f.snapshot(label);
  await button('Close the flat pattern', flat()).click();
  await flat().waitFor({state:'hidden'});
}

await f.run(async () => {
  f.phase = 'Reconstructed obround baseline and native curved rim pick';
  await f.newPage();
  const baseline = await open('obround-1427.bcad', obround);
  const native = await f.inspect('native-obround-base', baseline);
  near(native.volume, 1.5*(35*20+100*Math.PI));
  assert.deepEqual(native.flat.box,{min:[0,0],max:[55,20]});
  await showFlat('01-obround-base-flat', '55 × 20');
  await topEdges();
  await pick([55,15,1.5], native, 'n1.side1|n1.top', false);
  await launch();
  await f.waitToast(/Flange cannot use a curved edge\. Select a straight edge on the skin of the sheet instead\./, 5000);
  assert.equal(await hud().count(), 0);
  await f.same(baseline);
  await f.snapshot('02-curved-launch-refused-without-draft');
  await f.dismissToasts();

  f.phase = 'Pick straight rim, see advisory, and cancel without accepting the draft';
  await pick([26,25,1.5], native, 'n1.side2|n1.top', true);
  await launch();
  await hud().waitFor();
  await setPartial();
  await waitWarning();
  await f.same(baseline);
  await f.snapshot('03-partial-preview-warning-apply-enabled');
  await button('Cancel', hud()).click();
  await hud().waitFor({state:'hidden'});
  await f.same(baseline);

  f.phase = 'New Flange lifetime starts at defaults; re-enter partial draft and commit once';
  await pick([26,25,1.5], native, 'n1.side2|n1.top', true);
  await launch();
  await hud().waitFor();
  for (const name of ['Offset at start','Offset at end'])
    assert.equal(await hud().getByLabel(name,{exact:true}).inputValue(),'0');
  await setPartial();
  await waitWarning();
  await button('Apply', hud()).click();
  await hud().waitFor({state:'hidden'});
  await f.changed(baseline);
  const accepted = await f.doc();
  assert.equal(accepted.nodes.length,3);
  assert.deepEqual(accepted.nodes.slice(0,2),baseline.nodes);
  assert.deepEqual(accepted.nodes[2], {
    id:'n2', kind:'sheet-flange', parent:ref(1), edges:['n1.side2|n1.top'], length:20,
    offsets:[5,5], relief:{kind:'rectangular',width:1.5,depth:1.5},
    sigs:{'n1.side2|n1.top':{k:'line',p:[27.5,25,1.5],d:[-1,0,0],s:35}},
  });
  assert.deepEqual(accepted.outputs, {b2:ref(2)});
  const result = await f.inspect('native-obround-accepted', accepted);
  assert.equal(result.key,'b2');
  near(result.volume,2158.5248381117854);
  assert.equal(result.flat,undefined);
  assert.match(result.flatRefused,/^\[NON_NORMAL_CUT\]/);
  await f.snapshot('04-accepted-solid-flat-refused');

  f.phase = 'Undo restores the byte-equivalent Studio document and its visible 55 by 20 flat';
  await f.undo();
  await f.same(baseline);
  assert.deepEqual(await f.inspect('native-obround-undone',await f.doc()),native);
  await showFlat('05-undone-flat-restored', '55 × 20');

  f.phase = 'Supported rectangular full-width Flange shows no stale warning and produces Flat';
  const control = await open('rectangular-control.bcad', rectangle);
  const controlNative = await f.inspect('native-rectangle-base', control);
  await topEdges();
  await pick([40,50,1.5], controlNative, 'n1.side2|n1.top', true);
  await launch();
  await preview().waitFor();
  assert.equal(await warning().count(),0);
  assert.equal(await button('Apply', hud()).isEnabled(),true);
  await f.snapshot('06-rectangle-preview-clear');
  await button('Apply', hud()).click();
  await f.changed(control);
  const controlAccepted = await f.inspect('native-rectangle-accepted',await f.doc());
  assert.equal(controlAccepted.flatRefused,undefined);
  assert.equal(controlAccepted.flat?.bends.length,1);
  await showFlat('07-rectangle-accepted-flat');
  assert.deepEqual(f.report.downloads,[]);
});
