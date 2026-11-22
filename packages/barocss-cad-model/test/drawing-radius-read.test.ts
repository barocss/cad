import test from 'node:test';
import assert from 'node:assert/strict';
import { starterDoc, type StudioDoc } from '../src/engine/doc';
import { drawingInputs } from '../src/chat/drawing';
import { readDrawingStack, DRAWING_DIMENSIONS, DRAWING_TOLERANCE_STACK } from '../src/chat/drawingToleranceStack';
import { runTool, dispatchTool } from '../src/chat/tools';
import { defaultDrawing, type DrawingDimension } from '../src/drawing/types';
import { forSheet, sheetName } from '../src/drawing/sheets';
import { snapPoints } from '../src/drawing/dimensions';
import { issueContext, type SheetInputs } from '../src/drawing/issues';
import { dimensionLine } from '../src/drawing/sheet';
import { presetFor } from '../src/drawing/standard';
import { drawingScopeOf } from '../src/drawing/scope';
import { digestOf, requirementEvidenceRevision } from '../src/util/digest';

const sentinel = 'SYNTHETIC_PRIVATE_RADIUS_SOURCE';
const noCommit = async (): Promise<never> => { throw new Error('A drawing read must not evaluate a document commit.'); };
function inputs(doc: StudioDoc): SheetInputs {
  const result = drawingInputs(doc);
  if (typeof result === 'string') throw new Error(result);
  return result;
}
function fixture(): StudioDoc {
  const doc = starterDoc(), view = inputs(doc).views, snaps = snapPoints(view.front);
  const corner = (x: number, y: number) => {
    const point = snaps.find(p => Math.abs(p.at[0] - x) < 1e-8 && Math.abs(p.at[1] - y) < 1e-8);
    assert.ok(point); return point.ref;
  };
  const circle = view.top.edges.find(edge => edge.circle && Math.abs(edge.circle.radius - 4) < 1e-8);
  assert.ok(circle?.circle);
  const diameter: DrawingDimension = { id: 'hole', kind: 'diameter', view: 'top', edge: circle.name,
    near: [...circle.circle.center], place: [50, 40], tol: { kind: 'fit', code: 'H7' }, count: 2, basic: true };
  const radius = { ...diameter, id: 'radius', kind: 'radius' as const, place: [60, 50] as [number, number],
    tol: { kind: 'symmetric' as const, value: .2 }, count: 3, sourceMetadata: { text: sentinel } };
  const linear: DrawingDimension = { id: 'width', kind: 'linear', view: 'front', orient: 'horizontal',
    a: corner(0, 0), b: corner(64, 8), place: [32, -10], tol: { kind: 'symmetric', value: .1 } };
  return { ...doc, drawing: { ...defaultDrawing(), scope: { kind: 'part' }, views: ['front', 'top'], units: 'inch', dual: true,
    dimensions: [radius, diameter, linear, { ...radius, id: 'lost-radius', edge: 'missing-radius-circle' },
      { ...diameter, id: 'lost-diameter', edge: 'missing-diameter-circle' },
      { id: 'angle', kind: 'angle', view: 'front', a: { edge: 'missing-a', near: [0, 0, 0] }, b: { edge: 'missing-b', near: [0, 0, 0] }, place: [70, 50] },
      { id: 'pcd', kind: 'pcd', view: 'top', ring: [{ edge: 'pcd-a', near: [0, 0, 0] }, { edge: 'pcd-b', near: [10, 0, 0] }, { edge: 'pcd-c', near: [0, 10, 0] }], place: [70, 40] }],
    notes: [{ id: 'private-note', text: sentinel, at: [0, 0] }] } };
}
function resolved(input: SheetInputs, id: string, sheet = 1) {
  const row = issueContext({ ...input, settings: forSheet(input.settings, sheet - 1) }).sheet.dimensions.find(r => r.dim.id === id);
  assert.ok(row, id); return row;
}
function rawRadius(input: SheetInputs, sheet = 1): number {
  const row = resolved(input, 'radius', sheet);
  assert.ok(row.ok && row.kind === 'radius');
  assert.ok(Math.abs(row.value - 4) <= 1e-9, 'native authored R4 within 1e-9 mm absolute, not a rounded output');
  return row.value;
}
function direct(doc: StudioDoc, args: Record<string, unknown> = {}, supplied = inputs(doc)) {
  const before = structuredClone(doc), settingsBefore = structuredClone(supplied.settings);
  const result = readDrawingStack(doc, DRAWING_DIMENSIONS, args, supplied.settings, () => supplied);
  assert.ok(!('error' in result), JSON.stringify(result));
  assert.deepEqual(doc, before); assert.deepEqual(supplied.settings, settingsBefore);
  return result;
}
function rows(content: Record<string, unknown>): Record<string, unknown>[] {
  assert.ok(Array.isArray(content.dimensions)); return content.dimensions;
}
async function publicRead(doc: StudioDoc, args: Record<string, unknown>) {
  const before = structuredClone(doc), state = { doc, bodies: [], approvalRequired: true as const };
  const facade = await runTool(state, 'drawing', { action: 'dimensions', ...args }, noCommit);
  const dispatched = await dispatchTool(state, DRAWING_DIMENSIONS, args, noCommit);
  for (const result of [facade, dispatched]) {
    assert.equal(result.changed, false); assert.equal(result.state.doc, doc); assert.deepEqual(doc, before);
  }
  return { facade, dispatched };
}
// Reconstruct the pre-radius row/envelope contract, rather than comparing two possibly changed branches only.
function legacy(doc: StudioDoc, input: SheetInputs, diameters: boolean) {
  const width = resolved(input, 'width'); assert.ok(width.ok && width.kind === 'linear');
  const linear = { id: 'width', view: 'front', orientation: 'horizontal', authoredTolerance: { kind: 'symmetric', value: .1 },
    resolved: true, value: width.value, printed: dimensionLine(width, presetFor(input.settings)) };
  const diameter = resolved(input, 'hole'); assert.ok(diameter.ok && diameter.kind === 'diameter');
  assert.ok(Math.abs(diameter.value - 8) <= 1e-9);
  const lost = resolved(input, 'lost-diameter'); assert.ok(!lost.ok);
  return { content: {
    revision: digestOf([requirementEvidenceRevision(doc), 1]), sheet: 1, sheetName: sheetName(input.settings, 0),
    scope: drawingScopeOf(input.settings), unit: 'mm', printUnit: presetFor(input.settings).units,
    dimensions: diameters ? [
      { id: 'hole', view: 'top', kind: 'diameter', resolved: true, value: diameter.value },
      { ...linear, kind: 'linear' },
      { id: 'lost-diameter', view: 'top', kind: 'diameter', resolved: false, reason: lost.reason },
    ] : [linear],
  }, summary: diameters ? '3 linear and diameter drawing dimensions' : '1 linear drawing dimensions' };
}

test('omitted/false radius and existing diameter responses retain literal legacy bytes and summaries', () => {
  const doc = fixture(), input = inputs(doc);
  for (const diameters of [false, true]) {
    const args = diameters ? { include_diameters: true } : {};
    const expected = JSON.stringify(legacy(doc, input, diameters));
    assert.equal(JSON.stringify(direct(doc, args, input)), expected);
    assert.equal(JSON.stringify(direct(doc, { ...args, include_radii: false }, input)), expected);
    if (!diameters) assert.equal(JSON.stringify(direct(doc, { include_diameters: false, include_radii: false }, input)), expected);
  }
});

test('printable callouts include resolved radius and diameter marks on the selected sheet', () => {
  const doc = fixture();
  doc.drawing!.views = ['front'];
  doc.drawing!.sheets = [{ id: 'second', name: 'Top', views: ['top'] }];
  const input = inputs(doc);
  const ordinary = direct(doc, { sheet: 2 }, input);
  assert.deepEqual(direct(doc, { include_callouts: true }, input).content.callouts, []);
  assert.deepEqual(direct(doc, Object.assign(Object.create({ include_callouts: true }), { sheet: 2 }), input), ordinary);
  const included = direct(doc, { sheet: 2, include_callouts: true }, input);
  assert.equal(included.content.source, input.meta.source);
  assert.deepEqual(included.content.dimensions, ordinary.content.dimensions);
  assert.ok(Array.isArray(included.content.callouts));
  assert.deepEqual(included.content.callouts.map(({ id, view, kind }) => [id, view, kind]),
    [['radius', 'top', 'radius'], ['hole', 'top', 'diameter']]);
  assert.match(included.content.callouts[0].lines[0], /R[0-9]/);
  assert.match(included.content.callouts[1].lines[0], /Ø[0-9]/);
  assert.doesNotMatch(JSON.stringify(included.content.callouts), new RegExp(sentinel));
});

test('radius-only and both options are independent, ordered, and keep legacy linear fields', () => {
  const doc = fixture(), input = inputs(doc), ordinary = direct(doc, {}, input);
  const radius = direct(doc, { include_radii: true }, input), both = direct(doc, { include_diameters: true, include_radii: true }, input);
  assert.deepEqual(rows(radius.content).map(r => [r.id, r.kind]), [['radius', 'radius'], ['width', 'linear'], ['lost-radius', 'radius']]);
  assert.deepEqual(rows(both.content).map(r => [r.id, r.kind]), [['radius', 'radius'], ['hole', 'diameter'], ['width', 'linear'], ['lost-radius', 'radius'], ['lost-diameter', 'diameter']]);
  assert.equal(JSON.stringify(direct(doc, { include_diameters: false, include_radii: true }, input)), JSON.stringify(radius));
  for (const result of [radius, both]) {
    const tagged = rows(result.content).find(r => r.id === 'width')!;
    const untagged = { ...tagged }; delete untagged.kind;
    assert.deepEqual(untagged, rows(ordinary.content)[0]);
    assert.equal(result.content.revision, ordinary.content.revision);
  }
  assert.deepEqual(rows(radius.content)[0], { id: 'radius', view: 'top', kind: 'radius', resolved: true, value: rawRadius(input) });
  assert.deepEqual(rows(both.content).filter(r => r.kind !== 'radius'), legacy(doc, input, true).content.dimensions);
});

test('radius whitelist omits annotations, tolerances, count/basic, source metadata and free-note sentinel', () => {
  const doc = fixture(), base = inputs(doc), input: SheetInputs = { ...base, callout: () => sentinel };
  const annotatedHole = resolved(input, 'hole'); assert.ok(annotatedHole.ok); assert.match(annotatedHole.text, new RegExp(sentinel));
  const result = direct(doc, { include_radii: true, include_diameters: true }, input);
  assert.doesNotMatch(JSON.stringify(result.content), new RegExp(sentinel));
  const radius = rows(result.content).find(r => r.id === 'radius')!;
  assert.deepEqual(Object.keys(radius).sort(), ['id', 'kind', 'resolved', 'value', 'view']);
  assert.deepEqual(radius, { id: 'radius', view: 'top', kind: 'radius', resolved: true, value: rawRadius(input) });
  const lost = resolved(input, 'lost-radius'); assert.ok(!lost.ok);
  const unresolved = rows(result.content).find(r => r.id === 'lost-radius')!;
  assert.deepEqual(unresolved, { id: 'lost-radius', view: 'top', kind: 'radius', resolved: false, reason: lost.reason });
  assert.deepEqual(Object.keys(unresolved).sort(), ['id', 'kind', 'reason', 'resolved', 'view']);
  assert.equal(Object.hasOwn(unresolved, 'value'), false, 'unresolved is never fabricated as zero');
});

test('public facade/dispatcher agree, preserve legacy literal bytes, and never commit reads', async () => {
  const doc = fixture(), before = structuredClone(doc);
  for (const diameters of [false, true]) {
    const args = diameters ? { include_diameters: true } : {};
    const old = await publicRead(doc, args), no = await publicRead(doc, { ...args, include_radii: false });
    for (const pair of [old, no]) {
      assert.equal(pair.facade.isError, false, pair.facade.content); assert.equal(pair.dispatched.isError, false, pair.dispatched.content);
      assert.equal(pair.facade.content, pair.dispatched.content);
      assert.equal(pair.facade.content, JSON.stringify(legacy(doc, inputs(doc), diameters).content));
    }
  }
  for (const args of [{ include_radii: true }, { include_radii: true, include_diameters: true }]) {
    const pair = await publicRead(doc, args);
    assert.equal(pair.facade.isError, false, pair.facade.content); assert.equal(pair.dispatched.isError, false, pair.dispatched.content);
    assert.equal(pair.facade.content, pair.dispatched.content);
    assert.equal(pair.facade.content, JSON.stringify(direct(doc, args).content));
    assert.doesNotMatch(pair.facade.content, new RegExp(sentinel));
  }
  assert.deepEqual(doc, before);
});

test('malformed own radius booleans refuse before projection and through both public admission paths', async () => {
  const doc = fixture();
  for (const value of [undefined, null, 0, 1, 'true', 'false', [], {}]) {
    let projected = false;
    const result = readDrawingStack(doc, DRAWING_DIMENSIONS, { include_radii: value }, doc.drawing!, () => { projected = true; throw new Error('must reject before projection'); });
    assert.ok('error' in result); assert.match(result.error, /include_radii.*boolean/); assert.equal(projected, false);
    const pair = await publicRead(doc, { include_radii: value });
    assert.equal(pair.facade.isError, true); assert.equal(pair.dispatched.isError, true);
  }
  const extra = await publicRead(doc, { include_radii: true, arbitrary: true });
  assert.equal(extra.facade.isError, true); assert.equal(extra.dispatched.isError, true);
  const inherited = Object.create({ include_radii: true }) as Record<string, unknown>;
  assert.equal(JSON.stringify(direct(doc, inherited)), JSON.stringify(direct(doc)), 'only an own explicit option opts in');
});

test('sheet selection preserves envelope and order; sheet and source changes invalidate revision', () => {
  const doc = fixture(); doc.drawing!.sheets = [{ id: 'second', name: 'Top', views: ['top'] }];
  const first = direct(doc, { include_radii: true, sheet: 1 });
  assert.deepEqual(rows(first.content).map(r => r.id), ['width']);
  const input = inputs(doc), second = direct(doc, { include_radii: true, sheet: 2 }, input);
  assert.deepEqual(rows(second.content).map(r => r.id), ['radius', 'lost-radius']);
  assert.deepEqual(rows(second.content)[0], { id: 'radius', view: 'top', kind: 'radius', resolved: true, value: rawRadius(input, 2) });
  assert.equal(second.content.sheet, 2); assert.equal(second.content.sheetName, 'Top'); assert.deepEqual(second.content.scope, { kind: 'part' });
  assert.notEqual(second.content.revision, first.content.revision);
  assert.equal(second.content.revision, direct(doc, { sheet: 2 }).content.revision);
  const changed = structuredClone(doc); changed.drawing!.notes![0].text += ' changed';
  assert.notEqual(direct(changed, { include_radii: true, sheet: 2 }).content.revision, second.content.revision);
});

test('hidden-view radius retains the resolver reason without a value or view fallback', () => {
  const doc = fixture(); doc.drawing!.dimensions = doc.drawing!.dimensions.map(d => d.id === 'radius' ? { ...d, view: 'right' } : d);
  const input = inputs(doc), oracle = resolved(input, 'radius'); assert.ok(!oracle.ok); assert.match(oracle.reason, /not shown/);
  const row = rows(direct(doc, { include_radii: true }, input).content)[0];
  assert.deepEqual(row, { id: 'radius', view: 'right', kind: 'radius', resolved: false, reason: oracle.reason });
  assert.equal(Object.hasOwn(row, 'value'), false);
});

test('explicit top-level part scope and inch/dual/scale keep raw local model-mm radius', () => {
  const doc = fixture(), originalValue = rawRadius(inputs(doc));
  const child = starterDoc(); doc.instances = [{ id: 'p1', name: 'Synthetic child', doc: child, position: [100, 20, 0], rotation: [0, 0, 90], part: { id: 'child', rev: 'A', source: sentinel } }];
  for (const units of ['mm', 'inch'] as const) {
    const scoped: StudioDoc = { ...doc, drawing: { ...doc.drawing!, scope: { kind: 'part', part: 'p1' }, units, dual: true, scale: .5 } };
    const input = inputs(scoped), result = direct(scoped, { include_radii: true }, input), row = rows(result.content)[0];
    assert.deepEqual(result.content.scope, { kind: 'part', part: 'p1' }); assert.equal(result.content.unit, 'mm'); assert.equal(result.content.printUnit, units);
    assert.equal(row.value, rawRadius(input)); assert.equal(row.value, originalValue, 'placement and print scale/units do not rescale raw local model radius');
    assert.doesNotMatch(JSON.stringify(result.content), new RegExp(sentinel));
  }
});

test('invalid sheets and stale stack revisions refuse before projection without replacing the document', () => {
  const doc = fixture(), before = structuredClone(doc), listed = direct(doc, { include_radii: true });
  for (const sheet of [0, -1, 2, .5, NaN, Infinity, '1']) {
    let projected = false;
    const result = readDrawingStack(doc, DRAWING_DIMENSIONS, { include_radii: true, sheet }, doc.drawing!, () => { projected = true; throw new Error('invalid sheet must fail before projection'); });
    assert.ok('error' in result); assert.equal(projected, false);
  }
  const changed = structuredClone(doc); changed.drawing!.scale = .5;
  let projected = false;
  const stale = readDrawingStack(changed, DRAWING_TOLERANCE_STACK, { expectedRevision: listed.content.revision, terms: [{ id: 'width', sign: 1 }, { id: 'radius', sign: -1 }] }, changed.drawing!, () => { projected = true; throw new Error('stale revision must fail before projection'); });
  assert.ok('error' in stale); assert.match(stale.error, /changed|Read drawing.dimensions again/); assert.equal(projected, false); assert.deepEqual(doc, before);
});

test('stack rejects radius terms and rejects radius-list options even false before projection', async () => {
  const doc = fixture(), input = inputs(doc), listed = direct(doc, { include_radii: true });
  const args = { expectedRevision: listed.content.revision, terms: [{ id: 'width', sign: 1 }, { id: 'radius', sign: -1 }] };
  const result = readDrawingStack(doc, DRAWING_TOLERANCE_STACK, args, input.settings, () => input);
  assert.ok('error' in result); assert.match(result.error, /must be linear/);
  for (const include_radii of [false, true]) {
    const refused = readDrawingStack(doc, DRAWING_TOLERANCE_STACK, { ...args, include_radii }, input.settings, () => { throw new Error('stack options must fail before projection'); });
    assert.ok('error' in refused); assert.match(refused.error, /only supported|linear-only/);
    for (const [name, options] of [['drawing', { action: 'stack', ...args, include_radii }], [DRAWING_TOLERANCE_STACK, { ...args, include_radii }]] as const) {
      const out = await runTool({ doc, bodies: [] }, name, options, noCommit);
      assert.equal(out.isError, true); assert.equal(out.changed, false); assert.equal(out.state.doc, doc);
    }
  }
  const pair = await runTool({ doc, bodies: [] }, 'drawing', { action: 'stack', ...args }, noCommit);
  assert.equal(pair.isError, true); assert.match(pair.content, /must be linear/); assert.equal(pair.changed, false); assert.equal(pair.state.doc, doc);
});

test('describe advertises optional independent radius boolean only on dimensions, not stack', async () => {
  const doc = fixture();
  for (const action of ['dimensions', 'stack']) {
    const result = await runTool({ doc, bodies: [] }, 'describe', { tool: 'drawing', action }, noCommit);
    assert.equal(result.isError, false, result.content); assert.equal(result.changed, false); assert.equal(result.state.doc, doc);
    const described = JSON.parse(result.content);
    if (action === 'dimensions') {
      for (const key of ['include_radii', 'include_diameters']) {
        assert.equal(described.input.properties[key].type, 'boolean');
        assert.equal((described.input.required ?? []).includes(key), false);
      }
      assert.equal(described.input.additionalProperties, false);
    } else assert.equal(Object.hasOwn(described.input.properties, 'include_radii'), false);
  }
});
