import assert from 'node:assert/strict';
import test from 'node:test';
import {
  checkBrep, curveDomain, evaluateCadPart, evaluateCurve, evaluateSurface, massPropertiesOf,
  measureBrepEdgeContinuity,
} from '../dist/index.js';
import { retainSweepCircularJoinBindings } from '../dist/brep/sweep-circular-join-bindings.js';
import { curveReversed } from '../dist/nurbs/curves/curve-segment.js';

const path = { degree: 2, knots: [0, 0, 0, 1, 1, 2, 2, 3, 3, 3],
  controlPoints: [[0, 0, 0], [0, 12, 0], [12, 12, 0], [16, 12, 0], [20, 12, 0], [38, 12, 0], [38, 30, 0]],
  weights: [1, Math.SQRT1_2, 1, 1, 1, Math.SQRT1_2, 1] };
const rims = ['w.first.side[bore]#1|w.start', 'w.first.side[bore]#2|w.start'];
const document = radius => ({ format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {}, features: [
  { id: 's', kind: 'sketch', profile: 'circle', center: [0, 0], radius: 2,
    holes: [[{ kind: 'arc', start: [1, 0], center: [0, 0], direction: 'cw' }]],
    sideTags: { outer: ['e0'], holes: [['bore']] } },
  { id: 'w', kind: 'sweep-curve', sketch: 's', path, mode: 'exact' },
  ...(radius ? [{ id: 'f', kind: 'fillet', target: 'w', edges: rims, radius }] : []),
] });
const near = (value, target, tolerance = 1e-7) => assert.ok(Math.abs(value - target) <= tolerance, `${value} vs ${target}`);
const joints = brep => brep.edges.filter(edge => [12, 20].some(x =>
  edge.curve.controlPoints.every(point => Math.abs(point[0] - x) < 1e-10)));
let original;
const stock = () => original ??= evaluateCadPart(document()).outputs[0].brep;
const finished = new Map();
const output = radius => {
  if (!finished.has(radius)) finished.set(radius, evaluateCadPart(document(radius)).outputs[0]);
  return finished.get(radius);
};

function verifyJoints(brep) {
  const edges = joints(brep);
  assert.equal(edges.length, 8);
  for (const edge of edges) {
    const uses = brep.coedges.filter(use => use.edge === edge.id);
    assert.equal(uses.length, 2);
    assert.equal(uses[0].twin, uses[1].id);
    assert.equal(uses[1].twin, uses[0].id);
    assert.notEqual(uses[0].sense, uses[1].sense);
    for (const use of uses) {
      assert.ok(use.pcurve, `missing native binding: ${edge.name}`);
      const { surface } = brep.faces.find(face => face.loops.includes(use.loop));
      const [a, b] = curveDomain(edge.curve);
      assert.deepEqual(curveDomain(use.pcurve), [a, b]);
      for (const fraction of [0, .19, .5, .87, 1]) {
        const t = a + fraction * (b - a), uv = evaluateCurve(use.pcurve, t);
        const world = evaluateSurface(surface, uv[0], uv[1]), point = evaluateCurve(edge.curve, t);
        near(Math.hypot(...world.map((value, i) => value - point[i])), 0, 1e-10);
      }
    }
    const continuity = measureBrepEdgeContinuity(brep, edge.id, { curvature: true });
    assert.equal(continuity.status, 'measured', JSON.stringify(continuity));
    near(continuity.maximumAngleDegrees, 0, 1e-8);
    assert.equal(continuity.curvature.status, 'measured');
    assert.ok(continuity.curvature.maximumDifference > 0);
  }
}

for (const [radius, volume] of [[.2, 519.4739960868355], [.25, 519.4412724224861]]) {
  test(`an inlet bore fillet R${radius} retains all eight original native circular joints`, () => {
    verifyJoints(stock());
    const result = output(radius), report = checkBrep(result.brep, { strict: true });
    assert.ok(report.valid, report.issues.join('\n'));
    assert.equal(report.topology[0].genus, 1);
    assert.ok(report.maximumPcurveGap < 1e-10);
    near(massPropertiesOf(result).volume, volume);
    verifyJoints(result.brep);
    const caps = result.brep.faces.filter(face => ['w.start', 'w.end'].includes(face.name));
    assert.equal(caps.length, 2);
    for (const face of caps) assert.deepEqual(face.loops.map(id => result.brep.loops.find(loop => loop.id === id).kind), ['outer', 'inner']);
  });
}

const withoutBindings = brep => ({ ...brep, coedges: brep.coedges.map(use => ({ ...use, pcurve: null })) });
const boundJoints = brep => joints(brep).filter(edge => brep.coedges.filter(use => use.edge === edge.id).every(use => use.pcurve));

test('binding retention uses native coefficients after reordering, edge reversal and chart transposition', () => {
  const source = stock(), before = structuredClone(source), result = withoutBindings(output(.2).brep);
  const reversed = new Set(joints(result).map(edge => edge.id));
  const transposed = result.faces.find(face => face.loops.includes(result.coedges.find(use => reversed.has(use.edge)).loop)).id;
  const reordered = { ...result,
    edges: [...result.edges].reverse().map(edge => reversed.has(edge.id)
      ? { ...edge, curve: curveReversed(edge.curve), vertices: [...edge.vertices].reverse() } : edge),
    coedges: [...result.coedges].reverse().map(use => reversed.has(use.edge)
      ? { ...use, sense: use.sense === 'forward' ? 'reversed' : 'forward' } : use),
    faces: [...result.faces].reverse().map(face => {
      if (face.id !== transposed) return face;
      const s = face.surface;
      return { ...face, name: 'reordered owner', sense: face.sense === 'forward' ? 'reversed' : 'forward', surface: {
        ...s, degreeU: s.degreeV, degreeV: s.degreeU, knotsU: s.knotsV, knotsV: s.knotsU,
        controlPoints: s.controlPoints[0].map((_, j) => s.controlPoints.map(row => row[j])),
        weights: s.weights[0].map((_, j) => s.weights.map(row => row[j])),
      } };
    }),
  };
  const fixed = retainSweepCircularJoinBindings(source, reordered);
  verifyJoints(fixed);
  assert.deepEqual(withoutBindings(fixed), withoutBindings(reordered));
  assert.deepEqual(source, before);
});

test('absent or invalid original pcurves never authorize a new binding', () => {
  const source = stock(), result = withoutBindings(output(.2).brep);
  assert.equal(retainSweepCircularJoinBindings(withoutBindings(source), result), result);
  const edge = joints(source)[0], use = source.coedges.find(use => use.edge === edge.id);
  for (const pcurve of [null, { ...use.pcurve, controlPoints: use.pcurve.controlPoints.map(([u, v, z]) => [u + .01, v, z]) }]) {
    const changed = { ...source, coedges: source.coedges.map(old => old.id === use.id ? { ...old, pcurve } : old) };
    assert.equal(boundJoints(retainSweepCircularJoinBindings(changed, result)).length, 7);
  }
});

test('changed live boundary coefficients and ambiguous source or result edges remain unbound', () => {
  const source = stock(), result = withoutBindings(output(.2).brep), edge = joints(result)[0];
  const use = result.coedges.find(use => use.edge === edge.id);
  const face = result.faces.find(face => face.loops.includes(use.loop));
  const changed = { ...result, faces: result.faces.map(old => old.id !== face.id ? old : {
    ...old, surface: { ...old.surface, controlPoints: old.surface.controlPoints.map(row =>
      row.map(([x, y, z]) => [x, y, z + 1e-9])) },
  }) };
  const fixed = retainSweepCircularJoinBindings(source, changed);
  assert.ok(fixed.coedges.filter(use => use.edge === edge.id).every(use => !use.pcurve));
  const original = joints(source)[0];
  const duplicateSource = { ...source, edges: [...source.edges, { ...original, id: 'duplicate' }],
    coedges: [...source.coedges, ...source.coedges.filter(use => use.edge === original.id)
      .map(use => ({ ...use, id: `duplicate/${use.id}`, edge: 'duplicate', twin: `duplicate/${use.twin}` }))] };
  assert.equal(boundJoints(retainSweepCircularJoinBindings(duplicateSource, result)).length, 7);
  const duplicateResult = { ...result, edges: [...result.edges, { ...edge, id: 'duplicate' }] };
  assert.ok(retainSweepCircularJoinBindings(source, duplicateResult).coedges.filter(use => use.edge === edge.id).every(use => !use.pcurve));
});
