import assert from 'node:assert/strict';
import test from 'node:test';
import { xyPlane } from '@barocss/cad-model/sketch/plane';
import type { SketchShape, SketchState } from '@barocss/cad-model/sketch/types';
import { findSketchOpenEnds, openEndLabelOffsets } from '../src/sketch/openEnds';

const sketchWith = (shape: SketchShape | null, done: SketchShape[] = [], extra: Partial<SketchState> = {}): SketchState => ({
  plane: xyPlane(),
  tool: 'polygon',
  shape,
  done,
  ...extra,
});

test('D2015 marks only unclosed material Line/Arc chain ends and ignores closed shapes and open construction lines', () => {
  const closedRect: SketchShape = { kind: 'rectangle', a: [0, 0], b: [40, 30] };
  const openConstruction: SketchShape = {
    kind: 'polygon',
    points: [[0, -10], [40, -10]],
    bulges: [0, 0],
    closed: false,
    construction: true,
  };
  const openArcChain: SketchShape = {
    kind: 'polygon',
    points: [[50, 0], [80, 0], [80, 20]],
    bulges: [0, 0.25, 0],
    closed: false,
  };
  const state = sketchWith(openArcChain, [closedRect, openConstruction]);
  const snapshot = JSON.stringify(state);

  const report = findSketchOpenEnds(state);
  assert.equal(JSON.stringify(state), snapshot, 'findSketchOpenEnds must not mutate sketch state');
  assert.equal(report.chains.length, 1);
  assert.equal(report.ends.length, 2);
  assert.deepEqual(report.ends.map(e => ({ label: e.label, role: e.role, point: e.point })), [
    { label: 'Open A', role: 'start', point: [50, 0] },
    { label: 'Open B', role: 'end', point: [80, 20] },
  ]);
});

test('D2015 matches Finish joinOpen semantics: closed joined chains produce 0 markers, partial joins mark only outer ends', () => {
  // Two separate open material chains whose ends meet to form a closed triangle.
  const partA: SketchShape = { kind: 'polygon', points: [[0, 0], [20, 0], [10, 15]], bulges: [0, 0, 0], closed: false };
  const partB: SketchShape = { kind: 'polygon', points: [[10, 15], [0, 0]], bulges: [0, 0], closed: false };
  assert.equal(findSketchOpenEnds(sketchWith(partB, [partA])).ends.length, 0);

  // Two open segments meeting at (20, 0) leave only (0, 0) and (20, 15) open.
  const seg1: SketchShape = { kind: 'polygon', points: [[0, 0], [20, 0]], bulges: [0, 0], closed: false };
  const seg2: SketchShape = { kind: 'polygon', points: [[20, 0], [20, 15]], bulges: [0, 0], closed: false };
  const partial = findSketchOpenEnds(sketchWith(seg2, [seg1]));
  assert.equal(partial.chains.length, 1);
  assert.deepEqual(partial.ends.map(e => e.point), [[0, 0], [20, 15]]);
});

test('D2015 never misdiagnoses closed self-intersecting polygons or band sketches as open ends', () => {
  const bowtie: SketchShape = {
    kind: 'polygon',
    points: [[0, 0], [20, 20], [20, 0], [0, 20]],
    bulges: [0, 0, 0, 0],
    closed: true,
  };
  assert.equal(findSketchOpenEnds(sketchWith(bowtie)).ends.length, 0);

  const openMaterial: SketchShape = { kind: 'polygon', points: [[0, 0], [10, 0]], bulges: [0, 0], closed: false };
  assert.equal(
    findSketchOpenEnds(sketchWith(openMaterial, [], { band: { version: 1, id: 'b1', sources: [], offset: 0, width: 2 } })).ends.length,
    0,
  );
});

test('D2015 labels multiple open chains distinctly and separates close screen-space label offsets', () => {
  const c1: SketchShape = { kind: 'polygon', points: [[0, 0], [10, 0]], bulges: [0, 0], closed: false };
  const c2: SketchShape = { kind: 'polygon', points: [[20, 0], [30, 0]], bulges: [0, 0], closed: false };
  const report = findSketchOpenEnds(sketchWith(c2, [c1]));
  assert.equal(report.chains.length, 2);
  assert.deepEqual(report.ends.map(e => e.label), ['Open 1A', 'Open 1B', 'Open 2A', 'Open 2B']);

  const offsets = openEndLabelOffsets([[100, 100], [112, 102]]);
  assert.equal(offsets.length, 2);
  assert.notEqual(Math.sign(offsets[0].dx), Math.sign(offsets[1].dx), 'close endpoints should push badges to opposite sides');
});
