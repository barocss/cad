import assert from 'node:assert/strict';
import test from 'node:test';
import {
  brepMassProperties, CadNumericPolicy, CadPartError, checkBrep, curveDomain, evaluateCadPart, evaluateCurve, evaluateSurface,
  faceGeometry, joinCurves, loadCadPart, massPropertiesOf, measureBrepEdgeContinuity, reevaluate, saveCadPart, surfaceDomain,
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
const tags = { outer: ['e1', 'e2', 'e3', 'e4'], holes: [['e5', 'e6', 'e7', 'e8'], ['e9', 'e10', 'e11', 'e12']] };
const section = (intervals = [[-3, -1], [1, 3]], widths = [2, 2], clockwise = [true, false], center = [0, 0]) => ({
  id: 's', kind: 'sketch', profile: 'loop', segments: rectangle(4, -5, 5, false, center),
  holes: intervals.map(([low, high], i) => rectangle(widths[i], low, high, clockwise[i], center)), sideTags: tags,
});
function arc(id, start, tangent, inward, radius, degrees) {
  const angle = degrees * Math.PI / 180, c = degrees === 90 ? 0 : Math.cos(angle), s = Math.sin(angle);
  const end = add(start, add(scale(tangent, radius * s), scale(inward, radius * (1 - c))));
  return { start, end, tangent, inward, radius, angle, length: radius * angle,
    center: add(start, scale(inward, radius)), terminal: add(scale(tangent, c), scale(inward, s)),
    exitInward: sub(scale(inward, c), scale(tangent, s)),
    curve: { kind: 'curve', id, degree: 2, knots: [0, 0, 0, 1, 1, 1], weights: [1, Math.cos(angle / 2), 1],
      controlPoints: [start, add(start, scale(tangent, radius * Math.tan(angle / 2))), end] } };
}
function rail({ firstAngle = 90, secondAngle = 90, firstRadius = 12, secondRadius = 18,
  start = [0, 0, 0], tangent = [1, 0, 0], inward = [0, 1, 0], turn = -1 } = {}) {
  const first = arc('first', start, tangent, inward, firstRadius, firstAngle);
  const second = arc('second', first.end, first.terminal, scale(first.exitInward, turn), secondRadius, secondAngle);
  return { first, second, turn, axis: cross(tangent, inward), path: joinCurves(first.curve, second.curve, { curveId: 'twoArcs' }).curve };
}
const document = (path, sketch = section()) => ({ format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {},
  features: [sketch, { kind: 'sweep-curve', id: 'w', sketch: 's', mode: 'exact', path }] });
const identity = snapshot => Object.fromEntries(['bodies', 'shells', 'faces', 'loops', 'coedges', 'edges', 'vertices']
  .map(key => [key, snapshot.outputs[0].brep[key].map(({ id, name }) => [id, name])]));
const lane = face => {
  for (let index = 0; index < 2; index++) if (face.surface.id.includes(`_hole${index}_`)) return index + 1;
  return 0;
};

// For every material point, not only the centerline, dot(P-J,t) is -rho1 sin(delta)
// before the join and +rho2 sin(delta) after it. Positive radial clearance and
// 30..120 degree spans put their interiors in opposite half-spaces. Axial offsets
// have zero projection on t. The only common points lie on the three-loop join cap.
function verifyEnvelope(brep, path) {
  for (const piece of ['first', 'second']) {
    const stations = [];
    for (const face of brep.faces.filter(face => face.name.startsWith(`w.${piece}.`))) {
      const points = [];
      if (faceGeometry(face).kind === 'plane') {
        // Affine carriers extend outside their trim; inspect their actual native boundaries.
        for (const loopId of face.loops) for (const useId of brep.loops.find(loop => loop.id === loopId).coedges) {
          const use = brep.coedges.find(use => use.id === useId), edge = brep.edges.find(edge => edge.id === use.edge);
          const [low, high] = curveDomain(edge.curve);
          for (const fraction of [0, .17, .5, .83, 1]) points.push(evaluateCurve(edge.curve, low + fraction * (high - low)));
        }
      } else {
        const { u, v } = surfaceDomain(face.surface);
        for (const s of [0, .17, .5, .83, 1]) for (const t of [0, .24, .5, .69, 1])
          points.push(evaluateSurface(face.surface, u[0] + s * (u[1] - u[0]), v[0] + t * (v[1] - v[0])));
      }
      for (const point of points) {
        const station = dot(sub(point, path.first.end), path.first.terminal);
        assert.ok((piece === 'first' ? -station : station) >= -1e-8, `${face.name}: ${station}`);
        assert.ok(Math.abs(dot(sub(point, path.first.start), path.axis)) <= 5 + 1e-8);
        stations.push(station);
      }
    }
    near(piece === 'first' ? Math.max(...stations) : Math.min(...stations), 0);
    assert.ok(piece === 'first' ? Math.min(...stations) < 0 : Math.max(...stations) > 0);
  }
}

function verify(output, path, intervals = [[-3, -1], [1, 3]], widths = [2, 2], angularTolerance = 1e-8, relativeCurvatureTolerance = 0) {
  const { brep } = output, report = checkBrep(brep, { strict: true });
  assert.ok(report.valid, report.issues.join('\n'));
  assert.deepEqual(brep.source, { family: 'sweep-curve', id: 'w' });
  assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 26, loops: 30, coedges: 120, edges: 60, vertices: 36 });
  assert.deepEqual(report.topology.map(({ shells, genus }) => [shells, genus]), [[1, 2]]);
  assert.ok(report.maximumPcurveGap < 1e-8);
  verifyEnvelope(brep, path);
  // Integrate the authored section and carrier analytically, independently of the producers.
  const areas = intervals.map(([low, high], i) => widths[i] * (high - low));
  const area = 40 - areas.reduce((sum, value) => sum + value, 0);
  const radialSecond = (160 / 3 - intervals.reduce((sum, [low, high], i) => sum + widths[i] ** 3 * (high - low) / 12, 0)) / area;
  const axial = -intervals.reduce((sum, [low, high], i) => sum + areas[i] * (low + high) / 2, 0) / area;
  const length = path.first.length + path.second.length;
  let moment = [0, 0, 0];
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
  assert.equal(new Set(brep.faces.map(face => face.name)).size, 26);
  const geometry = new Map(brep.faces.map(face => [face.id, faceGeometry(face)]));
  assert.equal([...geometry.values()].filter(face => face.kind === 'cylinder').length, 12);
  for (const piece of ['first', 'second']) {
    const walls = brep.faces.filter(face => face.name.startsWith(`w.${piece}.`));
    assert.equal(walls.length, 12);
    for (const index of [0, 1, 2]) {
      const names = (index ? tags.holes[index - 1] : tags.outer).map(tag => `w.${piece}.side[${tag}]`);
      assert.deepEqual(walls.filter(face => lane(face) === index).map(face => face.name).sort(), names.sort());
    }
  }
  for (const end of ['start', 'end']) {
    const face = brep.faces.find(face => face.name === `w.${end}`), start = end === 'start';
    assert.ok(face);
    const loops = face.loops.map(id => brep.loops.find(loop => loop.id === id));
    assert.deepEqual(loops.map(loop => loop.kind).sort(), ['inner', 'inner', 'outer']);
    const center = start ? path.first.start : path.second.end, normal = start ? scale(path.first.tangent, -1) : path.second.terminal;
    const radial = start ? path.first.inward : scale(path.second.exitInward, path.turn), plane = geometry.get(face.id);
    assert.equal(plane.kind, 'plane'); pointNear(plane.n, normal); near(dot(sub(plane.o, center), normal), 0);
    const bounds = [];
    for (const loop of loops) {
      assert.equal(loop.coedges.length, 4);
      const uses = loop.coedges.map(id => brep.coedges.find(use => use.id === id));
      const edges = uses.map(use => brep.edges.find(edge => edge.id === use.edge));
      const points = edges.flatMap(edge => edge.curve.controlPoints);
      for (const point of points) near(dot(sub(point, center), normal), 0);
      const radialValues = points.map(point => dot(sub(point, center), radial)), axialValues = points.map(point => dot(sub(point, center), path.axis));
      const box = [Math.min(...radialValues), Math.max(...radialValues), Math.min(...axialValues), Math.max(...axialValues)];
      if (loop.kind === 'inner') bounds.push(box);
      else box.forEach((value, i) => near(value, [-2, 2, -5, 5][i]));
      let signedArea = 0;
      for (const [index, edge] of edges.entries()) {
        const [a, b] = edge.curve.controlPoints.map(point => sub(point, center));
        signedArea += (uses[index].sense === 'forward' ? 1 : -1) * dot(cross(a, b), normal) / 2;
      }
      near(signedArea, (loop.kind === 'inner' ? -1 : 1) * (box[1] - box[0]) * (box[3] - box[2]));
    }
    bounds.sort((a, b) => a[2] - b[2]);
    const expected = intervals.map(([low, high], i) => [-widths[i] / 2, widths[i] / 2, low, high]).sort((a, b) => a[2] - b[2]);
    bounds.forEach((box, i) => box.forEach((value, j) => near(value, expected[i][j])));
  }
  const seams = brep.edges.filter(edge => edge.name?.includes('w.first.') && edge.name.includes('w.second.'));
  assert.equal(seams.length, 12);
  const counts = [0, 0, 0];
  for (const edge of seams) {
    const uses = brep.coedges.filter(use => use.edge === edge.id), domain = curveDomain(edge.curve);
    assert.equal(uses.length, 2); assert.notEqual(uses[0].sense, uses[1].sense);
    const owners = uses.map(use => brep.faces.find(face => face.loops.includes(use.loop)));
    assert.deepEqual(owners.map(face => face.name.split('.')[1]).sort(), ['first', 'second']);
    assert.equal(lane(owners[0]), lane(owners[1])); counts[lane(owners[0])]++;
    assert.equal(owners[0].name.split('.side')[1], owners[1].name.split('.side')[1]);
    for (const [index, use] of uses.entries()) {
      assert.equal(use.twin, uses[1 - index].id); assert.ok(use.pcurve);
      assert.deepEqual(curveDomain(use.pcurve), domain);
      for (const fraction of [0, .19, .5, .87, 1]) {
        const at = domain[0] + fraction * (domain[1] - domain[0]), [u, v] = evaluateCurve(use.pcurve, at);
        pointNear(evaluateSurface(owners[index].surface, u, v), evaluateCurve(edge.curve, at));
      }
    }
    const continuity = measureBrepEdgeContinuity(brep, edge.id, { curvature: true });
    assert.equal(continuity.status, 'measured'); near(continuity.maximumAngleDegrees, 0, angularTolerance);
    assert.equal(continuity.curvature.status, 'measured');
    const supports = owners.map(owner => geometry.get(owner.id));
    const expected = supports[0].kind === 'cylinder' ? Math.abs(1 / supports[0].r - path.turn / supports[1].r) : 0;
    near(continuity.curvature.maximumDifference, expected, Math.max(1e-8, relativeCurvatureTolerance * Math.max(1, expected)));
    if (supports[0].kind === 'cylinder') for (const sample of continuity.curvature.samples) assert.equal(Math.sign(sample.first * sample.second), path.turn);
  }
  assert.deepEqual(counts, [4, 4, 4]);
}

for (const turn of [-1, 1]) test(`direct ${turn === 1 ? 'same-turn' : 'opposite-turn'} paired ducts retain both physical mouths, 12 charted joins and independent mass`, () => {
  const path = rail({ turn }), initial = evaluateCadPart(document(path.path));
  verify(initial.outputs[0], path);
  near(massPropertiesOf(initial.outputs[0]).volume, 480 * Math.PI);
  // Each quarter bend contributes q=19/12 mm² once to its radial material moment.
  // Opposite turns cancel the X terms; same turns add them twice. Both cancel in Y.
  pointNear(brepMassProperties(initial.outputs[0].brep, 1).centroid,
    [turn === 1 ? (468 + 19 / 6 - 54 * Math.PI) / (15 * Math.PI) : 18 - 12 / Math.PI, 12 + 12 / Math.PI, 0]);
  const end = initial.outputs[0].brep.faces.find(face => face.name === 'w.end');
  pointNear(faceGeometry(end).n, [-turn, 0, 0]);
  pointNear(path.second.end, [turn === 1 ? -6 : 30, 30, 0]);
  assert.deepEqual(loadCadPart(saveCadPart(initial)).outputs[0].brep, initial.outputs[0].brep);
});

for (const turn of [-1, 1]) test(`a ${turn === 1 ? 'same-turn' : 'opposite-turn'} asymmetric lane edit preserves all native IDs and the other lane through reopen and restore`, () => {
  const path = rail({ turn }), sketch = section(), initial = evaluateCadPart(document(path.path, sketch)), before = saveCadPart(initial);
  const edited = reevaluate(initial, { document: document(path.path, { ...sketch, holes: [rectangle(1.5, -2.5, -1.5, true), sketch.holes[1]] }) });
  verify(edited.outputs[0], path, [[-2.5, -1.5], [1, 3]], [1.5, 2]);
  assert.deepEqual(identity(edited), identity(initial));
  const unchanged = snapshot => snapshot.outputs[0].brep.faces.filter(face => lane(face) !== 1 && /w\.(first|second)\./.test(face.name));
  assert.deepEqual(unchanged(edited), unchanged(initial));
  assert.equal(saveCadPart(initial), before);
  const reopened = loadCadPart(saveCadPart(edited));
  assert.deepEqual(reopened.outputs[0].brep, edited.outputs[0].brep);
  assert.deepEqual(reevaluate(reopened, { document: document(path.path, sketch) }).outputs[0].brep, initial.outputs[0].brep);
});

for (const turn of [-1, 1]) test(`translated oblique ${turn === 1 ? 'same-turn' : 'opposite-turn'} arc limits retain radial X or Y, reversed lane order, either winding and near-axis clearance`, () => {
  for (const [firstAngle, secondAngle] of [[30, 120], [120, 30], [120, 120]])
    for (const clockwise of [[true, false], [false, true]]) for (const radialY of [false, true]) {
    const path = rail({ turn, firstAngle, secondAngle, firstRadius: 2.00001, secondRadius: 2.00002,
      start: [32, -14, 18], tangent: [.6, .8, 0], inward: [-.8, .6, 0] });
    const intervals = [[1, 3], [-3, -1]], widths = [1.5, 2];
    const sketch = { ...section(intervals, widths, clockwise, [21.2, -7.1]),
      plane: { origin: [5, 4, 3], normal: path.first.tangent, xAxis: path.first.inward } };
    if (radialY) {
      sketch.segments = rectangle(10, -2, 2);
      sketch.holes = intervals.map(([low, high], i) => rectangle(high - low, -widths[i] / 2, widths[i] / 2, clockwise[i], [-(low + high) / 2, 0]));
      sketch.plane.xAxis = scale(path.axis, -1);
    }
    // Existing comparison policy only: near-axis cylinders amplify derivative roundoff.
    verify(evaluateCadPart(document(path.path, sketch)).outputs[0], path, intervals, widths,
      CadNumericPolicy.relativeComparison * 180 / Math.PI, CadNumericPolicy.relativeComparison);
  }
});

for (const turn of [-1, 1]) test(`${turn === 1 ? 'same-turn' : 'opposite-turn'} paired admission preserves the prior solid on lost cover, radial offset, touching lanes and unsupported rails`, () => {
  const path = rail({ turn }), initial = evaluateCadPart(document(path.path)), saved = saveCadPart(initial);
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
  refused({ ...three, holes: [...three.holes, three.holes[0]], sideTags: undefined }, 'CAPABILITY', /two axis-aligned rectangular cavities/);
  refused({ ...section(), holes: [[{ kind: 'arc', center: [0, -2], start: [.5, -2], direction: 'ccw' }], section().holes[1]], sideTags: undefined },
    'CAPABILITY', /two axis-aligned rectangular cavities/);
  // A true or tolerance-equivalent single carrier stays on the existing single-arc route.
  for (const secondRadius of [12, 12 + 5e-8]) for (const angle of [45, 90])
    refused(section(), 'CAPABILITY', /at most one circular hole/, rail({ turn: 1, firstAngle: angle, secondAngle: angle, secondRadius }).path);
  for (const radii of [{ firstRadius: 2 }, { secondRadius: 2 }])
    refused(section(), 'PARAMETER', /radial half-width smaller than both path radii/, rail({ ...radii, turn }).path);
  refused({ ...section(), plane: { origin: [0, 0, 0], normal: [1, 0, 0], xAxis: [0, Math.SQRT1_2, Math.SQRT1_2] } },
    'CAPABILITY', /original axes aligned to the bend radial and binormal/);
  const narrow = [[-3, -2.5e-6], [2.5e-6, 3]];
  verify(evaluateCadPart(document(path.path, section(narrow))).outputs[0], path, narrow);
  const joinedWith = (tangent, inward) => joinCurves(path.first.curve,
    arc('changed', path.first.end, tangent, inward, 18, 90).curve, { curveId: 'changedPair' }).curve;
  refused(section(), 'GEOMETRY', /common forward tangent/, joinedWith([1, 0, 0], [0, 1, 0]));
  refused(section(), 'GEOMETRY', /common forward tangent/, joinedWith(scale(path.first.terminal, -1), [-1, 0, 0]));
  refused(section(), 'CAPABILITY', /two coplanar circular arcs/, joinedWith(path.first.terminal, [0, 0, 1]));
  for (const angles of [{ firstAngle: 29 }, { secondAngle: 121 }])
    refused(section(), 'CAPABILITY', /at most one circular hole/, rail({ ...angles, turn }).path);
});

test('same-turn paired ducts also retain strict charts and material moments when the first radius is larger', () => {
  const path = rail({ turn: 1, firstRadius: 18, secondRadius: 12 }), initial = evaluateCadPart(document(path.path));
  verify(initial.outputs[0], path);
  const reopened = loadCadPart(saveCadPart(initial));
  assert.deepEqual(reopened.outputs[0].brep, initial.outputs[0].brep);
});
