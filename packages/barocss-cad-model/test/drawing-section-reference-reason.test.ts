import test from 'node:test';
import assert from 'node:assert/strict';
import { rectanglePart, withNode } from '../src/engine/doc';
import { drawingInputs } from '../src/chat/drawing';
import { issueContext } from '../src/drawing/issues';
import { resolveDimension } from '../src/drawing/dimensions';
import { defaultDrawing, type DrawingDimension, type DrawingSettings } from '../src/drawing/types';

const doc = withNode(rectanglePart(60, 40, 10), { kind: 'hole', parent: { node: 1, side: 'solid' }, center: [15, 10], radius: 3 });
const settings: DrawingSettings = { ...defaultDrawing(), sheet: 'A3', sections: [{ id: 'A', view: 'front', at: 10 }] };
function context(drawing = settings) {
  const input = drawingInputs(doc, drawing);
  if (typeof input === 'string') throw Error(input);
  return issueContext(input);
}
function reason(result: ReturnType<typeof resolveDimension>) {
  assert.equal(result.ok, false);
  if (result.ok) throw Error('expected unresolved dimension');
  return result.reason;
}

test('native section moved outside an unchanged hole reports current-section scope, not source deletion', () => {
  const before = context(), pr = before.sheet.sections![0].projection;
  const wall = pr.edges.find(e => e.ends?.every(p => Math.abs(p[0] - 12) < 1e-6) && e.pieces.some(p => p.visible));
  assert.ok(wall?.ends);
  const dim: DrawingDimension = { id: 'wall', view: 'section:A', kind: 'linear', a: { edge: wall.name, at: 'end', near: wall.ends[0] }, b: { edge: wall.name, at: 'end', near: wall.ends[1] }, orient: 'vertical', place: [5, 5] };
  const original = JSON.stringify({ doc, dim });
  const at10 = { ...settings, dimensions: [dim] };
  assert.ok(context(at10).sheet.dimensions[0].ok);
  const moved = context({ ...at10, sections: [{ id: 'A', view: 'front', at: 20 }] });
  assert.equal(reason(moved.sheet.dimensions[0]), 'An edge it measured cannot be found in the current section. Check the section position and the source feature.');
  assert.equal(reason(context({ ...at10, sections: [] }).sheet.dimensions[0]), 'Its section (A–A) is not on the sheet.');
  assert.ok(context(at10).sheet.dimensions[0].ok, 'restoring the section resolves the original reference');
  assert.equal(JSON.stringify({ doc, dim }), original);
});

test('missing angle/circle/PCD references are scoped only to sections; base messages remain unchanged', () => {
  const pr = context().sheet.sections![0].projection;
  const ref = { edge: 'missing', near: [0, 0, 0] as [number, number, number] };
  const dims: DrawingDimension[] = [
    { id: 'angle', kind: 'angle', view: 'section:A', a: ref, b: ref, place: [5, 5] },
    ...(['radius', 'diameter'] as const).map(kind => ({ id: kind, kind, view: 'section:A' as const, ...ref, place: [5, 5] as [number, number] })),
    { id: 'pcd', kind: 'pcd', view: 'section:A', ring: [ref, ref, ref], place: [5, 5] },
  ];
  for (const dim of dims) {
    const message = reason(resolveDimension({ 'section:A': pr }, dim));
    assert.match(message, /current section\. Check the section position and the source features?\.$/);
    assert.doesNotMatch(message, /gone|no longer in the part/);
    const base = reason(resolveDimension({ front: pr }, { ...dim, view: 'front' }));
    assert.equal(base, dim.kind === 'angle' ? 'An edge it measured is no longer in the part.' : dim.kind === 'pcd' ? 'Its holes are gone, or no longer on one circle.' : 'The circle it measured is no longer in the part.');
    assert.equal(reason(resolveDimension({}, dim)), 'Its view (section:A) is not on the sheet.');
  }
  const wall = pr.edges.find(e => e.kind === 'line' && e.ends && e.pieces.some(p => p.visible))!;
  const end = { edge: wall.name, at: 'end' as const, near: wall.ends![0] };
  assert.equal(reason(resolveDimension({ 'section:A': pr }, { id: 'same', kind: 'linear', view: 'section:A', a: end, b: end, orient: 'vertical', place: [5, 5] })), 'Its two points now coincide in this view.');
});
