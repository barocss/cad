import test from 'node:test';
import assert from 'node:assert/strict';
import { rectanglePart, withNode } from '../src/engine/doc';
import { drawingInputs } from '../src/chat/drawing';
import { drawingIssues, issueContext } from '../src/drawing/issues';
import { resolvePoint } from '../src/drawing/dimensions';
import { defaultDrawing, type DrawingSettings } from '../src/drawing/types';

const doc = (radius: number) => withNode(rectanglePart(60, 40, 10), { kind: 'hole', parent: { node: 1, side: 'solid' }, center: [15, 10], radius });
const settings: DrawingSettings = { ...defaultDrawing(), sheet: 'A3', sections: [{ id: 'A', view: 'front', at: 10 }] };
function context(radius: number, drawing = settings) {
  const input = drawingInputs(doc(radius), drawing);
  assert.notEqual(typeof input, 'string');
  if (typeof input === 'string') throw Error(input);
  return issueContext(input);
}
function fixture() {
  const before = context(3), pr = before.sheet.sections![0].projection;
  const wall = pr.edges.find(e => e.ends?.every(p => Math.abs(p[0] - 12) < 1e-6) && e.pieces.some(p => p.visible));
  assert.ok(wall?.ends);
  const drawing: DrawingSettings = { ...settings, dimensions: [{ id: 'wall', view: 'section:A', kind: 'linear', a: { edge: wall.name, at: 'end', near: wall.ends[0] }, b: { edge: wall.name, at: 'end', near: wall.ends[1] }, orient: 'vertical', place: [5, 5] }] };
  return drawing;
}
const hidden = (ctx: ReturnType<typeof context>) => drawingIssues(ctx).filter(i => i.code === 'DIM_ON_HIDDEN' && i.dims?.includes('wall'));

test('native Hole radius edit: a visible section wall uses current resolved endpoints, not saved near hints', () => {
  const drawing = fixture(), saved = JSON.stringify(drawing), before = context(3, drawing), after = context(4, drawing);
  assert.deepEqual(hidden(before), []);
  const d = drawing.dimensions[0]; assert.equal(d.kind, 'linear'); if (d.kind !== 'linear') return;
  const pr = after.sheet.sections![0].projection;
  assert.equal(d.a.edge, 'n2.side0|section_b2.cut.side0#1');
  assert.deepEqual([d.a.near, d.b.near], [[12, 10, 0], [12, 10, 10]]);
  assert.deepEqual([resolvePoint(pr, d.a), resolvePoint(pr, d.b)], [[11, 10, 0], [11, 10, 10]]);
  assert.ok(pr.edges.find(e => e.name === d.a.edge)!.pieces.some(p => p.visible));
  assert.ok(after.sheet.dimensions[0].ok && after.sheet.dimensions[0].value === 10);
  assert.deepEqual(hidden(after), []);
  assert.equal(JSON.stringify(drawing), saved, 'diagnostics do not rewrite saved hints');
});

test('current endpoints with no visible incident edges still warn; missing references remain lost', () => {
  const drawing = fixture(), ctx = context(4, drawing), pr = ctx.sheet.sections![0].projection;
  // Isolate the visibility classification using the same native projection and current endpoints.
  const hiddenProjection = { ...pr, edges: pr.edges.map(e => ({ ...e, pieces: e.pieces.map(p => ({ ...p, visible: false })) })) };
  const hiddenContext = { ...ctx, sheet: { ...ctx.sheet, sections: ctx.sheet.sections!.map(s => ({ ...s, projection: hiddenProjection })) } };
  assert.equal(hidden(hiddenContext).length, 1);
  const d = drawing.dimensions[0]; assert.equal(d.kind, 'linear'); if (d.kind !== 'linear') return;
  const lost = context(4, { ...drawing, dimensions: [{ ...d, a: { ...d.a, edge: 'removed-edge' } }] });
  const issues = drawingIssues(lost);
  assert.ok(issues.some(i => i.code === 'DIMENSION_LOST' && i.dims?.includes('wall')));
  assert.deepEqual(hidden(lost), []);
});

test('native unsectioned hidden hole wall still warns alongside the corrected section dimension', () => {
  const drawing = fixture(), before = context(3, drawing);
  const wall = before.views.front.edges.find(e => e.ends && e.name.includes('n2.side0') && e.pieces.length > 0 && e.pieces.every(p => !p.visible));
  assert.ok(wall?.ends, 'native front projection has a hidden hole edge');
  const withHidden: DrawingSettings = { ...drawing, dimensions: [...drawing.dimensions, { id: 'hidden-wall', view: 'front', kind: 'linear', a: { edge: wall.name, at: 'end', near: wall.ends[0] }, b: { edge: wall.name, at: 'end', near: wall.ends[1] }, orient: 'vertical', place: [5, 5] }] };
  for (const radius of [3, 4]) {
    const ctx = context(radius, withHidden);
    assert.ok(ctx.sheet.dimensions.every(d => d.ok));
    assert.deepEqual(hidden(ctx), []);
    assert.ok(drawingIssues(ctx).some(i => i.code === 'DIM_ON_HIDDEN' && i.dims?.includes('hidden-wall')));
  }
});
