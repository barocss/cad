import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

// Observation-only baseline: use existing References first; do not assume a missing recovery UI.
const pins = [
  'apps/cad-studio/test/two-edge-concave-reference-browser.mjs',
  'apps/cad-studio/test/flow-helper.mjs',
  'apps/cad-studio/src/App.tsx',
  'apps/cad-studio/src/state/heldFinishReplacement.ts',
  'apps/cad-studio/src/state/useHeldFinishEdge.ts',
  'apps/cad-studio/src/ui/ReferenceDecisions.tsx',
  'apps/cad-studio/src/ui/NodeEditor.tsx',
  'packages/barocss-cad-model/src/engine/references.ts',
  'packages/barocss-cad-model/src/engine/rematch.ts',
];
const oldEdge = 'n1.side1|n1.side2', retained = 'n1.side0|n1.side1', desired = 'n1.side2|n1.side3';
const oldPoints = [[0, 0], [20, 0], [20, 20], [15, 20], [15, 15], [5, 15], [5, 20], [0, 20]];
const newPoints = [[0, 0], [20, 0], [20, 5], [5, 5], [5, 20], [0, 20]];
const ref = node => ({ node, side: 'solid' });
const model = (points, edges) => ({
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {},
  nodes: [{ id: 'n0', kind: 'sketch', profile: 'polygon', points },
    { id: 'n1', kind: 'extrude', sketch: 0, height: 3 },
    { id: 'n2', kind: 'fillet', parent: ref(1), edges, radius: 2 }],
  outputs: { b2: ref(2) }, nextId: 3,
});
const f = await createFlow({
  name: 'two-edge-concave-reference', output: process.argv[2],
  envFrozen: 'TWO_EDGE_CONCAVE_REFERENCE_SOURCE_FROZEN', initialFiles: pins, requiredFrozen: pins,
  qualification: 'Observe whether existing individual References can recover one changed edge of a two-edge constant Fillet, with the other native line unchanged.',
  limits: ['Baseline only. Source model opened through the supported file UI; creation by viewport is NOT_RUN.',
    'Native original and explicit target must pass before browser claims. Two missing edges, varying/shaped Fillets and Chamfers are excluded.',
    'The inner corner is an explicit new target, not an inferred continuation. Withdraw the gap hypothesis if existing References restores it.'],
  inspectorSource: `
import {readFileSync} from 'node:fs';
import {partBreps,evaluatePart} from '@barocss/cad-model/engine/evaluate';
import {captureSignatures} from '@barocss/cad-model/engine/references';
import {checkBrep,brepMassProperties,faceGeometry} from '@barocss/cad';
const input=JSON.parse(readFileSync(process.argv[2],'utf8'));
function inspect(doc){return partBreps(doc).map(({key,brep})=>({key,valid:checkBrep(brep,{strict:true}).valid,
 kinds:brep.bodies.map(b=>b.kind),...brepMassProperties(brep,1),
 vertices:brep.vertices.map(v=>v.point),faces:brep.faces.map(f=>({name:f.name,...faceGeometry(f)}))}));}
function sign(doc){const prefix={...doc,nodes:doc.nodes.slice(0,2),outputs:{b1:{node:1,side:'solid'}}};
 const e=evaluatePart(prefix,1);if(!e.ok)throw Error('Native prefix refused: '+JSON.stringify(e));
 const signed=captureSignatures(doc,e.bodies);if(Object.keys(signed.nodes[2].sigs??{}).length!==doc.nodes[2].edges.length)throw Error('Missing captured native signature');
 return {doc:signed,native:inspect(signed)};}
console.log(JSON.stringify(input.prepare?{old:sign(input.old),target:sign(input.target),single:sign(input.single)}:inspect(input)));
`,
});
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const refs = () => f.page.getByRole('region', { name: 'References', exact: true });
const near = (a, b, tol = 1e-7) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
const xyz = (a, b) => Math.hypot(...a.map((v, i) => v - b[i])) < 1e-8;
function geometry(rows, volume, corners) {
  assert.equal(rows.length, 1); const n = rows[0];
  assert.ok(n.valid); assert.deepEqual(n.kinds, ['solid']); near(n.volume, volume);
  const cylinders = n.faces.filter(face => face.kind === 'cylinder');
  assert.equal(cylinders.length, corners.length);
  for (const { centre, contacts } of corners) {
    const matches = cylinders.filter(c => Math.hypot(c.c[0] - centre[0], c.c[1] - centre[1]) < 1e-8);
    assert.equal(matches.length, 1); near(matches[0].r, 2, 1e-8); near(Math.abs(matches[0].a[2]), 1, 1e-8);
    for (const [x, y] of contacts) for (const z of [0, 3])
      assert.ok(n.vertices.some(v => xyz(v, [x, y, z])), `missing tangency ${[x, y, z]}`);
  }
}
const convex = { centre: [18, 2], contacts: [[18, 0], [20, 2]] };
const oldTop = { centre: [18, 18], contacts: [[20, 18], [18, 20]] };
const concave = { centre: [7, 7], contacts: [[7, 5], [5, 7]] };
async function open(name, doc) {
  await f.newPage(); f.phase = 'Open ' + name;
  await f.page.locator('input[aria-label="Model file"]').setInputFiles({ name: name + '.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) });
  await f.page.waitForFunction(name => document.querySelector('.doc-tab input')?.value === name, name);
  await f.ready();
}
async function saveOpen(doc, label, volume, corners) {
  const saved = await f.save(label); assert.deepEqual(saved.doc, doc);
  await f.freshOpen(saved.file, saved.doc, label + '-reopened');
  const native = await f.inspect(label + '-reopened-native', await f.doc());
  geometry(native, volume, corners); return native;
}
async function candidateRows() {
  const groups = refs().getByRole('group'); const out = [];
  for (let i = 0; i < await groups.count(); i++) {
    const group = groups.nth(i), detail = group.locator('details');
    if (await detail.count() && !await detail.evaluate(e => e.open)) await detail.locator('summary').click();
    const text = await group.textContent();
    const lines = await group.locator('details .muted > div').allTextContents();
    out.push({ group: i, text, candidates: lines.map(line => /^Candidate (\d+): (.+)$/.exec(line.trim())).filter(Boolean).map(m => ({ number: Number(m[1]), name: m[2] })) });
  }
  return out;
}
await f.run(async () => {
  f.report.observations.push({ nativePreflight: 'NOT_RUN until inspector completes', browserRecovery: 'NOT_RUN' });
  f.phase = 'native preflight: genuine old signatures and both supported target corners';
  const prep = await f.inspect('00-native-preflight', { prepare: true,
    old: model(oldPoints, [oldEdge, retained]), target: model(newPoints, [desired, retained]),
    single: model(oldPoints, [oldEdge]) });
  geometry(prep.old.native, 1050 - 6 * (4 - Math.PI), [convex, oldTop]);
  geometry(prep.target.native, 525, [convex, concave]);
  geometry(prep.single.native, 1050 - 3 * (4 - Math.PI), [oldTop]);
  const signature = prep.old.doc.nodes[2].sigs[retained];
  assert.deepEqual(signature, prep.target.doc.nodes[2].sigs[retained]);
  assert.equal(signature.k, 'line'); assert.deepEqual(signature.p, [20, 0, 1.5]); near(signature.s, 3);
  near(Math.abs(signature.d[2]), 1); near(signature.d[0], 0); near(signature.d[1], 0);
  assert.deepEqual(prep.old.doc.nodes[2].sigs[oldEdge].p, [20, 20, 1.5]);
  f.report.observations.push({ nativePreflight: 'PASS', retainedNativeSignature: signature, oldNative: prep.old.native, explicitTargetNative: prep.target.native });
  await open('two-edge-original', prep.old.doc); await f.same(prep.old.doc);
  assert.equal(await refs().count(), 0); await f.snapshot('01-original-two-edge');
  const stale = structuredClone(prep.old.doc); stale.nodes[0].points = newPoints;
  await open('two-edge-upstream-changed', stale); await refs().waitFor();
  const before = await f.snapshot('02-two-edge-open-held');
  assert.deepEqual(before.doc.nodes.slice(0, 2), stale.nodes.slice(0, 2));
  assert.deepEqual(before.doc.nodes[2].edges, [oldEdge, retained]);
  assert.deepEqual(before.doc.nodes[2].sigs, stale.nodes[2].sigs);
  assert.equal(before.doc.nodes[2].suppressed, true);
  near(before.bodies.bodies[0].volume, 525);
  const rows = await candidateRows();
  assert.equal(rows.filter(r => r.text.includes('Choose a reference') || r.text.includes('Reference missing')).length, 1, 'Exactly one problem, not two missing edges');
  f.report.observations.push({ candidates: rows, held: before.doc.nodes[2].held, rematched: before.doc.nodes[2].rematched ?? null, historicalSignatures: before.doc.nodes[2].sigs });
  await f.snapshot('03-all-reference-candidates');
  const offered = rows.flatMap(row => row.candidates.map(candidate => ({ ...candidate, group: row.group }))).find(c => c.name === desired);
  if (offered) {
    await refs().getByRole('group').nth(offered.group).getByRole('button', { name: new RegExp('^Use candidate ' + offered.number + '(?: for |$)') }).click();
    await refs().waitFor({ state: 'hidden' }); await f.ready();
    const accepted = await f.snapshot('04-existing-reference-recovered');
    assert.deepEqual(accepted.doc.nodes[2].edges, [desired, retained]);
    assert.deepEqual(accepted.doc.nodes[2].sigs[retained], signature);
    assert.deepEqual(accepted.doc.nodes.slice(0, 2), stale.nodes.slice(0, 2));
    assert.deepEqual(accepted.doc.outputs, stale.outputs); assert.equal(accepted.doc.nextId, stale.nextId);
    assert.equal(accepted.doc.nodes[2].radius, 2); assert.equal(accepted.doc.nodes[2].suppressed, undefined);
    geometry(await f.inspect('05-recovered-native', accepted.doc), 525, [convex, concave]);
    await f.undo(); await f.same(before.doc); assert.deepEqual((await f.snapshot('06-undo-held')).history, before.history);
    await f.redo(); await f.same(accepted.doc);
    await saveOpen(accepted.doc, 'two-edge-confirmed', 525, [convex, concave]);
    f.report.observations.push({ desiredOffered: true, existingReferencesRecovery: 'PASS', gapHypothesis: 'WITHDRAWN', recoveryUndoRedoSaveOpen: 'PASS' });
  } else {
    await f.openFeatureEditor(2, 'held Fillet');
    assert.equal(await button('Replace edge', f.editor()).count(), 0);
    await f.snapshot('04-two-edge-manual-replacement-unavailable'); await f.closeEditor(); await f.same(before.doc);
    await saveOpen(before.doc, 'two-edge-held-preserved', 525, []);
    assert.deepEqual((await f.doc()).nodes[2].sigs, stale.nodes[2].sigs);
    f.report.observations.push({ desiredOffered: false, existingReferencesRecovery: 'NOT_RUN: desired not offered', manualReplacementOffered: false, gapHypothesis: 'OBSERVED only for this two-edge fixture' });
  }
  // Independent positive control: existing single-edge manual replacement, not a new capability.
  const singleStale = structuredClone(prep.single.doc); singleStale.nodes[0].points = newPoints;
  await open('single-edge-positive-control', singleStale); await refs().waitFor();
  const singleBefore = await f.snapshot('07-single-held');
  await button('View cube directions').click();
  await f.page.getByRole('menuitem', { name: 'Back right', exact: true }).click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await f.openFeatureEditor(2, 'held Fillet'); await button('Replace edge', f.editor()).click();
  const pixel = await f.page.evaluate(point => window.__studioScreenOf(point), [5, 5, 1.5]);
  assert.ok(await f.page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('canvas.vp-canvas'), pixel));
  await f.page.mouse.click(...pixel); await f.editor().getByText(desired, { exact: true }).waitFor();
  await f.same(singleBefore.doc); await button('Apply edge replacement', f.editor()).click();
  await refs().waitFor({ state: 'hidden' }); await f.ready();
  const singleAfter = await f.snapshot('08-single-control-recovered');
  assert.deepEqual(singleAfter.doc.nodes[2].edges, [desired]);
  geometry(await f.inspect('09-single-control-native', singleAfter.doc), 525 + 3 * (4 - Math.PI), [concave]);
  await f.undo(); await f.same(singleBefore.doc); await f.redo(); await f.same(singleAfter.doc);
  await saveOpen(singleAfter.doc, 'single-control-confirmed', 525 + 3 * (4 - Math.PI), [concave]);
  f.report.observations.push({ singleEdgeManualPositiveControl: 'PASS', productionChanges: false });
});
