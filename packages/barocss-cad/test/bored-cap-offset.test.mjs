import assert from 'node:assert/strict';
import test from 'node:test';
import { BrepError, checkBrep, evaluateCadPart, evaluateSurface, faceGeometry } from '../dist/index.js';
import { brepMassProperties } from '../dist/brep/solid-mass.js';
import { boredCapOffsetFrame, offsetBoredCapIfAdmitted } from '../dist/features/bored-cap-offset.js';

const plate = ({ min = [0, 0], max = [40, 30], height = 10, from = 0, center = [11, 9], radius = 3, ...ends } = {}) => ({
  format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {},
  features: [
    { id: 's', kind: 'sketch', profile: 'rectangle', min, max },
    { id: 'b', kind: 'extrude', sketch: 's', height, from },
    { id: 'h', kind: 'hole', target: 'b', center, radius, face: 'b.top', ...ends },
  ],
});
const solid = spec => evaluateCadPart(spec).outputs[0].brep;
const close = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
const assertNativePlate = brep => {
  const report = checkBrep(brep, { strict: true });
  assert.equal(report.valid, true, report.issues.join('\n'));
  assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 8, loops: 10, coedges: 36, edges: 18, vertices: 12 });
  assert.equal(report.topology[0].genus, 1);
  assert.ok(report.maximumPcurveGap < 1e-9);
};
const freeze = value => {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
};

// The axial behavior follows the rectangular region minus a circular disc, independently of the B-rep.
const area = 1200 - 9 * Math.PI;
const centroidX = (1200 * 20 - 9 * Math.PI * 11) / area;
const centroidY = (1200 * 15 - 9 * Math.PI * 9) / area;

for (const [name, sign] of [['b.top', 1], ['b.bottom', -1]]) {
  for (const distance of [2, -2]) {
    test(`bored cap ${name} offset ${distance} preserves analytical supports, trim IDs and mass`, () => {
      const input = plate(), source = freeze(solid(input)), saved = structuredClone(source);
      const lo = sign === 1 ? 0 : -distance, hi = sign === 1 ? 10 + distance : 10;
      const z = sign === 1 ? 10 : 0, fixedName = sign === 1 ? 'b.bottom' : 'b.top';
      const chart = boredCapOffsetFrame(source, name);
      assert.deepEqual(chart.normal, [0, 0, sign]);
      close(chart.anchor[0], 4);
      close(chart.anchor[1], 9);
      assert.equal(chart.anchor[2], z);

      const result = offsetBoredCapIfAdmitted(source, name, distance);
      assertNativePlate(result);
      const mass = brepMassProperties(result, 1);
      close(mass.volume, area * (hi - lo));
      close(mass.centroid[0], centroidX);
      close(mass.centroid[1], centroidY);
      close(mass.centroid[2], (lo + hi) / 2);
      assert.equal(result.bodies, source.bodies);
      assert.equal(result.shells, source.shells);
      assert.equal(result.loops, source.loops);
      assert.equal(result.coedges, source.coedges);
      assert.equal(result.source, source.source);
      assert.deepEqual(source, saved);
      const move = ([x, y, before]) => [x, y, before === z ? z + sign * distance : before];
      assert.deepEqual(result.vertices, source.vertices.map(v => ({ ...v, point: move(v.point) })));
      assert.deepEqual(result.edges, source.edges.map(e => ({ ...e, curve: { ...e.curve, controlPoints: e.curve.controlPoints.map(move) } })));
      assert.deepEqual(result.faces, source.faces.map(f => ({ ...f, surface: { ...f.surface, controlPoints: f.surface.controlPoints.map(row => row.map(move)) } })));
      assert.equal(result.faces.find(f => f.name === fixedName), source.faces.find(f => f.name === fixedName));
      for (const face of result.faces) {
        const before = source.faces.find(original => original.id === face.id);
        const previous = faceGeometry(before), current = faceGeometry(face);
        assert.equal(current.kind, previous.kind);
        if (current.kind === 'cylinder') {
          close(current.r, 3);
          assert.equal(current.out, -1);
          for (const u of [0, 0.125, 0.625, 1]) {
            for (const v of [0, 0.25, 1]) {
              const [x, y, height] = evaluateSurface(face.surface, u, v);
              close(Math.hypot(x - 11, y - 9), 3);
              close(height, lo + (hi - lo) * v);
            }
          }
        }
        if (current.kind === 'plane') {
          assert.deepEqual(current.n, previous.n);
          const signed = current.o.reduce((sum, coord, axis) => sum + (coord - previous.o[axis]) * previous.n[axis], 0);
          close(signed, face.name === name ? distance : 0);
        }
      }
      const restored = offsetBoredCapIfAdmitted(result, name, -distance);
      assert.deepEqual(restored, source);

      const authored = solid({ ...input, features: [...input.features, { id: 'move', kind: 'offset-face', target: 'h', face: name, distance }] });
      assertNativePlate(authored);
      assert.deepEqual(authored, result);
    });
  }
}

test('translated fractional stock and a large centred bore retain usable cap anchors', () => {
  const translated = solid(plate({ min: [5.25, -8.5], max: [45.25, 21.5], height: 10.5, from: -3.75, center: [16.25, 0.5], radius: 3.125 }));
  const moved = offsetBoredCapIfAdmitted(translated, 'b.top', -2.25);
  assertNativePlate(moved);
  const mass = brepMassProperties(moved, 1);
  close(mass.volume, (1200 - Math.PI * 3.125 ** 2) * 8.25);
  close(mass.centroid[2], 0.375);
  const centred = solid(plate({ center: [20, 15], radius: 14.75 }));
  const { anchor } = boredCapOffsetFrame(centred, 'b.top');
  assert.ok(anchor[0] > 0 && anchor[0] < 40 && anchor[1] > 0 && anchor[1] < 30);
  assert.ok(Math.hypot(anchor[0] - 20, anchor[1] - 15) > 14.75);
  assert.equal(anchor[2], 10);
});

test('bored cap offset refuses collapse, reversal, zero and out-of-range coordinates with the source unchanged', () => {
  const source = freeze(solid(plate())), saved = structuredClone(source);
  for (const distance of [-10, -11, -10 + 1e-8]) {
    for (const face of ['b.top', 'b.bottom']) {
      assert.throws(() => offsetBoredCapIfAdmitted(source, face, distance),
        error => error instanceof BrepError && error.code === 'GEOMETRY' && /reach or cross the opposite cap/.test(error.message));
    }
  }
  assert.throws(() => offsetBoredCapIfAdmitted(source, 'b.top', 10000), /leaves the modeling range/);
  assert.throws(() => offsetBoredCapIfAdmitted(source, 'b.top', Number.MIN_VALUE), /too small/);
  for (const distance of [0, Infinity, NaN]) {
    assert.throws(() => offsetBoredCapIfAdmitted(source, 'b.top', distance),
      error => error instanceof BrepError && error.code === 'INPUT' && /distance/.test(error.message));
  }
  assert.deepEqual(source, saved);
});

test('other topology, a missing face and an altered pcurve cannot enter the bored cap profile', () => {
  const source = solid(plate()), blind = solid(plate({ depth: 4 }));
  const countersunk = solid(plate({ countersink: 10 }));
  const notch = solid(plate({ center: [1, 9] }));
  const malformed = structuredClone(source);
  malformed.coedges[0].pcurve.controlPoints[0][0] += 1e-10;
  for (const input of [blind, countersunk, notch, malformed]) {
    assert.equal(boredCapOffsetFrame(input, 'b.top'), undefined);
    assert.equal(offsetBoredCapIfAdmitted(input, 'b.top', 2), undefined);
  }
  assert.equal(boredCapOffsetFrame(source, 'b.side0'), undefined);
  assert.equal(offsetBoredCapIfAdmitted(source, 'other.top', 2), undefined);
});
