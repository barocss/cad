import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const solid = node => ({ node, side: 'solid' });
const outlet = 'n1.end';
const input = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 5,
  nodes: [
    { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [-2, -5], max: [2, 5],
      holes: [-2, 2].map(y => [[-1, y - 1], [-1, y + 1], [1, y + 1], [1, y - 1]].map(start => ({ kind: 'line', start }))),
      sideTags: { outer: ['e1', 'e2', 'e3', 'e4'], holes: [['e5', 'e6', 'e7', 'e8'], ['e9', 'e10', 'e11', 'e12']] } },
    { id: 'n1', kind: 'sweep-curve', sketch: 0, name: 'Paired duct', mode: 'exact',
      path: { degree: 2, knots: [0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 5],
        controlPoints: [[-10, 0, 0], [-5, 0, 0], [0, 0, 0], [12, 0, 0], [12, 12, 0], [12, 16, 0],
          [12, 20, 0], [12, 38, 0], [30, 38, 0], [33, 38, 0], [36, 38, 0]],
        weights: [1, 1, 1, Math.SQRT1_2, 1, 1, 1, Math.SQRT1_2, 1, 1, 1] } },
    { id: 'n2', kind: 'sketch', profile: 'rectangle', min: [40, 52], max: [45, 58] },
    { id: 'n3', kind: 'extrude', sketch: 2, height: 4, from: 10 },
    { id: 'n4', kind: 'translate', parent: solid(3), offset: [0, 0, 0] },
  ],
  outputs: { b1: solid(1), b4: solid(4) },
};
const pins = ['apps/cad-studio/test/paired-outlet-reference-plane-browser.mjs', 'apps/cad-studio/src/App.tsx',
  ...['engine/doc', 'engine/offsetPlane', 'app/nativeOffsetFace', 'app/offsetFaceEdit', 'app/profileCommands', 'app/offsetPlanePick']
    .map(path => `packages/barocss-cad-model/src/${path}.ts`)];
const f = await createFlow({
  name: 'paired-outlet-reference-plane', output: process.argv[2], envFrozen: 'D1854_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: '#17 moves the original five-span paired outlet to a live parallel native face in desktop Studio.',
  limits: ['One original five-span S-bend, one detached native donor and the original straight outlet.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep, faceGeometry } from '@barocss/cad';
import { evaluateDoc, partBreps } from '@barocss/cad-model/engine/evaluate';
import { digestOf } from '@barocss/cad-model/util/digest';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const evaluated = evaluateDoc(doc, 1);
if (!evaluated.ok) throw new Error(evaluated.error.detail);
const out = partBreps(doc).map(({key, brep}) => {
  const uses = new Map(brep.coedges.map(use => [use.id, use]));
  const edges = new Map(brep.edges.map(edge => [edge.id, edge]));
  const owners = new Map(brep.faces.flatMap(face => face.loops.map(id => [id, face.name])));
  const byEdge = new Map();
  for (const use of uses.values()) byEdge.set(use.edge, [...(byEdge.get(use.edge) ?? []), use]);
  const planes = Object.fromEntries(brep.faces.flatMap(face => {
    const plane = faceGeometry(face);
    if (plane.kind !== 'plane') return [];
    const faceLoops = brep.loops.filter(loop => face.loops.includes(loop.id));
    return [[face.name, { plane, holes: faceLoops.filter(loop => loop.kind === 'inner').length,
      points: faceLoops.flatMap(loop => loop.coedges.flatMap(id => edges.get(uses.get(id)!.edge)!.curve.controlPoints)) }]];
  }));
  const joins = [['lead','first'],['first','line'],['line','second'],['second','tail']].map(pair =>
    brep.edges.flatMap(edge => {
      const attached = byEdge.get(edge.id) ?? [], names = attached.map(use => owners.get(use.loop));
      return pair.every(piece => names.some(name => name?.startsWith('n1.' + piece + '.'))) ? [{ edge, attached }] : [];
    }));
  const display = evaluated.bodies.find(body => body.key === key)!;
  const incidence = [brep.faces, brep.edges, brep.vertices, brep.loops, brep.coedges]
    .map(records => records.map(record => [record.id, 'name' in record ? record.name : null]));
  return { key, hash: digestOf(brep), incidence, planes, joins, topology: checkBrep(brep, {strict:true}),
    mesh: display.mesh.faces.map(face => [face.name, face.index]), volume: brepMassProperties(brep,1).volume };
});
console.log(JSON.stringify(out));
`,
});
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const hud = name => f.page.getByRole('dialog', { name, exact: true });
const field = (scope, name) => scope.getByLabel(name, { exact: true });
const status = (scope, state) => scope.locator('.status').filter({ hasText: new RegExp(`^${state}$`) }).waitFor();
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) <= 1e-8, `${actual} vs ${expected}`);

async function view(name) {
  await button('View cube directions').click();
  await f.page.getByRole('menuitem', { name, exact: true }).click();
  await f.page.waitForFunction(label => {
    const labels = [...document.querySelectorAll('.view-cube .vc-label')];
    return labels.length === 1 && labels[0].textContent === label;
  }, name.toUpperCase());
  await f.page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
}

async function clickWorld(point) {
  const pixel = await f.page.evaluate(world => window.__studioScreenOf(world), point);
  assert.ok(pixel && await f.page.evaluate(p => document.elementFromPoint(...p)?.matches('canvas.vp-canvas'), pixel));
  await f.page.mouse.click(...pixel);
}

const open = (doc, name) => field(f.page, 'Model file').setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) });

async function verify(label, doc, original, key, face, x) {
  const records = await f.inspect(label, doc), part = records.find(record => record.key === key), donor = records.find(record => record.key === 'b4');
  assert.ok(part && donor && records.length === 2);
  assert.ok(part.topology.valid && donor.topology.valid);
  assert.deepEqual(part.topology.counts, { bodies: 1, shells: 1, faces: 62, loops: 66, coedges: 264, edges: 132, vertices: 72 });
  assert.equal(part.topology.topology[0].genus, 2);
  assert.deepEqual(part.joins.map(joins => joins.length), [12, 12, 12, 12]);
  assert.deepEqual(part.joins, original.joins);
  assert.deepEqual(part.incidence, original.incidence);
  assert.deepEqual(part.planes['n1.start'], original.planes['n1.start']);
  assert.equal(part.planes[outlet].holes, 2);
  const plane = donor.planes[face].plane;
  near(plane.o[0], x);
  const cap = part.planes[outlet];
  near(cap.plane.o[0], x);
  cap.points.forEach(point => near(point[0], x));
  const expected = 32 * (24 + x - 36 + 15 * Math.PI);
  near(part.volume, expected);
  near((await f.bodies()).bodies.find(body => body.key === key).volume, expected);
  f.report.observations.push({ label, x, donor: face, volume: part.volume, joins: 48, hash: part.hash, referenceHash: donor.hash });
  return { part, donor };
}

await f.run(async () => {
  await f.newPage();
  await open(input, 'paired-outlet-reference.bcad');
  await f.same(input);
  const inspect = await f.inspect('original', input), original = inspect.find(record => record.key === 'b1');
  const originalDonor = inspect.find(record => record.key === 'b4');
  const originalIndex = original.mesh.find(([name]) => name === outlet)[1];
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await view('Right');
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await clickWorld([36, 38, 0]);
  await f.page.waitForFunction(index => window.__studioSelection.selection.faces.some(face => face.face === index), originalIndex);
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.command('Offset face');
  const panel = hud('Offset face');
  await field(panel, 'Mode').selectOption('to-plane');
  await panel.getByText('Pick a parallel face on another solid', { exact: true }).waitFor();
  await view('Top');
  await clickWorld([42.5, 55, 14]);
  await status(panel, 'refused');
  assert.match(await panel.locator('.hud-error').innerText(), /parallel/i);
  assert.ok(await button('Apply', panel).isDisabled());
  await f.same(input);
  await f.snapshot('01-nonparallel-refused');
  await view('Left');
  await clickWorld([40, 55, 12]);
  await status(panel, 'preview');
  await panel.getByText('n3.side3', { exact: false }).waitFor();
  await f.same(input);
  await button('Apply', panel).click();
  await f.changed(input);
  await button('Iso', f.page.locator('.views')).click();
  const forward = (await f.snapshot('02-reference-applied')).doc, binding = forward.nodes[5];
  assert.deepEqual(binding.parent, solid(1));
  assert.deepEqual(binding.target.body, solid(4));
  assert.equal(binding.target.feature, 'n4');
  assert.ok(!Object.hasOwn(binding, 'distance'));
  assert.equal((await verify('forward', forward, original, 'b5', 'n3.side3', 40)).donor.hash, originalDonor.hash);

  await f.openFeatureEditor(4, 'move the same donor');
  await field(f.editor(), 'ΔX').fill('-8');
  const moved = (await f.applyEditor(forward, '03-donor-moved')).doc;
  assert.deepEqual(moved.nodes[5], binding);
  const inward = await verify('inward', moved, original, 'b5', 'n3.side3', 32);
  await f.openFeatureEditor(5, 'edit the outlet binding');
  await button('Edit offset', f.editor()).click();
  const edit = hud('Edit Offset face');
  assert.equal(await field(edit, 'Mode').inputValue(), 'to-plane');
  await view('Right');
  await clickWorld([37, 55, 12]);
  await status(edit, 'preview');
  await edit.getByText('n3.side1', { exact: false }).waitFor();
  await button('Apply', edit).click();
  await f.changed(moved);
  const rebound = (await f.snapshot('04-other-donor-face')).doc;
  assert.equal(rebound.nodes[5].id, binding.id);
  assert.equal(rebound.nodes[5].target.face, 'n3.side1');
  const shifted = await verify('retarget', rebound, original, 'b5', 'n3.side1', 37);
  assert.equal(shifted.donor.hash, inward.donor.hash);
  await f.undo();
  await f.same(moved);
  await f.redo();
  await f.same(rebound);
  const saved = await f.save('paired-outlet-reference');
  await f.freshOpen(saved.file, rebound, '05-fresh-open');
  assert.equal((await verify('reopened', rebound, original, 'b5', 'n3.side1', 37)).part.hash, shifted.part.hash);

  const collapsed = { ...rebound, nodes: rebound.nodes.map((node, index) => index === 4 ? { ...node, offset: [-15, 0, 0] } : node) };
  await open(collapsed, 'paired-outlet-collapse.bcad');
  await f.waitToast(/Your part is unchanged/i);
  await f.same(rebound);
  await f.snapshot('06-collapse-refused');
});
