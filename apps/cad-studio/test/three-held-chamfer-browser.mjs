import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
import { readHeldFinishSummary } from './held-finish-recovery-mcp.mjs';

const baseline = process.argv.includes('--baseline');
const fillet = process.argv.includes('--fillet');
const mcp = process.argv.includes('--mcp');
assert.ok(!mcp || (fillet && !baseline));
const finish = fillet ? 'Fillet' : 'Chamfer';
const featureName = fillet ? 'fillets' : 'chamfers';
const pins = [
  ...(mcp ? [
    'apps/cad-studio/test/held-finish-recovery-mcp.mjs',
    'apps/cad-studio/test/mcp-browser-session.mjs',
    'apps/cad-studio/scripts/cad-mcp.mjs',
    'apps/cad-studio/server/cadMcp.ts',
    'packages/barocss-cad-model/src/chat/part/query.ts',
    'packages/barocss-cad-model/src/chat/part/heldFinishRecovery.ts',
    'packages/barocss-cad-model/src/chat/contract.ts',
    'packages/barocss-cad-model/src/chat/toolDefinitions.ts',
    'packages/barocss-cad-model/src/engine/heldFinishGroup.ts',
  ] : []),
  'apps/cad-studio/test/three-held-chamfer-browser.mjs',
  'apps/cad-studio/test/flow-helper.mjs',
  'apps/cad-studio/src/App.tsx',
  'apps/cad-studio/src/state/heldFinishReplacement.ts',
  'apps/cad-studio/src/state/useHeldFinishEdge.ts',
  'apps/cad-studio/src/ui/NodeEditor.tsx',
  'apps/cad-studio/src/ui/ReferenceDecisions.tsx',
  'packages/barocss-cad-model/src/engine/references.ts',
  'packages/barocss-cad-model/src/engine/rematch.ts',
];
const oldNames = ['n1.side1|n1.side2', 'n1.side0|n1.side1', 'n1.side2|n1.side3'];
const newNames = [oldNames[2], oldNames[1], 'n1.side4|n1.side5'];
const oldPoints = [[0, -12], [20, -12], [20, 20], [15, 20], [15, 15], [5, 15], [5, 20], [0, 20]];
const newPoints = [[0, 0], [20, 0], [20, 5], [5, 5], [5, 20], [0, 20]];
const oldCap = [[0, -12], [18, -12], [20, -10], [20, 18], [18, 20], [17, 20], [15, 18], [15, 15], [5, 15], [5, 20], [0, 20]];
const newCap = [[0, 0], [18, 0], [20, 2], [20, 5], [7, 5], [5, 7], [5, 20], [2, 20], [0, 18]];
const ref = node => ({ node, side: 'solid' });
const model = (points, edges) => ({
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: fillet ? { Radius: 2 } : { Bevel: 2 },
  nodes: [{ id: 'n0', kind: 'sketch', profile: 'polygon', points },
    { id: 'n1', kind: 'extrude', sketch: 0, height: 3 },
    { id: 'n2', parent: ref(1), edges, ...(fillet ? { kind: 'fillet', radius: { parameter: 'Radius' } }
      : { kind: 'chamfer', distance: { parameter: 'Bevel' } }) }],
  outputs: { b2: ref(2) }, nextId: 3,
});
const f = await createFlow({
  name: fillet ? 'three-held-fillet' : 'three-held-chamfer', output: process.argv[2],
  envFrozen: mcp ? 'D1871_SOURCE_FROZEN' : fillet ? 'D1870_SOURCE_FROZEN' : 'D1834_SOURCE_FROZEN',
  qualification: `Recover three distinct terminal ${finish} straight-edge references together through History.`,
  limits: ['The signed fixture is opened through Studio. Viewport creation of the fixture is NOT_RUN.',
    'Three held references, one constant positive size and one exact native source.'],
  initialFiles: pins, requiredFrozen: pins,
  inspectorSource: `
import {readFileSync} from 'node:fs';
import {partBreps,evaluatePart} from '@barocss/cad-model/engine/evaluate';
import {captureSignatures} from '@barocss/cad-model/engine/references';
import {checkBrep,brepMassProperties,faceGeometry} from '@barocss/cad';
const input=JSON.parse(readFileSync(process.argv[2],'utf8'));
function inspect(doc) {
 return partBreps(doc).map(({brep})=>({valid:checkBrep(brep,{strict:true}).valid,
  kinds:brep.bodies.map(b=>b.kind),...brepMassProperties(brep,1),vertices:brep.vertices.map(v=>v.point),
  faces:brep.faces.map(face=>faceGeometry(face)),edges:brep.edges.length}));
}
function sign(doc) {
 const prefix={...doc,nodes:doc.nodes.slice(0,2),outputs:{b1:{node:1,side:'solid'}}};
 const result=evaluatePart(prefix,1);if(!result.ok)throw Error(JSON.stringify(result));
 const signed=captureSignatures(doc,result.bodies);
 if(Object.keys(signed.nodes[2].sigs??{}).length!==3)throw Error('Expected three native signatures');
 return {doc:signed,native:inspect(signed)};
}
console.log(JSON.stringify(input.prepare?{original:sign(input.original),target:sign(input.target),wrong:sign(input.wrong)}:inspect(input)));
`,
});
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const references = () => f.page.getByRole('region', { name: 'References', exact: true });
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} vs ${b}`);
function geometry(rows, volume, centre, cap) {
  assert.equal(rows.length, 1);
  const [native] = rows;
  assert.ok(native.valid);
  assert.deepEqual(native.kinds, ['solid']);
  assert.equal(native.method, 'planar-exact');
  near(native.volume, volume);
  native.centroid.forEach((value, i) => near(value, centre[i]));
  assert.equal(native.faces.length, cap.length + 2);
  assert.equal(native.edges, 3 * cap.length);
  assert.equal(native.vertices.length, 2 * cap.length);
  for (const [x, y] of cap) for (const z of [0, 3]) {
    assert.ok(native.vertices.some(v => Math.hypot(v[0] - x, v[1] - y, v[2] - z) < 1e-8), `Missing vertex ${[x,y,z]}`);
  }
}
const sector = 4 - Math.PI;
const oldRound = { volume: 3 * (590 - 3 * sector), faces: 13, walls: [[18, -10, 1], [18, 18, 1], [17, 18, 1]] };
const newRound = { volume: 3 * (175 - sector), faces: 11, walls: [[18, 2, 1], [7, 7, -1], [2, 18, 1]] };
function roundGeometry(rows, expected) {
  assert.equal(rows.length, 1);
  const [native] = rows;
  assert.ok(native.valid);
  assert.deepEqual(native.kinds, ['solid']);
  near(native.volume, expected.volume);
  assert.equal(native.faces.length, expected.faces);
  assert.equal(native.vertices.length, 2 * (expected.faces - 2));
  assert.equal(native.edges, 3 * (expected.faces - 2));
  const walls = native.faces.filter(face => face.kind === 'cylinder');
  assert.equal(walls.length, expected.walls.length);
  for (const [x, y, out] of expected.walls) {
    assert.equal(walls.filter(wall => Math.hypot(wall.c[0] - x, wall.c[1] - y) < 1e-8 &&
      Math.hypot(wall.a[0], wall.a[1]) < 1e-8 && Math.abs(Math.abs(wall.a[2]) - 1) < 1e-8 &&
      Math.abs(wall.r - 2) < 1e-8 && wall.out === out).length, 1, `Missing native wall at [${x}, ${y}]`);
  }
  assert.deepEqual([...new Set(native.vertices.map(point => point[2]))].sort(), [0, 3]);
}
async function open(name, doc) {
  await f.newPage();
  await f.page.getByLabel('Model file', { exact: true }).setInputFiles({
    name: name + '.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)),
  });
  await f.page.waitForFunction(label => document.querySelector('.doc-tab input')?.value === label, name);
  await f.ready();
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
  f.phase = 'Native source, explicit target and same-volume wrong third edge';
  const prep = await f.inspect('00-native-preflight', { prepare: true, original: model(oldPoints, oldNames),
    target: model(newPoints, newNames), wrong: model(newPoints, [...newNames.slice(0, 2), 'n1.side3|n1.side4']) });
  const centre = [6953 / 1038, 6953 / 1038, 1.5];
  const qualifyTarget = rows => fillet ? roundGeometry(rows, newRound) : geometry(rows, 519, centre, newCap);
  if (fillet) {
    roundGeometry(prep.original.native, oldRound);
    roundGeometry(prep.wrong.native, { ...newRound, walls: [...newRound.walls.slice(0, 2), [3, 18, 1]] });
  } else {
    geometry(prep.original.native, 1752, [8687 / 876, 4891 / 1752, 1.5], oldCap);
    near(prep.wrong.native[0].volume, 519);
    near(prep.wrong.native[0].centroid[0], 6909 / 1038);
  }
  qualifyTarget(prep.target.native);
  assert.throws(() => qualifyTarget(prep.wrong.native), assert.AssertionError);
  await open(`three-${featureName}-original`, prep.original.doc); await f.same(prep.original.doc);
  assert.equal(await references().count(), 0);
  await f.snapshot(`01-three-original-${featureName}`);

  f.phase = 'Open upstream changes with all three authored references held';
  const changed = structuredClone(prep.original.doc);
  changed.nodes[0].points = newPoints;
  await open(`three-${featureName}-upstream-changed`, changed);
  const problems = references().getByText('Choose a reference · Feature held', { exact: true });
  await problems.nth(2).waitFor();
  assert.equal(await problems.count(), 3);
  const before = await f.snapshot('02-all-three-references-held');
  assert.deepEqual(before.doc.nodes.slice(0, 2), changed.nodes.slice(0, 2));
  assert.deepEqual(before.doc.nodes[2].edges, oldNames);
  assert.deepEqual(before.doc.nodes[2].sigs, changed.nodes[2].sigs);
  assert.equal(before.doc.nodes[2].suppressed, true);
  assert.equal(before.doc.nodes[2].rematched, undefined);
  near(before.bodies.bodies[0].volume, 525);
  let heldRevision;
  if (mcp) {
    const savedHeld = await f.save('held-source-for-local-agent');
    f.phase = 'Read the same held model through the local MCP host';
    const { summary, revision } = await readHeldFinishSummary(f, savedHeld.file, 'held-source', 'b2');
    heldRevision = revision;
    const recovery = summary.held_finish_recovery;
    assert.ok(recovery);
    assert.deepEqual([recovery.feature, recovery.body, recovery.revision, recovery.mode, recovery.page, recovery.pages],
      ['n2', 'b2', revision, 'studio_history_review', 1, 1]);
    assert.deepEqual(recovery.slots.map(slot => slot.authored_edge), oldNames);
    assert.deepEqual(recovery.slots.map(slot => slot.slot), [1, 2, 3]);
    assert.equal(recovery.pick_edges.length, 18);
    assert.equal(recovery.pick_edges.some(edge => edge.name === newNames[2]), true);
    const positions = [[5, 5], [20, 0], [0, 20]];
    newNames.forEach((name, i) => {
      const edge = recovery.pick_edges.find(edge => edge.name === name);
      assert.ok(edge);
      assert.deepEqual([edge.from, edge.to].sort(), [[...positions[i], 0], [...positions[i], 3]]);
    });
    assert.ok(recovery.slots.some(slot => slot.signature_matches.length > 1));
    assert.equal(summary.bodies[0].volume, 525);
    await f.same(before.doc);
    assert.deepEqual((await f.snapshot('02b-studio-unchanged-after-agent-read')).history, before.history);
    f.report.observations.push({ sameHeldRevision: revision, orderedSlots: 3, currentNativePicks: 18,
      signatureMatchCounts: recovery.slots.map(slot => slot.signature_matches.length), documentBytesAfterRead: 'SAME' });
  }
  await direction('Back right');
  await f.openFeatureEditor(2, `three unresolved ${finish} edges`);
  const editor = f.editor();
  const replace = button('Replace edges', editor);
  if (baseline) {
    assert.equal(await replace.count(), 0);
    assert.equal(await button('Replace edge', editor).count(), 0);
    await f.same(before.doc);
    await f.snapshot('03-three-edge-replacement-unavailable');
    f.report.observations.push({ directReplacement: `FAIL: unavailable for three held ${finish} references` });
    return;
  }
  const apply = button('Apply edge replacements', editor);
  const cancel = button('Cancel edge replacement', editor);
  const stage = editor.getByRole('group', { name: `${finish} edge replacements`, exact: true });
  const nthRow = index => stage.locator('.row-actions').nth(index);
  const duplicate = f.page.getByText('Edge not selected', { exact: true });
  const inside = [5, 5, 1.5];
  const outside = [20, 0, 1.5];
  const third = [0, 20, 1.5];
  const stagePick = async (index, point) => {
    await pick(point);
    await nthRow(index).getByRole('status').getByText(newNames[index], { exact: true }).waitFor();
  };
  const assertUnchanged = state => {
    assert.deepEqual(state.doc, before.doc);
    assert.deepEqual(state.bodies.bodies, before.bodies.bodies);
    assert.deepEqual(state.history, before.history);
    assert.deepEqual(state.selection, before.selection);
  };
  f.phase = 'Refuse duplicate, allow explicit third-first picking, cancel unchanged';
  await replace.click();
  assert.equal(await stage.locator('.row-actions').count(), 3);
  await stagePick(0, inside);
  await pick(inside); await duplicate.waitFor();
  assert.ok(await apply.isDisabled());
  await direction('Back left');
  await button('Pick third edge', stage).click();
  await stagePick(2, third);
  await duplicate.waitFor({ state: 'hidden' });
  assert.equal(await button('Pick second edge', stage).getAttribute('aria-pressed'), 'true');
  assert.ok(await apply.isDisabled());
  assertUnchanged(await f.snapshot('03-two-picks-third-slot-selected'));
  await cancel.click();
  await f.same(before.doc);
  assertUnchanged(await f.snapshot('04-cancel-keeps-three-held'));

  f.phase = 'Apply three staged edges as one native change';
  await direction('Back right'); await replace.click(); await stagePick(0, inside);
  await direction('Front right'); await stagePick(1, outside);
  assert.ok(await apply.isDisabled());
  await direction('Back left'); await stagePick(2, third);
  assert.equal(await apply.isEnabled(), true);
  assertUnchanged(await f.snapshot('05-three-picks-await-apply'));
  await apply.click(); await f.changed(before.doc);
  await references().waitFor({ state: 'hidden' });
  const accepted = await f.snapshot(`06-three-${featureName}-applied`);
  assert.deepEqual(accepted.doc, prep.target.doc);
  qualifyTarget(await f.inspect('07-applied-native', accepted.doc));
  assert.equal(accepted.history.length, before.history.length);
  await f.undo(); await f.same(before.doc); await problems.nth(2).waitFor();
  assertUnchanged(await f.snapshot('08-undo-restores-three-held'));
  await f.redo(); await f.same(accepted.doc); await references().waitFor({ state: 'hidden' });
  const saved = await f.save(`three-${featureName}-confirmed`);
  await f.freshOpen(saved.file, accepted.doc, '09-fresh-open');
  assert.equal(await references().count(), 0);
  qualifyTarget(await f.inspect('10-reopened-native', await f.doc()));
  if (mcp) {
    f.phase = 'Confirm local reads retire the recovery view at the repaired revision';
    const repaired = await readHeldFinishSummary(f, saved.file, 'repaired-source', 'b2');
    assert.notEqual(repaired.revision, heldRevision);
    assert.equal(repaired.summary.held_finish_recovery, undefined);
    await f.same(accepted.doc);
    f.report.observations.push({ repairedRevision: repaired.revision, retiredRecoveryView: 'PASS' });
  }
  f.report.observations.push({ stagedDistinctPicks: 'PASS', duplicateRefusal: 'PASS', cancelUnchanged: 'PASS',
    exactNativeGeometry: 'PASS', undoRedoSaveOpen: 'PASS', sameVolumeWrongThirdRejectedByOracle: 'PASS' });
});
