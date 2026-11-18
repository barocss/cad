import test from 'node:test';
import assert from 'node:assert/strict';
import { currentSheetDimensionsCsv } from '../src/drawing/currentSheetDimensionsCsv';
import { defaultDrawing, type DrawingSettings, type DrawingDimension } from '../src/drawing/types';
import type { Resolved } from '../src/drawing/dimensions';
import { dimensionLine } from '../src/drawing/sheet';
import { presetFor } from '../src/drawing/standard';
import { forSheet } from '../src/drawing/sheets';
const point = { edge: 'edge', at: 'end' as const, near: [0, 0, 0] as [number, number, number] };
function fixture() {
  const dimensions: DrawingDimension[] = [
    { id: 'width', kind: 'linear', view: 'front', orient: 'horizontal', a: point, b: point, place: [0, 0], tol: { kind: 'symmetric', value: .254 } },
    { id: 'height', kind: 'linear', view: 'front', orient: 'vertical', a: point, b: point, place: [0, 0], tol: { kind: 'deviation', upper: .508, lower: -.254 }, basic: true, count: 2 },
    { id: 'outer', kind: 'diameter', view: 'top', edge: 'circle', near: [0, 0, 0], place: [0, 0], tol: { kind: 'fit', code: 'H7' } },
    { id: 'lost', kind: 'linear', view: 'front', orient: 'horizontal', a: point, b: point, place: [0, 0] },
  ];
  const settings: DrawingSettings = { ...defaultDrawing(), scope: { kind: 'part' }, units: 'inch', dual: true, dimensions };
  const resolved: Resolved[] = [
    { ok: true, kind: 'linear', dim: dimensions[0] as Extract<DrawingDimension, { kind: 'linear' }>, a: [0, 0], b: [25.4, 0], value: 25.4, text: '1.000', alt: '25.400' },
    { ok: true, kind: 'linear', dim: dimensions[1] as Extract<DrawingDimension, { kind: 'linear' }>, a: [0, 0], b: [0, 25.4], value: 25.4, text: '2× 1.000', alt: '2× 25.400', shownPrecision: { inch: 3, mm: 3 } },
    { ok: true, kind: 'diameter', dim: dimensions[2] as Extract<DrawingDimension, { kind: 'diameter' }>, center: [0, 0], radius: 12.7, value: 25.4, text: 'Ø1.000', alt: 'Ø25.400' },
    { ok: false, dim: dimensions[3], reason: 'Its edge is not visible in this view.' },
  ];
  return { settings, wholeSettings: settings, resolved, sheetNumber: 1 };
}
// Independent small RFC-style CSV parser, including quoted comma/newline/doubled quote cells.
function parse(text: string): Record<string, string>[] {
  const rows: string[][] = []; let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') { if (quoted && text[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; }
    else if (!quoted && c === ',') { row.push(cell); cell = ''; }
    else if (!quoted && c === '\r' && text[i + 1] === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i++; }
    else cell += c;
  }
  assert.equal(quoted, false); assert.equal(cell, ''); assert.equal(row.length, 0);
  const header = rows.shift()!; return rows.map(cells => { assert.equal(cells.length, header.length); return Object.fromEntries(header.map((key, i) => [key, cells[i]])); });
}
function success(f = fixture()) { const r = currentSheetDimensionsCsv(f); assert.ok(r.ok, r.ok ? '' : r.error); return r; }
function refused(f: ReturnType<typeof fixture>) { const r = currentSheetDimensionsCsv(f); assert.equal(r.ok, false); assert.equal(Object.hasOwn(r, 'csv'), false); }

test('current non-issued CSV preserves mm, existing dual printed text and authored tolerance fields', () => {
  const f = fixture(), before = structuredClone(f), r = success(f), rows = parse(r.csv);
  assert.equal(r.rowCount, 4); assert.deepEqual(rows.map(x => x.dimension_id), ['width', 'height', 'outer', 'lost']);
  rows.slice(0, 3).forEach((row, i) => { assert.equal(row.model_value_mm, '25.4'); const resolved = f.resolved[i]; assert.ok(resolved.ok); assert.equal(row.printed, dimensionLine(resolved, presetFor(f.settings))); assert.equal(row.print_unit, 'inch'); assert.equal(row.dual, 'true'); });
  assert.equal(rows[0].tolerance_value_mm, '0.254'); assert.equal(rows[1].tolerance_upper_mm, '0.508'); assert.equal(rows[1].tolerance_lower_mm, '-0.254');
  assert.equal(rows[1].basic, 'true'); assert.equal(rows[1].count, '2'); assert.equal(rows[0].count, '');
  assert.equal(rows[2].tolerance_code, 'H7'); assert.equal(rows[2].tolerance_upper_mm, ''); assert.equal(rows[2].tolerance_lower_mm, '');
  assert.equal(rows[3].state, 'unresolved'); assert.equal(rows[3].model_value_mm, ''); assert.equal(rows[3].printed, ''); assert.equal(rows[3].reason, 'Its edge is not visible in this view.');
  assert.ok(rows.every(row => row.report_scope === 'non-issued-current-sheet' && row.sheet_number === '1'));
  assert.deepEqual(f, before);
});

test('pre-resolved hidden right-view input preserves unresolved rows without invented numbers', () => {
  // Serializer-only fixture: does not claim the actual resolver generated these diagnostics.
  const f = fixture(); f.settings.views = ['front', 'top'];
  for (const dim of f.settings.dimensions) if (dim.view === 'front') dim.view = 'right';
  f.resolved = f.resolved.map(r => r.dim.view === 'right' ? { ok: false, dim: r.dim, reason: 'Its view (right) is not shown.' } : r);
  const rows = parse(success(f).csv), hidden = rows.filter(row => row.view === 'right');
  assert.equal(hidden.length, 3);
  for (const row of hidden) { assert.equal(row.state, 'unresolved'); assert.equal(row.model_value_mm, ''); assert.equal(row.printed, ''); assert.equal(row.reason, 'Its view (right) is not shown.'); }
  const top = rows.find(row => row.view === 'top')!;
  assert.equal(top.state, 'resolved'); assert.equal(top.model_value_mm, '25.4'); assert.ok(top.printed.includes('H7'));
});

test('global identity validation rejects empty or duplicate IDs, including another sheet', () => {
  for (const id of ['', '   ', 'width']) { const f = fixture(); f.settings.dimensions[3].id = id; refused(f); }
  const f = fixture(); f.settings.sheets = [{ id: 'side', name: 'PRIVATE_SHEET_NAME', views: ['right'] }];
  f.settings.dimensions.push({ ...f.settings.dimensions[0], id: 'width', view: 'right' });
  f.settings = forSheet(f.wholeSettings, 0); refused(f);
});

test('sheet membership, result ownership/order and unsupported profiles fail without partial CSV', () => {
  for (const view of ['section:A', 'detail:D', 'iso'] as const) { const f = fixture(); f.settings.dimensions[0].view = view; refused(f); }
  const radius = fixture(); radius.settings.dimensions[2] = { ...radius.settings.dimensions[2], kind: 'radius' } as DrawingDimension; radius.resolved[2] = { ok: false, dim: radius.settings.dimensions[2], reason: 'Unsupported' }; refused(radius);
  const missing = fixture(); missing.resolved.pop(); refused(missing);
  const cloned = fixture(); cloned.resolved[0] = { ...cloned.resolved[0], dim: { ...cloned.resolved[0].dim } } as Resolved; refused(cloned);
  const swapped = fixture(); swapped.resolved.reverse(); refused(swapped);
  for (const scope of [{ kind: 'assembly' }, { kind: 'part', part: 'p1' }, { kind: 'part', body: { key: 'b1', feature: 'n1', kind: 'extrude' } }] as const) { const f = fixture(); f.settings.scope = scope; refused(f); }
  for (const sheetNumber of [0, 2, 1.5, NaN]) refused({ ...fixture(), sheetNumber });
  const broken = fixture(); broken.settings.breaks = [{ axis: 'x', from: 1, to: 2 }]; refused(broken);
});

test('finite values and valid tolerance whitelist are required; unknown metadata never leaks', () => {
  for (const tol of [{ kind: 'symmetric', value: NaN }, { kind: 'deviation', upper: 0, lower: 1 }, { kind: 'fit', code: '=PRIVATE' }, { kind: 'symmetric', value: .1, source: 'PRIVATE_SOURCE' }]) { const f = fixture(); f.settings.dimensions[0].tol = tol as DrawingDimension['tol']; refused(f); }
  const invalid = fixture(); const r = invalid.resolved[0]; assert.ok(r.ok); r.value = Infinity; refused(invalid);
  const f = fixture(); Object.assign(f.settings, { title: 'PRIVATE_TITLE', revision: 'PRIVATE_REVISION', notes: [{ text: 'PRIVATE_NOTE' }] }); Object.assign(f.settings.dimensions[0], { source: 'PRIVATE_SOURCE' });
  const csv = success(f).csv; assert.doesNotMatch(csv, /PRIVATE/); assert.equal(csv.includes('sheet_name'), false); assert.equal(csv.includes('revision'), false);
});

test('text cells use existing formula/control protection, while numeric deviations stay numeric', () => {
  for (const id of ['=SUM(1,2)', '\t+formula', '＝formula', '＠formula', '－formula', 'quoted,"id"\nline']) {
    const f = fixture(); f.settings.dimensions[0].id = id; const lost = f.resolved[3]; assert.ok(!lost.ok); lost.reason = '\t=PRIVATE_SYNTHETIC_FORMULA';
    const rows = parse(success(f).csv); assert.equal(rows[0].dimension_id, /^[=\t＝＠－]/.test(id) ? "'" + id : id); assert.equal(rows[3].reason, "'\t=PRIVATE_SYNTHETIC_FORMULA"); assert.equal(rows[1].tolerance_lower_mm, '-0.254');
  }
});

test('second sheet uses its own retained objects; empty current sheet gives headers only', () => {
  const f = fixture(); f.settings.sheets = [{ id: 'second', name: 'PRIVATE_SECOND', views: ['top'] }];
  f.settings = forSheet(f.wholeSettings, 1); f.resolved = f.resolved.filter(r => r.dim.view === 'top'); f.sheetNumber = 2;
  const rows = parse(success(f).csv); assert.equal(rows.length, 1); assert.equal(rows[0].dimension_id, 'outer'); assert.equal(rows[0].sheet_number, '2');
  const empty = fixture(); empty.settings.dimensions = []; empty.resolved = []; assert.deepEqual(parse(success(empty).csv), []);
});
