import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCadPart, reevaluate, massPropertiesOf, brepMassProperties, surfaceAreaOf, checkBrep, evaluateCurve, evaluateSurface, faceGeometry, tessellateBrep, saveCadPart, loadCadPart } from '../dist/index.js';
import { draftAnnularWallsIfAdmitted, boreWallOffsetFrame, circularWallOffsetFrame, offsetBoreWallIfAdmitted, offsetCircularWallIfAdmitted } from '../dist/features/bored-cap-offset.js';

const doc = (draft = 5, from = 3, height = 16) => ({ format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {}, features: [
  { id: 'n0', kind: 'sketch', profile: 'circle', center: [14, 9], radius: 12,
    holes: [[{ kind: 'arc', start: [18, 9], center: [14, 9], direction: 'ccw' }]] },
  { id: 'n1', kind: 'extrude', sketch: 'n0', from, height, draft },
] });
const close = (actual, expected, label, tolerance = 1e-8) => assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance, `${label}: ${actual} vs ${expected}`);
const zeroOf = source => { const zero = structuredClone(source); zero.features[1].draft = 0; return evaluateCadPart(zero).outputs[0].brep; };
function wallsOf(brep) {
  return brep.faces.flatMap(face => {
    const support = faceGeometry(face); return support.kind === 'cylinder' ? [{ name: face.name, out: support.out }] : [];
  });
}
// R(z)+r(z)=16, so the quadratic area terms cancel: A(z)=π(128−32(z−from)tanθ).
const reference = (draft, from, height) => {
  const k = Math.tan(draft * Math.PI / 180), a = 128 * Math.PI, b = Math.PI * (128 - 32 * height * k);
  return { k, volume: height * (a + b) / 2, centroid: [14, 9, from + height * (a + 2 * b) / (3 * (a + b))],
    area: 32 * Math.PI * Math.hypot(height, height * k) + a + b };
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

for (const draft of [5, -5]) for (const from of [0, 3, -7]) test(`one original annular Extrude Draft ${draft} degrees/from${from} has exact joint native shape and ownership`, () => {
  const source = doc(draft, from), before = structuredClone(source), original = zeroOf(source), walls = wallsOf(original), names = walls.map(wall => wall.name), ref = reference(draft, from, 16);
  assert.equal(walls.length, 4); assert.equal(new Set(names).size, 4); assert.ok(names.every(name => typeof name === 'string'));
  const direct = draftAnnularWallsIfAdmitted(original, names, draft * Math.PI / 180, 'z', from); assert.ok(direct);
  const snapshot = evaluateCadPart(source), result = snapshot.outputs[0], brep = result.brep;
  assert.deepEqual(source, before); assert.equal(snapshot.document.features.length, 2); assert.equal(snapshot.document.features[1].kind, 'extrude');
  assert.deepEqual(brep, direct); assert.deepEqual(metadata(brep), metadata(original));
  const report = checkBrep(brep, { strict: true, pcurveSamples: 9 }); assert.ok(report.valid, report.issues.join('\n'));
  assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 6, loops: 8, coedges: 24, edges: 12, vertices: 8 }); assert.equal(report.topology[0].genus, 1);
  assert.equal(brep.bodies[0].kind, 'solid'); assert.ok(brep.shells[0].closed && brep.coedges.every(use => use.pcurve));
  const end = from + 16;
  assert.deepEqual([...new Set(brep.vertices.map(vertex => vertex.point[2]))].sort((a, b) => a - b), [from, end]);
  for (const wall of walls) {
    const face = brep.faces.find(face => face.name === wall.name); assert.ok(face);
    for (const u of [0, .1, .3, .5, .8, 1]) for (const v of [0, .2, .5, .7, 1]) {
      const p = evaluateSurface(face.surface, u, v), radius = wall.out === 1 ? 12 - ref.k * (p[2] - from) : 4 + ref.k * (p[2] - from);
      close(Math.hypot(p[0] - 14, p[1] - 9), radius, 'first-to-last native conical support');
    }
  }
  const edges = new Map(brep.edges.map(edge => [edge.id, edge]));
  for (const [name, z, up] of [['n1.bottom', from, false], ['n1.top', end, true]]) {
    const cap = brep.faces.find(face => face.name === name), support = faceGeometry(cap); assert.equal(support.kind, 'plane'); close(support.o[2], z, 'cap keeps original stored from station'); close(support.n[2], up ? 1 : -1, 'cap outward normal'); assert.equal(cap.loops.length, 2);
    const poles = cap.surface.controlPoints.flat(), min = [Math.min(...poles.map(p => p[0])), Math.min(...poles.map(p => p[1]))], max = [Math.max(...poles.map(p => p[0])), Math.max(...poles.map(p => p[1]))];
    for (const use of brep.coedges.filter(use => cap.loops.includes(use.loop))) {
      const edge = edges.get(use.edge); assert.deepEqual(use.pcurve.weights, edge.curve.weights); assert.deepEqual(use.pcurve.knots, edge.curve.knots);
      edge.curve.controlPoints.forEach(([x, y], i) => {
        const u = (x - min[0]) / (max[0] - min[0]), v = (y - min[1]) / (max[1] - min[1]); close(use.pcurve.controlPoints[i][0], up ? u : v, 'cap UV coefficient U'); close(use.pcurve.controlPoints[i][1], up ? v : u, 'cap UV coefficient V');
      });
      if (!up) assert.deepEqual(use, original.coedges.find(item => item.id === use.id), 'unchanged original neutral cap trims');
    }
    if (!up) assert.deepEqual(cap, original.faces.find(face => face.id === cap.id), 'unchanged original neutral cap chart');
  }
  for (const use of brep.coedges) {
    const edge = edges.get(use.edge), loop = brep.loops.find(loop => loop.id === use.loop), face = brep.faces.find(face => face.id === loop.face);
    for (const t of [0, .15, .4, .75, 1]) {
      const p = evaluateCurve(edge.curve, t), uv = evaluateCurve(use.pcurve, t), q = evaluateSurface(face.surface, uv[0], uv[1]); p.forEach((value, axis) => close(q[axis], value, 'actual final native binding'));
    }
  }
  for (const mass of [massPropertiesOf(result), brepMassProperties(brep, 1)]) {
    close(mass.volume, ref.volume, 'independent linear radial section volume', 1e-7); mass.centroid.forEach((value, axis) => close(value, ref.centroid[axis], 'independent linear section centroid', 1e-7));
  }
  close(surfaceAreaOf(result), ref.area, 'independent exact conical and annular area', 1e-6);
  const mesh = meshOf(brep);
  for (const z of [from + 1, from + 8, from + 15]) {
    const inner = 4 + ref.k * (z - from), outer = 12 - ref.k * (z - from);
    assert.equal(materialAt(mesh, [14 + inner - .2, 9, z]), false); assert.equal(materialAt(mesh, [14 + inner + .2, 9, z]), true);
    assert.equal(materialAt(mesh, [14 + outer - .2, 9, z]), true); assert.equal(materialAt(mesh, [14 + outer + .2, 9, z]), false);
  }
  assert.deepEqual(loadCadPart(saveCadPart(snapshot)).outputs[0].brep, brep);
  assert.deepEqual(evaluateCadPart(structuredClone(source)).outputs[0].brep, brep);
});

test('omitted from remains zero and the original Extrude edits angle or distance without an added Draft node', () => {
  const angle = Math.atan(1 / 16) * 180 / Math.PI, source = doc(angle), snapshot = evaluateCadPart(source);
  close(massPropertiesOf(snapshot.outputs[0]).volume, 1792 * Math.PI, 'exact R12/R11 less R4/R5 volume', 1e-7); close(massPropertiesOf(snapshot.outputs[0]).centroid[2], 223 / 21, 'from3 exact centroid');
  const absentFrom = doc(angle, 0); delete absentFrom.features[1].from;
  const without = evaluateCadPart(absentFrom); assert.deepEqual(without.outputs[0].brep, evaluateCadPart(doc(angle, 0)).outputs[0].brep);
  assert.equal(Object.hasOwn(JSON.parse(saveCadPart(without)).features[1], 'from'), false);
  close(massPropertiesOf(without.outputs[0]).centroid[2], 160 / 21, 'from0 exact centroid');
  const original = structuredClone(snapshot.outputs[0].brep);
  for (const changed of [doc(-angle), doc(angle, 0, 8), doc(angle, -5, 12)]) {
    const rebuilt = reevaluate(snapshot, { document: changed }); assert.equal(rebuilt.document.features.length, 2);
    assert.deepEqual(rebuilt.outputs[0].brep, evaluateCadPart(changed).outputs[0].brep);
    close(massPropertiesOf(rebuilt.outputs[0]).volume, reference(changed.features[1].draft, changed.features[1].from, changed.features[1].height).volume, 'independent original feature edit', 1e-7);
  }
  assert.deepEqual(snapshot.outputs[0].brep, original);
});

test('actual native wall names and side tags drive the annular Extrude without a presumed hole prefix', () => {
  for (const direction of ['ccw', 'cw']) {
    const source = doc(); source.features[0].holes[0][0].direction = direction; source.features[0].sideTags = { outer: ['outside'], holes: [['bore']] };
    const original = zeroOf(source), names = wallsOf(original).map(wall => wall.name), snapshot = evaluateCadPart(source), brep = snapshot.outputs[0].brep;
    assert.ok(names.some(name => name.includes('[outside]')) && names.some(name => name.includes('[bore]'))); assert.deepEqual(metadata(brep), metadata(original));
    assert.ok(names.every(name => brep.faces.some(face => face.name === name)));
    assert.deepEqual(brep, draftAnnularWallsIfAdmitted(original, names, 5 * Math.PI / 180, 'z', 3));
    assert.deepEqual(loadCadPart(saveCadPart(snapshot)).outputs[0].brep, brep);
  }
});

test('annular Extrude Draft owns helpful angle, joint contact and axis refusals on n1', () => {
  const refuses = (source, category, detail) => {
    const before = structuredClone(source);
    assert.throws(() => evaluateCadPart(source), error => error.code === category && error.feature === 'n1' && error.message === `n1: ${detail}`); assert.deepEqual(source, before);
  };
  for (const draft of [45, -45, 50]) refuses(doc(draft), 'INPUT', 'Annular Extrude Draft must be below 45 degrees in size.');
  for (const delta of [4, 5]) refuses(doc(Math.atan(delta / 16) * 180 / Math.PI), 'GEOMETRY', 'B-rep: annular walls draft: the drafted inner and outer walls reach or cross each other');
  for (const delta of [4, 5]) refuses(doc(-Math.atan(delta / 16) * 180 / Math.PI), 'GEOMETRY', 'B-rep: annular walls draft: the draft reaches or crosses the bore axis');
  assert.throws(() => evaluateCadPart(doc(1e-15)), error => error.code === 'GEOMETRY' && error.feature === 'n1' && /too small to move/.test(error.message));
  for (const draft of [NaN, Infinity, '5', { parameter: 'D' }, 89]) assert.throws(() => evaluateCadPart(doc(draft)), error => error.code === 'INPUT' && error.feature === 'n1');
  const far = doc(-10); far.features[0].center[0] = 9987; far.features[0].holes[0][0].center[0] = 9987; far.features[0].holes[0][0].start[0] = 9991;
  assert.throws(() => evaluateCadPart(far), error => error.code === 'GEOMETRY' && error.feature === 'n1' && /modeling range/.test(error.message));
});

test('zero annular Draft is byte identical and older loop, placement, downward and binding boundaries remain', () => {
  const explicitZero = doc(0), absent = doc(0); delete absent.features[1].draft;
  assert.deepEqual(evaluateCadPart(explicitZero).outputs[0].brep, evaluateCadPart(absent).outputs[0].brep);
  for (const change of [
    source => { source.features[0].plane = { origin: [0, 0, 0], normal: [0, 0, 1], xAxis: [1, 0, 0] }; },
    source => { source.features[1].height = -16; },
    source => { source.parameters.H = 16; source.features[1].height = { parameter: 'H' }; },
    source => { source.parameters.F = 3; source.features[1].from = { parameter: 'F' }; },
    source => { source.parameters.R = 12; source.features[0].radius = { parameter: 'R' }; },
    source => { source.features[0].profile = 'loop'; source.features[0].segments = [{ kind: 'arc', start: [26, 9], center: [14, 9], direction: 'ccw' }]; delete source.features[0].radius; delete source.features[0].center; },
    source => { source.features[0].holes[0].push({ kind: 'arc', start: [10, 9], center: [14, 9], direction: 'ccw' }); },
    source => { source.features[0].holes[0][0].center[0] += .01; source.features[0].holes[0][0].start[0] += .01; },
    source => { source.features[0].holes = [10, 18].map(x => [{ kind: 'arc', start: [x + 2, 9], center: [x, 9], direction: 'ccw' }]); },
  ]) {
    const source = doc(); change(source); const before = structuredClone(source);
    assert.throws(() => evaluateCadPart(source), error => error.code === 'CAPABILITY' && /one loop \(no regions or holes\)/.test(error.message)); assert.deepEqual(source, before);
    const zero = structuredClone(source); zero.features[1].draft = 0; assert.equal(checkBrep(evaluateCadPart(zero).outputs[0].brep, { strict: true }).valid, true, 'zero path keeps its incumbent inputs');
  }
  const indexed = doc(); indexed.features[1].sketch = 'n0/0'; assert.throws(() => evaluateCadPart(indexed), error => error.code === 'REFERENCE');
  const rect = doc(50, 3, 1); rect.features[0] = { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [100, 80] };
  assert.equal(checkBrep(evaluateCadPart(rect).outputs[0].brep, { strict: true }).valid, true, 'existing nonannular Extrude keeps its wider angle range');
});

test('initial conical annular Extrude does not gain nonzero cone Offset admission', () => {
  const source = doc(), original = zeroOf(source), names = wallsOf(original), result = evaluateCadPart(source).outputs[0].brep;
  const outer = names.find(wall => wall.out === 1).name, inner = names.find(wall => wall.out === -1).name;
  assert.ok(boreWallOffsetFrame(original, inner) && circularWallOffsetFrame(original, outer));
  assert.equal(boreWallOffsetFrame(result, inner), undefined); assert.equal(offsetBoreWallIfAdmitted(result, inner, 1), undefined);
  assert.equal(circularWallOffsetFrame(result, outer), undefined); assert.equal(offsetCircularWallIfAdmitted(result, outer, 1), undefined);
});
