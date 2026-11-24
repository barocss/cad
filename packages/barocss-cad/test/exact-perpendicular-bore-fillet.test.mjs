import assert from 'node:assert/strict';
import test from 'node:test';
import {
  brepMassProperties, CadPartError, checkBrep, curveDomain, evaluateCadPart, evaluateCurve, evaluateSurface,
  faceGeometry, loadCadPart, massPropertiesOf, measureBrepEdgeContinuity, reevaluate, saveCadPart,
} from '../dist/index.js';
import { retainSweepCircularJoinBindings } from '../dist/brep/sweep-circular-join-bindings.js';
import { curveReversed } from '../dist/nurbs/curves/curve-segment.js';
import { revolutionOf } from '../dist/nurbs/surfaces/surface-revolution.js';

const near = (a, b, tolerance = 1e-8) => assert.ok(Number.isFinite(a) && Math.abs(a - b) <= tolerance, `${a} vs ${b}, tolerance ${tolerance}`);
const sub = (a, b) => a.map((value, i) => value - b[i]);
const norm = point => Math.hypot(...point);
const nearPoint = (a, b, tolerance = 1e-8) => near(norm(sub(a, b)), 0, tolerance);
const q = Math.SQRT1_2, rims = ['w.lead.side[bore]#1|w.start', 'w.lead.side[bore]#2|w.start'];
const document = (radius, bore = 1, edges = rims) => ({ format: 'barocss-cad-part', version: 1, units: 'mm',
  parameters: { bore, ...(radius ? { finish: radius } : {}) }, features: [
    { id: 's', kind: 'sketch', profile: 'circle', center: [0, 0], radius: 2,
      holes: [[{ kind: 'arc', start: [{ parameter: 'bore' }, 0], center: [0, 0], direction: 'cw' }]],
      sideTags: { outer: ['e0'], holes: [['bore']] } },
    { id: 'w', kind: 'sweep-curve', sketch: 's', mode: 'exact', path: { degree: 2,
      knots: [0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4], weights: [1, 1, 1, q, 1, q, 1, 1, 1],
      controlPoints: [[-10, 0, 0], [-5, 0, 0], [0, 0, 0], [12, 0, 0], [12, 12, 0], [12, 30, 0], [12, 30, 18], [12, 30, 23], [12, 30, 28]] } },
    ...(radius ? [{ id: 'f', kind: 'fillet', target: 'w', edges, radius: { parameter: 'finish' } }] : []),
  ] });
const joints = brep => brep.edges.filter(edge => [[0, 0], [1, 12], [2, 18]].some(([axis, at]) =>
  edge.curve.controlPoints.every(point => Math.abs(point[axis] - at) < 1e-10)));
const central = brep => joints(brep).filter(edge => edge.curve.controlPoints.every(point => Math.abs(point[1] - 12) < 1e-10));
let original;
const stock = () => original ??= evaluateCadPart(document()).outputs[0].brep;
const finished = new Map();
const output = radius => {
  if (!finished.has(radius)) finished.set(radius, evaluateCadPart(document(radius)).outputs[0]);
  return finished.get(radius);
};

function verifyJoints(brep) {
  const edges = joints(brep);
  assert.equal(edges.length, 12); assert.equal(central(brep).length, 4);
  for (const edge of edges) {
    const uses = brep.coedges.filter(use => use.edge === edge.id);
    assert.equal(uses.length, 2); assert.equal(uses[0].twin, uses[1].id); assert.equal(uses[1].twin, uses[0].id);
    assert.notEqual(uses[0].sense, uses[1].sense);
    for (const use of uses) {
      assert.ok(use.pcurve, `missing native binding: ${edge.name}`);
      const { surface } = brep.faces.find(face => face.loops.includes(use.loop)), [a, b] = curveDomain(edge.curve);
      assert.deepEqual(curveDomain(use.pcurve), [a, b]);
      for (const fraction of [0, .19, .5, .87, 1]) {
        const t = a + fraction * (b - a), uv = evaluateCurve(use.pcurve, t);
        nearPoint(evaluateSurface(surface, uv[0], uv[1]), evaluateCurve(edge.curve, t), 1e-10);
      }
    }
    const continuity = measureBrepEdgeContinuity(brep, edge.id, { curvature: true });
    assert.equal(continuity.status, 'measured'); near(continuity.maximumAngleDegrees, 0);
    assert.equal(continuity.curvature.status, 'measured'); assert.ok(continuity.curvature.maximumDifference > 1e-5);
  }
}

function verify(result, radius, bore = 1) {
  const { brep } = result, report = checkBrep(brep, { strict: true });
  assert.ok(report.valid, report.issues.join('\n'));
  assert.equal(report.topology.length, 1); assert.equal(report.topology[0].shells, 1); assert.equal(report.topology[0].genus, 1);
  assert.ok(report.maximumPcurveGap < 1e-10); verifyJoints(brep);
  const length = 15 * Math.PI + 20, area = Math.PI * (4 - bore ** 2), beforeVolume = area * length;
  const profileQ = 4 + bore ** 2;
  const bendCentroid = [36 / 5 + (576 + profileQ) / (60 * Math.PI), 12 + 12 / Math.PI, 54 / 5 - (1296 + profileQ) / (60 * Math.PI)];
  const beforeCentroid = bendCentroid.map((x, i) => (15 * Math.PI * x + [-50 + 120, 300, 230][i]) / length);
  // Integrate the removed meridian strip, revolving radius rho with volume weight 2*pi*rho.
  const removed = 2 * Math.PI * (bore * radius ** 2 * (1 - Math.PI / 4) + radius ** 3 * (5 / 6 - Math.PI / 4));
  const removedDepthMoment = 2 * Math.PI * (bore * radius ** 3 * (5 / 6 - Math.PI / 4) + radius ** 4 * (19 / 24 - Math.PI / 4));
  const volume = beforeVolume - removed, removedCentroid = [-10 + removedDepthMoment / removed, 0, 0];
  const centroid = beforeCentroid.map((x, i) => (beforeVolume * x - removed * removedCentroid[i]) / volume);
  for (const mass of [massPropertiesOf(result), brepMassProperties(brep, 1)]) {
    near(mass.volume, volume, 1e-7); nearPoint(mass.centroid, centroid, 1e-7);
  }
  const caps = brep.faces.filter(face => ['w.start', 'w.end'].includes(face.name));
  assert.equal(caps.length, 2);
  for (const face of caps) {
    const start = face.name === 'w.start', axis = start ? 0 : 2, at = start ? -10 : 28;
    const normal = start ? [-1, 0, 0] : [0, 0, 1], center = start ? [-10, 0, 0] : [12, 30, 28], geometry = faceGeometry(face);
    assert.equal(geometry.kind, 'plane'); nearPoint(geometry.n, normal);
    const loops = face.loops.map(id => brep.loops.find(loop => loop.id === id));
    assert.deepEqual(loops.map(loop => loop.kind).sort(), ['inner', 'outer']);
    for (const loop of loops) for (const id of loop.coedges) {
      const use = brep.coedges.find(use => use.id === id), edge = brep.edges.find(edge => edge.id === use.edge), [a, b] = curveDomain(edge.curve);
      const expected = loop.kind === 'outer' ? 2 : start ? bore + radius : bore;
      for (const fraction of [0, .21, .5, .83, 1]) {
        const point = evaluateCurve(edge.curve, a + fraction * (b - a));
        near(point[axis], at); near(norm(sub(point, center)), expected);
      }
    }
  }
  const fillets = brep.faces.filter(face => /^f\.face(?:#\d+)?$/.test(face.name));
  assert.equal(fillets.length, 2);
  for (const face of fillets) {
    const native = revolutionOf(face.surface, 30); assert.equal(native?.profile.kind, 'arc');
    const center = native.c.map((value, i) => value + native.a[i] * native.profile.c[1]);
    nearPoint(center, [-10 + radius, 0, 0]); near(Math.abs(native.a[0]), 1);
    near(native.profile.c[0], bore + radius); near(native.profile.r, radius);
  }
}

for (const radius of [.2, .25]) test(`constant inlet bore R${radius} retains all twelve native joints and both annular caps`, () => {
  const before = structuredClone(stock()); verifyJoints(stock()); verify(output(radius), radius); assert.deepEqual(stock(), before);
});

test('parameter edits and fresh native reopen preserve the same cap and joint recipe', () => {
  const initial = evaluateCadPart(document(.2)), edited = reevaluate(initial, { parameters: { finish: .25, bore: 1.5 } });
  verify(edited.outputs[0], .25, 1.5);
  const reopened = loadCadPart(saveCadPart(edited));
  assert.deepEqual(reopened.document, edited.document); assert.deepEqual(reopened.outputs[0].brep, edited.outputs[0].brep); verify(reopened.outputs[0], .25, 1.5);
  const restored = reevaluate(reopened, { parameters: { finish: .2, bore: 1 } });
  assert.deepEqual(restored.outputs[0].brep, initial.outputs[0].brep);
});

test('equal, near-contact and oversized bore fillets refuse before changing accepted source or history', () => {
  const initial = evaluateCadPart(document(.2)), before = structuredClone(initial);
  for (const radius of [1 - 5e-7, 1, 2]) for (const selected of [rims, rims.slice(0, 1)]) {
    const source = document(radius, 1, selected), unchanged = structuredClone(source);
    assert.throws(() => evaluateCadPart(source), error => error instanceof CadPartError && error.feature === 'f'
      && error.code === 'RADIUS_EXCEEDS_FACE' && /inlet bore fillet must stay strictly inside the 1 mm annular cap wall/.test(error.message));
    assert.deepEqual(source, unchanged);
  }
  for (const [bore, finish] of [[1, 2], [1.5, .5], [1.5, .5 - 5e-7]]) {
    assert.throws(() => reevaluate(initial, { parameters: { bore, finish } }), error => error instanceof CadPartError
      && error.feature === 'f' && error.code === 'RADIUS_EXCEEDS_FACE');
    assert.deepEqual(initial, before);
  }
});

const withoutBindings = brep => ({ ...brep, coedges: brep.coedges.map(use => ({ ...use, pcurve: null })) });
const boundJoints = brep => joints(brep).filter(edge => brep.coedges.filter(use => use.edge === edge.id).every(use => use.pcurve));

test('perpendicular torus owners retain bindings after edge reversal, owner renaming and chart transposition', () => {
  const source = stock(), before = structuredClone(source), result = withoutBindings(output(.2).brep);
  const reversed = new Set(joints(result).map(edge => edge.id)), middle = central(result)[0];
  const transposed = result.faces.find(face => face.loops.includes(result.coedges.find(use => use.edge === middle.id).loop)).id;
  const reordered = { ...result,
    edges: [...result.edges].reverse().map(edge => reversed.has(edge.id)
      ? { ...edge, curve: curveReversed(edge.curve), vertices: [...edge.vertices].reverse() } : edge),
    coedges: [...result.coedges].reverse().map(use => reversed.has(use.edge)
      ? { ...use, sense: use.sense === 'forward' ? 'reversed' : 'forward' } : use),
    faces: [...result.faces].reverse().map(face => {
      if (face.id !== transposed) return { ...face, name: `renamed/${face.id}` };
      const s = face.surface;
      return { ...face, name: 'transposed torus owner', sense: face.sense === 'forward' ? 'reversed' : 'forward', surface: {
        ...s, degreeU: s.degreeV, degreeV: s.degreeU, knotsU: s.knotsV, knotsV: s.knotsU,
        controlPoints: s.controlPoints[0].map((_, j) => s.controlPoints.map(row => row[j])),
        weights: s.weights[0].map((_, j) => s.weights.map(row => row[j])),
      } };
    }),
  };
  const fixed = retainSweepCircularJoinBindings(source, reordered);
  verifyJoints(fixed); assert.deepEqual(withoutBindings(fixed), withoutBindings(reordered)); assert.deepEqual(source, before);
});

test('torus owner swaps and invalid, changed or ambiguous native authority never lend a binding', () => {
  const source = stock(), result = withoutBindings(output(.2).brep), middle = central(result)[0];
  const liveUses = result.coedges.filter(use => use.edge === middle.id), owners = liveUses.map(use => result.faces.find(face => face.loops.includes(use.loop)));
  const swapped = { ...result, faces: result.faces.map(face => {
    const index = owners.findIndex(owner => owner.id === face.id), peer = owners[1 - index];
    return index < 0 ? face : { ...face, surface: peer.surface, sense: peer.sense };
  }) };
  assert.ok(retainSweepCircularJoinBindings(source, swapped).coedges.filter(use => use.edge === middle.id).every(use => !use.pcurve));
  assert.equal(retainSweepCircularJoinBindings(withoutBindings(source), result), result);
  assert.equal(retainSweepCircularJoinBindings({ ...source, source: { family: 'unrelated', id: 'w' } }, result), result);
  const originalEdge = central(source)[0], originalUse = source.coedges.find(use => use.edge === originalEdge.id);
  for (const pcurve of [null, { ...originalUse.pcurve, controlPoints: originalUse.pcurve.controlPoints.map(([u, v, z]) => [u + .01, v, z]) }]) {
    const changed = { ...source, coedges: source.coedges.map(use => use.id === originalUse.id ? { ...use, pcurve } : use) };
    assert.equal(boundJoints(retainSweepCircularJoinBindings(changed, result)).length, 11);
  }
  const changed = { ...result, faces: result.faces.map(face => face.id !== owners[0].id ? face : {
    ...face, surface: { ...face.surface, controlPoints: face.surface.controlPoints.map(row => row.map(([x, y, z]) => [x, y, z + 1e-9])) },
  }) };
  assert.ok(retainSweepCircularJoinBindings(source, changed).coedges.filter(use => use.edge === middle.id).every(use => !use.pcurve));
  const duplicateSource = { ...source, edges: [...source.edges, { ...originalEdge, id: 'duplicate' }],
    coedges: [...source.coedges, ...source.coedges.filter(use => use.edge === originalEdge.id)
      .map(use => ({ ...use, id: `duplicate/${use.id}`, edge: 'duplicate', twin: `duplicate/${use.twin}` }))] };
  assert.equal(boundJoints(retainSweepCircularJoinBindings(duplicateSource, result)).length, 11);
  const duplicateResult = { ...result, edges: [...result.edges, { ...middle, id: 'duplicate' }] };
  assert.ok(retainSweepCircularJoinBindings(source, duplicateResult).coedges.filter(use => use.edge === middle.id).every(use => !use.pcurve));
});
