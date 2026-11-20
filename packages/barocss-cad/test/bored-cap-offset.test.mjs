import assert from 'node:assert/strict';
import test from 'node:test';
import { BrepError, checkBrep, createCylindricalBoreCheck, evaluateCadPart, evaluateCurve, evaluateSurface, faceGeometry } from '../dist/index.js';
import { brepMassProperties } from '../dist/brep/solid-mass.js';
import {
  annularCapReplacementFrame, boredCapOffsetFrame, boredCapReplacementFrame, circularCapReplacementFrame,
  offsetBoredCapIfAdmitted, replaceAnnularCapIfAdmitted, replaceBoredCapIfAdmitted, replaceCircularCapIfAdmitted,
} from '../dist/features/bored-cap-offset.js';

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
  return report;
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

// First and second area moments of the rectangle minus the off-centre disk.
const retainedX = 24000 - 99 * Math.PI, retainedY = 18000 - 81 * Math.PI;
const retainedXX = 640000 - 9 * Math.PI * (121 + 9 / 4);
const retainedYY = 360000 - 9 * Math.PI * (81 + 9 / 4);
const retainedXY = 360000 - 891 * Math.PI;
const tiltedVolume = 15600 - 981 * Math.PI / 10;
const tiltedCentroid = [
  (8 * retainedX + retainedXX / 10 + retainedXY / 5) / tiltedVolume,
  (8 * retainedY + retainedXY / 10 + retainedYY / 5) / tiltedVolume,
  (64 * area + 8 * retainedX / 5 + 16 * retainedY / 5 + retainedXX / 100 + (retainedXY + retainedYY) / 25) / (2 * tiltedVolume),
];
const incidence = brep => ({
  bodies: brep.bodies, shells: brep.shells, loops: brep.loops,
  faces: brep.faces.map(({ surface, ...f }) => [f, surface.id]),
  vertices: brep.vertices.map(({ point, ...v }) => v),
  edges: brep.edges.map(({ curve, ...e }) => [e, curve.id]),
  coedges: brep.coedges.map(({ pcurve, ...c }) => [c, pcurve?.id]),
});

const cylinder = () => ({ format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {}, features: [
  { id: 's', kind: 'sketch', profile: 'circle', center: [14, 12], radius: 8 },
  { id: 'c', kind: 'extrude', sketch: 's', height: 10 },
] });
const tube = (center = [14, 12]) => {
  const doc = cylinder();
  doc.features[0].radius = 12;
  doc.features.push({ id: 'h', kind: 'hole', target: 'c', face: 'c.top', center, radius: 4 });
  return doc;
};

const twoBorePlate = () => {
  const doc = plate();
  doc.features.push({ id: 'j', kind: 'hole', target: 'h', center: [27, 20], radius: 2, face: 'b.top' });
  return doc;
};

for (const sign of [1, -1]) {
  const face = sign === 1 ? 'b.top' : 'b.bottom', fixedZ = sign === 1 ? 0 : 10;
  test(`replace ${face} of a native two-bore plate with both exact trim rings intact`, () => {
    const doc = twoBorePlate(), source = freeze(solid(doc)), before = structuredClone(source);
    const height = (x, y) => fixedZ + sign * (8 + x / 10 + y / 5);
    const plane = { origin: [0, 0, height(0, 0)], normal: [-1, -2, 10 * sign] };
    const frame = boredCapReplacementFrame(source, face);
    assert.deepEqual(frame.normal, [0, 0, sign]);
    const [ax, ay, az] = frame.anchor;
    close(az, 10 - fixedZ);
    const bores = [[11, 9, 3], [27, 20, 2]];
    assert.ok(ax > 0 && ax < 40 && ay > 0 && ay < 30);
    for (const [x, y, radius] of bores) assert.ok(Math.hypot(ax - x, ay - y) > radius);

    const result = replaceBoredCapIfAdmitted(source, face, plane);
    const report = checkBrep(result, { strict: true });
    assert.ok(report.valid, report.issues.join('\n'));
    assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 10, loops: 14, coedges: 48, edges: 24, vertices: 16 });
    assert.equal(report.topology[0].genus, 2);
    assert.ok(report.maximumPcurveGap < 1e-9 && report.maximumEdgeSurfaceGap < 1e-9);
    assert.deepEqual(incidence(result), incidence(source));
    const moving = result.faces.find(candidate => candidate.name === face);
    const innerRims = result.loops.filter(loop => moving.loops.includes(loop.id) && loop.kind === 'inner');
    assert.equal(innerRims.length, 2);
    const walls = result.faces.filter(candidate => faceGeometry(candidate).kind === 'cylinder');
    assert.equal(walls.length, 4);
    const readBore = createCylindricalBoreCheck(result), boreHalves = [];
    for (const [cx, cy, radius] of bores) {
      const halves = walls.filter(candidate => {
        const g = faceGeometry(candidate);
        return Math.hypot(g.c[0] - cx, g.c[1] - cy) < 1e-9;
      });
      assert.equal(halves.length, 2);
      boreHalves.push(halves);
      for (const half of halves) {
        const g = faceGeometry(half);
        close(g.r, radius);
        assert.deepEqual([g.a, g.out], [[0, 0, 1], -1]);
      }
      close(readBore(halves), 2 * radius);
      close(readBore([...halves].reverse()), 2 * radius);
      assert.equal(readBore(halves.slice(0, 1)), undefined);
      const rings = innerRims.filter(loop => loop.coedges.every(id => {
        const use = result.coedges.find(candidate => candidate.id === id);
        const { curve } = result.edges.find(edge => edge.id === use.edge);
        return Array.from({ length: 33 }, (_, index) => evaluateCurve(curve, index / 32))
          .every(([x, y, z]) => Math.abs(Math.hypot(x - cx, y - cy) - radius) < 1e-9 && Math.abs(z - height(x, y)) < 1e-9);
      }));
      assert.equal(rings.length, 1);
      assert.equal(rings[0].coedges.length, 2);
    }
    assert.equal(readBore([boreHalves[0][0], boreHalves[1][0]]), undefined);
    assert.equal(readBore(walls), undefined);
    const broken = structuredClone(result), other = boreHalves[1][0];
    const otherLoop = broken.loops.find(loop => loop.id === other.loops[0]);
    const brokenUse = broken.coedges.find(use => use.id === otherLoop.coedges[0]);
    delete brokenUse.twin;
    const survivingHalves = boreHalves[0].map(half => broken.faces.find(candidate => candidate.id === half.id));
    assert.equal(createCylindricalBoreCheck(broken)(survivingHalves), undefined);
    close(brepMassProperties(result, 1).volume, 15600 - 156.9 * Math.PI, 1e-6);
    const change = { id: 'replace', kind: 'replace-face', target: 'j', face, plane };
    assert.deepEqual(solid({ ...doc, features: [...doc.features, change] }), result);
    assert.throws(() => replaceBoredCapIfAdmitted(source, face, { ...plane, origin: [0, 0, fixedZ] }), /opposite cap at one corner/);
    assert.equal(boredCapOffsetFrame(source, face), undefined);
    assert.equal(offsetBoredCapIfAdmitted(source, face, 1), undefined);
    assert.deepEqual(source, before);
  });
}

test('a rectangular plate with three straight bores stays outside the two-bore replacement', () => {
  const doc = twoBorePlate();
  doc.features.push({ id: 'k', kind: 'hole', target: 'j', center: [8, 23], radius: 2, face: 'b.top' });
  const source = solid(doc);
  assert.equal(checkBrep(source, { strict: true }).topology[0].genus, 3);
  assert.equal(boredCapReplacementFrame(source, 'b.top'), undefined);
  assert.equal(replaceBoredCapIfAdmitted(source, 'b.top', { origin: [0, 0, 8], normal: [-1, -2, 10] }), undefined);
});

for (const [boreX, sign] of [[14, 1], [14, -1], [16, 1], [16, -1]]) {
  const face = sign === 1 ? 'c.top' : 'c.bottom', fixedZ = sign === 1 ? 0 : 10;
  test(`replace ${face} of a tube with bore X=${boreX} and authenticate its retained diameter`, () => {
    const doc = tube([boreX, 12]), source = freeze(solid(doc)), before = structuredClone(source);
    const height = (x, y) => fixedZ + sign * (8 + x / 10 + y / 5);
    const plane = { origin: [0, 0, height(0, 0)], normal: [-1, -2, 10 * sign] };
    const frame = annularCapReplacementFrame(source, face);
    assert.deepEqual(frame.normal, [0, 0, sign]);
    assert.ok(Math.hypot(frame.anchor[0] - boreX, frame.anchor[1] - 12) > 4);
    assert.ok(Math.hypot(frame.anchor[0] - 14, frame.anchor[1] - 12) < 12);
    const result = replaceAnnularCapIfAdmitted(source, face, plane);
    const report = checkBrep(result, { strict: true });
    assert.ok(report.valid, report.issues.join('\n'));
    assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 6, loops: 8, coedges: 24, edges: 12, vertices: 8 });
    assert.equal(report.topology[0].genus, 1);
    assert.deepEqual(incidence(result), incidence(source));
    assert.ok(report.maximumPcurveGap < 1e-9 && report.maximumEdgeSurfaceGap < 1e-9);

    const caps = result.faces.find(candidate => candidate.name === face);
    for (const loopId of caps.loops) {
      const loop = result.loops.find(candidate => candidate.id === loopId), inner = loop.kind === 'inner';
      const radius = inner ? 4 : 12, centerX = inner ? boreX : 14;
      assert.equal(loop.coedges.length, 2);
      for (const id of loop.coedges) {
        const use = result.coedges.find(coedge => coedge.id === id);
        const { curve } = result.edges.find(edge => edge.id === use.edge);
        for (let i = 0; i <= 32; i++) {
          const [x, y, z] = evaluateCurve(curve, i / 32);
          close(Math.hypot(x - centerX, y - 12), radius);
          close(z, height(x, y));
        }
      }
    }
    const halves = result.faces.filter(candidate => faceGeometry(candidate).kind === 'cylinder');
    const inward = halves.filter(candidate => faceGeometry(candidate).out === -1);
    const outward = halves.filter(candidate => faceGeometry(candidate).out === 1);
    assert.equal(inward.length, 2);
    assert.equal(outward.length, 2);
    for (const candidate of halves) {
      const { r, c, a, out } = faceGeometry(candidate);
      close(r, out === -1 ? 4 : 12);
      close(c[0], out === -1 ? boreX : 14);
      close(c[1], 12);
      close(Math.abs(a[2]), 1);
    }
    const verifyBore = createCylindricalBoreCheck(result);
    close(verifyBore(inward), 8);
    close(verifyBore([...inward].reverse()), 8);
    assert.equal(verifyBore(inward.slice(0, 1)), undefined);
    assert.equal(verifyBore(outward), undefined);
    assert.equal(verifyBore([inward[0], outward[0]]), undefined);

    const areaCenterX = (144 * 14 - 16 * boreX) / 128;
    const varianceX = (144 * (14 ** 2 + 36) - 16 * (boreX ** 2 + 4)) / 128 - areaCenterX ** 2;
    const h = 8 + areaCenterX / 10 + 12 / 5, volume = 128 * Math.PI * h;
    const mass = brepMassProperties(result, 1);
    close(mass.volume, volume, volume * 1e-9);
    close(mass.centroid[0], areaCenterX + varianceX / (10 * h), 1e-8);
    close(mass.centroid[1], 12 + 8 / h, 1e-8);
    close(mass.centroid[2], fixedZ + sign * (h ** 2 + varianceX / 100 + 40 / 25) / (2 * h), 1e-8);
    const change = { id: 'replace', kind: 'replace-face', target: 'h', face, plane };
    assert.deepEqual(solid({ ...doc, features: [...doc.features, change] }), result);
    const contact = height(0, 0) - sign * (11.8 - 12 * Math.hypot(0.1, 0.2));
    assert.throws(() => replaceAnnularCapIfAdmitted(source, face, { ...plane, origin: [0, 0, contact] }), /opposite cap on the outer circular rim/);
    assert.deepEqual(source, before);
  });
}

test('an eccentric tube keeps its exact diameter close to outer rim contact', () => {
  const source = solid(tube([16, 12])), plane = { origin: [14, 12, 2.75], normal: [-1, -2, 10] };
  const result = replaceAnnularCapIfAdmitted(source, 'c.top', plane);
  assert.ok(checkBrep(result, { strict: true }).valid);
  const inward = result.faces.filter(candidate => {
    const geometry = faceGeometry(candidate);
    return geometry.kind === 'cylinder' && geometry.out === -1;
  });
  close(createCylindricalBoreCheck(result)(inward), 8);
  const volume = 348.8 * Math.PI;
  close(brepMassProperties(result, 1).volume, volume, volume * 1e-9);
});

for (const sign of [1, -1]) {
  const face = sign === 1 ? 'c.top' : 'c.bottom', fixedZ = sign === 1 ? 0 : 10;
  test(`replace ${face} with an exact ellipse and retain the outward cylinder`, () => {
    const doc = cylinder(), source = freeze(solid(doc)), before = structuredClone(source);
    const height = (x, y) => fixedZ + sign * (8 + x / 10 + y / 5);
    const plane = { origin: [0, 0, height(0, 0)], normal: [-1, -2, 10 * sign] };
    const frame = circularCapReplacementFrame(source, face);
    assert.deepEqual(frame.normal, [0, 0, sign]);
    close(frame.anchor[0], 14);
    close(frame.anchor[1], 12);
    const result = replaceCircularCapIfAdmitted(source, face, plane);
    const report = checkBrep(result, { strict: true });
    assert.ok(report.valid, report.issues.join('\n'));
    assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 4, loops: 4, coedges: 12, edges: 6, vertices: 4 });
    assert.equal(report.topology[0].genus, 0);
    assert.deepEqual(incidence(result), incidence(source));
    assert.ok(report.maximumEdgeSurfaceGap < 1e-9 && report.maximumPcurveGap < 1e-9);

    const opposite = sign === 1 ? 'c.bottom' : 'c.top';
    assert.equal(result.faces.find(candidate => candidate.name === opposite), source.faces.find(candidate => candidate.name === opposite));
    const outer = result.faces.map(face => faceGeometry(face)).filter(support => support.kind === 'cylinder');
    assert.equal(outer.length, 2);
    for (const { r, c, a, out } of outer) {
      close(r, 8);
      close(c[0], 14);
      close(c[1], 12);
      close(Math.abs(a[2]), 1);
      assert.equal(out, 1);
    }
    assert.equal(createCylindricalBoreCheck(result)(result.faces.filter(candidate => faceGeometry(candidate).kind === 'cylinder')), undefined);
    const cap = result.faces.find(candidate => candidate.name === face);
    const loop = result.loops.find(loop => cap.loops.includes(loop.id));
    assert.equal(loop.coedges.length, 2);
    for (const id of loop.coedges) {
      const use = result.coedges.find(coedge => coedge.id === id);
      const { curve } = result.edges.find(edge => edge.id === use.edge);
      for (let i = 0; i <= 32; i++) {
        const [x, y, z] = evaluateCurve(curve, i / 32);
        close(Math.hypot(x - 14, y - 12), 8);
        close(z, height(x, y));
      }
    }
    const mass = brepMassProperties(result, 1), h = 11.8;
    close(mass.volume, 755.2 * Math.PI, 1e-7);
    close(mass.centroid[0], 14 + 1.6 / h, 1e-8);
    close(mass.centroid[1], 12 + 3.2 / h, 1e-8);
    close(mass.centroid[2], fixedZ + sign * (h ** 2 + 16 * 0.05) / (2 * h), 1e-8);
    const feature = { id: 'replace', kind: 'replace-face', target: 'c', face, plane };
    assert.deepEqual(solid({ ...doc, features: [...doc.features, feature] }), result);
    for (const penetration of [0, 0.1]) {
      const contact = height(0, 0) - sign * (h - 8 * Math.hypot(0.1, 0.2) + penetration);
      assert.throws(() => replaceCircularCapIfAdmitted(source, face, { ...plane, origin: [0, 0, contact] }), /opposite cap on the circular rim/);
    }
    const thin = replaceCircularCapIfAdmitted(source, face, { ...plane, origin: [0, 0, fixedZ - sign * 1.8] });
    assert.ok(checkBrep(thin, { strict: true }).valid);
    close(brepMassProperties(thin, 1).volume, 128 * Math.PI, 1e-7);
    assert.throws(() => replaceCircularCapIfAdmitted(source, face, { ...plane, normal: [0, 0, 1] }), /tilt is too small/);
    assert.throws(() => replaceCircularCapIfAdmitted(source, face, { ...plane, normal: [1, 0, 0] }), /perpendicular/);
    assert.deepEqual(source, before);
  });
}

for (const [name, sign] of [['b.top', 1], ['b.bottom', -1]]) {
  test(`replace the drilled plate ${name} with a tilted plane and preserve the exact bore`, () => {
    const input = plate(), source = freeze(solid(input)), saved = structuredClone(source);
    const movingZ = sign === 1 ? 10 : 0, fixedZ = 10 - movingZ;
    const height = ([x, y]) => fixedZ + sign * (8 + x / 10 + y / 5);
    const plane = { origin: [0, 0, height([0, 0])], normal: [-1, -2, 10 * sign] };
    assert.deepEqual(boredCapReplacementFrame(source, name).normal, [0, 0, sign]);
    const result = replaceBoredCapIfAdmitted(source, name, plane);
    const report = assertNativePlate(result);
    assert.deepEqual(incidence(result), incidence(source));
    close(report.maximumEdgeSurfaceGap, 0);
    for (const [i, { point: [x, y, z] }] of source.vertices.entries())
      result.vertices[i].point.forEach((coord, axis) => close(coord, [x, y, z === movingZ ? height([x, y]) : z][axis]));

    const opposite = sign === 1 ? 'b.bottom' : 'b.top';
    assert.equal(result.faces.find(face => face.name === opposite), source.faces.find(face => face.name === opposite));
    for (const original of source.faces) {
      if (original.name === name) continue;
      const before = faceGeometry(original), current = result.faces.find(face => face.id === original.id);
      if (before.kind === 'cylinder') {
        const after = faceGeometry(current);
        assert.equal(after.kind, 'cylinder');
        close(after.r, 3);
        close(after.c[0], 11);
        close(after.c[1], 9);
        close(Math.abs(after.a[2]), 1);
        assert.equal(after.out, -1);
        for (let i = 0; i <= 16; i++) for (const v of [0, 0.25, 0.5, 1]) {
          const [x, y] = evaluateSurface(current.surface, i / 16, v);
          close(Math.hypot(x - 11, y - 9), 3);
        }
      } else {
        const after = faceGeometry(current);
        assert.equal(after.kind, 'plane');
        after.n.forEach((value, i) => close(value, before.n[i]));
        close(after.o.reduce((sum, value, i) => sum + (value - before.o[i]) * before.n[i], 0), 0);
      }
    }
    const cap = result.faces.find(face => face.name === name);
    const innerLoop = result.loops.find(loop => cap.loops.includes(loop.id) && loop.kind === 'inner');
    assert.equal(innerLoop.coedges.length, 2);
    for (const id of innerLoop.coedges) {
      const use = result.coedges.find(coedge => coedge.id === id);
      const { curve } = result.edges.find(edge => edge.id === use.edge);
      for (let i = 0; i <= 32; i++) {
        const sample = evaluateCurve(curve, i / 32);
        close(Math.hypot(sample[0] - 11, sample[1] - 9), 3);
        close(sample[2], height(sample));
      }
    }
    const mass = brepMassProperties(result, 1);
    close(mass.volume, tiltedVolume, 1e-7);
    mass.centroid.forEach((value, axis) => close(value, axis === 2 && sign === -1 ? 10 - tiltedCentroid[axis] : tiltedCentroid[axis], 1e-8));
    const halves = result.faces.filter(face => faceGeometry(face).kind === 'cylinder');
    const readDiameter = createCylindricalBoreCheck(result);
    close(readDiameter(halves), 6);
    close(readDiameter([...halves].reverse()), 6);
    assert.equal(readDiameter(halves.slice(0, 1)), undefined);
    assert.equal(readDiameter([halves[0], halves[0]]), undefined);
    assert.equal(readDiameter(halves.map(face => ({ ...face }))), undefined);
    const broken = structuredClone(result);
    const rim = broken.coedges.find(use => use.pcurve?.degree === 3);
    rim.pcurve.controlPoints[0][1] += 0.02;
    assert.equal(createCylindricalBoreCheck(broken)(broken.faces.filter(face => halves.some(half => half.id === face.id))), undefined);
    const feature = { id: 'replace', kind: 'replace-face', target: 'h', face: name, plane };
    assert.deepEqual(solid({ ...input, features: [...input.features, feature] }), result);
    assert.throws(() => replaceBoredCapIfAdmitted(source, name, { ...plane, origin: [0, 0, fixedZ] }), /reach or cross the opposite cap/);
    assert.deepEqual(source, saved);
  });
}

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
