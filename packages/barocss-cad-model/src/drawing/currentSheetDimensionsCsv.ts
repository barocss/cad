import { purchaseCell } from '../bom/csvCell';
import type { Resolved } from './dimensions';
import { drawingScopeOf } from './scope';
import { dimensionLine } from './sheet';
import { forSheet, sheetCount } from './sheets';
import { presetFor } from './standard';
import type { DrawingSettings, Tolerance } from './types';

export interface CurrentSheetDimensionsCsvInput {
  resolved: readonly Resolved[];
  settings: DrawingSettings;
  wholeSettings: DrawingSettings;
  /** One-based current sheet, not a persisted inspection identity. */
  sheetNumber: number;
}
export type CurrentSheetDimensionsCsvResult = { ok: true; csv: string; rowCount: number } | { ok: false; error: string };
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const fail = (error: string): CurrentSheetDimensionsCsvResult => ({ ok: false, error });
function toleranceValid(t: Tolerance): boolean {
  if (!t || typeof t !== 'object' || Array.isArray(t)) return false;
  const keys = Object.keys(t);
  if (t.kind === 'symmetric') return keys.every(k => k === 'kind' || k === 'value') && finite(t.value) && t.value > 0;
  if (t.kind === 'deviation') return keys.every(k => k === 'kind' || k === 'upper' || k === 'lower') && finite(t.upper) && finite(t.lower) && t.upper >= t.lower;
  return t.kind === 'fit' && keys.every(k => k === 'kind' || k === 'code') && typeof t.code === 'string' && /^[A-Za-z]{1,2}\d{1,2}$/.test(t.code);
}
/** Current, non-issued requirements only. Caller owns projection/document currentness and file delivery. */
export function currentSheetDimensionsCsv(input: CurrentSheetDimensionsCsvInput): CurrentSheetDimensionsCsvResult {
  try { return serialize(input); }
  catch { return fail('Current-sheet dimensions contain unsupported data; no CSV was produced.'); }
}
function serialize({ resolved, settings, wholeSettings, sheetNumber }: CurrentSheetDimensionsCsvInput): CurrentSheetDimensionsCsvResult {
  for (const source of [settings, wholeSettings]) {
    const scope = drawingScopeOf(source);
    if (scope.kind !== 'part' || scope.part !== undefined || scope.body !== undefined) return fail('Dimension CSV supports the whole base part only, not assembly, placed-part or selected-body drawings.');
  }
  if (!Number.isSafeInteger(sheetNumber) || sheetNumber < 1 || sheetNumber > sheetCount(wholeSettings)) return fail('Select a current drawing sheet before exporting dimensions.');
  const ids = new Set<string>();
  for (const dim of wholeSettings.dimensions) {
    if (typeof dim.id !== 'string' || !dim.id.trim() || ids.has(dim.id)) return fail('Drawing dimension IDs must be nonempty and unique across all sheets.');
    ids.add(dim.id);
  }
  const expected = forSheet(wholeSettings, sheetNumber - 1).dimensions;
  if (settings.dimensions.length !== expected.length || resolved.length !== expected.length
    || expected.some((dim, i) => settings.dimensions[i] !== dim || resolved[i]?.dim !== dim)) return fail('Dimension results do not belong to the current sheet settings. Refresh the drawing before exporting.');
  if (settings.breaks?.length) return fail('Dimension CSV currently supports ordinary unbroken front, top and right views only.');
  const preset = presetFor(settings);
  const rows: (string | number | null)[][] = [['report_scope', 'sheet_number', 'dimension_id', 'kind', 'view', 'orientation', 'state', 'model_value_mm', 'printed', 'print_unit', 'dual', 'basic', 'count', 'tolerance_kind', 'tolerance_value_mm', 'tolerance_upper_mm', 'tolerance_lower_mm', 'tolerance_code', 'reason']];
  for (const r of resolved) {
    const d = r.dim;
    if (!['front', 'top', 'right'].includes(d.view) || (d.kind !== 'linear' && d.kind !== 'diameter')) return fail('Dimension CSV supports only linear and diameter dimensions in ordinary front, top and right views; no dimensions were omitted.');
    if (d.kind === 'linear' && !['horizontal', 'vertical', 'aligned'].includes(d.orient)) return fail('A linear dimension has an unsupported orientation.');
    if (d.basic !== undefined && typeof d.basic !== 'boolean' || d.count !== undefined && (!Number.isInteger(d.count) || d.count < 2 || d.count > 999)) return fail('A dimension has unsupported basic or count data.');
    const tol = d.tol;
    if (tol !== undefined && !toleranceValid(tol)) return fail('A dimension has unsupported authored tolerance data.');
    if (r.ok && (r.kind !== d.kind || !finite(r.value) || r.value < 0 || typeof r.text !== 'string' || r.alt !== undefined && typeof r.alt !== 'string')) return fail('A dimension has an invalid resolved value or display text.');
    if (!r.ok && typeof r.reason !== 'string') return fail('An unresolved dimension has no diagnostic reason.');
    const printed = r.ok ? dimensionLine(r, preset) : '';
    rows.push(['non-issued-current-sheet', sheetNumber, d.id, d.kind, d.view, d.kind === 'linear' ? d.orient : '', r.ok ? 'resolved' : 'unresolved', r.ok ? r.value : null, printed,
      preset.units, preset.dual ? 'true' : 'false', d.basic === true ? 'true' : 'false', d.count ?? null, tol?.kind ?? '',
      tol?.kind === 'symmetric' ? tol.value : null, tol?.kind === 'deviation' ? tol.upper : null, tol?.kind === 'deviation' ? tol.lower : null, tol?.kind === 'fit' ? tol.code : '', r.ok ? '' : r.reason]);
  }
  return { ok: true, csv: rows.map(row => row.map(purchaseCell).join(',')).join('\r\n') + '\r\n', rowCount: resolved.length };
}
