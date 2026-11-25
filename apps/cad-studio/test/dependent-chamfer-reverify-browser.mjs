import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const baseline = process.argv.includes('--baseline');
const n2Old = 'n1.side[e1]|n1.side[e4]', n2New = 'n1.side[e4]|n1.side[e5]';
const n3Old = 'n1.side[e1]|n2.face', n3New = 'n1.side[e5]|n2.face';
const ref = node => ({ node, side: 'solid' });
const seed = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {},
  nodes: [
    { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [-20, -20], max: [60, 20], sideTags: { outer: ['e1', 'e2', 'e3', 'e4'] } },
    { id: 'n1', kind: 'extrude', sketch: 0, height: 10 },
    { id: 'n2', kind: 'chamfer', parent: ref(1), edges: [n2Old], distance: 4 },
    { id: 'n3', kind: 'chamfer', parent: ref(2), edges: [n3Old], distance: 1 },
  ],
  outputs: { b3: ref(3) }, nextId: 4,
};

const f = await createFlow({
  name: 'dependent-chamfer-reverify', output: process.argv[2], envFrozen: 'D1990_SOURCE_FROZEN',
  qualification: 'Confirming a held parent Chamfer refreshes the candidate of a downstream Chamfer built on its bevel edge.',
  initialFiles: [
    'apps/cad-studio/test/dependent-chamfer-reverify-browser.mjs',
    'apps/cad-studio/src/state/referenceDecisions.ts',
    'packages/barocss-cad-model/src/engine/references.ts',
  ],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { checkBrep, brepMassProperties } from '@barocss/cad';
import { partBreps, evaluateDoc } from '@barocss/cad-model/engine/evaluate';
import { captureSignatures } from '@barocss/cad-model/engine/references';
const input = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const inspect = doc => partBreps(doc).map(({ brep }) => {
  const check = checkBrep(brep, { strict: true });
  return { valid: check.valid, topology: check.topology, ...brepMassProperties(brep, 1) };
});
if (input.prepare) {
  const r1 = evaluateDoc({ ...input.doc, nodes: input.doc.nodes.slice(0, 2), outputs: { b1: { node: 1, side: 'solid' } } }, 1);
  if (!r1.ok) throw new Error(JSON.stringify(r1));
  let doc = captureSignatures(input.doc, r1.bodies);
  const r2 = evaluateDoc({ ...doc, nodes: doc.nodes.slice(0, 3), outputs: { b2: { node: 2, side: 'solid' } } }, 1);
  if (!r2.ok) throw new Error(JSON.stringify(r2));
  doc = captureSignatures(doc, r2.bodies);
  console.log(JSON.stringify({ doc, native: inspect(doc) }));
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
const n3Delta = 5 * Math.SQRT2 / 2;
async function native(label, doc, widthY, hasN2, hasN3) {
  const [model] = await f.inspect(label, doc);
  assert.ok(model.valid);
  assert.equal(model.method, 'planar-exact');
  assert.equal(model.topology.length, 1);
  assert.equal(model.topology[0].genus, 0);
  near(model.volume, 80 * widthY * 10 - (hasN2 ? 80 : 0) - (hasN3 ? n3Delta : 0));
}

await f.run(async () => {
  f.phase = 'prepare exact signed dependent Chamfer chain';
  const { doc } = await f.inspect('native-authored', { prepare: true, doc: seed });
  await f.newPage();

  f.phase = 'open original and same-owner metric edit';
  await open('d1990-original', doc, doc);
  assert.equal(await refs().count(), 0);
  await native('original', await f.doc(), 40, true, true);

  const changed = structuredClone(doc);
  changed.nodes[0].min[1] = -18;
  const resized = structuredClone(changed);
  await open('d1990-same-owner', resized, resized);
  assert.equal(await refs().count(), 0);
  await native('same-owner', await f.doc(), 38, true, true);

  changed.nodes[0].sideTags.outer[0] = 'e5';
  f.phase = 'open with retired sketch side holding both parent and dependent Chamfer';
  await open('d1990-retired', changed);
  const heldRows = refs().getByText('Choose a reference · Feature held', { exact: true });
  await heldRows.nth(1).waitFor();
  const bothHeld = await f.snapshot('01-both-chamfers-held');
  await native('both-held', bothHeld.doc, 38, false, false);

  f.phase = 'confirm parent Chamfer (n2)';
  await refs().getByRole('button', { name: /^Use candidate 1 for Chamfer 4 \(n2\)/ }).click();
  await f.changed(bothHeld.doc);
  assert.equal(await heldRows.count(), 1);
  const n2Confirmed = await f.snapshot('02-parent-chamfer-confirmed');
  assert.deepEqual(n2Confirmed.doc.nodes[2].edges, [n2New]);
  assert.equal(n2Confirmed.doc.nodes[2].suppressed, undefined);
  assert.equal(n2Confirmed.doc.nodes[3].suppressed, true);
  assert.deepEqual(n2Confirmed.doc.nodes[3].edges, [n3Old]);
  await native('n2-only', n2Confirmed.doc, 38, true, false);

  if (baseline) {
    f.phase = 'previous Studio leaves stale n1.side[e4]|n1.side[e5] candidate on n3 and fails Apply';
    await refs().getByRole('button', { name: /^Use candidate 1 for Chamfer 1 \(n3\)/ }).click();
    await f.waitToast(/Reference not applied/);
    await f.same(n2Confirmed.doc);
    await f.snapshot('03-previous-stale-candidate-failed');
    return;
  }

  f.phase = 'preview refreshed candidate n1.side[e5]|n2.face on n3 without changing doc or history';
  const stack = await history();
  await refs().getByRole('button', { name: /^Preview candidate 1 for Chamfer 1 \(n3\)/ }).click();
  await f.same(n2Confirmed.doc);
  assert.deepEqual(await history(), stack);
  const previewed = await f.snapshot('03-refreshed-candidate-preview');
  assert.equal(previewed.notices.length, 0);
  assert.equal(previewed.selection?.selection?.edges?.length, 1);

  f.phase = 'confirm refreshed candidate on dependent Chamfer (n3)';
  await refs().getByRole('button', { name: /^Use candidate 1 for Chamfer 1 \(n3\)/ }).click();
  await refs().waitFor({ state: 'hidden' });
  await f.ready();
  const bothConfirmed = await f.snapshot('04-both-chamfers-confirmed');
  assert.deepEqual(bothConfirmed.doc.nodes[2].edges, [n2New]);
  assert.deepEqual(bothConfirmed.doc.nodes[3].edges, [n3New]);
  assert.equal(bothConfirmed.doc.nodes[3].suppressed, undefined);
  await native('both-confirmed', bothConfirmed.doc, 38, true, true);

  f.phase = 'verify two-step Undo/Redo, native Save and fresh Open';
  await f.undo();
  await f.same(n2Confirmed.doc);
  assert.equal(await heldRows.count(), 1);
  await f.undo();
  await f.same(bothHeld.doc);
  assert.equal(await heldRows.count(), 2);
  await f.redo();
  await f.same(n2Confirmed.doc);
  await f.redo();
  await f.same(bothConfirmed.doc);
  await refs().waitFor({ state: 'hidden' });

  const { file } = await f.save('dependent-chamfer-reverify');
  await f.newPage();
  const [picker] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await picker.setFiles(file);
  await f.same(bothConfirmed.doc);
  assert.equal(await refs().count(), 0);
  await native('fresh-open', await f.doc(), 38, true, true);
  await f.snapshot('05-fresh-open');
});
