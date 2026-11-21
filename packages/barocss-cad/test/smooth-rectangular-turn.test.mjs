import assert from 'node:assert/strict';
import test from 'node:test';
import { checkBrep, evaluateCurve, evaluateCurveD1, evaluateSurfaceD2, validateSurface } from '../dist/index.js';
import { loftSolid } from '../dist/features/loft.js';

const corners = [[-6, -4], [6, -4], [6, 4], [-6, 4]];
const centre = [13, -8], z0 = 3, height = 40;

function station(angle, t) {
  const c = Math.cos(angle * t), s = Math.sin(angle * t);
  return {
    z: z0 + height * t,
    profile: corners.map(([x, y]) => ({ kind: 'line', start: [centre[0] + c*x - s*y, centre[1] + s*x + c*y] })),
  };
}

function sectionsFor(degrees) {
  const spans = Math.max(6, Math.ceil(Math.abs(degrees) / 30)), angle = degrees * Math.PI / 180;
  return Array.from({ length: spans + 1 }, (_, index) => station(angle, index / spans));
}
const build = sections => loftSolid({ id: 'turn', name: 'turn', smooth: true, sections });
const areaOf = points => points.reduce((sum, point, index) => {
  const next = points[(index + 1) % 4];
  return sum + (point[0] * next[1] - point[1] * next[0]) / 2;
}, 0);

function independentVolume(rails) {
  const knots = [...new Set(rails[0].knots)];
  const points = [-0.8611363115940526, -0.3399810435848563, 0.3399810435848563, 0.8611363115940526];
  const weights = [0.3478548451374538, 0.6521451548625461, 0.6521451548625461, 0.3478548451374538];
  // Each slice area is a degree-six polynomial between successive cubic knots.
  return knots.slice(1).reduce((volume, upper, index) => {
    const lower = knots[index], half = (upper - lower) / 2, middle = (lower + upper) / 2;
    const area = points.reduce((sum, x, i) =>
      sum + weights[i] * areaOf(rails.map(rail => evaluateCurve(rail, middle + half * x))), 0);
    return volume + height * half * area;
  }, 0);
}

test('smooth rectangular turns retain signed corners, full-height continuous sides and native size', () => {
  for (const degrees of [360, -360, 450, -450]) {
    const sections = sectionsFor(degrees), angle = degrees * Math.PI / 180;
    const { brep, mass } = build(sections);
    assert.equal(checkBrep(brep, { strict: true }).valid, true);
    assert.deepEqual([brep.bodies.length, brep.bodies[0].kind, brep.shells[0].closed, brep.faces.length, brep.edges.length],
      [1, 'solid', true, 6, 12]);
    const rails = brep.edges.filter(edge => edge.id.startsWith('c')).map(edge => edge.curve);
    assert.equal(rails.length, 4);
    assert.equal(rails[0].controlPoints.length, sections.length);
    for (const rail of rails) {
      const { degree, knots } = rail;
      assert.equal(degree, 3);
      const interior = knots.slice(4, -4);
      assert.ok(interior.every((knot, i) => i === 0 || knot > interior[i - 1]));
      for (const knot of interior) {
        const lo = evaluateCurveD1(rail, knot - 1e-8).derivative, hi = evaluateCurveD1(rail, knot + 1e-8).derivative;
        assert.ok(Math.hypot(...lo.map((value, axis) => value - hi[axis])) < 2e-5);
      }
    }
    let maxDeviation = 0, maxAreaError = 0;
    const samples = 360;
    for (let i = 0; i <= samples; i++) {
      const t = i / samples, expected = station(angle, t);
      const evaluated = rails.map(rail => evaluateCurveD1(rail, t));
      for (const [edge, { point, derivative }] of evaluated.entries()) {
        const [x, y] = expected.profile[edge].start;
        maxDeviation = Math.max(maxDeviation, Math.hypot(point[0] - x, point[1] - y));
        assert.ok(Math.abs(point[2] - expected.z) < 1e-9 && Math.abs(derivative[2] - height) < 1e-8);
        const rotation = (point[0] - centre[0]) * derivative[1] - (point[1] - centre[1]) * derivative[0];
        assert.ok(rotation * Math.sign(degrees) > 0);
      }
      maxAreaError = Math.max(maxAreaError, Math.abs(areaOf(evaluated.map(entry => entry.point)) - 96));
    }
    assert.ok(maxDeviation < 0.016, JSON.stringify({ degrees, maxDeviation }));
    assert.ok(maxAreaError < 0.39, JSON.stringify({ degrees, maxAreaError }));
    const independent = independentVolume(rails);
    assert.ok(Math.abs(independent - mass(1).volume) < 1e-6, JSON.stringify({ degrees, independent, native: mass(1).volume }));
  }
});

test('compact smooth turn admission preserves the native cap for other long profiles', () => {
  const skew = sectionsFor(360), unequalHeight = sectionsFor(360), alternate = sectionsFor(360);
  skew[1].profile[1].start[0] += 0.2;
  unequalHeight[1].z += 0.2;
  alternate[1] = { ...station(Math.PI / 8, 1), z: alternate[1].z };
  for (const sections of [skew, unequalHeight, alternate]) {
    const side = build(sections).brep.faces.find(face => face.name === 'turn.side0')?.surface;
    assert.ok(side);
    assert.throws(() => validateSurface(side), /Surface V control point count/);
  }
});

const offsetRectangle = [[14, -4], [26, -4], [26, 4], [14, 4]];

function externalStations(degrees, profile = offsetRectangle, pivot = [0, 0]) {
  const spans = Math.max(6, Math.ceil(Math.abs(degrees) / 30));
  return Array.from({ length: spans + 1 }, (_, i) => {
    const t = i / spans, a = degrees * Math.PI * t / 180, c = Math.cos(a), s = Math.sin(a);
    return { z: height * t, profile: profile.map(([x, y]) => {
      const u = x - pivot[0], v = y - pivot[1];
      return { kind: 'line', start: [pivot[0] + c * u - s * v, pivot[1] + s * u + c * v] };
    }) };
  });
}

function lineArcStations(degrees, centreX = 12, arcDegrees = 120) {
  const half = arcDegrees * Math.PI / 360;
  const chordX = centreX + 3 * Math.cos(half), chordY = 3 * Math.sin(half);
  return Array.from({ length: 13 }, (_, i) => {
    const t = i / 12, a = degrees * Math.PI / 180 * t;
    const c = Math.cos(a), s = Math.sin(a);
    const spin = (x, y) => [c * x - s * y, s * x + c * y];
    return { z: height * t, profile: [
      { kind: 'line', start: spin(chordX, chordY) },
      { kind: 'arc', start: spin(chordX, -chordY), center: spin(centreX, 0), direction: 'ccw' },
    ] };
  });
}

test('compact line-and-arc Screws keep a circular section, paired wall tangents and signed winding', () => {
  // Integrate the squared magnitude of the cubic interpolation of 13 unit rotation
  // samples, with independent piecewise polynomial quadrature. The segment area
  // is r²/2 times (angle - sin(angle)).
  const arcAngle = 2 * Math.PI / 3;
  const area = 9 / 2 * (arcAngle - Math.sin(arcAngle));
  const expectedVolume = area * height * 1.000128624606465;
  const gap = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
  const unit = vector => vector.map(v => v / Math.hypot(...vector));
  for (const degrees of [360, -360]) {
    const { brep, mass } = build(lineArcStations(degrees));
    const check = checkBrep(brep, { strict: true });
    assert.ok(check.valid, JSON.stringify(check.issues));
    assert.deepEqual([brep.bodies.length, brep.shells[0].closed, brep.faces.length, brep.edges.length,
      brep.vertices.length, brep.coedges.length], [1, true, 5, 9, 6, 18]);
    const walls = brep.faces.map(face => face.surface).filter(surface => surface.degreeV === 3);
    const arcs = walls.filter(surface => surface.degreeU === 2);
    assert.equal(arcs.length, 2);
    assert.equal(walls.length, 3);
    for (const wall of walls) {
      validateSurface(wall);
      assert.equal(wall.controlPoints[0].length, 13);
      assert.deepEqual(wall.knotsV, walls[0].knotsV);
    }
    const [first, second] = arcs.map(surface => (u, v) => evaluateSurfaceD2(surface, u, v));
    for (let i = 0; i <= 120; i++) {
      const t = i / 120;
      const left = first(1, t), right = second(0, t);
      assert.ok(gap(left.point, right.point) < 1e-9);
      assert.ok(gap(unit(left.du), unit(right.du)) < 1e-9);
      assert.ok(gap(left.dv, right.dv) < 1e-9);
      assert.ok(Math.sign(degrees) * (left.point[0] * left.dv[1] - left.point[1] * left.dv[0]) > 0);
      // The arc midpoint starts at [15, 0]. Its current radial vector gives the
      // common similarity transform for the circle centre and radius.
      const centre = [left.point[0] * 12 / 15, left.point[1] * 12 / 15, left.point[2]];
      const radius = Math.hypot(left.point[0], left.point[1]) / 5;
      for (const side of [first, second]) for (const u of [0, .3, .7, 1]) {
        const { point } = side(u, t);
        assert.ok(Math.abs(gap(point, centre) - radius) < 1e-9);
        assert.ok(Math.abs(point[2] - height * t) < 1e-9);
      }
    }
    assert.ok(Math.abs(mass(1).volume - expectedVolume) < 1e-7,
      JSON.stringify({ degrees, volume: mass(1).volume, expectedVolume }));
  }
});

test('both longitudinal rails have distinct native names when the circular arc is not split', () => {
  for (const degrees of [360, -360]) {
    const { brep } = build(lineArcStations(degrees, 12, 60));
    const check = checkBrep(brep, { strict: true });
    assert.ok(check.valid, JSON.stringify(check.issues));
    const rails = brep.edges.filter(edge => /^c[01]$/.test(edge.id));
    assert.equal(brep.faces.length, 4);
    assert.equal(rails.length, 2);
    assert.ok(rails.every(edge => edge.name));
    assert.notEqual(rails[0].name, rails[1].name);
  }
});

test('compact line-and-arc admission leaves irregular curved lofts outside the native pole limit', () => {
  // With this centre the axis pierces the circular segment (the chord is at x=-0.5).
  const interior = lineArcStations(360, -2);
  const irregularHeight = lineArcStations(360);
  irregularHeight[1].z += 0.2;
  const irregularRotation = lineArcStations(360);
  irregularRotation[1].profile = lineArcStations(355)[1].profile;
  const irregularArc = lineArcStations(360);
  irregularArc[1].profile[1].center = [12.1 * Math.cos(Math.PI / 6), 12.1 * Math.sin(Math.PI / 6)];
  for (const sections of [interior, irregularHeight, irregularRotation, irregularArc]) {
    const surface = build(sections).brep.faces.find(face => face.surface.degreeV === 3)?.surface;
    assert.ok(surface);
    assert.throws(() => validateSurface(surface), /Surface V control point count/);
  }
});

test('external-origin smooth Screw uses continuous rails of the same signed section law', () => {
  // D1544 integrates the common cubic rotation factor independently. The section areas
  // scale from 21 to 96 mm². The offset from the axis translates a section within its plane.
  const references = { 180: 840.4060323005599 * 96 / 21, 360: 840.1080446694306 * 96 / 21 };
  for (const angle of [180, -180, 360, -360]) {
    const sections = externalStations(angle);
    const { brep, mass } = build(sections);
    const check = checkBrep(brep, { strict: true });
    assert.ok(check.valid, JSON.stringify(check.issues));
    assert.deepEqual([brep.bodies.length, brep.shells[0].closed, brep.faces.length, brep.edges.length, brep.vertices.length],
      [1, true, 6, 12, 8]);
    const rails = brep.edges.filter(edge => /^c[0-3]$/.test(edge.id)).map(edge => edge.curve);
    assert.equal(rails.length, 4);
    for (const [corner, rail] of rails.entries()) {
      assert.deepEqual([rail.degree, rail.controlPoints.length, rail.knots], [3, sections.length, rails[0].knots]);
      assert.equal(new Set(rail.knots.slice(4, -4)).size, sections.length - 4);
      for (const [i, { z, profile }] of sections.entries())
        assert.ok(Math.hypot(...evaluateCurve(rail, i / (sections.length - 1))
          .map((value, k) => value - [...profile[corner].start, z][k])) < 1e-8);
      for (let i = 0; i <= 360; i++) {
        const t = i / 360, { point: p, derivative: d } = evaluateCurveD1(rail, t);
        assert.ok(Math.abs(p[2] - height * t) < 1e-9 && Math.abs(d[2] - height) < 1e-8);
        assert.ok(Math.sign(p[0] * d[1] - p[1] * d[0]) === Math.sign(angle));
      }
    }
    assert.ok(Math.abs(mass(1).volume - references[Math.abs(angle)]) < 1e-7);
    assert.ok(Math.abs(mass(1).volume - independentVolume(rails)) < 1e-7);
  }
});

test('the external compact fit refuses other pivots, axis contact and inexact station rotations', () => {
  const wrongAxis = externalStations(180, offsetRectangle, [1, 0]);
  const touches = externalStations(180, [[0, -4], [12, -4], [12, 4], [0, 4]]);
  const straddles = externalStations(180, [[-2, -1], [10, -1], [10, 7], [-2, 7]]);
  const translated = externalStations(180), uneven = externalStations(180);
  for (const line of translated[2].profile) line.start[0] += 0.01;
  uneven[2].z += 0.1;
  for (const sections of [wrongAxis, touches, straddles, translated, uneven]) {
    assert.throws(() => {
      const face = build(sections).brep.faces.find(face => face.name === 'turn.side0');
      validateSurface(face.surface);
    }, /Surface V control point count/);
  }
});
