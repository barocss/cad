import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const baseline = process.argv.includes('--baseline');

const f = await createFlow({
  name: 'partial-held-constant-fillet', output: process.argv[2], envFrozen: 'D1984_SOURCE_FROZEN',
  qualification: 'One original edge disappears in a two-edge constant Fillet. The other edge retains its identity.',
  initialFiles: ['apps/cad-studio/test/partial-held-constant-fillet-browser.mjs',
    'packages/barocss-cad-model/src/engine/references.ts', 'apps/cad-studio/src/ui/ReferenceDecisions.tsx'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { checkBrep, brepMassProperties, faceGeometry } from '@barocss/cad';
import { partBreps, evaluateDoc } from '@barocss/cad-model/engine/evaluate';
import { captureSignatures, verifyReferences } from '@barocss/cad-model/engine/references';
const input = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const inspect = doc => partBreps(doc).map(({brep}) => ({
  valid: checkBrep(brep, {strict:true}).valid, volume: brepMassProperties(brep, 1).volume,
  cylinders: brep.faces.flatMap(f => { const g=faceGeometry(f);return g.kind==='cylinder'?[g]:[]; }),
}));
if (input.prepare) {
  const parent={...input.doc,nodes:input.doc.nodes.slice(0,2),outputs:{b1:{node:1,side:'solid'}}};
  const result=evaluateDoc(parent, 1);
  if (!result.ok) throw new Error(JSON.stringify(result));
  const doc=captureSignatures(input.doc, result.bodies);
  console.log(JSON.stringify({doc, edges:result.bodies[0].mesh.edges.map(e=>e.names), native:inspect(doc)}));
} else if (input.verify) {
  const result = await verifyReferences(input.verify, [], async doc => evaluateDoc(doc, 1));
  console.log(JSON.stringify(result));
} else console.log(JSON.stringify(inspect(input)));
`,
});
const ref = node => ({ node, side: 'solid' });
const authored = 'n1.side[e1]|n1.side[e4]', nearby = 'n1.side[e4]|n1.side[e5]', stable = 'n1.side[e2]|n1.side[e3]';
const seed = { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {},
  nodes: [{ id: 'n0', kind: 'sketch', profile: 'rectangle', min: [-20, -20], max: [60, 20], sideTags: { outer: ['e1', 'e2', 'e3', 'e4'] } },
    { id: 'n1', kind: 'extrude', sketch: 0, height: 10 },
    { id: 'n2', kind: 'fillet', parent: ref(1), edges: [authored, stable], radius: 2 }],
  outputs: { b2: ref(2) }, nextId: 3 };
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
  await f.page.waitForFunction(name => document.querySelector('.doc-tab input')?.value === name, name);
  await f.ready();
  if (expected) await f.same(expected);
}
async function native(label, doc, widthY, rounded) {
  const [model] = await f.inspect(label, doc);
  assert.ok(model.valid);
  near(model.volume, 80 * widthY * 10 - (rounded ? 20 * (4 - Math.PI) : 0));
  assert.equal(model.cylinders.length, rounded ? 2 : 0);
  if (rounded) {
    for (const [x,y] of [[-18, 22-widthY], [58,18]]) {
      const faces = model.cylinders.filter(g => Math.abs(g.c[0]-x)<1e-7 && Math.abs(g.c[1]-y)<1e-7);
      assert.equal(faces.length, 1);
      near(faces[0].r, 2);
    }
  }
}
await f.run(async () => {
  f.phase = 'prepare exact authored source and native signatures';
  const { doc } = await f.inspect('native-authored', { prepare: true, doc: seed });
  assert.deepEqual(Object.keys(doc.nodes[2].sigs), [authored, stable]);
  await f.newPage();
  f.phase = 'open the original two-edge Fillet';
  await open('d1984-original', doc, doc);
  await native('original', await f.doc(), 40, true);
  const changed = structuredClone(doc);
  changed.nodes[0].min[1] = -18;
  const resized = structuredClone(changed);
  f.phase = 'open after a metric change on the same authored edge';
  await open('d1984-same-owner', resized, resized);
  assert.equal(await refs().count(), 0);
  await native('same-owner', await f.doc(), 38, true);
  changed.nodes[0].sideTags.outer[0] = 'e5';
  if (baseline) {
    const verification = await f.inspect('native-automatic-substitution', { verify: changed });
    assert.deepEqual(verification.changes.map(change => [change.was,change.now]), [[authored,nearby]]);
    assert.equal(verification.problems.length, 0);
    f.phase = 'previous Open refuses rather than offering the one missing reference';
    await pickFile('d1984-retired', changed);
    await f.waitToast(/Your part is unchanged/);
    await f.same(resized);
    await f.snapshot('01-previous-open-refused');
    return;
  }
  f.phase = 'open with a retired original and one plausible nearby edge';
  await open('d1984-retired', changed);
  await refs().waitFor();
  const held = await f.snapshot('02-before-user-choice');
  assert.deepEqual(held.doc.nodes[2].edges, [authored, stable], 'native Fillet may not adopt the nearby edge on Open');
  assert.equal(held.doc.nodes[2].suppressed, true);
  assert.equal(held.doc.nodes[2].rematched, undefined);
  assert.deepEqual(held.doc.nodes[2].sigs, changed.nodes[2].sigs);
  await native('unmodified-stock', held.doc, 38, false);
  assert.equal(await refs().getByText('Choose a reference · Feature held', { exact: true }).count(), 1);
  const stack = await history();
  f.phase = 'preview the replacement without accepting a different reference';
  await refs().getByRole('button', { name: /^Preview candidate 1 for / }).click();
  await f.same(held.doc);
  assert.deepEqual(await history(), stack);
  await f.snapshot('03-preview-only');
  f.phase = 'confirm only the missing reference';
  await refs().getByRole('button', { name: /^Use candidate 1/ }).click();
  await refs().waitFor({ state: 'hidden' });
  const applied = await f.snapshot('04-explicitly-confirmed');
  assert.deepEqual(applied.doc.nodes[2].edges, [nearby, stable]);
  assert.deepEqual(applied.doc.nodes[2].sigs[stable], changed.nodes[2].sigs[stable]);
  assert.equal(applied.doc.nodes[2].suppressed, undefined);
  await native('confirmed', applied.doc, 38, true);
  await f.undo();
  await f.same(held.doc);
  await refs().waitFor();
  await f.redo();
  await f.same(applied.doc);
  await refs().waitFor({ state: 'hidden' });
  const { file } = await f.save('confirmed-fillet');
  await f.newPage();
  const [picker] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await picker.setFiles(file);
  await f.same(applied.doc);
  await native('fresh-open', await f.doc(), 38, true);
  await f.snapshot('05-fresh-open');
});
