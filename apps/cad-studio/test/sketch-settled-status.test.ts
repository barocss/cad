import test from 'node:test';
import assert from 'node:assert/strict';
import { sketchStatus } from '../src/ui/sketchSettledStatus';
import { outlineMobility } from '@barocss/cad-model/sketch/mobility';
import { solveShape, type Polygon } from '@barocss/cad-model/sketch/rules';

test('rectangle and completed Slot have concise state; Slot intermediate prompt remains', () => {
  assert.deepEqual(sketchStatus({ kind: 'rectangle', a: [0, 0], b: [40, 20] }, null), { text: 'Fully defined', warn: false });
  assert.deepEqual(sketchStatus({ kind: 'slot', a: [0, 0], b: [20, 0], r: 3 }, null), { text: 'Slot', warn: false });
  assert.deepEqual(sketchStatus({ kind: 'slot', a: [0, 0], b: [20, 0], r: 0 }, null), { text: 'Click the second centre, then the width', warn: true });
});

test('supported under-defined and fully locked outlines retain real mobility and constraint state', () => {
  const shape: Polygon = { kind: 'polygon', closed: true, points: [[0, 0], [40, 0], [40, 20], [0, 20]], hv: { h: [0, 2], v: [1, 3] } };
  const frozen = JSON.stringify(shape), moving = outlineMobility(shape);
  assert.ok(moving && moving.points.length > 0 && moving.edges.length > 0);
  assert.match(sketchStatus(shape, solveShape(shape)).text, /Under-defined/);
  const locked: Polygon = { ...shape, lengths: { 0: 40, 1: 20 } };
  assert.deepEqual(outlineMobility(locked), { points: [], edges: [] });
  assert.match(sketchStatus(locked, solveShape(locked)).text, /Fully defined/);
  assert.equal(JSON.stringify(shape), frozen);
});

test('native outline errors remain visible rather than replaced with settled success', () => {
  const shape: Polygon = { kind: 'polygon', closed: true, points: [[0, 0], [40, 0], [40, 20], [0, 20]] };
  const bad = { ok: false as const, reason: 'Conflicting dimensions' };
  assert.deepEqual(sketchStatus(shape, bad), { text: bad.reason, warn: true });
  assert.equal(outlineMobility({ ...shape, construction: true }), null);
  assert.equal(outlineMobility({ ...shape, closed: false }), null);
});
