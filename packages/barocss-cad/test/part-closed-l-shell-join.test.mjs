import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { evaluateCadPart, massPropertiesOf, checkBrep, evaluateSurface, tessellateBrep, saveCadPart, loadCadPart } from '../dist/index.js';
import { closedLShellWallLimit } from '../dist/features/closed-l-shell-profile.js';
import { faceGeometry } from '../dist/brep/analytic-boolean.js';

const P = [[0, 0], [40, 0], [40, 10], [10, 10], [10, 30], [0, 30]];
const documentOf = (features) => ({ format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {}, features });
const stock = points => [{ id: 's', kind: 'sketch', profile: 'polygon', points }, { id: 'e', kind: 'extrude', sketch: 's', height: 20 }];
const doc = (join, thickness = 2, points = P) => documentOf([...stock(points), { id: 'sh', kind: 'shell', target: 'e', thickness, ...(join === undefined ? {} : { join }) }]);
const expectedVolume = (t, join) => {
  const sharpArea = (40 - 2 * t) * (10 - 2 * t) + (10 - 2 * t) * (30 - 2 * t) - (10 - 2 * t) ** 2;
  return 12000 - (sharpArea + (join === 'arc' ? t * t * (1 - Math.PI / 4) : 0)) * (20 - 2 * t);
};
const close = (a, b, label, tolerance = 1e-8) => assert.ok(Number.isFinite(a) && Math.abs(a - b) <= tolerance, `${label}: ${a} vs ${b}`);
const hash = brep => createHash('sha256').update(JSON.stringify(brep)).digest('hex');
function strict(brep, join) {
  const report = checkBrep(brep, { strict: true }); assert.ok(report.valid, report.issues.join('\n'));
  assert.deepEqual(report.counts, join === 'arc'
    ? { bodies: 1, shells: 2, faces: 17, loops: 17, coedges: 78, edges: 39, vertices: 26 }
    : { bodies: 1, shells: 2, faces: 16, loops: 16, coedges: 72, edges: 36, vertices: 24 });
  assert.equal(report.topology[0].genus, 0);
}
function meshOf(brep) {
  const mesh = tessellateBrep(brep, { segmentsPerQuarter: 32 }), P = mesh.positions, I = mesh.indices, edges = new Map();
  const key = i => `${P[3 * i]},${P[3 * i + 1]},${P[3 * i + 2]}`;
  for (let i = 0; i < I.length; i += 3) for (let k = 0; k < 3; k++) {
    const e = `${key(I[i + k])}>${key(I[i + (k + 1) % 3])}`; edges.set(e, (edges.get(e) ?? 0) + 1);
  }
  for (const [e, count] of edges) { const [a, b] = e.split('>'); assert.equal(edges.get(`${b}>${a}`), count, e); }
  return mesh;
}
/** Independent vertical parity ray through the native tessellation; merge equal-height hits at shared triangle edges. */
function materialAt(mesh, point) {
  const P = mesh.positions, I = mesh.indices, hits = [];
  for (let i = 0; i < I.length; i += 3) {
    const a = [...P.slice(3 * I[i], 3 * I[i] + 3)], b = [...P.slice(3 * I[i + 1], 3 * I[i + 1] + 3)], c = [...P.slice(3 * I[i + 2], 3 * I[i + 2] + 3)];
    const ux = b[0] - a[0], uy = b[1] - a[1], vx = c[0] - a[0], vy = c[1] - a[1], det = ux * vy - uy * vx;
    if (Math.abs(det) < 1e-12) continue;
    const x = point[0] - a[0], y = point[1] - a[1], u = (x * vy - y * vx) / det, v = (ux * y - uy * x) / det;
    if (u < -1e-10 || v < -1e-10 || u + v > 1 + 1e-10) continue;
    const z = a[2] + u * (b[2] - a[2]) + v * (c[2] - a[2]);
    if (z > point[2] + 1e-9 && !hits.some(h => Math.abs(h - z) < 1e-8)) hits.push(z);
  }
  return hits.length % 2 === 1;
}

test('shared closed-L proof accepts both loop directions and reflected bounds, with no near-axis snapping', () => {
  for (const sx of [1, -1]) for (const sy of [1, -1]) for (let k = 0; k < 6; k++) for (const reverse of [false, true]) {
    let points = P.map(([x, y]) => [17 + sx * x, -11 + sy * y]); points = points.slice(k).concat(points.slice(0, k));
    assert.equal(closedLShellWallLimit(reverse ? points.toReversed() : points, 20), 5);
  }
  assert.equal(closedLShellWallLimit(P, 6), 3);
  const near = structuredClone(P); near[2][0] += 1e-10;
  for (const points of [near, P.slice(0, 5), [P[0], P[2], P[1], ...P.slice(3)], [[0, 0], [40, 0], [40, 30], [0, 30]]])
    assert.equal(closedLShellWallLimit(points, 20), undefined);
  for (const h of [0, -1, NaN, Infinity]) assert.equal(closedLShellWallLimit(P, h), undefined);
});

for (const join of ['sharp', 'arc']) for (const reversed of [false, true]) test(`explicit closed L ${join}, ${reversed ? 'CW' : 'CCW'}, has independent native volume and geometry`, () => {
  const source = doc(join, 2, reversed ? P.toReversed() : P), snapshot = evaluateCadPart(source), output = snapshot.outputs.at(-1), brep = output.brep;
  strict(brep, join); close(massPropertiesOf(output).volume, expectedVolume(2, join), 'independent L volume');
  const original = evaluateCadPart(documentOf(source.features.slice(0, 2))).outputs[0].brep;
  assert.ok(original.faces.every(face => brep.faces.some(f => f.name === face.name)), 'all eight original outer face names remain');
  const cylinders = brep.faces.filter(face => faceGeometry(face).kind === 'cylinder'); assert.equal(cylinders.length, join === 'arc' ? 1 : 0);
  if (join === 'arc') {
    const surface = cylinders[0].surface;
    assert.equal(surface.degreeU, 2); assert.equal(surface.degreeV, 1);
    for (const u of [0, .1, .3, .5, .8, 1]) for (const v of [0, .2, .7, 1]) {
      const p = evaluateSurface(surface, u, v); close((p[0] - 10) ** 2 + (p[1] - 10) ** 2, 4, 'exact radius-two cylindrical chart');
      assert.ok(p[0] <= 10 + 1e-9 && p[1] <= 10 + 1e-9 && p[2] >= 2 - 1e-9 && p[2] <= 18 + 1e-9);
    }
  }
  const mesh = meshOf(brep);
  assert.equal(materialAt(mesh, [8.4, 8.4, 10]), join === 'sharp', 'Sharp square versus Round quarter-disc witness');
  assert.equal(materialAt(mesh, [8.8, 8.8, 10]), true); assert.equal(materialAt(mesh, [7.5, 7.5, 10]), false);
  if (!reversed) {
    const text = saveCadPart(snapshot); assert.equal(JSON.parse(text).features.at(-1).join, join);
    assert.deepEqual(loadCadPart(text).outputs.at(-1).brep, brep);
    assert.deepEqual(evaluateCadPart(structuredClone(source)).outputs.at(-1).brep, brep, 'cold rebuild retains every native record and name');
  }
});

test('explicit choice supports a numeric all-line loop with side tags and a changed wall, without changing the source footprint', () => {
  const source = doc('arc', 3), tags = ['a', 'b', 'c', 'd', 'e', 'f'];
  source.features[0] = { id: 's', kind: 'sketch', profile: 'loop', segments: P.map(start => ({ kind: 'line', start })), sideTags: { outer: tags } };
  source.features[1].from = 3;
  const snapshot = evaluateCadPart(source), output = snapshot.outputs.at(-1); strict(output.brep, 'arc');
  close(massPropertiesOf(output).volume, expectedVolume(3, 'arc'), 'edited thickness');
  assert.ok(tags.every(tag => output.brep.faces.some(f => f.name === `e.side[${tag}]`)));
  assert.deepEqual(source.features[0].segments.map(s => s.start), P);
  assert.deepEqual(loadCadPart(saveCadPart(snapshot)).outputs.at(-1).brep, output.brep);
});

test('explicit L choice refuses unsupported source, placement, opening, join and wall collapse with typed errors', () => {
  const capability = source => assert.throws(() => evaluateCadPart(source), e => e.code === 'CAPABILITY' && /original.*L extrusion/.test(e.message));
  const placed = doc('arc'); placed.features[0].plane = { origin: [0, 0, 0], normal: [0, 0, 1], xAxis: [1, 0, 0] }; capability(placed);
  const opened = doc('arc'); opened.features.at(-1).open = ['e.top']; capability(opened);
  const negative = doc('arc'); negative.features[1].height = -20; capability(negative);
  const drafted = doc('arc'); drafted.features[1].draft = 1; capability(drafted);
  const rectangle = doc('arc'); rectangle.features[0] = { id: 's', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [40, 30] }; capability(rectangle);
  const moved = doc('arc'); moved.features.splice(2, 0, { id: 'm', kind: 'translate', target: 'e', offset: [1, 2, 3] }); moved.features.at(-1).target = 'm'; capability(moved);
  const holed = doc('arc'); holed.features[0].holes = [[{ kind: 'line', start: [2, 2] }, { kind: 'line', start: [4, 2] }, { kind: 'line', start: [4, 4] }, { kind: 'line', start: [2, 4] }]]; capability(holed);
  const parameterPoints = doc('arc'); parameterPoints.parameters.x = 40; parameterPoints.features[0].points = structuredClone(P); parameterPoints.features[0].points[1][0] = { parameter: 'x' }; capability(parameterPoints);
  for (const thickness of [5, 6]) assert.throws(() => evaluateCadPart(doc('arc', thickness)), e => e.code === 'PARAMETER' && /less than 5 mm/.test(e.message));
  for (const join of ['round', null, 1]) assert.throws(() => evaluateCadPart(doc(join)), e => e.code === 'INPUT' && /join must be sharp or arc/.test(e.message));
  const invalidOpen = doc('arc'); invalidOpen.features.at(-1).open = 'e.top'; assert.throws(() => evaluateCadPart(invalidOpen), e => e.code === 'INPUT');
});

test('absent join preserves both incumbent native archives and does not serialize a new field', () => {
  const direct = doc(undefined), general = doc(undefined);
  general.features.splice(2, 0, { id: 'b', kind: 'sketch', profile: 'rectangle', min: [2, 2], max: [5, 5], plane: { origin: [0, 0, 0], normal: [1, 0, 0], xAxis: [0, 1, 0] } },
    { id: 'be', kind: 'extrude', sketch: 'b', height: 3 }, { id: 'bm', kind: 'translate', target: 'be', offset: [3, 0, 0] }, { id: 'u', kind: 'union', target: 'e', tool: 'bm' });
  general.features.at(-1).target = 'u';
  for (const [source, expected, volume] of [[direct, '9cc2472669ce5fe0b86ab453a7640d3ae08b5d41437426e0282dfd86dd49d0e5', expectedVolume(2, 'arc')],
    [general, 'c0868fe18868ba0080a1800ed01aa93fb78b843e87e55c4708860d452e11a680', expectedVolume(2, 'sharp')]]) {
    const snapshot = evaluateCadPart(source), output = snapshot.outputs.at(-1); assert.equal(hash(output.brep), expected); close(massPropertiesOf(output).volume, volume, 'incumbent volume');
    const text = saveCadPart(snapshot); assert.equal(Object.hasOwn(JSON.parse(text).features.at(-1), 'join'), false);
    assert.deepEqual(loadCadPart(text).outputs.at(-1).brep, output.brep);
  }
});
