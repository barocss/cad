import assert from 'node:assert/strict';
import test from 'node:test';
import {
  brepMassProperties, CadPartError, checkBrep, curveDomain, evaluateCadPart, evaluateCurve, faceGeometry,
  loadCadPart, massPropertiesOf, measureBrepEdgeContinuity, saveCadPart,
} from '../dist/index.js';

const degrees = Math.PI / 180;
const tolerance = 1e-7;
const add = (a, b) => a.map((x, i) => x + b[i]);
const sub = (a, b) => a.map((x, i) => x - b[i]);
const scale = (a, s) => a.map(x => x * s);
const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);
const near = (a, b, limit = tolerance) => assert.ok(Math.abs(a - b) <= limit, `${a} vs ${b} at tolerance ${limit}`);
const pointNear = (a, b) => near(Math.hypot(...sub(a, b)), 0);

const disk = { id: 's', kind: 'sketch', profile: 'circle', center: [50, -30], radius: 2 };
const document = (path, section = disk, mode = 'exact') => ({
  format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {}, features: [
    section, { id: 'w', kind: 'sweep-curve', sketch: 's', path, mode },
  ],
});

function rail(angle, { join = [0, 0, 0], line = [1, 0, 0], bend = line, inward = [0, 1, 0], length = 10, radius = 20 } = {}) {
  const start = add(join, scale(line, -length));
  const end = add(join, add(scale(bend, radius * Math.sin(angle)), scale(inward, radius * (1 - Math.cos(angle)))));
  return { degree: 2, knots: [-3, -3, -3, 1, 1, 2, 2, 2],
    controlPoints: [start, add(join, scale(line, -length / 2)), join, add(join, scale(bend, radius * Math.tan(angle / 2))), end],
    weights: [1, 1, 1, Math.cos(angle / 2), 1] };
}

const refused = (path, code, detail, section, mode) => assert.throws(() => evaluateCadPart(document(path, section, mode)),
  error => error instanceof CadPartError && error.feature === 'w' && error.code === code && detail.test(error.message));

for (const { angle, r, join, tangent, inward, bendRadius, length } of [
  { angle: 90, r: 2, join: [0, 0, 0], tangent: [1, 0, 0], inward: [0, 1, 0], bendRadius: 20, length: 10 },
  { angle: 30, r: 2, join: [-36.25, 90.5, 23.125], tangent: [0.6, 0.8, 0], inward: [0, 0, 1], bendRadius: 20, length: 10 },
  { angle: 120, r: 8, join: [32, 14, -18], tangent: [0.6, 0.8, 0], inward: [0.8, -0.6, 0], bendRadius: 10, length: 4 },
]) {
  test(`exact line and ${angle}° arc produce one native swept disk with two G1 joint edges`, () => {
    const theta = angle * degrees;
    const path = rail(theta, { join, line: tangent, inward, radius: bendRadius, length });
    const section = { ...disk, radius: r, ...(angle === 120 ? { sideTags: { outer: ['rim'] } } : {}) };
    const snapshot = evaluateCadPart(document(path, section)), [output] = snapshot.outputs;
    const { brep } = output, report = checkBrep(brep, { strict: true });
    assert.equal(snapshot.outputs.length, 1);
    assert.deepEqual(brep.source, { family: 'sweep-curve', id: 'w' });
    assert.equal(output.representation, 'curved');
    assert.ok(report.valid, report.issues.join('\n'));
    assert.equal(report.topology[0].genus, 0);
    assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 6, loops: 6, coedges: 20, edges: 10, vertices: 6 });
    assert.equal(new Set(brep.faces.map(face => face.name)).size, 6);
    const expectedVolume = Math.PI * r ** 2 * (length + bendRadius * theta);
    near(massPropertiesOf(output).volume, expectedVolume, 1e-10 * expectedVolume);
    near(brepMassProperties(brep, 1).volume, expectedVolume, 1e-8 * expectedVolume);

    const planes = brep.faces.map(face => [face, faceGeometry(face)]).filter(([, g]) => g.kind === 'plane');
    assert.deepEqual(planes.map(([face]) => face.name).sort(), ['w.end', 'w.start']);
    const endTangent = add(scale(tangent, Math.cos(theta)), scale(inward, Math.sin(theta)));
    for (const [face, geometry] of planes) {
      const start = face.name === 'w.start', center = path.controlPoints[start ? 0 : 4];
      const normal = start ? scale(tangent, -1) : endTangent;
      pointNear(geometry.n, normal);
      near(dot(sub(center, geometry.o), normal), 0);
      const boundary = brep.coedges.filter(use => face.loops.includes(use.loop));
      assert.equal(boundary.length, 2);
      for (const use of boundary) {
        const { curve } = brep.edges.find(edge => edge.id === use.edge);
        const [lo, hi] = curveDomain(curve);
        for (const t of [0, .18, .5, .77, 1]) near(Math.hypot(...sub(evaluateCurve(curve, lo + (hi - lo) * t), center)), r);
      }
    }

    if (angle === 120) assert.equal(brep.faces.filter(face => face.name.includes('.side[rim]')).length, 4);
    const seams = brep.edges.filter(edge => edge.name?.includes('w.line.') && edge.name.includes('w.bend.'));
    assert.equal(seams.length, 2);
    for (const seam of seams) {
      const [lo, hi] = curveDomain(seam.curve);
      for (const t of [0, .18, .5, .77, 1]) {
        const delta = sub(evaluateCurve(seam.curve, lo + (hi - lo) * t), join);
        near(dot(delta, tangent), 0);
        near(Math.hypot(...delta), r);
      }
      const continuity = measureBrepEdgeContinuity(brep, seam.id, { curvature: true });
      assert.equal(continuity.status, 'measured', JSON.stringify(continuity));
      near(continuity.maximumAngleDegrees, 0);
      assert.equal(continuity.curvature.status, 'measured');
      assert.ok(continuity.curvature.maximumDifference > 1e-3);
      assert.ok(continuity.curvature.maximumDifference <= 1 / (bendRadius - r) + tolerance);
    }
    const reopened = loadCadPart(saveCadPart(snapshot));
    assert.deepEqual(reopened.outputs[0].brep, brep);
  });
}

test('joined native path refuses kinks, backtracking, invalid spans and sections that touch or cross the axis', () => {
  const quarter = rail(90 * degrees);
  refused(rail(90 * degrees, { bend: [0, 0, 1] }), 'GEOMETRY', /common forward tangent/);
  refused(rail(90 * degrees, { bend: [-1, 0, 0] }), 'GEOMETRY', /common forward tangent/);
  refused(rail(90 * degrees, { length: 0 }), 'PARAMETER', /straight segment at least/);
  refused(rail(29 * degrees), 'CAPABILITY', /30° to 120°/);
  refused(rail(121 * degrees), 'CAPABILITY', /30° to 120°/);
  refused({ ...quarter, knots: [0, 0, 0, 1, 1.2, 2, 2, 2] }, 'CAPABILITY', /straight segment followed/);
  refused({ ...quarter, weights: [1, 1, 1, 0.7, 1] }, 'CAPABILITY', /straight segment followed/);
  refused({ ...quarter, weights: [1, 1, 1, Math.SQRT1_2, 1.01] }, 'CAPABILITY', /straight segment followed/);
  const arcFirst = { ...quarter, controlPoints: quarter.controlPoints.toReversed(), weights: quarter.weights.toReversed() };
  refused(arcFirst, 'CAPABILITY', /one open circular arc/);
  refused(quarter, 'CAPABILITY', /without holes/, { ...disk, center: [0, 0], holes: [[{ kind: 'arc', center: [0, 0], start: [1, 0], direction: 'ccw' }]] });
  refused(quarter, 'CAPABILITY', /one circular disk section/, { id: 's', kind: 'sketch', profile: 'rectangle', min: [-1, -1], max: [1, 1] });
  for (const radius of [20, 21]) refused(quarter, 'PARAMETER', /path radius larger/, { ...disk, radius });
  refused(quarter, 'CAPABILITY', /one open straight segment/, disk, 'exact-straight');
});

test('the independently recognized straight and circular sweeps keep their native caps and volume', () => {
  const path = rail(90 * degrees);
  const span = (from, to) => ({ ...path, knots: [0, 0, 0, 1, 1, 1],
    controlPoints: path.controlPoints.slice(from, to), weights: path.weights.slice(from, to) });
  for (const [section, mode, length] of [[span(0, 3), 'exact-straight', 10], [span(2, 5), 'exact', 10 * Math.PI]]) {
    const [output] = evaluateCadPart(document(section, disk, mode)).outputs;
    assert.ok(checkBrep(output.brep, { strict: true }).valid);
    assert.deepEqual(output.brep.faces.filter(face => faceGeometry(face).kind === 'plane').map(face => face.name).sort(), ['w.end', 'w.start']);
    assert.equal(output.brep.faces.length, 4);
    near(massPropertiesOf(output).volume, Math.PI * 4 * length);
  }
});
