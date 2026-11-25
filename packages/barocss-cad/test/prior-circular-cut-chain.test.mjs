import test from 'node:test';
import assert from 'node:assert/strict';
import {
  brepMassProperties, CadPartError, checkBrep, evaluateCadPart, faceGeometry, loadCadPart, massPropertiesOf, saveCadPart,
} from '../dist/index.js';

const near = (a, b, tolerance = 1e-7) => assert.ok(Number.isFinite(a) && Math.abs(a - b) <= tolerance, `${a} vs ${b}`);

const chainBase = (extraLater = []) => ({
  format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {},
  features: [
    { id: 'stockSketch', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [60, 40] },
    { id: 'stock', kind: 'extrude', sketch: 'stockSketch', height: 10 },
    { id: 'circleSketch', kind: 'sketch', profile: 'circle', center: [10, 10], radius: 2, sideTags: { outer: ['round'] } },
    { id: 'circleTool', kind: 'extrude', sketch: 'circleSketch', height: 10 },
    { id: 'first', kind: 'difference', target: 'stock', tool: 'circleTool' },
    { id: 'later1Sketch', kind: 'sketch', profile: 'rectangle', min: [24, 8], max: [28, 10], sideTags: { outer: ['a1', 'b1', 'c1', 'd1'] } },
    { id: 'later1Tool', kind: 'extrude', sketch: 'later1Sketch', height: 10 },
    { id: 'second', kind: 'difference', target: 'first', tool: 'later1Tool' },
    { id: 'later2Sketch', kind: 'sketch', profile: 'rectangle', min: [42, 8], max: [46, 12], sideTags: { outer: ['a2', 'b2', 'c2', 'd2'] } },
    { id: 'later2Tool', kind: 'extrude', sketch: 'later2Sketch', height: 10 },
    { id: 'third', kind: 'difference', target: 'second', tool: 'later2Tool' },
    ...extraLater,
  ],
});

function verifyChain(snapshot, expectedCircles, expectedRects, rectVolume) {
  assert.equal(snapshot.outputs.length, 1);
  const output = snapshot.outputs[0], brep = output.brep, report = checkBrep(brep, { strict: true });
  assert.ok(report.valid, report.issues.join('\n'));
  assert.equal(report.topology.length, 1);
  assert.equal(report.topology[0].shells, 1);
  assert.equal(report.topology[0].genus, expectedCircles + expectedRects);
  const cylinders = brep.faces.filter(face => faceGeometry(face).kind === 'cylinder');
  assert.equal(cylinders.length, 2 * expectedCircles);
  const expectedVolume = 24000 - rectVolume - expectedCircles * 40 * Math.PI;
  near(massPropertiesOf(output).volume, expectedVolume);
  near(brepMassProperties(brep, 1).volume, expectedVolume);
  return output;
}

test('earlier circular through-cut repeats across two and three later rectangular through-cuts for Linear, Rectangular, Fill and Path', () => {
  // Linear across 2 later cuts
  const linear = chainBase();
  linear.features.push({ id: 'repeat', kind: 'linear-feature-pattern', target: 'third', source: 'first', axis: 'x', spacing: 24, count: 2 });
  const linOut = verifyChain(evaluateCadPart(linear), 2, 2, 240);
  assert.deepEqual(verifyChain(loadCadPart(saveCadPart(evaluateCadPart(linear))), 2, 2, 240).brep, linOut.brep);

  // Rectangular grid across 2 later cuts (y-offset avoids both later rectangles at y=8..12)
  const rect = chainBase();
  rect.features.push({ id: 'repeat', kind: 'rectangular-feature-pattern', target: 'third', source: 'first', axis: 'x', spacing: 8, count: 2, axis2: 'y', spacing2: 14, count2: 2 });
  verifyChain(evaluateCadPart(rect), 4, 2, 240);

  // Fill across 2 later cuts
  const fill = chainBase();
  fill.features.push({
    id: 'repeat', kind: 'fill-feature-pattern', target: 'third', source: 'first',
    region: { points: [[5, 5], [22, 5], [22, 30], [5, 30]] }, anchor: [10, 10],
    axis: 'x', spacing: 8, count: 2, axis2: 'y', spacing2: 14, count2: 2,
  });
  verifyChain(evaluateCadPart(fill), 4, 2, 240);

  // Path (quadratic) across 2 later cuts
  const path = chainBase();
  path.features.push({
    id: 'repeat', kind: 'curve-feature-pattern', target: 'third', source: 'first',
    path: { degree: 2, knots: [0, 0, 0, 1, 1, 1], controlPoints: [[0, 0, 0], [0, 12, 0], [10, 20, 0]], weights: [1, 1, 1] },
    spacing: 10, count: 3,
  });
  verifyChain(evaluateCadPart(path), 3, 2, 240);

  // Linear across 3 later rectangular cuts
  const threeLater = chainBase([
    { id: 'later3Sketch', kind: 'sketch', profile: 'rectangle', min: [42, 26], max: [46, 30], sideTags: { outer: ['a3', 'b3', 'c3', 'd3'] } },
    { id: 'later3Tool', kind: 'extrude', sketch: 'later3Sketch', height: 10 },
    { id: 'fourth', kind: 'difference', target: 'third', tool: 'later3Tool' },
    { id: 'repeat', kind: 'linear-feature-pattern', target: 'fourth', source: 'first', axis: 'y', spacing: 14, count: 2 },
  ]);
  verifyChain(evaluateCadPart(threeLater), 2, 3, 400);
});

test('multi-later circular pattern refuses collision with second or third later cut and refuses overlapping later cuts', () => {
  // Collision with second later rectangle [42,8]..[46,12]
  const hitSecond = chainBase();
  hitSecond.features.push({ id: 'repeat', kind: 'linear-feature-pattern', target: 'third', source: 'first', axis: 'x', spacing: 32, count: 2 });
  assert.throws(() => evaluateCadPart(hitSecond), e => e instanceof CadPartError && e.feature === 'repeat' && e.code === 'GEOMETRY');

  // Collision with third later rectangle [8,26]..[12,30]
  const hitThird = chainBase([
    { id: 'later3Sketch', kind: 'sketch', profile: 'rectangle', min: [8, 26], max: [12, 30] },
    { id: 'later3Tool', kind: 'extrude', sketch: 'later3Sketch', height: 10 },
    { id: 'fourth', kind: 'difference', target: 'third', tool: 'later3Tool' },
    { id: 'repeat', kind: 'linear-feature-pattern', target: 'fourth', source: 'first', axis: 'y', spacing: 16, count: 2 },
  ]);
  assert.throws(() => evaluateCadPart(hitThird), e => e instanceof CadPartError && e.feature === 'repeat' && e.code === 'GEOMETRY');

  // Overlapping later rectangles in the Difference chain are refused
  const overlapLater = chainBase();
  overlapLater.features[8] = { id: 'later2Sketch', kind: 'sketch', profile: 'rectangle', min: [27, 8], max: [32, 12] };
  overlapLater.features.push({ id: 'repeat', kind: 'linear-feature-pattern', target: 'third', source: 'first', axis: 'x', spacing: 8, count: 2 });
  assert.throws(() => evaluateCadPart(overlapLater), e => e instanceof CadPartError && e.feature === 'repeat' && e.code === 'GEOMETRY');

  // Non-rectangular later cut (circle) in the chain remains refused
  const circleLater = chainBase();
  circleLater.features[8] = { id: 'later2Sketch', kind: 'sketch', profile: 'circle', center: [44, 10], radius: 2 };
  circleLater.features.push({ id: 'repeat', kind: 'linear-feature-pattern', target: 'third', source: 'first', axis: 'x', spacing: 8, count: 2 });
  assert.throws(() => evaluateCadPart(circleLater), e => e instanceof CadPartError && e.feature === 'repeat' && e.code === 'CAPABILITY');
});
