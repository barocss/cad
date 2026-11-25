import test from 'node:test';
import assert from 'node:assert/strict';
import {
  brepMassProperties, CadPartError, checkBrep, curveDomain, evaluateCadPart, evaluateCurve, evaluateSurface,
  faceGeometry, loadCadPart, massPropertiesOf, reevaluate, saveCadPart,
} from '../dist/index.js';
import { priorCurveCutPlan } from '../dist/features/curve-cut-pattern.js';

const near = (a, b, tolerance = 1e-7) => assert.ok(Number.isFinite(a) && Math.abs(a - b) <= tolerance, `${a} vs ${b}`);
const path = (degree = 2, z = 0) => degree === 1
  ? { degree: 1, knots: [0, 0, 1, 2, 2], controlPoints: [[6, 5, z], [6, 21, z], [30, 21, z]], weights: [1, 1, 1] }
  : { degree: 2, knots: [0, 0, 0, 1, 1, 2, 2, 2], controlPoints: [[6, 5, z], [6, 13, z], [6, 21, z], [18, 21, z], [30, 21, z]], weights: [1, 1, 1, 1, 1] };
const quadratic = () => ({ degree: 2, knots: [0, 0, 0, 1, 1, 1], controlPoints: [[0, 0, 0], [20, 0, 0], [20, 20, 0]], weights: [1, 1, 1] });
const quarter = () => ({ degree: 2, knots: [0, 0, 0, 1, 1, 1], controlPoints: [[6, 4, 0], [26, 4, 0], [26, 24, 0]], weights: [1, Math.SQRT1_2, 1] });
const document = (rail = path()) => ({ format: 'barocss-cad-part', version: 1, units: 'mm', parameters: { cx: 10, cy: 10, r: 2, pitch: 16, right: 28 }, features: [
  { id: 'stockSketch', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [60, 40] },
  { id: 'stock', kind: 'extrude', sketch: 'stockSketch', height: 10 },
  { id: 'circleSketch', kind: 'sketch', profile: 'circle', center: [{ parameter: 'cx' }, { parameter: 'cy' }], radius: { parameter: 'r' }, sideTags: { outer: ['round'] } },
  { id: 'circleTool', kind: 'extrude', sketch: 'circleSketch', height: 10 },
  { id: 'first', kind: 'difference', target: 'stock', tool: 'circleTool' },
  { id: 'laterSketch', kind: 'sketch', profile: 'rectangle', min: [24, 8], max: [{ parameter: 'right' }, 10], sideTags: { outer: ['a', 'b', 'c', 'd'] } },
  { id: 'laterTool', kind: 'extrude', sketch: 'laterSketch', height: 10 },
  { id: 'second', kind: 'difference', target: 'first', tool: 'laterTool' },
  { id: 'repeat', kind: 'curve-feature-pattern', target: 'second', source: 'first', path: rail, spacing: { parameter: 'pitch' }, count: 3 },
] });
const baseOffsets = [[0, 0], [0, 16], [16, 16]], editedOffsets = [[0, 0], [0, 14], [12, 16]];
const laterWalls = brep => brep.faces.filter(face => face.name?.startsWith('laterTool.side')).map(face => ({ name: face.name, geometry: faceGeometry(face) })).sort((a, b) => a.name.localeCompare(b.name));

/** Explicit physical offsets are independent of the path planner. */
function verify(snapshot, offsets = baseOffsets) {
  assert.equal(snapshot.outputs.length, 1);
  const output = snapshot.outputs[0], brep = output.brep, report = checkBrep(brep, { strict: true });
  assert.equal(output.id, 'repeat'); assert.equal(output.bodyCount, 1); assert.equal(brep.source.family, 'prismatic-solid');
  assert.ok(report.valid, report.issues.join('\n'));
  const { cx, cy, r, right } = snapshot.document.parameters, n = offsets.length;
  const centers = offsets.map(([x, y], k) => ({ center: [cx + x, cy + y], suffix: k ? `@${k}` : '' }));
  assert.equal(report.topology.length, 1); assert.equal(report.topology[0].shells, 1); assert.equal(report.topology[0].genus, n + 1);
  assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 10 + 2 * n, loops: 12 + 4 * n, coedges: 48 + 12 * n, edges: 24 + 6 * n, vertices: 16 + 4 * n });
  const rectangleVolume = 20 * (right - 24), circleVolume = 10 * Math.PI * r ** 2, volume = 24000 - rectangleVolume - n * circleVolume;
  const centroid = [(720000 - rectangleVolume * (24 + right) / 2 - circleVolume * centers.reduce((sum, { center }) => sum + center[0], 0)) / volume,
    (480000 - rectangleVolume * 9 - circleVolume * centers.reduce((sum, { center }) => sum + center[1], 0)) / volume, 5];
  for (const mass of [massPropertiesOf(output), brepMassProperties(brep, 1)]) {
    near(mass.volume, volume); mass.centroid.forEach((x, i) => near(x, centroid[i]));
  }
  const cylinders = brep.faces.map(face => ({ face, g: faceGeometry(face) })).filter(({ g }) => g.kind === 'cylinder');
  assert.equal(cylinders.length, 2 * n);
  for (const { center, suffix } of centers) {
    const walls = cylinders.filter(({ g }) => Math.hypot(g.c[0] - center[0], g.c[1] - center[1]) < 1e-8);
    assert.equal(walls.length, 2);
    for (const { face, g } of walls) {
      near(g.r, r); near(Math.abs(g.a[2]), 1); near(g.a[0], 0); near(g.a[1], 0); assert.equal(g.out, -1);
      const prefix = `circleTool.side[round]${suffix}`;
      assert.ok(face.name === prefix || (face.name.startsWith(prefix + '#') && /^\d+$/.test(face.name.slice(prefix.length + 1))));
      assert.equal(face.name.includes('@'), !!suffix);
    }
  }
  for (const z of [0, 10]) {
    const caps = brep.faces.filter(face => { const g = faceGeometry(face); return g.kind === 'plane' && Math.abs(g.n[2]) === 1 && g.o[2] === z; });
    assert.equal(caps.length, 1); near(faceGeometry(caps[0]).n[2], z ? 1 : -1);
    const loops = caps[0].loops.map(id => brep.loops.find(loop => loop.id === id));
    assert.equal(loops.filter(loop => loop.kind === 'outer').length, 1);
    const holes = loops.filter(loop => loop.kind === 'inner'); assert.equal(holes.length, n + 1);
    const roundHoles = holes.filter(loop => loop.coedges.every(id => brep.edges.find(edge => edge.id === brep.coedges.find(use => use.id === id).edge).curve.degree === 2));
    assert.equal(roundHoles.length, n);
    for (const { center } of centers) assert.equal(roundHoles.filter(loop => loop.coedges.every(id => {
      const use = brep.coedges.find(use => use.id === id), curve = brep.edges.find(edge => edge.id === use.edge).curve, [lo, hi] = curveDomain(curve);
      return [0, .23, .61, 1].every(f => { const p = evaluateCurve(curve, lo + f * (hi - lo));
        return Math.abs(p[2] - z) < 1e-8 && Math.abs(Math.hypot(p[0] - center[0], p[1] - center[1]) - r) < 1e-8; });
    })).length, 1);
  }
  for (const use of brep.coedges) {
    assert.ok(use.pcurve);
    const edge = brep.edges.find(edge => edge.id === use.edge), face = brep.faces.find(face => face.loops.includes(use.loop));
    const twin = brep.coedges.find(peer => peer.id === use.twin); assert.equal(twin.twin, use.id); assert.notEqual(twin.sense, use.sense);
    const [lo, hi] = curveDomain(edge.curve);
    for (const f of [0, .31, .79, 1]) {
      const t = lo + f * (hi - lo), uv = evaluateCurve(use.pcurve, t), p = evaluateCurve(edge.curve, t), q = evaluateSurface(face.surface, uv[0], uv[1]);
      near(Math.hypot(...p.map((x, i) => x - q[i])), 0);
    }
  }
  return output;
}

test('the linked C0 straight Path keeps original circular owners and both complete translated native bores', () => {
  const input = document(), before = structuredClone(input), initial = evaluateCadPart(input), output = verify(initial);
  const mass = massPropertiesOf(output), volume = 23920 - 120 * Math.PI;
  near(mass.volume, volume); near(mass.centroid[0], (717920 - 1840 * Math.PI) / volume); near(mass.centroid[1], (479280 - 2480 * Math.PI) / volume);
  const current = document(); current.features.pop();
  assert.deepEqual(laterWalls(output.brep), laterWalls(evaluateCadPart(current).outputs[0].brep));
  assert.deepEqual(input, before); assert.deepEqual(initial.document, before);
  const reopened = loadCadPart(saveCadPart(initial));
  assert.deepEqual(reopened.document, initial.document); assert.deepEqual(verify(reopened).brep, output.brep);
});

test('spacing16→14 updates exact @1/@2 centers through both path spans and native reopen/restore', () => {
  const initial = evaluateCadPart(document()), saved = saveCadPart(initial);
  const edited = reevaluate(initial, { parameters: { pitch: 14 } }), output = verify(edited, editedOffsets);
  const mass = massPropertiesOf(output), volume = 23920 - 120 * Math.PI;
  near(mass.centroid[0], (717920 - 1680 * Math.PI) / volume); near(mass.centroid[1], (479280 - 2400 * Math.PI) / volume);
  const reopened = loadCadPart(saveCadPart(edited)); assert.deepEqual(verify(reopened, editedOffsets).brep, output.brep);
  for (const parameters of [{ r: 3 }, { cx: 12 }, { right: 30 }]) verify(reevaluate(initial, { parameters }));
  assert.equal(saveCadPart(initial), saved);
  assert.deepEqual(verify(reevaluate(reopened, { parameters: { pitch: 16 } })).brep, initial.outputs[0].brep);
});

test('polyline and translated level encodings retain the same independent physical placements', () => {
  for (const rail of [path(1), path(2, 7)]) verify(evaluateCadPart(document(rail)));
  const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };
  const plan = priorCurveCutPlan(path(), 16, 3, 10000, fail);
  assert.equal(plan.kind, 'straight'); assert.deepEqual(plan.offsets, [[0, 0, 0], [0, 16, 0], [16, 16, 0]]);
});

test('a canonical quarter arc places the earlier circular cut by arc length through native edit and reopen', () => {
  const input = document(quarter()), repeat = input.features.at(-1);
  input.parameters.pitch = 8; repeat.count = 4;
  const offsets = pitch => Array.from({ length: repeat.count }, (_, k) => {
    const a = k * pitch / 20;
    return [20 * Math.sin(a), 20 * (1 - Math.cos(a))];
  });
  const initial = evaluateCadPart(input), accepted = saveCadPart(initial);
  const next = verify(initial, offsets(8));
  const unpatterned = structuredClone(input); unpatterned.features.pop();
  assert.deepEqual(laterWalls(next.brep), laterWalls(evaluateCadPart(unpatterned).outputs[0].brep));
  const edited = reevaluate(initial, { parameters: { pitch: 9 } });
  assert.deepEqual(verify(loadCadPart(saveCadPart(edited)), offsets(9)).brep, verify(edited, offsets(9)).brep);
  assert.equal(saveCadPart(initial), accepted);
  assert.throws(() => reevaluate(initial, { parameters: { pitch: 4 } }),
    e => e instanceof CadPartError && e.feature === 'repeat' && e.code === 'GEOMETRY' && /disjoint/.test(e.message));
  assert.throws(() => reevaluate(initial, { parameters: { pitch: 11 } }),
    e => e instanceof CadPartError && e.feature === 'repeat' && e.code === 'PARAMETER' && /path length/.test(e.message));
  assert.equal(saveCadPart(initial), accepted);
});

test('a single polynomial quadratic places the earlier circular cut on the exact length schedule', () => {
  // The primitive integrates 40 sqrt((1-t)²+t²) after the change of variable x=2t-1.
  const primitive = x => 5 * Math.SQRT2 * (x * Math.hypot(1, x) + Math.asinh(x));
  const offsets = pitch => [[0, 0], ...[pitch, 2 * pitch].map(distance => {
    let lo = 0, hi = 1;
    for (let step = 0; step < 53; step++) {
      const t = (lo + hi) / 2;
      if (primitive(2 * t - 1) - primitive(-1) < distance) lo = t;
      else hi = t;
    }
    const t = (lo + hi) / 2;
    return [40 * t - 20 * t ** 2, 20 * t ** 2];
  })];
  const input = document(quadratic());
  input.parameters.pitch = 10;
  const initial = evaluateCadPart(input), output = verify(initial, offsets(10)), accepted = saveCadPart(initial);
  const unpatterned = structuredClone(input); unpatterned.features.pop();
  assert.deepEqual(laterWalls(output.brep), laterWalls(evaluateCadPart(unpatterned).outputs[0].brep));
  const edited = reevaluate(initial, { parameters: { pitch: 12 } });
  assert.deepEqual(verify(loadCadPart(saveCadPart(edited)), offsets(12)).brep, verify(edited, offsets(12)).brep);
  assert.throws(() => reevaluate(initial, { parameters: { pitch: 4 } }),
    e => e instanceof CadPartError && e.feature === 'repeat' && e.code === 'GEOMETRY' && /disjoint/.test(e.message));
  assert.throws(() => reevaluate(initial, { parameters: { pitch: 21 } }),
    e => e instanceof CadPartError && e.feature === 'repeat' && e.code === 'PARAMETER' && /path length/.test(e.message));
  const newerCollision = structuredClone(input);
  newerCollision.features.find(feature => feature.id === 'laterSketch').min = [18, 10];
  newerCollision.features.find(feature => feature.id === 'laterSketch').max = [21, 13];
  assert.throws(() => evaluateCadPart(newerCollision),
    e => e instanceof CadPartError && e.feature === 'repeat' && e.code === 'GEOMETRY' && /newer cut/.test(e.message));
  assert.equal(saveCadPart(initial), accepted);
});

test('contact and overlap with any actual cavity refuse without changing the accepted source or path', () => {
  const initial = evaluateCadPart(document()), saved = saveCadPart(initial);
  for (const pitch of [3, 4]) assert.throws(() => reevaluate(initial, { parameters: { pitch } }),
    e => e instanceof CadPartError && e.feature === 'repeat' && e.code === 'GEOMETRY');
  const horizontal = { degree: 1, knots: [0, 0, 1, 1], controlPoints: [[6, 5, 0], [46, 5, 0]], weights: [1, 1] };
  for (const pitch of [12, 16]) {
    const bad = document(horizontal); bad.parameters.pitch = pitch; bad.features.at(-1).count = 2;
    assert.throws(() => evaluateCadPart(bad), e => e instanceof CadPartError && e.feature === 'repeat' && e.code === 'GEOMETRY');
  }
  assert.equal(saveCadPart(initial), saved); assert.deepEqual(verify(loadCadPart(saved)).brep, initial.outputs[0].brep);
});

test('count one keeps both original cavities and still rejects unsupported curves, nonlevel paths and partial source history', () => {
  const single = document(); single.features.at(-1).count = 1;
  const output = verify(evaluateCadPart(single), [[0, 0]]); assert.ok(!output.brep.faces.some(face => face.name?.includes('@')));
  const quarterOne = document(quarter()); quarterOne.features.at(-1).count = 1;
  assert.deepEqual(verify(evaluateCadPart(quarterOne), [[0, 0]]).brep, output.brep);
  const polynomialOne = document(quadratic()); polynomialOne.features.at(-1).count = 1;
  assert.deepEqual(verify(evaluateCadPart(polynomialOne), [[0, 0]]).brep, output.brep);
  const nonlevel = structuredClone(single); nonlevel.features.at(-1).path.controlPoints[1][2] = 1e-12;
  assert.throws(() => evaluateCadPart(nonlevel), e => e instanceof CadPartError && e.feature === 'repeat' && e.code === 'CAPABILITY');
  for (const id of ['circleTool', 'laterTool']) {
    const partial = structuredClone(single); partial.features.find(f => f.id === id).height = 5;
    assert.throws(() => evaluateCadPart(partial), e => e instanceof CadPartError && e.feature === 'repeat' && e.code === 'CAPABILITY');
  }
  const overlap = structuredClone(single); Object.assign(overlap.parameters, { cx: 25, cy: 9 });
  assert.throws(() => evaluateCadPart(overlap), e => e instanceof CadPartError && e.feature === 'repeat' && e.code === 'GEOMETRY');
});

test('other curved circular-source Paths and old reference/value guards stay refused', () => {
  const refused = (change, codes = ['CAPABILITY', 'REFERENCE']) => {
    const doc = document(); change(doc); const before = structuredClone(doc);
    assert.throws(() => evaluateCadPart(doc), e => e instanceof CadPartError && e.feature === 'repeat' && codes.includes(e.code));
    assert.deepEqual(doc, before);
  };
  refused(doc => {
    const collinear = quadratic(); collinear.controlPoints[2] = [30, 0, 0];
    doc.features.at(-1).path = collinear;
  });
  refused(doc => {
    const otherRational = quarter(); otherRational.weights[1] = 0.75;
    doc.features.at(-1).path = otherRational;
  });
  refused(doc => { doc.features.at(-1).path.controlPoints[1][2] = 1e-12; });
  refused(doc => { doc.features.at(-1).path.controlPoints[1][0] += 1e-12; });
  for (const pitch of [0, -1]) refused(doc => { doc.parameters.pitch = pitch; }, ['PARAMETER']);
  refused(doc => { doc.features.at(-1).count = 4; }, ['PARAMETER']);
  refused(doc => { doc.features.at(-1).source = 'first/0'; });
  refused(doc => { doc.features.splice(4, 0, { id: 'movedTool', kind: 'translate', target: 'circleTool', offset: [0, 0, 0] }); doc.features.find(f => f.id === 'first').tool = 'movedTool'; });
  refused(doc => { doc.features[2].holes = [[{ kind: 'arc', center: [10, 10], start: [11, 10], direction: 'ccw' }]]; doc.features[2].sideTags.holes = [['island']]; });
  refused(doc => { doc.features.splice(-1, 0, { id: 'extraSketch', kind: 'sketch', profile: 'circle', center: [42, 22], radius: 2 },
    { id: 'extraTool', kind: 'extrude', sketch: 'extraSketch', height: 10 }, { id: 'third', kind: 'difference', target: 'second', tool: 'extraTool' }); doc.features.at(-1).target = 'third'; });
});

test('omitted source keeps the existing current-rectangle Path recipe', () => {
  const ordinary = document(); delete ordinary.features.at(-1).source;
  const output = evaluateCadPart(ordinary).outputs[0], report = checkBrep(output.brep, { strict: true });
  assert.ok(report.valid, report.issues.join('\n')); assert.equal(report.topology[0].genus, 4);
  near(massPropertiesOf(output).volume, 23760 - 40 * Math.PI);
  assert.equal(output.brep.faces.filter(face => faceGeometry(face).kind === 'cylinder').length, 2);
  for (const k of [1, 2]) assert.ok(output.brep.faces.some(face => face.name === `laterTool.side[a]@${k}`));
  assert.ok(!output.brep.faces.some(face => face.name?.startsWith('circleTool.side[round]@')));
});
