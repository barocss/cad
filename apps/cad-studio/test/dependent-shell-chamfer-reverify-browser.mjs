import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const baseline = process.argv.includes('--baseline');
const shellPreview = process.argv.includes('--shell-preview');
const n2Old = 'n1.side[e1]', n2New = 'n1.side[s1]';
const n3Old = 'n1.side[e1]#3|n2.ceiling', n3New = 'n1.side[s1]#3|n2.ceiling';
const ref = node => ({ node, side: 'solid' });
const seed = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {},
  nodes: [
    { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [-20, -20], max: [60, 20], sideTags: { outer: ['e1', 'e2', 'e3', 'e4'] } },
    { id: 'n1', kind: 'extrude', sketch: 0, height: 12 },
    { id: 'n2', kind: 'shell', parent: ref(1), open: [n2Old], thickness: 2 },
    { id: 'n3', kind: 'chamfer', parent: ref(2), edges: [n3Old], distance: 0.5 },
  ],
  outputs: { b3: ref(3) }, nextId: 4,
};
const uBlockSketch = {
  id: 'n0', kind: 'sketch', profile: 'polygon',
  points: [[-20, -20], [10, -20], [10, 10], [30, 10], [30, -20], [60, -20], [60, 20], [-20, 20]],
  sideTags: { outer: ['s1', 's2', 's3', 's4', 's5', 'e2', 'e3', 'e4'] },
};

const files = [
  'apps/cad-studio/test/dependent-shell-chamfer-reverify-browser.mjs',
  'apps/cad-studio/src/state/referenceDecisions.ts',
  ...(shellPreview ? ['apps/cad-studio/src/App.tsx', 'apps/cad-studio/src/app/useStudioReferenceReview.ts', 'apps/cad-studio/src/ui/ReferenceDecisions.tsx'] : []),
];
const f = await createFlow({
  name: 'dependent-shell-chamfer-reverify', output: process.argv[2], envFrozen: 'D1992_SOURCE_FROZEN',
  qualification: 'Confirming a held non-finish parent (Shell) validates the rebuilt model and refreshes downstream held Chamfer candidates.',
  initialFiles: files, requiredFrozen: files,
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
} else if (input.previewFace) {
  const ev = evaluateDoc(input.doc, 1);
  if (!ev.ok || ev.bodies.length !== 1) throw Error('Expected one current source body');
  const faces=ev.bodies[0].mesh.faces.filter(face=>face.name===input.previewFace);
  if (faces.length!==1 || faces[0].kind!=='plane') throw Error('Expected one native planar candidate');
  console.log(JSON.stringify({key:ev.bodies[0].key,index:faces[0].index,name:faces[0].name,area:faces[0].area}));
} else console.log(JSON.stringify(inspect(input)));
`,
});

const button = name => f.page.getByRole('button', { name, exact: true });
const refs = () => f.page.getByRole('region', { name: 'References', exact: true });
const history = () => Promise.all(['Undo', 'Redo'].map(name => button(name).isEnabled()));
const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) < tol, `${a} vs ${b}`);
async function open(name, bytes) {
  const [picker] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await picker.setFiles({ name: name + '.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bytes)) });
  await f.page.waitForFunction(label => document.querySelector('.doc-tab input')?.value === label, name);
  await f.ready();
}
const shellExpected = 14656 - 16 * (4 - Math.PI);
let chamferedExpected = null;
async function native(label, doc, state) {
  const [model] = await f.inspect(label, doc);
  assert.ok(model.valid);
  assert.equal(model.topology.length, 1);
  assert.equal(model.topology[0].genus, 0);
  if (state === 'held') near(model.volume, 31200, 1e-7);
  else if (state === 'shell') near(model.volume, shellExpected, 1e-6);
  else if (state === 'both') {
    assert.ok(model.volume < shellExpected - 3 && model.volume > shellExpected - 4, `chamfer volume ${model.volume}`);
    if (chamferedExpected === null) chamferedExpected = model.volume;
    else near(model.volume, chamferedExpected, 1e-7);
  }
  f.report.observations.push({ label, volume: model.volume, method: model.method });
}

await f.run(async () => {
  f.phase = 'prepare exact signed Shell + Chamfer chain';
  const { doc } = await f.inspect('native-authored', { prepare: true, doc: seed });
  const edited = structuredClone(doc);
  edited.nodes[0] = uBlockSketch;

  await f.newPage();
  f.phase = 'open edited U-block holding both Shell (n2) and Chamfer (n3)';
  await open('d1992-shell-held', edited);
  const heldRows = refs().getByText('Choose a reference · Feature held', { exact: true });
  await heldRows.nth(1).waitFor();
  const bothHeld = await f.snapshot('01-shell-and-chamfer-held');
  assert.equal(bothHeld.doc.nodes[2].suppressed, true);
  assert.equal(bothHeld.doc.nodes[3].suppressed, true);
  await native('both-held', bothHeld.doc, 'held');

  if (shellPreview) {
    f.phase = 'preview the exact owned Shell opening in the visible model without committing';
    const stack = await history();
    await refs().getByRole('button', { name: /^Preview candidate 1 for Shell 2 mm \(n2\) in model/ }).click();
    await f.same(bothHeld.doc);
    assert.deepEqual(await history(), stack);
    const selected = await f.snapshot('01b-shell-opening-face-preview');
    assert.equal(selected.notices.length, 0);
    const expected = await f.inspect('preview-owner-native-face', { doc: selected.doc, previewFace: n2New });
    assert.equal(expected.key, 'b3');
    assert.equal(expected.area, 360);
    assert.deepEqual(selected.selection?.selection?.faces, [{ body: 0, face: expected.index }]);
    f.report.observations.push({ label: 'shell-opening-preview', ...expected });
    assert.equal(selected.selection?.selection?.edges?.length ?? 0, 0);
    assert.equal(selected.doc.nodes[2].suppressed, true);
    assert.equal(selected.doc.nodes[3].suppressed, true);
  }

  f.phase = 'confirm held Shell (n2) candidate 1 (n1.side[s1])';
  await refs().getByRole('button', { name: /^Use candidate 1 for Shell 2 mm \(n2\)/ }).click();
  await f.changed(bothHeld.doc);
  await f.ready();
  assert.equal(await heldRows.count(), 1);
  const n2Confirmed = await f.snapshot('02-shell-confirmed');
  assert.deepEqual(n2Confirmed.doc.nodes[2].open, [n2New]);
  assert.equal(n2Confirmed.doc.nodes[2].suppressed, undefined);
  assert.equal(n2Confirmed.doc.nodes[3].suppressed, true);
  assert.deepEqual(n2Confirmed.doc.nodes[3].edges, [n3Old]);
  await native('shell-confirmed', n2Confirmed.doc, 'shell');

  if (baseline) {
    f.phase = 'previous Studio leaves stale n1.side[s1]|n1.top candidate on n3 and fails Apply';
    assert.equal((await refs().innerHTML()).includes(n3New), false);
    await refs().getByRole('button', { name: /^Use candidate 1 for Chamfer 0\.5 \(n3\)/ }).click();
    await f.waitToast(/Reference not applied/);
    await f.same(n2Confirmed.doc);
    await f.snapshot('03-previous-stale-shell-candidate-failed');
    return;
  }

  f.phase = 'verify refreshed n1.side[s1]#3|n2.ceiling candidate and preview without changing doc or history';
  assert.ok((await refs().innerHTML()).includes(n3New), 'Refreshed downstream candidate should include n1.side[s1]#3|n2.ceiling');
  const stack = await history();
  await refs().getByRole('button', { name: /^Preview candidate 1 for Chamfer 0\.5 \(n3\)/ }).click();
  await f.same(n2Confirmed.doc);
  assert.deepEqual(await history(), stack);
  const previewed = await f.snapshot('03-refreshed-rim-preview');
  assert.equal(previewed.notices.length, 0);
  assert.equal(previewed.selection?.selection?.edges?.length, 1);

  f.phase = 'confirm refreshed downstream Chamfer (n3)';
  await refs().getByRole('button', { name: /^Use candidate 1 for Chamfer 0\.5 \(n3\)/ }).click();
  await refs().waitFor({ state: 'hidden' });
  await f.ready();
  const bothConfirmed = await f.snapshot('04-shell-and-chamfer-restored');
  assert.deepEqual(bothConfirmed.doc.nodes[2].open, [n2New]);
  assert.deepEqual(bothConfirmed.doc.nodes[3].edges, [n3New]);
  assert.equal(bothConfirmed.doc.nodes[3].suppressed, undefined);
  await native('both-restored', bothConfirmed.doc, 'both');

  f.phase = 'verify two-step Undo/Redo, native Save and fresh Open';
  await f.undo();
  await f.same(n2Confirmed.doc);
  assert.equal(await heldRows.count(), 1);
  assert.ok((await refs().innerHTML()).includes(n3New));
  await native('undo-1', await f.doc(), 'shell');

  await f.undo();
  await f.same(bothHeld.doc);
  assert.equal(await heldRows.count(), 2);
  await native('undo-2', await f.doc(), 'held');

  await f.redo();
  await f.same(n2Confirmed.doc);
  assert.equal(await heldRows.count(), 1);
  assert.ok((await refs().innerHTML()).includes(n3New));
  await native('redo-1', await f.doc(), 'shell');

  await f.redo();
  await f.same(bothConfirmed.doc);
  await refs().waitFor({ state: 'hidden' });
  await native('redo-2', await f.doc(), 'both');

  const { file } = await f.save('d1992-shell-chamfer-repaired');
  await f.newPage();
  const [picker] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await picker.setFiles(file);
  await f.ready();
  await f.same(bothConfirmed.doc);
  assert.equal(await refs().count(), 0);
  await native('fresh-open', await f.doc(), 'both');
  await f.snapshot('05-fresh-open');
});
