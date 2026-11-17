import test from 'node:test';
import assert from 'node:assert/strict';
import { fitDimensionTable, type FitListContext } from '../src/drawing/fitList';
import { emptyDoc, type StudioDoc } from '../src/engine/doc';
import { defaultDrawing, type DrawingDimension, type DrawingSettings } from '../src/drawing/types';
import type { Resolved } from '../src/drawing/dimensions';
import { tableContent } from '../src/drawing/tables';
import { commands, type Ctx } from '../src/app/commands';
import { drawingInputs } from '../src/chat/drawing';
import { issueContext } from '../src/drawing/issues';
import { sheetSvg } from '../src/io/svg';
import { sheetDxf } from '../src/io/dxf';

const table = { id: 'shop', sources: [{ id: 's1', label: 'Own trial data' }], rows: [{ class: 'H7', over: 10, upTo: 18, upper: 0.018, lower: 0, source: 's1' }, { class: 'g6', over: 10, upTo: 18, upper: -0.006, lower: -0.017, estimate: true }] };
function fixture(pair = true) {
  const doc: StudioDoc = { ...emptyDoc(), fits: { version: 1, tables: [structuredClone(table)], faces: [{ face: 'n1.bore', class: 'H7' }, { face: 'n3.side', class: 'g6' }], ...(pair ? { pairs: [{ hole: 'n1.bore', shaft: 'n3.side' }] } : {}) } };
  const dim: DrawingDimension = { id: 'd1', kind: 'diameter', view: 'top', edge: 'n1.bore|n1.top', near: [0, 0, 0], place: [10, 10], count: 3 };
  const settings = { ...defaultDrawing(), dimensions: [dim] };
  const resolved: Resolved[] = [{ ok: true, kind: 'diameter', dim, center: [0, 0], radius: 6, value: 12, text: '12' }];
  const context: FitListContext = { settings, wholeSettings: settings, resolved };
  return { doc, context, dim };
}
const ok = (doc: StudioDoc, c: FitListContext) => { const r = fitDimensionTable(doc, c); assert.ok(!('error' in r), JSON.stringify(r)); return r; };
const error = (doc: StudioDoc, c: FitListContext, pattern: RegExp) => { const r = fitDimensionTable(doc, c); assert.ok('error' in r); assert.match(r.error, pattern); };

test('one row per stable dimension, paired exact source provenance and authored multiplier, no mutation', () => {
  const { doc, context, dim } = fixture(), before = structuredClone({ doc, context });
  const result = ok(doc, context);
  assert.deepEqual(result.rows[0], ['d1 (top)', '3', '12', 'H7/g6 (+0.018/0, -0.006/-0.017) (est.)', 'H7: shop row 1; g6: shop row 2 (estimate)']);
  assert.ok(result.notes?.some(n => n.includes('n1.bore|n1.top') && n.includes('n3.side')));
  assert.ok(result.notes?.some(n => n === 'shop row 1: s1'));
  assert.deepEqual({ doc, context }, before);
  const d2 = { ...dim, id: 'd2' }, r2 = { ...context.resolved[0], dim: d2 } as Resolved;
  const c = { ...context, settings: { ...context.settings, dimensions: [d2, dim] }, resolved: [r2, context.resolved[0]] };
  assert.deepEqual(ok(doc, c).rows.map(r => r[0]), ['d2 (top)', 'd1 (top)']);
});

test('inch and dual preserve safe fit formatting without generic table double conversion', () => {
  const { doc, context } = fixture();
  for (const units of ['mm', 'inch'] as const) {
    const c = { ...context, settings: { ...context.settings, units, dual: true } };
    const out = ok(doc, c); assert.equal(String(out.rows[0][2]).includes('['), false); assert.match(String(out.rows[0][3]), /H7\/g6/);
    assert.ok(out.notes?.some(n => /Primary units only/.test(n)));
    assert.equal(out.columns.some(x => x.unit), false);
    assert.match(out.columns[2].label, units === 'mm' ? /mm/ : /inch/);
  }
});

test('current diameter and replaced rows recompute; missing/out-of-range data refuses rather than old rows', () => {
  const { doc, context } = fixture(false), changed = structuredClone(doc);
  changed.fits!.tables![0] = { ...table, rows: [{ ...table.rows[0], upper: 0.012 }] };
  assert.match(String(ok(changed, context).rows[0][3]), /\+0.012\/0/);
  const r = context.resolved[0]; assert.ok(r.ok && r.kind === 'diameter');
  assert.equal(ok(doc, { ...context, resolved: [{ ...r, value: 13, radius: 6.5 }] }).rows[0][2], '13');
  error(doc, { ...context, resolved: [{ ...r, value: 19, radius: 9.5 }] }, /no row/);
  error({ ...doc, fits: { ...doc.fits!, tables: [] } }, context, /no row/);
});

test('scope and full-document boundaries fail closed', () => {
  const { doc, context } = fixture();
  assert.ok('error' in fitDimensionTable(doc));
  for (const scope of [{ kind: 'assembly' as const }, { kind: 'part' as const, part: 'p1' }]) error(doc, { ...context, wholeSettings: { ...context.wholeSettings, scope } }, /base part/);
  error(doc, { ...context, wholeSettings: { ...context.wholeSettings, sheets: [{ id: 's2', views: ['top'] }] } }, /single sheet/);
  error(doc, { ...context, resolved: [] }, /belong/);
  error(doc, { ...context, resolved: context.resolved.map(r => ({ ...r, dim: { ...r.dim } }) as Resolved) }, /belong/);
});

test('hidden/lost references, duplicate IDs, ambiguous face or pair and unsupported families refuse', () => {
  const { doc, context, dim } = fixture();
  error(doc, { ...context, resolved: [{ ok: false, dim, reason: 'Its view (top) is not shown.' }] }, /not shown/);
  error(doc, { ...context, settings: { ...context.settings, dimensions: [dim, dim] }, resolved: [context.resolved[0], context.resolved[0]] }, /unique/);
  error({ ...doc, fits: { ...doc.fits!, faces: [...doc.fits!.faces!, { face: 'n1.top', class: 'H7' }] } }, context, /ambiguous/);
  error({ ...doc, fits: { ...doc.fits!, pairs: [...doc.fits!.pairs!, ...doc.fits!.pairs!] } }, context, /ambiguous/);
  for (const view of ['iso', 'section:A', 'detail:B'] as const) {
    const d = { ...dim, view }, c = { ...context, settings: { ...context.settings, dimensions: [d] }, resolved: [{ ...context.resolved[0], dim: d } as Resolved] };
    error(doc, c, /ordinary-view/);
  }
  const d = { ...dim, kind: 'radius' as const }, r = context.resolved[0]; assert.ok(r.ok && r.kind === 'diameter');
  error(doc, { ...context, settings: { ...context.settings, dimensions: [d] }, resolved: [{ ...r, kind: 'radius', dim: d }] }, /diameter/);
});

test('unclassed resolved dimensions produce explicitly empty scope, not fake quantities', () => {
  const { doc, context } = fixture();
  assert.deepEqual(ok({ ...doc, fits: undefined }, context).rows, []);
  assert.deepEqual(tableContent({ id: 'x', from: 'fits' }, { doc }), { error: 'Fit dimensions: the current resolved sheet and whole drawing settings are required' });
});

test('native tube diameter uses same-build resolved source in chat/sheet and memory SVG/DXF, no row snapshot saved', () => {
  const tube = commands.find(c => c.id === 'tube')!, blank: Ctx = { doc: emptyDoc(), bodies: [], selection: { faces: [], edges: [], bodies: [] } };
  const model = tube.build!(blank, { ...tube.defaults!(blank), r: 10, ri: 6, h: 24, x: 0, y: 0, z: 0 });
  const doc: StudioDoc = { ...model, fits: { version: 1, tables: [table], faces: [{ face: 'n1.hole0.side0', class: 'H7' }] } };
  const input = drawingInputs(doc); assert.ok(typeof input !== 'string');
  const edge = input.views.top.edges.find(e => e.kind === 'circle' && e.name.includes('n1.hole0.side0')); assert.ok(edge?.circle);
  const dimension: DrawingDimension = { id: 'fit1', kind: 'diameter', view: 'top', edge: edge.name, near: [...edge.circle.center] as [number, number, number], place: [20, 20] };
  const settings: DrawingSettings = { ...defaultDrawing(), sheet: 'A3', dimensions: [dimension], tables: [{ id: 'fits1', from: 'fits', at: [10, 10] }] };
  const authored = { ...doc, drawing: settings }, before = JSON.stringify(authored), inputs = drawingInputs(authored); assert.ok(typeof inputs !== 'string');
  const ctx = issueContext(inputs); assert.equal(ctx.sheet.tables?.[0].error, undefined);
  const texts = ctx.sheet.groups.filter(g => g.role === 'table').flatMap(g => g.marks.filter(m => m.kind === 'text').map(m => m.text));
  assert.ok(texts.some(t => t.includes('fit1 (top)'))); assert.ok(texts.some(t => t.includes('shop row 1')));
  assert.match(sheetSvg(ctx.sheet, 'fit list'), /shop row 1/); assert.match(sheetDxf(ctx.sheet, ctx.layout).text, /shop row 1/);
  assert.equal(JSON.stringify(authored), before); assert.equal(settings.tables![0].rows, undefined);
});

test('printed inch limits stay inside the authored zones and use original resolved nominal', () => {
  const { doc, context } = fixture(false), c = { ...context, settings: { ...context.settings, units: 'inch' as const } };
  const out = ok(doc, c), nominal = Number(out.rows[0][2]);
  const match = /H7 \(([^/]+)\/([^)]+)\)/.exec(String(out.rows[0][3])); assert.ok(match);
  // Independent decimal arithmetic in integer nanoinches, not the producer's formatter.
  const n = BigInt(Math.round(nominal * 1e9)), upper = BigInt(Math.round(Number(match[1]) * 1e9)), lower = BigInt(Math.round(Number(match[2]) * 1e9));
  assert.ok((n + upper) * 254n <= 12018n * 10000000n);
  assert.ok((n + lower) * 254n >= 12000n * 10000000n);
  const r = context.resolved[0]; assert.ok(r.ok && r.kind === 'diameter');
  const original = 12.000000000000002;
  const exact = { ...context, settings: { ...context.settings, precision: { mm: 6 } }, resolved: [{ ...r, value: original }] };
  const before = structuredClone(exact); ok(doc, exact); assert.deepEqual(exact, before);
});

test('pair/table deletion and malformed references refuse atomically; removing fits source restores ordinary table behavior', () => {
  const { doc, context } = fixture();
  error({ ...doc, fits: { ...doc.fits!, faces: doc.fits!.faces!.slice(0, 1) } }, context, /paired face/);
  error({ ...doc, fits: { ...doc.fits!, tables: [table, table] } }, context, /table IDs/);
  const instanceDoc: StudioDoc = { ...doc, instances: [{ id: 'p1', name: 'Part', doc: emptyDoc(), position: [0, 0, 0], rotation: [0, 0, 0] }] };
  error(instanceDoc, context, /placed instances/);
  assert.deepEqual(tableContent({ id: 'manual', columns: [{ key: 'a', label: 'A' }], rows: [[1]] }, { doc: instanceDoc }), { columns: [{ key: 'a', label: 'A' }], rows: [[1]] });
});
