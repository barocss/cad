import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCadPart, reevaluate, massPropertiesOf, brepMassProperties, checkBrep, faceGeometry, saveCadPart, loadCadPart } from '../dist/index.js';
import { brepBounds } from '../dist/brep/brep-bounds.js';

// D449: nominal drafting of an ordinary 80 x 40 x 10 box, not a lifted cutting plane.
// This fixed-profile precision target is separate from the historical Draft Vrel1e-6 test.
const coordinateLimit = 1e-9, volumeRelative = 1e-9;
const right = 'n1.side[e2]';
const back = 'n1.side[e3]';
function document(options = {}) {
  return { format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {}, features: [
    { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [-20, -20], max: [60, 20], sideTags: { outer: ['e1', 'e2', 'e3', 'e4'] } },
    { id: 'n1', kind: 'extrude', sketch: 'n0', height: 10 },
    { id: 'n2', kind: 'draft', target: 'n1', faces: [right], angle: 10, ...options },
  ] };
}
function nominal(angle, pull = 'z', neutral = pull === '-z' ? 10 : 0) {
  const slope = Math.tan(angle * Math.PI / 180) * (pull === '-z' ? -1 : 1), intercept = 60 + slope * neutral;
  // Integrate x from -20 to intercept-slope*z, y from -20 to 20, z from 0 to 10.
  // These closed forms use no generated vertices, cutter extent or implementation lift.
  const height = 10, depth = 40;
  const volume = depth * ((intercept + 20) * height - slope * height ** 2 / 2);
  const momentX = depth / 2 * ((intercept ** 2 - 400) * height - intercept * slope * height ** 2 + slope ** 2 * height ** 3 / 3);
  const momentZ = depth * ((intercept + 20) * height ** 2 / 2 - slope * height ** 3 / 3);
  return { slope, intercept, neutral, volume, centroid: [momentX / volume, 0, momentZ / volume],
    bounds: { min: [-20, -20, 0], max: [Math.max(intercept, intercept - slope * height), 20, 10] } };
}
function close(actual, expected, limit, label) {
  assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= limit, `${label}: ${actual} vs ${expected}, limit ${limit}`);
}
function samePoint(a, b) { return a.every((x, i) => Math.abs(x - b[i]) <= coordinateLimit); }
function verify(options, reference) {
  const input = document(options), before = structuredClone(input), snapshot = evaluateCadPart(input);
  assert.deepEqual(snapshot.outputs.map(o => o.id), ['n2']);
  const output = snapshot.outputs[0], brep = output.brep, report = checkBrep(brep, { strict: true });
  assert.equal(report.valid, true, JSON.stringify(report.issues));
  assert.equal(brep.bodies.length, 1); assert.equal(brep.bodies[0].kind, 'solid');
  assert.ok(brep.shells.every(s => s.closed)); assert.equal(report.topology[0].genus, 0);
  const mass = massPropertiesOf(output, 1), bounds = brepBounds(brep);
  close(mass.volume, reference.volume, volumeRelative * Math.max(1, Math.abs(reference.volume)), 'nominal volume');
  for (let i = 0; i < 3; i++) {
    close(mass.centroid[i], reference.centroid[i], coordinateLimit, `nominal centroid ${i}`);
    for (const side of ['min', 'max']) close(bounds[side][i], reference.bounds[side][i], coordinateLimit, `nominal bounds ${side} ${i}`);
  }
  let draftedPlanes = 0;
  for (const face of brep.faces) {
    const g = faceGeometry(face);
    if (g.kind !== 'plane' || g.n[0] <= 0.9 || Math.abs(g.n[1]) > coordinateLimit) continue;
    draftedPlanes++;
    const norm = Math.hypot(1, reference.slope);
    close((g.o[0] + reference.slope * g.o[2] - reference.intercept) / norm, 0, coordinateLimit, 'nominal support plane');
    close(g.n[0], 1 / norm, coordinateLimit, 'draft normal X');
    close(g.n[2], reference.slope / norm, coordinateLimit, 'draft normal Z');
  }
  assert.ok(draftedPlanes > 0, 'actual right drafted support plane');
  assert.ok(brep.faces.some(f => f.name === 'n2.draft.bottom'), 'persistent drafted support role');
  assert.ok(brep.faces.every(f => !f.name?.startsWith('n2.draft.overlap')), 'normal overlap remains internal');
  if (reference.neutral === 0 || reference.neutral === 10) {
    const a = [60, -20, reference.neutral], b = [60, 20, reference.neutral];
    const onNeutral = brep.edges.filter(e => {
      const p = e.curve.controlPoints;
      return e.curve.degree === 1 && p.length === 2 && (samePoint(p[0], a) && samePoint(p[1], b) || samePoint(p[0], b) && samePoint(p[1], a));
    });
    assert.equal(onNeutral.length, 1, 'original neutral edge stays on the authored neutral plane');
  }
  assert.deepEqual(input, before, 'accepted caller document unchanged');
  return output;
}

test('right planar Draft keeps the default neutral edge and nominal V/C/bounds at 10 degrees', () => {
  verify({ pull: 'z' }, nominal(10));
});

test('explicit neutral zero and omitted pull/neutral retain identical native geometry', () => {
  const omitted = verify({}, nominal(10)), explicit = verify({ pull: 'z', neutral: 0 }, nominal(10));
  assert.deepEqual(omitted.brep, explicit.brep);
  assert.deepEqual(massPropertiesOf(omitted, 1), massPropertiesOf(explicit, 1));
});

test('negative angle adds the outward nominal wedge without moving its neutral edge', () => {
  verify({ angle: -10, pull: 'z', neutral: 0 }, nominal(-10));
});

test('negative Z pull fixes the authored upper neutral edge and reverses the wedge', () => {
  verify({ pull: '-z', neutral: 10 }, nominal(10, '-z', 10));
});

test('an explicit neutral below the body defines the nominal support plane without a hidden shift', () => {
  verify({ pull: 'z', neutral: -2 }, nominal(10, 'z', -2));
});

test('translated signed pulls retain exact neutral contact, strict topology and the drafted face role', () => {
  for (const [pull, angle, side] of [['-x', -10, 'e1'], ['-y', 10, 'e2'], ['-y', -10, 'e2']]) {
    const input = document({ pull, angle, faces: [`n1.side[${side}]`], target: 'm' });
    input.features.splice(2, 0, { id: 'm', kind: 'translate', target: 'n1', offset: [-13, 7, -19] });
    input.features[0].min = [0, 0]; input.features[0].max = [80, 40];
    const before = structuredClone(input), slope = Math.tan(angle * Math.PI / 180), alongX = pull === '-x';
    const length = alongX ? 80 : 40, removed = 10 * slope * length ** 2 / 2, expectedVolume = 32000 - removed;
    // Independent triangular-prism removal (negative removal adds the outward wedge).
    const removedCenter = alongX ? [67 - 2 * length / 3, 7 + slope * length / 3, -14]
      : [67 - slope * length / 3, 47 - 2 * length / 3, -14];
    const expectedCenter = removedCenter.map((c, i) => (32000 * [27, 27, -14][i] - removed * c) / expectedVolume);
    const expectedBounds = { min: [-13, alongX ? Math.min(7, 7 + slope * length) : 7, -19],
      max: [alongX ? 67 : Math.max(67, 67 - slope * length), 47, -9] };
    const output = evaluateCadPart(input).outputs[0], report = checkBrep(output.brep, { strict: true });
    assert.equal(report.valid, true, `${pull}/${angle}: ${JSON.stringify(report.issues)}`);
    const mass = massPropertiesOf(output, 1), bounds = brepBounds(output.brep);
    close(mass.volume, expectedVolume, volumeRelative * expectedVolume, `${pull}/${angle} volume`);
    for (let i = 0; i < 3; i++) {
      close(mass.centroid[i], expectedCenter[i], coordinateLimit, `${pull}/${angle} centroid ${i}`);
      for (const end of ['min', 'max']) close(bounds[end][i], expectedBounds[end][i], coordinateLimit, `${pull}/${angle} ${end} ${i}`);
    }
    assert.ok(output.brep.faces.some(f => f.name === 'n2.draft.bottom'));
    assert.ok(output.brep.faces.every(f => !f.name?.startsWith('n2.draft.overlap')));
    assert.deepEqual(input, before);
  }
});

test('existing Draft angle and face-admission refusals keep their typed boundary', () => {
  for (const angle of [0, 45, -45]) {
    const input = document({ angle }), before = structuredClone(input);
    assert.throws(() => evaluateCadPart(input), e => e.code === 'INPUT' && /angle must/.test(e.message));
    assert.deepEqual(input, before);
  }
  assert.throws(() => evaluateCadPart(document({ faces: ['n1.top'] })), e => e.code === 'CAPABILITY' && /square to the pull/.test(e.message));
});

function cornerDocument(options = {}) {
  const input = document({ faces: [right, back], ...options });
  Object.assign(input.features[0], { min: [0, 0], max: [40, 30] });
  return input;
}

function verifyCorner(input, [width, depth, length], ends, selected, expectedNormals, neutral = 0) {
  const before = structuredClone(input), base = evaluateCadPart({ ...input, features: input.features.slice(0, -1) }).outputs[0];
  const [output] = evaluateCadPart(input).outputs;
  assert.equal(output.id, 'n2');
  assert.equal(output.bodyCount, 1);
  assert.deepEqual(input, before);
  const report = checkBrep(output.brep, { strict: true });
  assert.equal(report.valid, true, JSON.stringify(report.issues));
  assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 6, loops: 6, coedges: 24, edges: 12, vertices: 8 });
  assert.equal(report.topology[0].genus, 0);
  assert.equal(output.brep.shells[0].closed, true);
  assert.deepEqual(output.brep.faces.map(f => f.name).sort(), base.brep.faces.map(f => f.name).sort());
  assert.deepEqual(output.brep.edges.map(e => e.name).sort(), base.brep.edges.map(e => e.name).sort());
  const seeded = evaluateCadPart({ ...input, features: input.features.slice(0, -1) });
  assert.deepEqual(reevaluate(seeded, { document: input }).outputs[0].brep, output.brep);

  const radians = input.features.at(-1).angle * Math.PI / 180, t = Math.tan(radians);
  // Integrate (width - t*s)(depth - t*s), with s measured from the neutral station.
  const moment = degree => ((length - neutral) ** (degree + 1) - (-neutral) ** (degree + 1)) / (degree + 1);
  const volume = width * depth * length - (width + depth) * t * moment(1) + t ** 2 * moment(2);
  close(massPropertiesOf(output).volume, volume, 1e-7, 'two-side draft volume');
  const name = [...selected].sort().join('|'), edge = output.brep.edges.find(e => e.name === name);
  assert.ok(edge && edge.curve.degree === 1 && edge.curve.controlPoints.length === 2, 'one exact shared line');
  for (const end of ends) assert.ok(edge.curve.controlPoints.some(p => samePoint(p, end)), JSON.stringify(edge.curve));
  for (let i = 0; i < selected.length; i++) {
    const geometry = faceGeometry(output.brep.faces.find(f => f.name === selected[i]));
    assert.equal(geometry.kind, 'plane');
    const expected = expectedNormals[i].map(x => x / Math.hypot(...expectedNormals[i]));
    close(Math.hypot(...geometry.n.map((n, k) => n - expected[k])), 0, 1e-12, 'outward normal');
    for (const end of ends) close(end.reduce((d, x, k) => d + (x - geometry.o[k]) * geometry.n[k], 0), 0, coordinateLimit, 'intersection on both planes');
  }
  return output.brep;
}

test('adjacent box Draft turns two supports and preserves their shared edge, in and out', () => {
  for (const angle of [10, -10]) {
    const t = Math.tan(angle * Math.PI / 180), input = cornerDocument({ angle, neutral: 0 });
    const a = verifyCorner(input, [40, 30, 10], [[40, 30, 0], [40 - 10 * t, 30 - 10 * t, 10]], [right, back], [[1, 0, t], [0, 1, t]]);
    const reversed = evaluateCadPart(cornerDocument({ angle, faces: [back, right] })).outputs[0].brep;
    assert.deepEqual(reversed, a, 'pick order and explicit base neutral do not change the native body');
  }
});

test('adjacent box Draft locates the neutral edge at the translated negative-pull base', () => {
  const input = cornerDocument({ target: 'm', faces: [back, 'n1.top'], pull: '-x', neutral: 33 });
  input.features.splice(2, 0, { id: 'm', kind: 'translate', target: 'n1', offset: [-7, 11, -3] });
  const t = Math.tan(10 * Math.PI / 180);
  verifyCorner(input, [30, 10, 40], [[33, 41, 7], [-7, 41 - 40 * t, 7 - 40 * t]], [back, 'n1.top'], [[-t, 1, 0], [-t, 0, 1]]);
});

test('adjacent box Draft keeps plane charts within the modeling bounds', () => {
  const input = cornerDocument({ target: 'm', faces: ['n1.side[e1]', 'n1.bottom'], pull: 'x', neutral: 9970 });
  input.features[0].max = [30, 30];
  input.features[1].height = 30;
  input.features.splice(2, 0, { id: 'm', kind: 'translate', target: 'n1', offset: [9970, 9970, 9970] });
  const t = Math.tan(10 * Math.PI / 180);
  const brep = verifyCorner(input, [30, 30, 30], [[9970, 9970, 9970], [10000, 9970 + 30 * t, 9970 + 30 * t]],
    ['n1.side[e1]', 'n1.bottom'], [[t, -1, 0], [t, 0, -1]]);
  assert.ok(brep.faces.every(face => face.surface.controlPoints.flat().every(point => point.every(value => Math.abs(value) <= 10000))));
  input.features.at(-1).faces = [back, 'n1.top'];
  input.features.at(-1).angle = -10;
  assert.throws(() => evaluateCadPart(input), e => e.code === 'PARAMETER' && /modeling coordinate range/.test(e.message));
});

test('adjacent Draft refuses a collapsed box, unsupported neutral planes and non-box solids', () => {
  const collapsed = cornerDocument({ angle: 20 });
  collapsed.features[0].max = [3, 30];
  const before = structuredClone(collapsed);
  assert.throws(() => evaluateCadPart(collapsed), e => e.code === 'GEOMETRY' && /closes a box wall/.test(e.message));
  assert.deepEqual(collapsed, before);
  assert.throws(() => evaluateCadPart(cornerDocument({ neutral: -2 })), e => e.code === 'CAPABILITY' && /neutral plane at the start/.test(e.message));
  assert.throws(() => evaluateCadPart(cornerDocument({ faces: ['n1.side[e1]', right, back, 'n1.side[e4]'] })), e => e.code === 'CAPABILITY' && /meet along an edge/.test(e.message));
  assert.throws(() => evaluateCadPart(cornerDocument({ faces: [right, right, back] })), e => e.code === 'CAPABILITY' && /meet along an edge/.test(e.message));
  assert.throws(() => evaluateCadPart(cornerDocument({ faces: [right, back, 'n1.top'] })), e => e.code === 'CAPABILITY' && /square to the pull/.test(e.message));
  const holed = cornerDocument({ target: 'h' });
  holed.features.splice(2, 0, { id: 'h', kind: 'hole', target: 'n1', center: [20, 15], radius: 2 });
  assert.throws(() => evaluateCadPart(holed), e => e.code === 'CAPABILITY' && /meet along an edge/.test(e.message));
});

test('adjacent box Draft turns both caps around an interior neutral with unchanged shared incidence', () => {
  for (const angle of [10, -10]) {
    const slope = Math.tan(angle * Math.PI / 180);
    const input = cornerDocument({ angle, neutral: 4 });
    const ends = [[40 + 4 * slope, 30 + 4 * slope, 0], [40 - 6 * slope, 30 - 6 * slope, 10]];
    const normals = [[1, 0, slope], [0, 1, slope]];
    const brep = verifyCorner(input, [40, 30, 10], ends, [right, back], normals, 4);
    const corners = brep.vertices.map(vertex => vertex.point);
    for (const z of [0, 10]) for (const x of [0, 40 - slope * (z - 4)]) for (const y of [0, 30 - slope * (z - 4)])
      assert.ok(corners.some(point => samePoint(point, [x, y, z])));
    const [low, high] = ends;
    assert.ok(samePoint(low.map((value, axis) => value + (high[axis] - value) * 0.4), [40, 30, 4]));
    const mirrored = cornerDocument({ angle, neutral: 6, pull: '-z' });
    const mirrorEnds = ends.map(([x, y, z]) => [x, y, 10 - z]);
    verifyCorner(mirrored, [40, 30, 10], mirrorEnds, [right, back], [[1, 0, -slope], [0, 1, -slope]], 4);
  }
});

test('adjacent box Draft rejects a collapsed section or out-of-range corner at either end', () => {
  for (const [angle, neutral] of [[40, 4], [-40, 6]]) {
    const input = cornerDocument({ angle, neutral });
    input.features[0].max = [4, 30];
    assert.throws(() => evaluateCadPart(input), error => error.code === 'GEOMETRY' && /closes a box wall/.test(error.message));
  }
  for (const angle of [10, -10]) {
    const input = cornerDocument({ target: 'm', angle, neutral: 4 });
    input.features.splice(2, 0, { id: 'm', kind: 'translate', target: 'n1', offset: [9960, 9970, 0] });
    assert.throws(() => evaluateCadPart(input), error => error.code === 'PARAMETER' && /modeling coordinate range/.test(error.message));
  }
});

const front = 'n1.side[e1]';

test('Draft about a named box edge keeps its full native curve and identity for signed turns', () => {
  for (const [pull, face, fixedFace, hingeLength, thickness, pullSpan, normal] of [
    ['z', right, 'n1.bottom', 40, 80, 10, t => [1, 0, t]],
    ['-z', right, 'n1.top', 40, 80, 10, t => [1, 0, -t]],
    ['-x', front, right, 10, 40, 80, t => [-t, -1, 0]],
    ['y', right, front, 10, 80, 40, t => [1, t, 0]],
  ]) {
    const input = document({ target: 'm', faces: [face], pull, hingeEdge: [face, fixedFace].sort().join('|') });
    input.features.splice(2, 0, { id: 'm', kind: 'translate', target: 'n1', offset: [-7, 11, -3] });
    const source = evaluateCadPart({ ...input, features: input.features.slice(0, -1) });
    const original = source.outputs[0].brep, recipe = input.features.at(-1);
    const hinge = original.edges.find(edge => edge.name === recipe.hingeEdge);
    const incident = brep => brep.coedges.filter(use => use.edge === hinge.id).map(use => brep.loops.find(loop => loop.id === use.loop).face).sort();
    assert.ok(hinge, recipe.hingeEdge);

    for (const angle of [10, -10]) {
      recipe.angle = angle;
      const before = structuredClone(input), snapshot = evaluateCadPart(input), [output] = snapshot.outputs;
      const { brep } = output, check = checkBrep(brep, { strict: true });
      assert.deepEqual(input, before);
      assert.equal(check.valid, true, JSON.stringify(check.issues));
      assert.deepEqual(check.counts, { bodies: 1, shells: 1, faces: 6, loops: 6, coedges: 24, edges: 12, vertices: 8 });
      assert.equal(brep.shells[0].closed, true);
      assert.equal(check.topology[0].genus, 0);
      assert.deepEqual(brep.edges.filter(edge => edge.name === recipe.hingeEdge), [hinge]);
      assert.deepEqual(incident(brep), incident(original));
      for (const id of hinge.vertices) assert.deepEqual(brep.vertices.find(vertex => vertex.id === id), original.vertices.find(vertex => vertex.id === id));

      const slope = Math.tan(angle * Math.PI / 180);
      // The change is a triangular prism of depth pullSpan times the slope at the far end.
      const expectedVolume = hingeLength * pullSpan * (thickness - pullSpan * slope / 2);
      close(massPropertiesOf(output).volume, expectedVolume, 1e-7, 'signed edge draft volume');
      const support = faceGeometry(brep.faces.find(candidate => candidate.name === face));
      const expectedNormal = normal(slope).map(value => value / Math.hypot(1, slope));
      assert.equal(support.kind, 'plane');
      close(Math.hypot(...support.n.map((value, i) => value - expectedNormal[i])), 0, coordinateLimit, 'turned face normal');
      assert.deepEqual(reevaluate(source, { document: input }).outputs[0].brep, brep);
      assert.deepEqual(loadCadPart(saveCadPart(snapshot)).outputs[0].brep, brep);
    }
  }
});

test('Draft about an edge refuses bad ownership, direction, input and wall collapse', () => {
  const hingeEdge = ['n1.bottom', right].join('|');
  const valid = { hingeEdge, pull: 'z' };
  for (const options of [{ pull: undefined }, { neutral: 0 }, { faces: [front, right] }, { hingeEdge: '' }])
    assert.throws(() => evaluateCadPart(document({ ...valid, ...options })), error => error.code === 'INPUT' && /needs one edge/.test(error.message));
  for (const options of [{ pull: '-z' }, { faces: [front] }, { hingeEdge: [front, right].sort().join('|') }])
    assert.throws(() => evaluateCadPart(document({ ...valid, ...options })), error => error.code === 'SELECTION' && /start face/.test(error.message));
  assert.throws(() => evaluateCadPart(document({ ...valid, hingeEdge: 'missing' })), error => error.code === 'REFERENCE' && /missing or ambiguous/.test(error.message));

  const hole = document({ ...valid, target: 'h' });
  hole.features.splice(2, 0, { id: 'h', kind: 'hole', target: 'n1', center: [0, 0], radius: 2 });
  assert.throws(() => evaluateCadPart(hole), error => error.code === 'CAPABILITY' && /original rectangular extrusion/.test(error.message));

  const collapsed = document({ ...valid, angle: 30 });
  collapsed.features[0].max[0] = -16;
  const before = structuredClone(collapsed);
  assert.throws(() => evaluateCadPart(collapsed), error => error.code === 'GEOMETRY' && /closes a box wall/.test(error.message));
  assert.deepEqual(collapsed, before);
});

const threeSides = [right, front, back];
function threeSideBox(angle, pull = 'z') {
  const doc = cornerDocument({ angle, pull, faces: threeSides });
  doc.features[1].height = 40;
  return doc;
}
test('three box sides retain both shared native corners and agree with independent signed-pull mass', () => {
  const H = 40, W = 40, D = 30;
  for (const [angle, pull, neutral] of [
    [10, 'z', 0], [-12, 'z', 0], [10, '-z', 0],
    [10, 'z', 4], [-12, 'z', 4], [10, '-z', 4], [-12, '-z', 4],
  ]) {
    const sign = pull === 'z' ? 1 : -1, start = sign > 0 ? 0 : H;
    const input = threeSideBox(angle, pull);
    input.features.at(-1).neutral = start + sign * neutral;
    const before = structuredClone(input);
    const removeDraft = { ...input, features: input.features.slice(0, -1) };
    const source = evaluateCadPart(removeDraft), old = source.outputs[0].brep;
    const [out] = evaluateCadPart(input).outputs, brep = out.brep;
    assert.deepEqual(input, before);
    const strict = checkBrep(brep, { strict: true });
    assert.equal(strict.valid, true, strict.issues.join(String.fromCharCode(10)));
    assert.deepEqual(strict.counts, { bodies: 1, shells: 1, faces: 6, loops: 6, coedges: 24, edges: 12, vertices: 8 });
    assert.equal(strict.topology[0].genus, 0);
    assert.deepEqual(brep.faces.map(f => f.name).sort(), old.faces.map(f => f.name).sort());
    assert.deepEqual(brep.edges.map(e => e.name).sort(), old.edges.map(e => e.name).sort());
    const reversed = structuredClone(input); reversed.features.at(-1).faces.reverse();
    assert.deepEqual(evaluateCadPart(reversed).outputs[0].brep, brep);
    assert.deepEqual(reevaluate(source, { document: input }).outputs[0].brep, brep);

    const slope = Math.tan(angle * Math.PI / 180);
    const integral = degree => ((H - neutral) ** (degree + 1) - (-neutral) ** (degree + 1)) / (degree + 1);
    const volume = W * D * H - (2 * W + D) * slope * integral(1) + 2 * slope ** 2 * integral(2);
    const centre = (W * D * integral(1) - (2 * W + D) * slope * integral(2) + 2 * slope ** 2 * integral(3)) / volume;
    const mass = massPropertiesOf(out);
    close(mass.volume, volume, 1e-7, 'three-side draft volume');
    [(W - slope * centre) / 2, D / 2, start + sign * (neutral + centre)].forEach((value, i) =>
      close(mass.centroid[i], value, coordinateLimit, 'three-side centroid'));
    for (const [name, normal] of [[right, [1, 0, sign * slope]], [front, [0, -1, sign * slope]], [back, [0, 1, sign * slope]]]) {
      const plane = faceGeometry(brep.faces.find(f => f.name === name));
      assert.equal(plane.kind, 'plane');
      plane.n.forEach((value, i) => close(value, normal[i] / Math.hypot(...normal), coordinateLimit, 'turned normal'));
    }
    for (const [face, yAt] of [[front, t => slope * t], [back, t => D - slope * t]]) {
      const key = [right, face].sort().join('|');
      const edge = brep.edges.find(e => e.name === key);
      assert.ok(edge && edge.curve.degree === 1 && edge.curve.controlPoints.length === 2);
      for (const station of [0, H]) {
        const offset = station - neutral;
        const point = [W - slope * offset, yAt(offset), start + sign * station];
        assert.ok(edge.curve.controlPoints.some(value => samePoint(value, point)));
        for (const name of [right, face]) {
          const plane = faceGeometry(brep.faces.find(f => f.name === name));
          assert.equal(plane.kind, 'plane');
          close(point.reduce((d, x, i) => d + (x - plane.o[i]) * plane.n[i], 0), 0, coordinateLimit, 'shared endpoint on native support');
        }
      }
      const neutralPoint = [W, yAt(0), start + sign * neutral];
      for (const name of [right, face]) {
        const plane = faceGeometry(brep.faces.find(f => f.name === name));
        close(neutralPoint.reduce((distance, value, axis) => distance + (value - plane.o[axis]) * plane.n[axis], 0),
          0, coordinateLimit, 'neutral corner on both supports');
      }
    }
  }
});
test('three box sides refuse a collapsed depth or an out-of-range neutral plane', () => {
  const exactLimit = Math.atan(15 / 40) * 180 / Math.PI;
  assert.doesNotThrow(() => evaluateCadPart(threeSideBox(exactLimit - 0.01)));
  for (const angle of [exactLimit, exactLimit + 0.01]) {
    const input = threeSideBox(angle), retained = structuredClone(input);
    assert.throws(() => evaluateCadPart(input), e => e.code === 'GEOMETRY' && /closes a box wall/.test(e.message));
    assert.deepEqual(input, retained);
  }
  for (const neutral of [-1, 40, 41]) {
    const input = threeSideBox(10); input.features.at(-1).neutral = neutral;
    assert.throws(() => evaluateCadPart(input), e => ['CAPABILITY', 'SELECTION'].includes(e.code));
  }
});

test('opposing drafted walls keep a positive depth at both sides of an interior neutral', () => {
  const limit = Math.atan(15 / 36) * 180 / Math.PI;
  for (const [neutral, sign] of [[4, 1], [36, -1]]) {
    for (const delta of [-0.01, 0, 0.01]) {
      const input = threeSideBox(sign * (limit + delta));
      input.features.at(-1).neutral = neutral;
      if (delta < 0) assert.doesNotThrow(() => evaluateCadPart(input));
      else assert.throws(() => evaluateCadPart(input), e => e.code === 'GEOMETRY' && /closes a box wall/.test(e.message));
    }
  }
});

const left = 'n1.side[e4]';
const fourSides = [front, right, back, left];
function fourSideBox(angle = 10, pull = 'z', neutral = pull === 'z' ? 4 : 36) {
  const input = threeSideBox(angle, pull);
  Object.assign(input.features.at(-1), { faces: [...fourSides], neutral });
  return input;
}
function draftIncidence(brep) {
  return { bodies: brep.bodies, shells: brep.shells, loops: brep.loops,
    faces: brep.faces.map(({ surface: _surface, ...face }) => face), coedges: brep.coedges,
    edges: brep.edges.map(({ curve: _curve, ...edge }) => edge), vertices: brep.vertices.map(({ point: _point, ...vertex }) => vertex) };
}

test('four original box sides turn around one strict interior neutral with native identity and signed-pull mass', () => {
  const W = 40, D = 30, H = 40, N = 4, byPull = new Map();
  for (const pull of ['z', '-z']) for (const angle of [10, -10]) {
    const sign = pull === 'z' ? 1 : -1, start = sign === 1 ? 0 : H;
    const input = fourSideBox(angle, pull), before = structuredClone(input);
    const source = evaluateCadPart({ ...input, features: input.features.slice(0, -1) });
    const snapshot = evaluateCadPart(input), out = snapshot.outputs[0], brep = out.brep;
    assert.deepEqual(input, before); assert.equal(snapshot.outputs.length, 1); assert.equal(out.id, 'n2');
    const report = checkBrep(brep, { strict: true });
    assert.equal(report.valid, true, report.issues.join('\n'));
    assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 6, loops: 6, coedges: 24, edges: 12, vertices: 8 });
    assert.equal(report.topology.length, 1); assert.equal(report.topology[0].genus, 0);
    assert.ok(brep.coedges.every(use => use.pcurve === null));
    assert.deepEqual(brep.faces.map(face => face.name).sort(), source.outputs[0].brep.faces.map(face => face.name).sort());
    assert.deepEqual(brep.edges.map(edge => edge.name).sort(), source.outputs[0].brep.edges.map(edge => edge.name).sort());
    if (byPull.has(pull)) assert.deepEqual(draftIncidence(brep), byPull.get(pull));
    else byPull.set(pull, draftIncidence(brep));
    const reversed = structuredClone(input); reversed.features.at(-1).faces.reverse();
    assert.deepEqual(evaluateCadPart(reversed).outputs[0].brep, brep);
    assert.deepEqual(reevaluate(source, { document: input }).outputs[0].brep, brep);

    // Integrate the independent rectangular slices: (W-2*k*s)*(D-2*k*s), s in [-N,H-N].
    const k = Math.tan(angle * Math.PI / 180), integral = degree => ((H - N) ** (degree + 1) - (-N) ** (degree + 1)) / (degree + 1);
    const volume = W * D * H - 2 * (W + D) * k * integral(1) + 4 * k * k * integral(2);
    const centre = N + (W * D * integral(1) - 2 * (W + D) * k * integral(2) + 4 * k * k * integral(3)) / volume;
    for (const mass of [massPropertiesOf(out), brepMassProperties(brep, 1)]) {
      close(mass.volume, volume, 1e-7, 'four-side independent volume');
      [W / 2, D / 2, start + sign * centre].forEach((value, i) => close(mass.centroid[i], value, coordinateLimit, 'four-side centroid'));
    }
    for (const station of [0, H]) {
      const inset = k * (station - N), z = start + sign * station;
      for (const x of [inset, W - inset]) for (const y of [inset, D - inset])
        assert.ok(brep.vertices.some(vertex => samePoint(vertex.point, [x, y, z])));
    }
    for (const [name, normal] of [[left, [-1, 0, sign * k]], [right, [1, 0, sign * k]],
      [front, [0, -1, sign * k]], [back, [0, 1, sign * k]]]) {
      const plane = faceGeometry(brep.faces.find(face => face.name === name));
      assert.equal(plane.kind, 'plane');
      plane.n.forEach((value, i) => close(value, normal[i] / Math.hypot(...normal), coordinateLimit, 'four-side support normal'));
    }
    for (const [xFace, xAt, xNeutral] of [[left, q => q, 0], [right, q => W - q, W]]) {
      for (const [yFace, yAt, yNeutral] of [[front, q => q, 0], [back, q => D - q, D]]) {
        const edge = brep.edges.find(candidate => candidate.name === [xFace, yFace].sort().join('|'));
        assert.ok(edge && edge.curve.degree === 1 && edge.curve.controlPoints.length === 2);
        const endpoints = [0, H].map(station => {
          const q = k * (station - N), point = [xAt(q), yAt(q), start + sign * station];
          assert.ok(edge.curve.controlPoints.some(pole => samePoint(pole, point)));
          return point;
        });
        const neutral = [xNeutral, yNeutral, start + sign * N];
        const onEdge = endpoints[0].map((value, axis) => value + (endpoints[1][axis] - value) * N / H);
        assert.ok(samePoint(onEdge, neutral));
        for (const name of [xFace, yFace]) {
          const plane = faceGeometry(brep.faces.find(face => face.name === name));
          for (const point of [...endpoints, neutral]) close(point.reduce((sum, value, axis) => sum + (value - plane.o[axis]) * plane.n[axis], 0),
            0, coordinateLimit, 'shared line and neutral point on both supports');
        }
      }
    }
    if (pull === 'z' && angle === 10) {
      const reopened = loadCadPart(saveCadPart(snapshot));
      assert.deepEqual(reopened.document, snapshot.document); assert.deepEqual(reopened.outputs[0].brep, brep);
      const edited = reevaluate(reopened, { document: fourSideBox(-10) });
      assert.deepEqual(draftIncidence(edited.outputs[0].brep), draftIncidence(brep));
      assert.deepEqual(reevaluate(edited, { document: input }).outputs[0].brep, brep);
    }
  }
});

test('four-side Draft refuses opposing X or Y collapse at either end and end-coordinate overflow', () => {
  for (const [width, depth] of [[40, 30], [20, 30]]) {
    const boundary = Math.atan(Math.min(width, depth) / (2 * 36)) * 180 / Math.PI;
    for (const [neutral, sign] of [[4, 1], [36, -1]]) for (const delta of [-0.01, 0, 0.01]) {
      const input = fourSideBox(sign * (boundary + delta), 'z', neutral);
      input.features[0].max = [width, depth];
      const before = structuredClone(input);
      if (delta < 0) assert.doesNotThrow(() => evaluateCadPart(input));
      else assert.throws(() => evaluateCadPart(input), error => error.code === 'GEOMETRY' && /closes a box wall/.test(error.message));
      assert.deepEqual(input, before);
    }
  }
  for (const angle of [10, -10]) {
    const input = fourSideBox(angle);
    input.features.splice(2, 0, { id: 'm', kind: 'translate', target: 'n1', offset: [9960, 9970, 0] });
    input.features.at(-1).target = 'm';
    assert.throws(() => evaluateCadPart(input), error => error.code === 'PARAMETER' && /modeling coordinate range/.test(error.message));
  }
});

test('four-side native Draft preserves the omitted or noninterior neutral and unsupported-source refusals', () => {
  const rejects = input => {
    const before = structuredClone(input);
    assert.throws(() => evaluateCadPart(input), error => ['CAPABILITY', 'SELECTION'].includes(error.code));
    assert.deepEqual(input, before);
  };
  for (const pull of ['z', '-z']) {
    const automatic = fourSideBox(10, pull); delete automatic.features.at(-1).neutral; rejects(automatic);
    for (const neutral of [-1, 0, 40, 41]) rejects(fourSideBox(10, pull, neutral));
  }
  const duplicate = fourSideBox(); duplicate.features.at(-1).faces = [front, right, back, right]; rejects(duplicate);
  const cap = fourSideBox(); cap.features.at(-1).faces = [front, right, back, 'n1.top']; rejects(cap);
  const holed = fourSideBox();
  holed.features.splice(2, 0, { id: 'h', kind: 'hole', target: 'n1', center: [20, 15], radius: 2 });
  holed.features.at(-1).target = 'h'; rejects(holed);
});
