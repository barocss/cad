import test from 'node:test';
import type { BrepProjection, ProjectedEdge } from '@barocss/cad';
import assert from 'node:assert/strict';
import { pickVisibleDetailRim, reconnectDetailDiameter, visibleDetailRim } from '../src/ui/drawing/detailDiameterReattachment';
import { starterDoc } from '@barocss/cad-model/engine/doc';
import { drawingInputs } from '@barocss/cad-model/chat/drawing';
import { issueContext } from '@barocss/cad-model/drawing/issues';
import { defaultDrawing, type DrawingSettings, type Vec3 } from '@barocss/cad-model/drawing/types';

function fixture() {
  const settings: DrawingSettings = { ...defaultDrawing(), sheet: 'A3', details: [{ id: 'B', view: 'top', center: [32, 16], radius: 6, scale: 5, at: [250, 80] }],
    dimensions: [{ id: 'legacy', kind: 'diameter', view: 'detail:B', edge: 'missing', near: [32,16,8], place: [41,21], tol: { kind: 'symmetric', value: .15 } }],
    frames: [{ id: 'f', dim: 'legacy', characteristic: 'flatness', value: .05, datums: [] }] };
  const input = drawingInputs(starterDoc(), settings); if (typeof input === 'string') throw Error(input);
  const context = issueContext(input), projection = context.sheet.details![0].projection, detail = settings.details![0];
  const original = settings.dimensions[0]; if (original.kind !== 'diameter') throw Error('fixture');
  const edge = projection.edges.find(e => visibleDetailRim(projection, e))!; assert.ok(edge?.circle);
  const candidate = { edge: edge.name, near: [...edge.circle.center] as Vec3 };
  return { settings, original, projection, detail, edge, candidate };
}

test('current clipped visible rim repairs only reference fields and preserves authored dimension and controls', () => {
  const f = fixture(), before = structuredClone(f.settings);
  const next = reconnectDetailDiameter(f.settings, f.original, f.projection, f.detail, f.candidate);
  assert.ok(next); assert.deepEqual(next, { ...f.original, edge: f.candidate.edge, near: f.candidate.near });
  assert.deepEqual(f.settings, before); assert.equal(next.place, f.original.place); assert.equal(next.tol, f.original.tol);
});

test('confirmation rejects stale original/detail, duplicate ids and stale candidate coordinates', () => {
  const f = fixture();
  assert.equal(reconnectDetailDiameter(f.settings, { ...f.original }, f.projection, f.detail, f.candidate), null);
  assert.equal(reconnectDetailDiameter(f.settings, f.original, f.projection, { ...f.detail }, f.candidate), null);
  assert.equal(reconnectDetailDiameter({ ...f.settings, dimensions: [f.original, { ...f.original }] }, f.original, f.projection, f.detail, f.candidate), null);
  assert.equal(reconnectDetailDiameter(f.settings, f.original, f.projection, f.detail, { ...f.candidate, near: [0,0,0] }), null);
});

test('hidden, uninked, absent and cloned source edges are not visible detail candidates', () => {
  const f = fixture();
  assert.equal(visibleDetailRim(f.projection, { ...f.edge }), false);
  for (const visible of [false, true]) {
    const edge = { ...f.edge, pieces: f.edge.pieces.map(p => ({ ...p, visible, ...(visible ? { ink: false as const } : {}) })) };
    const projection = { ...f.projection, edges: [edge] };
    assert.equal(visibleDetailRim(projection, edge), false);
    assert.equal(reconnectDetailDiameter(f.settings, f.original, projection, f.detail, f.candidate), null);
  }
  assert.equal(reconnectDetailDiameter(f.settings, f.original, { ...f.projection, edges: [] }, f.detail, f.candidate), null);
});


test('mixed suppressed and drawable arcs reject a blank-piece pointer and retain original edge identity', () => {
  const edge: ProjectedEdge = { name: 'mixed', kind: 'circle', ends: null,
    circle: { center: [0,0,0], radius: 5, normal: [0,0,1], full: true, sweep: 2*Math.PI },
    pieces: [
      { visible: true, ink: false, curve: { kind: 'arc', center: [0,0], u: [5,0], v: [0,5], t0: 0, t1: Math.PI } },
      { visible: true, curve: { kind: 'arc', center: [0,0], u: [5,0], v: [0,5], t0: Math.PI, t1: 2*Math.PI } },
    ] };
  const projection = { right: [1,0,0], up: [0,1,0], toward: [0,0,1], min: [-5,-5], max: [5,5], edges: [edge] } as BrepProjection;
  assert.equal(visibleDetailRim(projection, edge), true, 'the edge has other drawable ink');
  assert.equal(pickVisibleDetailRim(projection, [0,5], .1), null, 'suppressed upper half is not a pick');
  assert.equal(pickVisibleDetailRim(projection, [0,-5], .1), edge);
});
