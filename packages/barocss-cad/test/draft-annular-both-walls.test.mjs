import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCadPart, reevaluate, massPropertiesOf, brepMassProperties, surfaceAreaOf, checkBrep, evaluateCurve, evaluateSurface, faceGeometry, tessellateBrep, saveCadPart, loadCadPart } from '../dist/index.js';
import { draftAnnularWallsIfAdmitted, draftAnnularOuterWallIfAdmitted, draftAnnularBoreWallIfAdmitted, draftCircularWallIfAdmitted, boreWallOffsetFrame, circularWallOffsetFrame, offsetBoreWallIfAdmitted, offsetCircularWallIfAdmitted, annularCapReplacementFrame } from '../dist/features/bored-cap-offset.js';

const outerNames = ['n1.side0#1', 'n1.side0#2'], innerNames = ['n1.hole0.side0#1', 'n1.hole0.side0#2'], names = [...outerNames, ...innerNames];
const doc = (angle = 5, pull = 'z', neutral = 11) => ({ format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {}, features: [
  { id: 'n0', kind: 'sketch', profile: 'circle', center: [14, 9], radius: 12,
    holes: [[{ kind: 'arc', start: [18, 9], center: [14, 9], direction: 'ccw' }]] },
  { id: 'n1', kind: 'extrude', sketch: 'n0', from: 3, height: 16 },
  { id: 'd', kind: 'draft', target: 'n1', faces: names, angle, pull, ...(neutral === undefined ? {} : { neutral }) },
] });
const stock = source => evaluateCadPart({ ...source, features: source.features.slice(0, 2) }).outputs[0].brep;
const close = (actual, expected, label, tolerance = 1e-8) => assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance, `${label}: ${actual} vs ${expected}`);
// Equal opposing slopes cancel the quadratic terms: the material cross-section varies linearly in Z.
const reference = (angle, pull, neutral) => {
  const k = (pull === 'z' ? 1 : -1) * Math.tan(angle * Math.PI / 180), d0 = k * (3 - neutral), d1 = k * (19 - neutral);
  const A0 = Math.PI * (128 - 32 * d0), A1 = Math.PI * (128 - 32 * d1);
  return { k, volume: 16 * (A0 + A1) / 2, centroid: [14, 9, 3 + 16 * (A0 + 2 * A1) / (3 * (A0 + A1))],
    area: 32 * Math.PI * Math.hypot(16, 16 * k) + A0 + A1 };
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

for (const pull of ['z', '-z']) for (const angle of [5, -5]) test(`both annular walls Draft ${angle} degrees/${pull} with one neutral retain exact correspondence and final cap trims`, () => {
  const original = stock(doc());
  for (const neutral of [3, 11, 19]) {
    const source = doc(angle, pull, neutral), before = structuredClone(source), snapshot = evaluateCadPart(source), result = snapshot.outputs[0], brep = result.brep, ref = reference(angle, pull, neutral);
    assert.deepEqual(source, before); assert.deepEqual(metadata(brep), metadata(original));
    const report = checkBrep(brep, { strict: true, pcurveSamples: 9 }); assert.ok(report.valid, report.issues.join('\n'));
    assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 6, loops: 8, coedges: 24, edges: 12, vertices: 8 });
    assert.equal(report.topology[0].genus, 1); assert.ok(brep.shells[0].closed && brep.coedges.every(use => use.pcurve));
    const outerOnly = draftAnnularOuterWallIfAdmitted(original, outerNames, angle * Math.PI / 180, pull, neutral);
    const innerOnly = draftAnnularBoreWallIfAdmitted(original, innerNames, angle * Math.PI / 180, pull, neutral);
    assert.ok(outerOnly && innerOnly);
    for (const face of brep.faces.filter(face => names.includes(face.name))) {
      const outer = outerNames.includes(face.name), component = outer ? outerOnly : innerOnly;
      assert.deepEqual(face, component.faces.find(candidate => candidate.id === face.id), 'merged wall keeps its component proof');
      for (const u of [0, .1, .3, .5, .8, 1]) for (const v of [0, .2, (neutral - 3) / 16, .7, 1]) {
        const p = evaluateSurface(face.surface, u, v), expected = outer ? 12 - ref.k * (p[2] - neutral) : 4 + ref.k * (p[2] - neutral);
        close(Math.hypot(p[0] - 14, p[1] - 9), expected, 'two native conical supports');
      }
    }
    const edges = new Map(brep.edges.map(edge => [edge.id, edge]));
    let remappedInner = 0;
    for (const [name, z, up] of [['n1.bottom', 3, false], ['n1.top', 19, true]]) {
      const cap = brep.faces.find(face => face.name === name), support = faceGeometry(cap), radius = 12 - ref.k * (z - neutral);
      assert.equal(support.kind, 'plane'); close(support.o[2], z, 'original cap station'); close(support.n[2], up ? 1 : -1, 'cap direction'); assert.equal(cap.loops.length, 2);
      const poles = cap.surface.controlPoints.flat(), min = [Math.min(...poles.map(p => p[0])), Math.min(...poles.map(p => p[1]))], max = [Math.max(...poles.map(p => p[0])), Math.max(...poles.map(p => p[1]))];
      close(min[0], 14 - radius, 'final outer cap minimum'); close(max[0], 14 + radius, 'final outer cap maximum');
      for (const use of brep.coedges.filter(use => cap.loops.includes(use.loop))) {
        const edge = edges.get(use.edge), loop = brep.loops.find(loop => loop.id === use.loop), oldInnerUse = innerOnly.coedges.find(candidate => candidate.id === use.id);
        assert.deepEqual(use.pcurve.weights, edge.curve.weights); assert.deepEqual(use.pcurve.knots, edge.curve.knots);
        edge.curve.controlPoints.forEach(([x, y], i) => {
          const u = (x - min[0]) / (max[0] - min[0]), v = (y - min[1]) / (max[1] - min[1]);
          close(use.pcurve.controlPoints[i][0], up ? u : v, 'final cap UV coefficient U'); close(use.pcurve.controlPoints[i][1], up ? v : u, 'final cap UV coefficient V');
        });
        if (loop.kind === 'inner' && JSON.stringify(use.pcurve.controlPoints) !== JSON.stringify(oldInnerUse.pcurve.controlPoints)) remappedInner++;
        if (z === neutral) assert.deepEqual(use, original.coedges.find(candidate => candidate.id === use.id), 'shared neutral cap trim bytes');
      }
      if (z === neutral) assert.deepEqual(cap, original.faces.find(face => face.id === cap.id), 'shared neutral cap chart bytes');
    }
    assert.ok(remappedInner > 0, 'inner candidate UV alone cannot be reused in the final outer cap chart');
    for (const use of brep.coedges) {
      const edge = edges.get(use.edge), loop = brep.loops.find(loop => loop.id === use.loop), face = brep.faces.find(face => face.id === loop.face);
      for (const t of [0, .15, .4, .75, 1]) {
        const p = evaluateCurve(edge.curve, t), uv = evaluateCurve(use.pcurve, t), q = evaluateSurface(face.surface, uv[0], uv[1]);
        p.forEach((value, axis) => close(q[axis], value, 'actual final curve/pcurve/surface binding'));
      }
    }
    for (const mass of [massPropertiesOf(result), brepMassProperties(brep, 1)]) {
      close(mass.volume, ref.volume, 'independent linear material section volume', 1e-7);
      mass.centroid.forEach((value, axis) => close(value, ref.centroid[axis], 'independent material section centroid', 1e-7));
    }
    close(surfaceAreaOf(result), ref.area, 'two conical walls and annular caps', 1e-6);
    const mesh = meshOf(brep);
    for (const z of [4, 10, 18]) {
      const inner = 4 + ref.k * (z - neutral), outer = 12 - ref.k * (z - neutral);
      assert.equal(materialAt(mesh, [14 + inner - .2, 9, z]), false); assert.equal(materialAt(mesh, [14 + inner + .2, 9, z]), true);
      assert.equal(materialAt(mesh, [14 + outer - .2, 9, z]), true); assert.equal(materialAt(mesh, [14 + outer + .2, 9, z]), false);
    }
    assert.deepEqual(loadCadPart(saveCadPart(snapshot)).outputs[0].brep, brep);
    if (neutral !== 11) {
      for (const edge of original.edges.filter(edge => edge.curve.controlPoints.every(point => point[2] === neutral))) assert.deepEqual(edges.get(edge.id), edge, 'both original neutral rims');
      for (const vertex of original.vertices.filter(vertex => vertex.point[2] === neutral)) assert.deepEqual(brep.vertices.find(candidate => candidate.id === vertex.id), vertex, 'all neutral vertices');
    }
  }
});

test('both walls use one signed automatic neutral and the exact linear cross-section fixture', () => {
  const angle = Math.atan(1 / 16) * 180 / Math.PI;
  for (const [pull, expectedZ] of [['z', 223 / 21], ['-z', 239 / 21]]) {
    const source = doc(angle, pull); delete source.features.at(-1).neutral;
    const fixed = structuredClone(source); fixed.features.at(-1).neutral = pull === 'z' ? 3 : 19;
    const snapshot = evaluateCadPart(source), result = snapshot.outputs[0]; assert.deepEqual(result.brep, evaluateCadPart(fixed).outputs[0].brep);
    close(massPropertiesOf(result).volume, 1792 * Math.PI, 'R12/R11 less R4/R5 exact volume', 1e-7); close(massPropertiesOf(result).centroid[2], expectedZ, 'exact signed endpoint centroid');
    for (const selection of [[...innerNames, ...outerNames], names.toReversed(), [innerNames[0], outerNames[1], outerNames[0], innerNames[1]]]) {
      const reordered = structuredClone(source); reordered.features.at(-1).faces = selection; assert.deepEqual(evaluateCadPart(reordered).outputs[0].brep, result.brep);
    }
    const changed = doc(-angle, pull, 11), cached = reevaluate(snapshot, { document: changed }).outputs[0]; assert.deepEqual(cached.brep, evaluateCadPart(changed).outputs[0].brep);
    const negative = evaluateCadPart(doc(-angle, pull, pull === 'z' ? 3 : 19)).outputs[0]; close(massPropertiesOf(negative).volume, 2304 * Math.PI, 'negative shared angle volume', 1e-7);
  }
  const centered = evaluateCadPart(doc(angle, 'z', 11)).outputs[0]; close(massPropertiesOf(centered).volume, 2048 * Math.PI, 'centered opposing drafts cancel quadratic volume terms', 1e-7);
  close(massPropertiesOf(centered).centroid[2], 32 / 3, 'centered linear-section centroid');
  const parameterized = doc(angle, 'z', 11); parameterized.parameters.N = 11; parameterized.features.at(-1).neutral = { parameter: 'N' };
  const first = evaluateCadPart(parameterized), next = reevaluate(first, { parameters: { N: 3 } }).outputs[0]; close(massPropertiesOf(next).volume, 1792 * Math.PI, 'one shared neutral parameter', 1e-7);
});

test('individual drafts pass while simultaneous wall contact or crossing has a typed joint refusal', () => {
  const original = stock(doc()), saved = structuredClone(original);
  for (const pull of ['z', '-z']) for (const delta of [4, 5]) {
    const angle = Math.atan(delta / 16), neutral = pull === 'z' ? 3 : 19;
    const outside = draftAnnularOuterWallIfAdmitted(original, outerNames, angle, pull, neutral), inside = draftAnnularBoreWallIfAdmitted(original, innerNames, angle, pull, neutral);
    assert.ok(outside && inside, 'each edit against the original still has a positive retained wall');
    assert.equal(checkBrep(outside, { strict: true }).valid, true); assert.equal(checkBrep(inside, { strict: true }).valid, true);
    assert.throws(() => draftAnnularWallsIfAdmitted(original, names, angle, pull, neutral), error => error.code === 'GEOMETRY'
      && error.message === 'B-rep: annular walls draft: the drafted inner and outer walls reach or cross each other');
    const source = doc(angle * 180 / Math.PI, pull, neutral), before = structuredClone(source);
    assert.throws(() => evaluateCadPart(source), error => error.code === 'GEOMETRY' && /inner and outer walls reach or cross each other/.test(error.message)); assert.deepEqual(source, before);
  }
  const near = Math.atan(3.99 / 16), valid = draftAnnularWallsIfAdmitted(original, names, near, 'z', 3); assert.ok(valid); assert.equal(checkBrep(valid, { strict: true }).valid, true);
  assert.throws(() => draftAnnularWallsIfAdmitted(original, names, Math.atan((4 - 2e-8) / 16), 'z', 3), error => error.code === 'GEOMETRY' && /reach or cross each other/.test(error.message), 'joint gap below existing linear tolerance is refused');
  assert.throws(() => evaluateCadPart(doc(1e-15, 'z', 3)), error => error.code === 'GEOMETRY' && /too small to move/.test(error.message));
  assert.deepEqual(original, saved);
});

test('both-wall selection retains original tags, CW bore and negative datum without renaming', () => {
  const source = doc(); source.features[0].center = [-14, -9]; source.features[0].holes[0][0] = { kind: 'arc', start: [-10, -9], center: [-14, -9], direction: 'cw' };
  source.features[0].sideTags = { outer: ['outside'], holes: [['bore']] }; source.features.at(-1).faces = ['n1.side[outside]#1', 'n1.side[outside]#2', 'n1.side[bore]#1', 'n1.side[bore]#2'];
  const result = evaluateCadPart(source).outputs[0], report = checkBrep(result.brep, { strict: true }); assert.ok(report.valid, report.issues.join('\n'));
  close(massPropertiesOf(result).volume, reference(5, 'z', 11).volume, 'tagged joint volume', 1e-7); close(massPropertiesOf(result).centroid[0], -14, 'negative X'); close(massPropertiesOf(result).centroid[1], -9, 'negative Y');
  assert.ok(source.features.at(-1).faces.every(name => result.brep.faces.some(face => face.name === name)));
});

test('incomplete/mixed owners and invalid shared options refuse; single walls and Offset contracts stay separate', () => {
  for (const selection of [[...outerNames, innerNames[0]], [...outerNames, innerNames[0], innerNames[0]], [...outerNames, innerNames[0], 'n1.top'], ['n1.side0', ...innerNames, 'n1.bottom']]) {
    const source = doc(); source.features.at(-1).faces = selection;
    assert.throws(() => evaluateCadPart(source), error => error.code === 'CAPABILITY' && /distinct original native halves/.test(error.message));
  }
  for (const pull of ['x', '-x', 'y', '-y']) assert.throws(() => evaluateCadPart(doc(5, pull)), error => error.code === 'SELECTION' && /Both circular wall Draft needs a signed world Z/.test(error.message));
  for (const neutral of [2, 20]) assert.throws(() => evaluateCadPart(doc(5, 'z', neutral)), error => error.code === 'SELECTION' && /neutral must lie within/.test(error.message));
  for (const angle of [0, 45, -45, NaN, Infinity]) assert.throws(() => evaluateCadPart(doc(angle)), error => error.code === 'INPUT');
  const original = stock(doc());
  assert.equal(draftAnnularWallsIfAdmitted(original, outerNames, .1, 'z', 3), undefined); assert.equal(draftAnnularWallsIfAdmitted(original, innerNames, .1, 'z', 3), undefined);
  assert.equal(draftAnnularOuterWallIfAdmitted(original, names, .1, 'z', 3), undefined); assert.equal(draftAnnularBoreWallIfAdmitted(original, names, .1, 'z', 3), undefined);
  assert.equal(draftCircularWallIfAdmitted(original, names, .1, 'z', 3), undefined);
  const angle = Math.atan(1 / 16) * 180 / Math.PI;
  for (const [selection, expected] of [[outerNames, 5584 * Math.PI / 3], [innerNames, 5936 * Math.PI / 3]]) {
    const source = doc(angle, 'z', 3); source.features.at(-1).faces = selection; close(massPropertiesOf(evaluateCadPart(source).outputs[0]).volume, expected, 'incumbent single-wall fixture', 1e-7);
  }
  const cone = evaluateCadPart(doc()).outputs[0].brep;
  assert.equal(draftAnnularWallsIfAdmitted(cone, names, .1, 'z', 3), undefined);
  assert.equal(boreWallOffsetFrame(cone, innerNames[0]), undefined); assert.equal(offsetBoreWallIfAdmitted(cone, innerNames[0], 1), undefined);
  assert.equal(circularWallOffsetFrame(cone, outerNames[0]), undefined); assert.equal(offsetCircularWallIfAdmitted(cone, outerNames[0], 1), undefined);
  const eccentric = doc(); eccentric.features.pop(); eccentric.features[0].holes[0][0].center[0] += .01; eccentric.features[0].holes[0][0].start[0] += .01;
  const native = evaluateCadPart(eccentric).outputs[0].brep; assert.ok(annularCapReplacementFrame(native, 'n1.top')); assert.equal(draftAnnularWallsIfAdmitted(native, names, .1, 'z', 3), undefined);
});

const xyPlane = { origin: [-28, 16, 17], normal: [0, 0, 1], xAxis: [1, 0, 0] };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function placedDoc(plane = xyPlane, angle = 5, pull = 'z', neutral = 26) {
  const source = doc(angle, pull, neutral); source.features[0].plane = structuredClone(plane); return source;
}
function placedReference(plane, angle, pull, neutral) {
  const y = cross(plane.normal, plane.xAxis), center = plane.origin.map((value, axis) => value + 14 * plane.xAxis[axis] + 9 * y[axis]);
  const stations = [3, 19].map(z => plane.origin[2] + plane.normal[2] * z).sort((a, b) => a - b), [lo, hi] = stations;
  const k = (pull === 'z' ? 1 : -1) * Math.tan(angle * Math.PI / 180), A0 = Math.PI * (128 - 32 * k * (lo - neutral)), A1 = Math.PI * (128 - 32 * k * (hi - neutral));
  return { center, lo, hi, k, volume: 16 * (A0 + A1) / 2, centroid: [center[0], center[1], lo + 16 * (A0 + 2 * A1) / (3 * (A0 + A1))],
    area: 32 * Math.PI * Math.hypot(16, 16 * k) + A0 + A1 };
}
function exactWorldCapTrims(brep) {
  const edges = new Map(brep.edges.map(edge => [edge.id, edge]));
  const caps = brep.faces.filter(face => { const support = faceGeometry(face); return support.kind === 'plane' && Math.abs(support.n[2]) === 1; });
  assert.equal(caps.length, 2);
  for (const cap of caps) {
    assert.equal(cap.loops.length, 2);
    const support = faceGeometry(cap), up = support.n[2] === 1, poles = cap.surface.controlPoints.flat();
    const min = [Math.min(...poles.map(point => point[0])), Math.min(...poles.map(point => point[1]))], max = [Math.max(...poles.map(point => point[0])), Math.max(...poles.map(point => point[1]))];
    for (const use of brep.coedges.filter(use => cap.loops.includes(use.loop))) {
      const edge = edges.get(use.edge);
      assert.deepEqual(use.pcurve.knots, edge.curve.knots); assert.deepEqual(use.pcurve.weights, edge.curve.weights);
      edge.curve.controlPoints.forEach(([x, y], i) => {
        const u = (x - min[0]) / (max[0] - min[0]), v = (y - min[1]) / (max[1] - min[1]);
        const expected = up ? [u, v, 0] : [v, u, 0];
        assert.ok(use.pcurve.controlPoints[i].every((value, axis) => value === expected[axis]), 'fresh world-Z cap coefficients match exactly, without placement tolerance');
      });
    }
  }
}

for (const pull of ['z', '-z']) for (const angle of [5, -5]) test(`translated explicit XY joint Draft ${angle}/${pull} retains world-native charts, cap ownership and neutral`, () => {
  for (const neutral of [20, 26, 36]) {
    const source = placedDoc(xyPlane, angle, pull, neutral), before = structuredClone(source), original = stock(source), ref = placedReference(xyPlane, angle, pull, neutral);
    const originalReport = checkBrep(original, { strict: true }); assert.ok(originalReport.valid, originalReport.issues.join('\n'));
    exactWorldCapTrims(original);
    const direct = draftAnnularWallsIfAdmitted(original, names, angle * Math.PI / 180, pull, neutral); assert.ok(direct, 'unchanged producer admits the actual world-upright stock');
    const snapshot = evaluateCadPart(source), result = snapshot.outputs[0], brep = result.brep;
    assert.deepEqual(source, before); assert.deepEqual(brep, direct); assert.deepEqual(metadata(brep), metadata(original)); exactWorldCapTrims(brep);
    const report = checkBrep(brep, { strict: true, pcurveSamples: 9 }); assert.ok(report.valid, report.issues.join('\n')); assert.equal(report.topology[0].genus, 1);
    assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 6, loops: 8, coedges: 24, edges: 12, vertices: 8 });
    for (const face of brep.faces.filter(face => names.includes(face.name))) for (const u of [0, .2, .5, .8, 1]) for (const v of [0, .25, (neutral - ref.lo) / 16, .7, 1]) {
      const p = evaluateSurface(face.surface, u, v), outer = outerNames.includes(face.name);
      close(Math.hypot(p[0] - ref.center[0], p[1] - ref.center[1]), outer ? 12 - ref.k * (p[2] - neutral) : 4 + ref.k * (p[2] - neutral), 'world-native placed conical radius');
    }
    for (const mass of [massPropertiesOf(result), brepMassProperties(brep, 1)]) {
      close(mass.volume, ref.volume, 'independent translated joint volume', 1e-7); mass.centroid.forEach((value, axis) => close(value, ref.centroid[axis], 'independent world centroid', 1e-7));
    }
    close(surfaceAreaOf(result), ref.area, 'translated native area', 1e-6);
    for (const name of ['n1.bottom', 'n1.top']) {
      const beforeCap = original.faces.find(face => face.name === name), afterCap = brep.faces.find(face => face.name === name);
      close(faceGeometry(afterCap).o[2], faceGeometry(beforeCap).o[2], 'original named cap support'); assert.deepEqual(afterCap.loops, beforeCap.loops);
    }
    if (neutral === ref.lo || neutral === ref.hi) {
      const cap = original.faces.find(face => { const support = faceGeometry(face); return support.kind === 'plane' && support.o[2] === neutral; });
      assert.ok(cap); assert.deepEqual(brep.faces.find(face => face.id === cap.id), cap, 'named world neutral cap is byte exact');
      for (const use of original.coedges.filter(use => cap.loops.includes(use.loop))) assert.deepEqual(brep.coedges.find(item => item.id === use.id), use, 'both world-neutral cap trim loops');
    }
    assert.deepEqual(loadCadPart(saveCadPart(snapshot)).outputs[0].brep, brep);
    const mesh = meshOf(brep), z = 28, inner = 4 + ref.k * (z - neutral), outer = 12 - ref.k * (z - neutral);
    assert.equal(materialAt(mesh, [ref.center[0] + inner - .2, ref.center[1], z]), false); assert.equal(materialAt(mesh, [ref.center[0] + inner + .2, ref.center[1], z]), true);
    assert.equal(materialAt(mesh, [ref.center[0] + outer - .2, ref.center[1], z]), true); assert.equal(materialAt(mesh, [ref.center[0] + outer + .2, ref.center[1], z]), false);
  }
});

test('all eight unit cardinal XY bases retain joint world-Z semantics without a basis-dependent angle reversal', () => {
  for (const normalSign of [1, -1]) for (const axis of [0, 1]) for (const axisSign of [1, -1]) {
    const xAxis = [0, 0, 0]; xAxis[axis] = axisSign;
    const plane = { origin: [-28, 16, 17], normal: [0, 0, normalSign], xAxis }, neutral = 17 + normalSign * 9;
    for (const pull of ['z', '-z']) for (const angle of [5, -5]) {
      const source = placedDoc(plane, angle, pull, neutral), original = stock(source), ref = placedReference(plane, angle, pull, neutral);
      exactWorldCapTrims(original);
      const result = evaluateCadPart(source).outputs[0], mass = massPropertiesOf(result); assert.deepEqual(metadata(result.brep), metadata(original));
      close(mass.volume, ref.volume, 'signed basis volume', 1e-7); mass.centroid.forEach((value, i) => close(value, ref.centroid[i], 'signed basis centroid', 1e-7));
      exactWorldCapTrims(result.brep);
      const sourceVertices = original.vertices.map(vertex => vertex.point[2]); assert.equal(Math.min(...sourceVertices), ref.lo); assert.equal(Math.max(...sourceVertices), ref.hi);
      for (const face of result.brep.faces.filter(face => names.includes(face.name))) {
        const p = evaluateSurface(face.surface, .3, (neutral - ref.lo) / 16); close(p[2], neutral, 'world neutral belongs to both ruled native walls');
        close(Math.hypot(p[0] - ref.center[0], p[1] - ref.center[1]), outerNames.includes(face.name) ? 12 : 4, 'original radius at shared world neutral');
      }
    }
    for (const pull of ['z', '-z']) {
      const source = placedDoc(plane, 5, pull, neutral); delete source.features.at(-1).neutral;
      const fixed = placedDoc(plane, 5, pull, pull === 'z' ? placedReference(plane, 5, pull, neutral).lo : placedReference(plane, 5, pull, neutral).hi);
      assert.deepEqual(evaluateCadPart(source).outputs[0].brep, evaluateCadPart(fixed).outputs[0].brep, 'automatic neutral uses actual world end, independent of authored normal sign');
    }
  }
});

test('translated fixture exact world neutral, parameter/cold rebuild and joint collapse keep their original contracts', () => {
  const angle = Math.atan(1 / 16) * 180 / Math.PI, source = placedDoc(xyPlane, angle, 'z', 26), snapshot = evaluateCadPart(source);
  const mass = massPropertiesOf(snapshot.outputs[0]); close(mass.volume, 1984 * Math.PI, 'world N26 exact translated fixture volume', 1e-7); close(mass.centroid[2], 2572 / 93, 'world N26 exact centroid');
  close(mass.centroid[0], -14, 'actual world center X'); close(mass.centroid[1], 25, 'actual world center Y');
  const changed = placedDoc(xyPlane, -angle, '-z', 30); assert.deepEqual(reevaluate(snapshot, { document: changed }).outputs[0].brep, evaluateCadPart(changed).outputs[0].brep);
  const parameterized = placedDoc(xyPlane, angle, 'z', 26); parameterized.parameters.N = 26; parameterized.features.at(-1).neutral = { parameter: 'N' };
  const first = evaluateCadPart(parameterized), moved = reevaluate(first, { parameters: { N: 20 } }).outputs[0]; close(massPropertiesOf(moved).volume, 1792 * Math.PI, 'world-neutral parameter uses actual lower cap', 1e-7);
  assert.throws(() => evaluateCadPart(placedDoc(xyPlane, 5, 'z', 9)), error => error.code === 'SELECTION' && /neutral must lie within the original caps/.test(error.message), 'local neutral is not reinterpreted as a world coordinate');
  for (const pull of ['z', '-z']) {
    const collapsing = placedDoc(xyPlane, Math.atan(4 / 16) * 180 / Math.PI, pull, pull === 'z' ? 20 : 36);
    assert.throws(() => evaluateCadPart(collapsing), error => error.code === 'GEOMETRY' && /inner and outer walls reach or cross each other/.test(error.message));
  }
  const cone = snapshot.outputs[0].brep; assert.equal(draftAnnularWallsIfAdmitted(cone, names, .1, 'z', 26), undefined);
  assert.equal(boreWallOffsetFrame(cone, innerNames[0]), undefined); assert.equal(circularWallOffsetFrame(cone, outerNames[0]), undefined);
});

test('placed joint Draft refuses snapped, off-axis, non-XY and scaled frames and preserves legacy fixed-neutral refusals', () => {
  for (const [normal, xAxis] of [
    [[1e-13, 0, 1], [0, 1, 0]], [[0, 0, 1], [1, 1e-13, 0]], [[0, 0, -1], [.6, -.8, 0]],
    [[1, 0, 0], [0, 1, 0]], [[0, 1, 0], [1, 0, 0]], [[0, 0, 2], [1, 0, 0]], [[0, 0, 1], [2, 0, 0]],
  ]) {
    const source = placedDoc({ origin: [-28, 16, 17], normal, xAxis }), before = structuredClone(source);
    assert.throws(() => evaluateCadPart(source), error => error.code === 'CAPABILITY' && /original exact unit cardinal XY sketch frame/.test(error.message)); assert.deepEqual(source, before);
  }
  for (const selection of [outerNames, innerNames, [outerNames[0]], [innerNames[0]]]) {
    const source = placedDoc(); source.features.at(-1).faces = selection;
    assert.throws(() => evaluateCadPart(source), error => error.code === 'SELECTION' && /neutral plane z = 26 must be at or below the face/.test(error.message), 'placed singleton scope retains its incumbent fixed-neutral refusal');
  }
  for (const selection of [[...outerNames, innerNames[0], innerNames[0]], [...outerNames, innerNames[0], 'n1.top']]) {
    const source = placedDoc(); source.features.at(-1).faces = selection;
    assert.throws(() => evaluateCadPart(source), error => error.code === 'CAPABILITY' && /all four distinct/.test(error.message));
  }
  const parameterizedOrigin = placedDoc();
  parameterizedOrigin.parameters.O = -28;
  parameterizedOrigin.features[0].plane.origin[0] = { parameter: 'O' };
  assert.throws(() => evaluateCadPart(parameterizedOrigin), error => error.code === 'CAPABILITY' && /original exact unit cardinal XY sketch frame/.test(error.message));
  for (const change of [
    source => { source.parameters.H = 16; source.features[1].height = { parameter: 'H' }; },
    source => { source.parameters.R = 12; source.features[0].radius = { parameter: 'R' }; },
    source => { source.features.splice(2, 0, { id: 'm', kind: 'translate', target: 'n1', offset: [1, 0, 0] }); source.features.at(-1).target = 'm'; },
    source => { source.features.splice(2, 0, { id: 'm', kind: 'rotate', target: 'n1', axis: 'z', angle: 90 }); source.features.at(-1).target = 'm'; },
  ]) {
    const source = placedDoc(); change(source); const before = structuredClone(source);
    assert.throws(() => evaluateCadPart(source), error => error.code === 'SELECTION' && /neutral plane z = 26 must be at or below the face/.test(error.message));
    assert.deepEqual(source, before);
  }
});
