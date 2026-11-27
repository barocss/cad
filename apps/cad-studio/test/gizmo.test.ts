import test from 'node:test';
import assert from 'node:assert/strict';
import { dragAlong, dragPlane, dragTurn, handleLayout, hitTest, layout, snapTo, type FeatureHandle, type Projector, type TransformGizmo } from '../src/viewport/gizmo';
import type { Vec3 } from '@barocss/cad-model/engine/mesh';
import { beginWorldAngleDrag, turnPlaneRadial, turnPlaneStep, worldAngleDragValue } from '../src/viewport/localTurnDrag';

// A camera straight above, looking down −Z: screen x = world x, screen y = −world y (10 px per mm, origin at 500, 500).
const top: Projector = { project: (p: Vec3) => [500 + p[0] * 10, 500 - p[1] * 10], forward: [0, 0, -1], size: 10 };
// A camera in front, looking along +Y: screen x = world x, screen y = −world z.
const front: Projector = { project: (p: Vec3) => [500 + p[0] * 10, 500 - p[2] * 10], forward: [0, 1, 0], size: 10 };
// Above and in front of the origin, looking down at it: every axis shows.
const iso: Projector = { project: (p: Vec3) => [500 + (p[0] - p[1]) * 7, 500 + (p[0] + p[1]) * 4 - p[2] * 8], forward: [-0.6, -0.6, -0.5], size: 10 };

test('gizmo: arrows from a little out to their tips; an axis pointing at the camera is left out', () => {
  const L = layout({ origin: [0, 0, 0], move: [0, 1, 2] }, top);
  assert.deepEqual(L.arrows.map(a => [a.axis, a.from, a.to]), [[0, [520, 500], [600, 500]], [1, [500, 480], [500, 400]]]);
  assert.equal(layout({ origin: [0, 0, 0], move: [0, 1, 2] }, iso).arrows.length, 3);
});

test('gizmo: one signed oblique translation has one hit and disappears when seen end-on', () => {
  const origin: Vec3 = [3, 2, 1], direction: Vec3 = [0.6, 0, 0.8];
  const g: TransformGizmo = { origin, moveAlong: { direction, label: 'N' } };
  const projected = layout(g, front);
  assert.deepEqual(projected.along, { from: [542, 474], to: [590, 410], label: 'N' });
  assert.deepEqual(projected.arrows, []);
  assert.deepEqual(projected.planes, []);
  assert.deepEqual(hitTest([590, 410], g, [], front), { kind: 'move-along' });
  assert.equal(dragAlong([590, 410], [572, 434], origin, direction, front), -3);

  const endOn: TransformGizmo = { origin, moveAlong: { direction: [0, 1, 0], label: 'N' } };
  assert.equal(layout(endOn, front).along, null);
  assert.equal(hitTest(front.project(origin), endOn, [], front), null);
});

test('gizmo: an oblique turn measures the ray intersections and hides its edge-on arc', () => {
  const origin: Vec3 = [14, 24.5, 36], direction: Vec3 = [0, -0.8, 0.6], radial: Vec3 = [1, 0, 0];
  const g: TransformGizmo = { origin, turnAlong: { direction, radial, label: 'N' } };
  const right: Projector = { project: p => [p[1] * 10, -p[2] * 10], forward: [-1, 0, 0], size: 10 };
  const visible = layout(g, front).localArc;
  assert.ok(visible);
  assert.deepEqual(hitTest(visible.points[9], g, [], front), { kind: 'turn-along' });
  assert.equal(layout(g, right).localArc, null);
  assert.equal(hitTest(right.project(origin), g, [], right), null);

  const eye: Vec3 = [24, 10, 80];
  const intersection = (angle: number) => {
    const a = angle * Math.PI / 180;
    const point = [14 + 4 * Math.cos(a), 24.5 + 2.4 * Math.sin(a), 36 + 3.2 * Math.sin(a)];
    const vector = point.map((value, i) => value - eye[i]);
    const dir = vector.map(value => value / Math.hypot(...vector)) as Vec3;
    const result = turnPlaneRadial({ origin: eye, dir }, origin, direction);
    assert.ok(result);
    return result;
  };
  const a = intersection(17), b = intersection(59);
  assert.ok(Math.abs(turnPlaneStep(a, b, direction) - 42) < 1e-10);
  assert.ok(Math.abs(turnPlaneStep(b, a, direction) + 42) < 1e-10);
  assert.equal(turnPlaneRadial({ origin: eye, dir: [1, 0, 0] }, origin, direction), null);
  assert.equal(turnPlaneRadial({ origin: eye, dir: direction }, origin, direction), null);
  assert.equal(turnPlaneRadial({ origin: [0, 0, 1], dir: [0, 0, -1] }, [0, 0, 0], [0, 0, 1]), null);
});

test('world angle handle snaps signed angles and retains its original view and hinge', () => {
  const axis: Vec3 = [0, -0.8, 0.6], centre: Vec3 = [10, 20, 30];
  const radialAt = (degrees: number): Vec3 => {
    const angle = degrees * Math.PI / 180;
    return [Math.cos(angle), 0.6 * Math.sin(angle), 0.8 * Math.sin(angle)];
  };
  const handle: FeatureHandle = { id: 'deg', label: 'Angle', at: centre, dir: axis, value: 5, owner: {},
    scalarDragSession: {}, arc: { centre, axis, from: [16, 20, 30], worldPlane: true },
    toValue: (start, delta) => Math.round(start + delta), format: String, onDrag: () => undefined };
  const drag = beginWorldAngleDrag(handle, 'view', radialAt(5));
  assert.ok(drag);
  assert.equal(worldAngleDragValue(drag, { ...handle, value: 15 }, 'view', radialAt(15)), 15);
  assert.equal(worldAngleDragValue(drag, handle, 'view', radialAt(0)), 0);
  assert.equal(worldAngleDragValue(drag, handle, 'view', radialAt(-5)), -5);
  assert.equal(worldAngleDragValue(drag, handle, 'new-camera', radialAt(10)), null);
  assert.equal(worldAngleDragValue(drag, { ...handle, scalarDragSession: {} }, 'view', radialAt(10)), null);
  assert.equal(worldAngleDragValue(drag, { ...handle, arc: { ...handle.arc!, centre: [10, 21, 30] } }, 'view', radialAt(10)), null);
  assert.equal(worldAngleDragValue(drag, handle, 'view', null), null);
  assert.equal(worldAngleDragValue(drag, handle, 'view', radialAt(-6)), -6);
});

test('gizmo: plane squares sit between their two arrows, arcs face the camera', () => {
  const g: TransformGizmo = { origin: [0, 0, 0], move: [0, 1, 2], turn: [0, 1, 2] };
  const L = layout(g, iso);
  assert.deepEqual(L.planes.map(q => q.axes), [[0, 1], [1, 2], [0, 2]]);
  assert.deepEqual(layout({ origin: [0, 0, 0], move: [0, 2] }, iso).planes.map(q => q.axes), [[0, 2]], 'a square only for two moving axes');
  // The XY square lies between the +X and +Y arrows.
  const xy = L.planes[0].points, c = xy.reduce((m, p) => [m[0] + p[0] / 4, m[1] + p[1] / 4], [0, 0]);
  assert.ok(Math.abs(c[0] - iso.project([3.8, 3.8, 0])[0]) < 1e-9 && Math.abs(c[1] - iso.project([3.8, 3.8, 0])[1]) < 1e-9, JSON.stringify(c));
  assert.equal(L.arcs.length, 3);
  // The Z arc is a quarter of radius 0.82 × size in the XY plane, on the +X +Y side.
  for (const p of L.arcs[2].points) {
    const x = ((p[0] - 500) / 7 + ((p[1] - 500) / 4)) / 2, y = ((p[1] - 500) / 4 - (p[0] - 500) / 7) / 2;
    assert.ok(Math.abs(Math.hypot(x, y) - 8.2) < 1e-9 && x > 0 && y > 0, JSON.stringify({ x, y }));
  }
});

test('gizmo: hits find the handle under the pointer; the centre is none', () => {
  const g: TransformGizmo = { origin: [0, 0, 0], move: [0, 1, 2], turn: [2] };
  assert.deepEqual(hitTest([590, 502], g, [], top), { kind: 'move', axis: 0 });
  assert.deepEqual(hitTest([502, 440], g, [], top), { kind: 'move', axis: 1 });
  assert.deepEqual(hitTest([538, 462], g, [], top), { kind: 'plane', axes: [0, 1] });
  const a = 0.5 * Math.PI / 2; // the middle of the Z arc (radius 82 px), on the +X +Y side
  assert.deepEqual(hitTest([500 + 82 * Math.cos(a), 500 - 82 * Math.sin(a)], g, [], top), { kind: 'turn', axis: 2 });
  assert.equal(hitTest([500, 500], g, [], top), null);
  assert.equal(hitTest([700, 700], g, [], top), null);
});

test('gizmo: offset parallel feature arrows draw and hit on separate rows', () => {
  const span: FeatureHandle = {
    id: 'span', label: 'Total span', at: [0, 0, 0], dir: [1, 0, 0], value: 90,
    toValue: (start, mm) => start + mm, format: String, onDrag: () => {},
  };
  const count = { ...span, id: 'count', label: 'Count', screenOffset: 16 };
  assert.deepEqual(handleLayout(span, top), { from: [500, 500], to: [562, 500] });
  assert.deepEqual(handleLayout(count, top), { from: [500, 516], to: [562, 516] });
  assert.deepEqual(hitTest([556, 500], null, [span, count], top), { kind: 'handle', index: 0 });
  assert.deepEqual(hitTest([556, 516], null, [span, count], top), { kind: 'handle', index: 1 });
});

test('gizmo: drags in mm along an arrow, in two axes on a square; nothing along an axis at the camera', () => {
  assert.equal(dragAlong([600, 500], [650, 500], [0, 0, 0], [1, 0, 0], top), 5);
  assert.equal(dragAlong([500, 400], [500, 380], [0, 0, 0], [0, 1, 0], top), 2);
  assert.equal(dragAlong([500, 500], [520, 520], [0, 0, 0], [0, 0, 1], top), 0);
  assert.deepEqual(dragPlane([530, 470], [560, 450], [0, 0, 0], [0, 1], top), [3, 2]);
  assert.deepEqual(dragPlane([530, 470], [560, 450], [0, 0, 0], [0, 2], top), [0, 0], 'the XZ plane seen edge-on from above');
  assert.equal(snapTo(4.6, 1), 5); assert.equal(snapTo(-0.2, 1), 0); assert.equal(snapTo(44, 15), 45);
});

test('gizmo: sweeping round the centre turns right-handed about an axis seen from its tip', () => {
  // From above (+Z towards the camera), +X to +Y is a counter-clockwise quarter: +90° about Z.
  assert.ok(Math.abs(dragTurn([600, 500], [500, 400], [0, 0, 0], 2, top) - 90) < 1e-9);
  assert.ok(Math.abs(dragTurn([500, 400], [600, 500], [0, 0, 0], 2, top) + 90) < 1e-9);
  // From the front (looking along +Y, so −Y points at the camera): +X to +Z turns −90° about Y.
  assert.ok(Math.abs(dragTurn([600, 500], [500, 400], [0, 0, 0], 1, front) + 90) < 1e-9);
});
