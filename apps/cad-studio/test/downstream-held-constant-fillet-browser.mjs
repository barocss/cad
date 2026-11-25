import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const baseline = process.argv.includes('--baseline');

const f = await createFlow({
  name: 'downstream-held-constant-fillet', output: process.argv[2], envFrozen: 'D1985_SOURCE_FROZEN',
  qualification: 'One original edge disappears in a two-edge constant Fillet followed by an independent Through Hole. The other edge retains its identity.',
  initialFiles: ['apps/cad-studio/test/downstream-held-constant-fillet-browser.mjs',
    'packages/barocss-cad-model/src/engine/references.ts', 'apps/cad-studio/src/ui/ReferenceDecisions.tsx',
    'apps/cad-studio/src/state/referenceDecisions.ts', 'apps/cad-studio/src/files/documentFile.ts'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { checkBrep, brepMassProperties, faceGeometry } from '@barocss/cad';
import { partBreps, evaluateDoc } from '@barocss/cad-model/engine/evaluate';
import { captureSignatures, verifyReferences } from '@barocss/cad-model/engine/references';
const input = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const inspect = doc => partBreps(doc).map(({brep}) => {
  const check = checkBrep(brep, {strict:true});
  return {
    valid: check.valid, topology: check.topology, volume: brepMassProperties(brep, 1).volume,
    cylinders: brep.faces.flatMap(f => { const g=faceGeometry(f); return g.kind==='cylinder'?[g]:[]; }),
  };
});
if (input.prepare) {
  const parent={...input.doc,nodes:input.doc.nodes.slice(0,2),outputs:{b1:{node:1,side:'solid'}}};
  const result=evaluateDoc(parent, 1);
  if (!result.ok) throw new Error(JSON.stringify(result));
  const doc=captureSignatures(input.doc, result.bodies);
  console.log(JSON.stringify({doc, native:inspect(doc)}));
} else if (input.verify) {
  const result = await verifyReferences(input.verify, [], async doc => evaluateDoc(doc, 1));
  console.log(JSON.stringify(result));
} else console.log(JSON.stringify(inspect(input)));
`,
});
const ref = node => ({ node, side: 'solid' });
const authored = 'n1.side[e1]|n1.side[e4]', nearby = 'n1.side[e4]|n1.side[e5]', stable = 'n1.side[e2]|n1.side[e3]';
const holeNode = { id: 'n3', kind: 'hole', parent: ref(2), axis: 'z', side: 'max', face: 'n1.top', center: [20, 0], radius: 2 };
const seed = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {},
  nodes: [
    { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [-20, -20], max: [60, 20], sideTags: { outer: ['e1', 'e2', 'e3', 'e4'] } },
    { id: 'n1', kind: 'extrude', sketch: 0, height: 10 },
    { id: 'n2', kind: 'fillet', parent: ref(1), edges: [authored, stable], radius: 2 },
    holeNode,
  ],
  outputs: { b3: ref(3) }, nextId: 4,
};
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
async function native(label, doc, widthY, rounded, hole = { cx: 20, cy: 0, r: 2 }) {
  const [model] = await f.inspect(label, doc);
  assert.ok(model.valid);
  assert.equal(model.topology.length, 1);
  assert.equal(model.topology[0].genus, 1);
  near(model.volume, 80 * widthY * 10 - 10 * Math.PI * hole.r * hole.r - (rounded ? 20 * (4 - Math.PI) : 0));
  const holeFaces = model.cylinders.filter(g => g.out === -1 && Math.abs(g.c[0] - hole.cx) < 1e-7 && Math.abs(g.c[1] - hole.cy) < 1e-7);
  assert.equal(holeFaces.length, 2);
  for (const face of holeFaces) near(face.r, hole.r);
  const filletFaces = model.cylinders.filter(g => g.out === 1);
  assert.equal(filletFaces.length, rounded ? 2 : 0);
  if (rounded) {
    for (const [x, y] of [[-18, 22 - widthY], [58, 18]]) {
      const faces = filletFaces.filter(g => Math.abs(g.c[0] - x) < 1e-7 && Math.abs(g.c[1] - y) < 1e-7);
      assert.equal(faces.length, 1);
      near(faces[0].r, 2);
    }
  }
}

await f.run(async () => {
  f.phase = 'prepare exact authored source with downstream Through Hole and native signatures';
  const { doc } = await f.inspect('native-authored', { prepare: true, doc: seed });
  assert.deepEqual(Object.keys(doc.nodes[2].sigs), [authored, stable]);
  await f.newPage();

  f.phase = 'open the original two-edge Fillet with downstream Through Hole';
  await open('d1985-original', doc, doc);
  assert.equal(await refs().count(), 0);
  await native('original', await f.doc(), 40, true);

  const changed = structuredClone(doc);
  changed.nodes[0].min[1] = -18;
  const resized = structuredClone(changed);
  f.phase = 'open after a metric change on the same authored edge';
  await open('d1985-same-owner', resized, resized);
  assert.equal(await refs().count(), 0);
  await native('same-owner', await f.doc(), 38, true);

  changed.nodes[0].sideTags.outer[0] = 'e5';
  if (baseline) {
    const verification = await f.inspect('native-automatic-substitution', { verify: changed });
    assert.deepEqual(verification.changes.map(change => [change.was, change.now]), [[authored, nearby]]);
    assert.equal(verification.problems.length, 0);
    f.phase = 'previous Open refuses rather than offering the one missing reference before a downstream Hole';
    await pickFile('d1985-retired', changed);
    await f.waitToast(/Your part is unchanged/);
    await f.same(resized);
    await f.snapshot('01-previous-open-refused');
    return;
  }

  f.phase = 'open with a retired original edge, one plausible nearby edge, and surviving downstream Hole';
  await open('d1985-retired', changed);
  await refs().waitFor();
  const held = await f.snapshot('02-before-user-choice');
  assert.deepEqual(held.doc.nodes[2].edges, [authored, stable], 'native Fillet may not adopt the nearby edge on Open');
  assert.equal(held.doc.nodes[2].suppressed, true);
  assert.equal(held.doc.nodes[2].rematched, undefined);
  assert.deepEqual(held.doc.nodes[2].sigs, changed.nodes[2].sigs);
  assert.deepEqual(held.doc.nodes[3], holeNode);
  assert.equal(held.bodies.bodies.length, 1);
  assert.equal(held.bodies.bodies[0].key, 'b3');
  await native('held-with-hole', held.doc, 38, false);
  assert.equal(await refs().getByText('Choose a reference · Feature held', { exact: true }).count(), 1);
  const stack = await history();

  f.phase = 'preview the replacement on the downstream body without accepting a different reference';
  await refs().getByRole('button', { name: /^Preview candidate 1 for / }).click();
  await f.same(held.doc);
  assert.deepEqual(await history(), stack);
  const previewed = await f.snapshot('03-preview-only');
  assert.equal(previewed.notices.length, 0);
  assert.equal(previewed.selection?.selection?.edges?.length, 1);

  f.phase = 'confirm only the missing reference and rebuild the downstream Hole';
  await refs().getByRole('button', { name: /^Use candidate 1/ }).click();
  await refs().waitFor({ state: 'hidden' });
  await f.ready();
  const applied = await f.snapshot('04-explicitly-confirmed');
  assert.deepEqual(applied.doc.nodes[2].edges, [nearby, stable]);
  assert.deepEqual(applied.doc.nodes[2].sigs[stable], changed.nodes[2].sigs[stable]);
  assert.equal(applied.doc.nodes[2].suppressed, undefined);
  assert.equal(applied.doc.nodes[2].held, undefined);
  assert.deepEqual(applied.doc.nodes[3], holeNode);
  await native('confirmed-with-hole', applied.doc, 38, true);

  f.phase = 'verify Undo, Redo, native Save and fresh Open';
  await f.undo();
  await f.same(held.doc);
  await refs().waitFor();
  await native('undo-held-with-hole', await f.doc(), 38, false);
  await f.redo();
  await f.same(applied.doc);
  await refs().waitFor({ state: 'hidden' });
  const { file } = await f.save('confirmed-downstream-fillet');
  await f.newPage();
  const [picker] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await picker.setFiles(file);
  await f.same(applied.doc);
  assert.equal(await refs().count(), 0);
  await native('fresh-open-with-hole', await f.doc(), 38, true);
  await f.snapshot('05-fresh-open');

  f.phase = 'refuse confirmation when the restored Fillet breaks the downstream Hole';
  const cornerHole = structuredClone(changed);
  cornerHole.nodes[3] = { ...holeNode, center: [-19.7, -17.7], radius: 0.2 };
  await open('d1985-corner-hole-refusal', cornerHole);
  await refs().waitFor();
  const heldCorner = await f.doc();
  const cornerStack = await history();
  await native('held-corner-hole', heldCorner, 38, false, { cx: -19.7, cy: -17.7, r: 0.2 });
  await refs().getByRole('button', { name: /^Use candidate 1/ }).click();
  await f.waitToast(/Reference not applied/);
  await f.same(heldCorner);
  assert.deepEqual(await history(), cornerStack);
  await refs().waitFor();
  await f.snapshot('06-downstream-failure-refused');
  await f.dismissToasts();

  f.phase = 'refuse Open without substitution when a downstream feature depends on the held Fillet';
  const dependent = structuredClone(changed);
  dependent.nodes[3] = { id: 'n3', kind: 'chamfer', parent: ref(2), edges: ['n2.fillet0|n1.top'], distance: 0.5 };
  await pickFile('d1985-dependent-refusal', dependent);
  await f.waitToast(/Your part is unchanged/);
  await f.same(heldCorner);
});
