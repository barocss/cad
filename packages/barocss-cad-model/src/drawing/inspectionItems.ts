/**
 * Drawing inspection item numbering, baseline revision diffing, inspection table, and bounded CSV export (D2023, #225).
 *
 * Contract:
 * - Separates stable item identity (`id`), user-visible balloon number (`number`: integer 1..9999), and target
 *   dimension (`dim` + `targetKey` structural fingerprint).
 * - First scope: linear and diameter `DrawingDimension` targets, excluding `basic` (reference) dimensions. Dual
 *   dimensions attach ONE inspection item to the primary requirement (never duplicated).
 * - Detects target deletion, topology loss, basic-flag conversion, and dimension ID reuse / Auto-dimension
 *   replacement (`targetKey` mismatch) as explicit `lost` / `stale` states — never silently relinking to another
 *   dimension or dropping unresolved rows from the inspection list.
 * - Distinct from BOM item balloons: renders as a rounded stadium/pill badge (`data-inspection-item`).
 * - Explicit per-revision baseline records (`inspectionBaselines`) track `unchanged` / `changed` / `removed` /
 *   `reassigned` across revisions and warn when reusing a previously-issued number on a different requirement.
 * - Never fabricates measured actuals, PASS/FAIL verdicts, or guessed numeric limits for fit codes.
 */
import { purchaseCell } from '../bom/csvCell';
import { resolveDimension, type Resolved } from './dimensions';
import { dimensionLine, withShownText, type Mark } from './sheet';
import { sheetMap } from './sheets';
import { formatLength, presetFor, type StandardPreset } from './standard';
import type { TableContent } from './table';
import type {
  DrawingDimension,
  DrawingInspectionBaseline,
  DrawingInspectionItem,
  DrawingInspectionSnapshotEntry,
  DrawingSettings,
  DrawingViews,
  Tolerance,
  XY,
} from './types';

export const INSPECTION_NUMBER_MIN = 1;
export const INSPECTION_NUMBER_MAX = 9999;

export type InspectionItemStatus = 'ok' | 'lost' | 'stale';

export interface InspectionToleranceDetail {
  readonly kind: Tolerance['kind'] | 'none';
  readonly summary: string | null;
  readonly code: string | null;
  readonly lowerMm: number | null;
  readonly upperMm: number | null;
}

export interface ResolvedInspectionItem {
  readonly item: DrawingInspectionItem;
  readonly status: InspectionItemStatus;
  readonly reason: string | null;
  readonly sheetNumber: number | null;
  readonly view: string | null;
  readonly nominalMm: number | null;
  readonly displayText: string | null;
  readonly tolerance: InspectionToleranceDetail;
  readonly reusedFromRevision: string | null;
}

export type InspectionBaselineChangeKind = 'unchanged' | 'changed' | 'removed' | 'reassigned';

export interface InspectionBaselineDiffEntry {
  readonly number: number;
  readonly kind: InspectionBaselineChangeKind;
  readonly baselineId: string;
  readonly currentId: string | null;
  readonly detail: string;
}

export interface InspectionCsvResultOk {
  readonly ok: true;
  readonly csv: string;
  readonly rowCount: number;
}

export interface InspectionCsvResultErr {
  readonly ok: false;
  readonly error: string;
}

export type InspectionCsvResult = InspectionCsvResultOk | InspectionCsvResultErr;

/** Structural target fingerprint binding an inspection item to one dimension's geometry identity (prevents silent ID reuse). */
export function dimensionTargetKey(dim: DrawingDimension): string {
  if (dim.kind === 'linear') {
    return `linear:${dim.view}:${dim.orient}:${dim.a.at}:${dim.a.edge}:${dim.b.at}:${dim.b.edge}`;
  }
  if (dim.kind === 'diameter') {
    return `diameter:${dim.view}:${dim.edge}`;
  }
  return `${dim.kind}:${dim.view}`;
}

/** Whether a dimension is eligible for a new inspection item in v1 (linear/diameter, non-basic). */
export function inspectionItemEligible(dim: DrawingDimension): { ok: true } | { ok: false; reason: string } {
  if (dim.kind !== 'linear' && dim.kind !== 'diameter') {
    return { ok: false, reason: 'Inspection items currently support linear and diameter dimensions only.' };
  }
  if (dim.basic === true) {
    return { ok: false, reason: 'Basic (reference) dimensions cannot carry an inspection item.' };
  }
  return { ok: true };
}

/** Allocates the next unique internal item identity (`ii1`, `ii2`, …). */
export function newInspectionItemId(
  items: readonly Pick<DrawingInspectionItem, 'id'>[],
  baselines: readonly DrawingInspectionBaseline[] = [],
): string {
  const used = new Set<string>([
    ...items.map(i => i.id),
    ...baselines.flatMap(b => b.entries.map(e => e.id)),
  ]);
  for (let i = 1; ; i++) {
    const id = `ii${i}`;
    if (!used.has(id)) return id;
  }
}

/** Allocates the next unused positive integer display number, never automatically recycling retired baseline numbers. */
export function nextInspectionNumber(
  items: readonly Pick<DrawingInspectionItem, 'number'>[],
  baselines: readonly DrawingInspectionBaseline[] = [],
): number {
  let max = 0;
  for (const item of items) if (item.number > max) max = item.number;
  for (const b of baselines) for (const e of b.entries) if (e.number > max) max = e.number;
  return max + 1;
}

/** Strict validation for user-authored inspection item numbers. */
export function validateInspectionNumber(
  num: unknown,
  items: readonly Pick<DrawingInspectionItem, 'id' | 'number'>[],
  excludeId?: string,
): { ok: true; number: number } | { ok: false; reason: string } {
  if (typeof num !== 'number' || !Number.isInteger(num) || num < INSPECTION_NUMBER_MIN || num > INSPECTION_NUMBER_MAX) {
    return { ok: false, reason: `Inspection item number must be an integer from ${INSPECTION_NUMBER_MIN} to ${INSPECTION_NUMBER_MAX}.` };
  }
  if (items.some(i => i.id !== excludeId && i.number === num)) {
    return { ok: false, reason: `Inspection item number ${num} is already assigned on this drawing.` };
  }
  return { ok: true, number: num };
}

/** Returns the earliest baseline revision where `item.number` was assigned to a DIFFERENT requirement ID/target, or null. */
export function inspectionNumberReuseRevision(
  item: Pick<DrawingInspectionItem, 'id' | 'number' | 'targetKey'>,
  baselines: readonly DrawingInspectionBaseline[] = [],
): string | null {
  for (const b of baselines) {
    for (const entry of b.entries) {
      if (entry.number === item.number && (entry.id !== item.id || entry.targetKey !== item.targetKey)) {
        return b.revision;
      }
    }
  }
  return null;
}

const round6 = (v: number): number => Math.round(v * 1e6) / 1e6 + 0;

function toleranceDetail(nominalMm: number, tol: Tolerance | undefined, preset: StandardPreset): InspectionToleranceDetail {
  if (!tol) return { kind: 'none', summary: null, code: null, lowerMm: null, upperMm: null };
  if (tol.kind === 'symmetric') {
    return {
      kind: 'symmetric',
      summary: `±${formatLength(tol.value, preset)}`,
      code: null,
      lowerMm: round6(nominalMm - tol.value),
      upperMm: round6(nominalMm + tol.value),
    };
  }
  if (tol.kind === 'deviation') {
    const sign = (x: number) => (x >= 0 ? `+${formatLength(x, preset)}` : `-${formatLength(Math.abs(x), preset)}`);
    return {
      kind: 'deviation',
      summary: `${sign(tol.upper)} / ${sign(tol.lower)}`,
      code: null,
      lowerMm: round6(nominalMm + tol.lower),
      upperMm: round6(nominalMm + tol.upper),
    };
  }
  // Fit codes (e.g. H7): never fabricate numeric limits without an authoritative fit table lookup.
  return {
    kind: 'fit',
    summary: tol.code,
    code: tol.code,
    lowerMm: null,
    upperMm: null,
  };
}

function resolveOneItem(
  item: DrawingInspectionItem,
  dim: DrawingDimension | undefined,
  resolved: Resolved | undefined,
  sheetNumber: number | null,
  preset: StandardPreset,
  baselines: readonly DrawingInspectionBaseline[],
): ResolvedInspectionItem {
  const reusedFromRevision = inspectionNumberReuseRevision(item, baselines);
  if (!dim) {
    return {
      item,
      status: 'lost',
      reason: `Target dimension ${item.dim} was removed.`,
      sheetNumber: null,
      view: null,
      nominalMm: null,
      displayText: null,
      tolerance: { kind: 'none', summary: null, code: null, lowerMm: null, upperMm: null },
      reusedFromRevision,
    };
  }
  const eligible = inspectionItemEligible(dim);
  if (!eligible.ok) {
    return {
      item,
      status: 'stale',
      reason: eligible.reason,
      sheetNumber,
      view: dim.view,
      nominalMm: null,
      displayText: null,
      tolerance: { kind: 'none', summary: null, code: null, lowerMm: null, upperMm: null },
      reusedFromRevision,
    };
  }
  if (dimensionTargetKey(dim) !== item.targetKey) {
    return {
      item,
      status: 'stale',
      reason: `Dimension ${dim.id} now references different geometry (ID reused or replaced). Re-link or remove explicitly.`,
      sheetNumber,
      view: dim.view,
      nominalMm: null,
      displayText: null,
      tolerance: { kind: 'none', summary: null, code: null, lowerMm: null, upperMm: null },
      reusedFromRevision,
    };
  }
  if (!resolved || !resolved.ok) {
    return {
      item,
      status: 'lost',
      reason: resolved && !resolved.ok ? resolved.reason : `Target dimension ${dim.id} could not be resolved.`,
      sheetNumber,
      view: dim.view,
      nominalMm: null,
      displayText: null,
      tolerance: { kind: 'none', summary: null, code: null, lowerMm: null, upperMm: null },
      reusedFromRevision,
    };
  }
  const nominalMm = round6(resolved.kind === 'diameter' ? 2 * resolved.radius : resolved.value);
  const displayText = dimensionLine(resolved, preset);
  const tolerance = toleranceDetail(nominalMm, dim.tol, preset);
  return {
    item,
    status: 'ok',
    reason: null,
    sheetNumber,
    view: dim.view,
    nominalMm,
    displayText,
    tolerance,
    reusedFromRevision,
  };
}

/** Resolves inspection items owned by the current sheet (used for on-sheet badge rendering and issues). */
export function resolveInspectionItems(
  settings: DrawingSettings,
  resolvedDimensions: readonly Resolved[],
  preset: StandardPreset = presetFor(settings),
): ResolvedInspectionItem[] {
  const items = settings.inspectionItems ?? [];
  if (!items.length) return [];
  const byDim = new Map(settings.dimensions.map(d => [d.id, d]));
  const byResolved = new Map(resolvedDimensions.map(r => [r.dim.id, r]));
  const where = settings.sheetContext?.where;
  const baselines = settings.inspectionBaselines ?? [];
  const defaultSheet = settings.sheetContext?.n ?? 1;
  return [...items]
    .sort((a, b) => a.number - b.number || a.id.localeCompare(b.id))
    .map(item => {
      const dim = byDim.get(item.dim);
      const sheetNo = dim ? (where?.[dim.view] ?? defaultSheet) : null;
      return resolveOneItem(item, dim, byResolved.get(item.dim), sheetNo, preset, baselines);
    });
}

/**
 * Resolves ALL inspection items across ALL sheets of a drawing (for Sheet 1's INSPECTION LIST table,
 * baseline capture/diffing, and bounded CSV export).
 */
export function resolveAllInspectionItems(
  views: DrawingViews,
  settings: DrawingSettings,
  currentSheetResolved: readonly Resolved[] = [],
  preset: StandardPreset = presetFor(settings),
): ResolvedInspectionItem[] {
  const allItems = settings.sheetContext?.allInspectionItems ?? settings.inspectionItems ?? [];
  if (!allItems.length) return [];
  const allDims = settings.sheetContext?.allDimensions ?? settings.dimensions;
  const byDim = new Map(allDims.map(d => [d.id, d]));
  const byResolved = new Map(currentSheetResolved.map(r => [r.dim.id, r]));
  const whereMap = settings.sheetContext?.where;
  const computedMap = whereMap ? null : sheetMap(settings);
  const baselines = settings.inspectionBaselines ?? [];

  return [...allItems]
    .sort((a, b) => a.number - b.number || a.id.localeCompare(b.id))
    .map(item => {
      const dim = byDim.get(item.dim);
      let resolved = byResolved.get(item.dim);
      if (!resolved && dim && (dim.view === 'front' || dim.view === 'top' || dim.view === 'right' || dim.view === 'iso')) {
        const raw = resolveDimension(views, dim);
        resolved = raw.ok ? withShownText(raw, undefined, preset) : raw;
      }
      const sheetNo = dim ? (whereMap ? (whereMap[dim.view] ?? 1) : ((computedMap?.get(dim.view) ?? 0) + 1)) : null;
      return resolveOneItem(item, dim, resolved, sheetNo, preset, baselines);
    });
}

/** Captures an explicit non-destructive inspection baseline snapshot for the given revision label. */
export function captureInspectionBaseline(
  revision: string,
  resolvedItems: readonly ResolvedInspectionItem[],
): DrawingInspectionBaseline {
  const entries: DrawingInspectionSnapshotEntry[] = resolvedItems.map(r => ({
    id: r.item.id,
    number: r.item.number,
    dim: r.item.dim,
    targetKey: r.item.targetKey,
    nominalMm: r.nominalMm,
    text: r.displayText,
    toleranceSummary: r.tolerance.summary,
  }));
  return { revision, entries };
}

/** Compares an earlier recorded baseline against the current resolved inspection items. */
export function diffInspectionBaseline(
  baseline: DrawingInspectionBaseline,
  current: readonly ResolvedInspectionItem[],
): InspectionBaselineDiffEntry[] {
  const byId = new Map(current.map(r => [r.item.id, r]));
  const byNum = new Map(current.map(r => [r.item.number, r]));
  const out: InspectionBaselineDiffEntry[] = [];

  for (const prev of baseline.entries) {
    const sameId = byId.get(prev.id);
    if (!sameId) {
      const holder = byNum.get(prev.number);
      if (holder) {
        out.push({
          number: prev.number,
          kind: 'reassigned',
          baselineId: prev.id,
          currentId: holder.item.id,
          detail: `Number ${prev.number} was ${prev.id} (${prev.text ?? prev.dim}) in rev ${baseline.revision}, now assigned to ${holder.item.id} (${holder.displayText ?? holder.item.dim}).`,
        });
      } else {
        out.push({
          number: prev.number,
          kind: 'removed',
          baselineId: prev.id,
          currentId: null,
          detail: `Item ${prev.id} (#${prev.number}) from rev ${baseline.revision} was removed.`,
        });
      }
      continue;
    }
    const numberHolder = byNum.get(prev.number);
    if (sameId.item.number !== prev.number && numberHolder && numberHolder.item.id !== prev.id) {
      out.push({
        number: prev.number,
        kind: 'reassigned',
        baselineId: prev.id,
        currentId: numberHolder.item.id,
        detail: `Number ${prev.number} moved from ${prev.id} (now #${sameId.item.number}) to ${numberHolder.item.id}.`,
      });
      continue;
    }
    const changedNominal = prev.nominalMm !== sameId.nominalMm;
    const changedTol = prev.toleranceSummary !== sameId.tolerance.summary;
    const changedStatus = sameId.status !== 'ok';
    const changedNum = sameId.item.number !== prev.number;
    if (changedNominal || changedTol || changedStatus || changedNum) {
      const reasons: string[] = [];
      if (changedNum) reasons.push(`renumbered #${prev.number}→#${sameId.item.number}`);
      if (changedNominal) reasons.push(`nominal ${prev.nominalMm ?? '—'}→${sameId.nominalMm ?? '—'} mm`);
      if (changedTol) reasons.push(`tol ${prev.toleranceSummary ?? 'none'}→${sameId.tolerance.summary ?? 'none'}`);
      if (changedStatus) reasons.push(`status ${sameId.status}`);
      out.push({
        number: prev.number,
        kind: 'changed',
        baselineId: prev.id,
        currentId: sameId.item.id,
        detail: `Item ${prev.id}: ${reasons.join(', ')}.`,
      });
    } else {
      out.push({
        number: prev.number,
        kind: 'unchanged',
        baselineId: prev.id,
        currentId: sameId.item.id,
        detail: `Item ${prev.id} (#${prev.number}) unchanged.`,
      });
    }
  }
  return out;
}

/**
 * Distinct rounded stadium/pill inspection badge (visibly distinct from circular BOM balloons).
 * Centered at `center` (sheet mm), 5.2 mm tall with half-circle ends expanding for multi-digit numbers.
 */
export function inspectionItemMarks(center: XY, number: number): Mark[] {
  const label = String(number);
  const r = 2.6;
  const halfStraight = Math.max(1.2, (label.length - 1) * 1.15);
  const [cx, cy] = center;
  const lx = cx - halfStraight;
  const rx = cx + halfStraight;
  return [
    { kind: 'line', a: [lx, cy - r], b: [rx, cy - r], pen: 'visible' },
    { kind: 'line', a: [lx, cy + r], b: [rx, cy + r], pen: 'visible' },
    { kind: 'arc', center: [rx, cy], u: [r, 0], v: [0, r], t0: -Math.PI / 2, t1: Math.PI / 2, pen: 'visible' },
    { kind: 'arc', center: [lx, cy], u: [r, 0], v: [0, r], t0: Math.PI / 2, t1: (3 * Math.PI) / 2, pen: 'visible' },
    { kind: 'text', at: [cx, cy + 0.9], text: label, size: label.length > 3 ? 1.8 : 2.3, anchor: 'middle', bold: true },
  ];
}

/** Table content for the on-sheet `INSPECTION LIST` table (`from: 'inspection'`). */
export function inspectionTableContent(
  resolvedItems: readonly ResolvedInspectionItem[],
  preset: StandardPreset,
  title = 'INSPECTION LIST',
): TableContent {
  return {
    title,
    columns: [
      { key: 'number', label: 'NO', align: 'end' },
      { key: 'id', label: 'ID' },
      { key: 'sheet', label: 'SHEET', align: 'end' },
      { key: 'view', label: 'VIEW' },
      { key: 'nominal', label: `NOMINAL (${preset.units})`, align: 'end' },
      { key: 'tolerance', label: 'TOLERANCE' },
      { key: 'status', label: 'STATUS' },
    ],
    rows: resolvedItems.map(r => [
      String(r.item.number),
      r.item.id,
      r.sheetNumber !== null ? String(r.sheetNumber) : null,
      r.view ? r.view.toUpperCase() : null,
      r.nominalMm !== null ? formatLength(r.nominalMm, preset) : null,
      r.tolerance.summary,
      r.status === 'ok' ? (r.reusedFromRevision ? `REUSED (REV ${r.reusedFromRevision})` : 'CURRENT') : r.status.toUpperCase(),
    ]),
  };
}

/**
 * Bounded inspection list CSV export with spreadsheet-formula protection (`purchaseCell`).
 * Preserves native numeric mm values separately from display text/units; never fabricates actuals, PASS/FAIL,
 * or guessed numeric limits for fit codes.
 */
export function inspectionListCsv(
  title: string,
  settings: DrawingSettings,
  resolvedItems: readonly ResolvedInspectionItem[],
  preset: StandardPreset = presetFor(settings),
): InspectionCsvResult {
  if (!resolvedItems.length) {
    return { ok: false, error: 'Add at least one inspection item before exporting an inspection CSV.' };
  }
  const rows: (string | number | null)[][] = [[
    'report_scope',
    'drawing_title',
    'revision',
    'item_id',
    'item_number',
    'dim_id',
    'sheet',
    'view',
    'nominal_mm',
    'display_unit',
    'display_text',
    'tolerance_kind',
    'tolerance_code',
    'lower_mm',
    'upper_mm',
    'status',
    'reused_from_revision',
    'status_reason',
  ]];
  for (const r of resolvedItems) {
    rows.push([
      'non-issued-inspection-list',
      title,
      settings.revision ?? '',
      r.item.id,
      r.item.number,
      r.item.dim,
      r.sheetNumber,
      r.view ?? '',
      r.nominalMm,
      preset.units,
      r.displayText ?? '',
      r.tolerance.kind,
      r.tolerance.code ?? '',
      r.tolerance.lowerMm,
      r.tolerance.upperMm,
      r.status,
      r.reusedFromRevision ?? '',
      r.reason ?? '',
    ]);
  }
  return {
    ok: true,
    csv: rows.map(row => row.map(purchaseCell).join(',')).join('\r\n') + '\r\n',
    rowCount: resolvedItems.length,
  };
}
