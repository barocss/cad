import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const baseline = process.argv.includes('--baseline');
const filletOld = 'n1.bottom|n1.side[e1]', filletNew = 'n1.bottom|n1.side[e5]', filletStable = 'n1.bottom|n1.side[e3]';
const chamferOld = 'n1.side[e1]|n1.top', chamferNew = 'n1.side[e5]|n1.top';
const ref = node => ({ node, side: 'solid' });
const seed = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {},
  nodes: [
    { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [-20, -20], max: [60, 20], sideTags: { outer: ['e1', 'e2', 'e3', 'e4'] } },
    { id: 'n1', kind: 'extrude', sketch: 0, height: 10 },
    { id: 'n2', kind: 'fillet', parent: ref(1), edges: [filletOld, filletStable], radius: 2 },
    { id: 'n3', kind: 'chamfer', parent: ref(2), edges: [chamferOld], distance: 1 },
  ],
  outputs: { b3: ref(3) }, nextId: 4,
};

const f = await createFlow({
  name: 'chained-held-fillet-chamfer', output: process.argv[2], envFrozen: 'D1988_SOURCE_FROZEN',
  qualification: 'One upstream sketch side retires while shared by both a two-edge constant Fillet and a downstream constant Chamfer.',
  initialFiles: [
    'apps/cad-studio/test/chained-held-fillet-chamfer-browser.mjs',
    'packages/barocss-cad-model/src/engine/references.ts',
    'apps/cad-studio/src/state/referenceDecisions.ts',
    'apps/cad-studio/src/files/documentFile.ts',
  ],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { checkBrep, brepMassProperties, faceGeometry } from '@barocss/cad';
import { partBreps, evaluateDoc } from '@barocss/cad-model/engine/evaluate';
import { captureSignatures, verifyReferences } from '@barocss/cad-model/engine/references';
const input = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const inspect = doc => partBreps(doc).map(({ brep }) => {
  const check = checkBrep(brep, { strict: true });
  return {
    valid: check.valid, topology: check.topology, volume: brepMassProperties(brep, 1).volume,
    cylinders: brep.faces.flatMap(face => { const g = faceGeometry(face); return g.kind === 'cylinder' ? [g] : []; }),
    bevels: brep.faces.flatMap(face => {
      const g = faceGeometry(face);
      return g.kind === 'plane' && Math.abs(g.n[1]) > 0.5 && Math.abs(g.n[2]) > 0.5 ? [g] : [];
    }),
  };
});
if (input.prepare) {
  const r1 = evaluateDoc({ ...input.doc, nodes: input.doc.nodes.slice(0, 2), outputs: { b1: { node: 1, side: 'solid' } } }, 1);
  if (!r1.ok) throw new Error(JSON.stringify(r1));
  let doc = captureSignatures(input.doc, r1.bodies);
  const r2 = evaluateDoc({ ...doc, nodes: doc.nodes.slice(0, 3), outputs: { b2: { node: 2, side: 'solid' } } }, 1);
  if (!r2.ok) throw new Error(JSON.stringify(r2));
  doc = captureSignatures(doc, r2.bodies);
  console.log(JSON.stringify({ doc, native: inspect(doc) }));
} else if (input.verify) {
  const result = await verifyReferences(input.verify, [], async doc => evaluateDoc(doc, 1));
  console.log(JSON.stringify(result));
} else console.log(JSON.stringify(inspect(input)));
`,
});
const button = name => f.page.getByRole('button', { name, exact: true });
const refs = () => f.page.getByRole('region', { name: 'References', exact: true });
const history = () => Promise.all(['Undo', 'Redo'].map(name => button(name).isEnabled()));
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} versus ${b}`);
async function pickFile(name, bytes) {
  const [picker] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await picker.setFiles({ name: name + '.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bytes)) });
}
async function open(name, bytes, expected) {
  await pickFile(name, bytes);
  await f.page.waitForFunction(label => document.querySelector('.doc-tab input')?.value === label, name);
  await f.ready();
  if (expected) await f.same(expected);
}
async function native(label, doc, widthY, rounded, beveled) {
  const [model] = await f.inspect(label, doc);
  assert.ok(model.valid);
  assert.equal(model.topology.length, 1);
  assert.equal(model.topology[0].genus, 0);
  near(model.volume, 80 * widthY * 10 - (rounded ? 160 * (4 - Math.PI) : 0) - (beveled ? 40 : 0));
  assert.equal(model.cylinders.length, rounded ? 2 : 0);
  if (rounded) {
    for (const y of [22 - widthY, 18]) {
      const faces = model.cylinders.filter(g => g.out === 1 && Math.abs(g.c[1] - y) < 1e-7 && Math.abs(g.c[2] - 2) < 1e-7);
      assert.equal(faces.length, 1);
      near(faces[0].r, 2);
    }
  }
  assert.equal(model.bevels.length, beveled ? 1 : 0);
}

await f.run(async () => {
  f.phase = 'prepare exact signed chained Fillet + Chamfer source';
  const { doc } = await f.inspect('native-authored', { prepare: true, doc: seed });
  assert.deepEqual(Object.keys(doc.nodes[2].sigs), [filletOld, filletStable]);
  assert.deepEqual(Object.keys(doc.nodes[3].sigs), [chamferOld]);
  await f.newPage();

  f.phase = 'open the original chained Fillet + Chamfer';
  await open('d1988-original', doc, doc);
  assert.equal(await refs().count(), 0);
  await native('original', await f.doc(), 40, true, true);

  const changed = structuredClone(doc);
  changed.nodes[0].min[1] = -18;
  const resized = structuredClone(changed);
  f.phase = 'open after a metric change on the same authored sketch side';
  await open('d1988-same-owner', resized, resized);
  assert.equal(await refs().count(), 0);
  await native('same-owner', await f.doc(), 38, true, true);

  changed.nodes[0].sideTags.outer[0] = 'e5';
  if (baseline) {
    const verification = await f.inspect('baseline-misses-downstream-chamfer', { verify: changed });
    assert.deepEqual(verification.changes, []);
    assert.deepEqual(verification.problems.map(p => [p.node, p.name, p.candidates]), [[2, filletOld, [filletNew]]]);
    f.phase = 'previous Open fails because downstream Chamfer was skipped while Fillet was not yet held';
    await pickFile('d1988-retired', changed);
    await f.waitToast(/Your part is unchanged/);
    await f.same(resized);
    await f.snapshot('01-previous-chained-open-refused');
    return;
  }

  f.phase = 'open with both chained finishes held and each offering its exact candidate';
  await open('d1988-retired', changed);
  const heldRows = refs().getByText('Choose a reference · Feature held', { exact: true });
  await heldRows.nth(1).waitFor();
  assert.equal(await heldRows.count(), 2);
  const bothHeld = await f.snapshot('02-both-chained-held');
  assert.deepEqual(bothHeld.doc.nodes[2].edges, [filletOld, filletStable]);
  assert.equal(bothHeld.doc.nodes[2].suppressed, true);
  assert.equal(bothHeld.doc.nodes[2].rematched, undefined);
  assert.deepEqual(bothHeld.doc.nodes[2].sigs, changed.nodes[2].sigs);
  assert.deepEqual(bothHeld.doc.nodes[3].edges, [chamferOld]);
  assert.equal(bothHeld.doc.nodes[3].suppressed, true);
  assert.equal(bothHeld.doc.nodes[3].rematched, undefined);
  assert.deepEqual(bothHeld.doc.nodes[3].sigs, changed.nodes[3].sigs);
  await native('both-held-stock', bothHeld.doc, 38, false, false);
  const stack = await history();

  f.phase = 'preview both candidates without changing document or history';
  await refs().getByRole('button', { name: /^Preview candidate 1 for Fillet R2 \(n2\)/ }).click();
  await f.same(bothHeld.doc);
  assert.deepEqual(await history(), stack);
  const previewed = await f.snapshot('03-preview-fillet-candidate');
  assert.equal(previewed.notices.length, 0);
  assert.equal(previewed.selection?.selection?.edges?.length, 1);

  f.phase = 'confirm Fillet (n2) first while Chamfer (n3) stays held';
  await refs().getByRole('button', { name: /^Use candidate 1 for Fillet R2 \(n2\)/ }).click();
  await f.changed(bothHeld.doc);
  assert.equal(await heldRows.count(), 1);
  const filletConfirmed = await f.snapshot('04-fillet-confirmed-chamfer-held');
  assert.deepEqual(filletConfirmed.doc.nodes[2].edges, [filletNew, filletStable]);
  assert.deepEqual(filletConfirmed.doc.nodes[2].sigs[filletStable], changed.nodes[2].sigs[filletStable]);
  assert.equal(filletConfirmed.doc.nodes[2].suppressed, undefined);
  assert.equal(filletConfirmed.doc.nodes[3].suppressed, true);
  await native('fillet-only', filletConfirmed.doc, 38, true, false);

  f.phase = 'confirm downstream Chamfer (n3) and rebuild full chain';
  await refs().getByRole('button', { name: /^Use candidate 1 for Chamfer 1 \(n3\)/ }).click();
  await refs().waitFor({ state: 'hidden' });
  await f.ready();
  const allConfirmed = await f.snapshot('05-both-confirmed');
  assert.deepEqual(allConfirmed.doc.nodes[2].edges, [filletNew, filletStable]);
  assert.deepEqual(allConfirmed.doc.nodes[3].edges, [chamferNew]);
  assert.equal(allConfirmed.doc.nodes[3].suppressed, undefined);
  await native('both-confirmed', allConfirmed.doc, 38, true, true);

  f.phase = 'verify two-step Undo/Redo, native Save and fresh Open';
  await f.undo();
  await f.same(filletConfirmed.doc);
  assert.equal(await heldRows.count(), 1);
  await f.undo();
  await f.same(bothHeld.doc);
  assert.equal(await heldRows.count(), 2);
  await f.redo();
  await f.same(filletConfirmed.doc);
  await f.redo();
  await f.same(allConfirmed.doc);
  await refs().waitFor({ state: 'hidden' });

  const { file } = await f.save('chained-fillet-chamfer');
  await f.newPage();
  const [picker] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await picker.setFiles(file);
  await f.same(allConfirmed.doc);
  assert.equal(await refs().count(), 0);
  await native('fresh-open', await f.doc(), 38, true, true);
  await f.snapshot('06-fresh-open');
});
