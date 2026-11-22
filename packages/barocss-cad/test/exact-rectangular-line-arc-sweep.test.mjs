import assert from 'node:assert/strict';
import test from 'node:test';
import {
  brepMassProperties, CadPartError, checkBrep, curveDomain, evaluateCadPart, evaluateCurve, evaluateSurface,
  faceGeometry, joinCurves, loadCadPart, massPropertiesOf, measureBrepEdgeContinuity, reevaluate, reverseCurve, saveCadPart,
} from '../dist/index.js';

const add = (a, b) => a.map((x, i) => x + b[i]);
const sub = (a, b) => a.map((x, i) => x - b[i]);
const scale = (a, s) => a.map(x => x * s);
const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const near = (a, b, tolerance = 1e-8) => assert.ok(Math.abs(a - b) <= tolerance, `${a} vs ${b} at tolerance ${tolerance}`);
const pointNear = (a, b) => near(Math.hypot(...sub(a, b)), 0);
const rectangle = (x, y, clockwise = false, center = [0, 0]) =>
  (clockwise ? [[-x, -y], [-x, y], [x, y], [x, -y]] : [[-x, -y], [x, -y], [x, y], [-x, y]])
    .map(point => ({ kind: 'line', start: add(point, center) }));
const section = { id: 's', kind: 'sketch', profile: 'rectangle', min: [48, -33], max: [52, -27] };
const duct = { id: 's', kind: 'sketch', profile: 'loop', segments: rectangle(2, 3), holes: [rectangle(1, 2, true)] };
const document = ({ degree, knots, controlPoints, weights }, sketch = section) => ({
  format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {}, features: [
    sketch, { kind: 'sweep-curve', id: 'w', sketch: 's', mode: 'exact', path: { degree, knots, controlPoints, weights } },
  ],
});
const span = (id, controlPoints, weight = 1) => ({
  kind: 'curve', id, degree: 2, controlPoints, weights: [1, weight, 1], knots: [0, 0, 0, 1, 1, 1],
});

function rail({ degrees = 90, radius = 20, lead = 10,
  entry = [0, 0, 0], tangent = [1, 0, 0], inward = [0, 1, 0] } = {}) {
  const angle = degrees * Math.PI / 180;
  const end = add(entry, add(scale(tangent, radius * Math.sin(angle)), scale(inward, radius * (1 - Math.cos(angle)))));
  const terminal = add(scale(tangent, Math.cos(angle)), scale(inward, Math.sin(angle)));
  const start = add(entry, scale(tangent, -lead)), axis = cross(tangent, inward);
  const line = span('lead', [start, add(entry, scale(tangent, -lead / 2)), entry]);
  const bend = span('bend', [entry, add(entry, scale(tangent, radius * Math.tan(angle / 2))), end], Math.cos(angle / 2));
  return { path: joinCurves(line, bend, { curveId: 'lineArc' }).curve, start, entry, end, tangent, terminal,
    inward, exitInward: cross(axis, terminal), axis, axisOrigin: add(entry, scale(inward, radius)), radius,
    length: lead + radius * angle };
}

function verifyChart(brep, edge, use) {
  const domain = curveDomain(edge.curve);
  assert.ok(use.pcurve, `${edge.name}: missing UV curve`);
  assert.deepEqual(curveDomain(use.pcurve), domain);
  const { surface } = brep.faces.find(face => face.loops.includes(use.loop));
  for (const fraction of [0, .19, .5, .87, 1]) {
    const at = domain[0] + fraction * (domain[1] - domain[0]), [u, v] = evaluateCurve(use.pcurve, at);
    pointNear(evaluateSurface(surface, u, v), evaluateCurve(edge.curve, at));
  }
}

function verifyRectangle(edges, center, radial, axis, size) {
  assert.equal(edges.length, 4);
  const corners = new Set();
  for (const { curve } of edges) {
    assert.equal(curve.degree, 1);
    for (const point of curve.controlPoints) {
      const offset = sub(point, center), x = dot(offset, radial), y = dot(offset, axis);
      near(dot(offset, cross(radial, axis)), 0);
      near(Math.abs(x), size[0]);
      near(Math.abs(y), size[1]);
      corners.add(`${Math.sign(x)}:${Math.sign(y)}`);
    }
  }
  assert.equal(corners.size, 4);
}

function verify(output, path, outer = [2, 3], inner) {
  const { brep } = output, report = checkBrep(brep, { strict: true }), hollow = inner !== undefined;
  assert.equal(output.representation, 'curved');
  assert.deepEqual(brep.source, { family: 'sweep-curve', id: 'w' });
  assert.ok(report.valid, report.issues.join('\n'));
  assert.equal(report.topology.length, 1);
  assert.equal(report.topology[0].genus, hollow ? 1 : 0);
  assert.deepEqual(report.counts, hollow
    ? { bodies: 1, shells: 1, faces: 18, loops: 20, coedges: 80, edges: 40, vertices: 24 }
    : { bodies: 1, shells: 1, faces: 10, loops: 10, coedges: 40, edges: 20, vertices: 12 });
  assert.equal(new Set(brep.faces.map(face => face.name)).size, report.counts.faces);
  assert.ok(brep.faces.every(face => !face.name.includes('.tail.')));
  const area = 4 * (outer[0] * outer[1] - (hollow ? inner[0] * inner[1] : 0)), volume = area * path.length;
  const mass = massPropertiesOf(output);
  assert.equal(mass.method, 'closed-form');
  near(mass.volume, volume, 1e-10 * volume);
  near(brepMassProperties(brep, 1).volume, volume, 1e-8 * volume);

  const geometry = new Map(brep.faces.map(face => [face.id, faceGeometry(face)]));
  const cylinders = [...geometry.values()].filter(face => face.kind === 'cylinder').sort((a, b) => a.r - b.r);
  assert.equal(cylinders.length, hollow ? 4 : 2);
  assert.equal([...geometry.values()].filter(face => face.kind === 'plane').length, hollow ? 14 : 8);
  const offsets = hollow ? [-outer[0], -inner[0], inner[0], outer[0]] : [-outer[0], outer[0]];
  for (const [i, cylinder] of cylinders.entries()) {
    near(cylinder.r, path.radius + offsets[i]);
    assert.equal(cylinder.out, hollow ? [-1, 1, -1, 1][i] : [-1, 1][i]);
    near(Math.abs(dot(cylinder.a, path.axis)), 1);
    near(Math.hypot(...cross(sub(cylinder.c, path.axisOrigin), path.axis)), 0);
  }

  const caps = brep.faces.filter(face => face.name === 'w.start' || face.name === 'w.end');
  assert.deepEqual(caps.map(face => face.name).sort(), ['w.end', 'w.start']);
  for (const face of caps) {
    const first = face.name === 'w.start', center = first ? path.start : path.end;
    const normal = first ? scale(path.tangent, -1) : path.terminal, radial = first ? path.inward : path.exitInward;
    const plane = geometry.get(face.id);
    assert.equal(plane.kind, 'plane');
    pointNear(plane.n, normal);
    near(dot(sub(plane.o, center), normal), 0);
    const loops = brep.loops.filter(loop => face.loops.includes(loop.id));
    assert.deepEqual(loops.map(loop => loop.kind).sort(), hollow ? ['inner', 'outer'] : ['outer']);
    for (const loop of loops) {
      const uses = loop.coedges.map(id => brep.coedges.find(use => use.id === id));
      const edges = uses.map(use => brep.edges.find(edge => edge.id === use.edge)), size = loop.kind === 'outer' ? outer : inner;
      verifyRectangle(edges, center, radial, path.axis, size);
      let area = 0;
      for (const [i, edge] of edges.entries()) {
        for (const use of brep.coedges.filter(use => use.edge === edge.id)) verifyChart(brep, edge, use);
        const [a, b] = edge.curve.controlPoints.map(point => sub(point, center));
        area += (uses[i].sense === 'forward' ? 1 : -1) * dot(cross(a, b), normal) / 2;
      }
      near(area, (loop.kind === 'outer' ? 1 : -1) * 4 * size[0] * size[1]);
    }
  }

  const seams = brep.edges.filter(edge => edge.name?.includes('w.bend.') && edge.name.includes('w.line.'));
  assert.equal(seams.length, hollow ? 8 : 4);
  for (const edge of seams) {
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
  return seams;
}

for (const hollow of [false, true]) test(`an exact rectangular line-and-arc ${hollow ? 'duct' : 'solid'} retains both native caps and all ${hollow ? 8 : 4} zero-degree joints`, () => {
  const path = rail(), snapshot = evaluateCadPart(document(path.path, hollow ? duct : section));
  assert.deepEqual(path.path.knots, [0, 0, 0, 1, 1, 2, 2, 2]);
  verify(snapshot.outputs[0], path, [2, 3], hollow ? [1, 2] : undefined);
  const reopened = loadCadPart(saveCadPart(snapshot));
  assert.deepEqual(reopened.document, snapshot.document);
  assert.deepEqual(reopened.outputs[0].brep, snapshot.outputs[0].brep);
});

for (const degrees of [30, 120]) test(`a translated ${degrees} degree line-and-arc retains radial sketch Y, large binormal extent and both opening windings`, () => {
  const path = rail({ degrees, radius: 4, lead: 35, entry: [32, 14, -18], tangent: [.6, .8, 0], inward: [.8, -.6, 0] });
  const center = [21.2, -7.1], plane = { origin: [5, 4, 3], normal: path.tangent, xAxis: path.axis };
  verify(evaluateCadPart(document(path.path, { ...section, min: [45, -32], max: [55, -28], plane })).outputs[0], path, [2, 5]);
  for (const clockwise of [false, true]) {
    const opening = rectangle(4, 1, clockwise, center);
    opening.push(opening.shift());
    const sketch = { ...duct, segments: rectangle(5, 2, false, center), holes: [opening], plane,
      sideTags: { outer: ['o0', 'o1', 'o2', 'o3'], holes: [['i0', 'i1', 'i2', 'i3']] } };
    const [output] = evaluateCadPart(document(path.path, sketch)).outputs;
    verify(output, path, [2, 5], [1, 4]);
    for (const tag of [...sketch.sideTags.outer, ...sketch.sideTags.holes[0]]) {
      assert.deepEqual(output.brep.faces.filter(face => face.name.endsWith(`.side[${tag}]`)).map(face => face.name).sort(),
        ['bend', 'line'].map(piece => `w.${piece}.side[${tag}]`));
      assert.equal(output.brep.edges.filter(edge => edge.name === [`w.bend.side[${tag}]`, `w.line.side[${tag}]`].sort().join('|')).length, 1);
    }
  }
});

test('opening and outer edits retain line-and-arc topology identity and restore the same native solid after reopen', () => {
  const path = rail(), initial = evaluateCadPart(document(path.path, duct));
  const changed = { ...duct, holes: [rectangle(1.5, 2, true)] };
  const edited = reevaluate(initial, { document: document(path.path, changed) });
  verify(edited.outputs[0], path, [2, 3], [1.5, 2]);
  const identity = snapshot => Object.fromEntries(['bodies', 'shells', 'faces', 'loops', 'coedges', 'edges', 'vertices']
    .map(key => [key, snapshot.outputs[0].brep[key].map(({ id, name }) => [id, name])]));
  assert.deepEqual(identity(edited), identity(initial));
  const outside = snapshot => snapshot.outputs[0].brep.faces.filter(face => face.name.startsWith('w.line.side') || face.name.startsWith('w.bend.side'));
  assert.deepEqual(outside(edited), outside(initial));
  const expanded = reevaluate(edited, { document: document(path.path, { ...changed, segments: rectangle(3, 4) }) });
  verify(expanded.outputs[0], path, [3, 4], [1.5, 2]);
  assert.deepEqual(identity(expanded), identity(initial));
  const reopened = loadCadPart(saveCadPart(edited));
  assert.deepEqual(reopened.outputs[0].brep, edited.outputs[0].brep);
  assert.deepEqual(reevaluate(reopened, { document: document(path.path, duct) }).outputs[0].brep, initial.outputs[0].brep);
});

test('reversed native section-edge directions keep the line-and-arc UV bindings and zero-degree continuity', () => {
  const path = rail(), [output] = evaluateCadPart(document(path.path, duct)).outputs;
  const seams = verify(output, path, [2, 3], [1, 2]);
  const ids = new Set([...seams, ...output.brep.edges.filter(edge => edge.name?.split('|').includes('w.end'))].map(edge => edge.id));
  const reverse = curve => reverseCurve(curve, { curveId: `${curve.id}_reverse` }).curve;
  const brep = { ...output.brep,
    edges: output.brep.edges.map(edge => ids.has(edge.id) ? { ...edge, curve: reverse(edge.curve), vertices: [...edge.vertices].reverse() } : edge),
    coedges: output.brep.coedges.map(use => ids.has(use.edge)
      ? { ...use, sense: use.sense === 'forward' ? 'reversed' : 'forward', pcurve: reverse(use.pcurve) } : use),
  };
  const report = checkBrep(brep, { strict: true });
  assert.ok(report.valid, report.issues.join('\n'));
  near(brepMassProperties(brep, 1).volume, 16 * path.length, 1e-8 * 16 * path.length);
  for (const edge of brep.edges.filter(edge => ids.has(edge.id))) {
    for (const use of brep.coedges.filter(use => use.edge === edge.id)) verifyChart(brep, edge, use);
    if (seams.some(seam => seam.id === edge.id)) {
      const continuity = measureBrepEdgeContinuity(brep, edge.id);
      assert.equal(continuity.status, 'measured');
      near(continuity.maximumAngleDegrees, 0);
    }
  }
});

test('line-and-arc keeps positive clearances and refuses unsupported openings, roll, paths and sections without altering the prior solid', () => {
  const path = rail(), initial = evaluateCadPart(document(path.path, duct)), saved = saveCadPart(initial);
  const refuses = (changedPath, sketch, code, message) => {
    assert.throws(() => reevaluate(initial, { document: document(changedPath.path, sketch) }),
      error => error instanceof CadPartError && error.feature === 'w' && error.code === code && message.test(error.message));
    assert.equal(saveCadPart(initial), saved);
  };
  const aperture = /one centered rectangular opening aligned with the outer rectangle/;
  const wall = /strictly positive wall clearance around the opening/;
  for (const holes of [[rectangle(1, 2, true, [.05, 0])], [rectangle(1, 2), rectangle(.5, .5)], [rectangle(1e-5, 2)],
    [[{ kind: 'arc', start: [1, 0], center: [0, 0], direction: 'ccw' }]],
    [rectangle(1, 2).map(({ kind, start: [x, y] }) => ({ kind, start: [(x - y) * Math.SQRT1_2, (x + y) * Math.SQRT1_2] }))]]) {
    refuses(path, { ...duct, holes }, 'CAPABILITY', aperture);
  }
  for (const width of [2, 2.01, 2 - 5e-7]) refuses(path, { ...duct, holes: [rectangle(width, 2)] }, 'GEOMETRY', wall);
  for (const radius of [2, 1.99]) refuses(rail({ radius }), duct, 'PARAMETER', /radial half-width smaller than the path radius/);
  for (const sketch of [section, duct]) refuses(path,
    { ...sketch, plane: { origin: [0, 0, 0], normal: path.tangent, xAxis: [0, Math.SQRT1_2, Math.SQRT1_2] } },
    'CAPABILITY', /original axes aligned to the bend radial and binormal/);
  const triangle = { ...duct, segments: [{ kind: 'line', start: [-2, -3] }, { kind: 'line', start: [2, -3] }, { kind: 'line', start: [0, 3] }], holes: [] };
  refuses(path, triangle, 'CAPABILITY', /Exact line-and-arc sweep needs one circular disk or one bend-aligned rectangular section/);
  for (const degrees of [29, 121]) refuses(rail({ degrees }), duct, 'CAPABILITY', /straight segment followed by one circular arc from 30° to 120°/);
  const kink = structuredClone(path);
  kink.path.controlPoints[0][1] = -.02;
  kink.path.controlPoints[1][1] = -.01;
  refuses(kink, duct, 'GEOMETRY', /common forward tangent/);
  const thin = evaluateCadPart(document(path.path, { ...duct, holes: [rectangle(2 - 1e-4, 3 - 1e-4, true)] }));
  verify(thin.outputs[0], path, [2, 3], [2 - 1e-4, 3 - 1e-4]);
});
