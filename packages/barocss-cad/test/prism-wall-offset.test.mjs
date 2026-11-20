import test from 'node:test';
import assert from 'node:assert/strict';
import { checkBrep, evaluateCadPart, faceGeometry, reevaluate } from '../dist/index.js';
import { transformBrep } from '../dist/brep/brep-transform.js';
import { brepMassProperties } from '../dist/brep/solid-mass.js';
import { offsetPrismWall, prismCapReplacementFrame, prismWallOffsetFrame, replacePrismCapIfAdmitted } from '../dist/features/prism-wall-offset.js';

const footprint = [[0, 0], [18, 0], [24, 8], [18, 16], [0, 16], [-6, 8]];
const selected = 'n1.side1';
const part = (points = footprint, extrusion = {}) => ({ format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {}, features: [
  { id: 'n0', kind: 'sketch', profile: 'polygon', points },
  { id: 'n1', kind: 'extrude', sketch: 'n0', height: 10, ...extrusion },
] });
const solidOf = (spec = part()) => evaluateCadPart(spec).outputs[0].brep;
const faceOf = (brep, name) => brep.faces.find(face => face.name === name);
const close = (a, b, epsilon = 1e-9) => assert.ok(Math.abs(a - b) <= epsilon, `${a} != ${b}`);
const pointClose = (a, b) => a.forEach((value, axis) => close(value, b[axis]));

// Independent intersections of 4x - 3y = 72 + 5d with y = 0 and 4x + 3y = 120.
const footprintAt = d => [footprint[0], [18 + 5 * d / 4, 0], [24 + 5 * d / 8, 8 - 5 * d / 6], ...footprint.slice(3)];
const area = ring => ring.reduce((sum, p, i) => {
  const q = ring[(i + 1) % ring.length];
  return sum + p[0] * q[1] - p[1] * q[0];
}, 0) / 2;
const identity = brep => ({
  source: brep.source, bodies: brep.bodies, shells: brep.shells, loops: brep.loops,
  faces: brep.faces.map(({ surface, ...record }) => ({ ...record, surface: surface.id })),
  coedges: brep.coedges.map(({ pcurve, ...record }) => ({ ...record, pcurve: pcurve?.id ?? null })),
  edges: brep.edges.map(({ curve, ...record }) => ({ ...record, curve: curve.id })),
  vertices: brep.vertices.map(({ point, ...record }) => record),
});

for (const direction of [1, -1]) {
  const upper = direction === 1, faceName = upper ? 'n1.top' : 'n1.bottom';
  const station = upper ? 10 : 0, fixed = 10 - station;
  const plane = { origin: [0, 0, fixed + 8 * direction], normal: [-1, -2, 10 * direction] };
  test(`replace ${faceName} on a convex hexagonal prism and keep the seven fixed supports`, () => {
    const doc = part(), source = solidOf(doc), before = structuredClone(source);
    const frame = prismCapReplacementFrame(source, faceName);
    pointClose(frame.normal, [0, 0, direction]);
    const change = { id: 'replace', kind: 'replace-face', target: 'n1', face: faceName, plane };
    const result = solidOf({ ...doc, features: [...doc.features, change] });
    const report = checkBrep(result, { strict: true });
    assert.ok(report.valid, report.issues.join('\n'));
    assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 8, loops: 8, coedges: 36, edges: 18, vertices: 12 });
    assert.equal(result.coedges.filter(coedge => coedge.pcurve).length, 36);
    assert.deepEqual(identity(result), identity(source));
    assert.ok(report.maximumPcurveGap < 1e-9);
    assert.ok(report.maximumEdgeSurfaceGap < 1e-9);
    for (const [i, vertex] of source.vertices.entries()) {
      const [x, y, z] = vertex.point;
      pointClose(result.vertices[i].point, [x, y, z === station ? fixed + direction * (8 + x / 10 + y / 5) : z]);
    }
    for (const face of source.faces) {
      if (face.name === faceName) continue;
      const support = faceGeometry(face), moved = faceOf(result, face.name);
      pointClose(faceGeometry(moved).n, support.n);
      for (const point of moved.surface.controlPoints.flat())
        close(point.reduce((sum, value, axis) => sum + (value - support.o[axis]) * support.n[axis], 0), 0);
    }
    const mass = brepMassProperties(result, 1);
    assert.equal(mass.method, 'planar-exact');
    close(mass.volume, 4032, 1e-7);
    pointClose(mass.centroid, [332 / 35, 376 / 45, upper ? 8363 / 1575 : 7387 / 1575]);
    assert.deepEqual(source, before);
    for (const distance of [8, 9]) {
      assert.throws(() => replacePrismCapIfAdmitted(source, faceName, {
        ...plane, origin: [0, 0, plane.origin[2] - direction * distance],
      }), /reach or cross the opposite cap at one corner/);
    }
  });
}

test('prism cap replacement refuses unsupported stock and unsuitable donor planes', () => {
  const source = solidOf(), face = 'n1.top', origin = [0, 0, 8];
  for (const normal of [[0, 0, 1], [1e-10, 0, 1]]) {
    assert.throws(() => replacePrismCapIfAdmitted(source, face, { origin, normal }), /tilt is too small/);
  }
  assert.throws(() => replacePrismCapIfAdmitted(source, face, { origin, normal: [1, 0, 0] }), /perpendicular/);
  for (const [brep, name] of [[source, selected], [solidOf(part(footprint.slice(1))), face],
    [solidOf(part([[0, 0], [18, 0], [10, 7], [18, 16], [0, 16], [-6, 8]])), face],
    [solidOf(part(footprint, { draft: 5 })), face]]) {
    assert.equal(prismCapReplacementFrame(brep, name), undefined);
    assert.equal(replacePrismCapIfAdmitted(brep, name, { origin, normal: [-1, -2, 10] }), undefined);
  }
});

for (const distance of [1, -2, -9.599, 9.599]) {
  test(`prism wall offset ${distance} keeps the closed native hexagon and its support planes`, () => {
    const source = solidOf(), before = structuredClone(source);
    const frame = prismWallOffsetFrame(source, selected);
    pointClose(frame.anchor, [21, 4, 5]);
    pointClose(frame.normal, [0.8, -0.6, 0]);
    const result = offsetPrismWall(source, selected, distance);
    const report = checkBrep(result, { strict: true });
    assert.equal(report.valid, true, report.issues.join('\n'));
    assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 8, loops: 8, coedges: 36, edges: 18, vertices: 12 });
    assert.equal(report.topology[0].genus, 0);
    assert.equal(source.coedges.filter(coedge => coedge.pcurve).length, 36);
    assert.deepEqual(identity(result), identity(source));
    assert.ok(result.coedges.some((coedge, index) => coedge.pcurve !== source.coedges[index].pcurve));
    assert.ok(result.coedges.some((coedge, index) => coedge.pcurve === source.coedges[index].pcurve));
    assert.ok(report.maximumPcurveGap < 1e-9);

    const section = footprintAt(distance);
    const mass = brepMassProperties(result, 1);
    assert.equal(mass.method, 'planar-exact');
    close(mass.volume, 10 * area(section), 1e-7);
    for (let i = 0; i < source.vertices.length; i++) {
      const vertex = source.vertices[i], [x, y, z] = vertex.point;
      const k = footprint.findIndex(p => p[0] === x && p[1] === y);
      pointClose(result.vertices[i].point, [...section[k], z]);
      if (k !== 1 && k !== 2) assert.equal(result.vertices[i], vertex);
    }
    for (const face of result.faces) {
      const original = faceOf(source, face.name), expected = faceGeometry(original), actual = faceGeometry(face);
      assert.equal(actual.kind, 'plane');
      pointClose(actual.n, expected.n);
      for (const point of face.surface.controlPoints.flat()) {
        const separation = point.reduce((sum, x, i) => sum + (x - expected.o[i]) * expected.n[i], 0);
        close(separation, face.name === selected ? distance : 0);
      }
    }
    assert.deepEqual(source, before);
  });
}

test('prism wall offset rejects an exact edge collapse before volume vanishes and rejects the crossing beyond it', () => {
  const source = solidOf(), before = structuredClone(source);
  assert.equal(offsetPrismWall(source, selected, 0), source);
  for (const distance of [-10, -9.6, 9.6, 10]) {
    assert.ok(area(footprintAt(distance)) > 0);
    assert.throws(() => offsetPrismWall(source, selected, distance), /collapse or cross a wall/);
  }
  assert.throws(() => offsetPrismWall(source, selected, 10000), /modeling coordinate range/);
  assert.throws(() => offsetPrismWall(source, selected, Number.EPSILON), /too small/);
  assert.throws(() => offsetPrismWall(source, selected, NaN), /distance must be finite/);
  assert.throws(() => offsetPrismWall(source, 'missing', 1), /missing or ambiguous/);
  assert.deepEqual(source, before);
});

test('prism wall admission excludes concave, tilted, ambiguous and mismatched supports', () => {
  const source = solidOf();
  const tilted = transformBrep(source, { matrix: [1, 0, 0.1, 0, 1, 0, 0, 0, 1] });
  const badWall = structuredClone(source);
  faceOf(badWall, selected).surface.controlPoints.forEach(row => row.forEach(p => { p[0] += 5e-8; }));
  assert.equal(checkBrep(badWall, { strict: true }).valid, true);
  const other = solidOf(part([[0, 0], [18, 0], [10, 7], [18, 16], [0, 16], [-6, 8]]));
  const pentagon = solidOf(part(footprint.slice(1)));
  const drafted = solidOf(part(footprint, { draft: 5 }));
  for (const [brep, face] of [[source, 'n1.top'], [tilted, selected], [badWall, selected],
    [other, selected], [pentagon, selected], [drafted, selected]]) {
    assert.equal(prismWallOffsetFrame(brep, face), undefined);
    assert.throws(() => offsetPrismWall(brep, face, 1), /wall of one straight convex hexagonal prism/);
  }
  const duplicate = structuredClone(source);
  faceOf(duplicate, 'n1.side0').name = selected;
  assert.equal(prismWallOffsetFrame(duplicate, selected), undefined);
  assert.throws(() => offsetPrismWall(duplicate, selected, 1), /missing or ambiguous/);
});

test('prism wall offset keeps reversed and translated charts admissible for another move', () => {
  const source = transformBrep(solidOf(), { matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1], offset: [9000, -8000, -20] });
  const name = 'n1.side5';
  assert.equal(faceOf(source, name).sense, 'reversed');
  const frame = prismWallOffsetFrame(source, name);
  pointClose(frame.anchor, [8997, -7996, -15]);
  pointClose(frame.normal, [-0.8, -0.6, 0]);
  const first = offsetPrismWall(source, name, 1);
  const twice = offsetPrismWall(first, name, -2), direct = offsetPrismWall(source, name, -1);
  assert.deepEqual(identity(twice), identity(source));
  assert.equal(checkBrep(twice, { strict: true }).valid, true);
  for (let i = 0; i < twice.vertices.length; i++) pointClose(twice.vertices[i].point, direct.vertices[i].point);
});

test('the native Part offset-face uses the oblique prism route under the authored feature id', () => {
  const doc = part(), base = evaluateCadPart(doc), source = base.outputs[0].brep;
  const move = { id: 'change', kind: 'offset-face', target: 'n1', face: selected, distance: 1 };
  const expectation = { kind: 'plane', at: [21, 4, 5], dir: [0.8, -0.6, 0], size: 100 };
  const expected = offsetPrismWall(source, selected, 1);
  for (const expect of [undefined, { [selected]: expectation }]) {
    const document = { ...doc, features: [...doc.features, { ...move, ...(expect && { expect }) }] };
    const snapshot = evaluateCadPart(document);
    assert.deepEqual(snapshot.outputs.map(({ id, feature }) => [id, feature]), [['change', 'change']]);
    assert.deepEqual(snapshot.outputs[0].brep, expected);
    assert.deepEqual(reevaluate(base, { document }).outputs[0].brep, expected);
  }
  const stale = { ...expectation, dir: [-0.8, 0.6, 0] };
  assert.throws(() => evaluateCadPart({ ...doc, features: [...doc.features, { ...move, expect: { [selected]: stale } }] }), /REFERENCE_MOVED/);
  assert.throws(() => evaluateCadPart({ ...doc, features: [...doc.features, { ...move, distance: -9.6 }] }), /collapse or cross a wall/);
});

test('an axis-aligned wall offsets the same six-sided prism by intersecting its fixed neighbors', () => {
  const source = solidOf(), before = structuredClone(source), face = 'n1.side0';
  const frame = prismWallOffsetFrame(source, face);
  pointClose(frame.anchor, [9, 0, 5]);
  pointClose(frame.normal, [0, -1, 0]);
  for (const distance of [1, -1, 11.999, -7.999]) {
    const moved = offsetPrismWall(source, face, distance), report = checkBrep(moved, { strict: true });
    assert.ok(report.valid, report.issues.join('\n'));
    assert.ok(report.maximumPcurveGap < 1e-9);
    assert.deepEqual(identity(moved), identity(source));
    const target = [[3 * distance / 4, -distance], [18 - 3 * distance / 4, -distance]];
    source.vertices.forEach(({ point: [x, y, z] }, i) =>
      pointClose(moved.vertices[i].point, y !== 0 ? [x, y, z] : [...target[x === 0 ? 0 : 1], z]));
    for (const original of source.faces) {
      const support = faceGeometry(original);
      const result = faceOf(moved, original.name);
      result.surface.controlPoints.flat().forEach(point => {
        const signed = point.reduce((sum, value, i) => sum + (value - support.o[i]) * support.n[i], 0);
        close(signed, original.name === face ? distance : 0);
      });
    }
    close(brepMassProperties(moved, 1).volume, 3840 + 180 * distance - 7.5 * distance ** 2, 1e-7);
  }
  for (const distance of [12, -8, 13, -9]) {
    assert.throws(() => offsetPrismWall(source, face, distance), /collapse or cross a wall/);
  }
  assert.deepEqual(source, before);
});

test('the rotated X wall has the same signed volume and native topology', () => {
  const rotate = { matrix: [0, -1, 0, 1, 0, 0, 0, 0, 1] };
  const original = solidOf(), source = transformBrep(original, rotate), face = 'n1.side0';
  const frame = prismWallOffsetFrame(source, face);
  pointClose(frame.anchor, [0, 9, 5]);
  pointClose(frame.normal, [1, 0, 0]);
  for (const [distance, expectedVolume] of [[1, 4012.5], [-1, 3652.5]]) {
    const result = offsetPrismWall(source, face, distance);
    const reference = transformBrep(offsetPrismWall(original, face, distance), rotate);
    assert.equal(checkBrep(result, { strict: true }).valid, true);
    assert.deepEqual(identity(result), identity(source));
    assert.equal(result.vertices.length, 12);
    result.vertices.forEach((vertex, i) => pointClose(vertex.point, reference.vertices[i].point));
    close(brepMassProperties(result, 1).volume, expectedVolume, 1e-7);
  }
});
