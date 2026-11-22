import assert from 'node:assert/strict';
import test from 'node:test';
import {
  brepMassProperties, CadPartError, checkBrep, curveDomain, evaluateCadPart, evaluateCurve, evaluateSurface,
  faceGeometry, joinCurves, loadCadPart, massPropertiesOf, measureBrepEdgeContinuity, reevaluate, saveCadPart,
} from '../dist/index.js';

const add = (a, b) => a.map((x, i) => x + b[i]);
const scale = (a, s) => a.map(x => s * x);
const sub = (a, b) => add(a, scale(b, -1));
const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => Math.hypot(...a);
const near = (a, b, tolerance = 1e-8) => assert.ok(Math.abs(a - b) <= tolerance, `${a} vs ${b} at tolerance ${tolerance}`);
const pointNear = (a, b) => near(norm(sub(a, b)), 0);
const section = { id: 's', kind: 'sketch', profile: 'rectangle', min: [48, -33], max: [52, -27] };
const document = ({ degree, knots, controlPoints, weights }, sketch = section) => ({
  format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {}, features: [
    sketch, { kind: 'sweep-curve', id: 'w', sketch: 's', mode: 'exact', path: { degree, knots, controlPoints, weights } },
  ],
});

function arc(id, start, tangent, inward, radius, degrees) {
  const angle = degrees * Math.PI / 180, c = degrees === 90 ? 0 : Math.cos(angle), s = Math.sin(angle);
  const end = add(start, scale(add(scale(tangent, s), scale(inward, 1 - c)), radius));
  const terminal = add(scale(tangent, c), scale(inward, s)), exitInward = add(scale(inward, c), scale(tangent, -s));
  return { start, end, tangent, inward, terminal, exitInward, radius, axis: cross(tangent, inward),
    center: add(start, scale(inward, radius)), length: radius * angle,
    curve: { kind: 'curve', id, degree: 2, knots: [0, 0, 0, 1, 1, 1], weights: [1, Math.cos(angle / 2), 1],
      controlPoints: [start, add(start, scale(tangent, radius * Math.tan(angle / 2))), end] } };
}

function pair({ a = 90, b = 90, R1 = 12, R2 = 18, start = [0, 0, 0], tangent = [1, 0, 0], inward = [0, 1, 0] } = {}) {
  const first = arc('first', start, tangent, inward, R1, a);
  const second = arc('second', first.end, first.terminal, scale(first.exitInward, -1), R2, b);
  return { first, second, path: joinCurves(first.curve, second.curve, { curveId: 'sBend' }).curve };
}

function verifySection(edges, center, radial, axis, halfWidth, halfHeight) {
  assert.equal(edges.length, 4);
  const corners = new Set();
  for (const { curve } of edges) {
    assert.equal(curve.degree, 1);
    for (const point of curve.controlPoints) {
      const q = sub(point, center), x = dot(q, radial), y = dot(q, axis);
      near(dot(q, cross(radial, axis)), 0);
      near(Math.abs(x), halfWidth);
      near(Math.abs(y), halfHeight);
      corners.add(`${Math.sign(x)}:${Math.sign(y)}`);
    }
  }
  assert.equal(corners.size, 4);
}

function verify(output, { first, second }, halfWidth = 2, halfHeight = 3) {
  const { brep } = output, check = checkBrep(brep, { strict: true });
  assert.equal(output.representation, 'curved');
  assert.deepEqual(brep.source, { family: 'sweep-curve', id: 'w' });
  assert.ok(check.valid, check.issues.join('\n'));
  assert.equal(check.topology.length, 1);
  assert.equal(check.topology[0].genus, 0);
  assert.deepEqual(check.counts, { bodies: 1, shells: 1, faces: 10, loops: 10, coedges: 40, edges: 20, vertices: 12 });
  assert.equal(new Set(brep.faces.map(face => face.name)).size, 10);
  const volume = 4 * halfWidth * halfHeight * (first.length + second.length), mass = massPropertiesOf(output);
  assert.equal(mass.method, 'closed-form');
  near(mass.volume, volume, 1e-10 * volume);
  near(brepMassProperties(brep, 1).volume, volume, 1e-8 * volume);

  const geometry = new Map(brep.faces.map(face => [face.id, faceGeometry(face)]));
  for (const [label, bend] of [['first', first], ['second', second]]) {
    const walls = brep.faces.filter(face => face.name.startsWith(`w.${label}.`));
    assert.equal(walls.length, 4);
    const cylinders = walls.map(face => geometry.get(face.id)).filter(g => g.kind === 'cylinder');
    assert.equal(cylinders.length, 2);
    assert.deepEqual(cylinders.map(g => g.out).sort(), [-1, 1]);
    for (const cylinder of cylinders) {
      near(Math.abs(dot(cylinder.a, bend.axis)), 1);
      near(norm(cross(sub(cylinder.c, bend.center), bend.axis)), 0);
      near(cylinder.r, bend.radius + cylinder.out * halfWidth);
    }
    const planes = walls.map(face => geometry.get(face.id)).filter(g => g.kind === 'plane');
    assert.equal(planes.length, 2);
    for (const plane of planes) {
      near(Math.abs(dot(plane.n, bend.axis)), 1);
      near(dot(sub(plane.o, bend.start), plane.n), halfHeight);
    }
  }

  const caps = brep.faces.filter(face => face.name === 'w.start' || face.name === 'w.end');
  assert.equal(caps.length, 2);
  for (const face of caps) {
    const start = face.name === 'w.start', bend = start ? first : second;
    const center = start ? first.start : second.end, normal = start ? scale(first.tangent, -1) : second.terminal;
    const radial = start ? first.inward : second.exitInward, plane = geometry.get(face.id);
    assert.equal(plane.kind, 'plane');
    pointNear(plane.n, normal);
    near(dot(sub(plane.o, center), normal), 0);
    assert.equal(face.loops.length, 1);
    const edges = brep.coedges.filter(use => face.loops.includes(use.loop)).map(use => brep.edges.find(edge => edge.id === use.edge));
    verifySection(edges, center, radial, bend.axis, halfWidth, halfHeight);
  }

  const seams = brep.edges.filter(edge => edge.name?.includes('w.first.') && edge.name.includes('w.second.'));
  verifySection(seams, first.end, first.exitInward, first.axis, halfWidth, halfHeight);
  let flat = 0;
  for (const edge of seams) {
    const domain = curveDomain(edge.curve), uses = brep.coedges.filter(use => use.edge === edge.id);
    assert.equal(uses.length, 2);
    assert.equal(uses[0].twin, uses[1].id);
    assert.equal(uses[1].twin, uses[0].id);
    assert.notEqual(uses[0].sense, uses[1].sense);
    for (const use of uses) {
      assert.ok(use.pcurve, `${edge.name}: missing native pcurve`);
      assert.deepEqual(curveDomain(use.pcurve), domain);
      const { surface } = brep.faces.find(face => face.loops.includes(use.loop));
      for (const fraction of [0, .19, .5, .87, 1]) {
        const t = domain[0] + fraction * (domain[1] - domain[0]), [u, v] = evaluateCurve(use.pcurve, t);
        pointNear(evaluateSurface(surface, u, v), evaluateCurve(edge.curve, t));
      }
    }
    const continuity = measureBrepEdgeContinuity(brep, edge.id, { curvature: true });
    assert.equal(continuity.status, 'measured', JSON.stringify(continuity));
    near(continuity.maximumAngleDegrees, 0);
    assert.equal(continuity.curvature.status, 'measured');
    const firstWall = geometry.get(continuity.faces.find(face => face.name.startsWith('w.first.')).id);
    const secondWall = geometry.get(continuity.faces.find(face => face.name.startsWith('w.second.')).id);
    if (firstWall.kind === 'plane') {
      flat++;
      assert.equal(secondWall.kind, 'plane');
      near(continuity.curvature.maximumDifference, 0);
    } else {
      assert.equal(secondWall.kind, 'cylinder');
      near(continuity.curvature.maximumDifference, 1 / firstWall.r + 1 / secondWall.r);
      const mid = evaluateCurve(edge.curve, (domain[0] + domain[1]) / 2), inward = dot(sub(mid, first.end), first.exitInward);
      near(firstWall.r, first.radius - inward);
      near(secondWall.r, second.radius + inward);
    }
  }
  assert.equal(flat, 2);
}

test('a solid rectangular S-bend retains four native tangent seams and named walls through edit and reopen', () => {
  const rail = pair(), tagged = { ...section, sideTags: { outer: ['south', 'east', 'north', 'west'] } };
  const initial = evaluateCadPart(document(rail.path, tagged));
  verify(initial.outputs[0], rail);
  for (const tag of tagged.sideTags.outer) assert.deepEqual(initial.outputs[0].brep.faces
    .filter(face => face.name.endsWith(`.side[${tag}]`)).map(face => face.name).sort(), [`w.first.side[${tag}]`, `w.second.side[${tag}]`]);
  const edited = reevaluate(initial, { document: document(rail.path, { ...tagged, min: [47, -32], max: [53, -28] }) });
  verify(edited.outputs[0], rail, 3, 2);
  assert.deepEqual(edited.outputs[0].brep.faces.map(face => face.name), initial.outputs[0].brep.faces.map(face => face.name));
  assert.deepEqual(edited.outputs[0].brep.edges.map(edge => edge.name), initial.outputs[0].brep.edges.map(edge => edge.name));
  const reopened = loadCadPart(saveCadPart(edited));
  assert.deepEqual(reopened.document, edited.document);
  assert.deepEqual(reopened.outputs[0].brep, edited.outputs[0].brep);
  const replayed = reevaluate(reopened, { document: document(rail.path, tagged) });
  assert.deepEqual(replayed.outputs[0].brep, initial.outputs[0].brep);
});

for (const config of [
  { tangent: [0, 0, 1], inward: [1, 0, 0], a: 30, b: 120 },
  { tangent: [0, 0, -1], inward: [-1, 0, 0], a: 120, b: 30 },
  { tangent: [0, 1, 0], inward: [0, 0, 1], a: 90, b: 90 },
]) test(`a standard XYZ rectangular S-bend keeps its radial section at ${config.tangent}`, () => {
  const rail = pair({ ...config, R1: 4, R2: 7 });
  const sketch = { ...section, plane: { origin: [2, 4, 6], normal: rail.first.tangent, xAxis: rail.first.inward } };
  verify(evaluateCadPart(document(rail.path, sketch)).outputs[0], rail);
});

test('an oblique translated 120°/30° pair admits radial sketch Y and binormal extent larger than both radii', () => {
  const rail = pair({ a: 120, b: 30, R1: 4, R2: 7, start: [42, -17, 8], tangent: [.6, .8, 0], inward: [.8, -.6, 0] });
  const sketch = { ...section, min: [40, -32], max: [60, -28],
    plane: { origin: [5, 4, 3], normal: rail.first.tangent, xAxis: rail.first.axis } };
  verify(evaluateCadPart(document(rail.path, sketch)).outputs[0], rail, 2, 10);
});

test('a rectangular S-bend refuses roll, either bend axis contact or crossing, and unsupported circular holes', () => {
  const refuses = (rail, sketch, code, message) => assert.throws(() => evaluateCadPart(document(rail.path, sketch)),
    error => error instanceof CadPartError && error.feature === 'w' && error.code === code && message.test(error.message));
  const rail = pair();
  refuses(rail, { ...section, plane: { origin: [0, 0, 0], normal: rail.first.tangent, xAxis: [0, Math.SQRT1_2, Math.SQRT1_2] } },
    'CAPABILITY', /rectangle's original axes aligned to the bend radial and binormal/);
  for (const radius of [2, 1.99]) for (const radii of [{ R1: radius }, { R2: radius }])
    refuses(pair(radii), section, 'PARAMETER', /radial half-width smaller than both path radii/);
  for (const hole of [
    [{ kind: 'arc', start: [51, -30], center: [50, -30], direction: 'ccw' }],
  ]) refuses(rail, { ...section, holes: [hole] }, 'CAPABILITY', /one centered rectangular opening aligned with the outer rectangle/);
});
