import test from 'node:test';
import assert from 'node:assert/strict';
import { rectanglePart } from '@barocss/cad-model/engine/doc';
import { evaluateDoc } from '@barocss/cad-model/engine/evaluate';
import type { DisplayEdge } from '@barocss/cad-model/engine/mesh';
import { newFilletActive } from '../src/app/filletFamily';
import { readFilletPickedEdgeHighlight, type FilletPickedEdgeRequest, type FilletPickedEdgeSource } from '../src/app/filletPickedEdgeHighlight';

function expectedEdge(source: FilletPickedEdgeSource, pick: FilletPickedEdgeRequest['edge']) {
  const mesh = source.bodies[pick.body].mesh, segments: number[][][] = [];
  for (let offset = 0; offset < mesh.edgeLines.length; offset += 6) {
    if (mesh.edgeOfSegment[offset / 3] === pick.edge && mesh.edgeOfSegment[offset / 3 + 1] === pick.edge) {
      segments.push([[...mesh.edgeLines.slice(offset, offset + 3)], [...mesh.edgeLines.slice(offset + 3, offset + 6)]]);
    }
  }
  return segments;
}

function fixture() {
  const doc = rectanglePart(40, 30, 10), result = evaluateDoc(doc, 0);
  assert.ok(result.ok);
  const indices = ['n1.side0|n1.top', 'n1.bottom|n1.side2'].map(name => result.bodies[0].mesh.edges.findIndex(edge => edge.names.includes(name)));
  // The second pick must be a different original straight edge, independent of naming order.
  if (indices[1] < 0) indices[1] = result.bodies[0].mesh.edges.findIndex((edge, i) => i !== indices[0] && edge.straight && !!edge.nativeLine);
  assert.ok(indices.every(index => index >= 0));
  const edges = indices.map(edge => ({ body: 0, edge }));
  const owner = newFilletActive('edge', { doc, bodies: result.bodies, selection: { edges, faces: [], bodies: [] } }, { radius: 1 });
  const source: FilletPickedEdgeSource = { active: owner, doc, evaluated: { ...doc }, commandDoc: doc, bodies: result.bodies, available: true };
  const request: FilletPickedEdgeRequest = { owner, doc, evaluated: source.evaluated, edge: { ...edges[0] } };
  return { owner, source, request, edges };
}

test('a picked row returns copied original endpoints without changing selection, radius or preview', () => {
  const { owner, source, request, edges } = fixture();
  const before = JSON.stringify(owner);
  assert.deepEqual(readFilletPickedEdgeHighlight(request, source), expectedEdge(source, edges[0]));
  assert.deepEqual(readFilletPickedEdgeHighlight({ ...request, edge: edges[1] }, source), expectedEdge(source, edges[1]));
  assert.equal(JSON.stringify(owner), before);
});

test('preview status and radius clones keep original coordinates while new command contexts reject old row events', () => {
  const { owner, source, request } = fixture();
  const expected = readFilletPickedEdgeHighlight(request, source);
  assert.ok(expected);
  for (const preview of ['busy', 'ok', 'error'] as const) {
    assert.deepEqual(readFilletPickedEdgeHighlight(request, { ...source, active: { ...owner, preview, values: { ...owner.values, radius: 3 } } }), expected);
  }
  assert.equal(readFilletPickedEdgeHighlight(request, { ...source, active: { ...owner, ctx: { ...owner.ctx } } }), null);
  assert.equal(readFilletPickedEdgeHighlight(request, { ...source, active: { ...owner, cmd: { ...owner.cmd } } }), null);
  assert.equal(readFilletPickedEdgeHighlight(request, { ...source, active: null }), null);
  assert.equal(readFilletPickedEdgeHighlight(null, source), null);
});

test('stale document, evaluation, source bodies and unavailable display each reject an otherwise valid ordinal', () => {
  const { owner, source, request } = fixture();
  for (const changed of [
    { doc: { ...source.doc } },
    { evaluated: { ...source.evaluated } },
    { commandDoc: { ...source.commandDoc } },
    { bodies: [...source.bodies] },
    { available: false },
  ]) assert.equal(readFilletPickedEdgeHighlight(request, { ...source, ...changed }), null);
  const next = newFilletActive('edge', owner.ctx, owner.values);
  assert.equal(readFilletPickedEdgeHighlight(request, { ...source, active: next }), null, 'a new command with the same edge ordinal does not inherit the old highlight');
});

test('only directly selected valid edge ordinals in a new Edge Fillet can be highlighted', () => {
  const { owner, source, request, edges } = fixture();
  const unselected = owner.ctx.bodies[0].mesh.edges.findIndex((_, edge) => !edges.some(pick => pick.edge === edge));
  assert.ok(unselected >= 0);
  for (const edge of [{ body: 0, edge: unselected }, { body: 1, edge: edges[0].edge }, { body: 0, edge: -1 }, { body: 0, edge: 9999 }]) {
    assert.equal(readFilletPickedEdgeHighlight({ ...request, edge }, source), null);
  }
  for (const type of ['face', 'full-round'] as const) {
    const active = newFilletActive(type, owner.ctx);
    assert.equal(readFilletPickedEdgeHighlight({ ...request, owner: active }, { ...source, active }), null);
  }
  const history = { ...owner, historyFilletRadius: true as const };
  assert.equal(readFilletPickedEdgeHighlight({ ...request, owner: history }, { ...source, active: history }), null);
});

test('one selected straight ordinal supports all displayed names without edit-specific native flags', () => {
  const { owner, source, request } = fixture();
  const bodies = owner.ctx.bodies.map(body => ({ ...body, mesh: { ...body.mesh, edges: body.mesh.edges.map((edge, index) => index === request.edge.edge ? { ...edge, names: [...edge.names, 'additional-name'], nativeLine: undefined, nativeFinishLine: undefined } : edge) } }));
  const active = { ...owner, ctx: { ...owner.ctx, bodies } };
  const current = { ...source, active, bodies };
  assert.deepEqual(readFilletPickedEdgeHighlight({ ...request, owner: active }, current), expectedEdge(current, request.edge));
});

test('curved, unnamed, nonfinite and degenerate display edges have no straight highlight', () => {
  const { owner, source, request } = fixture();
  const original = owner.ctx.bodies[0].mesh.edges[request.edge.edge];
  const refused: Partial<DisplayEdge>[] = [
    { straight: false, nativeLine: undefined, nativeFinishLine: undefined },
    { straight: false },
    { nativeCircle: { centre: [0, 0, 0], normal: [0, 0, 1], radius: 5 } },
    { names: [] },
    { a: [NaN, 0, 0] },
    { b: [0, Infinity, 0] },
    { b: [...original.a] },
  ];
  for (const patch of refused) {
    const bodies = owner.ctx.bodies.map((body, bodyIndex) => bodyIndex !== request.edge.body ? body : {
      ...body, mesh: { ...body.mesh, edges: body.mesh.edges.map((edge, index) => index === request.edge.edge ? { ...edge, ...patch } : edge) },
    });
    const active = { ...owner, ctx: { ...owner.ctx, bodies } };
    assert.equal(readFilletPickedEdgeHighlight({ ...request, owner: active }, { ...source, active, bodies }), null, JSON.stringify(patch));
  }
});

test('a merged straight ordinal highlights its actual disconnected segments without bridging the gap or a foreign edge', () => {
  const { owner, source, request } = fixture();
  const edge = request.edge.edge;
  const lines = new Float64Array([0, 0, 0, 2, 0, 0, 3, 4, 0, 7, 4, 0, 8, 0, 0, 10, 0, 0]);
  const bodies = owner.ctx.bodies.map(body => ({ ...body, mesh: {
    ...body.mesh, edgeLines: lines, edgeOfSegment: new Float32Array([edge, edge, edge + 100, edge + 100, edge, edge]),
    edges: body.mesh.edges.map((original, index) => index === edge ? { ...original, a: [0, 0, 0] as [number, number, number], b: [10, 0, 0] as [number, number, number], names: ['part-a', 'part-b'], nativeLine: undefined } : original),
  } }));
  const active = { ...owner, ctx: { ...owner.ctx, bodies } };
  const highlighted = readFilletPickedEdgeHighlight({ ...request, owner: active }, { ...source, active, bodies });
  assert.deepEqual(highlighted, [[[0, 0, 0], [2, 0, 0]], [[8, 0, 0], [10, 0, 0]]]);
  lines[0] = 99;
  assert.equal(highlighted![0][0][0], 0, 'returned segments cannot change through source-buffer mutation');
});

test('missing, malformed, nonfinite or zero-length owned display segments are refused', () => {
  const { owner, source, request } = fixture(), edge = request.edge.edge;
  const cases = [
    { edgeLines: new Float64Array(), edgeOfSegment: new Float32Array() },
    { edgeLines: new Float64Array([0, 0, 0, 1, 0, 0]), edgeOfSegment: new Float32Array([edge + 100, edge + 100]) },
    { edgeLines: new Float64Array([0, 0, 0, 1, 0, 0]), edgeOfSegment: new Float32Array([edge, edge + 100]) },
    { edgeLines: new Float64Array([0, 0, 0, 1, 0]), edgeOfSegment: new Float32Array([edge, edge]) },
    { edgeLines: new Float64Array([0, 0, 0, Infinity, 0, 0]), edgeOfSegment: new Float32Array([edge, edge]) },
    { edgeLines: new Float64Array([0, 0, 0, 0, 0, 0]), edgeOfSegment: new Float32Array([edge, edge]) },
  ];
  for (const patch of cases) {
    const bodies = owner.ctx.bodies.map(body => ({ ...body, mesh: { ...body.mesh, ...patch } }));
    const active = { ...owner, ctx: { ...owner.ctx, bodies } };
    assert.equal(readFilletPickedEdgeHighlight({ ...request, owner: active }, { ...source, active, bodies }), null);
  }
});
