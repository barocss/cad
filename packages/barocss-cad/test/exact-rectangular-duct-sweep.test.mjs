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

function rectangle(x, y, { center = [0, 0], clockwise = false } = {}) {
  const corners = clockwise ? [[-x, -y], [-x, y], [x, y], [x, -y]] : [[-x, -y], [x, -y], [x, y], [-x, y]];
  return corners.map(point => ({ kind: 'line', start: add(point, center) }));
}

const defaultOpening = rectangle(1, 2, { clockwise: true });
const defaultSketch = { id: 's', kind: 'sketch', profile: 'loop', segments: rectangle(2, 3), holes: [defaultOpening] };
const document = ({ degree, knots, controlPoints, weights }, sketch = defaultSketch) => ({
  format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {}, features: [
    sketch, { kind: 'sweep-curve', id: 'w', sketch: 's', mode: 'exact', path: { degree, knots, controlPoints, weights } },
  ],
});
const span = (id, controlPoints, weight = 1) => ({
  kind: 'curve', id, degree: 2, controlPoints, weights: [1, weight, 1], knots: [0, 0, 0, 1, 1, 1],
});

function elbow({ degrees = 90, radius = 20, lead = 10, tail = 14,
  entry = [0, 0, 0], tangent = [1, 0, 0], inward = [0, 1, 0] } = {}) {
  const angle = degrees * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
  const exit = add(entry, add(scale(tangent, radius * s), scale(inward, radius * (1 - c))));
  const terminal = add(scale(tangent, c), scale(inward, s));
  const start = add(entry, scale(tangent, -lead)), end = add(exit, scale(terminal, tail));
  const line = span('lead', [start, add(entry, scale(tangent, -lead / 2)), entry]);
  const bend = span('bend', [entry, add(entry, scale(tangent, radius * Math.tan(angle / 2))), exit], Math.cos(angle / 2));
  const last = span('tail', [exit, add(exit, scale(terminal, tail / 2)), end]);
  const lineArc = joinCurves(line, bend, { curveId: 'lineArc' }).curve;
  const path = joinCurves(lineArc, last, { curveId: 'ductRail' }).curve, axis = cross(tangent, inward);
  return { path, start, entry, exit, end, tangent, terminal, inward, exitInward: cross(axis, terminal),
    axis, axisOrigin: add(entry, scale(inward, radius)), radius, length: lead + radius * angle + tail };
}

function verifyChart(brep, edge, use) {
  const domain = curveDomain(edge.curve), { pcurve } = use;
  assert.ok(pcurve, `${edge.name} coedge ${use.id} has no UV curve`);
  assert.deepEqual(curveDomain(pcurve), domain);
  const { surface } = brep.faces.find(face => face.loops.includes(use.loop));
  for (const fraction of [0, .25, .5, .9, 1]) {
    const at = domain[0] + fraction * (domain[1] - domain[0]);
    const [u, v] = evaluateCurve(pcurve, at);
    pointNear(evaluateSurface(surface, u, v), evaluateCurve(edge.curve, at));
  }
}

function verifyRectangle(edges, center, radial, axis, dimensions) {
  assert.equal(edges.length, 4);
  const corners = new Set();
  for (const { curve } of edges) {
    assert.equal(curve.degree, 1);
    for (const point of curve.controlPoints) {
      const offset = sub(point, center), x = dot(offset, radial), y = dot(offset, axis);
      near(dot(offset, cross(radial, axis)), 0);
      near(Math.abs(x), dimensions[0]);
      near(Math.abs(y), dimensions[1]);
      corners.add(`${Math.sign(x)}:${Math.sign(y)}`);
    }
  }
  assert.equal(corners.size, 4);
}

function verifyDuct(output, rail, outer, inner) {
  const { brep } = output, report = checkBrep(brep, { strict: true });
  assert.equal(output.representation, 'curved');
  assert.deepEqual(brep.source, { family: 'sweep-curve', id: 'w' });
  assert.ok(report.valid, report.issues.join('\n'));
  assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 26, loops: 28, coedges: 112, edges: 56, vertices: 32 });
  assert.equal(report.topology[0].genus, 1);
  assert.equal(new Set(brep.faces.map(face => face.name)).size, 26);
  const mass = massPropertiesOf(output), volume = 4 * (outer[0] * outer[1] - inner[0] * inner[1]) * rail.length;
  assert.equal(mass.method, 'closed-form');
  near(mass.volume, volume, 1e-10 * volume);
  near(brepMassProperties(brep, 1).volume, volume, 1e-8 * volume);

  const geometry = new Map(brep.faces.map(face => [face.id, faceGeometry(face)]));
  const cylinders = [...geometry.values()].filter(face => face.kind === 'cylinder').sort((a, b) => a.r - b.r);
  assert.equal(cylinders.length, 4);
  assert.equal([...geometry.values()].filter(face => face.kind === 'plane').length, 22);
  const radialOffsets = [-outer[0], -inner[0], inner[0], outer[0]], senses = [-1, 1, -1, 1];
  for (const [i, cylinder] of cylinders.entries()) {
    near(cylinder.r, rail.radius + radialOffsets[i]);
    assert.equal(cylinder.out, senses[i]);
    near(Math.abs(dot(cylinder.a, rail.axis)), 1);
    near(Math.hypot(...cross(sub(cylinder.c, rail.axisOrigin), rail.axis)), 0);
  }

  const openings = brep.faces.filter(face => face.name === 'w.start' || face.name === 'w.end');
  assert.deepEqual(openings.map(face => face.name).sort(), ['w.end', 'w.start']);
  for (const face of openings) {
    const atStart = face.name === 'w.start', center = atStart ? rail.start : rail.end;
    const normal = atStart ? scale(rail.tangent, -1) : rail.terminal;
    const radial = atStart ? rail.inward : rail.exitInward, plane = geometry.get(face.id);
    assert.equal(plane.kind, 'plane');
    pointNear(plane.n, normal);
    near(dot(sub(plane.o, center), normal), 0);
    const loops = brep.loops.filter(loop => face.loops.includes(loop.id));
    assert.deepEqual(loops.map(loop => loop.kind).sort(), ['inner', 'outer']);
    for (const loop of loops) {
      const uses = loop.coedges.map(id => brep.coedges.find(use => use.id === id));
      const edges = uses.map(use => brep.edges.find(edge => edge.id === use.edge));
      const outerLoop = loop.kind === 'outer', size = outerLoop ? outer : inner;
      verifyRectangle(edges, center, radial, rail.axis, size);
      let area = 0;
      for (const [i, edge] of edges.entries()) {
        const use = uses[i];
        verifyChart(brep, edge, use);
        const [a, b] = edge.curve.controlPoints.map(point => sub(point, center));
        area += (use.sense === 'forward' ? 1 : -1) * dot(cross(a, b), normal) / 2;
      }
      near(area, (outerLoop ? 1 : -1) * 4 * size[0] * size[1]);
    }
  }

  for (const [wall, center, radial] of [['line', rail.entry, rail.inward], ['tail', rail.exit, rail.exitInward]]) {
    const seams = brep.edges.filter(edge => edge.name?.includes('w.bend.') && edge.name.includes(`w.${wall}.`));
    const outerEdges = [], innerEdges = [];
    for (const edge of seams) {
      const offset = sub(edge.curve.controlPoints[0], center);
      const atOuter = Math.abs(Math.abs(dot(offset, radial)) - outer[0]) < 1e-8;
      (atOuter ? outerEdges : innerEdges).push(edge);
      const uses = brep.coedges.filter(use => use.edge === edge.id);
      assert.equal(uses.length, 2);
      for (const use of uses) verifyChart(brep, edge, use);
      const continuity = measureBrepEdgeContinuity(brep, edge.id, { curvature: true });
      assert.equal(continuity.status, 'measured', JSON.stringify(continuity));
      near(continuity.maximumAngleDegrees, 0);
      assert.equal(continuity.curvature.status, 'measured');
      const bend = geometry.get(continuity.faces.find(face => face.name.startsWith('w.bend.')).id);
      near(continuity.curvature.maximumDifference, bend.kind === 'cylinder' ? 1 / bend.r : 0);
    }
    verifyRectangle(outerEdges, center, radial, rail.axis, outer);
    verifyRectangle(innerEdges, center, radial, rail.axis, inner);
  }
}

test('a native 90° elbow preserves the two rectangular openings, sixteen tangent joins and exact material volume', () => {
  const rail = elbow();
  assert.deepEqual(rail.path.knots, [0, 0, 0, 1, 1, 2, 2, 3, 3, 3]);
  const snapshot = evaluateCadPart(document(rail.path)), [output] = snapshot.outputs;
  verifyDuct(output, rail, [2, 3], [1, 2]);
  assert.equal(output.brep.faces.filter(face => face.name.startsWith('w.bend.hole0.side')).length, 4);
  const reopened = loadCadPart(saveCadPart(snapshot));
  assert.deepEqual(reopened.document, snapshot.document);
  assert.deepEqual(reopened.outputs[0].brep, output.brep);
});

test('a 120° duct supports radial sketch Y with an oblique long tail and keeps CW and CCW opening tags on their authored walls', () => {
  const rail = elbow({ degrees: 120, radius: 4, lead: 35, tail: 31, entry: [32, 14, -18], tangent: [.6, .8, 0], inward: [.8, -.6, 0] });
  assert.ok(dot(sub(rail.end, rail.entry), rail.tangent) < 0);
  const center = [21.2, -7.1];
  for (const clockwise of [false, true]) {
    const opening = rectangle(4, 1, { center, clockwise });
    // Keep the same authored side order and deliberately choose a different start corner.
    opening.push(opening.shift());
    const sketch = {
      ...defaultSketch, segments: rectangle(5, 2, { center }), holes: [opening],
      plane: { origin: [5, 4, 3], normal: rail.tangent, xAxis: rail.axis },
      sideTags: { outer: ['o0', 'o1', 'o2', 'o3'], holes: [['i0', 'i1', 'i2', 'i3']] },
    };
    const [output] = evaluateCadPart(document(rail.path, sketch)).outputs;
    verifyDuct(output, rail, [2, 5], [1, 4]);
    for (const tag of [...sketch.sideTags.outer, ...sketch.sideTags.holes[0]]) {
      const faces = output.brep.faces.filter(face => face.name.endsWith(`.side[${tag}]`)).map(face => face.name).sort();
      assert.deepEqual(faces, ['bend', 'line', 'tail'].map(piece => `w.${piece}.side[${tag}]`));
      for (const piece of ['line', 'tail']) {
        const seam = [`w.bend.side[${tag}]`, `w.${piece}.side[${tag}]`].sort().join('|');
        assert.equal(output.brep.edges.filter(edge => edge.name === seam).length, 1);
      }
    }
  }
});

test('the duct refuses displaced, rotated, multiple, too close, touching and axis-contacting profiles', () => {
  const refuses = (rail, sketch, code, message) => assert.throws(() => evaluateCadPart(document(rail.path, sketch)),
    error => error instanceof CadPartError && error.feature === 'w' && error.code === code && message.test(error.message));
  const rail = elbow(), aperture = /one centered rectangular opening aligned with the outer rectangle/;
  const wall = /strictly positive wall clearance around the opening/;
  const sketchWith = (...holes) => ({ ...defaultSketch, holes });
  refuses(rail, sketchWith(rectangle(1, 2, { center: [.05, 0] })), 'CAPABILITY', aperture);
  const rotated = defaultOpening.map(({ kind, start: [x, y] }) => ({
    kind, start: [(x - y) * Math.SQRT1_2, (x + y) * Math.SQRT1_2],
  }));
  refuses(rail, sketchWith(rotated), 'CAPABILITY', aperture);
  refuses(rail, sketchWith(defaultOpening, rectangle(.5, .5)), 'GEOMETRY', /strictly positive axial web clearance/);
  refuses(rail, sketchWith(rectangle(1e-5, 2)), 'CAPABILITY', aperture);
  for (const radialHalfWidth of [2, 2 + .01, 2 - 5e-7]) {
    refuses(rail, sketchWith(rectangle(radialHalfWidth, 2)), 'GEOMETRY', wall);
  }
  refuses(rail, sketchWith(rectangle(1, 2, { center: [1, 0] })), 'GEOMETRY', wall);
  refuses(elbow({ radius: 2 }), defaultSketch, 'PARAMETER', /radial half-width smaller than the path radius/);
  refuses(rail, { ...defaultSketch, plane: { origin: [0, 0, 0], normal: rail.tangent, xAxis: [0, Math.SQRT1_2, Math.SQRT1_2] } },
    'CAPABILITY', /original axes aligned to the bend radial and binormal/);
});
