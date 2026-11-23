import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import {
  brepMassProperties, CadPartError, checkBrep, curveDomain, evaluateCadPart, evaluateCurve, evaluateSurface,
  faceGeometry, joinCurves, loadCadPart, massPropertiesOf, measureBrepEdgeContinuity, reevaluate, reverseCurve, saveCadPart,
} from '../dist/index.js';

import { exactPairedElbowOutletOffsetFrame, offsetExactPairedElbowOutletIfAdmitted } from '../dist/brep/exact-sweep.js';

const add = (a, b) => a.map((x, i) => x + b[i]);
const sub = (a, b) => a.map((x, i) => x - b[i]);
const scale = (a, s) => a.map(x => x * s);
const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const near = (actual, expected, tolerance = 1e-8) => assert.ok(Number.isFinite(actual)
  && Math.abs(actual - expected) <= tolerance, `${actual} vs ${expected} at ${tolerance}`);
const pointNear = (actual, expected) => near(Math.hypot(...sub(actual, expected)), 0);
const rectangle = (x, low, high, clockwise = false, center = [0, 0]) => {
  const corners = [[-x, low], [x, low], [x, high], [-x, high]];
  return (clockwise ? [corners[0], corners[3], corners[2], corners[1]] : corners)
    .map(point => ({ kind: 'line', start: add(point, center) }));
};
const section = (intervals = [[-3, -1], [1, 3]], widths = [2, 2], clockwise = [true, false], center = [0, 0]) => ({
  id: 's', kind: 'sketch', profile: 'loop', segments: rectangle(2, -5, 5, false, center),
  holes: intervals.map(([low, high], i) => rectangle(widths[i] / 2, low, high, clockwise[i], center)),
});
const span = (id, controlPoints, weight = 1) => ({
  kind: 'curve', id, degree: 2, controlPoints, weights: [1, weight, 1], knots: [0, 0, 0, 1, 1, 1],
});
function rail({ degrees = 90, radius = 20, lead = 10, tail = 0, entry = [0, 0, 0], tangent = [1, 0, 0], inward = [0, 1, 0] } = {}) {
  const angle = degrees * Math.PI / 180, axis = cross(tangent, inward), start = add(entry, scale(tangent, -lead));
  const end = add(entry, add(scale(tangent, radius * Math.sin(angle)), scale(inward, radius * (1 - Math.cos(angle)))));
  const line = span('lead', [start, add(entry, scale(tangent, -lead / 2)), entry]);
  const bend = span('bend', [entry, add(entry, scale(tangent, radius * Math.tan(angle / 2))), end], Math.cos(angle / 2));
  const terminal = add(scale(tangent, Math.cos(angle)), scale(inward, Math.sin(angle)));
  const path = joinCurves(line, bend, { curveId: 'lineArc' }).curve;
  const last = span('tail', [end, add(end, scale(terminal, tail / 2)), add(end, scale(terminal, tail))]);
  return { path: tail ? joinCurves(path, last, { curveId: 'lineArcLine' }).curve : path, start, entry,
    exit: end, end: add(end, scale(terminal, tail)), tangent, terminal, inward, axis,
    radius, lead, tail, angle, length: lead + radius * angle + tail };
}
const document = (path, sketch = section()) => ({ format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {},
  features: [sketch, { kind: 'sweep-curve', id: 'w', sketch: 's', mode: 'exact', path }] });
const identity = snapshot => Object.fromEntries(['bodies', 'shells', 'faces', 'loops', 'coedges', 'edges', 'vertices']
  .map(key => [key, snapshot.outputs[0].brep[key].map(({ id, name }) => [id, name])]));

function verify(output, path, intervals = [[-3, -1], [1, 3]], widths = [2, 2]) {
  const { brep } = output, report = checkBrep(brep, { strict: true });
  assert.ok(report.valid, report.issues.join('\n'));
  assert.deepEqual(brep.source, { family: 'sweep-curve', id: 'w' });
  const tail = Boolean(path.tail), faceCount = tail ? 38 : 26;
  assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: faceCount, loops: tail ? 42 : 30,
    coedges: tail ? 168 : 120, edges: tail ? 84 : 60, vertices: tail ? 48 : 36 });
  assert.equal(report.topology.length, 1);
  assert.equal(report.topology[0].genus, 2);
  assert.ok(report.maximumPcurveGap < 1e-8);
  assert.equal(new Set(brep.faces.map(face => face.name)).size, faceCount);
  const area = 40 - intervals.reduce((sum, [low, high], i) => sum + widths[i] * (high - low), 0);
  const secondRadial = (40 * 4 / 3 - intervals.reduce((sum, [low, high], i) => sum + widths[i] ** 3 * (high - low) / 12, 0)) / area;
  const axial = -intervals.reduce((sum, [low, high], i) => sum + widths[i] * (high - low) * (low + high) / 2, 0) / area;
  const meanRadius = path.radius + secondRadial / path.radius;
  const lineCenter = add(path.entry, scale(path.tangent, -path.lead / 2));
  const arcCenter = add(path.entry, add(scale(path.tangent, meanRadius * (1 - Math.cos(path.angle)) / path.angle),
    scale(path.inward, path.radius - meanRadius * Math.sin(path.angle) / path.angle)));
  const tailCenter = add(path.exit, scale(path.terminal, path.tail / 2));
  const center = add(scale(add(add(scale(lineCenter, path.lead), scale(arcCenter, path.radius * path.angle)),
    scale(tailCenter, path.tail)), 1 / path.length), scale(path.axis, axial));
  for (const mass of [massPropertiesOf(output), brepMassProperties(brep, 1)]) {
    near(mass.volume, area * path.length, 1e-8 * area * path.length);
    pointNear(mass.centroid, center);
  }
  const geometry = brep.faces.map(face => faceGeometry(face));
  assert.equal(geometry.filter(face => face.kind === 'plane').length, tail ? 32 : 20);
  const cylinders = geometry.filter(face => face.kind === 'cylinder');
  assert.equal(cylinders.length, 6);
  const radii = [path.radius - 2, path.radius + 2, ...widths.flatMap(width => [path.radius - width / 2, path.radius + width / 2])].sort((a, b) => a - b);
  cylinders.map(face => face.r).sort((a, b) => a - b).forEach((radius, i) => near(radius, radii[i]));
  for (const end of ['start', 'end']) {
    const face = brep.faces.find(face => face.name === `w.${end}`);
    assert.ok(face);
    const loops = brep.loops.filter(loop => face.loops.includes(loop.id));
    assert.deepEqual(loops.map(loop => loop.kind).sort(), ['inner', 'inner', 'outer']);
    const at = end === 'start' ? path.start : path.end;
    const tangent = end === 'start' ? path.tangent : add(scale(path.tangent, Math.cos(path.angle)), scale(path.inward, Math.sin(path.angle)));
    const radial = end === 'start' ? path.inward : sub(scale(path.inward, Math.cos(path.angle)), scale(path.tangent, Math.sin(path.angle)));
    const apertureIntervals = [];
    for (const loop of loops) {
      assert.equal(loop.coedges.length, 4);
      const points = loop.coedges.flatMap(id => brep.edges.find(edge => edge.id === brep.coedges.find(use => use.id === id).edge).curve.controlPoints);
      const values = points.map(point => [dot(sub(point, at), radial), dot(sub(point, at), path.axis)]);
      for (const point of points) near(dot(sub(point, at), tangent), 0);
      if (loop.kind === 'inner') apertureIntervals.push([Math.min(...values.map(point => point[1])), Math.max(...values.map(point => point[1]))]);
    }
    apertureIntervals.sort((a, b) => a[0] - b[0]);
    const expected = intervals.toSorted((a, b) => a[0] - b[0]);
    apertureIntervals.forEach((interval, i) => interval.forEach((value, j) => near(value, expected[i][j])));
  }
  for (const edge of brep.edges) {
    const uses = brep.coedges.filter(use => use.edge === edge.id), domain = curveDomain(edge.curve);
    assert.equal(uses.length, 2);
    assert.notEqual(uses[0].sense, uses[1].sense);
    for (const [i, use] of uses.entries()) {
      assert.equal(use.twin, uses[1 - i].id);
      if (!use.pcurve) {
        assert.equal(edge.curve.degree, 2, edge.name);
        assert.ok(uses.every(peer => brep.faces.find(face => face.loops.includes(peer.loop)).name.startsWith('w.bend.')), edge.name);
        continue;
      }
      assert.deepEqual(curveDomain(use.pcurve), domain);
      const face = brep.faces.find(face => face.loops.includes(use.loop));
      for (const fraction of [0, .19, .5, .87, 1]) {
        const at = domain[0] + fraction * (domain[1] - domain[0]), [u, v] = evaluateCurve(use.pcurve, at);
        pointNear(evaluateSurface(face.surface, u, v), evaluateCurve(edge.curve, at));
      }
    }
  }
  const seams = brep.edges.filter(edge => edge.name?.includes('w.bend.')
    && (edge.name.includes('w.line.') || edge.name.includes('w.tail.')));
  assert.equal(seams.length, tail ? 24 : 12);
  for (const piece of tail ? ['line', 'tail'] : ['line'])
    assert.equal(seams.filter(edge => edge.name.includes(`w.${piece}.`)).length, 12);
  for (const edge of seams) {
    const continuity = measureBrepEdgeContinuity(brep, edge.id, { curvature: true });
    assert.equal(continuity.status, 'measured', JSON.stringify(continuity));
    near(continuity.maximumAngleDegrees, 0);
    assert.equal(continuity.curvature.status, 'measured');
    const bend = brep.faces.find(face => continuity.faces.some(owner => owner.id === face.id) && face.name.startsWith('w.bend.'));
    const surface = faceGeometry(bend);
    near(continuity.curvature.maximumDifference, surface.kind === 'cylinder' ? 1 / surface.r : 0);
  }
  return seams;
}

test('two straight-to-arc through apertures retain native caps, genus two, exact charts, continuity and independent mass', () => {
  const path = rail(), initial = evaluateCadPart(document(path.path));
  verify(initial.outputs[0], path);
  near(massPropertiesOf(initial.outputs[0]).volume, 320 + 320 * Math.PI);
  const reopened = loadCadPart(saveCadPart(initial));
  assert.deepEqual(reopened.outputs[0].brep, initial.outputs[0].brep);
});

test('paired through aperture edits retain all topology IDs, both lane tags and the unchanged outer faces', () => {
  const path = rail(), sketch = section();
  sketch.sideTags = { outer: ['o0', 'o1', 'o2', 'o3'], holes: [['a0', 'a1', 'a2', 'a3'], ['b0', 'b1', 'b2', 'b3']] };
  const initial = evaluateCadPart(document(path.path, sketch));
  const edited = reevaluate(initial, { document: document(path.path, { ...sketch, holes: [rectangle(1, -2.5, -1.5, true), sketch.holes[1]] }) });
  verify(edited.outputs[0], path, [[-2.5, -1.5], [1, 3]]);
  assert.deepEqual(identity(edited), identity(initial));
  for (const tag of [...sketch.sideTags.outer, ...sketch.sideTags.holes.flat()])
    assert.deepEqual(edited.outputs[0].brep.faces.filter(face => face.name.endsWith(`.side[${tag}]`)).map(face => face.name).sort(),
      ['bend', 'line'].map(piece => `w.${piece}.side[${tag}]`));
  const outside = snapshot => snapshot.outputs[0].brep.faces.filter(face => sketch.sideTags.outer.some(tag => face.name.endsWith(`.side[${tag}]`)));
  assert.deepEqual(outside(edited), outside(initial));
  const reopened = loadCadPart(saveCadPart(edited));
  assert.deepEqual(reopened.outputs[0].brep, edited.outputs[0].brep);
  assert.deepEqual(reevaluate(reopened, { document: document(path.path, sketch) }).outputs[0].brep, initial.outputs[0].brep);
});

test('translated 30 and 120 degree paired apertures retain both windings and authored lane order', () => {
  for (const degrees of [30, 120]) for (const clockwise of [[false, true], [true, false]]) {
    const path = rail({ degrees, entry: [32, -14, 18], tangent: [.6, .8, 0], inward: [-.8, .6, 0] });
    const intervals = [[1, 3], [-3, -1]], widths = [1.5, 2], center = [21.2, -7.1];
    const sketch = { ...section(intervals, widths, clockwise, center), plane: { origin: [5, 4, 3], normal: path.tangent, xAxis: path.inward } };
    verify(evaluateCadPart(document(path.path, sketch)).outputs[0], path, intervals, widths);
  }
});

test('reversed seam edges retain both native charts and twin senses', () => {
  const path = rail(), [output] = evaluateCadPart(document(path.path)).outputs;
  const ids = new Set(verify(output, path).map(edge => edge.id));
  const reverse = curve => reverseCurve(curve, { curveId: `${curve.id}_reverse` }).curve;
  const brep = { ...output.brep,
    edges: output.brep.edges.map(edge => ids.has(edge.id) ? { ...edge, curve: reverse(edge.curve), vertices: [...edge.vertices].reverse() } : edge),
    coedges: output.brep.coedges.map(use => ids.has(use.edge)
      ? { ...use, sense: use.sense === 'forward' ? 'reversed' : 'forward', pcurve: reverse(use.pcurve) } : use),
  };
  assert.ok(checkBrep(brep, { strict: true }).valid);
  near(brepMassProperties(brep, 1).volume, 32 * path.length);
  for (const id of ids) near(measureBrepEdgeContinuity(brep, id).maximumAngleDegrees, 0);
});

test('paired aperture admission refuses radial offset, lost cover, touching or overlapping lanes and unsupported rails without changing the prior result', () => {
  const path = rail(), initial = evaluateCadPart(document(path.path)), saved = saveCadPart(initial);
  const refused = (sketch, code, message, changedPath = path.path) => {
    assert.throws(() => reevaluate(initial, { document: document(changedPath, sketch) }),
      error => error instanceof CadPartError && error.feature === 'w' && error.code === code && message.test(error.message));
    assert.equal(saveCadPart(initial), saved);
  };
  const eccentric = section();
  eccentric.holes[0] = eccentric.holes[0].map(segment => ({ ...segment, start: [segment.start[0] + .1, segment.start[1]] }));
  refused(eccentric, 'GEOMETRY', /both cavities centered on the radial axis/);
  for (const widths of [[4, 2], [4 - 1e-6, 2]]) refused(section(undefined, widths), 'GEOMETRY', /strictly positive cover/);
  for (const intervals of [[[-5, -1], [1, 3]], [[-3, -1], [1, 5]]]) refused(section(intervals), 'GEOMETRY', /strictly positive cover/);
  for (const intervals of [[[-3, 0], [0, 3]], [[-3, .1], [0, 3]], [[-3, 3], [-1, 1]], [[-3, 0], [5e-7, 3]]])
    refused(section(intervals), 'GEOMETRY', /strictly positive axial web clearance/);
  const three = section();
  refused({ ...three, holes: [...three.holes, three.holes[0]] }, 'CAPABILITY', /two axis-aligned rectangular cavities/);
  const curved = section();
  curved.holes[0] = [{ kind: 'arc', center: [0, -2], start: [.5, -2], direction: 'ccw' }];
  refused(curved, 'CAPABILITY', /two axis-aligned rectangular cavities/);
  const rolled = { ...section(), plane: { origin: [0, 0, 0], normal: path.tangent, xAxis: [0, Math.SQRT1_2, Math.SQRT1_2] } };
  refused(rolled, 'CAPABILITY', /original axes aligned/);
  refused(section(), 'PARAMETER', /radial half-width smaller/, rail({ radius: 2 }).path);
  const reverse = reverseCurve(path.path, { curveId: 'reverseRail' }).curve;
  refused(section(), 'CAPABILITY', /one centered rectangular opening/, reverse);
  const narrow = [[-3, -2.5e-6], [2.5e-6, 3]];
  verify(evaluateCadPart(document(path.path, section(narrow))).outputs[0], path, narrow);
});

test('two straight-arc-straight through apertures retain both native tangent joins and independent material moments', () => {
  const path = rail({ tail: 14 }), initial = evaluateCadPart(document(path.path));
  verify(initial.outputs[0], path);
  const volume = 768 + 320 * Math.PI;
  // Direct section integration: area 32, radial second moment 152/3; the two straight portions
  // have centroids (-5, 0, 0) and (20, 27, 0). The arc uses dV = (20 - radial) dA dTheta.
  for (const mass of [massPropertiesOf(initial.outputs[0]), brepMassProperties(initial.outputs[0].brep, 1)]) {
    near(mass.volume, volume);
    pointNear(mass.centroid, [(60632 / 3) / volume, (6400 * Math.PI - 2264 / 3) / volume, 0]);
  }
  assert.deepEqual(loadCadPart(saveCadPart(initial)).outputs[0].brep, initial.outputs[0].brep);
});

test('paired elbow lane edits retain both joins, all topology IDs, authored tags and unchanged outer faces through reopen', () => {
  const path = rail({ tail: 14 }), sketch = section();
  sketch.sideTags = { outer: ['o0', 'o1', 'o2', 'o3'], holes: [['a0', 'a1', 'a2', 'a3'], ['b0', 'b1', 'b2', 'b3']] };
  const initial = evaluateCadPart(document(path.path, sketch));
  const changed = { ...sketch, holes: [rectangle(1, -2.5, -1.5, true), sketch.holes[1]] };
  const edited = reevaluate(initial, { document: document(path.path, changed) });
  verify(edited.outputs[0], path, [[-2.5, -1.5], [1, 3]]);
  assert.deepEqual(identity(edited), identity(initial));
  for (const tag of [...sketch.sideTags.outer, ...sketch.sideTags.holes.flat()])
    assert.deepEqual(edited.outputs[0].brep.faces.filter(face => face.name.endsWith(`.side[${tag}]`)).map(face => face.name).sort(),
      ['bend', 'line', 'tail'].map(piece => `w.${piece}.side[${tag}]`));
  const outside = snapshot => snapshot.outputs[0].brep.faces.filter(face => sketch.sideTags.outer.some(tag => face.name.endsWith(`.side[${tag}]`)));
  assert.deepEqual(outside(edited), outside(initial));
  const reopened = loadCadPart(saveCadPart(edited));
  assert.deepEqual(reopened.outputs[0].brep, edited.outputs[0].brep);
  assert.deepEqual(reevaluate(reopened, { document: document(path.path, sketch) }).outputs[0].brep, initial.outputs[0].brep);
});

test('translated paired elbow tails preserve both windings and lane order at 30 and 120 degrees', () => {
  for (const degrees of [30, 120]) for (const clockwise of [[false, true], [true, false]]) {
    const path = rail({ degrees, tail: 80, entry: [32, -14, 18], tangent: [.6, .8, 0], inward: [-.8, .6, 0] });
    if (degrees === 120) assert.ok(dot(sub(path.end, path.entry), path.tangent) < 0);
    const intervals = [[1, 3], [-3, -1]], widths = [1.5, 2], center = [21.2, -7.1];
    const sketch = { ...section(intervals, widths, clockwise, center), plane: { origin: [5, 4, 3], normal: path.tangent, xAxis: path.inward } };
    verify(evaluateCadPart(document(path.path, sketch)).outputs[0], path, intervals, widths);
  }
});

test('paired elbow admission retains cover and web tolerance guards and leaves the prior native result intact', () => {
  const path = rail({ tail: 14 }), initial = evaluateCadPart(document(path.path)), saved = saveCadPart(initial);
  const refused = (sketch, code, reason, changedPath = path.path) => {
    assert.throws(() => reevaluate(initial, { document: document(changedPath, sketch) }),
      error => error instanceof CadPartError && error.feature === 'w' && error.code === code
        && error.message.includes('Exact line-arc-line rectangular sweep') && reason.test(error.message));
    assert.equal(saveCadPart(initial), saved);
  };
  const eccentric = section();
  eccentric.holes[0] = eccentric.holes[0].map(segment => ({ ...segment, start: [segment.start[0] + .1, segment.start[1]] }));
  refused(eccentric, 'GEOMETRY', /both cavities centered on the radial axis/);
  for (const widths of [[4, 2], [4 - 1e-6, 2]]) refused(section(undefined, widths), 'GEOMETRY', /strictly positive cover/);
  for (const intervals of [[[-5, -1], [1, 3]], [[-3, -1], [1, 5]]]) refused(section(intervals), 'GEOMETRY', /strictly positive cover/);
  for (const intervals of [[[-3, 0], [0, 3]], [[-3, .1], [0, 3]], [[-3, 3], [-1, 1]], [[-3, 0], [5e-7, 3]]])
    refused(section(intervals), 'GEOMETRY', /strictly positive axial web clearance/);
  const three = section();
  refused({ ...three, holes: [...three.holes, three.holes[0]] }, 'CAPABILITY', /two axis-aligned rectangular cavities/);
  const curved = section();
  curved.holes[0] = [{ kind: 'arc', center: [0, -2], start: [.5, -2], direction: 'ccw' }];
  refused(curved, 'CAPABILITY', /two axis-aligned rectangular cavities/);
  const narrow = [[-3, -2.5e-6], [2.5e-6, 3]];
  verify(evaluateCadPart(document(path.path, section(narrow))).outputs[0], path, narrow);
});

test('existing solid, single-aperture and two-aperture line-arc native bytes remain unchanged', () => {
  const cases = [
    [section(), 'da130969c537bcf5d0b9b55bd55da46d6406ffa01048b8b545c8cab803103dab'],
    [{ ...section(), holes: [] }, 'bf0f00cfa4282e846b6338a34e3b83f6196aa7a0a23df7bd35d3d83b523a2dda'],
    [section([[-1, 1]], [2]), '77e2c49f5f74c709396dc2d6aaf2cf83a01fbaf574da5d04a2a9488d518fc3ff'],
  ];
  for (const [sketch, expected] of cases) {
    const brep = evaluateCadPart(document(rail().path, sketch)).outputs[0].brep;
    assert.equal(createHash('sha256').update(JSON.stringify(brep)).digest('hex'), expected);
  }
});

test('original paired elbow outlet signed offsets preserve both apertures, native charts, joins, IDs and independent mass', () => {
  const path = rail({ tail: 14 }), sketch = section();
  sketch.sideTags = { outer: ['o0', 'o1', 'o2', 'o3'], holes: [['a0', 'a1', 'a2', 'a3'], ['b0', 'b1', 'b2', 'b3']] };
  const source = document(path.path, sketch), initial = evaluateCadPart(source), saved = saveCadPart(initial);
  const shifted = distance => ({ ...source, features: [...source.features,
    { id: 'move', kind: 'offset-face', target: 'w', face: 'w.end', distance }] });
  let previous = initial;
  for (const distance of [4, -4, 4]) {
    const changed = reevaluate(previous, { document: shifted(distance) });
    const moved = { ...path, tail: path.tail + distance, length: path.length + distance,
      end: add(path.end, scale(path.terminal, distance)) };
    verify(changed.outputs[0], moved);
    near(brepMassProperties(changed.outputs[0].brep, 1).volume - brepMassProperties(initial.outputs[0].brep, 1).volume, 32 * distance);
    assert.deepEqual(identity(changed), identity(initial));
    const fixed = brep => brep.faces.filter(face => face.name !== 'w.end' && !face.name.startsWith('w.tail.'));
    assert.deepEqual(fixed(changed.outputs[0].brep), fixed(initial.outputs[0].brep));
    const reopened = loadCadPart(saveCadPart(changed));
    assert.deepEqual(reopened.outputs[0].brep, changed.outputs[0].brep);
    assert.deepEqual(reevaluate(reopened, { document: source }).outputs[0].brep, initial.outputs[0].brep);
    previous = reopened;
  }
  for (const distance of [-14, -15, -13.99999]) {
    assert.throws(() => reevaluate(previous, { document: shifted(distance) }),
      error => error instanceof CadPartError && error.feature === 'move' && error.code === 'GEOMETRY'
        && /reach or cross the retained bend-to-outlet join/.test(error.message));
    assert.equal(saveCadPart(initial), saved);
  }
  const inlet = shifted(4);
  inlet.features.at(-1).face = 'w.start';
  assert.throws(() => evaluateCadPart(inlet), CadPartError);
  const wall = shifted(4);
  wall.features.at(-1).face = 'w.tail.side[o0]';
  assert.throws(() => evaluateCadPart(wall), CadPartError);
});

test('translated original paired elbow outlet frames and signed offsets retain authored lane order at both sweep limits', () => {
  for (const degrees of [30, 120]) {
    const path = rail({ degrees, tail: 14, entry: [32, -14, 18], tangent: [.6, .8, 0], inward: [-.8, .6, 0] });
    const intervals = [[1, 3], [-3, -1]], widths = [1.5, 2];
    const sketch = { ...section(intervals, widths, [false, true]), plane: { origin: [5, 4, 3], normal: path.tangent, xAxis: path.inward } };
    const source = document(path.path, sketch);
    for (const distance of [4, -4]) {
      const result = evaluateCadPart({ ...source, features: [...source.features,
        { id: 'move', kind: 'offset-face', target: 'w', face: 'w.end', distance }] });
      verify(result.outputs[0], { ...path, tail: path.tail + distance, length: path.length + distance,
        end: add(path.end, scale(path.terminal, distance)) }, intervals, widths);
    }
  }
});


test('paired elbow outlet native handle excludes other caps, old profile families and unbound body coefficients', () => {
  const path = rail({ tail: 14 }), sketch = section(), original = evaluateCadPart(document(path.path, sketch)).outputs[0].brep;
  const source = { id: 'w', mode: 'exact', path: path.path };
  const handle = exactPairedElbowOutletOffsetFrame(original, 'w.end', source);
  pointNear(handle.anchor, path.end);
  pointNear(handle.normal, path.terminal);
  assert.equal(exactPairedElbowOutletOffsetFrame(original, 'w.start', source), undefined);
  assert.equal(exactPairedElbowOutletOffsetFrame(original, 'w.end', { ...source, id: 'stale' }), undefined);
  assert.equal(exactPairedElbowOutletOffsetFrame(original, 'w.end', { ...source, mode: 'exact-straight' }), undefined);
  for (const holes of [[], [rectangle(1, -1, 1)]]) {
    const other = evaluateCadPart(document(path.path, { ...sketch, holes })).outputs[0].brep;
    assert.equal(exactPairedElbowOutletOffsetFrame(other, 'w.end', source), undefined);
  }
  const input = { ...source, outer: sketch.segments, holes: sketch.holes, xAxis: [1, 0, 0], yAxis: [0, 1, 0] };
  const unbound = structuredClone(original);
  unbound.vertices[0].tolerance *= 2;
  assert.ok(checkBrep(unbound, { strict: true }).valid);
  assert.equal(offsetExactPairedElbowOutletIfAdmitted(unbound, 'w.end', input, 4), undefined);
  assert.deepEqual(original, evaluateCadPart(document(path.path, sketch)).outputs[0].brep);
});
