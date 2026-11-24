import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
import { seedJSON } from './hole-chamfer-lifecycle-oracles.mjs';

const baseline = process.argv.includes('--baseline');
const target = 'n1.side[e1]|n1.top';
const old = 'n1.side[retired]|n1.top';
const seed = JSON.parse(seedJSON);
seed.nodes[2] = { ...seed.nodes[2], edges: [old], sigs: { [old]: { k: 'line', p: [20, -24, 10], d: [1, 0, 0], s: 80 } },
  suppressed: true, held: 'Missing original Chamfer edge: ' + old };
seed.nodes.push({ id: 'n3', kind: 'hole', parent: { node: 2, side: 'solid' }, axis: 'z', side: 'max',
  face: 'n1.top', center: [20, 0], radius: 2 });
seed.outputs = { b3: { node: 3, side: 'solid' } };
seed.nextId = 4;

const files = [
  'apps/cad-studio/src/state/useHeldFinishEdge.ts', 'apps/cad-studio/src/state/heldFinishReplacement.ts',
  'apps/cad-studio/test/hole-chamfer-lifecycle-oracles.mjs',
];
const f = await createFlow({
  name: 'held-chamfer-through-hole', output: process.argv[2], envFrozen: 'D1902_SOURCE_FROZEN',
  qualification: 'Explicit History replacement of one held constant Chamfer before one disjoint top Through Hole.',
  initialFiles: files, requiredFrozen: files,
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep, faceGeometry } from '@barocss/cad';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const [{ brep }] = partBreps(doc);
console.log(JSON.stringify({
  mass: brepMassProperties(brep, 1), check: checkBrep(brep, { strict: true }),
  cylinders: brep.faces.flatMap(face => {
    const geometry = faceGeometry(face);
    return geometry.kind === 'cylinder' ? [{ name: face.name, ...geometry }] : [];
  }),
}));
`,
});
const button = (name, context = f.page) => context.getByRole('button', { name, exact: true });
const refs = () => f.page.getByRole('region', { name: 'References', exact: true });
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, actual + ' vs ' + expected);
const stack = () => Promise.all(['Undo', 'Redo'].map(name => button(name).isEnabled()));
const pick = async point => {
  const xy = await f.page.evaluate(point => window.__studioScreenOf(point), point);
  assert.ok(xy?.length === 2 && xy.every(Number.isFinite));
  assert.equal(await f.page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('.vp-canvas'), xy), true);
  await f.page.mouse.move(...xy);
  await f.page.mouse.click(...xy);
};
async function verify(label, state, repaired) {
  const doc = state.doc;
  assert.equal(state.bodies.bodies.length, 1);
  assert.equal(state.bodies.bodies[0].key, 'b3');
  assert.deepEqual(doc.nodes[3], seed.nodes[3]);
  const { mass, check, cylinders } = await f.inspect(label, doc);
  assert.ok(check.valid, check.issues.join('\n'));
  assert.equal(check.topology.length, 1);
  assert.equal(check.topology[0].genus, 1);
  assert.equal(cylinders.length, 2);
  for (const cylinder of cylinders) {
    near(cylinder.c[0], 20);
    near(cylinder.c[1], 0);
    near(cylinder.r, 2);
    assert.equal(cylinder.out, -1);
  }
  const wedge = repaired ? 360 : 0, removed = 40 * Math.PI, volume = 32000 - wedge - removed;
  near(mass.volume, volume);
  near(state.bodies.bodies[0].volume, volume);
  near(mass.centroid[0], 20);
  near(mass.centroid[1], wedge * 19 / volume);
  near(mass.centroid[2], (160000 - 9 * wedge - 5 * removed) / volume);
  f.report.observations.push({ label, volume, centroid: mass.centroid, topology: check.counts });
}

await f.run(async () => {
  f.phase = 'open the held constant Chamfer with an active Through Hole';
  await f.newPage();
  await f.page.getByLabel('Model file', { exact: true }).setInputFiles({
    name: 'held-chamfer-through-hole.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)),
  });
  await f.page.waitForFunction(() => window.__studioDoc?.nodes[3]?.kind === 'hole');
  await f.ready();
  await refs().waitFor();
  await button('Top').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await f.openFeatureEditor(2, 'Chamfer');
  const opened = await f.snapshot(baseline ? '00-no-history-replacement' : '01-held-chamfer-through-hole');
  await verify('before-native', opened, false);
  assert.equal(opened.doc.nodes[2].suppressed, true);
  assert.ok(opened.doc.nodes[2].held);
  const repick = button('Replace edge', f.editor());
  if (baseline) {
    assert.equal(await repick.count(), 0, 'Previous Studio exposes no replacement on the surviving Hole body');
    f.report.observations.push({ label: 'previous-absence', replaceEdge: 0 });
    return;
  }

  const history = await stack();
  const apply = () => button('Apply edge replacement', f.editor());
  f.phase = 'refuse the Hole rim';
  await repick.click();
  await pick([22, 0, 10]);
  await f.page.getByRole('alert').filter({ hasText: 'Edge not selected' }).waitFor();
  assert.equal(await apply().isEnabled(), false);
  await f.same(opened.doc);
  assert.deepEqual(await stack(), history);
  await f.snapshot('02-hole-rim-refused');

  f.phase = 'select the original straight lip and cancel';
  await pick([20, -20, 10]);
  await f.editor().getByText(target, { exact: true }).waitFor();
  assert.equal(await apply().isEnabled(), true);
  await f.same(opened.doc);
  assert.deepEqual(await stack(), history);
  await f.snapshot('03-original-lip-preview');
  await button('Cancel edge replacement', f.editor()).click();
  await f.same(opened.doc);
  assert.deepEqual(await stack(), history);

  f.phase = 'apply one explicit History replacement';
  await repick.click();
  await pick([20, -20, 10]);
  await f.editor().getByText(target, { exact: true }).waitFor();
  await apply().click();
  await f.page.waitForFunction(name => window.__studioDoc?.nodes[2]?.edges[0] === name, target);
  await f.ready();
  await refs().waitFor({ state: 'hidden' });
  const repaired = await f.snapshot('04-repaired-with-hole');
  const { held, suppressed, sigs, ...original } = opened.doc.nodes[2];
  assert.deepEqual(repaired.doc.nodes[2], { ...original, edges: [target], sigs: { [target]: JSON.parse(seedJSON).nodes[2].sigs[target] } });
  await verify('repaired-native', repaired, true);
  await f.closeEditor();
  await f.undo();
  await f.same(opened.doc);
  await refs().waitFor();
  await f.snapshot('05-undo-held-with-hole');
  await f.redo();
  await f.same(repaired.doc);
  await refs().waitFor({ state: 'hidden' });
  const { file } = await f.save('chamfer-through-hole');
  const reopened = await f.freshOpen(file, repaired.doc, '06-fresh-open-with-hole');
  await verify('reopened-native', reopened, true);
});
