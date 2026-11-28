import assert from 'node:assert/strict';
import test from 'node:test';
import { rectanglePart } from '@barocss/cad-model/engine/doc';
import { evaluatePart } from '@barocss/cad-model/engine/evaluate';
import type { DisplayEdge } from '@barocss/cad-model/engine/mesh';
import { edgeRotationValues } from '../src/app/edgeRotation';
import { captureMeasureTarget } from '../src/app/measureTargets';

test('edge Rotate takes the exact native endpoint and axis for each cardinal direction', () => {
  const doc = rectanglePart(30, 20, 10);
  const evaluated = evaluatePart(doc, 1);
  assert.ok(evaluated.ok);
  const [body] = evaluated.bodies;
  for (const axis of ['x', 'y', 'z'] as const) {
    const edge = body.mesh.edges.find(candidate => candidate.nativeLine && candidate.axis === axis);
    assert.ok(edge);
    const pick = { body: 0, edge: edge.index };
    const target = captureMeasureTarget(pick, doc, body);
    assert.ok(target);
    const ctx = { doc, bodies: [body], selection: { faces: [], bodies: [], edges: [pick] } };
    const [px, py, pz] = edge.a;
    assert.deepEqual(edgeRotationValues(ctx, target), { axis, angle: 0, px, py, pz });
    assert.equal(edgeRotationValues({ ...ctx, selection: { ...ctx.selection, faces: [{ body: 0, face: 0 }] } }, target), undefined);
    assert.equal(edgeRotationValues({ ...ctx, bodies: [{ ...body, mesh: { ...body.mesh } }] }, target), undefined);
  }
});

test('edge Rotate refuses display-only, almost-cardinal and ambiguous edges', () => {
  const doc = rectanglePart(30, 20, 10);
  const evaluated = evaluatePart(doc, 1);
  assert.ok(evaluated.ok);
  const [body] = evaluated.bodies;
  const edge = body.mesh.edges.find(candidate => candidate.nativeLine && candidate.axis === 'z');
  assert.ok(edge);
  const pick = { body: 0, edge: edge.index };
  const check = (replacement: DisplayEdge, extra: DisplayEdge[] = []) => {
    const candidate = { ...body, mesh: { ...body.mesh, edges: [...body.mesh.edges.map(member => member === edge ? replacement : member), ...extra] } };
    const target = captureMeasureTarget(pick, doc, candidate);
    assert.ok(target);
    assert.equal(edgeRotationValues({ doc, bodies: [candidate], selection: { faces: [], bodies: [], edges: [pick] } }, target), undefined);
  };
  check({ ...edge, nativeLine: undefined });
  check({ ...edge, b: [edge.a[0] + 1e-10, edge.a[1], edge.b[2]] });
  check(edge, [{ ...edge }]);
});
