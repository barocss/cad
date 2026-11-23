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
const pointNear = (a, b, tolerance = 1e-8) => near(Math.hypot(...sub(a, b)), 0, tolerance);
const rectangle = (x, y, clockwise = false, center = [0, 0]) =>
  (clockwise ? [[-x, -y], [-x, y], [x, y], [x, -y]] : [[-x, -y], [x, -y], [x, y], [-x, y]])
    .map(point => ({ kind: 'line', start: add(point, center) }));
const span = (id, controlPoints, weight = 1) => ({ kind: 'curve', id, degree: 2,
  controlPoints, weights: [1, weight, 1], knots: [0, 0, 0, 1, 1, 1] });
function rail({ degrees = 90, radius = 20, length = 14, start = [32, 14, -18],
  tangent = [.6, .8, 0], inward = [0, 0, 1], lineTangent } = {}) {
  const angle = degrees * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
  const join = add(start, scale(add(scale(tangent, s), scale(inward, 1 - c)), radius));
  const atExit = add(scale(tangent, c), scale(inward, s)), direction = lineTangent ?? atExit;
  const end = add(join, scale(direction, length)), axis = cross(tangent, inward);
  const arc = span('bend', [start, add(start, scale(tangent, radius * Math.tan(angle / 2))), join], Math.cos(angle / 2));
  const line = span('line', [join, add(join, scale(direction, length / 2)), end]);
  const path = { ...joinCurves(arc, line, { curveId: 'arcLine' }).curve, knots: [-3, -3, -3, 1, 1, 2, 2, 2] };
  const rotate = v => add(add(scale(v, c), scale(cross(axis, v), s)), scale(axis, dot(axis, v) * (1 - c)));
  return { path, start, join, end, tangent, atExit, inward, axis, rotate, radius, angle, length,
    center: add(start, scale(inward, radius)), exitInward: rotate(inward) };
}
const sketch = (path, { outer = [2, 3], inner, clockwise = false, shifted = false, tagged = true,
  radialY = false, sign = 1, center = [21.2, -7.1] } = {}) => {
  const xAxis = scale(radialY ? path.axis : path.inward, sign);
  const opening = inner ? rectangle(...inner, clockwise, center) : undefined;
  if (shifted && opening) opening.push(opening.shift());
  return { id: 's', kind: 'sketch', profile: 'loop', segments: rectangle(...outer, false, center),
    ...(opening ? { holes: [opening] } : {}),
    plane: { origin: [5, 4, 3], normal: path.tangent, xAxis },
    ...(tagged ? { sideTags: { outer: ['e1', 'e2', 'e3', 'e4'], ...(inner ? { holes: [['e5', 'e6', 'e7', 'e8']] } : {}) } } : {}) };
};
const document = (path, section) => ({ format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {},
  features: [section, { id: 'w', kind: 'sweep-curve', sketch: 's', mode: 'exact', path }] });
function verifyChart(brep, edge, use) {
  const domain = curveDomain(edge.curve);
  assert.ok(use.pcurve, `${edge.name}: missing native UV binding`);
  assert.deepEqual(curveDomain(use.pcurve), domain);
  const face = brep.faces.find(face => face.loops.includes(use.loop));
  for (const fraction of [0, .19, .5, .87, 1]) {
    const at = domain[0] + fraction * (domain[1] - domain[0]), [u, v] = evaluateCurve(use.pcurve, at);
    pointNear(evaluateSurface(face.surface, u, v), evaluateCurve(edge.curve, at));
  }
}

// Exact physical moments of dV=(1-u/R) du dv R dtheta, followed by the straight prism.
// Only authored centerline vectors and rectangle integrals enter this oracle.
function checkAnalyticMass(output, path, outer, inner = [0, 0], radialY = false, nativeBrep = output.brep) {
  const [a, b] = radialY ? [outer[1], outer[0]] : outer;
  const [ai, bi] = radialY ? [inner[1], inner[0]] : inner;
  const density = 7.85, carrier = a * b - ai * bi, area = 4 * carrier;
  const q = (a ** 3 * b - ai ** 3 * bi) / (3 * carrier), v = (a * b ** 3 - ai * bi ** 3) / (3 * carrier);
  const { angle, radius: r, inward: n, tangent: t, axis, center: c, length: L, atExit: d, join: p, exitInward: e } = path;
  const volume = area * (r * angle + L), moment = [0, 0, 0], raw = Array.from({ length: 3 }, () => [0, 0, 0]);
  const N = sub(scale(n, Math.sin(angle)), scale(t, 1 - Math.cos(angle)));
  const cc = angle / 2 + Math.sin(2 * angle) / 4, ss = angle / 2 - Math.sin(2 * angle) / 4;
  const cs = Math.sin(angle) ** 2 / 2, k = r + q / r;
  for (let i = 0; i < 3; i++) {
    moment[i] = area * (r * (c[i] * angle - k * N[i]) + L * p[i] + L ** 2 / 2 * d[i]);
    for (let j = 0; j < 3; j++) {
      const NN = n[i] * n[j] * cc + t[i] * t[j] * ss - (n[i] * t[j] + t[i] * n[j]) * cs;
      raw[i][j] = area * (r * (c[i] * c[j] * angle - k * (c[i] * N[j] + N[i] * c[j])
        + (r * r + 3 * q) * NN + v * axis[i] * axis[j] * angle)
        + L * p[i] * p[j] + L ** 2 / 2 * (p[i] * d[j] + d[i] * p[j]) + L ** 3 / 3 * d[i] * d[j]
        + L * (q * e[i] * e[j] + v * axis[i] * axis[j]));
    }
  }
  const centroid = scale(moment, 1 / volume), mass = density * .001 * volume;
  const central = raw.map((row, i) => row.map((entry, j) => entry - volume * centroid[i] * centroid[j]));
  const trace = central[0][0] + central[1][1] + central[2][2];
  const inertia = central.map((row, i) => row.map((entry, j) => density * .001 * ((i === j ? trace : 0) - entry)));
  const exact = massPropertiesOf(output, density), native = brepMassProperties(nativeBrep, density);
  assert.equal(exact.method, 'closed-form');
  assert.equal(native.method, 'quadrature');
  for (const actual of [exact, native]) {
    near(actual.volume, volume, 2e-8 * volume);
    near(actual.mass, mass, 2e-8 * mass);
    pointNear(actual.centroid, centroid, 1e-7);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) near(actual.inertia[i][j], inertia[i][j], 2e-8 * mass * 1000);
  }
}
function verify(output, path, section, outer = [2, 3], inner, radialY = false) {
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
  checkAnalyticMass(output, path, outer, inner, radialY);
  const center = scale(add(section.segments[0].start, section.segments[2].start), .5);
  const x = section.plane.xAxis, y = cross(path.tangent, x);
  const side = (loop, i) => {
    const tags = loop === 0 ? section.sideTags?.outer : section.sideTags?.holes?.[0];
    return tags ? `.side[${tags[i]}]` : loop === 0 ? `.side${i}` : `.hole0.side${i}`;
  };
  const atSide = (loop, i, terminal) => {
    const segments = loop === 0 ? section.segments : section.holes[0];
    const midpoint = sub(scale(add(segments[i].start, segments[(i + 1) % 4].start), .5), center);
    const offset = add(scale(x, midpoint[0]), scale(y, midpoint[1]));
    return add(terminal ? path.end : path.start, terminal ? path.rotate(offset) : offset);
  };
  const caps = brep.faces.filter(face => face.name === 'w.start' || face.name === 'w.end');
  assert.deepEqual(caps.map(face => face.name).sort(), ['w.end', 'w.start']);
  for (const cap of caps) {
    const terminal = cap.name === 'w.end', center = terminal ? path.end : path.start;
    const normal = terminal ? path.atExit : scale(path.tangent, -1), plane = faceGeometry(cap);
    assert.equal(plane.kind, 'plane');
    pointNear(plane.n, normal);
    near(dot(sub(plane.o, center), normal), 0);
    const loops = cap.loops.map(id => brep.loops.find(loop => loop.id === id));
    assert.deepEqual(loops.map(loop => loop.kind).sort(), hollow ? ['inner', 'outer'] : ['outer']);
    for (const loop of loops) {
      assert.equal(loop.coedges.length, 4);
      const loopIndex = loop.kind === 'outer' ? 0 : 1, size = loopIndex === 0 ? outer : inner;
      const seen = new Set();
      let area = 0;
      for (const useId of loop.coedges) {
        const use = brep.coedges.find(use => use.id === useId), edge = brep.edges.find(edge => edge.id === use.edge);
        assert.equal(edge.curve.degree, 1);
        assert.ok(edge.name.split('|').includes(cap.name), `${edge.name}: wrong cap owner`);
        assert.ok(!edge.name.split('|').includes(terminal ? 'w.start' : 'w.end'));
        const peer = brep.coedges.find(peer => peer.id === use.twin), face = brep.faces.find(face => face.loops.includes(peer.loop));
        const i = [0, 1, 2, 3].find(i => face.name === `w.${terminal ? 'line' : 'bend'}${side(loopIndex, i)}`);
        assert.notEqual(i, undefined, `${face.name}: wrong authored side owner`);
        seen.add(i);
        pointNear(evaluateCurve(edge.curve, .5), atSide(loopIndex, i, terminal));
        const [a, b] = edge.curve.controlPoints.map(point => sub(point, center));
        area += (use.sense === 'forward' ? 1 : -1) * dot(cross(a, b), normal) / 2;
        for (const owner of brep.coedges.filter(owner => owner.edge === edge.id)) verifyChart(brep, edge, owner);
      }
      assert.equal(seen.size, 4);
      near(area, (loopIndex === 0 ? 1 : -1) * 4 * size[0] * size[1]);
    }
  }
  const seams = brep.edges.filter(edge => edge.name?.includes('w.bend.') && edge.name.includes('w.line.'));
  assert.equal(seams.length, hollow ? 8 : 4);
  for (const edge of seams) {
    const uses = brep.coedges.filter(use => use.edge === edge.id);
    assert.equal(uses.length, 2);
    assert.notEqual(uses[0].sense, uses[1].sense);
    const owners = uses.map(use => brep.faces.find(face => face.loops.includes(use.loop)).name);
    assert.equal(owners.find(name => name.startsWith('w.bend.')).slice(7), owners.find(name => name.startsWith('w.line.')).slice(7));
    for (const use of uses) verifyChart(brep, edge, use);
    const continuity = measureBrepEdgeContinuity(brep, edge.id, { curvature: true });
    assert.equal(continuity.status, 'measured', JSON.stringify(continuity));
    near(continuity.maximumAngleDegrees, 0);
    assert.equal(continuity.curvature.status, 'measured');
    const bend = faceGeometry(brep.faces.find(face => face.id === continuity.faces.find(face => face.name.startsWith('w.bend.')).id));
    near(continuity.curvature.maximumDifference, bend.kind === 'cylinder' ? 1 / bend.r : 0);
  }
  return seams;
}

for (const radialY of [false, true]) for (const degrees of [30, 90, 120]) for (const hollow of [false, true])
  test(`${degrees} degree oblique arc then line ${hollow ? 'duct' : 'rectangle'} preserves radial ${radialY ? 'Y' : 'X'}, unequal extents, original side owners and exact physical moments`, () => {
    const path = rail({ degrees, radius: 4, length: 35 });
    const outer = radialY ? [5, 2] : [2, 5], inner = hollow ? radialY ? [4, 1] : [1, 4] : undefined;
    const section = sketch(path, { outer, inner, radialY });
    verify(evaluateCadPart(document(path.path, section)).outputs[0], path, section, outer, inner, radialY);
  });
for (const tagged of [false, true]) for (const clockwise of [false, true]) for (const sign of [-1, 1])
  test(`reflected arc then line keeps ${tagged ? 'tagged' : 'positional'} side identity with ${clockwise ? 'CW' : 'CCW'} shifted opening and axis sign ${sign}`, () => {
    const path = rail({ degrees: 120 }), section = sketch(path, { inner: [1, 2], clockwise, shifted: true, tagged, sign, radialY: true });
    verify(evaluateCadPart(document(path.path, section)).outputs[0], path, section, [2, 3], [1, 2], true);
  });

test('outer and opening edits preserve all native IDs and restore the same arc then line solid after reopen', () => {
  const path = rail(), section = sketch(path, { inner: [1, 2], clockwise: true });
  const initial = evaluateCadPart(document(path.path, section));
  const changed = { ...section, holes: [rectangle(1.5, 2, true, [21.2, -7.1])] };
  const edited = reevaluate(initial, { document: document(path.path, changed) });
  verify(edited.outputs[0], path, changed, [2, 3], [1.5, 2]);
  const identity = snapshot => ['bodies', 'shells', 'faces', 'loops', 'coedges', 'edges', 'vertices']
    .map(key => snapshot.outputs[0].brep[key].map(({ id, name }) => [id, name]));
  assert.deepEqual(identity(edited), identity(initial));
  const outer = snapshot => snapshot.outputs[0].brep.faces.filter(face => ['e1', 'e2', 'e3', 'e4'].some(tag => face.name.endsWith(`.side[${tag}]`)));
  assert.deepEqual(outer(edited), outer(initial));
  const expanded = { ...changed, segments: rectangle(3, 4, false, [21.2, -7.1]) };
  const bigger = reevaluate(edited, { document: document(path.path, expanded) });
  verify(bigger.outputs[0], path, expanded, [3, 4], [1.5, 2]);
  assert.deepEqual(identity(bigger), identity(initial));
  const reopened = loadCadPart(saveCadPart(edited));
  assert.deepEqual(reopened.outputs[0].brep, edited.outputs[0].brep);
  assert.deepEqual(reevaluate(reopened, { document: document(path.path, section) }).outputs[0].brep, initial.outputs[0].brep);
});

test('reversed native rectangular joint and outlet edge directions keep reciprocal UV bindings and zero-degree continuity', () => {
  const path = rail(), section = sketch(path, { inner: [1, 2] }), output = evaluateCadPart(document(path.path, section)).outputs[0];
  const seams = verify(output, path, section, [2, 3], [1, 2]);
  const ids = new Set([...seams, ...output.brep.edges.filter(edge => edge.name.split('|').includes('w.end'))].map(edge => edge.id));
  const reverse = curve => reverseCurve(curve, { curveId: `${curve.id}_reverse` }).curve;
  const brep = { ...output.brep,
    edges: output.brep.edges.map(edge => ids.has(edge.id) ? { ...edge, curve: reverse(edge.curve), vertices: [...edge.vertices].reverse() } : edge),
    coedges: output.brep.coedges.map(use => ids.has(use.edge)
      ? { ...use, sense: use.sense === 'forward' ? 'reversed' : 'forward', pcurve: reverse(use.pcurve) } : use) };
  const report = checkBrep(brep, { strict: true });
  assert.ok(report.valid, report.issues.join('\n'));
  checkAnalyticMass(output, path, [2, 3], [1, 2], false, brep);
  for (const edge of brep.edges.filter(edge => ids.has(edge.id))) {
    for (const use of brep.coedges.filter(use => use.edge === edge.id)) verifyChart(brep, edge, use);
    if (seams.some(seam => seam.id === edge.id)) {
      const continuity = measureBrepEdgeContinuity(brep, edge.id);
      assert.equal(continuity.status, 'measured');
      near(continuity.maximumAngleDegrees, 0);
    }
  }
});

test('arc then line refuses unsupported roll, openings, walls, axis contact and malformed paths without changing the prior solid', () => {
  const path = rail(), section = sketch(path, { inner: [1, 2] });
  const initial = evaluateCadPart(document(path.path, section)), saved = saveCadPart(initial);
  const refuses = (changedPath, sketch, code, message) => {
    assert.throws(() => reevaluate(initial, { document: document(changedPath.path, sketch) }),
      error => error instanceof CadPartError && error.feature === 'w' && error.code === code && message.test(error.message));
    assert.equal(saveCadPart(initial), saved);
  };
  const center = [21.2, -7.1], aperture = /one centered rectangular opening aligned with the outer rectangle/;
  for (const holes of [[rectangle(1, 2, false, add(center, [.05, 0]))],
    [rectangle(1e-5, 2, false, center)], [[{ kind: 'arc', start: add(center, [1, 0]), center, direction: 'ccw' }]],
    [rectangle(1, 2).map(({ kind, start: [x, y] }) => ({ kind, start: add(center, [(x - y) * Math.SQRT1_2, (x + y) * Math.SQRT1_2]) }))]])
    refuses(path, { ...section, sideTags: undefined, holes }, 'CAPABILITY', aperture);
  refuses(path, { ...section, sideTags: undefined, holes: [rectangle(1, 2, false, center), rectangle(.5, .5)] },
    'GEOMETRY', /both cavities centered on the radial axis/);
  for (const width of [2, 2.01, 2 - 5e-7]) refuses(path, { ...section, holes: [rectangle(width, 2, false, center)] },
    'GEOMETRY', /strictly positive wall clearance around the opening/);
  for (const radius of [2, 1.99]) refuses(rail({ radius }), section, 'PARAMETER', /radial half-width smaller than the path radius/);
  for (const inner of [undefined, [1, 2]]) {
    const rolled = sketch(path, { inner });
    rolled.plane.xAxis = scale(add(path.inward, path.axis), Math.SQRT1_2);
    refuses(path, rolled, 'CAPABILITY', /rectangular arc-and-line sweep needs the rectangle's original axes aligned to the bend radial and binormal/);
  }
  for (const degrees of [29, 121]) refuses(rail({ degrees }), section, 'CAPABILITY', /one circular arc from 30° to 120° followed by one straight segment/);
  for (const lineTangent of [path.tangent, scale(path.atExit, -1)]) refuses(rail({ lineTangent }), section, 'GEOMETRY', /common forward tangent/);
  refuses(rail({ length: 0 }), section, 'PARAMETER', /straight segment at least/);
  for (const changed of [
    { ...path.path, weights: [1, .7, 1, 1, 1] },
    { ...path.path, knots: [-3, -3, -3, 1, 1.1, 2, 2, 2] },
    { ...path.path, controlPoints: path.path.controlPoints.map((p, i) => i === 3 ? add(p, path.axis) : p) },
  ]) refuses({ path: changed }, section, 'CAPABILITY', /one circular arc from 30° to 120° followed by one straight segment/);
  const thin = sketch(path, { inner: [2 - 1e-4, 3 - 1e-4] });
  verify(evaluateCadPart(document(path.path, thin)).outputs[0], path, thin, [2, 3], [2 - 1e-4, 3 - 1e-4]);
});

test('authored side IDs equal to private producer tokens survive one-pass name restoration', () => {
  const path = rail(), section = sketch(path, { inner: [1, 2] });
  section.sideTags = { outer: ['arcLineOuter1', 'arcLineHole2', 'arcLineOuter0', 'arcLineHole3'],
    holes: [['arcLineHole0', 'arcLineOuter3', 'arcLineHole1', 'arcLineOuter2']] };
  verify(evaluateCadPart(document(path.path, section)).outputs[0], path, section, [2, 3], [1, 2]);
});

test('the primitive rectangle keeps the authored plane roll and positional side ownership', () => {
  const path = rail({ degrees: 120 }), reference = sketch(path, { outer: [5, 2], radialY: true, tagged: false });
  const primitive = { id: 's', kind: 'sketch', profile: 'rectangle', min: reference.segments[0].start,
    max: reference.segments[2].start, plane: reference.plane };
  verify(evaluateCadPart(document(path.path, primitive)).outputs[0], path, reference, [5, 2], undefined, true);
});
