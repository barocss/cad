import assert from 'node:assert/strict';
import test from 'node:test';
import { brepMassProperties, checkBrep, evaluateCurve, evaluateCurveD1, faceGeometry, type Point } from '@barocss/cad';
import { commandById, type Ctx } from '../src/app/commands';
import { editFields } from '../src/app/editFields';
import { encodeStudioFile, readStudioFile } from '../src/engine/container';
import { emptyDoc, withNode, type SketchNode } from '../src/engine/doc';
import { evaluateDoc, partBreps } from '../src/engine/evaluate';
import { bodyMesh } from '../src/engine/mesh';

const triangle = {
  kind: 'sketch', profile: 'polygon', points: [[3, -7], [12, -6], [6, -2]],
  plane: { origin: [11, -17, 23], normal: [0, 0.6, 0.8], xAxis: [1, 0, 0] },
} satisfies SketchNode;
const ctx = (sketch: SketchNode = triangle): Ctx => ({
  doc: withNode(emptyDoc(), sketch), bodies: [], selection: { faces: [], edges: [], bodies: [], sketches: [0] },
});
const smooth = commandById('smooth-turn')!;
const ruled = commandById('ruled-turn')!;
const vols = new Map([[0, 840], [180, 840.4060323005599], [360, 840.1080446694306], [450, 840.0490227248927]]);
const close = (a: readonly number[], b: readonly number[], tolerance = 1e-8) =>
  assert.ok(Math.hypot(...a.map((value, i) => value - b[i])) < tolerance, JSON.stringify({ a, b }));

test('Smooth Turn makes one closed triangle-based solid with three common cubic rails', async () => {
  for (const [angle, reversed] of [[0, 0], [180, 0], [-180, 0], [360, 0], [-450, 1]]) {
    const points = reversed ? [triangle.points[0], triangle.points[2], triangle.points[1]] : triangle.points;
    const source = ctx({ ...triangle, points, outline: { points, bulges: [0, 0, 0] } });
    assert.deepEqual(smooth.available!(source), { ok: true });
    assert.equal(ruled.available!(source).ok, false);
    const doc = smooth.build!(source, { height: 40, angle });
    assert.equal(doc.nodes[0], source.doc.nodes[0]);
    const node = doc.nodes.at(-1);
    assert.ok(node?.kind === 'loft');
    const last = Math.max(6, Math.ceil(Math.abs(angle) / 30));
    assert.deepEqual([node.smooth, node.sections.length, node.from, node.guide], [true, last + 1, [0], undefined]);
    const fields = editFields(doc.nodes, doc.nodes.length - 1, doc.parameters);
    assert.deepEqual(fields.map(field => field.label), ['Total height']);
    const height = fields[0];
    assert.ok(height.kind === 'number');
    const taller = partBreps({ ...doc, nodes: height.set(doc.nodes, 50) })[0].brep;
    const [result, ...others] = partBreps(doc);
    assert.ok(result);
    assert.equal(others.length, 0);
    const { brep } = result;
    assert.equal(checkBrep(brep, { strict: true }).valid, true);
    assert.deepEqual([brep.bodies[0].kind, brep.shells[0].closed, brep.faces.length, brep.edges.length, brep.vertices.length],
      ['solid', true, 5, 9, 6]);
    assert.equal(brep.faces.filter(face => faceGeometry(face).kind === 'plane').length, 2);
    const mass = brepMassProperties(brep, 1);
    assert.ok(Math.abs(mass.volume - vols.get(Math.abs(angle))!) < 1e-7, String(mass.volume));
    close(mass.centroid, [18, -9, 42]);
    assert.equal(checkBrep(taller, { strict: true }).valid, true);
    assert.deepEqual(taller.faces.map(face => face.id), brep.faces.map(face => face.id));
    assert.deepEqual(taller.edges.map(edge => edge.id), brep.edges.map(edge => edge.id));
    assert.ok(Math.abs(brepMassProperties(taller, 1).volume - mass.volume * 1.25) < 1e-7);
    const rails = brep.edges.filter(edge => /^c[0-2]$/.test(edge.id)).map(edge => edge.curve);
    assert.equal(rails.length, 3);
    for (const rail of rails) {
      if (angle) {
        assert.equal(rail.degree, 3);
        assert.equal(rail.controlPoints.length, last + 1);
        assert.deepEqual(rail.knots, rails[0].knots);
        assert.ok(rail.knots.slice(4, -4).every((knot, i, knots) => i === 0 || knot > knots[i - 1]));
      }
      const start = evaluateCurve(rail, 0);
      const [x, y] = [start[0] - 18, (start[1] + 21) / 0.8];
      assert.ok([[-4, -2], [5, -1], [-1, 3]].some(([u, v]) => Math.hypot(u - x, v - y) < 1e-8));
      for (let i = 0; i <= last; i++) {
        const t = i / last, rad = angle * Math.PI / 180 * t;
        const u = x * Math.cos(rad) - y * Math.sin(rad);
        const v = x * Math.sin(rad) + y * Math.cos(rad);
        close(evaluateCurve(rail, t), [18 + u, -21 + 0.8 * v + 24 * t, 26 - 0.6 * v + 32 * t]);
      }
      for (let i = 0; i <= 120; i++) {
        const t = i / 120, { point: p, derivative: d } = evaluateCurveD1(rail, t);
        close([.6 * d[1] + .8 * d[2]], [40]);
        const v = .8 * (p[1] + 21) - .6 * (p[2] - 26), dv = .8 * d[1] - .6 * d[2];
        if (angle) assert.ok(Math.sign((p[0] - 18) * dv - v * d[0]) === Math.sign(angle));
      }
    }
    if (angle) {
      const refined = evaluateDoc(doc, 1, 8, true);
      assert.ok(refined.ok);
      const detail = refined.bodies[0].mesh.loftDetail;
      assert.ok(detail && 'kind' in detail && detail.kind === 'smooth-turn');
    }
    const read = await readStudioFile(encodeStudioFile(doc));
    assert.ok('doc' in read);
    const reopened = read.doc;
    assert.deepEqual(reopened, doc);
    assert.deepEqual(partBreps(reopened)[0].brep, brep);
  }
});

test('Triangle admission leaves Ruled Turn and non-triangular or invalid profiles outside the new path', () => {
  const { points } = triangle;
  for (const sketch of [
    { ...triangle, points: points.slice(0, 2) },
    { ...triangle, points: [...points, [3, 0]] },
    { ...triangle, construction: [{}] },
    { ...triangle, outline: { points, bulges: [0, 0, 1] } },
    { ...triangle, holes: [[{ kind: 'line', start: [4, -6] }]] },
    { ...triangle, regions: [[{ kind: 'line', start: [4, -6] }]] },
    { ...triangle, on: { node: 0, side: 'solid' } },
  ] satisfies SketchNode[]) assert.equal(smooth.available!(ctx(sketch)).ok, false);
  for (const sketch of [
    { ...triangle, points: [points[0], points[1], points[0]] },
    { ...triangle, points: [[0, 0], [4, 0], [2, 1e-8]] },
    { ...triangle, points: [[0, 0], [4, 0], [2, { parameter: 'unknown' }]] },
    { ...triangle, outline: { points: [[3, -7], [12, -6], [6, -3]] } },
  ] satisfies SketchNode[]) assert.throws(() => smooth.build!(ctx(sketch), { height: 40, angle: 180 }));
  for (const [height, angle] of [[0, 180], [NaN, 180], [40, Infinity], [40, 451]])
    assert.throws(() => smooth.build!(ctx(), { height, angle }));
});

/** Independent polynomial de Boor evaluation for a unit-weight rail. */
function sampleRail(poles: readonly Point[], knots: readonly number[], degree: number, t: number): Point {
  const span = t === 1 ? poles.length - 1 : knots.findIndex((knot, i) => i >= degree && knot <= t && t < knots[i + 1]);
  const values = poles.slice(span - degree, span + 1).map(point => [...point]);
  for (let r = 1; r <= degree; r++) for (let j = degree; j >= r; j--) {
    const i = span - degree + j;
    const a = (t - knots[i]) / (knots[i + degree + 1 - r] - knots[i]);
    values[j] = values[j].map((n, k) => (1 - a) * values[j - 1][k] + a * n);
  }
  return values[degree] as Point;
}

const minus = (a: readonly number[], b: readonly number[]): Point => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scalar = (a: readonly number[], b: readonly number[]) => a.reduce((sum, value, i) => sum + value * b[i], 0);
const vector = ([x, y, z]: Point, [u, v, w]: Point): Point => [y * w - z * v, z * u - x * w, x * v - y * u];

test('compact Turn packets use native side normals and retain positions, creases and selection IDs', () => {
  const doc = smooth.build!(ctx(), { height: 50, angle: -450 });
  const [{ brep }] = partBreps(doc);
  const averaged = bodyMesh(brep, 0, 24);
  const refined = evaluateDoc(doc, 2, 8, true);
  assert.ok(refined.ok);
  const mesh = refined.bodies[0].mesh, detail = mesh.loftDetail;
  assert.ok(detail && 'kind' in detail && detail.kind === 'smooth-turn');
  for (const key of ['positions', 'indices', 'faceOfVertex', 'edgeLines', 'edgeOfSegment'] as const)
    assert.deepEqual(detail[key], averaged[key]);
  assert.deepEqual(mesh.edges.map(edge => edge.nativeJoint?.edgeId), averaged.edges.map(edge => edge.nativeJoint?.edgeId));
  let worstOld = 0, worstNew = 0, worstResidual = 0, vertices = 0;
  for (const [vertex, owner] of detail.faceOfVertex.entries()) {
    const k = vertex * 3;
    const face = brep.faces.find(face => face.id === averaged.faces[owner].id);
    assert.ok(face);
    const surface = face.surface;
    assert.equal(surface.kind, 'surface');
    const newNormal = detail.normals.slice(k, k + 3), oldNormal = averaged.normals.slice(k, k + 3);
    if (surface.degreeV !== 3) {
      assert.deepEqual(newNormal, oldNormal);
      continue;
    }
    const point = [...detail.positions.slice(k, k + 3)] as Point;
    const [a, b] = surface.controlPoints, knots = surface.knotsV;
    const t = Math.max(0, Math.min(1, scalar(minus(point, a[0]), [0, .6, .8]) / 50));
    const left = sampleRail(a, knots, 3, t), right = sampleRail(b, knots, 3, t), across = minus(right, left);
    const u = scalar(minus(point, left), across) / scalar(across, across);
    const projected = left.map((value, i) => value + u * across[i]);
    const derivative = (row: readonly Point[]) => sampleRail(row.slice(1).map((next, i) =>
      minus(next, row[i]).map(value => value * 3 / (knots[i + 4] - knots[i + 1])) as Point), knots.slice(1, -1), 2, t);
    const da = derivative(a), db = derivative(b), tangent = da.map((value, i) => (1 - u) * value + u * db[i]) as Point;
    const normal = vector(across, tangent);
    const angle = (actual: Float32Array) => {
      const p = [...actual] as Point;
      return Math.atan2(Math.hypot(...vector(normal, p)), scalar(normal, p)) * 180 / Math.PI;
    };
    worstResidual = Math.max(worstResidual, Math.hypot(...minus(projected, point)));
    worstOld = Math.max(worstOld, angle(oldNormal));
    worstNew = Math.max(worstNew, angle(newNormal));
    vertices++;
  }
  assert.ok(vertices > 300 && worstResidual < 1e-8 && worstOld > 1 && worstNew < 1e-5,
    JSON.stringify({ vertices, worstResidual, worstOld, worstNew }));
  if (process.env.TURN_NORMAL_METRICS === '1') console.log(JSON.stringify({ vertices, worstResidual, worstOld, worstNew }));
});
