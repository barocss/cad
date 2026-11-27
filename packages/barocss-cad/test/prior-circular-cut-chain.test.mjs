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
});

test('signed Linear repeats the selected circular cut past later mixed through cuts, preserving the later R3 bore', () => {
  const model = chainBase();
  model.features[8] = { id: 'later2Sketch', kind: 'sketch', profile: 'circle', center: [44, 10], radius: 3 };
  const repeat = { id: 'repeat', kind: 'linear-feature-pattern', target: 'third', source: 'first', axis: 'x', spacing: 8, count: 2 };
  for (const spacing of [8, -5]) {
    const snapshot = evaluateCadPart({ ...model, features: [...model.features, { ...repeat, spacing }] });
    const brep = snapshot.outputs[0].brep;
    const quality = checkBrep(brep, { strict: true });
    assert.ok(quality.valid, quality.issues.join('\n'));
    assert.equal(quality.topology[0].genus, 4);
    near(brepMassProperties(brep, 1).volume, 24000 - 80 - (2 * 40 + 90) * Math.PI);
    const cylinders = brep.faces.map(face => faceGeometry(face)).filter(surface => surface.kind === 'cylinder');
    assert.equal(cylinders.length, 6);
    for (const [x, radius] of [[10, 2], [10 + spacing, 2], [44, 3]]) {
      assert.equal(cylinders.filter(c => Math.abs(c.r - radius) < 1e-8 && Math.hypot(c.c[0] - x, c.c[1] - 10) < 1e-8).length, 2);
    }
    assert.deepEqual(loadCadPart(saveCadPart(snapshot)).outputs[0].brep, brep);
  }
  for (const spacing of [29, 32]) {
    assert.throws(() => evaluateCadPart({ ...model, features: [...model.features, { ...repeat, spacing }] }),
      e => e instanceof CadPartError && e.feature === 'repeat' && e.code === 'GEOMETRY');
  }
  // Even if a pocket or a merged cavity evaluates in isolation, it cannot be used as a through-cut witness.
  model.features[9] = { ...model.features[9], height: 8 };
  assert.throws(() => evaluateCadPart({ ...model, features: [...model.features, repeat] }),
    e => e instanceof CadPartError && e.feature === 'repeat' && e.code === 'CAPABILITY');
});


test('Rectangular repeats only the original R2 on an XY grid after later rectangular and circular through cuts', () => {
  const model = chainBase();
  model.features[8] = { id: 'later2Sketch', kind: 'sketch', profile: 'circle', center: [44, 18], radius: 3, sideTags: { outer: ['laterRound'] } };
  const pattern = { id: 'repeat', kind: 'rectangular-feature-pattern', target: 'third', source: 'first',
    axis: 'x', spacing: 8, count: 2, axis2: 'y', spacing2: 8, count2: 2 };
  const evaluated = overrides => evaluateCadPart({ ...model, features: [...model.features, { ...pattern, ...overrides }] });
  for (const spacing of [8, -5]) {
    const snapshot = evaluated({ spacing });
    const brep = snapshot.outputs[0].brep;
    const quality = checkBrep(brep, { strict: true });
    assert.ok(quality.valid, quality.issues.join('\n'));
    assert.equal(quality.topology[0].shells, 1);
    assert.equal(quality.topology[0].genus, 6);
    near(brepMassProperties(brep, 1).volume, 24000 - 80 - (4 * 40 + 90) * Math.PI);
    const cylinders = brep.faces.filter(face => faceGeometry(face).kind === 'cylinder');
    assert.equal(cylinders.length, 10);
    for (const [i, j] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const walls = cylinders.filter(face => {
        const c = faceGeometry(face);
        return Math.abs(c.r - 2) < 1e-8 && Math.hypot(c.c[0] - (10 + i * spacing), c.c[1] - (10 + j * 8)) < 1e-8 && c.out === -1;
      });
      assert.equal(walls.length, 2);
      for (const face of walls) assert.ok(face.name.includes(i || j ? `[round]@${i},${j}` : '[round]'));
    }
    assert.equal(cylinders.filter(face => face.name.includes('laterRound') && Math.abs(faceGeometry(face).r - 3) < 1e-8).length, 2);
    assert.deepEqual(loadCadPart(saveCadPart(snapshot)).outputs[0].brep, brep);
  }
  for (const spacing of [29, 32]) {
    // Each axis-adjacent cell alone is valid; adding the diagonal touches or overlaps the later R3.
    evaluated({ spacing, count2: 1 });
    evaluated({ spacing, count: 1 });
    assert.throws(() => evaluated({ spacing }), e => e instanceof CadPartError && e.feature === 'repeat' && e.code === 'GEOMETRY');
  }
  assert.throws(() => evaluated({ axis2: 'z' }), e => e instanceof CadPartError && e.feature === 'repeat' && e.code === 'CAPABILITY');
  model.features[9] = { ...model.features[9], height: 8 };
  assert.throws(() => evaluated({}), e => e instanceof CadPartError && e.feature === 'repeat' && e.code === 'CAPABILITY');
});


test('straight XY Path repeats the earlier R2 past later R3 and rectangular cuts without changing original bore owners', () => {
  const stock = chainBase();
  stock.features[8] = { id: 'later2Sketch', kind: 'sketch', profile: 'circle', center: [38, 26], radius: 3, sideTags: { outer: ['laterRound'] } };
  const walls = output => output.brep.faces.flatMap(face => {
    const g = faceGeometry(face);
    return g.kind === 'cylinder' ? [{ name: face.name, ...g }] : [];
  });
  const original = walls(evaluateCadPart(stock).outputs[0]);
  const run = spacing => evaluateCadPart({ ...stock, features: [...stock.features, {
    id: 'repeat', kind: 'curve-feature-pattern', target: 'third', source: 'first', spacing, count: 4,
    path: { degree: 1, knots: [0, 0, 1, 2, 2], controlPoints: [[6, 5, 4], [6, 21, 4], [30, 21, 4]], weights: [1, 1, 1] },
  }] });
  for (const spacing of [12, 12.5]) {
    const snapshot = run(spacing);
    const out = verifyChain(snapshot, 5, 1, 80 + 50 * Math.PI);
    const cutWalls = walls(out);
    assert.deepEqual(cutWalls.filter(wall => original.some(old => old.name === wall.name)), original);
    for (const [ordinal, center] of [[1, [10, 10 + spacing]], [2, [2 * spacing - 6, 26]], [3, [3 * spacing - 6, 26]]]) {
      const copy = cutWalls.filter(wall => Math.hypot(wall.c[0] - center[0], wall.c[1] - center[1]) < 1e-8);
      assert.equal(copy.length, 2);
      assert.ok(copy.every(wall => wall.name.includes(`[round]@${ordinal}`) && Math.abs(wall.r - 2) < 1e-8 && wall.out === -1));
    }
    assert.deepEqual(loadCadPart(saveCadPart(snapshot)).outputs[0].brep, out.brep);
  }
  for (const spacing of [13, 13.125]) {
    assert.throws(() => run(spacing), e => e instanceof CadPartError && e.feature === 'repeat'
      && e.code === 'GEOMETRY' && /disjoint from the newer cuts/.test(e.message));
  }
});
