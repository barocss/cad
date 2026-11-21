import assert from 'node:assert/strict';
import test from 'node:test';
import { brepMassProperties, checkBrep, evaluateCurve, evaluateCurveD1, faceGeometry, type Brep, type BrepFace, type Point } from '@barocss/cad';
import { compactStepTurnKind, isCompactStepTurn } from '@barocss/cad/internal/step-turn-display';
import { commandById, type Ctx } from '../src/app/commands';
import { editFields } from '../src/app/editFields';
import { smoothLoftTurnWidthField, smoothScrewAngleField, smoothScrewPitchField } from '../src/app/smoothLoftTurn';
import { dispatchTool } from '../src/chat/tools';
import { encodeStudioFile, readStudioFile } from '../src/engine/container';
import { emptyDoc, withNode, type SketchNode, type StudioDoc } from '../src/engine/doc';
import { evaluateDoc, exportStudioStep, partBreps } from '../src/engine/evaluate';
import { smoothTurnDisplayMesh } from '../src/engine/loftDisplay';
import { bodyMesh, type DisplayMesh } from '../src/engine/mesh';
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

test('compact Turn and Screw display walls share closed seams and native normals', () => {
  for (const [doc, height] of [
    [smooth.build!(ctx(), { height: 50, angle: -450 }), 50],
    [screwSections(180).doc, 40],
    [screwSections(-360, screwCorners, true).doc, 40],
    [screwSections(450).doc, 40],
    [screwSections(-360, screwPentagon, true).doc, 40],
    [screwSections(360, screwHexagon).doc, 40],
    [screwSections(-360, regularScrewCorners(7), true).doc, 40],
    [screwSections(360, regularScrewCorners(64)).doc, 40],
    [screwSections(-360, regularScrewCorners(64), true).doc, 40],
  ] as const) {
    const [{ brep }] = partBreps(doc);
    const plain = evaluateDoc(doc, 2, 8);
    const refined = evaluateDoc(doc, 2, 8, true);
    assert.ok(plain.ok && refined.ok);
    const { loftDetail: detail, ...mesh } = refined.bodies[0].mesh;
    assert.ok(detail && 'kind' in detail && detail.kind === 'smooth-turn');
    assert.equal(detail.screwGrid, undefined);
    assert.deepEqual(mesh, plain.bodies[0].mesh);
    assert.deepEqual(new Set(detail.edgeOfSegment), new Set(mesh.edgeOfSegment));

    const directed = new Map<string, number>();
    const point = (vertex: number): Point => [
      detail.positions[3 * vertex], detail.positions[3 * vertex + 1], detail.positions[3 * vertex + 2],
    ];
    for (let i = 0; i < detail.indices.length; i += 3) {
      const a: Point = point(detail.indices[i]);
      const b: Point = point(detail.indices[i + 1]);
      const c: Point = point(detail.indices[i + 2]);
      assert.ok(Math.hypot(...vector(minus(b, a), minus(c, a))) > 0);
      for (const key of [a + '/' + b, b + '/' + c, c + '/' + a]) {
        directed.set(key, (directed.get(key) ?? 0) + 1);
      }
    }
    assert.ok(directed.size > 0);
    for (const [edge, count] of directed) {
      const [a, b] = edge.split('/');
      assert.equal(count, 1);
      assert.equal(directed.get(b + '/' + a), 1);
    }

    let worstNormal = 0, worstResidual = 0, vertices = 0;
    for (const [vertex, owner] of detail.faceOfVertex.entries()) {
      const face: BrepFace | undefined = brep.faces.find(face => face.id === mesh.faces[owner].id);
      assert.ok(face);
      const surface = face.surface;
      assert.equal(surface.kind, 'surface');
      const actual = [...detail.normals.slice(3 * vertex, 3 * vertex + 3)] as Point;
      if (surface.degreeV !== 3) {
        const cap = faceGeometry(face);
        assert.equal(cap.kind, 'plane');
        close(actual, cap.n, 1e-7);
        continue;
      }
      const p = point(vertex);
      const [a, b] = surface.controlPoints, knots = surface.knotsV;
      const t = Math.max(0, Math.min(1, scalar(minus(p, a[0]), [0, .6, .8]) / height));
      const left = sampleRail(a, knots, 3, t), right = sampleRail(b, knots, 3, t), across = minus(right, left);
      const u = scalar(minus(p, left), across) / scalar(across, across);
      const projected = left.map((value, i) => value + u * across[i]);
      const derivative = (row: readonly Point[]) => sampleRail(row.slice(1).map((next, i) =>
        minus(next, row[i]).map(value => value * 3 / (knots[i + 4] - knots[i + 1])) as Point), knots.slice(1, -1), 2, t);
      const da = derivative(a), db = derivative(b), tangent = da.map((value, i) => (1 - u) * value + u * db[i]) as Point;
      const sense = face.sense === 'forward' ? 1 : -1;
      const normal = vector(across, tangent).map(value => value * sense) as Point;
      const angle = Math.atan2(Math.hypot(...vector(normal, actual)), scalar(normal, actual)) * 180 / Math.PI;
      worstResidual = Math.max(worstResidual, Math.hypot(...minus(projected, p)));
      worstNormal = Math.max(worstNormal, angle);
      vertices++;
    }
    assert.ok(vertices > 800 && worstResidual < 1e-8 && worstNormal < 1e-5,
      JSON.stringify({ vertices, worstResidual, worstNormal }));
  }
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
    assert.equal(compactStepTurnKind(renamed), 'turn');

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
const screwPentagon: [number, number][] = [[-7, -4], [2, -3], [1, -1], [-4, 1], [-6, -1]];
const screwHexagon: [number, number][] = [[-7, -5], [1, -5], [3, -3], [2, -1], [-3, 1], [-7, -1]];
function regularScrewCorners(sides: number): [number, number][] {
  return Array.from({ length: sides }, (_, i) => {
    const phase = 2 * Math.PI * i / sides;
    return [10 + 3 * Math.cos(phase), 3 * Math.sin(phase)];
  });
}

function screwSections(angle: number, points = screwCorners, reverse = false) {
  const last = Math.max(6, Math.ceil(Math.abs(angle) / 30));
  let doc = emptyDoc();
  const ordered = reverse ? [points[0], ...points.slice(1).reverse()] : points;
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

test('Straight convex polygon Screw preserves each authored rail through a full signed revolution', () => {
  const fixtures: { points: [number, number][]; angles: number[]; volume?: number }[] = [
    { points: screwPentagon, angles: [360, -360], volume: 1080.138914574982 },
    { points: screwHexagon, angles: [360, -360], volume: 1840.2366692758953 },
    // Nearest-corner alignment can alias a 30° section interval in these regular profiles.
    { points: regularScrewCorners(7), angles: [360, -360] },
    { points: regularScrewCorners(64), angles: [360] },
  ];
  for (const { points, angles, volume } of fixtures) for (const angle of angles) {
    const { doc, last } = screwSections(angle, points, angle < 0);
    const [{ brep }, ...others] = partBreps(doc);
    const n = points.length;
    assert.equal(others.length, 0);
    const rails = brep.edges.filter(edge => /^c[0-9]+$/.test(edge.id)).map(edge => edge.curve);
    assert.equal(rails.length, n);
    for (const rail of rails) assert.deepEqual([rail.degree, rail.controlPoints.length], [3, last + 1], `${n} sides at ${angle}°`);
    const { valid, counts } = checkBrep(brep, { strict: true });
    assert.deepEqual([valid, counts.bodies, counts.faces, counts.edges, counts.vertices, brep.coedges.length],
      [true, 1, n + 2, 3 * n, 2 * n, 6 * n]);
    assert.equal(brep.shells.length, 1);
    assert.ok(brep.shells[0].closed);
    if (volume !== undefined) close([brepMassProperties(brep, 1).volume], [volume], 1e-7);
    const local = (p: Point): [number, number] => [
      p[0] - screwAxis[0], .8 * (p[1] - screwAxis[1]) - .6 * (p[2] - screwAxis[2]),
    ];
    const matched = new Set<number>();
    for (const rail of rails) {
      let prior = local(evaluateCurve(rail, 0)), winding = 0;
      const corner = points.findIndex(([u, v]) => Math.hypot(u - prior[0], v - prior[1]) < 1e-8);
      assert.ok(corner >= 0 && !matched.has(corner));
      matched.add(corner);
      for (let i = 1; i <= last * 10; i++) {
        const t = i / (last * 10);
        const { point, derivative } = evaluateCurveD1(rail, t);
        const [u, v] = local(point);
        const increment = Math.atan2(prior[0] * v - prior[1] * u, prior[0] * u + prior[1] * v);
        assert.ok(Math.sign(angle) * increment > 0);
        winding += increment;
        prior = [u, v];
        close([.6 * derivative[1] + .8 * derivative[2]], [40]);
        if (i % 10 === 0) {
          const phase = angle * (Math.PI / 180) * t;
          const [x, y] = points[corner];
          close([u, v], [x * Math.cos(phase) - y * Math.sin(phase), x * Math.sin(phase) + y * Math.cos(phase)]);
        }
      }
      close([winding], [angle * (Math.PI / 180)]);
    }
  }
});

test('Polygon Screw refuses concave sections and axes inside or on the boundary', () => {
  const outlines: [number, number][][] = [
    [[-7, -5], [1, -5], [-4, -3], [-3, 1], [-7, -1]],
    [[-4, -2], [4, -2], [3, 2], [0, 4], [-3, 2]],
    [[-4, 0], [4, 0], [3, 3], [0, 5], [-3, 3]],
    [[0, 0], [4, 1], [5, 3], [2, 5], [0, 3]],
  ];
  for (const points of outlines) {
    const { doc } = screwSections(360, points);
    const evaluated = evaluateDoc(doc, 1);
    assert.ok(!evaluated.ok, JSON.stringify(points));
    assert.match(evaluated.error.detail, /Surface V control point count/);
  }
});

test('One convex polygon sketch makes a Smooth Screw with editable signed angle and pitch', () => {
  const command = commandById('smooth-screw')!;
  for (const [points, volume] of [[screwPentagon, 1080.138914574982], [screwHexagon, 1840.2366692758953]] as const) {
    const sketch: SketchNode = { ...triangle, points: points.map(([u, v]) => [u + 10, v - 3]) };
    const source = ctx(sketch);
    assert.ok(command.available(source).ok);
    assert.ok(!smooth.available(source).ok);
    const values = { axisX: 10, axisY: -3, pitch: 40, angle: -360 };
    const [boundaryX, boundaryY] = points[0];
    assert.throws(() => command.build!(source, { ...values, axisX: 7, axisY: -5 }), /outside it with clearance/);
    assert.throws(() => command.build!(source, { ...values, axisX: boundaryX + 10, axisY: boundaryY - 3 }), /outside it with clearance/);
    const doc = command.build!(source, values);
    const index = doc.nodes.length - 1;
    assert.deepEqual(doc.nodes[0], source.doc.nodes[0]);
    const [{ brep }] = partBreps(doc);
    assert.ok(checkBrep(brep, { strict: true }).valid);
    close([brepMassProperties(brep, 1).volume], [volume], 1e-7);
    const winding = smoothScrewAngleField(doc.nodes, index), pitch = smoothScrewPitchField(doc.nodes, index);
    assert.ok(winding?.kind === 'number' && pitch?.kind === 'number');
    assert.deepEqual([winding.get(doc.nodes), pitch.get(doc.nodes)], [-360, 40]);
    assert.equal(smoothLoftTurnWidthField(doc.nodes, index), undefined);
    const reversed: StudioDoc = { ...doc, nodes: winding.set(doc.nodes, 360) };
    assert.deepEqual(reversed, command.build!(source, { ...values, angle: 360 }));
    assert.deepEqual(winding.set(reversed.nodes, 0), reversed.nodes);
    const longer: StudioDoc = { ...reversed, nodes: pitch.set(reversed.nodes, 48) };
    assert.deepEqual(longer, command.build!(source, { ...values, angle: 360, pitch: 48 }));
  }
  const concave: SketchNode = { ...triangle, points: [[-7, -5], [1, -5], [-4, -3], [-3, 1], [-7, -1]] };
  assert.throws(() => command.build!(ctx(concave), { axisX: 10, axisY: -3, pitch: 40, angle: 360 }), /strictly convex polygon/);
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


test('one tilted triangular sketch authors both external-axis Screw windings and retains its History', async () => {
  const command = commandById('smooth-screw')!;
  for (const angle of [360, -360, 450, -450]) {
    const sketch = angle > 0 ? triangle : { ...triangle, points: [triangle.points[0], triangle.points[2], triangle.points[1]] };
    const source = ctx(sketch);
    const input = { axisX: 10, axisY: -3, pitch: 40, angle };
    assert.deepEqual(command.available(source), { ok: true });
    const doc: StudioDoc = command.build!(source, input);
    const index = doc.nodes.length - 1, loft = doc.nodes[index];
    assert.ok(loft.kind === 'loft' && loft.smooth);
    assert.deepEqual(loft.from, [0]);
    assert.equal(doc.nodes[0], source.doc.nodes[0]);
    assert.equal(loft.sections.length, Math.abs(angle) / 30 + 1);
    assert.equal(loft.sections.at(-1)?.z, 40 * Math.abs(angle) / 360);
    const copied = doc.nodes[loft.sections[0].sketch];
    assert.ok(copied.kind === 'sketch' && copied.profile === 'loop' && copied.plane);
    close(copied.plane.origin, screwAxis);
    const [{ brep }] = partBreps(doc);
    const checked = checkBrep(brep, { strict: true });
    assert.ok(checked.valid && brep.shells[0].closed);
    assert.deepEqual(checked.counts, { bodies: 1, shells: 1, faces: 5, loops: 5, coedges: 18, edges: 9, vertices: 6 });
    assert.ok(Math.abs(brepMassProperties(brep, 1).volume - vols.get(Math.abs(angle))! * Math.abs(angle) / 360) < 1e-7);
    assert.equal(smoothLoftTurnWidthField(doc.nodes, index), undefined);

    const pitch = smoothScrewPitchField(doc.nodes, index), winding = smoothScrewAngleField(doc.nodes, index);
    assert.ok(pitch?.kind === 'number' && winding?.kind === 'number');
    assert.equal(pitch.get(doc.nodes), 40);
    assert.equal(winding.get(doc.nodes), angle);
    const changed: StudioDoc = { ...doc, nodes: pitch.set(winding.set(doc.nodes, -angle), 48) };
    assert.equal(winding.get(changed.nodes), -angle);
    assert.equal(pitch.get(changed.nodes), 48);
    const [output] = partBreps(changed);
    assert.deepEqual(output.brep.edges.map(edge => edge.id), brep.edges.map(edge => edge.id));
    assert.ok(Math.abs(brepMassProperties(output.brep, 1).volume - vols.get(Math.abs(angle))! * Math.abs(angle) / 360 * 1.2) < 1e-7);
    const reopened = await readStudioFile(encodeStudioFile(changed));
    assert.ok('doc' in reopened);
    assert.deepEqual(reopened.doc, changed);
    assert.deepEqual(partBreps(reopened.doc)[0].brep, output.brep);
  }
});

test('triangular Screw refuses touching axes and shares exterior admission with the Agent command', async () => {
  const command = commandById('smooth-screw')!;
  const source = ctx();
  const values = { axisX: 10, axisY: -3, pitch: 40, angle: -360 };
  for (const [axisX, axisY] of [[7, -5], [9, -4], [6, -2]]) {
    assert.throws(() => command.build!(source, { ...values, axisX, axisY }), /outside the triangle/);
  }
  const near = ctx({ ...triangle, points: [[0, 0], [12, 0], [0, 6]] });
  assert.throws(() => command.build!(near, { ...values, axisX: -6.5e-8, axisY: -6.5e-8 }), /outside the triangle/);
  const admitted = command.build!(near, { ...values, axisX: -8e-8, axisY: -8e-8 });
  assert.ok(checkBrep(partBreps(admitted)[0].brep, { strict: true }).valid);

  const state = { doc: source.doc, bodies: [] };
  const args = { action: 'command', command: 'smooth-screw', values: { ...values, sketch: source.doc.nodes[0].id } };
  const stale = await dispatchTool(state, 'features', { ...args, expectedRevision: '0'.repeat(16) },
    () => assert.fail('A stale command must not evaluate.'));
  assert.ok(stale.isError && !stale.changed, stale.content);
  assert.equal(stale.state, state);
  const accepted = await dispatchTool(state, 'features', { ...args, expectedRevision: revisionOf(source.doc) },
    async doc => evaluateDoc(doc, 1));
  assert.ok(accepted.changed && !accepted.isError, accepted.content);
  assert.deepEqual(accepted.state.doc, command.build!(source, values));
});


function moveRailColumns(brep: Brep, offsets: readonly Point[]): Brep {
  const shifted = structuredClone(brep);
  for (const { curve } of shifted.edges) {
    if (curve.degree !== 3) continue;
    const original = JSON.stringify(curve.controlPoints);
    const poles = curve.controlPoints.map(([x, y, z], i): Point => {
      const [dx, dy, dz] = offsets[i];
      return [x + dx, y + dy, z + dz];
    });
    for (const { surface } of shifted.faces) if (surface.kind === 'surface')
      for (const row of surface.controlPoints) if (JSON.stringify(row) === original) row.splice(0, row.length, ...poles);
    curve.controlPoints.splice(0, curve.controlPoints.length, ...poles);
  }
  assert.ok(checkBrep(shifted, { strict: true }).valid);
  return shifted;
}

test('AP214 triangular Screws restore the structured packet with canonical owners', () => {
  const screw = commandById('smooth-screw')!;
  const rotated: SketchNode = {
    ...triangle, points: [triangle.points[0], triangle.points[2], triangle.points[1]],
    plane: { origin: [111, -33, 55], normal: [.6, 0, .8], xAxis: [.8, 0, -.6] },
  };
  for (const [angle, sketch] of [[-450, triangle], [450, rotated]] as const) {
    const authored: StudioDoc = screw.build!(ctx(sketch), { axisX: 10, axisY: -3, pitch: 40, angle });
    const extra = withNode(authored, { kind: 'sketch', profile: 'rectangle', min: [300, 300], max: [304, 304] });
    const separate = withNode(extra, { kind: 'extrude', sketch: authored.nodes.length, height: 4 });
    const step = exportStudioStep(separate, { name: 'Two bodies' }).text;
    const opened = withNode(emptyDoc(), { kind: 'import', name: 'Disparate bodies', step, solids: 2 });
    const ordinary = evaluateDoc(opened, 1), display = evaluateDoc(opened, 2, 8, true);
    assert.ok(ordinary.ok && display.ok);
    for (const [i, { brep }] of partBreps(opened).entries()) {
      const { loftDetail, ...canonical }: DisplayMesh = display.bodies[i].mesh;
      assert.deepEqual(canonical, ordinary.bodies[i].mesh);
      assert.equal(display.bodies[i].volume, ordinary.bodies[i].volume);
      if (brep.faces.length !== 5) {
        assert.equal(loftDetail, undefined);
        continue;
      }
      assert.ok(checkBrep(brep, { strict: true }).valid);
      assert.equal(compactStepTurnKind(brep), 'screw');
      assert.ok(loftDetail && 'kind' in loftDetail && loftDetail.screwGrid);
      assert.equal(loftDetail.indices.length / 3, 1284);
      assert.deepEqual([...new Set(loftDetail.edgeOfSegment)].sort((a, b) => a - b), canonical.edges.map(edge => edge.index));
      assert.deepEqual([...new Set(loftDetail.faceOfVertex)].sort((a, b) => a - b), canonical.faces.map(face => face.index));

      const renamed = { ...brep, faces: brep.faces.map((face, j) => ({ ...face, name: `surface-${j}` })).reverse(),
        edges: brep.edges.map((edge, j) => ({ ...edge, name: `edge-${j}` })).reverse() };
      assert.equal(compactStepTurnKind(renamed), 'screw');
      const nonlinearHeight = moveRailColumns(brep, Array.from({ length: 16 },
        (_, column) => column === 3 ? [0, .006, .008] : [0, 0, 0]));
      assert.equal(compactStepTurnKind(nonlinearHeight), undefined);
      const base = bodyMesh(nonlinearHeight, 0, 8);
      assert.equal(smoothTurnDisplayMesh(base, nonlinearHeight), base);
    }
  }
});

test('a strictly valid STEP triangle turning around an interior axis stays outside the Screw grid', () => {
  const native = smooth.build!(ctx(), { height: 40, angle: 360 });
  const step = exportStudioStep(native, { name: 'Centered control' }).text;
  const opened = withNode(emptyDoc(), { kind: 'import', name: 'Centered control', step });
  const [{ brep }] = partBreps(opened);
  assert.equal(compactStepTurnKind(brep), 'turn');
  const [a, b] = brep.edges.filter(edge => edge.curve.degree === 3).map(edge => edge.curve.controlPoints);
  const yAxis: Point = [0, .8, -.6], first = minus(b[0], a[0]);
  const u = first[0], v = scalar(first, yAxis), square = u * u + v * v;
  // Move the rotation axis a quarter millimetre from the centroid toward the interior.
  const offsets = a.map((_, i): Point => {
    if (i === 0 || i === a.length - 1) return [0, 0, 0];
    const edge = minus(b[i], a[i]), x = edge[0], y = scalar(edge, yAxis);
    const real = (u * x + v * y) / square, imag = (u * y - v * x) / square;
    return [0.25 * (1 - real), -.2 * imag, .15 * imag];
  });
  const interior = moveRailColumns(brep, offsets);
  assert.equal(compactStepTurnKind(interior), undefined);
  const base = bodyMesh(interior, 0, 8);
  assert.equal(smoothTurnDisplayMesh(base, interior), base);
});
