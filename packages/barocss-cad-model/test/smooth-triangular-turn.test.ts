import assert from 'node:assert/strict';
import test from 'node:test';
import { brepMassProperties, checkBrep, evaluateCurve, evaluateCurveD1, faceGeometry, type Point } from '@barocss/cad';
import { isCompactStepTurn } from '@barocss/cad/internal/step-turn-display';
import { commandById, type Ctx } from '../src/app/commands';
import { editFields } from '../src/app/editFields';
import { dispatchTool } from '../src/chat/tools';
import { encodeStudioFile, readStudioFile } from '../src/engine/container';
import { emptyDoc, withNode, type SketchNode } from '../src/engine/doc';
import { evaluateDoc, exportStudioStep, partBreps } from '../src/engine/evaluate';
import { bodyMesh } from '../src/engine/mesh';
import { revisionOf } from '../src/util/revision';

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
    assert.deepEqual(fields.map(field => field.label), ['Total height', 'Turn angle']);
    const angleField = fields[1];
    assert.ok(angleField.kind === 'number');
    assert.equal(angleField.get(doc.nodes), angle || 0);
    for (const value of [-30 * last - 1, NaN, Infinity, angle]) assert.deepEqual(angleField.set(doc.nodes, value), doc.nodes);
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
    if (angle !== 0) {
      const flipped = { ...doc, nodes: angleField.set(doc.nodes, -angle) };
      assert.equal(angleField.get(flipped.nodes), -angle);
      assert.equal(flipped.nodes[0], doc.nodes[0]);
      assert.equal(flipped.nodes.at(-1), node);
      const updated = partBreps(flipped)[0].brep;
      assert.equal(checkBrep(updated, { strict: true }).valid, true);
      assert.deepEqual(updated.faces.map(face => face.id), brep.faces.map(face => face.id));
      assert.deepEqual(updated.edges.map(edge => edge.id), brep.edges.map(edge => edge.id));
      const reflect = (value: Point) => {
        const [u, dy, dz] = minus(value, [18, -21, 26]);
        return { u, w: .8 * dy - .6 * dz };
      };
      const byName = new Map(updated.edges.map(edge => [edge.id, edge.curve]));
      for (const edge of brep.edges.filter(edge => /^c[0-2]$/.test(edge.id))) {
        const { u, w } = reflect(evaluateCurve(edge.curve, 0));
        for (let j = 0; j <= last; j++) {
          const t = j / last, phase = -angle * Math.PI / 180 * t;
          const x = u * Math.cos(phase) - w * Math.sin(phase), y = u * Math.sin(phase) + w * Math.cos(phase);
          close(evaluateCurve(byName.get(edge.id)!, t), [18 + x, -21 + .8 * y + 24 * t, 26 - .6 * y + 32 * t]);
        }
      }
      close(brepMassProperties(updated, 1).centroid, mass.centroid);
      assert.ok(Math.abs(brepMassProperties(updated, 1).volume - mass.volume) < 1e-7);
    }
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

test('triangle angle editing retains terminal ownership and requires an exact Agent revision', async () => {
  const doc = smooth.build!(ctx(), { height: 40, angle: -180 });
  const index = doc.nodes.length - 1;
  const withLaterSketch = withNode(doc, { kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [4, 3] });
  assert.deepEqual(editFields(withLaterSketch.nodes, index, doc.parameters).map(field => field.key), ['smoothLoftHeight']);
  const evaluated = evaluateDoc(doc, 1);
  assert.ok(evaluated.ok);
  const state = { doc, bodies: evaluated.bodies };
  const args = { action: 'edit', index, values: { smoothTurnAngle: 180 } };
  for (const [request, code] of [
    [args, 'EDIT_INPUT'],
    [{ ...args, expectedRevision: revisionOf(withLaterSketch) }, 'EDIT_STALE'],
  ] as const) {
    const refused = await dispatchTool(state, 'features', request, () => assert.fail('Rejected angle edits must not evaluate.'));
    assert.ok(refused.isError && !refused.changed, refused.content);
    assert.equal(refused.state, state);
    assert.equal(JSON.parse(refused.content).code, code);
  }
  const accepted = await dispatchTool(state, 'features', { ...args, expectedRevision: revisionOf(doc) }, async candidate => evaluateDoc(candidate, 2));
  assert.ok(accepted.changed && !accepted.isError, accepted.content);
  const got = editFields(accepted.state.doc.nodes, index, doc.parameters).find(field => field.key === 'smoothTurnAngle');
  assert.ok(got?.kind === 'number');
  assert.equal(got.get(accepted.state.doc.nodes), 180);
});

test('a compact triangular STEP Turn refines only when its side and cap geometry agrees', () => {
  for (const angle of [180, -450]) {
    const doc = smooth.build!(ctx(), { height: 50, angle });
    const step = exportStudioStep(doc, { name: 'Triangle exchange' }).text;
    const opened = withNode(emptyDoc(), { kind: 'import', name: 'Unrelated name', step });
    const [{ brep }] = partBreps(opened), before = evaluateDoc(opened, 1), after = evaluateDoc(opened, 2, 8, true);
    assert.ok(before.ok && after.ok && isCompactStepTurn(brep));
    const { loftDetail, ...canonical } = after.bodies[0].mesh;
    assert.deepEqual(canonical, before.bodies[0].mesh);
    assert.ok(loftDetail && 'kind' in loftDetail && loftDetail.kind === 'smooth-turn');
    const original = bodyMesh(brep, 0, 24);
    assert.deepEqual(loftDetail.positions, original.positions);
    assert.deepEqual(loftDetail.edgeOfSegment, original.edgeOfSegment);
    assert.notDeepEqual(loftDetail.normals, original.normals);

    const renamed = { ...brep,
      faces: brep.faces.map((face, i) => ({ ...face, name: 'wall-or-cap-' + i })).reverse(),
      edges: brep.edges.map((edge, i) => ({ ...edge, name: 'rim-or-rail-' + i })).reverse(),
    };
    assert.equal(isCompactStepTurn(renamed), true);

    const lifted = structuredClone(brep);
    const cap = lifted.faces.find(face => face.surface.kind === 'surface' && face.surface.degreeV === 1)?.surface;
    assert.ok(cap?.kind === 'surface');
    for (const row of cap.controlPoints) for (const point of row) {
      point[1] += .6e-6;
      point[2] += .8e-6;
    }
    assert.equal(isCompactStepTurn(lifted), false);

    const deformed = structuredClone(brep);
    const rail = deformed.edges.find(edge => edge.curve.degree === 3)!.curve;
    const originalPoles = JSON.stringify(rail.controlPoints);
    const [x, y, z] = rail.controlPoints[4];
    const moved: Point = [x + .01, y, z];
    for (const { surface } of deformed.faces) if (surface.kind === 'surface')
      for (const row of surface.controlPoints) if (JSON.stringify(row) === originalPoles) row[4] = moved;
    rail.controlPoints[4] = moved;
    assert.ok(checkBrep(deformed, { strict: true }).valid);
    assert.equal(isCompactStepTurn(deformed), false);
  }
});

const screwAxis: Point = [21, -19.4, 24.8];
const screwCorners: [number, number][] = [[-7, -4], [2, -3], [-4, 1]];

function screwSections(angle: number, points = screwCorners, reverse = false) {
  const last = Math.max(6, Math.ceil(Math.abs(angle) / 30));
  let doc = emptyDoc();
  const ordered = reverse ? [points[0], points[2], points[1]] : points;
  for (let i = 0; i <= last; i++) {
    const t = i / last, phase = angle * (Math.PI / 180) * t;
    const c = Math.cos(phase), s = Math.sin(phase);
    doc = withNode(doc, {
      kind: 'sketch', profile: 'polygon',
      points: ordered.map(([u, v]) => [u * c - v * s, u * s + v * c]),
      plane: { ...triangle.plane, origin: [screwAxis[0], screwAxis[1] + 24 * t, screwAxis[2] + 32 * t] },
    });
  }
  const loft = commandById('loft')!;
  return {
    doc: loft.build!({
      doc, bodies: [], selection: {
        faces: [], edges: [], bodies: [], sketches: Array.from({ length: last + 1 }, (_, index) => index),
      },
    }, { smooth: 'yes' }),
    last,
  };
}

test('External-axis triangular Screw uses one compact signed solid on tilted section planes', async () => {
  for (const angle of [180, -180, 360, -360, 450, -450]) {
    const { doc, last } = screwSections(angle, screwCorners, angle < 0);
    const [output, ...others] = partBreps(doc);
    assert.equal(others.length, 0);
    const { brep } = output;
    const checked = checkBrep(brep, { strict: true });
    assert.ok(checked.valid, JSON.stringify(checked.issues));
    assert.deepEqual(checked.counts, { bodies: 1, shells: 1, faces: 5, loops: 5, coedges: 18, edges: 9, vertices: 6 });
    assert.ok(brep.bodies[0].kind === 'solid' && brep.shells[0].closed);
    const caps = brep.faces.flatMap(face => {
      const geometry = faceGeometry(face);
      return geometry.kind === 'plane' ? [geometry.n] : [];
    });
    assert.equal(caps.length, 2);
    for (const sign of [-1, 1])
      assert.ok(caps.some(normal => Math.hypot(normal[0], normal[1] - .6 * sign, normal[2] - .8 * sign) < 1e-9));

    const rails = brep.edges.filter(edge => /^c[0-2]$/.test(edge.id)).map(edge => edge.curve);
    assert.equal(rails.length, 3);
    const seen = new Set<number>();
    for (const rail of rails) {
      assert.deepEqual([rail.degree, rail.controlPoints.length, rail.knots], [3, last + 1, rails[0].knots]);
      const start = evaluateCurve(rail, 0), x = start[0] - screwAxis[0];
      const v = .8 * (start[1] - screwAxis[1]) - .6 * (start[2] - screwAxis[2]);
      const corner = screwCorners.findIndex(([u0, v0]) => Math.hypot(x - u0, v - v0) < 1e-8);
      assert.ok(corner >= 0 && !seen.has(corner));
      seen.add(corner);
      for (let i = 0; i <= last; i++) {
        const t = i / last, phase = angle * Math.PI / 180 * t;
        const [u0, v0] = screwCorners[corner], cx = Math.cos(phase) * u0 - Math.sin(phase) * v0;
        const cy = Math.sin(phase) * u0 + Math.cos(phase) * v0;
        close(evaluateCurve(rail, t), [screwAxis[0] + cx, screwAxis[1] + .8 * cy + 24 * t, screwAxis[2] - .6 * cy + 32 * t]);
      }
      for (let i = 0; i <= 240; i++) {
        const { point, derivative } = evaluateCurveD1(rail, i / 240);
        const a = point[0] - screwAxis[0], b = .8 * (point[1] - screwAxis[1]) - .6 * (point[2] - screwAxis[2]);
        close([.6 * derivative[1] + .8 * derivative[2]], [40]);
        assert.ok(Math.sign(angle) * (a * (.8 * derivative[1] - .6 * derivative[2]) - b * derivative[0]) > 0);
      }
    }
    assert.ok(Math.abs(brepMassProperties(brep, 1).volume - vols.get(Math.abs(angle))!) < 1e-7);
    const reopened = await readStudioFile(encodeStudioFile(doc));
    assert.ok('doc' in reopened);
    assert.deepEqual(reopened.doc, doc);
    assert.deepEqual(partBreps(reopened.doc)[0].brep, brep);
  }
});

test('External triangle Screw admission uses the actual triangle and its vertex clearance', () => {
  const corners = [[0, 0], [12, 0], [0, 6]];
  const fromPivot = ([x, y]: readonly number[]): [number, number][] => corners.map(([u, v]) => [u - x, v - y]);
  const diagonalOutside = screwSections(360, fromPivot([-8e-8, -8e-8])).doc;
  const [{ brep }] = partBreps(diagonalOutside);
  assert.ok(checkBrep(brep, { strict: true }).valid);
  assert.ok(brep.edges.filter(edge => edge.curve.degree === 3).every(edge => edge.curve.controlPoints.length === 13));

  for (const pivot of [[-6.5e-8, -6.5e-8], [0, 0], [6, 0], [1, 1]]) {
    const { doc } = screwSections(360, fromPivot(pivot));
    const result = evaluateDoc(doc, 1);
    assert.ok(!result.ok, JSON.stringify(pivot));
    assert.match(result.error.detail, /Surface V control point count/);
  }
});
