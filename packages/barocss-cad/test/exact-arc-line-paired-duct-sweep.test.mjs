import assert from 'node:assert/strict';
import test from 'node:test';
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
const near = (a, b, tolerance = 1e-8) => assert.ok(Number.isFinite(a) && Math.abs(a - b) <= tolerance, `${a} vs ${b}`);
const pointNear = (a, b) => near(Math.hypot(...sub(a, b)), 0);
const rectangle = (width, low, high, clockwise = false, center = [0, 0]) => {
  const points = [[-width / 2, low], [width / 2, low], [width / 2, high], [-width / 2, high]];
  return (clockwise ? [points[0], points[3], points[2], points[1]] : points).map(point => ({ kind: 'line', start: add(point, center) }));
};
function rail({ degrees = 90, radius = 20, length = 10, start = [32, 14, -18], tangent = [.6, .8, 0], inward = [0, 0, 1] } = {}) {
  const angle = degrees * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle), axis = cross(tangent, inward);
  const join = add(start, scale(add(scale(tangent, s), scale(inward, 1 - c)), radius));
  const atExit = add(scale(tangent, c), scale(inward, s)), end = add(join, scale(atExit, length));
  const span = (id, points, weight) => ({ kind: 'curve', id, degree: 2, knots: [0, 0, 0, 1, 1, 1], controlPoints: points, weights: [1, weight, 1] });
  const arc = span('arc', [start, add(start, scale(tangent, radius * Math.tan(angle / 2))), join], Math.cos(angle / 2));
  const line = span('line', [join, add(join, scale(atExit, length / 2)), end], 1);
  const rotate = v => add(add(scale(v, c), scale(cross(axis, v), s)), scale(axis, dot(axis, v) * (1 - c)));
  return { path: { ...joinCurves(arc, line, { curveId: 'arcLine' }).curve, knots: [-3, -3, -3, 1, 1, 2, 2, 2] },
    start, join, end, tangent, inward, atExit, axis, rotate, angle, radius, length, center: add(start, scale(inward, radius)) };
}
function sketch(path, { radialY = false, sign = 1, clockwise = [true, false], shifted = false, tagged = true,
  intervals = [[-3, -1], [1, 3]], widths = [2, 2], center = [21.2, -7.1] } = {}) {
  const holes = intervals.map(([low, high], index) => {
    const loop = radialY ? rectangle(high - low, -widths[index] / 2, widths[index] / 2, clockwise[index], add(center, [(low + high) / 2, 0]))
      : rectangle(widths[index], low, high, clockwise[index], center);
    if (shifted) loop.push(loop.shift());
    return loop;
  });
  return { id: 's', kind: 'sketch', profile: 'loop', segments: radialY ? rectangle(10, -2, 2, false, center) : rectangle(4, -5, 5, false, center), holes,
    plane: { origin: [5, 4, 3], normal: path.tangent, xAxis: scale(radialY ? path.axis : path.inward, sign) },
    ...(tagged ? { sideTags: { outer: ['outside-a', 'outside-b', 'outside-c', 'outside-d'],
      holes: [['lower-a', 'lower-b', 'lower-c', 'lower-d'], ['upper-a', 'upper-b', 'upper-c', 'upper-d']] } } : {}) };
}
const document = (path, section) => ({ format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {},
  features: [section, { id: 'w', kind: 'sweep-curve', sketch: 's', mode: 'exact', path }] });
const identity = snapshot => Object.fromEntries(['bodies', 'shells', 'faces', 'loops', 'coedges', 'edges', 'vertices']
  .map(key => [key, snapshot.outputs[0].brep[key].map(({ id, name }) => [id, name])]));

function verify(output, path, section) {
  const { brep } = output, report = checkBrep(brep, { strict: true });
  assert.ok(report.valid, report.issues.join('\n'));
  assert.deepEqual(brep.source, { family: 'sweep-curve', id: 'w' });
  assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 26, loops: 30, coedges: 120, edges: 60, vertices: 36 });
  assert.deepEqual(report.topology.map(({ shells, genus }) => [shells, genus]), [[1, 2]]);
  const loops = [section.segments, ...section.holes], center = scale(add(section.segments[0].start, section.segments[2].start), .5);
  const x = section.plane.xAxis, y = cross(path.tangent, x);
  const side = (loop, i) => {
    const tags = loop ? section.sideTags?.holes?.[loop - 1] : section.sideTags?.outer;
    return tags ? `.side[${tags[i]}]` : loop ? `.hole${loop - 1}.side${i}` : `.side${i}`;
  };
  const atSide = (loop, index, at, rotated) => {
    const midpoint = sub(scale(add(loops[loop][index].start, loops[loop][(index + 1) % 4].start), .5), center);
    const offset = add(scale(x, midpoint[0]), scale(y, midpoint[1]));
    return add(at, rotated ? path.rotate(offset) : offset);
  };
  const areas = [], radialSecond = [], axialMeans = [];
  for (const loop of loops) {
    const offsets = loop.map(({ start }) => sub(start, center));
    const world = offsets.map(([u, v]) => add(scale(x, u), scale(y, v)));
    const radial = world.map(point => dot(point, path.inward)), axial = world.map(point => dot(point, path.axis));
    const width = Math.max(...radial) - Math.min(...radial), height = Math.max(...axial) - Math.min(...axial);
    areas.push(width * height); radialSecond.push(width * height * width ** 2 / 12);
    axialMeans.push((Math.min(...axial) + Math.max(...axial)) / 2);
  }
  const area = areas[0] - areas[1] - areas[2], q = (radialSecond[0] - radialSecond[1] - radialSecond[2]) / area;
  const mean = -(areas[1] * axialMeans[1] + areas[2] * axialMeans[2]) / area, length = path.radius * path.angle + path.length;
  const N = sub(scale(path.inward, Math.sin(path.angle)), scale(path.tangent, 1 - Math.cos(path.angle)));
  const arcMoment = scale(sub(scale(path.center, path.angle), scale(N, path.radius + q / path.radius)), path.radius);
  const lineMoment = scale(add(path.join, scale(path.atExit, path.length / 2)), path.length);
  const centroid = add(scale(add(arcMoment, lineMoment), 1 / length), scale(path.axis, mean));
  for (const props of [massPropertiesOf(output), brepMassProperties(brep, 1)]) {
    near(props.volume, area * length, 1e-7); pointNear(props.centroid, centroid);
  }
  const verifyChart = (edge, use) => {
    assert.ok(use.pcurve); const domain = curveDomain(edge.curve);
    assert.deepEqual(curveDomain(use.pcurve), domain);
    const face = brep.faces.find(face => face.loops.includes(use.loop));
    for (const fraction of [0, .19, .5, .87, 1]) {
      const at = domain[0] + fraction * (domain[1] - domain[0]), [u, v] = evaluateCurve(use.pcurve, at);
      pointNear(evaluateSurface(face.surface, u, v), evaluateCurve(edge.curve, at));
    }
  };
  for (const piece of ['bend', 'line']) {
    const walls = brep.faces.filter(face => face.name.startsWith(`w.${piece}.`));
    assert.deepEqual(walls.map(face => face.name).sort(), loops.flatMap((_, loop) => [0, 1, 2, 3].map(i => `w.${piece}${side(loop, i)}`)).sort());
    // All material is behind the authored exit plane on the bend and ahead on the line.
    // rho>0 and 0<delta<=120 degrees give -rho*sin(delta)<0; axial offsets have zero projection.
    for (const face of walls) for (const loopId of face.loops) for (const id of brep.loops.find(loop => loop.id === loopId).coedges) {
      const use = brep.coedges.find(use => use.id === id), edge = brep.edges.find(edge => edge.id === use.edge), [low, high] = curveDomain(edge.curve);
      for (const fraction of [0, .19, .5, .87, 1]) {
        const point = evaluateCurve(edge.curve, low + fraction * (high - low)), station = dot(sub(point, path.join), path.atExit);
        assert.ok((piece === 'bend' ? -station : station) >= -1e-8);
      }
    }
  }
  for (const end of ['start', 'end']) {
    const terminal = end === 'end', cap = brep.faces.find(face => face.name === `w.${end}`), plane = faceGeometry(cap);
    assert.equal(plane.kind, 'plane'); pointNear(plane.n, terminal ? path.atExit : scale(path.tangent, -1));
    near(dot(sub(plane.o, terminal ? path.end : path.start), plane.n), 0);
    assert.equal(cap.loops.length, 3); const seen = new Set();
    for (const id of cap.loops) {
      const loop = brep.loops.find(loop => loop.id === id); assert.equal(loop.coedges.length, 4);
      let group; let signedArea = 0;
      for (const useId of loop.coedges) {
        const use = brep.coedges.find(use => use.id === useId), edge = brep.edges.find(edge => edge.id === use.edge);
        const peer = brep.coedges.find(peer => peer.id === use.twin), owner = brep.faces.find(face => face.loops.includes(peer.loop));
        assert.ok(edge.name.split('|').includes(cap.name)); assert.equal(peer.twin, use.id); assert.notEqual(peer.sense, use.sense);
        const matches = loops.flatMap((_, loop) => [0, 1, 2, 3].map(index => ({ loop, index })))
          .filter(({ loop, index }) => owner.name === `w.${terminal ? 'line' : 'bend'}${side(loop, index)}`);
        assert.equal(matches.length, 1); const [{ loop: sourceLoop, index }] = matches;
        if (group === undefined) group = sourceLoop; else assert.equal(group, sourceLoop);
        pointNear(evaluateCurve(edge.curve, .5), atSide(sourceLoop, index, terminal ? path.end : path.start, terminal));
        const [a, b] = edge.curve.controlPoints.map(point => sub(point, terminal ? path.end : path.start));
        signedArea += (use.sense === 'forward' ? 1 : -1) * dot(cross(a, b), plane.n) / 2;
        verifyChart(edge, use); verifyChart(edge, peer);
      }
      assert.ok(!seen.has(group)); seen.add(group);
      assert.equal(loop.kind, group ? 'inner' : 'outer'); near(signedArea, (group ? -1 : 1) * areas[group]);
    }
    assert.equal(seen.size, 3);
  }
  const seams = brep.edges.filter(edge => edge.name.includes('w.bend.') && edge.name.includes('w.line.'));
  assert.equal(seams.length, 12); const counts = [0, 0, 0];
  for (const edge of seams) {
    const uses = brep.coedges.filter(use => use.edge === edge.id); assert.equal(uses.length, 2);
    assert.equal(uses[0].twin, uses[1].id); assert.equal(uses[1].twin, uses[0].id); assert.notEqual(uses[0].sense, uses[1].sense);
    const owners = uses.map(use => brep.faces.find(face => face.loops.includes(use.loop)));
    const bend = owners.find(face => face.name.startsWith('w.bend.')), line = owners.find(face => face.name.startsWith('w.line.'));
    const matches = loops.flatMap((_, loop) => [0, 1, 2, 3].map(index => ({ loop, index })))
      .filter(({ loop, index }) => bend.name === `w.bend${side(loop, index)}` && line.name === `w.line${side(loop, index)}`);
    assert.equal(matches.length, 1); const [{ loop, index }] = matches; counts[loop]++;
    pointNear(evaluateCurve(edge.curve, .5), atSide(loop, index, path.join, true));
    for (const use of uses) verifyChart(edge, use);
    const continuity = measureBrepEdgeContinuity(brep, edge.id, { curvature: true });
    assert.equal(continuity.status, 'measured'); near(continuity.maximumAngleDegrees, 0);
    assert.equal(continuity.curvature.status, 'measured'); const support = faceGeometry(bend);
    near(continuity.curvature.maximumDifference, support.kind === 'cylinder' ? 1 / support.r : 0);
  }
  assert.deepEqual(counts, [4, 4, 4]);
  return seams;
}

test('paired arc then line preserves both authored mouths, 12 charted joins and independent mass', () => {
  const path = rail(), section = sketch(path), initial = evaluateCadPart(document(path.path, section));
  verify(initial.outputs[0], path, section);
  near(massPropertiesOf(initial.outputs[0]).volume, 32 * (10 + 10 * Math.PI));
  assert.deepEqual(loadCadPart(saveCadPart(initial)).outputs[0].brep, initial.outputs[0].brep);
});

test('rotated paired arc then line keeps radial X or Y, both signs, winding, shifted loop starts and positional or authored owners', () => {
  for (const degrees of [30, 120]) for (const radialY of [false, true]) for (const sign of [-1, 1]) for (const tagged of [false, true]) {
    const path = rail({ degrees, radius: 4, length: 35 });
    const section = sketch(path, { radialY, sign, tagged, shifted: true, clockwise: [tagged, !tagged],
      intervals: [[1, 3], [-2.5, -1.5]], widths: [2, 1.5] });
    verify(evaluateCadPart(document(path.path, section)).outputs[0], path, section);
  }
});

test('asymmetric passage edits preserve all IDs, the other passage and restore native bytes after reopen', () => {
  const path = rail(), section = sketch(path), initial = evaluateCadPart(document(path.path, section)), saved = saveCadPart(initial);
  const changed = sketch(path, { intervals: [[-2.5, -1.5], [1, 3]], widths: [1.5, 2] });
  const edited = reevaluate(initial, { document: document(path.path, changed) });
  verify(edited.outputs[0], path, changed); assert.deepEqual(identity(edited), identity(initial));
  const untouchedTags = [...section.sideTags.outer, ...section.sideTags.holes[1]];
  const untouched = snapshot => snapshot.outputs[0].brep.faces.filter(face => untouchedTags.some(tag => face.name.endsWith(`.side[${tag}]`)));
  assert.deepEqual(untouched(edited), untouched(initial)); assert.equal(saveCadPart(initial), saved);
  const reopened = loadCadPart(saveCadPart(edited)); assert.deepEqual(reopened.outputs[0].brep, edited.outputs[0].brep);
  assert.deepEqual(reevaluate(reopened, { document: document(path.path, section) }).outputs[0].brep, initial.outputs[0].brep);
});

test('authored tags equal to old and new private tokens survive one-pass restoration in both lanes', () => {
  const path = rail({ degrees: 120 }), section = sketch(path, { radialY: true, sign: -1, shifted: true });
  section.sideTags = { outer: ['arcLineHole1_2', 'arcLineHole2', 'arcLineOuter0', 'arcLineHole3'],
    holes: [['arcLineHole0', 'arcLineOuter3', 'arcLineHole1', 'arcLineOuter2'],
      ['arcLineHole1_0', 'arcLineOuter1', 'arcLineHole1_1', 'arcLineHole1_3']] };
  verify(evaluateCadPart(document(path.path, section)).outputs[0], path, section);
});

test('reversed native joins and both cap edge directions retain complete reciprocal charts', () => {
  const path = rail(), section = sketch(path), initial = evaluateCadPart(document(path.path, section)), output = initial.outputs[0];
  const seams = verify(output, path, section), ids = new Set([...seams, ...output.brep.edges.filter(edge => /w\.(start|end)(\||$)/.test(edge.name))].map(edge => edge.id));
  const reverse = curve => reverseCurve(curve, { curveId: `${curve.id}_reversed` }).curve;
  const brep = { ...output.brep, edges: output.brep.edges.map(edge => ids.has(edge.id)
    ? { ...edge, curve: reverse(edge.curve), vertices: [...edge.vertices].reverse() } : edge),
  coedges: output.brep.coedges.map(use => ids.has(use.edge)
    ? { ...use, sense: use.sense === 'forward' ? 'reversed' : 'forward', pcurve: reverse(use.pcurve) } : use) };
  verify({ ...output, brep }, path, section);
});

test('paired arc then line refuses radial offset, cover loss, axial contact and unsupported inputs without changing the prior solid', () => {
  const path = rail(), section = sketch(path), initial = evaluateCadPart(document(path.path, section)), saved = saveCadPart(initial);
  const refused = (changed, code, message, changedPath = path) => {
    assert.throws(() => reevaluate(initial, { document: document(changedPath.path, changed) }),
      error => error instanceof CadPartError && error.feature === 'w' && error.code === code && message.test(error.message));
    assert.equal(saveCadPart(initial), saved);
  };
  const eccentric = sketch(path); eccentric.holes[0] = eccentric.holes[0].map(segment => ({ ...segment, start: add(segment.start, [.1, 0]) }));
  refused(eccentric, 'GEOMETRY', /both cavities centered on the radial axis/);
  refused(sketch(path, { widths: [4, 2] }), 'GEOMETRY', /strictly positive cover/);
  for (const intervals of [[[-3, 0], [0, 3]], [[-3, .1], [0, 3]], [[-3, 0], [5e-7, 3]]])
    refused(sketch(path, { intervals }), 'GEOMETRY', /strictly positive axial web clearance/);
  const three = sketch(path); refused({ ...three, holes: [...three.holes, three.holes[0]], sideTags: undefined }, 'CAPABILITY', /two axis-aligned rectangular cavities/);
  const rolled = sketch(path); rolled.plane.xAxis = scale(add(path.inward, path.axis), Math.SQRT1_2);
  refused(rolled, 'CAPABILITY', /original axes aligned/);
  refused(section, 'PARAMETER', /radial half-width smaller/, rail({ radius: 2 }));
  for (const degrees of [29, 121]) refused(section, 'CAPABILITY', /one circular arc from 30° to 120° followed by one straight segment/, rail({ degrees }));
  const narrow = sketch(path, { intervals: [[-3, -2.5e-6], [2.5e-6, 3]] });
  verify(evaluateCadPart(document(path.path, narrow)).outputs[0], path, narrow);
});

// Include complete native coefficients, not only the retained face's support or display name.
const retained = brep => brep.faces.filter(face => face.name !== 'w.end' && !face.name.startsWith('w.line.')).map(face => {
  const loops = brep.loops.filter(loop => face.loops.includes(loop.id));
  const uses = brep.coedges.filter(use => loops.some(loop => loop.id === use.loop));
  const edges = brep.edges.filter(edge => uses.some(use => use.edge === edge.id));
  return { face, loops, uses, edges, vertices: brep.vertices.filter(vertex => edges.some(edge => edge.vertices.includes(vertex.id))) };
});

test('original paired arc-line outlet offsets preserve the exact inlet and bend boundaries through signed edits and fresh Open', () => {
  const path = rail(), section = sketch(path), source = document(path.path, section), initial = evaluateCadPart(source), saved = saveCadPart(initial);
  const offset = distance => ({ ...source, features: [...source.features,
    { id: 'move', kind: 'offset-face', target: 'w', face: 'w.end', distance }] });
  const originalVolume = brepMassProperties(initial.outputs[0].brep, 1).volume;
  const frame = exactPairedElbowOutletOffsetFrame(initial.outputs[0].brep, 'w.end', { id: 'w', mode: 'exact', path: path.path });
  assert.ok(frame); pointNear(frame.anchor, path.end); pointNear(frame.normal, path.atExit);
  let previous = initial;
  for (const distance of [4, -4, 4]) {
    const changed = reevaluate(previous, { document: offset(distance) });
    verify(changed.outputs[0], { ...path, length: path.length + distance, end: add(path.end, scale(path.atExit, distance)) }, section);
    assert.deepEqual(identity(changed), identity(initial));
    assert.deepEqual(retained(changed.outputs[0].brep), retained(initial.outputs[0].brep));
    near(brepMassProperties(changed.outputs[0].brep, 1).volume - originalVolume, 32 * distance, 1e-7);
    const reopened = loadCadPart(saveCadPart(changed));
    assert.deepEqual(reopened.outputs[0].brep, changed.outputs[0].brep);
    assert.deepEqual(reevaluate(reopened, { document: source }).outputs[0].brep, initial.outputs[0].brep);
    assert.equal(saveCadPart(initial), saved); previous = reopened;
  }
});

test('translated 30 and 120 degree paired arc-line outlet offsets preserve both radial axes, asymmetric lane ownership and independent moments', () => {
  for (const degrees of [30, 120]) for (const radialY of [false, true]) {
    const path = rail({ degrees }), section = sketch(path, { radialY, sign: -1, shifted: true, clockwise: [false, true],
      intervals: [[1, 3], [-2.5, -1.5]], widths: [2, 1.5] });
    const source = document(path.path, section), initial = evaluateCadPart(source), before = saveCadPart(initial);
    for (const distance of [4, -4]) {
      const changed = reevaluate(initial, { document: { ...source, features: [...source.features,
        { id: 'move', kind: 'offset-face', target: 'w', face: 'w.end', distance }] } });
      verify(changed.outputs[0], { ...path, length: path.length + distance, end: add(path.end, scale(path.atExit, distance)) }, section);
      assert.deepEqual(identity(changed), identity(initial));
      assert.deepEqual(retained(changed.outputs[0].brep), retained(initial.outputs[0].brep));
      near(brepMassProperties(changed.outputs[0].brep, 1).volume - brepMassProperties(initial.outputs[0].brep, 1).volume, 34.5 * distance, 1e-7);
      const reopened = loadCadPart(saveCadPart(changed));
      assert.deepEqual(reopened.outputs[0].brep, changed.outputs[0].brep);
      assert.deepEqual(reevaluate(reopened, { document: source }).outputs[0].brep, initial.outputs[0].brep);
    }
    assert.equal(saveCadPart(initial), before);
  }
});

test('paired arc-line outlet offsets refuse collapse, wrong native caps, line-first rails and unbound coefficients without source writes', () => {
  const path = rail(), section = sketch(path), source = document(path.path, section), initial = evaluateCadPart(source), saved = saveCadPart(initial);
  const refused = (face, distance) => {
    assert.throws(() => reevaluate(initial, { document: { ...source, features: [...source.features,
      { id: 'move', kind: 'offset-face', target: 'w', face, distance }] } }), CadPartError);
    assert.equal(saveCadPart(initial), saved);
  };
  for (const distance of [-10, -11, -9.99999]) refused('w.end', distance);
  refused('w.start', 4); refused('w.line.side[outside-a]', 4); refused('w.bend.side[lower-a]', 4);
  const brep = initial.outputs[0].brep, minimal = { id: 'w', mode: 'exact', path: path.path };
  assert.equal(exactPairedElbowOutletOffsetFrame(brep, 'w.start', minimal), undefined);
  assert.equal(exactPairedElbowOutletOffsetFrame(brep, 'w.end', { ...minimal, id: 'stale' }), undefined);
  const reversed = reverseCurve(path.path, { curveId: 'lineFirst' }).curve;
  const lineSection = { ...section, plane: { ...section.plane, normal: scale(path.atExit, -1), xAxis: path.rotate(path.inward) } };
  const lineFirst = evaluateCadPart(document(reversed, lineSection)).outputs[0].brep;
  assert.equal(exactPairedElbowOutletOffsetFrame(lineFirst, 'w.end', { ...minimal, path: reversed }), undefined);
  const input = { ...minimal, outer: section.segments, holes: section.holes, sideTags: section.sideTags,
    xAxis: section.plane.xAxis, yAxis: cross(path.tangent, section.plane.xAxis) };
  const unbound = structuredClone(brep); unbound.vertices[0].tolerance *= 2;
  assert.ok(checkBrep(unbound, { strict: true }).valid);
  assert.equal(offsetExactPairedElbowOutletIfAdmitted(unbound, 'w.end', input, 4), undefined);
  assert.deepEqual(brep, evaluateCadPart(source).outputs[0].brep);
});
