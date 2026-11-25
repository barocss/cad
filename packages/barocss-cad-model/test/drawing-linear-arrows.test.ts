import test from 'node:test';
import assert from 'node:assert/strict';
import { rectanglePart } from '../src/engine/doc';
import { encodeStudioFile, readStudioFile } from '../src/engine/container';
import { brepsFor } from '../src/engine/evaluate';
import { projectViews } from '../src/drawing/project';
import { snapPoints } from '../src/drawing/dimensions';
import { defaultDrawing, readDrawing, type DrawingDimension } from '../src/drawing/types';
import { buildSheet, type Mark } from '../src/drawing/sheet';
import { layoutSheet } from '../src/drawing/views';
import { drawingIssues } from '../src/drawing/issues';
import { modelAnnotations } from '../src/drawing/annotations3d';
import { sheetDxfDocument } from '../src/io/dxf';

const doc = rectanglePart(40, 40, 40);
const b = brepsFor(doc); assert.ok('breps' in b);
const projected = projectViews(b.breps, b.prefixes); assert.ok(projected.ok);
const { views } = projected;
const snap = (x: number, y: number) => { const p = snapPoints(views.front).find(p => p.at[0] === x && p.at[1] === y); assert.ok(p); return p.ref; };
const base = { id: 'span', kind: 'linear', view: 'front', orient: 'horizontal', a: snap(0, 0), b: snap(40, 0), place: [20, -25] } satisfies DrawingDimension;
type Linear = Extract<DrawingDimension, { kind: 'linear' }>;
function scene(dim: Linear, scale = 0.25, standard?: 'asme') {
  const settings = { ...defaultDrawing(), dimensions: [dim], scale, standard };
  const layout = layoutSheet(views, settings), sheet = buildSheet(views, layout, settings, { title: 'Arrows', date: '2026-11-25' });
  const g = sheet.groups.find(g => g.role === 'dimension' && g.id === dim.id); assert.ok(g);
  const heads = g.marks.flatMap(m => m.kind === 'fill' && m.head ? [m.head] : []); assert.equal(heads.length, 2);
  const result = sheet.dimensions[0]; assert.ok(result.ok);
  return { views, settings, layout, sheet, g, heads, result };
}
const eps = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);

test('manual A stays outside while B Auto crosses its paper threshold, with the same tips, references and model length', () => {
  for (const scale of [0.25, 0.125]) {
    const control = scene(base, scale), edited: Linear = { ...base, arrowPlacement: { a: 'outside' } }, actual = scene(edited, scale);
    assert.deepEqual(actual.heads.map(h => h.tip), control.heads.map(h => h.tip));
    assert.deepEqual(actual.heads.map(h => h.dir[0]), scale === 0.25 ? [1, 1] : [1, -1]);
    assert.equal(actual.result.value, 40);
    assert.deepEqual(actual.result.dim, edited);
    const ext = (s: typeof actual) => s.g.marks.filter(m => m.kind === 'line' && m.role === 'extension');
    assert.deepEqual(ext(actual), ext(control));
    const rulers = actual.g.marks.filter((m): m is Extract<Mark, { kind: 'line' }> => m.kind === 'line' && m.role === 'dimension');
    const left = actual.heads[0].tip[0], right = actual.heads[1].tip[0];
    assert.ok(rulers[0].a[0] < left);
    if (scale === 0.25) eps(rulers.at(-1)!.b[0], right);
    else assert.ok(rulers.at(-1)!.b[0] > right);
  }
});

test('A/B are persistent authored roles in horizontal, vertical, and aligned dimensions and both projection orders', () => {
  for (const orient of ['horizontal', 'vertical', 'aligned'] as const) {
    const end = orient === 'horizontal' ? snap(40, 0) : orient === 'vertical' ? snap(0, 40) : snap(40, 40);
    for (const reverse of [false, true]) {
      const d: Linear = { ...base, a: reverse ? end : base.a, b: reverse ? base.a : end, orient, arrowPlacement: { a: 'outside', b: 'inside' } };
      const actual = scene(d, 1), control = scene({ ...d, arrowPlacement: undefined }, 1);
      assert.deepEqual(actual.heads.map(h => h.tip), control.heads.map(h => h.tip));
      const [a, b] = actual.heads.map(h => h.tip), x = b[0] - a[0], y = b[1] - a[1], l = Math.hypot(x,y);
      for (const h of actual.heads) { eps(h.dir[0], x/l); eps(h.dir[1], y/l); }
      eps(actual.result.value, orient === 'aligned' ? Math.hypot(40,40) : 40);
    }
  }
});

test('forced arrows that cannot fit retain the settings and emit a targeted warning', () => {
  const d: Linear = { ...base, arrowPlacement: { a: 'inside', b: 'inside' } };
  const small = scene(d, 0.125), large = scene(d, 0.25);
  for (const [s, crowded] of [[small, true], [large, false]] as const) {
    assert.deepEqual(s.heads.map(h => h.dir[0]), [-1, 1]);
    const issue = drawingIssues({ ...s, callout: () => null }).find(i => i.code === 'LINEAR_ARROWS_CROWDED');
    assert.deepEqual(issue?.dims, crowded ? [d.id] : undefined);
    assert.deepEqual(s.result.dim, d);
  }
});

test('schema 3 project preserves arrows through tolerance edit; invalid and auto input normalizes to legacy', async () => {
  const authored = { ...base, arrowPlacement: { a: 'outside' as const }, tol: { kind: 'symmetric' as const, value: 0.25 } };
  const input = { ...doc, drawing: { ...defaultDrawing(), dimensions: [authored] } };
  const opened = await readStudioFile(encodeStudioFile(input)); assert.ok('doc' in opened);
  assert.equal(opened.doc.schema, 3);
  assert.deepEqual(opened.doc.nodes, doc.nodes);
  assert.deepEqual(readDrawing(opened.doc.drawing).dimensions, [authored]);
  for (const bad of [{ a: 'auto', b: 2 }, [], false, undefined]) {
    assert.deepEqual(readDrawing({ dimensions: [{ ...base, arrowPlacement: bad }] }).dimensions, [base]);
  }
  const unsupported = readDrawing({ dimensions: [{ ...base, auto: true, arrowPlacement: { a: 'inside' } }] });
  assert.equal((unsupported.dimensions[0] as Linear).arrowPlacement, undefined);
});

test('DXF semantics stay exact while display solids and lifted 3D arrows follow shared marks', () => {
  const before = scene(base, 1, 'asme'), after = scene({ ...base, arrowPlacement: { a: 'outside' } }, 1, 'asme');
  const entity = (s: typeof after) => {
    const d = sheetDxfDocument(s.sheet, s.layout).entities.find(e => e.type === 'dimension'); assert.ok(d?.type === 'dimension');
    return d;
  };
  const a = entity(before), b = entity(after);
  assert.equal(a.measurement, 40); assert.equal(b.measurement, a.measurement);
  assert.deepEqual(b.geometry, a.geometry);
  assert.notDeepEqual(b.block.filter(m => m.type === 'solid'), a.block.filter(m => m.type === 'solid'));
  const annot = (s: typeof after) => modelAnnotations(s).items.find(d => d.id === base.id)!;
  const ab = annot(before), aa = annot(after);
  assert.equal(aa.dimension?.value, 40);
  assert.deepEqual(aa.targets, ab.targets);
  assert.deepEqual(aa.arrows.map(h => h.tip), ab.arrows.map(h => h.tip));
  assert.notDeepEqual(aa.arrows[0].dir, ab.arrows[0].dir);
  assert.deepEqual(aa.arrows[1].dir, ab.arrows[1].dir);
});
