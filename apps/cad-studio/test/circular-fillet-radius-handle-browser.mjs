import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const baseline = process.argv.includes('--baseline');
const pins = [
  'apps/cad-studio/test/circular-fillet-radius-handle-browser.mjs',
  'apps/cad-studio/src/viewport/useCommandGizmos.ts',
  'apps/cad-studio/src/viewport/scalarHandleDrag.ts',
  'packages/barocss-cad-model/src/app/commands.ts',
  'packages/barocss-cad-model/src/engine/mesh.ts',
  'packages/barocss-cad-model/src/engine/nativeCircle.ts',
  'packages/barocss-cad-model/src/engine/evaluate.ts',
];
const inspectorSource = `
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
import { digestOf } from '@barocss/cad-model/util/digest';
import { brepMassProperties, checkBrep, curveDomain, evaluateCurve, surfaceDomain, surfaceEvaluator } from '@barocss/cad';

const doc=JSON.parse(readFileSync(process.argv[2],'utf8'));
const [{brep,key}]=partBreps(doc);
const [blend]=brep.faces.filter(face=>face.name==='n2.face');
assert.ok(blend && blend.surface.kind==='surface');
const {u:[u0,u1],v:[v0,v1]}=surfaceDomain(blend.surface), vm=(v0+v1)/2;
const at=surfaceEvaluator(blend.surface);
const thetaAt=u=>{const [x,y]=at(u,vm);return Math.atan2(y,x);};
const fractions=[0,.25,.5,.75,1];
const sections=fractions.map(fraction=>{
  const theta=fraction*Math.PI/2;
  assert.ok(thetaAt(u0)<theta && thetaAt(u1)>theta);
  let left=u0,right=u1;
  for(let i=0;i<58;i++){const mid=(left+right)/2;if(thetaAt(mid)<theta)left=mid;else right=mid;}
  return [v0,vm,v1].map(v=>at((left+right)/2,v));
});
const trimIds=new Set(brep.coedges.filter(use=>blend.loops.includes(use.loop)).map(use=>use.edge));
const trims=brep.edges.filter(edge=>trimIds.has(edge.id)).map(({curve})=>{
  const [a,b]=curveDomain(curve);
  return fractions.map(fraction=>evaluateCurve(curve,a+(b-a)*fraction));
});
console.log(JSON.stringify({key,sha:digestOf(brep),check:checkBrep(brep,{strict:true}),
  volume:brepMassProperties(brep,1).volume,sections,trims}));
`;
const f = await createFlow({
  name: 'circular-fillet-radius-handle',
  output: process.argv[2],
  envFrozen: 'CIRCULAR_FILLET_HANDLE_FROZEN',
  initialFiles: pins, requiredFrozen: pins, inspectorSource,
  qualification: 'Measure the new Constant Fillet handle against the original quarter-circle and drag it in Studio.',
  limits: ['One unplaced R8 quarter-sector extruded 10 mm, single open quarter-circle top edge, circular constant radius and orthographic desktop views. No synthetic selection or state writes.'],
});
const source = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {},
  nodes: [
    { id: 'n0', kind: 'sketch', profile: 'loop', segments: [
      { kind: 'line', start: [0, 0] },
      { kind: 'arc', start: [8, 0], center: [0, 0], direction: 'ccw' },
      { kind: 'line', start: [0, 8] },
    ] },
    { id: 'n1', kind: 'extrude', sketch: 0, height: 10 },
  ],
  outputs: { b1: { node: 1, side: 'solid' } }, nextId: 2,
};
const midpoint = [8 * Math.SQRT1_2, 8 * Math.SQRT1_2, 10];
const anchor = radius => [midpoint[0] + radius / 2, midpoint[1] + radius / 2, 10 + radius * Math.SQRT1_2];
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const hud = () => f.page.getByRole('dialog', { name: 'Fillet', exact: true });
const radiusInput = () => hud().getByLabel('Radius', { exact: true });
const handle = () => f.page.locator('g.gizmo-handle[data-handle="radius"] circle');
const screen = point => f.page.evaluate(p => window.__studioScreenOf(p), point);

async function frame(view) {
  await button(view, f.page.locator('.views')).click();
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await f.page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
}
async function preview() {
  await hud().locator('.status').filter({ hasText: /^preview$/ }).waitFor();
}
async function start() {
  await frame('Top');
  const canvas = await f.page.locator('.vp-canvas').boundingBox();
  await f.page.mouse.click(canvas.x + 8, canvas.y + 8);
  const filter = button('Selection filter');
  for (let i = 0; i < 6 && !(await filter.innerText()).includes('Edges'); i++) await filter.click();
  assert.match(await filter.innerText(), /Edges/);
  await f.worldClick(midpoint);
  await f.page.waitForFunction(() => window.__studioSelection?.selection?.edges?.length === 1);
  await f.command('Fillet');
  await radiusInput().fill('0.6');
  await preview();
  await handle().waitFor();
  assert.match(await hud().innerText(), /Picked native edges\s+1\b/);
}
async function measure(view, radius) {
  const expected = await screen(anchor(radius));
  const chord = await screen([4 + radius / 2, 4 + radius / 2, 10 + radius * Math.SQRT1_2]);
  const box = await handle().boundingBox();
  assert.ok(box);
  const actual = [box.x + box.width / 2, box.y + box.height / 2];
  const errorPx = Math.hypot(actual[0] - expected[0], actual[1] - expected[1]);
  const chordGapPx = Math.hypot(actual[0] - chord[0], actual[1] - chord[1]);
  const result = { view, radius, expected, actual, errorPx, chordGapPx };
  f.report.observations.push({ label: 'independent-circular-handle-anchor', ...result });
  await f.persist();
  return result;
}
async function applyAndRead() {
  await button('Apply', hud()).click();
  await f.changed(source);
  await f.ready();
  return f.doc();
}
async function verify(doc, label, radius) {
  assert.deepEqual(doc.nodes.slice(0, 2), source.nodes);
  assert.deepEqual(doc.nodes[2].edges, ['n1.side1|n1.top']);
  assert.equal(doc.nodes[2].radius, radius);
  assert.equal(doc.nodes[2].radii, undefined);
  const native = await f.inspect(label, doc);
  const [body] = (await f.bodies()).bodies;
  assert.equal(body.key, native.key);
  assert.ok(native.check.valid, JSON.stringify(native.check.issues));
  assert.equal(native.check.counts.bodies, 1);
  const removed = Math.PI / 2 * (8 * (1 - Math.PI / 4) * radius ** 2 - (5 / 6 - Math.PI / 4) * radius ** 3);
  const expectedVolume = 160 * Math.PI - removed;
  const volumeError = Math.max(Math.abs(native.volume - expectedVolume), Math.abs(body.volume - expectedVolume));
  assert.ok(volumeError < 2e-6, JSON.stringify({ expectedVolume, nativeVolume: native.volume, workerVolume: body.volume }));
  let sectionError = 0;
  assert.equal(native.sections.length, 5);
  for (const [i, points] of native.sections.entries()) {
    const theta = i * Math.PI / 8;
    assert.equal(points.length, 3);
    // The toroidal profile runs from the cylindrical contact to the planar contact.
    for (const [j, point] of points.entries()) {
      const phi = j * Math.PI / 4;
      const radial = 8 - radius + radius * Math.cos(phi);
      const expected = [radial * Math.cos(theta), radial * Math.sin(theta), 10 - radius + radius * Math.sin(phi)];
      sectionError = Math.max(sectionError, Math.hypot(...point.map((coordinate, k) => coordinate - expected[k])));
    }
  }
  assert.ok(sectionError < 2e-6, sectionError);
  const contacts = [
    ([x, y, z]) => Math.hypot(Math.hypot(x, y) - 8, z - (10 - radius)),
    ([x, y, z]) => Math.hypot(Math.hypot(x, y) - (8 - radius), z - 10),
    ([x, y, z]) => Math.hypot(x, Math.hypot(y - (8 - radius), z - (10 - radius)) - radius),
    ([x, y, z]) => Math.hypot(y, Math.hypot(x - (8 - radius), z - (10 - radius)) - radius),
  ];
  assert.equal(native.trims.length, 4);
  const trimId = points => contacts.findIndex(distance => points.every(point => distance(point) < 2e-6));
  assert.deepEqual(native.trims.map(trimId).sort(), [0, 1, 2, 3]);
  f.report.observations.push({ label, expectedVolume, nativeVolume: native.volume, workerVolume: body.volume, volumeError, sectionError });
  await f.persist();
  return native.sha;
}

await f.run(async () => {
  await f.newPage();
  await f.page.locator('input[aria-label="Model file"]').setInputFiles({
    name: 'quarter-sector.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(source)),
  });
  await f.same(source);
  f.phase = 'native arc anchor in Top and Iso';
  await start();
  const top = await measure('Top', .6);
  await f.snapshot(baseline ? '01-top-chord-baseline' : '01-top-exact-anchor');
  await frame('Iso');
  const iso = await measure('Iso', .6);
  await f.snapshot(baseline ? '02-iso-chord-baseline' : '02-iso-exact-anchor');
  if (baseline) {
    assert.ok(top.errorPx > 30 && top.chordGapPx < 2 && iso.errorPx > 10, JSON.stringify({ top, iso }));
    return;
  }
  assert.ok(top.errorPx < .75 && iso.errorPx < .75, JSON.stringify({ top, iso }));

  f.phase = 'actual radius drag from the native arc anchor';
  await frame('Top');
  const { actual } = await measure('Top before drag', .6);
  const from = await screen(anchor(.6)), to = await screen(anchor(1.6));
  await f.page.mouse.move(...actual);
  await f.page.mouse.down();
  await f.page.mouse.move(actual[0] + to[0] - from[0], actual[1] + to[1] - from[1], { steps: 6 });
  assert.match(await f.page.locator('.gizmo-readout').textContent(), /Radius 1\.5 mm/);
  await preview();
  await f.snapshot('03-circular-radius-held');
  await f.page.mouse.up();
  await f.same(source);
  assert.equal(Number(await radiusInput().inputValue()), 1.5);
  const released = await measure('Top after drag', 1.5);
  assert.ok(released.errorPx < .75, JSON.stringify(released));
  await frame('Iso');
  await f.snapshot('04-circular-fillet-preview');

  f.phase = 'native Apply, exact history, typed equivalence and fresh Open';
  const dragged = await applyAndRead();
  const nativeHash = await verify(dragged, '05-drag-applied', 1.5);
  await f.undo(); await f.same(source);
  await f.redo(); await f.same(dragged);
  assert.equal(await verify(dragged, '06-redo', 1.5), nativeHash);
  await f.undo(); await f.same(source);
  await start();
  await radiusInput().fill('1.5');
  await preview();
  const typed = await applyAndRead();
  await f.same(dragged);
  assert.equal(await verify(typed, '07-typed-equivalent', 1.5), nativeHash);
  const saved = await f.save('quarter-sector-fillet');
  await f.freshOpen(saved.file, saved.doc, '08-reopened');
  assert.equal(await verify(dragged, '09-reopened-native', 1.5), nativeHash);
});
