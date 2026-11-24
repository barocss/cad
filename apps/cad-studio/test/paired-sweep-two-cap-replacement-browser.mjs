import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
import { pairedOutletFixture, tiltedDonor, tiltedInletDonor } from './paired-outlet-fixture.mjs';

const baseline = process.argv.includes('--baseline');
const reverse = process.argv.includes('--reverse');
const inletEnd = { name: 'inlet', cap: 0, face: 'n1.start', sourceView: 'Left', point: [-10, 0, 0],
  donorView: 'Right', donor: tiltedInletDonor, reference: 'n3.bottom', feature: 'n4', donorIndex: 4, shift: 1 };
const outletEnd = { name: 'outlet', cap: 1, face: 'n1.end', sourceView: 'Right', point: [36, 38, 0],
  donorView: 'Left', donor: tiltedDonor, reference: 'n6.bottom', feature: 'n7', donorIndex: 7, shift: -1 };
const [firstEnd, secondEnd] = reverse ? [outletEnd, inletEnd] : [inletEnd, outletEnd];
const solid = node => ({ node, side: 'solid' });
const inlet = pairedOutletFixture({ replace: true, inlet: true });
const outlet = pairedOutletFixture({ replace: true });
const seed = { ...inlet, nextId: 8, nodes: [
  ...inlet.nodes, { ...outlet.nodes[2], id: 'n5' },
  { ...outlet.nodes[3], id: 'n6', sketch: 5 },
  { ...outlet.nodes[4], id: 'n7', parent: solid(6) },
], outputs: { ...inlet.outputs, b7: solid(7) } };
const pins = [
  'apps/cad-studio/test/paired-outlet-fixture.mjs',
  'packages/barocss-cad/src/brep/exact-sweep.ts',
  'packages/barocss-cad-model/src/engine/doc.ts',
  'packages/barocss-cad-model/src/engine/offsetPlane.ts',
  'packages/barocss-cad-model/src/app/replaceFaceCommand.ts',
];
const f = await createFlow({
  name: 'paired-sweep-two-cap-replacement', output: process.argv[2], envFrozen: reverse ? 'D1892_SOURCE_FROZEN' : 'D1891_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: `Replace the original ${secondEnd.name} after one inward tilted ${firstEnd.name} on the same native paired Sweep.`,
  limits: [`An original five-span exact paired Sweep and two detached native planes. ${firstEnd.name} then ${secondEnd.name}.`],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep, faceGeometry } from '@barocss/cad';
import { evaluateDoc, partBreps } from '@barocss/cad-model/engine/evaluate';
import { digestOf } from '@barocss/cad-model/util/digest';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const result = evaluateDoc(doc, 1);
if (!result.ok) throw new Error(result.error.detail);
console.log(JSON.stringify(partBreps(doc).map(({ key, brep }) => {
  const faces = new Map(brep.faces.map(face => [face.name, face]));
  const caps = ['n1.start', 'n1.end'].flatMap(name => {
    const face = faces.get(name);
    if (!face) return [];
    const coedges = brep.coedges.filter(use => face.loops.includes(use.loop));
    const edges = brep.edges.filter(edge => coedges.some(use => use.edge === edge.id));
    return [{ name, plane: faceGeometry(face), holes: face.loops.length - 1,
      rim: [...new Set(edges.flatMap(edge => edge.vertices))].map(id => brep.vertices.find(vertex => vertex.id === id)!.point),
      native: digestOf({ face, coedges, edges }) }];
  });
  const owner = new Map(brep.faces.flatMap(face => face.loops.map(loop => [loop, face.name])));
  const joints = [['lead','first'],['first','line'],['line','second'],['second','tail']].map(pair =>
    brep.edges.flatMap(edge => {
      const uses = brep.coedges.filter(use => use.edge === edge.id);
      return uses.length === 2 && uses.every(use => use.pcurve)
        && pair.every(name => uses.some(use => owner.get(use.loop)?.startsWith('n1.' + name + '.')))
        ? [{ edge, uses }] : [];
    }));
  const strict = checkBrep(brep, { strict: true });
  const mesh = result.bodies.find(body => body.key === key)!.mesh.faces.map(face => [face.name, face.index]);
  return { key, caps, hash: digestOf(brep), mesh, valid: strict.valid, counts: strict.counts, genus: strict.topology[0].genus,
    joints: joints.map(group => group.length), jointHash: digestOf(joints),
    wallHash: digestOf(brep.faces.filter(face => face.name !== 'n1.start' && face.name !== 'n1.end')),
    incidence: digestOf([brep.faces, brep.edges, brep.loops, brep.coedges, brep.vertices].map(records =>
      records.map(record => [record.id, 'name' in record ? record.name : null]))), ...brepMassProperties(brep, 1) };
})));
`,
});
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const hud = () => f.page.getByRole('dialog', { name: 'Replace face', exact: true });
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} vs ${expected}`);

async function view(name) {
  await button('View cube directions').click();
  await f.page.getByRole('menuitem', { name, exact: true }).click();
  await f.page.waitForFunction(label => document.querySelector('.view-cube .vc-label')?.textContent === label, name.toUpperCase());
  await f.page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
}

async function pick(point) {
  const pixel = await f.page.evaluate(world => window.__studioScreenOf(world), point);
  assert.ok(pixel && await f.page.evaluate(p => document.elementFromPoint(...p)?.matches('canvas.vp-canvas'), pixel), JSON.stringify(point));
  await f.page.mouse.click(...pixel);
}

async function pickSource(viewName, point, original, face) {
  await view(viewName);
  const index = original.mesh.find(([name]) => name === face)[1];
  await pick(point);
  await f.page.waitForFunction(expected => window.__studioSelection.selection.faces.some(face => face.face === expected), index);
  await f.page.evaluate(() => document.activeElement?.blur());
}

async function apply(donorView, donor, reference, source, label) {
  await f.command('Replace face');
  const panel = hud();
  await view(donorView);
  await pick(donor.origin);
  await panel.locator('.status').filter({ hasText: /^preview$/ }).waitFor();
  await panel.getByText(reference, { exact: false }).waitFor();
  await f.same(source);
  await f.snapshot(label + '-preview');
  await button('Apply', panel).click();
  await f.changed(source);
  return (await f.snapshot(label + '-applied')).doc;
}

async function load(doc) {
  await f.openFile({ name: 'paired-sweep-two-cap.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) }, doc.nodes.length);
  await f.same(doc);
}

await f.run(async () => {
  await f.newPage();
  await load(seed);
  const base = (await f.inspect('01-original-native', seed)).find(part => part.key === 'b1');
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await view(firstEnd.sourceView);
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await pickSource(firstEnd.sourceView, firstEnd.point, base, firstEnd.face);
  const first = await apply(firstEnd.donorView, firstEnd.donor, firstEnd.reference, seed, `02-${firstEnd.name}`);
  assert.deepEqual(first.nodes[8].faces, [firstEnd.face]);
  const firstNative = (await f.inspect(`02-${firstEnd.name}-native`, first)).find(part => part.key === 'b8');
  near(firstNative.volume, 32 * (23 + 15 * Math.PI));
  await pickSource(secondEnd.sourceView, secondEnd.point, firstNative, secondEnd.face);
  if (baseline) {
    f.phase = `Reproduce unavailable Replace face on the untouched ${secondEnd.name} after the first edit`;
    await f.page.keyboard.press('Space');
    await f.page.locator('.palette input').fill('Replace face');
    const row = f.page.getByRole('option').filter({ has: f.page.getByText('Replace face', { exact: true }) });
    await row.waitFor();
    assert.match(await row.getAttribute('class'), /\boff\b/);
    await f.same(first);
    await f.snapshot(`03-${secondEnd.name}-unavailable-after-${firstEnd.name}`);
    return;
  }

  async function dual(label, doc, inletX, outletX) {
    const records = await f.inspect(label, doc);
    const part = records.find(part => part.key === 'b9');
    assert.ok(part?.valid && part.genus === 2);
    assert.deepEqual(part.counts, base.counts);
    assert.deepEqual(part.joints, [12, 12, 12, 12]);
    assert.equal(part.jointHash, base.jointHash);
    assert.equal(part.wallHash, base.wallHash);
    assert.equal(part.incidence, base.incidence);
    const [start, end] = part.caps;
    for (const [cap, intercept, originY] of [[start, inletX, 0], [end, outletX, 38]]) {
      assert.equal(cap.holes, 2);
      assert.equal(cap.rim.length, 12);
      cap.rim.forEach(([x, y]) => near(x, intercept + (y - originY) / 4));
    }
    const inletTrim = inletX + 10, outletTrim = 36 - outletX;
    const volume = 32 * (24 + 15 * Math.PI - inletTrim - outletTrim);
    near(part.volume, volume);
    near((await f.bodies()).bodies.find(body => body.key === 'b9').volume, volume);
    const mx = 32 * (270 * Math.PI + 64) + 320 * inletTrim - 16 * inletTrim ** 2
      - 1152 * outletTrim + 16 * outletTrim ** 2;
    const my = 32 * (252 * Math.PI + 536) - 1216 * outletTrim;
    part.centroid.forEach((value, axis) => near(value, [mx / volume, my / volume, 0][axis]));
    f.report.observations.push({ label, inletX, outletX, volume, centroid: part.centroid, joints: 48, bodySha256: part.hash });
    return part;
  }

  f.phase = `Replace the still-original ${secondEnd.name} with its independent tilted donor`;
  const second = await apply(secondEnd.donorView, secondEnd.donor, secondEnd.reference, first, `03-${secondEnd.name}`);
  assert.deepEqual(second.nodes.slice(0, 9), first.nodes);
  const savedBinding = second.nodes[9];
  assert.equal(savedBinding.kind, 'replace-face');
  assert.deepEqual(savedBinding.parent, solid(8));
  assert.deepEqual(savedBinding.faces, [secondEnd.face]);
  assert.equal(savedBinding.target.feature, secondEnd.feature);
  assert.equal(savedBinding.target.face, secondEnd.reference);
  const initialDual = await dual('03-dual-native', second, -9, 35);
  assert.equal(initialDual.caps[firstEnd.cap].native, firstNative.caps[firstEnd.cap].native);
  await button('Iso', f.page.locator('.views')).click();
  await f.snapshot('04-two-native-tilted-caps');

  f.phase = 'Move the first donor through both accepted Replace face features';
  await f.openFeatureEditor(firstEnd.donorIndex, `move the ${firstEnd.name} donor`);
  await f.editor().getByLabel('ΔX', { exact: true }).fill(String(firstEnd.shift));
  const moved = (await f.applyEditor(second, `05-${firstEnd.name}-donor-moved`)).doc;
  assert.deepEqual(moved.nodes.slice(8), second.nodes.slice(8));
  const movedInlet = reverse ? -9 : -8, movedOutlet = reverse ? 34 : 35;
  const updated = await dual('05-dual-recomputed', moved, movedInlet, movedOutlet);
  assert.equal(updated.caps[secondEnd.cap].native, initialDual.caps[secondEnd.cap].native);
  assert.notEqual(updated.caps[firstEnd.cap].native, initialDual.caps[firstEnd.cap].native);
  await f.undo();
  await f.same(second);
  await f.redo();
  await f.same(moved);
  const saved = await f.save('paired-sweep-two-tilted-caps');
  await f.freshOpen(saved.file, moved, '06-fresh-open');
  assert.equal((await dual('06-reopened-native', moved, movedInlet, movedOutlet)).hash, updated.hash);

  f.phase = 'Reject a stale first donor when opening the linked chain';
  const held = { ...moved, nodes: moved.nodes.map((node, i) => i === firstEnd.donorIndex ? { ...node, held: 'stale first donor' } : node) };
  await f.page.getByLabel('Model file', { exact: true }).setInputFiles({
    name: 'paired-sweep-held-first-donor.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(held)),
  });
  await f.waitToast(/available reference body.*Your part is unchanged/is);
  await f.same(moved);
  await f.snapshot('07-held-first-donor-refused');
});
