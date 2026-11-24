import assert from 'node:assert/strict';
import test from 'node:test';
import {
  brepMassProperties, checkBrep, curveDomain, evaluateCadPart, evaluateCurve, evaluateSurface, faceGeometry,
  loadCadPart, massPropertiesOf, measureBrepEdgeContinuity, prismaticFromProfile, reevaluate, saveCadPart,
} from '../dist/index.js';
import { boolean } from '../dist/part/part-model.js';
import { retainSweepCircularJoinBindings } from '../dist/brep/sweep-circular-join-bindings.js';
import { revolutionOf } from '../dist/nurbs/surfaces/surface-revolution.js';

const near = (a, b, tolerance = 1e-8) => assert.ok(Number.isFinite(a) && Math.abs(a - b) <= tolerance, `${a} vs ${b}, tolerance ${tolerance}`);
const sub = (a, b) => a.map((x, i) => x - b[i]);
const norm = point => Math.hypot(...point);
const nearPoint = (a, b, tolerance = 1e-8) => near(norm(sub(a, b)), 0, tolerance);
const q = Math.SQRT1_2;
const sourceFeatures = (firstRadius = 12) => [
  { id: 's', kind: 'sketch', profile: 'circle', center: [0, 0], radius: 2,
    holes: [[{ kind: 'arc', start: [1, 0], center: [0, 0], direction: 'cw' }]],
    sideTags: { outer: ['e0'], holes: [['bore']] } },
  { id: 'w', kind: 'sweep-curve', sketch: 's', mode: 'exact', path: { degree: 2,
    knots: [0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4], weights: [1, 1, 1, q, 1, q, 1, 1, 1],
    controlPoints: [[-10, 0, 0], [-5, 0, 0], [0, 0, 0], [firstRadius, 0, 0], [firstRadius, firstRadius, 0],
      [firstRadius, firstRadius + 18, 0], [firstRadius, firstRadius + 18, 18], [firstRadius, firstRadius + 18, 23], [firstRadius, firstRadius + 18, 28]] } },
];
const document = (cutEnd = -7, extra = [], tool = 'box') => ({ format: 'barocss-cad-part', version: 1, units: 'mm',
  parameters: { cutEnd }, features: [...sourceFeatures(),
    { id: 'boxProfile', kind: 'sketch', profile: 'rectangle', min: [-12, -4], max: [{ parameter: 'cutEnd' }, 4] },
    { id: 'box', kind: 'extrude', sketch: 'boxProfile', from: -4, height: 8 },
    ...extra, { id: 'trim', kind: 'difference', target: 'w', tool },
  ] });
const joints = brep => brep.edges.filter(edge => [[0, 0], [1, 12], [2, 18]].some(([axis, at]) =>
  edge.curve.controlPoints.every(point => Math.abs(point[axis] - at) < 1e-10)));
const atX = (brep, x) => brep.edges.filter(edge => edge.curve.controlPoints.every(point => Math.abs(point[0] - x) < 1e-10));
const withoutBindings = brep => ({ ...brep, coedges: brep.coedges.map(use => ({ ...use, pcurve: null })) });
const boundJoints = brep => joints(brep).filter(edge => brep.coedges.filter(use => use.edge === edge.id).every(use => use.pcurve));
let original;
const stock = () => original ??= evaluateCadPart({ format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {}, features: sourceFeatures() }).outputs[0].brep;
const rectangleTool = cutEnd => ({ kind: 'upright', solid: prismaticFromProfile({ from: -4, height: 8, tag: 'box', outer:
  [[-12, -4], [cutEnd, -4], [cutEnd, 4], [-12, 4]].map(start => ({ kind: 'line', start })) }) });
const snapshots = new Map();
const snapshot = end => {
  if (!snapshots.has(end)) snapshots.set(end, evaluateCadPart(document(end)));
  return snapshots.get(end);
};

function verifyBindings(brep, expected = 12) {
  const edges = joints(brep).filter(edge => {
    const owners = brep.coedges.filter(use => use.edge === edge.id).map(use => brep.faces.find(face => face.loops.includes(use.loop)));
    return owners.every(face => faceGeometry(face).kind !== 'plane');
  });
  assert.equal(edges.length, expected);
  for (const edge of edges) {
    const uses = brep.coedges.filter(use => use.edge === edge.id);
    assert.equal(uses.length, 2); assert.equal(uses[0].twin, uses[1].id); assert.equal(uses[1].twin, uses[0].id);
    assert.notEqual(uses[0].sense, uses[1].sense);
    for (const use of uses) {
      assert.ok(use.pcurve, `missing inherited binding: ${edge.name}`);
      const face = brep.faces.find(face => face.loops.includes(use.loop)), [a, b] = curveDomain(edge.curve);
      assert.deepEqual(curveDomain(use.pcurve), [a, b]);
      for (const fraction of [0, .17, .5, .79, 1]) {
        const t = a + fraction * (b - a), uv = evaluateCurve(use.pcurve, t);
        nearPoint(evaluateSurface(face.surface, uv[0], uv[1]), evaluateCurve(edge.curve, t), 1e-10);
      }
    }
    const continuity = measureBrepEdgeContinuity(brep, edge.id, { curvature: true });
    assert.equal(continuity.status, 'measured'); near(continuity.maximumAngleDegrees, 0);
    assert.equal(continuity.curvature.status, 'measured'); assert.ok(continuity.curvature.maximumDifference > 1e-5);
  }
}

function verify(result, cutEnd = -7) {
  const { brep } = result, report = checkBrep(brep, { strict: true }), inlet = Math.max(-10, cutEnd);
  assert.ok(report.valid, report.issues.join('\n'));
  assert.deepEqual(report.counts, cutEnd === 0
    ? { bodies: 1, shells: 1, faces: 14, loops: 16, coedges: 56, edges: 28, vertices: 16 }
    : { bodies: 1, shells: 1, faces: 18, loops: 20, coedges: 72, edges: 36, vertices: 20 });
  assert.equal(report.topology.length, 1); assert.equal(report.topology[0].shells, 1); assert.equal(report.topology[0].genus, 1);
  assert.ok(report.maximumPcurveGap < 1e-10); verifyBindings(brep, cutEnd === 0 ? 8 : 12);
  const lead = -inlet, length = 15 * Math.PI + lead + 10, volume = 3 * Math.PI * length;
  const bendCentroid = [36 / 5 + 581 / (60 * Math.PI), 12 + 12 / Math.PI, 54 / 5 - 1301 / (60 * Math.PI)];
  const centroid = bendCentroid.map((x, i) => (15 * Math.PI * x + lead * [-lead / 2, 0, 0][i] + 10 * [12, 30, 23][i]) / length);
  for (const mass of [massPropertiesOf(result), brepMassProperties(brep, 1)]) {
    near(mass.volume, volume, 1e-7); nearPoint(mass.centroid, centroid, 1e-7);
  }
  const caps = brep.faces.filter(face => faceGeometry(face).kind === 'plane'); assert.equal(caps.length, 2);
  for (const [center, normal] of [[[inlet, 0, 0], [-1, 0, 0]], [[12, 30, 28], [0, 0, 1]]]) {
    const cap = caps.find(face => norm(sub(faceGeometry(face).n, normal)) < 1e-9); assert.ok(cap);
    const loops = cap.loops.map(id => brep.loops.find(loop => loop.id === id));
    assert.deepEqual(loops.map(loop => loop.kind).sort(), ['inner', 'outer']);
    for (const loop of loops) for (const id of loop.coedges) {
      const use = brep.coedges.find(use => use.id === id), edge = brep.edges.find(edge => edge.id === use.edge), [a, b] = curveDomain(edge.curve);
      for (const fraction of [0, .23, .5, .87, 1]) {
        const point = evaluateCurve(edge.curve, a + fraction * (b - a)), delta = sub(point, center);
        near(delta.reduce((sum, x, i) => sum + x * normal[i], 0), 0); near(norm(delta), loop.kind === 'inner' ? 1 : 2);
      }
      // Newly cut rims are outside the inherited-joint authority, including a cut exactly at the old first join.
      if (cutEnd > -10 && normal[0] === -1)
        assert.ok(brep.coedges.filter(peer => peer.edge === edge.id).every(peer => !peer.pcurve));
    }
  }
  // Rebuilt native faces must still lie on the two original torus carriers, for both bore and exterior.
  const torusFaces = brep.faces.filter(face => faceGeometry(face).kind === 'other'); assert.equal(torusFaces.length, 8);
  for (const face of torusFaces) {
    const native = revolutionOf(face.surface, 30); assert.equal(native?.profile.kind, 'arc');
    const center = native.c.map((x, i) => x + native.a[i] * native.profile.c[1]);
    const first = Math.abs(native.a[2]) > .999999;
    nearPoint(center, first ? [0, 12, 0] : [12, 12, 18]); near(native.profile.c[0], first ? 12 : 18);
    assert.ok([1, 2].some(radius => Math.abs(native.profile.r - radius) < 1e-9));
  }
}

for (const end of [-7, -6]) test(`ordinary inlet Subtract at X${end} retains all twelve proved native joins`, () => {
  const result = snapshot(end).outputs[0]; verify(result, end);
  const raw = boolean({ kind: 'brep', brep: stock() }, rectangleTool(end), 'difference', 'trim');
  assert.equal(raw.kind, 'brep'); assert.equal(boundJoints(raw.brep).length, 0);
  assert.deepEqual(withoutBindings(result.brep), withoutBindings(raw.brep));
});

test('disjoint and tangent boxes preserve the original Boolean acceptance and twelve native joins', () => {
  for (const end of [-11, -10]) {
    verify(snapshot(end).outputs[0], end);
    const raw = boolean({ kind: 'brep', brep: stock() }, rectangleTool(end), 'difference', 'trim');
    assert.deepEqual(withoutBindings(snapshot(end).outputs[0].brep), withoutBindings(raw.brep));
  }
});

test('cutting exactly to the old inlet join leaves eight true joins and lends no authority to the new cap', () => {
  const result = snapshot(0).outputs[0]; verify(result, 0);
  assert.equal(atX(result.brep, 0).length, 4);
  for (const edge of atX(result.brep, 0)) {
    assert.ok(result.brep.coedges.filter(use => use.edge === edge.id).every(use => !use.pcurve));
    assert.equal(measureBrepEdgeContinuity(result.brep, edge.id).status, 'unsupported');
  }
});

test('depth edit and fresh native reopen retain the same recipe and exact replay', () => {
  const initial = snapshot(-7), edited = reevaluate(initial, { parameters: { cutEnd: -6 } }); verify(edited.outputs[0], -6);
  const reopened = loadCadPart(saveCadPart(edited));
  assert.deepEqual(reopened.document, edited.document); assert.deepEqual(reopened.outputs[0].brep, edited.outputs[0].brep); verify(reopened.outputs[0], -6);
  assert.deepEqual(reevaluate(reopened, { parameters: { cutEnd: -7 } }).outputs[0].brep, initial.outputs[0].brep);
});

test('one translated box and one cardinal placed native box retain primitive cutter ownership', () => {
  const translated = document(-7, [{ id: 'placedBox', kind: 'translate', target: 'box', offset: [-10, 0, 0] }], 'placedBox');
  translated.features[2].min = [-2, -4]; translated.features[2].max = [3, 4];
  verify(evaluateCadPart(translated).outputs[0]);
  const placed = document(); placed.features[2] = { id: 'boxProfile', kind: 'sketch', profile: 'rectangle', min: [-4, -4], max: [4, 4],
    plane: { origin: [0, 0, 0], normal: [1, 0, 0], xAxis: [0, 1, 0] } };
  placed.features[3] = { id: 'box', kind: 'extrude', sketch: 'boxProfile', from: -12, height: 5 };
  verify(evaluateCadPart(placed).outputs[0]);
});

test('a modified box and a circular cutter retain existing geometry without the new primitive authority', () => {
  const modified = document(-7, [
    { id: 'farSketch', kind: 'sketch', profile: 'rectangle', min: [50, 50], max: [51, 51] },
    { id: 'farBox', kind: 'extrude', sketch: 'farSketch', height: 1 },
    { id: 'modifiedBox', kind: 'difference', target: 'box', tool: 'farBox' },
  ], 'modifiedBox');
  const changed = evaluateCadPart(modified).outputs.find(output => output.feature === 'trim');
  assert.ok(checkBrep(changed.brep, { strict: true }).valid); assert.equal(boundJoints(changed.brep).length, 0);
  near(massPropertiesOf(changed).volume, 3 * Math.PI * (15 * Math.PI + 17), 1e-7);
  const circular = document(); circular.features[2] = { id: 'boxProfile', kind: 'sketch', profile: 'circle', center: [0, 0], radius: 4,
    plane: { origin: [0, 0, 0], normal: [1, 0, 0], xAxis: [0, 1, 0] } };
  circular.features[3] = { id: 'box', kind: 'extrude', sketch: 'boxProfile', from: -12, height: 5 };
  const cut = evaluateCadPart(circular).outputs[0];
  assert.ok(checkBrep(cut.brep, { strict: true }).valid); assert.equal(boundJoints(cut.brep).length, 0);
  near(massPropertiesOf(cut).volume, 3 * Math.PI * (15 * Math.PI + 17), 1e-7);
});

function hasBoundary(surface, edge) {
  const grid = surface.controlPoints, boundaries = [grid[0], grid.at(-1), grid.map(row => row[0]), grid.map(row => row.at(-1))];
  return boundaries.some(points => points.length === edge.curve.controlPoints.length && [false, true].some(reverse =>
    points.every((point, i) => norm(sub(point, edge.curve.controlPoints[reverse ? points.length - 1 - i : i])) < 1e-10)));
}

test('same circular rim cannot borrow a changed torus or reversed cylinder carrier', () => {
  const source = stock(), result = withoutBindings(snapshot(-7).outputs[0].brep), edge = atX(result, 0)[0];
  const uses = result.coedges.filter(use => use.edge === edge.id), owners = uses.map(use => result.faces.find(face => face.loops.includes(use.loop)));
  const torus = owners.find(face => faceGeometry(face).kind === 'other'), cylinder = owners.find(face => faceGeometry(face).kind === 'cylinder');
  assert.ok(torus && cylinder);
  const alternate = evaluateCadPart({ format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {}, features: sourceFeatures(13) }).outputs[0].brep;
  const other = alternate.faces.find(face => face.name.startsWith('w.first.') && hasBoundary(face.surface, edge));
  assert.ok(other, 'the changed R13 native carrier must retain exactly the same whole joint half-circle');
  const changed = { ...result, faces: result.faces.map(face => face.id === torus.id ? { ...face, surface: other.surface, sense: other.sense } : face) };
  assert.ok(retainSweepCircularJoinBindings(source, changed).coedges.filter(use => use.edge === edge.id).every(use => !use.pcurve));
  const reversed = { ...result, faces: result.faces.map(face => face.id === cylinder.id
    ? { ...face, sense: face.sense === 'forward' ? 'reversed' : 'forward' } : face) };
  assert.ok(retainSweepCircularJoinBindings(source, reversed).coedges.filter(use => use.edge === edge.id).every(use => !use.pcurve));
  assert.equal(retainSweepCircularJoinBindings(withoutBindings(source), result), result);
});
