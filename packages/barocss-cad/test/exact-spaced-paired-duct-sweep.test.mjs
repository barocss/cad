import assert from 'node:assert/strict';
import test from 'node:test';
import {
  brepMassProperties, CadPartError, checkBrep, curveDomain, evaluateCadPart, evaluateCurve, evaluateSurface,
  faceGeometry, joinCurves, loadCadPart, massPropertiesOf, measureBrepEdgeContinuity, reevaluate, saveCadPart,
} from '../dist/index.js';

const add = (a, b) => a.map((x, i) => x + b[i]);
const sub = (a, b) => a.map((x, i) => x - b[i]);
const scale = (a, s) => a.map(x => x * s);
const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const near = (actual, expected, tolerance = 1e-8) => assert.ok(Number.isFinite(actual)
  && Math.abs(actual - expected) <= tolerance, `${actual} vs ${expected} at ${tolerance}`);
const pointNear = (actual, expected) => near(Math.hypot(...sub(actual, expected)), 0);
const rectangle = (width, low, high, clockwise = false, center = [0, 0]) => {
  const points = [[-width / 2, low], [width / 2, low], [width / 2, high], [-width / 2, high]];
  return (clockwise ? [points[0], points[3], points[2], points[1]] : points)
    .map(point => ({ kind: 'line', start: add(point, center) }));
};
const section = (intervals = [[-3, -1], [1, 3]], widths = [2, 2], clockwise = [true, false], center = [0, 0]) => ({
  id: 's', kind: 'sketch', profile: 'loop', segments: rectangle(4, -5, 5, false, center),
  holes: intervals.map(([low, high], i) => rectangle(widths[i], low, high, clockwise[i], center)),
});
function arc(id, start, tangent, inward, radius, degrees) {
  const angle = degrees * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
  const end = add(start, add(scale(tangent, radius * s), scale(inward, radius * (1 - c))));
  return { start, end, tangent, inward, radius, angle, length: radius * angle,
    center: add(start, scale(inward, radius)), terminal: add(scale(tangent, c), scale(inward, s)),
    exitInward: sub(scale(inward, c), scale(tangent, s)),
    curve: { kind: 'curve', id, degree: 2, knots: [0, 0, 0, 1, 1, 1], weights: [1, Math.cos(angle / 2), 1],
      controlPoints: [start, add(start, scale(tangent, radius * Math.tan(angle / 2))), end] } };
}
function rail({ firstAngle = 90, secondAngle = 90, firstRadius = 12, secondRadius = 18, length = 8,
  start = [0, 0, 0], tangent = [1, 0, 0], inward = [0, 1, 0], turn = -1 } = {}) {
  const first = arc('first', start, tangent, inward, firstRadius, firstAngle);
  const secondStart = add(first.end, scale(first.terminal, length));
  const line = { kind: 'curve', id: 'line', degree: 2, knots: [0, 0, 0, 1, 1, 1], weights: [1, 1, 1],
    controlPoints: [first.end, add(first.end, scale(first.terminal, length / 2)), secondStart] };
  const second = arc('second', secondStart, first.terminal, scale(first.exitInward, turn), secondRadius, secondAngle);
  return { first, second, length, axis: cross(tangent, inward),
    path: joinCurves(joinCurves(first.curve, line, { curveId: 'arcLine' }).curve, second.curve, { curveId: 'arcLineArc' }).curve };
}
const document = (path, sketch = section()) => ({ format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {},
  features: [sketch, { kind: 'sweep-curve', id: 'w', sketch: 's', mode: 'exact', path }] });
const identity = snapshot => Object.fromEntries(['bodies', 'shells', 'faces', 'loops', 'coedges', 'edges', 'vertices']
  .map(key => [key, snapshot.outputs[0].brep[key].map(({ id, name }) => [id, name])]));
const lane = face => {
  for (let index = 0; index < 2; index++)
    if (face.surface.id.includes(`_hole${index}_`) || face.surface.id.startsWith(`w_line_w0_0_${index + 1}_`)) return index + 1;
  return 0;
};

function verify(output, path, intervals = [[-3, -1], [1, 3]], widths = [2, 2]) {
  const { brep } = output, report = checkBrep(brep, { strict: true });
  assert.ok(report.valid, report.issues.join('\n'));
  assert.deepEqual(brep.source, { family: 'sweep-curve', id: 'w' });
  assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 38, loops: 42, coedges: 168, edges: 84, vertices: 48 });
  assert.equal(report.topology.length, 1);
  assert.equal(report.topology[0].shells, 1);
  assert.equal(report.topology[0].genus, 2);
  assert.ok(report.maximumPcurveGap < 1e-8);
  assert.equal(new Set(brep.faces.map(face => face.name)).size, 38);
  // Integrate the authored section independently. Both lanes have zero radial first moment.
  const areas = intervals.map(([low, high], i) => widths[i] * (high - low));
  const area = 40 - areas.reduce((sum, value) => sum + value, 0);
  const radialSecond = (160 / 3 - intervals.reduce((sum, [low, high], i) => sum + widths[i] ** 3 * (high - low) / 12, 0)) / area;
  const axial = -intervals.reduce((sum, [low, high], i) => sum + areas[i] * (low + high) / 2, 0) / area;
  const length = path.first.length + path.length + path.second.length;
  let moment = scale(add(path.first.end, scale(path.first.terminal, path.length / 2)), path.length);
  for (const bend of [path.first, path.second]) {
    const integralInward = sub(scale(bend.inward, Math.sin(bend.angle)), scale(bend.tangent, 1 - Math.cos(bend.angle)));
    moment = add(moment, scale(sub(scale(bend.center, bend.angle), scale(integralInward,
      bend.radius + radialSecond / bend.radius)), bend.radius));
  }
  const centroid = add(scale(moment, 1 / length), scale(path.axis, axial));
  for (const mass of [massPropertiesOf(output), brepMassProperties(brep, 1)]) {
    near(mass.volume, area * length, 1e-7);
    pointNear(mass.centroid, centroid);
  }
  for (const piece of ['first', 'line', 'second']) {
    const walls = brep.faces.filter(face => face.name.startsWith(`w.${piece}.`));
    assert.equal(walls.length, 12);
    for (const index of [0, 1, 2]) assert.equal(walls.filter(face => lane(face) === index).length, 4);
  }
  const geometry = new Map(brep.faces.map(face => [face.id, faceGeometry(face)]));
  assert.equal([...geometry.values()].filter(face => face.kind === 'cylinder').length, 12);
  for (const end of ['start', 'end']) {
    const face = brep.faces.find(face => face.name === `w.${end}`);
    assert.ok(face);
    const loops = face.loops.map(id => brep.loops.find(loop => loop.id === id));
    assert.deepEqual(loops.map(loop => loop.kind).sort(), ['inner', 'inner', 'outer']);
    const at = end === 'start' ? path.first.start : path.second.end;
    const tangent = end === 'start' ? path.first.tangent : path.second.terminal;
    const radial = end === 'start' ? path.first.inward : scale(path.second.exitInward, -1);
    const apertureBounds = [];
    for (const loop of loops) {
      assert.equal(loop.coedges.length, 4);
      const points = loop.coedges.flatMap(id => brep.edges.find(edge => edge.id === brep.coedges.find(use => use.id === id).edge).curve.controlPoints);
      for (const point of points) near(dot(sub(point, at), tangent), 0);
      const values = points.map(point => [dot(sub(point, at), radial), dot(sub(point, at), path.axis)]);
      const bounds = [Math.min(...values.map(point => point[0])), Math.max(...values.map(point => point[0])),
        Math.min(...values.map(point => point[1])), Math.max(...values.map(point => point[1]))];
      if (loop.kind === 'inner') apertureBounds.push(bounds);
      else bounds.forEach((value, i) => near(value, [-2, 2, -5, 5][i]));
    }
    apertureBounds.sort((a, b) => a[2] - b[2]);
    const expected = intervals.map(([low, high], i) => [-widths[i] / 2, widths[i] / 2, low, high]).sort((a, b) => a[2] - b[2]);
    apertureBounds.forEach((bounds, i) => bounds.forEach((value, j) => near(value, expected[i][j])));
  }
  for (const piece of ['first', 'second']) {
    const seams = brep.edges.filter(edge => edge.name?.includes(`w.${piece}.`) && edge.name.includes('w.line.'));
    assert.equal(seams.length, 12);
    const counts = [0, 0, 0];
    for (const edge of seams) {
      const uses = brep.coedges.filter(use => use.edge === edge.id), domain = curveDomain(edge.curve);
      assert.equal(uses.length, 2);
      assert.notEqual(uses[0].sense, uses[1].sense);
      const owners = uses.map(use => brep.faces.find(face => face.loops.includes(use.loop)));
      assert.equal(lane(owners[0]), lane(owners[1]));
      counts[lane(owners[0])]++;
      for (const [index, use] of uses.entries()) {
        assert.equal(use.twin, uses[1 - index].id);
        assert.ok(use.pcurve, edge.name);
        assert.deepEqual(curveDomain(use.pcurve), domain);
        for (const fraction of [0, .19, .5, .87, 1]) {
          const at = domain[0] + fraction * (domain[1] - domain[0]), [u, v] = evaluateCurve(use.pcurve, at);
          pointNear(evaluateSurface(owners[index].surface, u, v), evaluateCurve(edge.curve, at));
        }
      }
      const continuity = measureBrepEdgeContinuity(brep, edge.id, { curvature: true });
      assert.equal(continuity.status, 'measured', JSON.stringify(continuity));
      near(continuity.maximumAngleDegrees, 0);
      assert.equal(continuity.curvature.status, 'measured');
      const bend = owners.find(face => face.name.startsWith(`w.${piece}.`)), surface = geometry.get(bend.id);
      near(continuity.curvature.maximumDifference, surface.kind === 'cylinder' ? 1 / surface.r : 0);
    }
    assert.deepEqual(counts, [4, 4, 4]);
  }
}

test('the spaced opposite-turn paired duct retains both open caps, 24 exact tangent joins and independent volume', () => {
  const path = rail(), initial = evaluateCadPart(document(path.path));
  verify(initial.outputs[0], path);
  near(massPropertiesOf(initial.outputs[0]).volume, 32 * (15 * Math.PI + 8));
  assert.deepEqual(loadCadPart(saveCadPart(initial)).outputs[0].brep, initial.outputs[0].brep);
});

test('an asymmetric lane edit retains authored ownership, topology IDs and the other lane through reopen', () => {
  const path = rail(), sketch = section();
  sketch.sideTags = { outer: ['e1', 'e2', 'e3', 'e4'], holes: [['e5', 'e6', 'e7', 'e8'], ['e9', 'e10', 'e11', 'e12']] };
  const initial = evaluateCadPart(document(path.path, sketch));
  const changed = { ...sketch, holes: [rectangle(2, -2.5, -1.5, true), sketch.holes[1]] };
  const edited = reevaluate(initial, { document: document(path.path, changed) });
  verify(edited.outputs[0], path, [[-2.5, -1.5], [1, 3]]);
  near(massPropertiesOf(edited.outputs[0]).volume, 34 * (15 * Math.PI + 8));
  assert.deepEqual(identity(edited), identity(initial));
  for (const tag of [...sketch.sideTags.outer, ...sketch.sideTags.holes.flat()])
    assert.deepEqual(edited.outputs[0].brep.faces.filter(face => face.name.endsWith(`.side[${tag}]`)).map(face => face.name).sort(),
      ['first', 'line', 'second'].map(piece => `w.${piece}.side[${tag}]`));
  const unchanged = snapshot => snapshot.outputs[0].brep.faces.filter(face => lane(face) !== 1
    && ['first', 'line', 'second'].some(piece => face.name.startsWith(`w.${piece}.`)));
  assert.deepEqual(unchanged(edited), unchanged(initial));
  const reopened = loadCadPart(saveCadPart(edited));
  assert.deepEqual(reopened.outputs[0].brep, edited.outputs[0].brep);
  assert.deepEqual(reevaluate(reopened, { document: document(path.path, sketch) }).outputs[0].brep, initial.outputs[0].brep);
});

test('translated oblique paired S-bends preserve authored lane order and either winding at the arc limits', () => {
  for (const [firstAngle, secondAngle] of [[30, 120], [120, 30]]) for (const clockwise of [[true, false], [false, true]]) {
    const path = rail({ firstAngle, secondAngle, start: [32, -14, 18], tangent: [.6, .8, 0], inward: [-.8, .6, 0] });
    const intervals = [[1, 3], [-3, -1]], widths = [1.5, 2];
    const sketch = { ...section(intervals, widths, clockwise, [21.2, -7.1]),
      plane: { origin: [5, 4, 3], normal: path.first.tangent, xAxis: path.first.inward } };
    verify(evaluateCadPart(document(path.path, sketch)).outputs[0], path, intervals, widths);
  }
});

test('paired S-bend admission rejects lost cover, radial offset, axial contact and unsupported paths without state changes', () => {
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
  for (const intervals of [[[-3, 0], [0, 3]], [[-3, .1], [0, 3]], [[-3, 0], [5e-7, 3]]])
    refused(section(intervals), 'GEOMETRY', /strictly positive axial web clearance/);
  const three = section();
  refused({ ...three, holes: [...three.holes, three.holes[0]] }, 'CAPABILITY', /two axis-aligned rectangular cavities/);
  refused({ ...section(), holes: [[{ kind: 'arc', center: [0, -2], start: [.5, -2], direction: 'ccw' }], section().holes[1]] },
    'CAPABILITY', /two axis-aligned rectangular cavities/);
  refused(section(), 'CAPABILITY', /one centered rectangular opening/, rail({ turn: 1 }).path);
  const twoArcs = joinCurves(path.first.curve, arc('second', path.first.end, path.first.terminal,
    scale(path.first.exitInward, -1), 18, 90).curve, { curveId: 'twoArcs' }).curve;
  refused(section(), 'CAPABILITY', /one centered rectangular opening/, twoArcs);
  for (const radii of [{ firstRadius: 2 }, { secondRadius: 2 }])
    refused(section(), 'PARAMETER', /radial half-width smaller than both path radii/, rail(radii).path);
  const narrow = [[-3, -2.5e-6], [2.5e-6, 3]];
  verify(evaluateCadPart(document(path.path, section(narrow))).outputs[0], path, narrow);
});
