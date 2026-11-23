import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const chamfer = process.argv.includes('--chamfer');
const finishName = chamfer ? 'Chamfer' : 'Fillet';
const manualBase = process.argv.includes('--manual-base');
const manual = process.argv.includes('--manual');
const dualBase = process.argv.includes('--dual-base');
const nativeRefusal = process.argv.includes('--dual-native-refusal');
const expectStaleNotice = process.argv.includes('--expect-stale-notice');
const dualManual = nativeRefusal || process.argv.includes('--dual-manual');
const dual = dualBase || dualManual;
const pins = [
  'apps/cad-studio/test/two-edge-concave-reference-browser.mjs',
  'apps/cad-studio/test/flow-helper.mjs',
  'apps/cad-studio/src/App.tsx',
  'apps/cad-studio/src/app/studioNotice.ts',
  'apps/cad-studio/src/state/heldFinishReplacement.ts',
  'apps/cad-studio/src/state/useHeldFinishEdge.ts',
  'apps/cad-studio/src/ui/ReferenceDecisions.tsx',
  'apps/cad-studio/src/ui/NodeEditor.tsx',
  'packages/barocss-cad-model/src/engine/references.ts',
  'packages/barocss-cad-model/src/engine/rematch.ts',
];
const oldEdge = 'n1.side1|n1.side2', retained = 'n1.side0|n1.side1', desired = 'n1.side2|n1.side3';
const frontTop = 'n1.side0|n1.top';
const height = nativeRefusal ? 1 : 3;
const targetVolume = 175 * height;
const oldBottom = dual ? -12 : 0;
const oldPoints = [[0, oldBottom], [20, oldBottom], [20, 20], [15, 20], [15, 15], [5, 15], [5, 20], [0, 20]];
const newPoints = [[0, 0], [20, 0], [20, 5], [5, 5], [5, 20], [0, 20]];
const ref = node => ({ node, side: 'solid' });
const model = (points, edges) => ({
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {},
  nodes: [{ id: 'n0', kind: 'sketch', profile: 'polygon', points },
    { id: 'n1', kind: 'extrude', sketch: 0, height },
    chamfer ? { id: 'n2', kind: 'chamfer', parent: ref(1), edges, distance: 2 }
      : { id: 'n2', kind: 'fillet', parent: ref(1), edges, radius: 2 }],
  outputs: { b2: ref(2) }, nextId: 3,
});
const f = await createFlow({
  name: chamfer ? 'two-edge-chamfer-reference' : 'two-edge-concave-reference', output: process.argv[2],
  envFrozen: chamfer ? 'D1768_SOURCE_FROZEN' : 'TWO_EDGE_CONCAVE_REFERENCE_SOURCE_FROZEN', initialFiles: pins, requiredFrozen: pins,
  qualification: nativeRefusal ? 'Keep both held references after a native Fillet refusal and recover in the same review.'
    : dual ? `Recover both changed edges of a saved two-edge ${finishName} together.`
    : 'Recover one changed edge of a two-edge constant Fillet, with the other native line unchanged.',
  limits: ['Source model opened through the supported file UI. Creation by viewport is NOT_RUN.',
    'Native original and explicit target must pass before browser claims. Terminal straight-edge pairs at one constant size.',
    'The inner corner is an explicit replacement target.'],
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
console.log(JSON.stringify(input.prepare?{old:sign(input.old),target:sign(input.target),single:sign(input.single),
 refusal:input.reject&&evaluatePart(input.reject,1)}:inspect(input)));
`,
});
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const refs = () => f.page.getByRole('region', { name: 'References', exact: true });
const near = (a, b, tol = 1e-7) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
const xyz = (a, b) => Math.hypot(...a.map((v, i) => v - b[i])) < 1e-8;
function geometry(rows, volume, corners) {
  assert.equal(rows.length, 1); const n = rows[0];
  assert.ok(n.valid); assert.deepEqual(n.kinds, ['solid']); near(n.volume, volume);
  if (chamfer) {
    for (const { contacts } of corners) {
      const p = contacts.map(([x, y]) => [x, y, 0]);
      const planar = n.faces.filter(face => face.kind === 'plane' && Math.abs(face.n[2]) < 1e-8
        && Math.abs(Math.abs(face.n[0]) - Math.SQRT1_2) < 1e-8 && Math.abs(Math.abs(face.n[1]) - Math.SQRT1_2) < 1e-8
        && p.every(a => Math.abs(a.reduce((sum, value, axis) => sum + (value - face.o[axis]) * face.n[axis], 0)) < 1e-8));
      assert.equal(planar.length, 1, JSON.stringify(contacts));
      for (const [x, y] of contacts) for (const z of [0, height])
        assert.ok(n.vertices.some(v => xyz(v, [x, y, z])), `missing bevel contact ${[x, y, z]}`);
    }
    return;
  }
  const cylinders = n.faces.filter(face => face.kind === 'cylinder');
  assert.equal(cylinders.length, corners.length);
  for (const { centre, contacts } of corners) {
    const matches = cylinders.filter(c => Math.hypot(c.c[0] - centre[0], c.c[1] - centre[1]) < 1e-8);
    assert.equal(matches.length, 1); near(matches[0].r, 2, 1e-8); near(Math.abs(matches[0].a[2]), 1, 1e-8);
    for (const [x, y] of contacts) for (const z of [0, height])
      assert.ok(n.vertices.some(v => xyz(v, [x, y, z])), `missing tangency ${[x, y, z]}`);
  }
}
const convex = { centre: [18, 2], contacts: [[18, 0], [20, 2]] };
const sourceConvex = { centre: [18, oldBottom + 2], contacts: [[18, oldBottom], [20, oldBottom + 2]] };
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
async function direction(name) {
  await button('View cube directions').click();
  await f.page.getByRole('menuitem', { name, exact: true }).click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await f.page.evaluate(async () => {
    let previous, settled = 0;
    for (let i = 0; i < 90 && settled < 4; i++) {
      await new Promise(requestAnimationFrame);
      const pixel = window.__studioScreenOf([5, 5, 1.5]);
      settled = previous && Math.hypot(pixel[0] - previous[0], pixel[1] - previous[1]) < 0.01 ? settled + 1 : 0;
      previous = pixel;
    }
    if (settled < 4) throw new Error('View has not settled');
  });
}
async function pick(point) {
  const pixel = await f.page.evaluate(point => window.__studioScreenOf(point), point);
  assert.ok(await f.page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('canvas.vp-canvas'), pixel));
  await f.page.mouse.click(...pixel);
}
await f.run(async () => {
  f.report.observations.push({ nativePreflight: 'NOT_RUN until inspector completes', browserRecovery: 'NOT_RUN' });
  f.phase = 'native preflight: genuine old signatures and both supported target corners';
  const prep = await f.inspect('00-native-preflight', { prepare: true,
    old: model(oldPoints, [oldEdge, retained]), target: model(newPoints, [desired, retained]),
    single: model(oldPoints, [oldEdge]), reject: nativeRefusal ? model(newPoints, [desired, frontTop]) : undefined });
  const oldVolume = (350 - 20 * oldBottom) * height;
  const removedVolume = height * (chamfer ? 2 : 4 - Math.PI);
  geometry(prep.old.native, oldVolume - 2 * removedVolume, [sourceConvex, oldTop]);
  geometry(prep.target.native, targetVolume, [convex, concave]);
  geometry(prep.single.native, oldVolume - removedVolume, [oldTop]);
  if (nativeRefusal) {
    assert.equal(prep.refusal.ok, false);
    assert.match(prep.refusal.error.detail, /RADIUS_EXCEEDS_FACE.*n1\.side0\|n1\.top.*walls of 1 and 5 mm/);
    f.report.observations.push({ rejectedNativePair: prep.refusal.error });
  }
  const signature = prep.old.doc.nodes[2].sigs[retained];
  if (!dual) assert.deepEqual(signature, prep.target.doc.nodes[2].sigs[retained]);
  assert.equal(signature.k, 'line'); assert.deepEqual(signature.p, [20, oldBottom, height / 2]); near(signature.s, height);
  near(Math.abs(signature.d[2]), 1); near(signature.d[0], 0); near(signature.d[1], 0);
  assert.deepEqual(prep.old.doc.nodes[2].sigs[oldEdge].p, [20, 20, height / 2]);
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
  near(before.bodies.bodies[0].volume, targetVolume);
  const rows = await candidateRows();
  assert.equal(rows.filter(r => r.text.includes('Choose a reference') || r.text.includes('Reference missing')).length, dual ? 2 : 1);
  f.report.observations.push({ candidates: rows, held: before.doc.nodes[2].held, rematched: before.doc.nodes[2].rematched ?? null, historicalSignatures: before.doc.nodes[2].sigs });
  await f.snapshot('03-all-reference-candidates');
  if (dualBase) {
    await f.openFeatureEditor(2, `two unresolved ${finishName} edges`);
    await f.editor().scrollIntoViewIfNeeded();
    assert.equal(await button('Replace edge', f.editor()).count(), 0);
    assert.equal(await button('Replace edges', f.editor()).count(), 0);
    await f.same(before.doc);
    await f.snapshot('04-dual-direct-replacement-unavailable');
    f.report.observations.push({ unresolvedEdges: 2, directPairedReplacement: 'FAIL: unavailable in History' });
    return;
  }
  if (dualManual) {
    const editor = f.editor();
    const replace = button('Replace edges', editor);
    const apply = button('Apply edge replacements', editor);
    const cancel = button('Cancel edge replacement', editor);
    const duplicateNotice = f.page.getByText('Edge not selected', { exact: true });
    const stage = editor.getByRole('group', { name: `${finishName} edge replacements`, exact: true });
    const inside = [5, 5, height / 2], outside = [20, 0, height / 2];
    await direction('Back right');
    await f.openFeatureEditor(2, `two unresolved ${finishName} edges`);
    await replace.click();
    await pick(inside); await stage.getByText(desired, { exact: true }).waitFor();
    assert.ok(await apply.isDisabled());
    assert.equal(await button('Pick second edge', stage).getAttribute('aria-pressed'), 'true');
    await pick(inside);
    await f.page.getByText('Select a different unmerged straight edge on the body of this feature.', { exact: true }).waitFor();
    assert.ok(await apply.isDisabled());
    await stage.getByText(desired, { exact: true }).waitFor();
    await f.same(before.doc);
    await cancel.click(); await f.same(before.doc);
    if (chamfer) await duplicateNotice.waitFor({ state: 'hidden' });
    assert.deepEqual((await f.snapshot('04-dual-cancel-keeps-both-held')).history, before.history);
    await replace.click();
    await pick(inside); await stage.getByText(desired, { exact: true }).waitFor();
    if (chamfer) {
      await pick(inside);
      await duplicateNotice.waitFor();
      assert.ok(await apply.isDisabled());
    }
    await direction('Front right');
    const failure = f.page.getByText('Edge replacement not applied', { exact: true });
    if (nativeRefusal) {
      await pick([10, 0, height]); await stage.getByText(frontTop, { exact: true }).waitFor();
      assert.equal(await apply.isEnabled(), true);
      await f.snapshot('04a-two-admitted-picks');
      await apply.click(); await failure.waitFor();
      await f.same(before.doc);
      const refused = await f.snapshot('04b-native-refusal-keeps-both-picks');
      assert.deepEqual(refused.bodies.bodies, before.bodies.bodies);
      assert.deepEqual(refused.history, before.history);
      assert.deepEqual(refused.selection, before.selection);
      assert.equal(await refs().getByText('Choose a reference · Feature held', { exact: true }).count(), 2);
      await stage.getByText(desired, { exact: true }).waitFor();
      await stage.getByText(frontTop, { exact: true }).waitFor();
      await button('Pick second edge', stage).click();
    }
    await pick(outside);
    if (chamfer) await duplicateNotice.waitFor({ state: 'hidden' });
    await f.page.waitForFunction(() => document.querySelector('button[aria-label="Apply edge replacements"]')?.disabled === false);
    const preview = await f.snapshot('05-two-explicit-uncommitted-picks');
    assert.deepEqual(preview.doc, before.doc);
    assert.deepEqual(preview.bodies.bodies, before.bodies.bodies);
    assert.deepEqual(preview.history, before.history);
    await apply.click(); await f.changed(before.doc); await refs().waitFor({ state: 'hidden' }); await f.ready();
    const accepted = await f.snapshot('06-both-edge-replacements-applied');
    assert.deepEqual(accepted.doc, prep.target.doc);
    geometry(await f.inspect('07-both-resolved-native', accepted.doc), targetVolume, [convex, concave]);
    if (nativeRefusal) {
      assert.equal(preview.notices.some(text => text.includes('Edge replacement not applied')), expectStaleNotice);
      assert.equal(accepted.notices.some(text => text.includes('Edge replacement not applied')), expectStaleNotice);
      f.report.observations.push({ nativeRefusalKeptDocumentAndHistory: 'PASS', staleNoticeReproduced: expectStaleNotice });
    }
    await f.undo(); await f.same(before.doc); await refs().waitFor();
    assert.equal(await refs().getByText('Choose a reference · Feature held', { exact: true }).count(), 2);
    assert.deepEqual((await f.snapshot('08-undo-restores-two-problems')).history, before.history);
    if (nativeRefusal && !expectStaleNotice) {
      await direction('Back right'); await f.openFeatureEditor(2, `two unresolved ${finishName} edges`); await replace.click();
      await pick(inside); await stage.getByText(desired, { exact: true }).waitFor();
      await direction('Front right'); await pick([10, 0, height]); await stage.getByText(frontTop, { exact: true }).waitFor();
      await apply.click(); await failure.waitFor(); await cancel.click(); await failure.waitFor({ state: 'hidden' });
      await f.same(before.doc);
      assert.deepEqual((await f.snapshot('09-cancel-retires-failure-keeps-redo')).history, before.history);
      await f.closeEditor();
    }
    await f.redo(); await f.same(accepted.doc); await refs().waitFor({ state: 'hidden' });
    await saveOpen(accepted.doc, 'two-edge-pair-confirmed', targetVolume, [convex, concave]);
    f.report.observations.push({ dualManual: 'PASS', sameNameNewSignature: 'PASS', duplicateRefusal: 'PASS', Cancel: 'PASS', UndoRedoSaveOpen: 'PASS' });
    return;
  }
  const offered = rows.flatMap(row => row.candidates.map(candidate => ({ ...candidate, group: row.group }))).find(c => c.name === desired);
  if (manualBase) {
    await f.openFeatureEditor(2, 'held Fillet');
    assert.equal(await button('Replace edge', f.editor()).count(), 0);
    assert.ok(offered, 'The separate candidate route supplies the target');
    await f.snapshot('04-two-edge-manual-replacement-unavailable');
    await f.closeEditor(); await f.same(before.doc);
    f.report.observations.push({ manualReplacementOffered: false, candidateControlOffered: true });
  }
  if (manual) {
    const editor = f.editor();
    const readyToApply = button('Apply edge replacement', editor);
    const cancel = button('Cancel edge replacement', editor);
    const replace = button('Replace edge', editor);
    await direction('Front right');
    await f.openFeatureEditor(2, 'held pair');
    await replace.click();
    await pick([20, 0, 1.5]);
    await f.page.getByText('This feature already uses that edge.', { exact: true }).waitFor();
    assert.ok(await readyToApply.isDisabled());
    await f.same(before.doc);
    await direction('Back right');
    await pick([5, 5, 1.5]); await editor.getByText(desired, { exact: true }).waitFor();
    const review = await f.snapshot('04-manual-replacement-preview');
    assert.deepEqual(review.doc, before.doc); assert.deepEqual(review.history, before.history);
    assert.deepEqual(review.bodies.bodies, before.bodies.bodies);
    await cancel.click(); await f.same(before.doc);
    assert.deepEqual((await f.snapshot('05-cancel-keeps-pair-held')).history, before.history);
    await replace.click(); await pick([5, 5, 1.5]);
    await editor.getByText(desired, { exact: true }).waitFor();
    await readyToApply.click(); await f.changed(before.doc); await refs().waitFor({ state: 'hidden' }); await f.ready();
    const accepted = await f.snapshot('06-manual-replacement-accepted');
    assert.deepEqual(accepted.doc, prep.target.doc, 'Write only the picked slot and its exact current signature');
    geometry(await f.inspect('06-exact-replacement-native', accepted.doc), 525, [convex, concave]);
    await f.undo(); await f.same(before.doc); await refs().waitFor();
    assert.deepEqual((await f.snapshot('06-undo-restores-held-pair')).history, before.history);
    await f.redo(); await f.same(accepted.doc); await refs().waitFor({ state: 'hidden' });
    await saveOpen(accepted.doc, 'two-edge-manual-confirmed', 525, [convex, concave]);
    f.report.observations.push({ manualReplacement: 'PASS', duplicateRefusal: 'PASS', Cancel: 'PASS', UndoRedoSaveOpen: 'PASS', existingCandidateOffered: !!offered });
  } else if (offered) {
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
