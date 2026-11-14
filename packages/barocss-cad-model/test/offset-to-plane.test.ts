import test from 'node:test';
import assert from 'node:assert/strict';
import { checkBrep, faceGeometry } from '@barocss/cad';
import { editSavedOffsetFaceCommand } from '../src/app/offsetFaceEdit';
import { offsetFaceCommand } from '../src/app/profileCommands';
import { duplicateBody, renumber } from '../src/chat/features';
import { dispatchTool } from '../src/chat/tools';
import { encodeStudioFile, readStudioFile } from '../src/engine/container';
import { emptyDoc, offsetFaceDocumentProblem, parentsOf, usesOf, withNode, type StudioDoc } from '../src/engine/doc';
import { evaluateDoc, partBreps } from '../src/engine/evaluate';
import { featureOf, toPartDocument } from '../src/engine/part';

function fixture() {
  let doc = withNode(emptyDoc(), { kind: 'sketch', profile: 'polygon',
    points: [[0, 0], [18, 0], [24, 8], [18, 16], [0, 16], [-6, 8]] });
  doc = withNode(doc, { kind: 'extrude', sketch: 0, height: 10 });
  doc = withNode(doc, { kind: 'sketch', profile: 'polygon', points: [[20, 1], [24, -2], [27, 2], [23, 5]] });
  doc = withNode(doc, { kind: 'extrude', sketch: 2, height: 10, from: 30 });
  return withNode(doc, { kind: 'translate', parent: { node: 3, side: 'solid' }, offset: [0, 0, 0] });
}

function evaluated(doc: StudioDoc) {
  const result = evaluateDoc(doc, 0);
  assert.ok(result.ok, result.ok ? '' : result.error.detail);
  return result.bodies;
}

function facePick(doc: StudioDoc, name: string, key: string) {
  const bodies = evaluated(doc), body = bodies.findIndex(candidate => candidate.key === key);
  const face = bodies[body]?.mesh.faces.find(candidate => candidate.name === name);
  assert.ok(face, `Missing ${name} on ${key}; available ${bodies[body]?.mesh.faces.map(candidate => candidate.name)}`);
  return { doc, bodies, selection: { faces: [{ body, face: face.index }], edges: [], bodies: [] } };
}

function moveReference(doc: StudioDoc, x: number, y: number): StudioDoc {
  const nodes = doc.nodes.map((node, index) => index === 4 && node.kind === 'translate'
    ? { ...node, offset: [x, y, 0] as [number, number, number] } : node);
  return { ...doc, nodes };
}

async function bind(doc: StudioDoc, face = 'n3.side3') {
  return dispatchTool({ doc, bodies: evaluated(doc) }, 'run_command',
    { command: 'offset-face', faces: ['n1.side1', face], values: { offsetMode: 'to-plane' } },
    async candidate => evaluateDoc(candidate, 0));
}

function expectGeometry(doc: StudioDoc, key: string, volume: number, plane: number) {
  const bodies = evaluated(doc), body = bodies.find(candidate => candidate.key === key);
  assert.ok(body && body.volume !== null && Math.abs(body.volume - volume) < 1e-7);
  const breps = partBreps(doc);
  assert.deepEqual(breps.map(entry => entry.key), ['b4', key]);
  const source = breps.find(entry => entry.key === key)!.brep;
  const report = checkBrep(source, { strict: true });
  assert.ok(report.valid);
  const face = source.faces.find(candidate => candidate.name === 'n1.side1')!;
  assert.ok(face.surface.kind === 'surface');
  assert.ok(face.surface.controlPoints.flat().every(([x, y]) => Math.abs(4 * x - 3 * y - plane) < 1e-9));
  const reference = breps[0].brep.faces.find(candidate => candidate.name === 'n3.side3')!;
  const geometry = faceGeometry(reference);
  assert.ok(geometry.kind === 'plane' && Math.abs(4 * geometry.o[0] - 3 * geometry.o[1] - plane) < 1e-9);
}

test('a persistent antiparallel reference drives the same signed geometry in the agent, History and native files', async () => {
  const doc = fixture();
  const ctx = facePick(doc, 'n1.side1', 'b1');
  const reference = facePick(doc, 'n3.side3', 'b4').selection.faces[0];
  const picked = offsetFaceCommand.onPick!(ctx, { offsetMode: 'to-plane' }, { face: reference, edge: null });
  assert.ok(picked && !picked.error);
  const candidate = offsetFaceCommand.build!(ctx, picked);
  const result = await bind(doc);
  assert.ok(result.changed && !result.isError, result.content);
  assert.deepEqual(result.state.doc, candidate);
  const node = candidate.nodes[5];
  assert.ok(node.kind === 'offset-face' && node.target);
  assert.equal(node.target.feature, 'n4');
  assert.ok(!Object.hasOwn(node, 'distance'));
  assert.deepEqual(usesOf(node), [1, 4]);
  assert.deepEqual(parentsOf(node), [1]);
  assert.throws(() => featureOf(node, 5, candidate.nodes), /current native document prefix/);
  assert.throws(() => duplicateBody(candidate, { node: 5, side: 'solid' }, [1, 1, 1]), /bound|reference plane/i);
  const shifted = renumber(node, index => index + 7);
  assert.ok(shifted.kind === 'offset-face' && shifted.target?.body.node === 11 && shifted.parent.node === 8);

  expectGeometry(candidate, 'b5', 3934.791666666667, 77);
  const moved = moveReference(candidate, -3, 1);
  assert.deepEqual(moved.nodes.at(-1), node);
  expectGeometry(moved, 'b5', 3619.166666666667, 62);
  const native = toPartDocument(moved).features.at(-1);
  assert.ok(native?.kind === 'offset-face');
  assert.ok(Math.abs(Number(native.distance) + 2) < 1e-12);

  const history = editSavedOffsetFaceCommand(moved, 5)!;
  const context = { doc: moved, bodies: evaluated(moved), selection: { faces: [], edges: [], bodies: [] } };
  assert.equal(history.build!(context, history.defaults!(context)), moved);
  const opened = await readStudioFile(encodeStudioFile(moved));
  assert.ok('doc' in opened);
  assert.deepEqual(opened.doc, JSON.parse(JSON.stringify(moved)));
  expectGeometry(opened.doc, 'b5', 3619.166666666667, 62);
});

test('reference loss, synthetic recipes, tilt and collapse refuse atomically', async () => {
  const doc = fixture();
  const accepted = await bind(doc);
  assert.ok(!accepted.isError, accepted.content);
  const valid = accepted.state.doc, node = valid.nodes[5];
  assert.ok(node.kind === 'offset-face' && node.target);
  const { target } = node;
  for (const invalid of [
    { ...node, distance: 1 }, { ...node, target: { ...target, feature: 'n3' } },
    { ...node, target: { ...target, body: node.parent } },
    { ...node, target: { ...target, body: { node: 5, side: 'solid' } } },
  ]) assert.ok(offsetFaceDocumentProblem({ ...valid, nodes: [...valid.nodes.slice(0, 5), invalid] }));

  const selection = () => JSON.stringify(doc);
  const before = selection();
  for (const [input, pattern] of [
    [bind(doc, 'n3.top'), /parallel/i],
    [bind(moveReference(doc, -13.25, 0)), /collaps|cross/i],
    [bind(moveReference(doc, -1.25, 0)), /same plane/i],
  ] as const) {
    const outcome = await input;
    assert.ok(outcome.isError && !outcome.changed, outcome.content);
    assert.match(outcome.content, pattern);
  }
  assert.equal(selection(), before);
  const samePlane = evaluateDoc(moveReference(valid, -1.25, 0), 0);
  assert.ok(!samePlane.ok && /same plane/.test(samePlane.error.detail));
  // Equal component-wise minima can represent different supports. An old or falsified
  // support must not be accepted merely because the target's name, normal and trim minima match.
  const wrongSupport = { ...node, target: { ...target, localSupport: target.localSupport + 5 } };
  const changedSupport = evaluateDoc({ ...valid, nodes: [...valid.nodes.slice(0, 5), wrongSupport] }, 0);
  assert.ok(!changedSupport.ok && /original reference face changed/.test(changedSupport.error.detail));
  for (const index of [1, 4]) {
    const suppressed = evaluateDoc({ ...valid, nodes: valid.nodes.map((item, i) => i === index ? { ...item, suppressed: true } : item) }, 0);
    assert.ok(!suppressed.ok && /current exact solids|reference body is suppressed/.test(suppressed.error.detail));
  }

  const sketch = valid.nodes[2];
  assert.ok(sketch.kind === 'sketch' && sketch.profile === 'polygon');
  const reordered = { ...sketch, points: [...sketch.points.slice(2), ...sketch.points.slice(0, 2)] };
  const result = evaluateDoc({ ...valid, nodes: valid.nodes.map((n, i) => i === 2 ? reordered : n) }, 0);
  assert.ok(!result.ok && /original reference face changed/.test(result.error.detail));
  const tilted = { ...sketch, points: [...sketch.points.slice(0, 3), [23, 5 + 1e-8] as [number, number]] };
  const bad = await bind({ ...doc, nodes: doc.nodes.map((n, i) => i === 2 ? tilted : n) });
  assert.ok(bad.isError && !bad.changed, bad.content);
  assert.match(bad.content, /parallel/i);
});
