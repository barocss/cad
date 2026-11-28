import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCadPart, reevaluate, massPropertiesOf, brepMassProperties, surfaceAreaOf, checkBrep, evaluateCurve, evaluateSurface, faceGeometry, tessellateBrep, saveCadPart, loadCadPart } from '../dist/index.js';
import { draftAnnularOuterWallIfAdmitted, draftAnnularBoreWallIfAdmitted, draftCircularWallIfAdmitted, offsetBoreWallIfAdmitted, offsetCircularWallIfAdmitted, boreWallOffsetFrame, circularWallOffsetFrame, annularCapReplacementFrame } from '../dist/features/bored-cap-offset.js';

const names = ['n1.side0#1', 'n1.side0#2'], boreNames = ['n1.hole0.side0#1', 'n1.hole0.side0#2'];
const doc = (angle = 5, pull = 'z', neutral = 11) => ({ format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {}, features: [
  { id: 'n0', kind: 'sketch', profile: 'circle', center: [14, 9], radius: 12,
    holes: [[{ kind: 'arc', start: [18, 9], center: [14, 9], direction: 'ccw' }]] },
  { id: 'n1', kind: 'extrude', sketch: 'n0', from: 3, height: 16 },
  { id: 'd', kind: 'draft', target: 'n1', faces: names, angle, pull, ...(neutral === undefined ? {} : { neutral }) },
] });
const stock = source => evaluateCadPart({ ...source, features: source.features.slice(0, 2) }).outputs[0].brep;
const close = (actual, expected, label, tolerance = 1e-8) => assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance, `${label}: ${actual} vs ${expected}`);
const oracle = (angle, pull, neutral) => {
  const k = (pull === 'z' ? 1 : -1) * Math.tan(angle * Math.PI / 180), a = 12 - k * (3 - neutral), b = 12 - k * (19 - neutral), D = a * a + a * b + b * b;
  const outerV = Math.PI * 16 * D / 3, boreV = Math.PI * 16 * 16, outerZ = 3 + 16 * (a * a + 2 * a * b + 3 * b * b) / (4 * D), volume = outerV - boreV;
  return { k, a, b, volume, centroid: [14, 9, (outerV * outerZ - boreV * 11) / volume],
    area: Math.PI * (a + b) * Math.hypot(16, b - a) + 2 * Math.PI * 4 * 16 + Math.PI * (a * a + b * b - 32) };
};
function metadata(brep) {
  return { source: brep.source, bodies: brep.bodies, shells: brep.shells, loops: brep.loops,
    coedges: brep.coedges.map(({ pcurve, ...use }) => ({ ...use, pcurve: pcurve && { ...pcurve, controlPoints: undefined } })),
    faces: brep.faces.map(({ surface, ...face }) => ({ ...face, surface: { ...surface, controlPoints: undefined } })),
    edges: brep.edges.map(({ curve, ...edge }) => ({ ...edge, curve: { ...curve, controlPoints: undefined } })),
    vertices: brep.vertices.map(({ point: _point, ...vertex }) => vertex) };
}
function meshOf(brep) {
  const mesh = tessellateBrep(brep, { segmentsPerQuarter: 32 }), P = mesh.positions, I = mesh.indices, uses = new Map();
  const key = i => `${P[i * 3]},${P[i * 3 + 1]},${P[i * 3 + 2]}`;
  for (let i = 0; i < I.length; i += 3) for (let k = 0; k < 3; k++) {
    const edge = `${key(I[i + k])}>${key(I[i + (k + 1) % 3])}`; uses.set(edge, (uses.get(edge) ?? 0) + 1);
  }
  for (const [edge, count] of uses) { const [a, b] = edge.split('>'); assert.equal(uses.get(`${b}>${a}`), count, edge); }
  return mesh;
}
function materialAt(mesh, point) {
  const hits = [], P = mesh.positions, I = mesh.indices;
  for (let i = 0; i < I.length; i += 3) {
    const a = [...P.slice(I[i] * 3, I[i] * 3 + 3)], b = [...P.slice(I[i + 1] * 3, I[i + 1] * 3 + 3)], c = [...P.slice(I[i + 2] * 3, I[i + 2] * 3 + 3)];
    const u = [b[0] - a[0], b[1] - a[1]], v = [c[0] - a[0], c[1] - a[1]], det = u[0] * v[1] - u[1] * v[0];
    if (Math.abs(det) < 1e-12) continue;
    const x = point[0] - a[0], y = point[1] - a[1], s = (x * v[1] - y * v[0]) / det, t = (u[0] * y - u[1] * x) / det;
    if (s < -1e-10 || t < -1e-10 || s + t > 1 + 1e-10) continue;
    const z = a[2] + s * (b[2] - a[2]) + t * (c[2] - a[2]);
    if (z > point[2] + 1e-9 && !hits.some(hit => Math.abs(hit - z) < 1e-8)) hits.push(z);
  }
  return hits.length % 2 === 1;
}

for (const pull of ['z', '-z']) for (const angle of [5, -5]) test(`outer annular Draft ${angle} degrees/${pull} retains its bore, owners and exact cap pcurves`, () => {
  const original = stock(doc()), boreFaces = original.faces.filter(face => boreNames.includes(face.name)), boreLoops = new Set(boreFaces.flatMap(face => face.loops));
  const boreEdges = new Set(original.coedges.filter(use => boreLoops.has(use.loop)).map(use => use.edge));
  const boreVertices = new Set(original.edges.filter(edge => boreEdges.has(edge.id)).flatMap(edge => edge.vertices));
  for (const neutral of [3, 11, 19]) {
    const source = doc(angle, pull, neutral), before = structuredClone(source), snapshot = evaluateCadPart(source), result = snapshot.outputs[0], brep = result.brep, ref = oracle(angle, pull, neutral);
    assert.deepEqual(source, before); assert.deepEqual(metadata(brep), metadata(original));
    const report = checkBrep(brep, { strict: true, pcurveSamples: 9 }); assert.ok(report.valid, report.issues.join('\n'));
    assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 6, loops: 8, coedges: 24, edges: 12, vertices: 8 });
    assert.equal(report.topology[0].genus, 1); assert.ok(brep.shells[0].closed && brep.coedges.every(use => use.pcurve));
    for (const face of boreFaces) assert.deepEqual(brep.faces.find(candidate => candidate.id === face.id), face, 'retained bore surface and sense');
    for (const edge of original.edges.filter(edge => boreEdges.has(edge.id))) assert.deepEqual(brep.edges.find(candidate => candidate.id === edge.id), edge, 'fixed bore 3D trims');
    for (const vertex of original.vertices.filter(vertex => boreVertices.has(vertex.id))) assert.deepEqual(brep.vertices.find(candidate => candidate.id === vertex.id), vertex, 'fixed bore native vertices');
    for (const use of original.coedges.filter(use => boreLoops.has(use.loop))) assert.deepEqual(brep.coedges.find(candidate => candidate.id === use.id), use, 'fixed bore side pcurves');
    const edgeById = new Map(brep.edges.map(edge => [edge.id, edge]));
    let changedInnerUV = 0, reversedCapUses = 0;
    for (const [capName, z, radius] of [['n1.bottom', 3, ref.a], ['n1.top', 19, ref.b]]) {
      const face = brep.faces.find(candidate => candidate.name === capName), support = faceGeometry(face), up = capName === 'n1.top';
      assert.equal(support.kind, 'plane'); close(support.o[2], z, 'fixed cap plane');
      support.n.forEach((value, axis) => close(value, axis === 2 ? up ? 1 : -1 : 0, 'fixed cap outward normal')); assert.equal(face.loops.length, 2);
      const poles = face.surface.controlPoints.flat(), min = [Math.min(...poles.map(point => point[0])), Math.min(...poles.map(point => point[1]))];
      const max = [Math.max(...poles.map(point => point[0])), Math.max(...poles.map(point => point[1]))];
      close(min[0], 14 - radius, 'cap-specific minimum X'); close(max[0], 14 + radius, 'cap-specific maximum X');
      close(min[1], 9 - radius, 'cap-specific minimum Y'); close(max[1], 9 + radius, 'cap-specific maximum Y');
      for (const use of brep.coedges.filter(use => face.loops.includes(use.loop))) {
        const edge = edgeById.get(use.edge), old = original.coedges.find(candidate => candidate.id === use.id), loop = brep.loops.find(candidate => candidate.id === use.loop);
        if (use.sense === 'reversed') reversedCapUses++;
        if (loop.kind === 'inner' && JSON.stringify(use.pcurve.controlPoints) !== JSON.stringify(old.pcurve.controlPoints)) changedInnerUV++;
        assert.deepEqual(use.pcurve.knots, edge.curve.knots); assert.deepEqual(use.pcurve.weights, edge.curve.weights);
        edge.curve.controlPoints.forEach(([x, y], i) => {
          const u = (x - min[0]) / (max[0] - min[0]), v = (y - min[1]) / (max[1] - min[1]);
          close(use.pcurve.controlPoints[i][0], up ? u : v, 'cap affine UV coefficient U');
          close(use.pcurve.controlPoints[i][1], up ? v : u, 'cap affine UV coefficient V');
        });
        if (z === neutral) assert.deepEqual(use, old, 'neutral cap keeps both complete trim loops');
      }
      if (z === neutral) assert.deepEqual(face, original.faces.find(candidate => candidate.id === face.id), 'neutral cap chart is byte exact');
    }
    assert.ok(changedInnerUV > 0, 'fixed bore must have changed UV coordinates on a changed outer cap chart'); assert.ok(reversedCapUses > 0);
    for (const use of brep.coedges) {
      const edge = edgeById.get(use.edge), loop = brep.loops.find(candidate => candidate.id === use.loop), face = brep.faces.find(candidate => candidate.id === loop.face);
      for (const t of [0, .15, .4, .75, 1]) {
        const p = evaluateCurve(edge.curve, t), uv = evaluateCurve(use.pcurve, t), q = evaluateSurface(face.surface, uv[0], uv[1]);
        for (let axis = 0; axis < 3; axis++) close(q[axis], p[axis], 'actual native pcurve binding');
      }
    }
    for (const face of brep.faces.filter(face => names.includes(face.name))) for (const u of [0, .1, .3, .5, .8, 1]) for (const v of [0, .2, (neutral - 3) / 16, .7, 1]) {
      const p = evaluateSurface(face.surface, u, v); close(Math.hypot(p[0] - 14, p[1] - 9), 12 - ref.k * (p[2] - neutral), 'native conical exterior');
    }
    for (const mass of [massPropertiesOf(result), brepMassProperties(brep, 1)]) {
      close(mass.volume, ref.volume, 'frustum less fixed cylinder volume', 1e-7);
      mass.centroid.forEach((value, axis) => close(value, ref.centroid[axis], 'independent centroid', 1e-7));
    }
    close(surfaceAreaOf(result), ref.area, 'frustum/cylinder/annuli area', 1e-6);
    const mesh = meshOf(brep);
    for (const z of [4, 10, 18]) {
      const radius = 12 - ref.k * (z - neutral);
      assert.equal(materialAt(mesh, [14 + radius - .2, 9, z]), true, 'actual material inside tapered exterior');
      assert.equal(materialAt(mesh, [14 + radius + .2, 9, z]), false, 'actual exterior remains empty');
      assert.equal(materialAt(mesh, [17.7, 9, z]), false, 'fixed bore remains empty'); assert.equal(materialAt(mesh, [18.3, 9, z]), true, 'fixed bore retains material outside');
    }
    if (neutral === 11) {
      assert.deepEqual(loadCadPart(saveCadPart(snapshot)).outputs[0].brep, brep);
      const reversed = structuredClone(source); reversed.features.at(-1).faces.reverse(); assert.deepEqual(evaluateCadPart(reversed).outputs[0].brep, brep);
    } else for (const edge of original.edges.filter(edge => edge.curve.controlPoints.every(point => point[2] === neutral))) assert.deepEqual(edgeById.get(edge.id), edge, 'all neutral rim curves stay exact');
  }
});

test('outer Draft default signed neutral and cached independent edits match the exact R12/R11 fixture', () => {
  const angle = Math.atan(1 / 16) * 180 / Math.PI;
  for (const pull of ['z', '-z']) {
    const source = doc(angle, pull); delete source.features.at(-1).neutral;
    const explicit = structuredClone(source); explicit.features.at(-1).neutral = pull === 'z' ? 3 : 19;
    const snapshot = evaluateCadPart(source), result = snapshot.outputs[0]; assert.deepEqual(result.brep, evaluateCadPart(explicit).outputs[0].brep);
    close(massPropertiesOf(result).volume, 5584 * Math.PI / 3, 'R12/R11 exterior less R4 bore', 1e-7);
    const edited = doc(-angle, pull, 11), cached = reevaluate(snapshot, { document: edited }).outputs[0];
    assert.deepEqual(cached.brep, evaluateCadPart(edited).outputs[0].brep);
    const fixed = doc(angle, pull, 11); fixed.parameters.N = 11; fixed.features.at(-1).neutral = { parameter: 'N' };
    const first = evaluateCadPart(fixed), moved = reevaluate(first, { parameters: { N: 3 } }).outputs[0];
    close(massPropertiesOf(moved).volume, oracle(angle, pull, 3).volume, 'fixed world neutral parameter', 1e-7);
  }
});

test('tagged/CW original annular stock at negative coordinates keeps its native exterior ownership', () => {
  const source = doc(); source.features[0].center = [-14, -9];
  source.features[0].holes[0][0] = { kind: 'arc', start: [-10, -9], center: [-14, -9], direction: 'cw' };
  source.features[0].sideTags = { outer: ['outside'], holes: [['bore']] }; source.features.at(-1).faces = ['n1.side[outside]#1', 'n1.side[outside]#2'];
  const result = evaluateCadPart(source).outputs[0], report = checkBrep(result.brep, { strict: true }); assert.ok(report.valid, report.issues.join('\n'));
  close(massPropertiesOf(result).volume, oracle(5, 'z', 11).volume, 'tagged/CW exterior volume', 1e-7);
  close(massPropertiesOf(result).centroid[0], -14, 'negative X center'); close(massPropertiesOf(result).centroid[1], -9, 'negative Y center');
  assert.ok(source.features.at(-1).faces.every(name => result.brep.faces.some(face => face.name === name)));
});

test('outer Draft rejects partial/mixed walls, wrong pull/neutral, retained-bore contact, no movement and range overflow', () => {
  const refuses = (source, category, pattern) => {
    const before = structuredClone(source);
    assert.throws(() => evaluateCadPart(source), error => error.code === category && pattern.test(error.message)); assert.deepEqual(source, before);
  };
  for (const faces of [[names[0]], ['n1.side0'], [names[0], names[0]], [names[0], 'n1.top'], [names[0], boreNames[0]]]) {
    const source = doc(); source.features.at(-1).faces = faces; refuses(source, 'CAPABILITY', /both distinct original native halves/);
  }
  for (const pull of ['x', '-x', 'y', '-y']) refuses(doc(5, pull), 'SELECTION', /Outer circular wall Draft needs a signed world Z pull/);
  for (const neutral of [2, 20]) refuses(doc(5, 'z', neutral), 'SELECTION', /Outer circular wall Draft neutral must lie within/);
  for (const pull of ['z', '-z']) {
    const neutral = pull === 'z' ? 3 : 19;
    refuses(doc(Math.atan(8 / 16) * 180 / Math.PI, pull, neutral), 'GEOMETRY', /annular outer draft: the draft reaches or crosses the retained bore/);
    refuses(doc(44, pull, neutral), 'GEOMETRY', /retained bore/);
  }
  refuses(doc(1e-15, 'z', 3), 'GEOMETRY', /angle is too small to move the native walls/);
  const far = doc(-44, 'z', 3); far.features[0].center[0] = 9980; far.features[0].holes[0][0].center[0] = 9980; far.features[0].holes[0][0].start[0] = 9984;
  refuses(far, 'GEOMETRY', /drafted walls leave the modeling range/);
  for (const angle of [0, 45, -45, NaN, Infinity]) refuses(doc(angle), 'INPUT', /angle must be a number/);
});

test('old inner Draft, uniform offsets and eccentric annular caps keep their contracts; cone Offset stays refused', () => {
  const source = stock(doc()), saved = structuredClone(source);
  assert.equal(draftCircularWallIfAdmitted(source, names, .1, 'z', 3), undefined, 'incumbent disk producer still refuses annular stock');
  assert.equal(draftAnnularBoreWallIfAdmitted(source, names, .1, 'z', 3), undefined);
  assert.equal(draftAnnularOuterWallIfAdmitted(source, boreNames, .1, 'z', 3), undefined);
  const inner = doc(); inner.features.at(-1).faces = boreNames;
  const innerOutput = evaluateCadPart(inner).outputs[0], k = Math.tan(5 * Math.PI / 180), a = 4 - 8 * k, b = 4 + 8 * k;
  close(massPropertiesOf(innerOutput).volume, Math.PI * 144 * 16 - Math.PI * 16 * (a * a + a * b + b * b) / 3, 'unchanged D2223 inner Draft oracle', 1e-7);
  const uniformOuter = offsetCircularWallIfAdmitted(source, names[0], 1), uniformBore = offsetBoreWallIfAdmitted(source, boreNames[0], 1);
  close(brepMassProperties(uniformOuter, 1).volume, Math.PI * (169 - 16) * 16, 'incumbent outer Offset', 1e-7);
  close(brepMassProperties(uniformBore, 1).volume, Math.PI * (144 - 9) * 16, 'incumbent inner Offset', 1e-7);
  const cone = evaluateCadPart(doc()).outputs[0].brep;
  assert.equal(draftAnnularOuterWallIfAdmitted(cone, names, .1, 'z', 3), undefined); assert.equal(draftAnnularBoreWallIfAdmitted(cone, boreNames, .1, 'z', 3), undefined);
  assert.equal(circularWallOffsetFrame(cone, names[0]), undefined); assert.equal(offsetCircularWallIfAdmitted(cone, names[0], 1), undefined);
  assert.equal(boreWallOffsetFrame(cone, boreNames[0]), undefined); assert.equal(offsetBoreWallIfAdmitted(cone, boreNames[0], 1), undefined);
  const eccentric = doc(); eccentric.features.pop(); eccentric.features[0].holes[0][0].center[0] += .01; eccentric.features[0].holes[0][0].start[0] += .01;
  const eccentricStock = evaluateCadPart(eccentric).outputs[0].brep;
  assert.ok(annularCapReplacementFrame(eccentricStock, 'n1.top'), 'the existing eccentric cap proof is unchanged');
  assert.equal(draftAnnularOuterWallIfAdmitted(eccentricStock, names, .1, 'z', 3), undefined);
  const malformed = structuredClone(source), cap = malformed.faces.find(face => face.name === 'n1.top');
  malformed.coedges.find(use => cap.loops.includes(use.loop)).pcurve.controlPoints[1][0] += 1e-9;
  assert.equal(draftAnnularOuterWallIfAdmitted(malformed, names, .1, 'z', 3), undefined, 'native cap coefficients keep the incumbent strict comparison');
  assert.deepEqual(source, saved);
});
