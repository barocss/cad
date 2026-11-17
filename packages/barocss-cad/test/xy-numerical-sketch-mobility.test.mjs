import assert from 'node:assert/strict';
import test from 'node:test';
import { diagnoseXYNumericalSketchMobility, solveXYNumericalSketchPoints } from '../dist/index.js';
import { checkedNullspace } from '../dist/sketch/xy-numerical-sketch-mobility-internal.js';
import { evaluate } from '../dist/sketch/xy-numerical-sketch-solver-internal.js';

const document = (points, edges, constraints) => ({
  format: 'barocss-xy-numerical-sketch', version: 0, profile: 'bounded-length-angle-v0', id: 'sk',
  lengthUnit: 'mm', angleUnit: 'rad', branchGuards: [],
  points: Object.entries(points).map(([id, position]) => ({ id, position })),
  segments: edges.map(([id, startPointId, endPointId]) => ({ id, startPointId, endPointId })),
  constraints,
});
const fixed = (id, pointId, target) => ({ id, kind: 'fixed', pointId, target });
const length = (id, segmentId, value) => ({ id, kind: 'length', segmentId, length: value });
const direction = (id, kind, segmentId) => ({ id, kind, segmentId });
const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);
const checkResidual = (jacobian, q) => jacobian.every(row => Math.abs(dot(row, q)) < 1e-12);

function rectangle(locks) {
  const constraints = [fixed('anchor', 'A', [0, 0]), direction('h0', 'horizontal', 'ab'), direction('h2', 'horizontal', 'cd'),
    direction('v1', 'vertical', 'bc'), direction('v3', 'vertical', 'da')];
  if (locks > 0) constraints.push(length('width', 'ab', 40));
  if (locks > 1) constraints.push(length('height', 'bc', 20));
  return document({ A: [0, 0], B: [40, 0], C: [40, 20], D: [0, 20] },
    [['ab', 'A', 'B'], ['bc', 'B', 'C'], ['cd', 'C', 'D'], ['da', 'D', 'A']], constraints);
}

test('mobility agrees with the native rank and finds dependent coordinates in any point order', () => {
  const expected = [['B', 'C', 'D'], ['C', 'D'], []];
  for (let locks = 0; locks < expected.length; locks++) {
    const d = rectangle(locks), original = structuredClone(d);
    const standard = solveXYNumericalSketchPoints(d);
    const diagnostic = diagnoseXYNumericalSketchMobility(d);
    assert.ok(standard.ok && diagnostic);
    assert.equal(standard.report.iterations, 0);
    assert.equal(diagnostic.numericalRank, standard.report.numericalRank);
    assert.equal(diagnostic.rankThreshold, standard.report.rankThreshold);
    assert.equal(diagnostic.localDegreesOfFreedom, 2 - locks);
    assert.deepEqual(diagnostic.movablePointIds, expected[locks]);
    assert.equal('movablePointIds' in standard.report, false);

    const permuted = { ...d, points: [d.points[2], d.points[0], d.points[3], d.points[1]], constraints: [...d.constraints].reverse() };
    const moved = diagnoseXYNumericalSketchMobility(permuted);
    assert.ok(moved);
    assert.equal(moved.numericalRank, diagnostic.numericalRank);
    assert.deepEqual([...moved.movablePointIds].sort(), expected[locks]);
    assert.deepEqual(d, original);
  }
});

test('orthonormal directions span the analytic rectangle tangent and satisfy the original Jacobian', () => {
  const d = rectangle(0), { jacobian } = evaluate(d, d.points.flatMap(point => point.position));
  const result = checkedNullspace(jacobian, 8);
  assert.ok(result);
  assert.equal(result.basis.length, 2);
  assert.ok(result.basis.every(q => checkResidual(jacobian, q)));
  const t = Math.SQRT1_2, width = [0, 0, t, 0, t, 0, 0, 0], height = [0, 0, 0, 0, 0, t, 0, t];
  for (const expected of [width, height]) {
    assert.ok(checkResidual(jacobian, expected));
    const projectedNorm = Math.hypot(...result.basis.map(q => dot(q, expected)));
    assert.ok(Math.abs(projectedNorm - 1) < 1e-12);
  }
  assert.equal(checkResidual(jacobian, [0, 0, 1, 0, 0, 0, 0, 0]), false, 'one raw free column is not a valid motion direction');
});

test('near-rank-boundary and unsatisfied coefficients are unavailable without changing solving', () => {
  const d = (y) => document({ A: [0, 0], B: [10, y], C: [20, 0] }, [['ab', 'A', 'B'], ['cb', 'C', 'B']], [
    fixed('a', 'A', [0, 0]), fixed('c', 'C', [20, 0]),
    length('ra', 'ab', Math.hypot(10, y)), length('rc', 'cb', Math.hypot(10, y)),
  ]);
  const near = d(1e-9), regular = d(1);
  assert.equal(solveXYNumericalSketchPoints(near).ok, true);
  assert.equal(diagnoseXYNumericalSketchMobility(near), null);
  assert.deepEqual(diagnoseXYNumericalSketchMobility(regular)?.movablePointIds, []);
  const unsettled = rectangle(1);
  unsettled.constraints.find(constraint => constraint.id === 'width').length = 39;
  assert.equal(solveXYNumericalSketchPoints(unsettled).ok, true);
  assert.equal(diagnoseXYNumericalSketchMobility(unsettled), null);
  unsettled.points[1].position = unsettled.points[0].position;
  assert.equal(diagnoseXYNumericalSketchMobility(unsettled), null);
});

test('weak participation distinguishes numerical zero, an unresolved projection and clear motion', () => {
  // A and D are fixed. B moves along Y, C along X. |BC| fixes dB.y = delta * dC.x.
  const d = (delta) => document({ A: [0, 0], B: [0, 10], C: [delta, 11], D: [10, 11] },
    [['ab', 'A', 'B'], ['bc', 'B', 'C'], ['dc', 'D', 'C']],
    [fixed('a', 'A', [0, 0]), fixed('d', 'D', [10, 11]), direction('v', 'vertical', 'ab'),
      direction('h', 'horizontal', 'dc'), length('len', 'bc', Math.hypot(1, delta))]);
  assert.deepEqual(diagnoseXYNumericalSketchMobility(d(1e-15))?.movablePointIds, ['C']);
  const ambiguous = d(1e-12);
  assert.equal(solveXYNumericalSketchPoints(ambiguous).report.localDegreesOfFreedom, 1);
  assert.equal(diagnoseXYNumericalSketchMobility(ambiguous), null);
  assert.deepEqual(diagnoseXYNumericalSketchMobility(d(1e-6))?.movablePointIds, ['B', 'C']);
});

test('rectangle point spans distinguish tangent axes from a plane without changing mobility', () => {
  for (const locks of [0,1,2]) {
    const result=diagnoseXYNumericalSketchMobility(rectangle(locks));
    const spans=new Map(result.pointDirections.map(p=>[p.pointId,p]));
    assert.equal(spans.has('A'),false);
    if(locks===0){assert.equal(spans.get('C').dimension,2);assert.ok(Math.abs(spans.get('B').direction[0]-1)<1e-12);assert.ok(Math.abs(spans.get('B').direction[1])<1e-12);}
    if(locks<2) for(const id of locks===0?['D']:['C','D']) {assert.equal(spans.get(id).dimension,1);assert.ok(Math.abs(spans.get(id).direction[0])<1e-12);assert.ok(Math.abs(spans.get(id).direction[1]-1)<1e-12);}
    if(locks===2)assert.deepEqual(result.pointDirections,[]);
  }
});
test('oblique length constraint gives the independent perpendicular tangent under input permutations', () => {
  const d=document({A:[2,3],B:[5,7]},[['ab','A','B']],[fixed('anchor','A',[2,3]),length('len','ab',5)]),before=structuredClone(d);
  for(const input of [d,{...d,points:[...d.points].reverse(),constraints:[...d.constraints].reverse()}]){
    const r=diagnoseXYNumericalSketchMobility(input);assert.deepEqual(r.movablePointIds,['B']);
    const p=r.pointDirections.find(p=>p.pointId==='B');assert.equal(p.dimension,1);
    assert.ok(Math.abs(p.direction[0]-.8)<1e-12);assert.ok(Math.abs(p.direction[1]+.6)<1e-12);
    assert.ok(Math.abs(3*p.direction[0]+4*p.direction[1])<1e-12);
  }
  assert.deepEqual(d,before);
});
test('projected span singular-value uncertainty is point-local and invariant under basis rotation', async () => {
  const {projectedPointDirection}=await import('../dist/sketch/xy-numerical-sketch-point-directions-internal.js');
  const error=1e-10;
  assert.equal(projectedPointDirection([[1,0],[0,4*error]],0,error),null);
  assert.equal(projectedPointDirection([[1,0],[0,.1*error]],0,error).dimension,1);
  assert.equal(projectedPointDirection([[1,0],[0,32*error]],0,error).dimension,2);
  for(const t of [0,.3,1.7]){
    const a=Math.cos(t),b=Math.sin(t),columns=[[.8*a,-.6*a],[.8*b,-.6*b]];
    const r=projectedPointDirection(columns,0,error);assert.equal(r.dimension,1);
    assert.ok(Math.abs(r.direction[0]-.8)<1e-12);assert.ok(Math.abs(r.direction[1]+.6)<1e-12);
  }
  assert.equal(projectedPointDirection([[0,0]],0,error),null);
});
