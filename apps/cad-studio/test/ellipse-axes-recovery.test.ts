import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDoc } from '@barocss/cad-model/engine/doc';
import { ellipseShape } from '@barocss/cad-model/sketch/ellipse';
import { xyPlane } from '@barocss/cad-model/sketch/plane';
import type { Polygon } from '@barocss/cad-model/sketch/rules';
import type { SketchState } from '@barocss/cad-model/sketch/types';
import { ownsEllipseAxesRecovery } from '../src/sketch/ellipseAxesRecovery';
import { studioSketchViewportActions } from '../src/viewport/studioSketchViewportActions';
import { applyEllipse } from '../src/ui/ellipsePanel';

const shape = () => ellipseShape({ center: [0, 0], rx: 40, ry: 20, angle: 0 }) as Polygon;
const draft = (): SketchState => ({ shape: shape(), tool: 'dimension', plane: xyPlane() });

test('ellipse Dimension refusal offers exactly the resulting draft without editing geometry', () => {
  const before = draft(), source = before.shape, untouched = JSON.stringify(before);
  let current = before;
  const offers: SketchState[] = [], errors: string[] = [];
  const actions = studioSketchViewportActions({ sketch: before, liveShape: { current: source }, currentSketchSource: () => undefined,
    setSketch: next => { current = (typeof next === 'function' ? next(current) : next)!; },
    setSketchError: reason => errors.push(reason), offerEllipseAxes: next => offers.push(next),
    clearOutlinePickIssue() {}, updateCircleDiameter() {}, setConstraintConflict() {},
    updateShape() { assert.fail('recovery must not edit geometry'); }, trimSketch() {},
  });
  actions.onSketchPick?.({ kind: 'edge', i: 0 }, false);
  assert.deepEqual(errors, ['Edit Rx or Ry in the Ellipse section.']);
  assert.equal(offers.length, 1); assert.equal(offers[0], current); assert.equal(current.shape, source);
  assert.equal(JSON.stringify(before), untouched);
  const doc = emptyDoc(), receipt = { doc, draft: current };
  assert.equal(ownsEllipseAxesRecovery(receipt, doc, current), true);
  for (const changed of [null, before, { ...current }, { ...current, tool: 'select' as const }])
    assert.equal(ownsEllipseAxesRecovery(receipt, doc, changed), false);
  assert.equal(ownsEllipseAxesRecovery(receipt, emptyDoc(), current), false);
});

test('stale source and ordinary Select picks never offer ellipse recovery', () => {
  const before = draft();
  for (const [sketch, live] of [[before, { ...before.shape! }], [{ ...before, tool: 'select' as const }, before.shape]] as const) {
    const offers: SketchState[] = [];
    const actions = studioSketchViewportActions({ sketch, liveShape: { current: live }, currentSketchSource: () => undefined,
      setSketch() {}, setSketchError() {}, offerEllipseAxes: next => offers.push(next),
      clearOutlinePickIssue() {}, updateCircleDiameter() {}, setConstraintConflict() {}, updateShape() {}, trimSketch() {},
    });
    actions.onSketchPick?.({ kind: 'edge', i: 0 }, false);
    assert.deepEqual(offers, []);
  }
});

test('two successive existing axis edits preserve original and retain native rejection', () => {
  const original = shape(), untouched = JSON.stringify(original);
  let current = original;
  const errors: (string | null)[] = [];
  const apply = (rx: number, ry: number) => applyEllipse(current, { ...current.ellipse!, rx, ry }, next => { current = next as Polygon; }, e => errors.push(e));
  apply(54, 20); apply(54, 22);
  assert.equal(current.ellipse?.rx, 54); assert.equal(current.ellipse?.ry, 22);
  assert.deepEqual(errors, [null, null]); assert.equal(JSON.stringify(original), untouched);
  const valid = current; apply(54, 1); assert.equal(current, valid); assert.ok(errors.at(-1));
});
