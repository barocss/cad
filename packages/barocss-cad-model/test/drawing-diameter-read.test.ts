import test from 'node:test';
import assert from 'node:assert/strict';
import { starterDoc, type StudioDoc } from '../src/engine/doc';
import { drawingInputs } from '../src/chat/drawing';
import { readDrawingStack, DRAWING_DIMENSIONS, DRAWING_TOLERANCE_STACK } from '../src/chat/drawingToleranceStack';
import { runTool, dispatchTool } from '../src/chat/tools';
import { defaultDrawing, type DrawingDimension } from '../src/drawing/types';
import { forSheet } from '../src/drawing/sheets';
import { snapPoints } from '../src/drawing/dimensions';
import { issueContext, type SheetInputs } from '../src/drawing/issues';

const sentinel = 'SYNTHETIC_PRIVATE_CALLOUT_SOURCE';
const noCommit = async (): Promise<never> => { throw new Error('Read must not evaluate a document commit.'); };
function inputs(doc: StudioDoc): SheetInputs {
  const value = drawingInputs(doc);
  if (typeof value === 'string') throw new Error(value);
  return value;
}
// Preserve the resolver's exact floating-point result; independently check the authored 8 mm size.
function holeValue(input: SheetInputs, sheet = 1): number {
  const local = { ...input, settings: forSheet(input.settings, sheet - 1) };
  const hole = issueContext(local).sheet.dimensions.find(r => r.dim.id === 'hole');
  assert.ok(hole?.ok && hole.kind === 'diameter');
  assert.ok(Math.abs(hole.value - 8) <= 1e-9, 'authored diameter is 8 mm within 1e-9 mm absolute');
  return hole.value;
}
function fixture(): StudioDoc {
  const doc = starterDoc(), view = inputs(doc).views;
  const snaps = snapPoints(view.front);
  const corner = (x: number, y: number) => {
    const p = snaps.find(s => Math.abs(s.at[0] - x) < 1e-8 && Math.abs(s.at[1] - y) < 1e-8);
    assert.ok(p, `native projected corner ${x},${y}`); return p.ref;
  };
  const circle = view.top.edges.find(e => e.circle && Math.abs(e.circle.radius - 4) < 1e-8);
  assert.ok(circle?.circle);
  const linear: DrawingDimension = { id: 'width', kind: 'linear', view: 'front', orient: 'horizontal', a: corner(0, 0), b: corner(64, 8), place: [32, -10], tol: { kind: 'symmetric', value: .1 } };
  const diameter: DrawingDimension = { id: 'hole', kind: 'diameter', view: 'top', edge: circle.name, near: [...circle.circle.center], place: [50, 40], tol: { kind: 'fit', code: 'H7' }, count: 2, basic: true };
  const lost: DrawingDimension = { ...diameter, id: 'lost', edge: 'missing-circle', place: [60, 40] };
  return { ...doc, drawing: { ...defaultDrawing(), views: ['front', 'top'], units: 'inch', dual: true,
    dimensions: [diameter, linear, lost,
      { ...diameter, kind: 'radius', id: 'radius' },
      { id: 'pcd', kind: 'pcd', view: 'top', ring: [{ edge: 'missing-pcd-a', near: [0, 0, 0] }, { edge: 'missing-pcd-b', near: [10, 0, 0] }, { edge: 'missing-pcd-c', near: [0, 10, 0] }], place: [70, 40] },
      { id: 'angle', kind: 'angle', view: 'front', a: { edge: 'missing-a', near: [0, 0, 0] }, b: { edge: 'missing-b', near: [0, 0, 0] }, place: [70, 50] },
    ], notes: [{ id: 'private-note', text: sentinel, at: [0, 0] }] } };
}
function direct(doc: StudioDoc, args: Record<string, unknown> = {}, supplied = inputs(doc)) {
  const before = structuredClone(doc);
  const result = readDrawingStack(doc, DRAWING_DIMENSIONS, args, supplied.settings, () => supplied);
  assert.ok(!('error' in result), JSON.stringify(result));
  assert.deepEqual(doc, before);
  return result;
}
function rows(content: Record<string, unknown>): Record<string, unknown>[] {
  assert.ok(Array.isArray(content.dimensions));
  for (const row of content.dimensions) assert.ok(row && typeof row === 'object' && !Array.isArray(row));
  return content.dimensions;
}
async function publicRead(doc: StudioDoc, args: Record<string, unknown>) {
  const before = structuredClone(doc), state = { doc, bodies: [], approvalRequired: true as const };
  const facade = await runTool(state, 'drawing', { action: 'dimensions', ...args }, noCommit);
  const dispatched = await dispatchTool(state, DRAWING_DIMENSIONS, args, noCommit);
  for (const out of [facade, dispatched]) {
    assert.equal(out.changed, false); assert.equal(out.state.doc, doc); assert.deepEqual(doc, before);
  }
  return { facade, dispatched };
}

test('default and false preserve legacy bytes; opt-in adds ordered geometric diameters only', () => {
  const doc = fixture(), input = inputs(doc), before = structuredClone(input.settings);
  const omitted = direct(doc, {}, input), no = direct(doc, { include_diameters: false }, input);
  assert.equal(JSON.stringify(no), JSON.stringify(omitted));
  assert.deepEqual(rows(omitted.content).map(r => r.id), ['width']);
  const yes = direct(doc, { include_diameters: true }, input), all = rows(yes.content);
  assert.deepEqual(all.map(r => [r.id, r.kind]), [['hole', 'diameter'], ['width', 'linear'], ['lost', 'diameter']]);
  const stripped = all.filter(r => r.kind === 'linear').map(({ kind, ...rest }) => { void kind; return rest; });
  assert.deepEqual(stripped, rows(omitted.content));
  assert.deepEqual(all[0], { id: 'hole', view: 'top', kind: 'diameter', resolved: true, value: holeValue(input) });
  assert.deepEqual(Object.keys(all[2]).sort(), ['id', 'kind', 'reason', 'resolved', 'view']);
  assert.equal(all[2].resolved, false); assert.equal(typeof all[2].reason, 'string');
  assert.equal(yes.content.revision, omitted.content.revision);
  assert.deepEqual(input.settings, before);
});

test('synthetic callout-bearing SheetInputs resolve geometry without exposing printed or authored metadata', () => {
  const doc = fixture(), base = inputs(doc);
  // Real projected native geometry, synthetic display provider. This is not catalogue/source integration coverage.
  const supplied: SheetInputs = { ...base, callout: () => sentinel };
  const context = issueContext(supplied), hole = context.sheet.dimensions.find(r => r.dim.id === 'hole');
  assert.ok(hole?.ok); assert.match(hole.text, new RegExp(sentinel));
  const result = direct(doc, { include_diameters: true }, supplied);
  assert.doesNotMatch(JSON.stringify(result.content), new RegExp(sentinel));
  const row = rows(result.content).find(r => r.id === 'hole');
  assert.deepEqual(row, { id: 'hole', view: 'top', kind: 'diameter', resolved: true, value: holeValue(supplied) });
  for (const units of ['mm', 'inch'] as const) {
    const changed: StudioDoc = { ...doc, drawing: { ...doc.drawing!, units, dual: true, scale: .5 } };
    const changedInput = inputs(changed);
    const value = rows(direct(changed, { include_diameters: true }, changedInput).content)[0].value;
    assert.equal(value, holeValue(changedInput));
    assert.equal(value, holeValue(supplied), 'print units and scale do not change raw model mm');
  }
});

test('public facade and direct dispatcher preserve legacy and expose geometry, not hole/fit interpretation', async () => {
  const doc = fixture();
  const old = await publicRead(doc, {}), no = await publicRead(doc, { include_diameters: false });
  assert.equal(old.facade.isError, false, old.facade.content);
  assert.equal(no.facade.content, old.facade.content);
  const yes = await publicRead(doc, { include_diameters: true });
  for (const pair of [old, no, yes]) {
    assert.equal(pair.facade.isError, false, pair.facade.content);
    assert.equal(pair.dispatched.isError, false, pair.dispatched.content);
    assert.equal(pair.facade.content, pair.dispatched.content);
  }
  assert.deepEqual(JSON.parse(yes.facade.content), direct(doc, { include_diameters: true }).content);
});

test('malformed own options refuse before projection and through public admission', async () => {
  const doc = fixture(), before = structuredClone(doc);
  for (const value of [undefined, null, 0, 1, 'true', [], {}]) {
    let projected = false;
    const result = readDrawingStack(doc, DRAWING_DIMENSIONS, { include_diameters: value }, doc.drawing!, () => { projected = true; throw new Error('must reject before projection'); });
    assert.ok('error' in result); assert.equal(projected, false);
    assert.match(result.error, /include_diameters.*boolean/);
    const pair = await publicRead(doc, { include_diameters: value });
    assert.equal(pair.facade.isError, true); assert.equal(pair.dispatched.isError, true);
  }
  const extra = await publicRead(doc, { include_diameters: true, arbitrary: true });
  assert.equal(extra.facade.isError, true); assert.equal(extra.dispatched.isError, true);
  assert.deepEqual(doc, before);
});

test('selected sheet is explicit; hidden right-view diameter remains unresolved, never zero', () => {
  const doc = fixture();
  doc.drawing!.sheets = [{ id: 'second', name: 'Top', views: ['top'] }];
  assert.deepEqual(rows(direct(doc, { include_diameters: true, sheet: 1 }).content).map(r => r.id), ['width']);
  const second = direct(doc, { include_diameters: true, sheet: 2 });
  assert.deepEqual(rows(second.content).map(r => r.id), ['hole', 'lost']);
  assert.deepEqual(rows(second.content)[0], { id: 'hole', view: 'top', kind: 'diameter', resolved: true, value: holeValue(inputs(doc), 2) });
  assert.notEqual(second.content.revision, direct(doc, { include_diameters: true }).content.revision);
  const hidden = fixture();
  hidden.drawing!.dimensions = hidden.drawing!.dimensions.map(d => d.id === 'hole' ? { ...d, view: 'right' } : d);
  // front/top remain valid shown views. buildSheet's hidden-view check precedes circle resolution.
  const input = inputs(hidden), oracle = issueContext(input).sheet.dimensions.find(r => r.dim.id === 'hole');
  assert.ok(oracle && !oracle.ok); assert.match(oracle.reason, /not shown/);
  const row = rows(direct(hidden, { include_diameters: true }, input).content)[0];
  assert.deepEqual(row, { id: 'hole', view: 'right', kind: 'diameter', resolved: false, reason: oracle.reason });
});

test('stack remains linear-only and rejects the new listing option', async () => {
  const doc = fixture(), listed = direct(doc, { include_diameters: true });
  const args = { expectedRevision: listed.content.revision, terms: [{ id: 'width', sign: 1 }, { id: 'hole', sign: -1 }] };
  const input = inputs(doc), result = readDrawingStack(doc, DRAWING_TOLERANCE_STACK, args, input.settings, () => input);
  assert.ok('error' in result); assert.match(result.error, /must be linear/);
  const before = structuredClone(doc);
  const refused = readDrawingStack(doc, DRAWING_TOLERANCE_STACK, { ...args, include_diameters: false }, input.settings, () => { throw new Error('Stack option must fail before projection'); });
  assert.ok('error' in refused); assert.match(refused.error, /only supported|linear-only/);
  for (const [name, options] of [
    ['drawing', { action: 'stack', ...args, include_diameters: true }],
    [DRAWING_TOLERANCE_STACK, { ...args, include_diameters: true }],
  ] as const) {
    const out = await runTool({ doc, bodies: [] }, name, options, noCommit);
    assert.equal(out.isError, true); assert.equal(out.changed, false); assert.equal(out.state.doc, doc);
  }
  assert.deepEqual(doc, before);
});

test('describe exposes optional boolean only on dimensions, not stack', async () => {
  const doc = fixture();
  for (const action of ['dimensions', 'stack']) {
    const out = await runTool({ doc, bodies: [] }, 'describe', { tool: 'drawing', action }, noCommit);
    assert.equal(out.isError, false, out.content);
    const described = JSON.parse(out.content);
    if (action === 'dimensions') {
      assert.equal(described.input.properties.include_diameters.type, 'boolean');
      assert.equal((described.input.required ?? []).includes('include_diameters'), false);
    } else assert.equal(Object.hasOwn(described.input.properties, 'include_diameters'), false);
  }
});
