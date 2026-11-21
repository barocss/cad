import assert from 'node:assert/strict';
import test from 'node:test';
import { checkBrep, evaluateCadPart, evaluateCurve, evaluateSurface, faceGeometry } from '../dist/index.js';
import { transformBrep, quarterTurn } from '../dist/brep/brep-transform.js';
import { brepMassProperties } from '../dist/brep/solid-mass.js';
import { circularWallOffsetFrame, offsetCircularWallIfAdmitted } from '../dist/features/bored-cap-offset.js';

const cylinder = ({ center = [14, 12], radius = 8, from = -3, height = 10 } = {}) => ({
  format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {}, features: [
    { id: 's', kind: 'sketch', profile: 'circle', center, radius },
    { id: 'c', kind: 'extrude', sketch: 's', from, height },
  ],
});
const solid = doc => evaluateCadPart(doc).outputs[0].brep;
const close = (a, b, tolerance = 1e-9) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
const pointClose = (a, b) => a.forEach((value, axis) => close(value, b[axis]));
const walls = brep => brep.faces.filter(face => faceGeometry(face).kind === 'cylinder');
const freeze = value => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
const identity = brep => ({
  source: brep.source, bodies: brep.bodies, shells: brep.shells, loops: brep.loops, coedges: brep.coedges,
  faces: brep.faces.map(({ surface, ...face }) => ({ ...face, surface: { ...surface, controlPoints: undefined } })),
  edges: brep.edges.map(({ curve, ...edge }) => ({ ...edge, curve: { ...curve, controlPoints: undefined } })),
  vertices: brep.vertices.map(({ point: _point, ...vertex }) => vertex),
});

for (const center of [[14, 12], [-31, 7]]) {
  for (const distance of [3.25, -3.5]) {
    test(`signed circular wall offset ${distance} at ${center} keeps exact supports and native identities`, () => {
      const doc = cylinder({ center }), source = freeze(solid(doc)), saved = structuredClone(source);
      const radius = 8 + distance, from = -3, height = 10;
      const names = walls(source).map(face => face.name);
      assert.equal(names.length, 2);
      for (const face of names) {
        const frame = circularWallOffsetFrame(source, face);
        assert.deepEqual(frame.faces, names);
        close(frame.anchor[2], from + height / 2);
        close(Math.hypot(frame.anchor[0] - center[0], frame.anchor[1] - center[1]), 8);
        pointClose(frame.normal, [(frame.anchor[0] - center[0]) / 8, (frame.anchor[1] - center[1]) / 8, 0]);
        close(Math.hypot(...frame.normal), 1);

        const result = offsetCircularWallIfAdmitted(source, face, distance), report = checkBrep(result, { strict: true });
        assert.ok(report.valid, report.issues.join('\n'));
        assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 4, loops: 4, coedges: 12, edges: 6, vertices: 4 });
        assert.equal(report.topology[0].genus, 0);
        assert.ok(report.maximumEdgeSurfaceGap < 1e-9 && report.maximumPcurveGap < 1e-9);
        assert.deepEqual(identity(result), identity(source));
        const mass = brepMassProperties(result, 1), volume = Math.PI * radius ** 2 * height;
        close(mass.volume, volume, volume * 1e-9);
        pointClose(mass.centroid, [...center, from + height / 2]);
        for (const wall of walls(result)) {
          const support = faceGeometry(wall);
          close(support.r, radius);
          pointClose(support.c, [...center, from]);
          pointClose(support.a, [0, 0, 1]);
          assert.equal(support.out, 1);
          for (const u of [0, 0.13, 0.37, 0.5, 0.81, 1]) {
            for (const v of [0, 0.41, 1]) {
              const point = evaluateSurface(wall.surface, u, v);
              close(Math.hypot(point[0] - center[0], point[1] - center[1]), radius);
              close(point[2], from + height * v);
            }
          }
        }
        for (const edge of result.edges.filter(edge => edge.curve.degree === 2)) {
          for (const t of [0, 0.17, 0.61, 1]) {
            const point = evaluateCurve(edge.curve, t);
            close(Math.hypot(point[0] - center[0], point[1] - center[1]), radius);
            assert.ok(point[2] === from || point[2] === from + height);
          }
        }
        for (const [name, z, normal] of [['c.bottom', from, [0, 0, -1]], ['c.top', from + height, [0, 0, 1]]]) {
          const cap = result.faces.find(item => item.name === name), support = faceGeometry(cap);
          assert.equal(support.kind, 'plane');
          close(support.o[2], z);
          pointClose(support.n, normal);
        }
        const edit = { id: 'offset', kind: 'offset-face', target: 'c', face, distance };
        assert.deepEqual(solid({ ...doc, features: [...doc.features, edit] }), result);
      }
      assert.deepEqual(source, saved);
    });
  }
}

test('circular wall offset rejects collapse, deep range overflow and invalid distances without changing the source', () => {
  const source = freeze(solid(cylinder())), saved = structuredClone(source), face = walls(source)[0].name;
  for (const distance of [-8, -9, -8 + 5e-8])
    assert.throws(() => offsetCircularWallIfAdmitted(source, face, distance), /reach or cross the cylinder axis/);
  for (const distance of [0, NaN, Infinity, -Infinity, 10001])
    assert.throws(() => offsetCircularWallIfAdmitted(source, face, distance), /distance/);
  assert.throws(() => offsetCircularWallIfAdmitted(source, face, 9990), /modeling range/);
  assert.throws(() => offsetCircularWallIfAdmitted(source, face, Number.MIN_VALUE), /too small/);
  assert.deepEqual(source, saved);
});

test('circular wall admission excludes caps, bores, altered supports and non-upright or unauthored stock', () => {
  const doc = cylinder(), source = solid(doc), face = walls(source)[0].name;
  for (const name of ['c.top', 'c.bottom', 'missing', 'c.side0', `${face}+c.top`]) {
    assert.equal(circularWallOffsetFrame(source, name), undefined);
    assert.equal(offsetCircularWallIfAdmitted(source, name, 1), undefined);
  }
  const bored = solid({ ...doc, features: [...doc.features,
    { id: 'h', kind: 'hole', target: 'c', face: 'c.top', center: [14, 12], radius: 3 }] });
  const altered = structuredClone(source);
  altered.faces.find(item => item.name === face).surface.controlPoints[1][0][0] += 0.01;
  const duplicate = structuredClone(source);
  walls(duplicate)[1].name = face;
  for (const brep of [bored, altered, duplicate, transformBrep(source, { matrix: quarterTurn('x', 90) }),
    { ...source, source: { ...source.source, family: 'step-import' } }]) {
    assert.equal(circularWallOffsetFrame(brep, face), undefined);
    assert.equal(offsetCircularWallIfAdmitted(brep, face, 1), undefined);
  }
});
