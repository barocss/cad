import assert from 'node:assert/strict';
import test from 'node:test';
import {
  brepMassProperties, CadPartError, checkBrep, curveDomain, evaluateCadPart, evaluateCurve, evaluateSurface, faceGeometry,
  joinCurves, loadCadPart, massPropertiesOf, measureBrepEdgeContinuity, saveCadPart,
} from '../dist/index.js';

const add = (a, b) => a.map((x, i) => x + b[i]);
const scale = (a, s) => a.map(x => s * x);
const sub = (a, b) => add(a, scale(b, -1));
const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const near = (a, b, tolerance = 1e-8) => assert.ok(Math.abs(a - b) <= tolerance, `${a} vs ${b} at tolerance ${tolerance}`);
const pointNear = (a, b) => near(Math.hypot(...sub(a, b)), 0);

const section = { id: 's', kind: 'sketch', profile: 'rectangle', min: [48, -33], max: [52, -27] };
const document = ({ degree, knots, controlPoints, weights }, sketch = section) => ({
  format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {}, features: [
    sketch, { kind: 'sweep-curve', id: 'w', sketch: 's', mode: 'exact', path: { degree, knots, controlPoints, weights } },
  ],
});
const span = (id, controlPoints, weight = 1) => ({
  kind: 'curve', id, degree: 2, controlPoints, weights: [1, weight, 1], knots: [0, 0, 0, 1, 1, 1],
});

function elbow({ degrees = 90, radius = 20, lead = 10, tail = 14,
  entry = [0, 0, 0], tangent = [1, 0, 0], inward = [0, 1, 0] } = {}) {
  const angle = degrees * Math.PI / 180;
  const exit = add(entry, add(scale(tangent, radius * Math.sin(angle)), scale(inward, radius * (1 - Math.cos(angle)))));
  const terminal = add(scale(tangent, Math.cos(angle)), scale(inward, Math.sin(angle)));
  const start = add(entry, scale(tangent, -lead)), end = add(exit, scale(terminal, tail));
  const line = span('lead', [start, add(entry, scale(tangent, -lead / 2)), entry]);
  const bend = span('bend', [entry, add(entry, scale(tangent, radius * Math.tan(angle / 2))), exit], Math.cos(angle / 2));
  const last = span('tail', [exit, add(exit, scale(terminal, tail / 2)), end]);
  const lineArc = joinCurves(line, bend, { curveId: 'lineArc' }).curve;
  const path = joinCurves(lineArc, last, { curveId: 'elbow' }).curve;
  return { path, start, entry, exit, end, tangent, terminal, inward, exitInward: cross(cross(tangent, inward), terminal),
    axis: cross(tangent, inward), axisOrigin: add(entry, scale(inward, radius)), radius, length: lead + radius * angle + tail };
}

function verifySection(edges, center, radial, axis, halfWidth, halfHeight) {
  assert.equal(edges.length, 4);
  const corners = new Set();
  for (const { curve } of edges) {
    assert.equal(curve.degree, 1);
    for (const point of curve.controlPoints) {
      const offset = sub(point, center);
      const x = dot(offset, radial), y = dot(offset, axis);
      near(dot(offset, cross(radial, axis)), 0);
      near(Math.abs(x), halfWidth);
      near(Math.abs(y), halfHeight);
      corners.add(`${Math.sign(x)}:${Math.sign(y)}`);
    }
  }
  assert.equal(corners.size, 4);
}

function verifyElbow(output, rail, halfWidth, halfHeight) {
  const { brep } = output, check = checkBrep(brep, { strict: true });
  assert.equal(output.representation, 'curved');
  assert.deepEqual(brep.source, { family: 'sweep-curve', id: 'w' });
  assert.ok(check.valid, check.issues.join('\n'));
  assert.equal(check.topology[0].genus, 0);
  assert.deepEqual(check.counts, { bodies: 1, shells: 1, faces: 14, loops: 14, coedges: 56, edges: 28, vertices: 16 });
  assert.equal(new Set(brep.faces.map(face => face.name)).size, 14);
  const mass = massPropertiesOf(output), volume = 4 * halfWidth * halfHeight * rail.length;
  assert.equal(mass.method, 'closed-form');
  near(mass.volume, volume, 1e-10 * volume);
  near(brepMassProperties(brep, 1).volume, volume, 1e-8 * volume);

  const geometry = new Map(brep.faces.map(face => [face.id, faceGeometry(face)]));
  const cylinders = [...geometry.values()].filter(face => face.kind === 'cylinder');
  assert.equal(cylinders.length, 2);
  assert.equal([...geometry.values()].filter(face => face.kind === 'plane').length, 12);
  for (const face of cylinders) {
    near(Math.abs(dot(face.a, rail.axis)), 1);
    near(Math.hypot(...cross(sub(face.c, rail.axisOrigin), rail.axis)), 0);
    near(face.r, rail.radius + face.out * halfWidth);
  }
  assert.deepEqual(cylinders.map(face => face.out).sort(), [-1, 1]);

  const caps = brep.faces.filter(face => face.name === 'w.start' || face.name === 'w.end');
  assert.equal(caps.length, 2);
  for (const face of caps) {
    const atStart = face.name === 'w.start', center = atStart ? rail.start : rail.end;
    const normal = atStart ? scale(rail.tangent, -1) : rail.terminal;
    const radial = atStart ? rail.inward : rail.exitInward;
    const plane = geometry.get(face.id);
    assert.equal(plane.kind, 'plane');
    pointNear(plane.n, normal);
    near(dot(sub(plane.o, center), normal), 0);
    const edges = brep.coedges.filter(use => face.loops.includes(use.loop)).map(use => brep.edges.find(edge => edge.id === use.edge));
    verifySection(edges, center, radial, rail.axis, halfWidth, halfHeight);
  }

  for (const [wall, center, radial] of [['line', rail.entry, rail.inward], ['tail', rail.exit, rail.exitInward]]) {
    const seams = brep.edges.filter(edge => edge.name?.includes('w.bend.') && edge.name.includes(`w.${wall}.`));
    verifySection(seams, center, radial, rail.axis, halfWidth, halfHeight);
    let flat = 0;
    for (const edge of seams) {
      const domain = curveDomain(edge.curve);
      const uses = brep.coedges.filter(use => use.edge === edge.id);
      assert.equal(uses.length, 2);
      for (const use of uses) {
        assert.ok(use.pcurve, `${edge.name} coedge ${use.id} has no UV curve`);
        assert.deepEqual(curveDomain(use.pcurve), domain);
        const { surface } = brep.faces.find(face => face.loops.includes(use.loop));
        for (const fraction of [0, .25, .5, .9, 1]) {
          const parameter = domain[0] + fraction * (domain[1] - domain[0]);
          const [u, v] = evaluateCurve(use.pcurve, parameter);
          pointNear(evaluateSurface(surface, u, v), evaluateCurve(edge.curve, parameter));
        }
      }
      const continuity = measureBrepEdgeContinuity(brep, edge.id, { curvature: true });
      assert.equal(continuity.status, 'measured', JSON.stringify(continuity));
      near(continuity.maximumAngleDegrees, 0);
      assert.equal(continuity.curvature.status, 'measured');
      const bend = geometry.get(continuity.faces.find(face => face.name.startsWith('w.bend.')).id);
      if (bend.kind === 'plane') flat++;
      near(continuity.curvature.maximumDifference, bend.kind === 'cylinder' ? 1 / bend.r : 0);
    }
    assert.equal(flat, 2);
  }
}

test('a joined 90° rail sweeps a centered rectangle with radial sketch X and eight bound tangent joins', () => {
  const rail = elbow();
  assert.deepEqual(rail.path.knots, [0, 0, 0, 1, 1, 2, 2, 3, 3, 3]);
  const snapshot = evaluateCadPart(document(rail.path));
  verifyElbow(snapshot.outputs[0], rail, 2, 3);
  const reopened = loadCadPart(saveCadPart(snapshot));
  assert.deepEqual(reopened.document, snapshot.document);
  assert.deepEqual(reopened.outputs[0].brep, snapshot.outputs[0].brep);
});

test('a translated 120° elbow with radial sketch Y permits a long tail and binormal extent larger than the bend radius', () => {
  const rail = elbow({ degrees: 120, radius: 4, lead: 35, tail: 31, entry: [32, 14, -18], tangent: [.6, .8, 0], inward: [.8, -.6, 0] });
  assert.ok(dot(sub(rail.end, rail.entry), rail.tangent) < 0);
  const sketch = {
    ...section, min: [45, -32], max: [55, -28],
    plane: { origin: [5, 4, 3], normal: rail.tangent, xAxis: rail.axis },
    sideTags: { outer: ['south', 'east', 'north', 'west'] },
  };
  const [output] = evaluateCadPart(document(rail.path, sketch)).outputs;
  verifyElbow(output, rail, 2, 5);
  for (const tag of sketch.sideTags.outer) {
    const names = output.brep.faces.filter(face => face.name.endsWith(`.side[${tag}]`)).map(face => face.name).sort();
    assert.deepEqual(names, ['bend', 'line', 'tail'].map(piece => `w.${piece}.side[${tag}]`));
  }
});

test('a rectangular exact elbow refuses roll, radial axis contact and crossing, and holes', () => {
  const refuses = (rail, sketch, code, message) => assert.throws(() => evaluateCadPart(document(rail.path, sketch)),
    error => error instanceof CadPartError && error.feature === 'w' && error.code === code && message.test(error.message));
  const rail = elbow();
  refuses(rail, { ...section, plane: { origin: [0, 0, 0], normal: rail.tangent, xAxis: [0, Math.SQRT1_2, Math.SQRT1_2] } },
    'CAPABILITY', /original axes aligned to the bend radial and binormal/);
  for (const radius of [2, 1.99]) refuses(elbow({ radius }), section, 'PARAMETER', /radial half-width smaller than the path radius/);
  const perforated = { ...section, holes: [[{ kind: 'arc', start: [51, -30], center: [50, -30], direction: 'ccw' }]] };
  refuses(rail, perforated, 'CAPABILITY', /bend-aligned rectangular section without holes/);
});
