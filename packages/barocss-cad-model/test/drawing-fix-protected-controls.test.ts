import test from 'node:test';
import assert from 'node:assert/strict';
import { rectanglePart, withNode } from '../src/engine/doc';
import { brepsFor } from '../src/engine/evaluate';
import { projectViews } from '../src/drawing/project';
import { autoDimensions } from '../src/drawing/auto';
import { holeCallout, holeCalloutOwner, type DrawingCallout } from '../src/drawing/callout';
import { applyFix, drawingIssues, fixAll, issueContext, type SheetInputs } from '../src/drawing/issues';
import { drawingFixControlLoss } from '../src/drawing/fixProtection';
import { defaultDrawing, type DrawingSettings } from '../src/drawing/types';
import { forSheet, mergeSheet } from '../src/drawing/sheets';

function fixture() {
  const doc = withNode(rectanglePart(40, 40, 12), { kind: 'hole', parent: { node: 1, side: 'solid' }, center: [30, 20], radius: 2, pattern: { count: 4, about: [20, 20] } });
  const b = brepsFor(doc); assert.ok('breps' in b);
  const projected = projectViews(b.breps, b.prefixes); assert.ok(projected.ok);
  const callout: DrawingCallout = Object.assign((edge: string) => holeCallout(doc.nodes, edge), { patternQuantity: () => 4 });
  const input: SheetInputs = { views: projected.views, settings: defaultDrawing(), callout, locationOwner: e => holeCalloutOwner(doc.nodes, e), meta: { title: 'test', date: 'test' } };
  const auto = autoDimensions(input.views, issueContext(input).layout, input.settings, callout, [], [], input.locationOwner);
  const dim = auto.dimensions.find(d => d.kind === 'diameter'); assert.ok(dim);
  return { input, dim: { ...dim, count: 4 as const } };
}
for (const control of ['tolerance', 'basic', 'frame'] as const) test(`Fix all retains quantity-unverified ${control}, reason and omitted output marks`, () => {
  const { input, dim } = fixture();
  const protectedDim = { ...dim, ...(control === 'tolerance' ? { tol: { kind: 'symmetric' as const, value: 0.05 } } : control === 'basic' ? { basic: true as const } : {}) };
  const settings: DrawingSettings = { ...input.settings, dimensions: [protectedDim], ...(control === 'frame' ? { frames: [{ id: 'f1', dim: dim.id, characteristic: 'position' as const, value: 0.1, datums: [] }] } : {}) };
  const before = structuredClone(settings);
  const changed = { ...input, settings, callout: Object.assign(input.callout, { patternQuantity: () => 3 }) };
  const fixed = fixAll(changed);
  assert.deepEqual(fixed.settings.dimensions.find(d => d.id === dim.id), protectedDim);
  assert.deepEqual(fixed.settings.frames, settings.frames);
  assert.ok(fixed.left.some(i => i.code === 'DIMENSION_LOST' && i.message.includes('retains') && i.message.includes('quantity')));
  assert.ok(!fixed.applied.some(f => f.kind === 'remove-frame' || f.kind === 'remove' && f.dim === dim.id));
  const sheet = issueContext({ ...changed, settings: fixed.settings }).sheet;
  assert.equal(sheet.dimensions.find(r => r.dim.id === dim.id)?.ok, false);
  assert.ok(!sheet.groups.some(g => g.role === 'dimension' && g.id === dim.id));
  assert.deepEqual(settings, before, 'original remains available to Undo');
});
test('explicit removal reports tolerance/basic/frame identities and remains available', () => {
  const { input, dim } = fixture();
  const settings: DrawingSettings = { ...input.settings, dimensions: [{ ...dim, basic: true, tol: { kind: 'symmetric', value: 0.05 } }], frames: [{ id: 'f1', dim: dim.id, characteristic: 'position', value: 0.1, datums: [] }] };
  const fix = { kind: 'remove' as const, dim: dim.id };
  const loss = drawingFixControlLoss(settings, fix).join(' ');
  assert.match(loss, /±0.05 mm/); assert.match(loss, /basic/); assert.match(loss, /GD&T frame f1/); assert.ok(loss.includes(dim.id));
  const removed = applyFix(issueContext({ ...input, settings }), fix);
  assert.equal(removed.dimensions.length, 0); assert.equal(removed.frames?.length, 0);
  assert.equal(settings.dimensions.length, 1);
});
test('Fix all on another sheet preserves protected dimensions, IDs and controls on both sheets', () => {
  const { input, dim } = fixture();
  const first = { ...dim, id: 'first', tol: { kind: 'symmetric' as const, value: 0.05 } };
  const other = { ...first, id: 'other', view: 'front' as const, edge: 'missing' };
  const settings: DrawingSettings = { ...input.settings, dimensions: [first, other], sheets: [{ id: 's2', views: ['top'] }] };
  const before = structuredClone(settings);
  let merged = settings;
  for (const k of [0, 1]) {
    const local = forSheet(merged, k);
    const fixed = fixAll({ ...input, settings: local, callout: Object.assign(input.callout, { patternQuantity: () => 3 }) });
    merged = mergeSheet(merged, k, fixed.settings);
  }
  assert.deepEqual(merged.dimensions.find(d => d.id === 'first'), first);
  assert.deepEqual(merged.dimensions.find(d => d.id === 'other'), other);
  assert.equal(new Set(merged.dimensions.map(d => d.id)).size, merged.dimensions.length);
  assert.deepEqual(settings, before);
});
test('unprotected lost auto annotation can still be fixed automatically', () => {
  const { input, dim } = fixture();
  const settings = { ...input.settings, dimensions: [{ ...dim, edge: 'missing' }] };
  const fixed = fixAll({ ...input, settings });
  assert.ok(fixed.applied.some(f => f.kind === 'remove' && f.dim === dim.id));
  assert.ok(!drawingIssues(issueContext({ ...input, settings: fixed.settings })).some(i => i.code === 'DIMENSION_LOST'));
});
