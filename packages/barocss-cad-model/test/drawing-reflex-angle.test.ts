import assert from 'node:assert/strict';
import test from 'node:test';
import type { BrepProjection, ProjectedEdge } from '@barocss/cad';
import { emptyDoc, withNode } from '../src/engine/doc';
import { brepsFor } from '../src/engine/evaluate';
import { assertSavedDrawingDocument } from '../src/engine/savedDrawing';
import { resolveDimension } from '../src/drawing/dimensions';
import { projectViews } from '../src/drawing/project';
import { checkSavedReflexAngle } from '../src/drawing/savedReflexAngle';
import { defaultDrawing, readDrawing, type DrawingDimension, type DrawingViews, type NativeTopEdge, type Vec3, type XY } from '../src/drawing/types';

type Angle = Extract<DrawingDimension, { kind: 'angle' }>;
const gap = (a: readonly number[], b: readonly number[]) => Math.hypot(...a.map((value, axis) => value - b[axis]));
const near = (a: number, b: number) => assert.ok(Number.isFinite(a) && Math.abs(a - b) < 1e-9, `${a} vs ${b}`);
function fixture(points: XY[], corner: XY) {
  const doc = withNode(withNode(emptyDoc(), { kind: 'sketch', profile: 'polygon', points }), { kind: 'extrude', sketch: 0, height: 6 });
  const body = brepsFor(doc); assert.ok('breps' in body);
  const projected = projectViews(body.breps, body.prefixes); assert.ok(projected.ok);
  const views = projected.views, at: Vec3 = [corner[0], corner[1], 6];
  const edges = views.top.edges.filter(edge => edge.kind === 'line' && edge.ends
    && edge.ends.every(point => Math.abs(point[2] - 6) < 1e-9) && edge.ends.some(point => gap(point, at) < 1e-9));
  assert.equal(edges.length, 2); assert.ok(views.nativeTop);
  const ref = (edge: ProjectedEdge) => ({ edge: edge.name, near: edge.ends![0].map((value, axis) => (value + edge.ends![1][axis]) / 2) as Vec3 });
  const dim: Angle = { id: 'reflex', view: 'top', kind: 'angle', mode: 'reflex', a: ref(edges[0]), b: ref(edges[1]), place: [30, 30] };
  return { doc, body, views, dim, edges, at };
}
const elbow = () => fixture([[0, 0], [40, 0], [40, 20], [20, 20], [20, 40], [0, 40]], [20, 20]);
const sixty = () => fixture([[0, 0], [40, 0], [20, 20 * Math.sqrt(3)]], [0, 0]);

for (const [name, make, expected] of [['L corner', elbow, 270], ['60 degree corner', sixty, 300]] as const)
  test(`${name} resolves the CCW reflex angle independently of reference, endpoint and placement order`, () => {
    const { views, dim } = make(), before = structuredClone({ views, dim });
    const original = resolveDimension(views, dim); assert.ok(original.ok && original.kind === 'angle');
    near(original.value, expected); assert.equal(original.text, `${expected}°`);
    for (const reversed of [false, true]) for (const swapped of [false, true]) for (const place of [[50, 30], [10, 30], [10, 10], [30, 10]] as XY[]) {
      const nativeTop = { edges: views.nativeTop!.edges.map(edge => reversed ? { ...edge,
        vertices: [edge.vertices[1], edge.vertices[0]] as const, ends: [edge.ends[1], edge.ends[0]] as const } : edge) };
      const top = { ...views.top, edges: views.top.edges.map(edge => reversed && edge.ends ? { ...edge, ends: [edge.ends[1], edge.ends[0]] as const } : edge) };
      const result = resolveDimension({ ...views, top, nativeTop }, { ...dim, ...(swapped ? { a: dim.b, b: dim.a } : {}), place });
      assert.ok(result.ok && result.kind === 'angle', JSON.stringify(result)); near(result.value, expected);
      assert.deepEqual({ vertex: result.vertex, from: result.from, to: result.to, ends: result.ends },
        { vertex: original.vertex, from: original.from, to: original.to, ends: original.ends });
    }
    assert.deepEqual({ views, dim }, before);
  });

test('reflex source identity refuses projected-only coincidence, disjoint native vertices and multiple exact bodies', () => {
  const { views, dim, body, edges } = elbow();
  const edge = views.nativeTop!.edges.find(edge => edge.name === dim.b.edge)!;
  const replace = (changed: NativeTopEdge): DrawingViews => ({ ...views,
    nativeTop: { edges: views.nativeTop!.edges.map(value => value.id === edge.id ? changed : value) } });
  const separated = replace({ ...edge, vertices: edge.vertices.map(id => `disjoint.${id}`) as [string, string] });
  const depthEnds = edge.ends.map(point => [point[0], point[1], point[2] + 5] as Vec3) as [Vec3, Vec3];
  const atDepth = { ...replace({ ...edge, vertices: [`depth.${edge.vertices[0]}`, `depth.${edge.vertices[1]}`], ends: depthEnds }),
    top: { ...views.top, edges: views.top.edges.map(value => value.name === edges[1].name ? { ...value, ends: depthEnds } : value) } };
  for (const changed of [separated, atDepth, { ...views, nativeTop: undefined }]) {
    const result = resolveDimension(changed, dim); assert.ok(!result.ok && /Reflex angle:/.test(result.reason));
  }
  const multiple = projectViews([body.breps[0], body.breps[0]], ['', 'other:']); assert.ok(multiple.ok);
  assert.equal(multiple.views.nativeTop, undefined);
  assert.equal(resolveDimension(multiple.views, dim).ok, false);
});

test('reflex rejects hidden ink, source-only shadows, silhouettes, duplicate names and lost or rematched linked sources', () => {
  const { views, dim } = elbow();
  const changedEdge = (transform: (edge: ProjectedEdge) => ProjectedEdge): DrawingViews => ({ ...views,
    top: { ...views.top, edges: views.top.edges.map(edge => edge.name === dim.a.edge ? transform(edge) : edge) } });
  const native = views.nativeTop!.edges.find(edge => edge.name === dim.a.edge)!;
  const variants = [changedEdge(edge => ({ ...edge, pieces: [] })), changedEdge(edge => ({ ...edge, kind: 'silhouette' })),
    changedEdge(edge => ({ ...edge, pieces: edge.pieces.map(piece => ({ ...piece, visible: false })) })),
    changedEdge(edge => ({ ...edge, pieces: edge.pieces.map(piece => ({ ...piece, ink: false as const })) })),
    { ...views, nativeTop: { edges: [...views.nativeTop!.edges, { ...native, id: 'ambiguous' }] } },
    { ...views, top: { ...views.top, edges: views.top.edges.filter(edge => edge.name !== dim.a.edge) } }];
  for (const changed of variants) assert.equal(resolveDimension(changed, dim).ok, false);
  for (const changed of [{ ...dim, b: dim.a }, { ...dim, a: { ...dim.a, was: 'lost.original' } }, { ...dim, a: { ...dim.a, edge: 'gone' } },
    { ...dim, view: 'front' as const }, { ...dim, view: 'section:A' as const }]) assert.equal(resolveDimension(views, changed).ok, false);
  const rematched = resolveDimension(views, { ...dim, a: { ...dim.a, was: 'lost.original' } });
  assert.ok(!rematched.ok && /linked source edge was rematched/.test(rematched.reason));
});

test('same-name source replacement cannot silently reassign a reflex corner after its native midpoint changes', () => {
  const original = elbow(), changed = fixture([[0, 0], [40, 0], [40, 20], [25, 20], [25, 40], [0, 40]], [25, 20]);
  assert.deepEqual(changed.edges.map(edge => edge.name).sort(), original.edges.map(edge => edge.name).sort());
  assert.ok(resolveDimension(original.views, original.dim).ok);
  const stale = resolveDimension(changed.views, original.dim);
  assert.ok(!stale.ok && /stored source midpoints/.test(stale.reason));
  assert.ok(resolveDimension(changed.views, changed.dim).ok, 'explicitly selected current references are admitted');
});

test('collinear and out-of-Top rays cannot produce reflex geometry even with a common native vertex ID', () => {
  const { views, dim, at } = elbow();
  const native = views.nativeTop!.edges.find(edge => edge.name === dim.b.edge)!;
  const a = views.nativeTop!.edges.find(edge => edge.name === dim.a.edge)!;
  const shared = a.vertices.find(id => native.vertices.includes(id))!, ai = a.vertices.indexOf(shared), bi = native.vertices.indexOf(shared);
  const far = a.ends[1 - ai];
  for (const end of [far, [far[0], far[1], far[2] + 1] as Vec3]) {
    const ends = native.ends.map((point, index) => index === bi ? point : end) as [Vec3, Vec3];
    const top: BrepProjection = { ...views.top, edges: views.top.edges.map(edge => edge.name !== dim.b.edge ? edge : { ...edge, ends,
      pieces: [{ visible: true, curve: { kind: 'line', a: [ends[0][0], ends[0][1]], b: [ends[1][0], ends[1][1]] } }] }) };
    const changed = { ...views, top, nativeTop: { edges: views.nativeTop!.edges.map(edge => edge.id === native.id ? { ...edge, ends } : edge) } };
    const near = ends[0].map((value, axis) => (value + ends[1][axis]) / 2) as Vec3;
    assert.equal(resolveDimension(changed, { ...dim, b: { ...dim.b, near } }).ok, false);
  }
  assert.deepEqual(at, [20, 20, 6]);
});

test('ordinary saved angles keep placement-selected 45 and 135 degree sectors and do not need native metadata', () => {
  const { views, dim } = fixture([[0, 0], [40, 0], [40, 40]], [0, 0]);
  const { mode: _mode, ...ordinary } = dim; void _mode;
  for (const [place, expected] of [[[10, 4], 45], [[-2, 6], 135]] as [XY, number][]) {
    const result = resolveDimension({ top: views.top }, { ...ordinary, place }); assert.ok(result.ok); near(result.value, expected);
  }
  const settings = { ...defaultDrawing(), dimensions: [ordinary] };
  assert.deepEqual(readDrawing(JSON.parse(JSON.stringify(settings))), settings);
  assert.deepEqual(checkSavedReflexAngle(settings), []);
});

test('saved reflex mode round-trips without a schema change and malformed opt-ins refuse before raw Open', () => {
  const { doc, dim } = elbow(), settings = { ...defaultDrawing(), dimensions: [dim] };
  assert.deepEqual(readDrawing(JSON.parse(JSON.stringify(settings))), settings);
  assert.deepEqual(checkSavedReflexAngle(settings), []); assertSavedDrawingDocument({ ...doc, drawing: settings });
  for (const patch of [{ mode: 'minor' }, { mode: false }, { kind: 'linear' }, { view: 'front' }, { view: 'detail:A' },
    { auto: true }, { id: '' }, { a: { edge: 'x', near: [0, 0] } }, { place: [0, Number.NaN] }]) {
    const drawing = { ...settings, dimensions: [{ ...dim, ...patch }] };
    assert.ok(checkSavedReflexAngle(drawing).length);
    assert.throws(() => assertSavedDrawingDocument({ ...doc, drawing }));
    assert.throws(() => assertSavedDrawingDocument({ ...doc, instances: [{ id: 'nested', doc: { ...doc, drawing } }] }));
  }
  assert.ok(checkSavedReflexAngle({ ...settings, dimensions: [dim, dim] }).length);
  assert.ok(checkSavedReflexAngle({ ...settings, scope: { kind: 'assembly' } }).length);
  assert.ok(checkSavedReflexAngle({ ...settings, breaks: [{ axis: 'x', from: 10, to: 15 }] }).length);
});
