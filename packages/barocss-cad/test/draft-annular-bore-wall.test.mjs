import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCadPart, reevaluate, massPropertiesOf, brepMassProperties, surfaceAreaOf, checkBrep, evaluateCurve, evaluateSurface, faceGeometry, tessellateBrep, saveCadPart, loadCadPart } from '../dist/index.js';
import { draftAnnularBoreWallIfAdmitted, draftCircularWallIfAdmitted, offsetBoreWallIfAdmitted, offsetCircularWallIfAdmitted, boreWallOffsetFrame, circularWallOffsetFrame } from '../dist/features/bored-cap-offset.js';

const names = ['n1.hole0.side0#1', 'n1.hole0.side0#2'];
const doc = (angle = 5, pull = 'z', neutral = 11) => ({ format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {}, features: [
  { id: 'n0', kind: 'sketch', profile: 'circle', center: [14, 9], radius: 12,
    holes: [[{ kind: 'arc', start: [18, 9], center: [14, 9], direction: 'ccw' }]] },
  { id: 'n1', kind: 'extrude', sketch: 'n0', from: 3, height: 16 },
  { id: 'd', kind: 'draft', target: 'n1', faces: names, angle, pull, ...(neutral === undefined ? {} : { neutral }) },
] });
const stock = source => evaluateCadPart({ ...source, features: source.features.slice(0, 2) }).outputs[0].brep;
const close = (actual, expected, label, tolerance = 1e-8) => assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance, `${label}: ${actual} vs ${expected}`);
const ref = (angle, pull, neutral) => {
  const k = (pull === 'z' ? 1 : -1) * Math.tan(angle * Math.PI / 180), a = 4 + k * (3 - neutral), b = 4 + k * (19 - neutral), D = a * a + a * b + b * b;
  const outerV = Math.PI * 144 * 16, innerV = Math.PI * 16 * D / 3, innerZ = 3 + 16 * (a * a + 2 * a * b + 3 * b * b) / (4 * D);
  const volume = outerV - innerV;
  return { k, a, b, volume, centroid: [14, 9, (outerV * 11 - innerV * innerZ) / volume],
    surfaceArea: 2 * Math.PI * 12 * 16 + Math.PI * (a + b) * Math.hypot(16, b - a) + Math.PI * (288 - a * a - b * b) };
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

for (const pull of ['z', '-z']) for (const angle of [5, -5]) test(`inner annular Draft ${angle} degrees/${pull} keeps the exterior, exact native trims and independent mass`, () => {
  const original = stock(doc());
  const innerLoops = new Set(original.faces.filter(face => names.includes(face.name)).flatMap(face => face.loops));
  const innerEdgeIds = new Set(original.coedges.filter(use => innerLoops.has(use.loop)).map(use => use.edge));
  const innerVertices = new Set(original.edges.filter(edge => innerEdgeIds.has(edge.id)).flatMap(edge => edge.vertices));
  const capInnerLoops = new Set(original.loops.filter(loop => loop.kind === 'inner').map(loop => loop.id));
  for (const neutral of [3, 11, 19]) {
    const source = doc(angle, pull, neutral), before = structuredClone(source), snapshot = evaluateCadPart(source), result = snapshot.outputs[0], brep = result.brep, oracle = ref(angle, pull, neutral);
    assert.deepEqual(source, before); assert.deepEqual(metadata(brep), metadata(original));
    const report = checkBrep(brep, { strict: true, pcurveSamples: 9 }); assert.ok(report.valid, report.issues.join('\n'));
    assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 6, loops: 8, coedges: 24, edges: 12, vertices: 8 });
    assert.equal(report.topology[0].genus, 1); assert.ok(brep.shells[0].closed && brep.coedges.every(use => use.pcurve));
    for (const face of original.faces.filter(face => !names.includes(face.name))) assert.deepEqual(brep.faces.find(candidate => candidate.id === face.id), face, 'outer cylinders and both cap surface records stay exact');
    for (const edge of original.edges.filter(edge => !innerEdgeIds.has(edge.id))) assert.deepEqual(brep.edges.find(candidate => candidate.id === edge.id), edge, 'outer native curves stay exact');
    for (const vertex of original.vertices.filter(vertex => !innerVertices.has(vertex.id))) assert.deepEqual(brep.vertices.find(candidate => candidate.id === vertex.id), vertex, 'outer native vertices stay exact');
    for (const use of original.coedges.filter(use => !capInnerLoops.has(use.loop))) assert.deepEqual(brep.coedges.find(candidate => candidate.id === use.id), use, 'side and outer cap pcurves stay exact');
    const edges = new Map(brep.edges.map(edge => [edge.id, edge]));
    for (const use of brep.coedges) {
      const loop = brep.loops.find(item => item.id === use.loop), face = brep.faces.find(item => item.id === loop.face), edge = edges.get(use.edge);
      for (const t of [0, .15, .4, .75, 1]) {
        const p = evaluateCurve(edge.curve, t), uv = evaluateCurve(use.pcurve, t), q = evaluateSurface(face.surface, uv[0], uv[1]);
        for (let axis = 0; axis < 3; axis++) close(q[axis], p[axis], 'actual pcurve/edge binding');
      }
    }
    for (const face of brep.faces.filter(face => names.includes(face.name))) for (const u of [0, .1, .3, .5, .8, 1]) for (const v of [0, .2, (neutral - 3) / 16, .7, 1]) {
      const p = evaluateSurface(face.surface, u, v); close(Math.hypot(p[0] - 14, p[1] - 9), 4 + oracle.k * (p[2] - neutral), 'native conical bore radius');
    }
    for (const mass of [massPropertiesOf(result), brepMassProperties(brep, 1)]) {
      close(mass.volume, oracle.volume, 'outer cylinder less inner frustum volume', 1e-7);
      mass.centroid.forEach((value, axis) => close(value, oracle.centroid[axis], 'independent centroid', 1e-7));
    }
    close(surfaceAreaOf(result), oracle.surfaceArea, 'independent cylinder/frustum/annuli area', 1e-6);
    const mesh = meshOf(brep);
    for (const z of [4, 10, 18]) {
      const radius = 4 + oracle.k * (z - neutral);
      assert.equal(materialAt(mesh, [14 + radius - .2, 9, z]), false, 'actual bore stays empty');
      assert.equal(materialAt(mesh, [14 + radius + .2, 9, z]), true, 'actual tapered bore has material outside');
      assert.equal(materialAt(mesh, [25.5, 9, z]), true, 'unchanged outer wall');
      assert.equal(materialAt(mesh, [26.5, 9, z]), false, 'unchanged exterior');
    }
    if (neutral === 3 || neutral === 19) {
      for (const edge of original.edges.filter(edge => edge.curve.controlPoints.every(point => point[2] === neutral))) assert.deepEqual(edges.get(edge.id), edge, 'all neutral rim records stay exact');
      for (const vertex of original.vertices.filter(vertex => vertex.point[2] === neutral)) assert.deepEqual(brep.vertices.find(candidate => candidate.id === vertex.id), vertex, 'neutral native vertices stay exact');
      const neutralCap = original.faces.find(face => face.name === (neutral === 3 ? 'n1.bottom' : 'n1.top'));
      for (const use of original.coedges.filter(use => neutralCap.loops.includes(use.loop))) assert.deepEqual(brep.coedges.find(candidate => candidate.id === use.id), use, 'neutral cap trim bytes stay exact');
    } else {
      assert.deepEqual(loadCadPart(saveCadPart(snapshot)).outputs[0].brep, brep);
      const reversed = structuredClone(source); reversed.features.at(-1).faces.reverse(); assert.deepEqual(evaluateCadPart(reversed).outputs[0].brep, brep);
    }
  }
});

test('default signed endpoint and exact fixture angle produce independent expected bore radii and cached edits', () => {
  const angle = Math.atan(1 / 16) * 180 / Math.PI;
  for (const pull of ['z', '-z']) {
    const source = doc(angle, pull); delete source.features.at(-1).neutral;
    const explicit = structuredClone(source); explicit.features.at(-1).neutral = pull === 'z' ? 3 : 19;
    const snapshot = evaluateCadPart(source), result = snapshot.outputs[0]; assert.deepEqual(result.brep, evaluateCadPart(explicit).outputs[0].brep);
    close(massPropertiesOf(result).volume, 5936 * Math.PI / 3, 'R12 less R4/R5 frustum', 1e-7);
    const changed = doc(-angle, pull, 11), cached = reevaluate(snapshot, { document: changed }).outputs[0];
    assert.deepEqual(cached.brep, evaluateCadPart(changed).outputs[0].brep);
    const fixed = doc(angle, pull, 11); fixed.parameters.N = 11; fixed.features.at(-1).neutral = { parameter: 'N' };
    const first = evaluateCadPart(fixed), edited = reevaluate(first, { parameters: { N: 3 } }).outputs[0];
    close(massPropertiesOf(edited).volume, ref(angle, pull, 3).volume, 'fixed world neutral parameter edit', 1e-7);
  }
});

test('tagged intrinsic bore, negative coordinates and CW full arcs retain their authored native halves', () => {
  const source = doc(); source.features[0].center = [-14, -9];
  source.features[0].holes[0][0] = { kind: 'arc', start: [-10, -9], center: [-14, -9], direction: 'cw' };
  source.features[0].sideTags = { outer: ['outside'], holes: [['bore']] };
  source.features.at(-1).faces = ['n1.side[bore]#1', 'n1.side[bore]#2'];
  const result = evaluateCadPart(source).outputs[0], report = checkBrep(result.brep, { strict: true });
  assert.ok(report.valid, report.issues.join('\n')); close(massPropertiesOf(result).volume, ref(5, 'z', 11).volume, 'tagged/CW volume', 1e-7);
  close(massPropertiesOf(result).centroid[0], -14, 'negative X center'); close(massPropertiesOf(result).centroid[1], -9, 'negative Y center');
  assert.ok(source.features.at(-1).faces.every(name => result.brep.faces.some(face => face.name === name)));
});

test('partial/mixed selection, wrong pull/neutral, axis collapse and outer contact have typed refusals without mutation', () => {
  const refuses = (source, category, pattern) => {
    const before = structuredClone(source);
    assert.throws(() => evaluateCadPart(source), error => error.code === category && pattern.test(error.message)); assert.deepEqual(source, before);
  };
  for (const faces of [[names[0]], ['n1.hole0.side0'], [names[0], names[0]], [names[0], 'n1.top'], ['n1.side0#1', 'n1.side0#2']]) {
    const source = doc(); source.features.at(-1).faces = faces; refuses(source, 'CAPABILITY', /both distinct original native halves/);
  }
  for (const pull of ['x', '-x', 'y', '-y']) refuses(doc(5, pull), 'SELECTION', /signed world Z pull/);
  for (const neutral of [2, 20]) refuses(doc(5, 'z', neutral), 'SELECTION', /within the original caps/);
  for (const pull of ['z', '-z']) {
    const neutral = pull === 'z' ? 3 : 19;
    refuses(doc(-Math.atan(4 / 16) * 180 / Math.PI, pull, neutral), 'GEOMETRY', /annular bore draft: the draft reaches or crosses the bore axis/);
    refuses(doc(Math.atan(8 / 16) * 180 / Math.PI, pull, neutral), 'GEOMETRY', /annular bore draft: the draft reaches or crosses the outer tube wall/);
    refuses(doc(-44, pull, neutral), 'GEOMETRY', /bore axis/); refuses(doc(44, pull, neutral), 'GEOMETRY', /outer tube wall/);
  }
  refuses(doc(1e-15, 'z', 3), 'GEOMETRY', /too small to move the native bore/);
  for (const angle of [0, 45, -45, NaN, Infinity]) refuses(doc(angle), 'INPUT', /angle must be a number/);
});

test('new producer does not widen old circular Draft, bore Offset or cone/freeform Offset admission', () => {
  const source = stock(doc()), saved = structuredClone(source);
  assert.equal(draftCircularWallIfAdmitted(source, ['n1.side0#1', 'n1.side0#2'], .1, 'z', 3), undefined, 'old producer still refuses annular stock');
  assert.equal(draftAnnularBoreWallIfAdmitted(source, ['n1.side0#1', 'n1.side0#2'], .1, 'z', 3), undefined);
  assert.ok(boreWallOffsetFrame(source, names[0])); assert.ok(circularWallOffsetFrame(source, 'n1.side0#1'));
  const offset = offsetBoreWallIfAdmitted(source, names[0], 1); assert.ok(offset);
  close(brepMassProperties(offset, 1).volume, Math.PI * (144 - 9) * 16, 'old uniform bore Offset volume', 1e-7);
  const cone = evaluateCadPart(doc()).outputs[0].brep;
  assert.equal(draftAnnularBoreWallIfAdmitted(cone, names, .1, 'z', 3), undefined);
  assert.equal(boreWallOffsetFrame(cone, names[0]), undefined); assert.equal(offsetBoreWallIfAdmitted(cone, names[0], 1), undefined);
  assert.equal(circularWallOffsetFrame(cone, 'n1.side0#1'), undefined); assert.equal(offsetCircularWallIfAdmitted(cone, 'n1.side0#1', 1), undefined);
  // A separately authored eccentric circle is a valid annular stock, but outside this coaxial Draft proof.
  const eccentricDoc = doc(); eccentricDoc.features.pop(); eccentricDoc.features[0].holes[0][0].start[0] += .01; eccentricDoc.features[0].holes[0][0].center[0] += .01;
  const eccentricStock = evaluateCadPart(eccentricDoc).outputs[0].brep;
  assert.equal(draftAnnularBoreWallIfAdmitted(eccentricStock, names, .1, 'z', 3), undefined);
  assert.deepEqual(source, saved);
  const malformed = structuredClone(source), capLoop = malformed.loops.find(loop => loop.kind === 'inner');
  malformed.coedges.find(use => use.loop === capLoop.id).pcurve.controlPoints[1][0] += 1e-9;
  assert.equal(draftAnnularBoreWallIfAdmitted(malformed, names, .1, 'z', 3), undefined, 'no tolerance widening for native cap coefficients');
});

test('authored admission refuses transformed, post-Hole, placed and parameterized source recipes', () => {
  for (const change of [
    source => { source.features[0].plane = { origin: [0, 0, 0], normal: [0, 0, 1], xAxis: [1, 0, 0] }; },
    source => { source.parameters.H = 16; source.features[1].height = { parameter: 'H' }; },
    source => { source.parameters.C = 14; source.features[0].center[0] = { parameter: 'C' }; },
    source => { source.features.splice(2, 0, { id: 'm', kind: 'translate', target: 'n1', offset: [1, 0, 0] }); source.features.at(-1).target = 'm'; },
    source => { source.features.splice(2, 0, { id: 'm', kind: 'rotate', target: 'n1', axis: 'z', angle: 10 }); source.features.at(-1).target = 'm'; },
  ]) {
    const source = doc(); change(source);
    delete source.features.at(-1).neutral;
    const before = structuredClone(source);
    assert.throws(() => evaluateCadPart(source), error => error.code === 'CAPABILITY' || error.code === 'REFERENCE'); assert.deepEqual(source, before);
  }
  const postHole = doc(); delete postHole.features[0].holes;
  postHole.features.splice(2, 0, { id: 'h', kind: 'hole', target: 'n1', face: 'n1.top', center: [14, 9], radius: 4 });
  const postHoleStock = evaluateCadPart({ ...postHole, features: postHole.features.slice(0, -1) }).outputs[0].brep;
  postHole.features.at(-1).target = 'h'; postHole.features.at(-1).faces = postHoleStock.faces.filter(face => {
    const support = faceGeometry(face); return support.kind === 'cylinder' && support.out === -1;
  }).map(face => face.name);
  delete postHole.features.at(-1).neutral;
  assert.equal(postHole.features.at(-1).faces.length, 2);
  assert.throws(() => evaluateCadPart(postHole), error => error.code === 'CAPABILITY');
  const disk = doc(); delete disk.features[0].holes; const diskStock = stock(disk);
  assert.equal(draftAnnularBoreWallIfAdmitted(diskStock, names, .1, 'z', 3), undefined);
});
