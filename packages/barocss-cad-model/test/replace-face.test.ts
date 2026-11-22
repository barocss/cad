import assert from 'node:assert/strict';
import test from 'node:test';
import { brepMassProperties, checkBrep, faceGeometry } from '@barocss/cad';
import { encodeStudioFile, readStudioFile } from '../src/engine/container';
import { runCheck } from '../src/chat/spec';
import { dispatchTool, type ChatState } from '../src/chat/tools';
import { directFaceDocumentProblem, emptyDoc, parentsOf, usesOf, withNode, type StudioDoc } from '../src/engine/doc';
import { evaluatePart, partBreps } from '../src/engine/evaluate';
import { isExactThickenEdit } from '../src/engine/exactThickenEdit';
import { partSnapshot } from '../src/engine/part';
import { readStudioDoc } from '../src/engine/migrate';
import { revisionOf } from '../src/util/revision';

const evaluate = async (doc: StudioDoc) => evaluatePart(doc, 0);
async function stateOf(doc: StudioDoc): Promise<ChatState> {
  const result = await evaluate(doc);
  assert.ok(result.ok);
  return { doc, bodies: result.bodies };
}

function witness() {
  const footprint = withNode(emptyDoc(), { kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [40, 30] });
  const stock = withNode(footprint, { kind: 'extrude', sketch: 0, height: 10 });
  const profile = withNode(stock, { kind: 'sketch', profile: 'polygon', points: [[28, 0], [37, 0], [42, 10], [32, 10]],
    plane: { origin: [0, 70, 0], normal: [0, -1, 0], xAxis: [1, 0, 0] } });
  const donor = withNode(profile, { kind: 'extrude', sketch: 2, height: 10 });
  return withNode(donor, { kind: 'translate', parent: { node: 3, side: 'solid' }, offset: [0, 0, 0] });
}

const command = { action: 'command', command: 'replace-face', faces: ['n1.side1', 'n3.side1'] };
const near = (value: number | null | undefined, expected: number) =>
  assert.ok(typeof value === 'number' && Math.abs(value - expected) < 1e-7, String(value));

test('Replace face reads the tilted donor without consuming it and keeps the authored reference across Open', async () => {
  const doc = witness(), original = await stateOf(doc), before = partBreps(doc);
  const reply = await dispatchTool(original, 'features', { ...command, expectedRevision: revisionOf(doc) }, evaluate);
  assert.ok(!reply.isError && reply.changed, reply.content);
  const candidate = reply.state.doc, node = candidate.nodes[5];
  assert.ok(node?.kind === 'replace-face' && node.sigs);
  assert.deepEqual(node.faces, ['n1.side1']);
  assert.deepEqual(parentsOf(node), [1]);
  assert.deepEqual(usesOf(node), [1, 4]);
  assert.equal(node.target.feature, 'n4');
  assert.equal(node.target.face, 'n3.side1');
  assert.deepEqual(candidate.nodes.slice(0, 5), doc.nodes);
  const reopened = readStudioDoc(JSON.stringify(candidate));
  assert.ok('doc' in reopened);
  const after = await stateOf(reopened.doc);
  near(after.bodies.find(body => body.key === 'b5')?.volume, 11850);
  assert.deepEqual(partBreps(reopened.doc).find(body => body.key === 'b4'), before.find(body => body.key === 'b4'));

  const moved = structuredClone(candidate), translate = moved.nodes[4];
  assert.ok(translate.kind === 'translate');
  translate.offset[0] = 2;
  const updated = await stateOf(moved);
  near(updated.bodies.find(body => body.key === 'b5')?.volume, 12450);
  assert.deepEqual(moved.nodes[5], node);
  const stale = await dispatchTool(updated, 'features', { ...command, expectedRevision: revisionOf(doc) }, evaluate);
  assert.equal(JSON.parse(stale.content).code, 'COMMAND_STALE');
  assert.equal(stale.state.doc, moved);
});

test('Replace face refuses either-end collapse and a changed or missing saved reference', async () => {
  const start = await stateOf(witness());
  const reply = await dispatchTool(start, 'features', command, evaluate);
  assert.ok(!reply.isError && reply.changed, reply.content);
  const accepted = reply.state.doc;
  const collapsed = structuredClone(accepted), move = collapsed.nodes[4];
  assert.ok(move.kind === 'translate');
  move.offset[0] = -37;
  const refused = await evaluate(collapsed);
  assert.ok(!refused.ok);
  assert.match(refused.error.detail, /reach or cross the opposite wall/);
  const reshaped = structuredClone(accepted), sketch = reshaped.nodes[2];
  assert.ok(sketch.kind === 'sketch' && sketch.profile === 'polygon');
  sketch.points[2] = [43, 10];
  const reshapedResult = await evaluate(reshaped);
  assert.ok(!reshapedResult.ok);
  assert.match(reshapedResult.error.detail, /original reference face changed/);
  const malformed = structuredClone(accepted), node = malformed.nodes[5];
  assert.ok(node.kind === 'replace-face');
  node.target.feature = 'missing';
  assert.match(directFaceDocumentProblem(malformed) ?? '', /reference feature identity/);
  const bad = await dispatchTool(start, 'features', { ...command, faces: ['n1.side1', 'n1.side3'] }, evaluate);
  assert.ok(bad.isError && !bad.changed);
  assert.equal(bad.state.doc, start.doc);
});

test('Replace face links an inclined exact plane to the original semicylinder upper cap', async () => {
  const profile = [[30, 20], [30, 30], [20, 30], [10, 30], [10, 20]];
  const thicken = withNode(emptyDoc(), { kind: 'thicken', mode: 'exact-cylinder', name: 'Semicylinder', thickness: 2, side: 'reverse',
    surface: {
      degreeU: 2, degreeV: 1, knotsU: [0, 0, 0, 1, 1, 2, 2, 2], knotsV: [0, 0, 1, 1],
      controlPoints: profile.map(([x, y]) => [[x, y, 0], [x, y, 12]]),
      weights: [1, Math.SQRT1_2, 1, Math.SQRT1_2, 1].map(weight => [weight, weight]),
    } });
  const n = Math.sqrt(17);
  const sketch = withNode(thicken, { kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [8, 8],
    plane: { origin: [44, 22, 20], normal: [-1 / n, 0, 4 / n], xAxis: [4 / n, 0, 1 / n] } });
  const extrude = withNode(sketch, { kind: 'extrude', sketch: 1, height: 3 });
  const doc = withNode(extrude, { kind: 'translate', parent: { node: 2, side: 'solid' }, offset: [0, 0, 0] });
  const before = structuredClone(doc), state = await stateOf(doc);
  const apply = (face: string, target = 'n2.bottom') => dispatchTool(state, 'features', {
    action: 'command', command: 'replace-face', faces: [face, target], expectedRevision: revisionOf(doc),
  }, evaluate);
  const reply = await apply('n0.v-max');
  assert.ok(!reply.isError && reply.changed, reply.content);
  assert.deepEqual(doc, before);
  const result = reply.state.doc, node = result.nodes[4];
  assert.ok(node?.kind === 'replace-face' && node.sigs);
  assert.deepEqual([node.parent, node.faces, node.target.feature, node.target.face],
    [{ node: 0, side: 'solid' }, ['n0.v-max'], 'n3', 'n2.bottom']);
  const originalDonor = partBreps(doc).find(body => body.key === 'b3');
  assert.deepEqual(partBreps(result).find(body => body.key === 'b3'), originalDonor);
  const measure = (candidate: StudioDoc, height: number) => {
    const { brep } = partBreps(candidate).find(item => item.key === 'b4')!;
    const report = checkBrep(brep, { strict: true });
    assert.ok(report.valid, report.issues.join('\n'));
    const { volume, centroid } = brepMassProperties(brep, 1);
    near(volume, 18 * Math.PI * height);
    near(centroid[0], 20 + 41 / (4 * height));
    near(centroid[2], height / 2 + 41 / (32 * height));
    for (const [name, radius] of [['n0.normal', 10], ['n0.reverse', 8]] as const) {
      const support = faceGeometry(brep.faces.find(face => face.name === name)!);
      assert.equal(support.kind, 'cylinder');
      near(support.r, radius);
    }
    return brep;
  };
  const names = ['n0.normal', 'n0.reverse'] as const;
  const radial = { query: { fn: 'radial_wall', a: names[0], b: names[1] }, op: '==', value: 2, tol: 0.01, unit: 'mm' } as const;
  const checkWall = async (candidate: StudioDoc) => {
    const { bodies } = await stateOf(candidate);
    const wall = await runCheck(candidate, bodies, evaluate, radial);
    assert.equal(wall.status, 'pass');
    near(typeof wall.measured === 'number' ? wall.measured : undefined, 2);
    assert.deepEqual(wall.entities, names);
    const wrongLimit = await runCheck(candidate, bodies, evaluate, { ...radial, value: 3 });
    assert.equal(wrongLimit.status, 'fail');
    near(typeof wrongLimit.measured === 'number' ? wrongLimit.measured : undefined, 2);
  };
  const originalResult = measure(result, 14);
  await checkWall(result);
  const move = (z: number): StudioDoc => ({ ...result, nodes: result.nodes.map((item, i) =>
    i === 3 && item.kind === 'translate' ? { ...item, offset: [0, 0, z] } : item) });
  const moved = move(-3), expected = measure(moved, 11);
  assert.equal(moved.nodes[4], node);
  const opened = await readStudioFile(encodeStudioFile(moved));
  assert.ok('doc' in opened);
  assert.deepEqual(opened.doc, moved);
  assert.deepEqual(measure(opened.doc, 11), expected);
  const later = withNode(opened.doc, { kind: 'translate', parent: { node: 3, side: 'solid' }, offset: [0, 0, 9] });
  for (const candidate of [moved, opened.doc, later]) await checkWall(candidate);

  const current = partSnapshot(moved), prior = partSnapshot(result);
  const oldEdit = prior.document.features.find(feature => feature.id === node.id);
  assert.ok(oldEdit?.kind === 'replace-face');
  assert.equal(isExactThickenEdit(moved, current, 4, expected, names), true);
  assert.equal(isExactThickenEdit(moved, current, 4, originalResult, names), false);
  const stalePlane = { ...current, document: { ...current.document,
    features: current.document.features.map(feature => feature.id === node.id ? oldEdit : feature) } };
  assert.equal(isExactThickenEdit(moved, stalePlane, 4, expected, names), false);
  const noReference = { ...moved, nodes: moved.nodes.map((item, i) => i === 3 ? { ...item, suppressed: true as const } : item) };
  assert.equal(isExactThickenEdit(noReference, current, 4, expected, names), false);

  for (const unsupported of [await apply('n0.v-min'), await apply('n0.v-max', 'n2.side0')]) {
    assert.ok(unsupported.isError && !unsupported.changed);
    assert.equal(unsupported.state.doc, doc);
  }
  const collapsed = await evaluate(move(-11.5));
  assert.ok(!collapsed.ok);
  assert.match(collapsed.error.detail, /opposite cap/i);
  assert.deepEqual(doc, before);
});
