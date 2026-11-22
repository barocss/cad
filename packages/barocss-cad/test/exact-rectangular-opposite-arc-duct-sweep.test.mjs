import assert from 'node:assert/strict';
import test from 'node:test';
import {
  brepMassProperties, CadPartError, checkBrep, curveDomain, evaluateCadPart, evaluateCurve, evaluateSurface,
  faceGeometry, joinCurves, loadCadPart, massPropertiesOf, measureBrepEdgeContinuity, reevaluate, saveCadPart,
} from '../dist/index.js';

const add = (a, b) => a.map((x, i) => x + b[i]);
const scale = (a, s) => a.map(x => x * s);
const sub = (a, b) => add(a, scale(b, -1));
const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => Math.hypot(...a);
const near = (a, b, tolerance = 1e-8) => assert.ok(Math.abs(a - b) <= tolerance, `${a} vs ${b} at tolerance ${tolerance}`);
const pointNear = (a, b) => near(norm(sub(a, b)), 0);
const innerWall = face => face.surface.id.includes('_hole0_');

function rectangle(x, y, { center = [50, -30], clockwise = false } = {}) {
  const points = clockwise ? [[-x, -y], [-x, y], [x, y], [x, -y]] : [[-x, -y], [x, -y], [x, y], [-x, y]];
  return points.map(start => ({ kind: 'line', start: add(start, center) }));
}
const section = { id: 's', kind: 'sketch', profile: 'loop', segments: rectangle(2, 3), holes: [rectangle(1, 2, { clockwise: true })] };
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
function verifyRectangle(edges, center, radial, axis, [halfWidth, halfHeight]) {
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
function verifyChart(brep, edge, use) {
  const domain = curveDomain(edge.curve);
  assert.ok(use.pcurve, `${edge.name}: missing native pcurve`);
  assert.deepEqual(curveDomain(use.pcurve), domain);
  const { surface } = brep.faces.find(face => face.loops.includes(use.loop));
  for (const fraction of [0, .19, .5, .87, 1]) {
    const t = domain[0] + fraction * (domain[1] - domain[0]), [u, v] = evaluateCurve(use.pcurve, t);
    pointNear(evaluateSurface(surface, u, v), evaluateCurve(edge.curve, t));
  }
}
function verify(output, { first, second }, outer = [2, 3], inner = [1, 2]) {
  const { brep } = output, report = checkBrep(brep, { strict: true });
  assert.equal(output.representation, 'curved');
  assert.deepEqual(brep.source, { family: 'sweep-curve', id: 'w' });
  assert.ok(report.valid, report.issues.join('\n'));
  assert.equal(report.topology.length, 1);
  assert.equal(report.topology[0].genus, 1);
  assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 18, loops: 20, coedges: 80, edges: 40, vertices: 24 });
  assert.equal(new Set(brep.faces.map(face => face.name)).size, 18);
  const volume = 4 * (outer[0] * outer[1] - inner[0] * inner[1]) * (first.length + second.length);
  assert.equal(massPropertiesOf(output).method, 'closed-form');
  near(massPropertiesOf(output).volume, volume, 1e-10 * volume);
  near(brepMassProperties(brep, 1).volume, volume, 1e-8 * volume);
  const geometry = new Map(brep.faces.map(face => [face.id, faceGeometry(face)]));
  for (const [label, bend] of [['first', first], ['second', second]]) {
    const walls = brep.faces.filter(face => face.name.startsWith(`w.${label}.`));
    assert.equal(walls.length, 8);
    for (const isInner of [false, true]) {
      const size = isInner ? inner : outer, group = walls.filter(face => innerWall(face) === isInner);
      assert.equal(group.length, 4);
      const cylinders = group.map(face => geometry.get(face.id)).filter(g => g.kind === 'cylinder').sort((a, b) => a.r - b.r);
      assert.equal(cylinders.length, 2);
      for (const [i, cylinder] of cylinders.entries()) {
        near(cylinder.r, bend.radius + (i ? 1 : -1) * size[0]);
        assert.equal(cylinder.out, (i ? 1 : -1) * (isInner ? -1 : 1));
        near(Math.abs(dot(cylinder.a, bend.axis)), 1);
        near(norm(cross(sub(cylinder.c, bend.center), bend.axis)), 0);
      }
      const planes = group.map(face => geometry.get(face.id)).filter(g => g.kind === 'plane');
      assert.equal(planes.length, 2);
      for (const plane of planes) {
        near(Math.abs(dot(plane.n, bend.axis)), 1);
        near(dot(sub(plane.o, bend.start), plane.n), (isInner ? -1 : 1) * size[1]);
      }
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
    const loops = face.loops.map(id => brep.loops.find(loop => loop.id === id));
    assert.deepEqual(loops.map(loop => loop.kind).sort(), ['inner', 'outer']);
    for (const loop of loops) {
      const uses = loop.coedges.map(id => brep.coedges.find(use => use.id === id));
      const edges = uses.map(use => brep.edges.find(edge => edge.id === use.edge));
      const size = loop.kind === 'inner' ? inner : outer;
      verifyRectangle(edges, center, radial, bend.axis, size);
      let area = 0;
      for (const [i, edge] of edges.entries()) {
        const use = uses[i], [a, b] = edge.curve.controlPoints.map(point => sub(point, center));
        area += (use.sense === 'forward' ? 1 : -1) * dot(cross(a, b), normal) / 2;
      }
      near(area, (loop.kind === 'inner' ? -1 : 1) * 4 * size[0] * size[1]);
    }
  }
  const seams = brep.edges.filter(edge => edge.name?.includes('w.first.') && edge.name.includes('w.second.'));
  const outerSeams = [], innerSeams = [];
  let flat = 0;
  for (const edge of seams) {
    const uses = brep.coedges.filter(use => use.edge === edge.id);
    assert.equal(uses.length, 2);
    assert.equal(uses[0].twin, uses[1].id);
    assert.equal(uses[1].twin, uses[0].id);
    assert.notEqual(uses[0].sense, uses[1].sense);
    const faces = uses.map(use => brep.faces.find(face => face.loops.includes(use.loop)));
    assert.equal(innerWall(faces[0]), innerWall(faces[1]));
    (innerWall(faces[0]) ? innerSeams : outerSeams).push(edge);
    for (const use of uses) verifyChart(brep, edge, use);
    const continuity = measureBrepEdgeContinuity(brep, edge.id, { curvature: true });
    assert.equal(continuity.status, 'measured', JSON.stringify(continuity));
    near(continuity.maximumAngleDegrees, 0);
    assert.equal(continuity.curvature.status, 'measured');
    const supports = continuity.faces.map(face => geometry.get(face.id));
    if (supports[0].kind === 'plane') flat++;
    for (const sample of continuity.curvature.samples) {
      const expected = supports.map(g => g.kind === 'cylinder' ? -g.out / g.r : 0);
      near(sample.first, expected[0]);
      near(sample.second, expected[1]);
      near(sample.difference, Math.abs(expected[0] - expected[1]));
    }
  }
  assert.equal(flat, 4);
  verifyRectangle(outerSeams, first.end, first.exitInward, first.axis, outer);
  verifyRectangle(innerSeams, first.end, first.exitInward, first.axis, inner);
}

test('a rectangular S-bend preserves both openings and eight native tangent seams through opening edit and reopen', () => {
  const rail = pair(), snapshot = evaluateCadPart(document(rail.path));
  verify(snapshot.outputs[0], rail);
  const sketch = { ...section, holes: [rectangle(1.5, 2.5, { clockwise: true })] };
  const edited = reevaluate(snapshot, { document: document(rail.path, sketch) });
  verify(edited.outputs[0], rail, [2, 3], [1.5, 2.5]);
  const outerWalls = output => output.brep.faces.filter(face => !innerWall(face) && face.name !== 'w.start' && face.name !== 'w.end');
  assert.deepEqual(outerWalls(edited.outputs[0]), outerWalls(snapshot.outputs[0]));
  for (const key of ['faces', 'edges', 'vertices', 'coedges'])
    assert.deepEqual(edited.outputs[0].brep[key].map(item => item.id), snapshot.outputs[0].brep[key].map(item => item.id));
  assert.deepEqual(edited.outputs[0].brep.edges.map(edge => edge.name), snapshot.outputs[0].brep.edges.map(edge => edge.name));
  const reopened = loadCadPart(saveCadPart(edited));
  assert.deepEqual(reopened.document, edited.document);
  assert.deepEqual(reopened.outputs[0].brep, edited.outputs[0].brep);
  const replayed = reevaluate(reopened, { document: document(rail.path) });
  assert.deepEqual(replayed.outputs[0].brep, snapshot.outputs[0].brep);
});

test('an oblique 120°/30° duct preserves radial sketch Y, large binormal extent and either opening winding with authored tags', () => {
  const rail = pair({ a: 120, b: 30, R1: 4, R2: 7, start: [42, -17, 8], tangent: [.6, .8, 0], inward: [.8, -.6, 0] });
  for (const clockwise of [false, true]) {
    const opening = rectangle(9, 1, { clockwise });
    opening.push(opening.shift());
    const sketch = { ...section, segments: rectangle(10, 2), holes: [opening],
      plane: { origin: [5, 4, 3], normal: rail.first.tangent, xAxis: rail.first.axis },
      sideTags: { outer: ['o0', 'o1', 'o2', 'o3'], holes: [['i0', 'i1', 'i2', 'i3']] } };
    const [output] = evaluateCadPart(document(rail.path, sketch)).outputs;
    verify(output, rail, [2, 10], [1, 9]);
    for (const tag of [...sketch.sideTags.outer, ...sketch.sideTags.holes[0]]) {
      assert.deepEqual(output.brep.faces.filter(face => face.name.endsWith(`.side[${tag}]`)).map(face => face.name).sort(),
        [`w.first.side[${tag}]`, `w.second.side[${tag}]`]);
      assert.equal(output.brep.edges.filter(edge => edge.name === `w.first.side[${tag}]|w.second.side[${tag}]`).length, 1);
    }
  }
});

test('the shared rectangular section admits a safe thin wall and refuses a wall inside the native joint matching margin', () => {
  const rail = pair(), centered = { ...section, segments: rectangle(2, 3, { center: [0, 0] }) };
  const withGap = gap => ({ ...centered, holes: [rectangle(2 - gap, 2, { center: [0, 0] })] });
  verify(evaluateCadPart(document(rail.path, withGap(5e-6))).outputs[0], rail, [2, 3], [2 - 5e-6, 2]);
  // This wall exceeds 10 * 1e-7 mm, but remains inside the two native vertex tolerances plus placement roundoff.
  const jointGap = 1e-6 + 2e-13;
  assert.ok(2 - (2 - jointGap) > 1e-6);
  assert.throws(() => evaluateCadPart(document(rail.path, withGap(jointGap))), error => error instanceof CadPartError
    && error.feature === 'w' && error.code === 'GEOMETRY' && /strictly positive wall clearance around the opening/.test(error.message));
});

test('a rectangular S-bend refuses displaced, rotated, multiple, thin, touching, rolled and axis-contacting openings', () => {
  const refuses = (rail, sketch, code, message) => assert.throws(() => evaluateCadPart(document(rail.path, sketch)),
    error => error instanceof CadPartError && error.feature === 'w' && error.code === code && message.test(error.message));
  const rail = pair(), aperture = /one centered rectangular opening aligned with the outer rectangle/;
  const wall = /strictly positive wall clearance around the opening/;
  const sketchWith = (...holes) => ({ ...section, holes });
  refuses(rail, sketchWith(rectangle(1, 2, { center: [50.05, -30] })), 'CAPABILITY', aperture);
  const rotated = rectangle(1, 2, { center: [0, 0] }).map(({ kind, start: [x, y] }) => ({
    kind, start: [50 + (x - y) * Math.SQRT1_2, -30 + (x + y) * Math.SQRT1_2],
  }));
  refuses(rail, sketchWith(rotated), 'CAPABILITY', aperture);
  refuses(rail, sketchWith(section.holes[0], rectangle(.5, .5)), 'CAPABILITY', aperture);
  refuses(rail, sketchWith(rectangle(1e-5, 2)), 'CAPABILITY', aperture);
  for (const radialHalfWidth of [2, 2 + .01, 2 - 5e-7, 2 - 1e-6])
    refuses(rail, sketchWith(rectangle(radialHalfWidth, 2)), 'GEOMETRY', wall);
  refuses(rail, sketchWith(rectangle(1, 2, { center: [51, -30] })), 'GEOMETRY', wall);
  refuses(rail, { ...section, plane: { origin: [0, 0, 0], normal: rail.first.tangent, xAxis: [0, Math.SQRT1_2, Math.SQRT1_2] } },
    'CAPABILITY', /original axes aligned to the bend radial and binormal/);
  for (const radius of [2, 1.99]) for (const radii of [{ R1: radius }, { R2: radius }])
    refuses(pair(radii), section, 'PARAMETER', /radial half-width smaller than both path radii/);
});
