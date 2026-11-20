import assert from 'node:assert/strict';
import test from 'node:test';
import { CadPartError, checkBrep, evaluateCadPart, faceGeometry } from '../dist/index.js';
import { brepMassProperties } from '../dist/brep/solid-mass.js';
import { boxFaceReplacementFrame, boxWallReplacementFrame, draftedFaceOffsetFrame, replaceBoxFace, replaceBoxWall } from '../dist/features/drafted-cap-offset.js';

const doc = features => ({ format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {}, features });
const output = features => evaluateCadPart(doc(features)).outputs[0];
const box = (min = [0, 0], max = [40, 30], height = 10, from = 0) => [
  { id: 'sketch', kind: 'sketch', profile: 'rectangle', min, max },
  { id: 'b', kind: 'extrude', sketch: 'sketch', height, from },
];
const source = box(), face = 'b.side1';
const plane = { origin: [37, 60, 0], normal: [2, 0, -1] };
const replacement = { id: 'replace', kind: 'replace-face', target: 'b', face, plane };
const close = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected}`);
const dot = (a, b) => a.reduce((sum, u, i) => sum + u * b[i], 0);
const sub = (a, b) => a.map((value, i) => value - b[i]);

function assertPlanesAndTopology(before, after, replaced, reference) {
  const report = checkBrep(after, { strict: true });
  assert.equal(report.valid, true, report.issues.join('\n'));
  assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 6, loops: 6, coedges: 24, edges: 12, vertices: 8 });
  assert.equal(report.topology[0].genus, 0);
  assert.ok(report.maximumEdgeSurfaceGap < 1e-9);
  assert.ok(report.maximumPcurveGap < 1e-9);
  assert.deepEqual(after.bodies, before.bodies);
  assert.deepEqual(after.shells, before.shells);
  assert.deepEqual(after.loops, before.loops);
  assert.deepEqual(after.vertices.map(v => v.id), before.vertices.map(v => v.id));
  assert.deepEqual(after.edges.map(e => [e.id, e.name, e.vertices, e.curve.id]), before.edges.map(e => [e.id, e.name, e.vertices, e.curve.id]));
  const useIdentity = ({ pcurve, ...use }) => [use, pcurve?.id];
  assert.deepEqual(after.coedges.map(useIdentity), before.coedges.map(useIdentity));
  assert.equal(after.coedges.filter(use => use.pcurve).length, 24);
  assert.deepEqual(after.faces.map(f => [f.id, f.name, f.loops, f.surface.id]), before.faces.map(f => [f.id, f.name, f.loops, f.surface.id]));

  for (const actual of after.faces) {
    const previous = faceGeometry(before.faces.find(f => f.id === actual.id));
    const next = faceGeometry(actual);
    assert.equal(next.kind, 'plane');
    const wanted = actual.name === replaced ? reference : { origin: previous.o, normal: previous.n };
    const unit = wanted.normal.map(x => x / Math.hypot(...wanted.normal));
    const alignment = dot(next.n, unit);
    close(Math.abs(alignment), 1, 1e-12);
    // The source face defines outward orientation even when the reference normal points inwards.
    assert.ok(dot(previous.n, next.n) > 0);
    assert.ok(actual.surface.controlPoints.flat().every(point => Math.abs(dot(sub(point, wanted.origin), unit)) < 1e-9));
  }
}

test('a native box wall is replaced by the tilted plane and retains every topology identity', () => {
  const before = output(source).brep, saved = structuredClone(before);
  assert.deepEqual(boxWallReplacementFrame(before, face), { anchor: [40, 15, 5], normal: [1, 0, 0] });
  assert.equal(boxWallReplacementFrame(before, 'b.top'), undefined);
  assert.equal(draftedFaceOffsetFrame(before, face), undefined);
  const signature = { kind: 'plane', at: [40, 15, 5], dir: [1, 0, 0], size: 300 };
  const result = output([...source, { ...replacement, expect: { [face]: signature } }]);
  assert.equal(result.representation, 'planar');
  assert.equal(result.feature, 'replace');
  assert.deepEqual(result.brep, replaceBoxWall(before, face, plane));
  assert.deepEqual(before, saved);
  assertPlanesAndTopology(before, result.brep, face, plane);
  assert.deepEqual(result.brep.vertices.filter(v => v.point[0] > 0).map(v => v.point.join(',')).sort(), ['37,0,0', '37,30,0', '42,0,10', '42,30,10']);
  assert.equal(boxWallReplacementFrame(result.brep, face), undefined);

  // Build the same body independently from a trapezoid extruded along -Y.
  const oracle = output([
    { id: 's', kind: 'sketch', profile: 'polygon', points: [[0, 0], [37, 0], [42, 10], [0, 10]],
      plane: { origin: [0, 30, 0], xAxis: [1, 0, 0], normal: [0, -1, 0] } },
    { id: 'independent', kind: 'extrude', sketch: 's', height: 30 },
  ]);
  const independent = brepMassProperties(oracle.brep, 1), actual = brepMassProperties(result.brep, 1);
  close(independent.volume, 30 * 10 * (37 + 42) / 2);
  close(actual.volume, independent.volume);
  actual.centroid.forEach((value, axis) => close(value, independent.centroid[axis]));
});

test('a reflected Y-min wall takes the signed tilted plane with a negative cap station', () => {
  const target = box([-8, -6], [22, 34], 8, -2), before = output(target).brep, wall = 'b.side0';
  const reference = { origin: [70, -4, -2], normal: [0, 2, 1] };
  const after = output([...target, { ...replacement, face: wall, plane: reference }]).brep;
  assertPlanesAndTopology(before, after, wall, reference);
  assert.deepEqual(after.vertices.filter(v => v.point[1] < 0).map(v => v.point.join(',')).sort(), ['-8,-4,-2', '-8,-8,6', '22,-4,-2', '22,-8,6']);
  close(brepMassProperties(after, 1).volume, 30 * 8 * (38 + 42) / 2);
});

test('a plane tilted in height and width replaces all four wall corners on the same support', () => {
  const before = output(source).brep, saved = structuredClone(before);
  const reference = { origin: [48, 60, 10], normal: [-10, 1, 5] };
  const after = output([...source, { ...replacement, plane: reference }]).brep;
  assertPlanesAndTopology(before, after, face, reference);
  for (const vertex of before.vertices) {
    const [x, y, z] = vertex.point;
    const actual = after.vertices.find(v => v.id === vertex.id);
    close(actual.point[0], x === 40 ? 37 + y / 10 + z / 2 : x);
    assert.deepEqual(actual.point.slice(1), [y, z]);
  }
  const mass = brepMassProperties(after, 1);
  close(mass.volume, 12300);
  // Integrate x=0..37+y/10+z/2 over y=0..30 and z=0..10 for the first moments.
  [10103 / 492, 1245 / 82, 1255 / 246].forEach((value, axis) => close(mass.centroid[axis], value));
  assert.deepEqual(before, saved);
});

test('a width-only tilt leaves the extrusion caps on their original planes', () => {
  const before = output(source).brep;
  const reference = { origin: [36, 0, 70], normal: [5, -1, 0] };
  const after = output([...source, { ...replacement, plane: reference }]).brep;
  assertPlanesAndTopology(before, after, face, reference);
  const expected = new Map([[0, 36], [30, 42]]);
  for (const vertex of after.vertices.filter(v => v.point[0] > 0)) close(vertex.point[0], expected.get(vertex.point[1]));
  close(brepMassProperties(after, 1).volume, 11700);
});

test('either box cap can take the same reflected two-direction tilt with all native identities', () => {
  const before = output(source).brep, saved = structuredClone(before);
  for (const upper of [true, false]) {
    const name = upper ? 'b.top' : 'b.bottom', station = upper ? 10 : 0;
    const reference = upper ? { origin: [0, 60, 20], normal: [-1, -2, 10] }
      : { origin: [0, 60, -10], normal: [-1, -2, -10] };
    assert.deepEqual(boxFaceReplacementFrame(before, name),
      { anchor: [20, 15, station], normal: [0, 0, upper ? 1 : -1] });
    assert.equal(boxWallReplacementFrame(before, name), undefined);
    const after = output([...source, { ...replacement, face: name, plane: reference }]).brep;
    assert.deepEqual(after, replaceBoxFace(before, name, reference));
    const reversed = { ...reference, normal: reference.normal.map(value => -value) };
    assert.deepEqual(after, replaceBoxFace(before, name, reversed));
    assertPlanesAndTopology(before, after, name, reference);
    for (const vertex of before.vertices) {
      const [x, y, z] = vertex.point, actual = after.vertices.find(v => v.id === vertex.id);
      const height = 8 + x / 10 + y / 5;
      assert.deepEqual(actual.point.slice(0, 2), [x, y]);
      close(actual.point[2], z !== station ? z : upper ? height : 10 - height);
    }
    const mass = brepMassProperties(after, 1);
    close(mass.volume, 15600);
    // Integrate h=8+x/10+y/5 over the footprint. The underside case reflects Z about 5 mm.
    [820 / 39, 210 / 13, upper ? 20 / 3 : 10 / 3].forEach((value, axis) => close(mass.centroid[axis], value));
  }
  assert.deepEqual(before, saved);
});

test('cap replacement refuses perpendicular and parallel references and one-corner collapse without touching the box', () => {
  const before = output(source).brep, saved = structuredClone(before);
  for (const [candidate, error] of [
    [{ origin: [0, 60, 10], normal: [1, 0, 0] }, /perpendicular to the selected cap/],
    [{ origin: [0, 60, 10], normal: [1, 0, 1e-16] }, /perpendicular to the selected cap/],
    [{ origin: [0, 60, 10], normal: [0, 0, 1] }, /tilt is too small for this cap/],
    [{ origin: [0, 60, 10], normal: [1e-10, 0, 1] }, /tilt is too small for this cap/],
    // Moving the plane down 8 or 9 mm closes or crosses only its minimum corner.
    [{ origin: [0, 60, 12], normal: [-1, -2, 10] }, /opposite cap at one corner/],
    [{ origin: [0, 60, 11], normal: [-1, -2, 10] }, /opposite cap at one corner/],
  ]) {
    assert.throws(() => replaceBoxFace(before, 'b.top', candidate), error);
    assert.deepEqual(before, saved);
  }
});

test('Replace face refuses corner collapse, unsupported slope and stale picks', () => {
  const before = output(source).brep, saved = structuredClone(before);
  const refuses = (params, category, message) => assert.throws(() => output([...source, { ...replacement, ...params }]),
    error => error instanceof CadPartError && error.details.category === category && message.test(error.message));
  for (const bad of [
    { origin: [0, 60, 0], normal: [2, 0, -1] },
    { origin: [5, 60, 0], normal: [2, 0, 1] },
    // Only the minimum y/z corner closes or crosses. The affine integral is still positive.
    { origin: [11, 60, 10], normal: [-10, 1, 5] },
    { origin: [10, 60, 10], normal: [-10, 1, 5] },
  ]) {
    refuses({ plane: bad }, 'GEOMETRY', /reach or cross the opposite wall/);
    assert.throws(() => replaceBoxWall(before, face, bad), /reach or cross the opposite wall/);
    assert.deepEqual(before, saved);
  }
  for (const normal of [[0, 0, 1], [0, 1, 0], [1e-16, 1, 0]]) refuses({ plane: { ...plane, normal } }, 'GEOMETRY', /too close to perpendicular/);
  for (const normal of [[1, 0, 0], [1, 0, 1e-10]]) refuses({ plane: { ...plane, normal } }, 'GEOMETRY', /tilt is too small/);
  refuses({ plane: { ...plane, normal: [0, 0, 0] } }, 'INPUT', /finite nonzero length/);
  refuses({ plane: { ...plane, origin: [10000, 60, 0] } }, 'GEOMETRY', /modeling coordinate range/);
  assert.throws(() => replaceBoxWall(before, 'b.top', plane), /upright wall/);
  refuses({ face: 'b.side1#1' }, 'REFERENCE', /missing or ambiguous/);
  refuses({ expect: { [face]: { kind: 'plane', at: [40, 15, 5], dir: [0, 1, 0], size: 300 } } }, 'REFERENCE', /REFERENCE_MOVED/);

  assert.throws(() => output([...source, { id: 'old', kind: 'offset-face', target: 'b', face, distance: 2 }]), /tapered walls/);
});
