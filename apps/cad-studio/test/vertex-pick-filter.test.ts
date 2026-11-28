import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSketchLaunchVertices } from '../src/sketch/sketchLaunch';
import { bindNativeVertexPick, currentNativeVertexPoints, currentSolidMoveVertices, currentSolidVertexPick, nativeVertexWitness, pickVertex } from '../src/viewport/vertexPick';
import { rectanglePart, withNode } from '@barocss/cad-model/engine/doc';
import { evaluatePart } from '@barocss/cad-model/engine/evaluate';
import { moveCommand } from '@barocss/cad-model/app/moveCommand';
import { rotateCommand } from '@barocss/cad-model/app/rotateCommand';

// Same collision class as D539: a valid outer edge hit and a different inner
// corner within the existing 7 px screen radius after zooming out.
const outer = { a: [60, -20, 0], b: [60, -20, 10] };
const inner = { a: [58, -18, 2], b: [58, -18, 10] };
const edges = [outer, inner];
const project = (p: readonly number[]) => {
  if (p === inner.a) return [104, 102];
  if (p === inner.b) return [110, 110];
  return [100, p[2] === 0 ? 90 : 110];
};

test('D539: Edges filter preserves a valid edge against a nearby inner vertex', () => {
  assert.deepEqual(pickVertex('all', 0, edges, 100, 100, project), { body: 0, at: inner.a }, 'collision is real under existing All priority');
  assert.equal(pickVertex('edge', 0, edges, 100, 100, project), null, 'actual hover/click corner picker cannot override the edge');
});

test('D539: Faces and Bodies filters cannot be replaced by nearby corners', () => {
  for (const filter of ['face', 'body'] as const) assert.equal(pickVertex(filter, 0, edges, 104, 102, project), null);
});

test('D539: All keeps nearest corner, strict 7 px boundary and no-body behavior', () => {
  assert.deepEqual(pickVertex('all', 3, edges, 104, 102, project), { body: 3, at: inner.a });
  const point = { a: [1, 2, 3], b: [4, 5, 6] };
  assert.equal(pickVertex('all', 0, [point], 0, 0, () => [7, 0]), null, 'exact radius is excluded');
  assert.deepEqual(pickVertex('all', 0, [point], 0, 0, p => p === point.b ? [6, 0] : [20, 0]), { body: 0, at: point.b });
  assert.equal(pickVertex('all', undefined, edges, 104, 102, project), null);
});

test('D539: All preserves printed-layer exclusion and returns a copy of the source point', () => {
  const hit = pickVertex('all', 0, edges, 104, 102, project, 2);
  assert.deepEqual(hit, { body: 0, at: inner.a });
  assert.notEqual(hit!.at, inner.a);
  hit!.at[0] = -999; assert.equal(inner.a[0], 58, 'picking never edits source geometry');
  assert.equal(pickVertex('all', 0, edges, 104, 102, project, 1), null);
});

test('three native picks retain document and mesh identity and refuse overlapping endpoint IDs', () => {
  const doc = rectanglePart(60, 30, 10), evaluated = evaluatePart(doc, 1);
  assert.ok(evaluated.ok);
  const mesh = evaluated.bodies[0].mesh;
  const xy = (point: readonly number[]) => [point[0], point[1]];
  const face = mesh.faces.find(face => face.normal[2] > 0.99)!.index;
  const source = { mesh, face };
  const picks = [[0, 0], [60, 0], [60, 30]].map(([x, y]) => {
    const hit = pickVertex('all', 0, mesh.edges, x, y, xy, undefined, source);
    assert.ok(hit);
    bindNativeVertexPick(hit, doc);
    return hit;
  });
  assert.deepEqual(currentNativeVertexPoints(doc, evaluated.bodies, picks), [[0, 0, 10], [60, 0, 10], [60, 30, 10]]);
  assert.equal(currentNativeVertexPoints({ ...doc }, evaluated.bodies, picks), null);
  assert.equal(currentNativeVertexPoints(doc, [{ ...evaluated.bodies[0], mesh: { ...mesh } }], picks), null);
  assert.equal(currentNativeVertexPoints(doc, evaluated.bodies, [picks[0], picks[0], picks[2]]), null);
  assert.equal(currentNativeVertexPoints(doc, [], picks), null);
  assert.equal(currentNativeVertexPoints(doc, evaluated.bodies, picks.slice(0, 2)), null);
  assert.equal(currentNativeVertexPoints(doc, evaluated.bodies, [...picks, picks[0]]), null);
  const ctx = { doc, bodies: evaluated.bodies, selection: { faces: [], edges: [], bodies: [], vertices: picks } };
  assert.equal(resolveSketchLaunchVertices(doc, ctx, true).ok, true);
  assert.equal(resolveSketchLaunchVertices(doc, ctx, false).ok, false);
  assert.equal(resolveSketchLaunchVertices(doc, { ...ctx, selection: { ...ctx.selection, bodies: [0] } }, true).ok, false);

  const overlapping = [...mesh.edges, { a: [0, 0, 10], b: [0, 30, 10], faces: [face], nativeVertices: ['separate', 'other'] as const }];
  const hit = pickVertex('all', 0, overlapping, 0, 0, xy, undefined, source);
  assert.ok(hit);
  bindNativeVertexPick(hit, doc);
  assert.equal(currentNativeVertexPoints(doc, evaluated.bodies, [hit, picks[1], picks[2]]), null);

  const hidden = pickVertex('all', 0, mesh.edges, 0, 0, point => point[2] === 0 ? xy(point) : [point[0] + 10, point[1] + 10], undefined, source);
  assert.deepEqual(hidden, { body: 0, at: [0, 0, 0] });
  bindNativeVertexPick(hidden!, doc);
  assert.equal(currentNativeVertexPoints(doc, evaluated.bodies, [hidden!, picks[1], picks[2]]), null);
});

test('orthographic vertex overlap uses camera depth and leaves separated endpoints alone', () => {
  const doc = rectanglePart(60, 30, 10), evaluated = evaluatePart(doc, 1);
  assert.ok(evaluated.ok);
  const mesh = evaluated.bodies[0].mesh;
  const edge = mesh.edges.find(edge => edge.nativeVertices && edge.a[2] !== edge.b[2])!;
  const source = { mesh, edge: edge.index };
  const project = (point: readonly number[]) => [point[2] / 500, 0, point[2] / 10];
  const front = edge.a[2] < edge.b[2] ? edge.a : edge.b;
  const rear = edge.a[2] > edge.b[2] ? edge.a : edge.b;
  assert.deepEqual(pickVertex('all', 0, [edge], 0.02, 0, project, undefined, source, true)?.at, front);
  assert.deepEqual(pickVertex('all', 0, [edge], 0.02, 0, project, undefined, source)?.at, rear);
  const separated = (point: readonly number[]) => [point[2] / 2, 0, point[2] / 10];
  assert.deepEqual(pickVertex('all', 0, [edge], 5, 0, separated, undefined, source, true)?.at, rear);
});

test('Rotate accepts one current native solid vertex and keeps the saved pivot numeric', () => {
  const doc = rectanglePart(60, 30, 10), evaluated = evaluatePart(doc, 1);
  assert.ok(evaluated.ok);
  const [body] = evaluated.bodies, { mesh } = body;
  const face = mesh.faces.find(face => face.normal[2] > 0.99)!.index;
  const pick = pickVertex('all', 0, mesh.edges, 60, 30, point => point.slice(0, 2), undefined, { mesh, face });
  assert.ok(pick);
  assert.equal(currentSolidVertexPick(doc, [body], [pick]), undefined);
  bindNativeVertexPick(pick, doc);
  const rotateVertex = currentSolidVertexPick(doc, [body], [pick]);
  assert.equal(rotateVertex, pick);
  assert.equal(currentSolidVertexPick({ ...doc }, [body], [pick]), undefined);
  assert.equal(currentSolidVertexPick(doc, [{ ...body, mesh: { ...mesh } }], [pick]), undefined);
  assert.equal(currentSolidVertexPick(doc, [body], [{ ...pick }]), undefined);
  assert.equal(currentSolidVertexPick(doc, [body], [pick, pick]), undefined);

  const selection = { bodies: [], faces: [], edges: [], vertices: [pick] };
  const ctx = { doc, bodies: [body], selection, rotateVertex };
  assert.equal(rotateCommand.available(ctx).ok, true);
  assert.equal(rotateCommand.available({ ...ctx, rotateVertex: undefined }).ok, false);
  assert.equal(rotateCommand.available({ ...ctx, selection: { ...selection, vertices: [{ ...pick }] } }).ok, false);
  const defaults = rotateCommand.defaults!(ctx);
  assert.deepEqual([defaults.px, defaults.py, defaults.pz], [60, 30, 10]);
  const applied = rotateCommand.build!(ctx, { ...defaults, angle: 30 });
  const node = applied.nodes.at(-1);
  assert.ok(node?.kind === 'rotate');
  assert.deepEqual(node.pivot, [60, 30, 10]);
  assert.deepEqual(node.parent, body.ref);
});

test('Move reads the two current native vertices in selection order and only moves their source', () => {
  const original = rectanglePart(10, 6, 4);
  const withSketch = withNode(original, { kind: 'sketch', profile: 'rectangle', min: [20, 5], max: [30, 11] });
  const doc = withNode(withSketch, { kind: 'extrude', sketch: 2, from: 2, height: 4 });
  const evaluated = evaluatePart(doc, 1);
  assert.ok(evaluated.ok);
  const { bodies } = evaluated;
  assert.equal(bodies.length, 2);
  const vertices = [[10, 6, 4], [20, 5, 6]].map((point, i) => {
    const { mesh } = bodies[i];
    const matches = (candidate: readonly number[]) => candidate.every((value, j) => value === point[j]);
    const edge = mesh.edges.find(edge => edge.nativeVertices && (matches(edge.a) || matches(edge.b)));
    assert.ok(edge);
    const pick = pickVertex('all', i, [edge], 0, 0, at => matches(at) ? [0, 0] : [20, 0], undefined, { mesh, edge: edge.index });
    assert.ok(pick);
    assert.ok(nativeVertexWitness(pick, mesh));
    bindNativeVertexPick(pick, doc);
    return pick;
  });
  const moveVertices = currentSolidMoveVertices(doc, bodies, vertices);
  assert.deepEqual(moveVertices, vertices);
  assert.equal(currentSolidMoveVertices({ ...doc }, bodies, vertices), undefined);
  assert.equal(currentSolidMoveVertices(doc, bodies, [vertices[0], { ...vertices[1] }]), undefined);
  assert.equal(currentSolidMoveVertices(doc, bodies, [vertices[0], vertices[0]]), undefined);
  assert.equal(currentSolidMoveVertices(doc, [...bodies].reverse(), vertices), undefined);
  const ctx = { doc, bodies, moveVertices, selection: { bodies: [], faces: [], edges: [], vertices } };
  assert.equal(moveCommand.available(ctx).ok, true);
  assert.equal(moveCommand.available({ ...ctx, selection: { ...ctx.selection, vertices: [...vertices].reverse() } }).ok, false);
  const values = moveCommand.defaults!(ctx);
  assert.deepEqual(values, { x: 10, y: -1, z: 2, ax: 20, ay: 5, az: 6 });
  assert.equal(moveCommand.derive!(ctx, { ...values, ax: 23 }, ['ax']).x, 13);
  const node = moveCommand.build!(ctx, values).nodes.at(-1);
  assert.ok(node?.kind === 'translate');
  assert.deepEqual(node.parent, bodies[0].ref);
  assert.deepEqual(node.offset, [10, -1, 2]);
});

test('a Section corner reads only an unchanged native pointer witness from its visible mesh', () => {
  const evaluated = evaluatePart(rectanglePart(60, 30, 10), 1);
  assert.ok(evaluated.ok);
  const mesh = evaluated.bodies[0].mesh;
  const edge = mesh.edges.find(edge => edge.nativeVertices && edge.nativeLine)!;
  const source = { mesh, edge: edge.index };
  const project = (point: readonly number[]) => point === edge.a ? [0, 0] : [16, 0];
  const pick = pickVertex('all', 0, mesh.edges, 0, 0, project, undefined, source);
  assert.ok(pick);
  assert.deepEqual(nativeVertexWitness(pick, mesh), { id: edge.nativeVertices![0], source });
  assert.equal(nativeVertexWitness({ ...pick }, mesh), null);
  assert.equal(nativeVertexWitness(pick, { ...mesh }), null);
  pick.body = 1;
  assert.equal(nativeVertexWitness(pick, mesh), null);
  pick.body = 0;
  const before = [...edge.a];
  pick.at[0] += 1;
  assert.equal(nativeVertexWitness(pick, mesh), null);
  assert.deepEqual(edge.a, before);
});
