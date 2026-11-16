import assert from 'node:assert/strict';
import test from 'node:test';
import type { BrepProjection, ProjectedEdge } from '@barocss/cad';
import type { ViewBreak } from '@barocss/cad-model/drawing/breaks';
import { edgeAt, snapPoints } from '@barocss/cad-model/drawing/dimensions';
import { drawingBrokenEdgeAt, drawingBrokenPick, insideDrawingBreak } from '../src/ui/drawing/drawingBrokenPick';

const line: ProjectedEdge = { name: 'original-line', kind: 'line', ends: [[0, 20, 0], [500, 20, 0]], circle: null,
  pieces: [{ visible: true, curve: { kind: 'line', a: [0, 20], b: [500, 20] } }] };
const circle: ProjectedEdge = { name: 'removed-circle', kind: 'circle', ends: null,
  circle: { center: [250, 20, 0], radius: 5, normal: [0, 0, 1], full: true, sweep: 2 * Math.PI },
  pieces: [{ visible: true, curve: { kind: 'arc', center: [250, 20], u: [5, 0], v: [0, 5], t0: 0, t1: 2 * Math.PI } }] };
const projection = { right: [1, 0, 0], up: [0, 1, 0], toward: [0, 0, 1], min: [0, 0], max: [500, 30], edges: [line, circle] } as BrepProjection;
const breaks: ViewBreak[] = [{ axis: 0, from: 100, to: 400, gap: 12 }];
const snaps = snapPoints(projection);

test('gap excludes original snaps and ink even with a large hit radius; Angle fallback cannot bypass it', () => {
  assert.ok(edgeAt(projection, [250, 20], 2));
  assert.ok(snaps.some(s => s.ref.at === 'center'));
  for (const at of [[250, 20], [100.0001, 20], [399.9999, 20]] as [number, number][]) {
    assert.deepEqual(drawingBrokenPick(projection, snaps, at, 1000, 1000, breaks), { snap: null, edge: null });
    assert.equal(drawingBrokenEdgeAt(projection, at, 1000, breaks), null);
  }
});

test('retained edges keep original endpoints and names; clipping creates no new snaps', () => {
  const before = structuredClone(projection);
  for (const x of [50, 100, 400, 450]) {
    const pick = drawingBrokenPick(projection, snaps, [x, 20], 1, 1, breaks);
    assert.equal(pick.snap, null); assert.equal(pick.edge?.name, line.name);
    assert.equal(pick.edge?.ends, line.ends);
    assert.ok(pick.edge?.pieces.length === 2);
  }
  const end = drawingBrokenPick(projection, snaps, [0, 20], 1, 1, breaks);
  assert.equal(end.snap, snaps.find(s => s.ref.edge === line.name && s.at[0] === 0));
  assert.equal(end.snap?.ref.near[0], 0);
  assert.equal(drawingBrokenEdgeAt(projection, [0, 20], 1, breaks)?.ends, line.ends);
  assert.deepEqual(projection, before);
});

test('multiple X/Y bands exclude interiors only and removed centre never attracts an outside pointer', () => {
  const bands: ViewBreak[] = [...breaks, { axis: 0, from: 450, to: 480, gap: 12 }, { axis: 1, from: 30, to: 40, gap: 6 }];
  for (const at of [[250, 0], [460, 0], [0, 35]] as [number, number][]) assert.equal(insideDrawingBreak(at, bands), true);
  for (const at of [[100, 30], [400, 40], [450, 0], [480, 0]] as [number, number][]) assert.equal(insideDrawingBreak(at, bands), false);
  const center = snaps.filter(s => s.ref.at === 'center');
  assert.equal(drawingBrokenPick(projection, center, [99, 20], 200, 1, breaks).snap, null);
});

test('without breaks existing snap priority, exact identity and edge fallback remain unchanged', () => {
  const at: [number, number] = [0, 20];
  const result = drawingBrokenPick(projection, snaps, at, 1, 1);
  assert.equal(result.snap, snaps[0]); assert.equal(result.edge, null);
  assert.equal(drawingBrokenEdgeAt(projection, [50, 20], 1), edgeAt(projection, [50, 20], 1));
  assert.equal(drawingBrokenPick(projection, [], [50, 20], 1, 1).edge, line);
});

test('retained circular ink preserves analytic radius while a clipped circle cannot be selected', () => {
  const arc = circle.pieces[0].curve;
  assert.equal(arc.kind, 'arc');
  if (arc.kind !== 'arc') throw new Error('fixture must be circular');
  const kept: ProjectedEdge = { ...circle, name: 'kept-circle',
    circle: { ...circle.circle!, center: [450, 20, 0] },
    pieces: [{ visible: true, curve: { ...arc, center: [450, 20] } }] };
  const pr = { ...projection, edges: [circle, kept] };
  assert.equal(drawingBrokenPick(pr, [], [255, 20], 1, 1, breaks).edge, null);
  const pick = drawingBrokenPick(pr, [], [455, 20], 1, 1, breaks);
  assert.equal(pick.edge?.name, kept.name);
  assert.equal(pick.edge?.circle, kept.circle);
  assert.equal(pick.edge?.circle?.radius, 5);
});
