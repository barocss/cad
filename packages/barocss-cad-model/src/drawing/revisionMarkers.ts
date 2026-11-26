/**
 * Drawing revision change markers and deterministic paper border-grid zone/sheet tracking (D2022, #227).
 *
 * Scope:
 * - Paper-space revision markers (`DrawingRevisionMarker`) linked by revision label and stable sheet ID (`'S1'` for
 *   Sheet 1, `DrawingSheet.id` for later sheets).
 * - Deterministic paper border-grid zone contract in sheet mm inside the sheet's inner frame (invariant to zoom,
 *   drawing scale, projection, and mm/inch display units):
 *     - A4 landscape (297×210 mm, frame [10, 10, 287, 200]): 4 rows A–D (top→bottom) × 6 columns 1–6 (left→right).
 *     - A3 landscape (420×297 mm, frame [10, 10, 410, 287]): 6 rows A–F (top→bottom) × 8 columns 1–8 (left→right).
 * - Live current-marker summary (never an issued frozen snapshot; never fabricates date, by, eco, description, or
 *   revision approval). Explicit manual overrides (`manualSheets`, `manualZones`) are preserved across marker edits
 *   and auto-toggle cycles until explicitly reset.
 * - Deleting a revision row or deleting a sheet never silently relinks or reassigns markers; they are diagnosed as
 *   `REVISION_MARKER_ORPHAN` for explicit cleanup.
 */
import type { Mark } from './sheet';
import type { DrawingRevision } from './metadata';
import type { DrawingRevisionMarker, DrawingSettings, XY } from './types';
import { MARGIN, SHEETS } from './views';

export const FIRST_SHEET_ID = 'S1';
export const REVISION_MARKER_RADIUS_MM = 3.8;
export const REVISION_MARKER_ROW_LETTERS = 'ABCDEF';

export interface BorderGridSpec {
  readonly rows: number;
  readonly cols: number;
}

export const BORDER_GRIDS: Readonly<Record<'A4' | 'A3', BorderGridSpec>> = {
  A4: { rows: 4, cols: 6 },
  A3: { rows: 6, cols: 8 },
};

export interface RevisionMarkerSheetEntry {
  readonly id: string;
  readonly number: number;
  readonly size: 'A4' | 'A3';
}

export interface ResolvedRevisionMarkerOk {
  readonly ok: true;
  readonly marker: DrawingRevisionMarker;
  readonly sheetNumber: number;
  readonly zone: string;
}

export interface ResolvedRevisionMarkerErr {
  readonly ok: false;
  readonly marker: DrawingRevisionMarker;
  readonly code: 'REVISION_MARKER_ORPHAN' | 'REVISION_MARKER_OFF_SHEET';
  readonly reason: string;
}

export type ResolvedRevisionMarker = ResolvedRevisionMarkerOk | ResolvedRevisionMarkerErr;

export interface RevisionLocationSummary {
  readonly sheets: string | null;
  readonly zones: string | null;
  readonly autoSheetsText: string | null;
  readonly autoZonesText: string | null;
  readonly markerCount: number;
}

/** Inner sheet frame [x0, y0, x1, y1] in sheet mm for a given sheet size. */
export function sheetFrameFor(size: 'A4' | 'A3'): [number, number, number, number] {
  const [W, H] = SHEETS[size];
  return [MARGIN, MARGIN, W - MARGIN, H - MARGIN];
}

/**
 * Deterministic border-grid zone for a sheet-mm point inside the sheet frame.
 * Returns null if coordinates are non-finite or strictly outside the inner frame.
 * Boundary points on the inner frame edges clamp inclusively to the adjacent border zone.
 */
export function borderZoneFor(
  size: 'A4' | 'A3',
  at: XY,
  frame: readonly [number, number, number, number] = sheetFrameFor(size),
): string | null {
  if (!Number.isFinite(at[0]) || !Number.isFinite(at[1])) return null;
  const [fx0, fy0, fx1, fy1] = frame;
  if (at[0] < fx0 || at[0] > fx1 || at[1] < fy0 || at[1] > fy1) return null;
  const { rows, cols } = BORDER_GRIDS[size];
  const u = (at[0] - fx0) / (fx1 - fx0);
  const v = (at[1] - fy0) / (fy1 - fy0);
  const col = Math.min(cols - 1, Math.max(0, Math.floor(u * cols)));
  const row = Math.min(rows - 1, Math.max(0, Math.floor(v * rows)));
  return `${REVISION_MARKER_ROW_LETTERS[row]}${col + 1}`;
}

/** Stable sheet identifier for 0-based sheet index `k` ('S1' for sheet 1, DrawingSheet.id for later sheets). */
export function sheetIdForIndex(settings: Pick<DrawingSettings, 'sheets'>, k: number): string {
  return k === 0 ? FIRST_SHEET_ID : (settings.sheets?.[k - 1]?.id ?? FIRST_SHEET_ID);
}

/** Ordered list of all sheets with stable ID, 1-based sheet number, and paper size. */
export function sheetOrderOf(settings: Pick<DrawingSettings, 'sheet' | 'sheets' | 'sheetContext'>): RevisionMarkerSheetEntry[] {
  if (settings.sheetContext?.sheetEntries) return [...settings.sheetContext.sheetEntries];
  const out: RevisionMarkerSheetEntry[] = [{ id: FIRST_SHEET_ID, number: 1, size: settings.sheet }];
  (settings.sheets ?? []).forEach((sh, index) => {
    out.push({ id: sh.id, number: index + 2, size: sh.size ?? settings.sheet });
  });
  return out;
}

/** Allocates the next unused revision marker ID (`rm1`, `rm2`, …) across the whole drawing. */
export function newRevisionMarkerId(
  markers: readonly Pick<DrawingRevisionMarker, 'id'>[],
  reserved: readonly string[] = [],
): string {
  const used = new Set([...markers.map(m => m.id), ...reserved]);
  for (let i = 1; ; i++) {
    const id = `rm${i}`;
    if (!used.has(id)) return id;
  }
}

function compareZone(a: string, b: string): number {
  const rowDiff = a.charCodeAt(0) - b.charCodeAt(0);
  if (rowDiff !== 0) return rowDiff;
  return Number(a.slice(1)) - Number(b.slice(1));
}

/** Resolves the revision markers attached to the settings object (single-sheet or `forSheet`-scoped). */
export function resolveRevisionMarkers(settings: DrawingSettings): ResolvedRevisionMarker[] {
  const list = settings.revisionMarkers ?? [];
  if (!list.length) return [];
  const revisions = new Set((settings.revisions ?? []).map(r => r.revision));
  const entries = sheetOrderOf(settings);
  const bySheet = new Map(entries.map(e => [e.id, e]));
  return list.map(marker => {
    if (!revisions.has(marker.revision)) {
      return {
        ok: false,
        marker,
        code: 'REVISION_MARKER_ORPHAN',
        reason: `Revision ${marker.revision} is no longer in revision history.`,
      };
    }
    const entry = bySheet.get(marker.sheet);
    if (!entry) {
      return {
        ok: false,
        marker,
        code: 'REVISION_MARKER_ORPHAN',
        reason: `Sheet ${marker.sheet} no longer exists in this drawing.`,
      };
    }
    const zone = borderZoneFor(entry.size, marker.at);
    if (!zone) {
      return {
        ok: false,
        marker,
        code: 'REVISION_MARKER_OFF_SHEET',
        reason: `Marker ${marker.id} at (${Math.round(marker.at[0] * 10) / 10}, ${Math.round(marker.at[1] * 10) / 10}) lies outside the ${entry.size} sheet frame.`,
      };
    }
    return { ok: true, marker, sheetNumber: entry.number, zone };
  });
}

/**
 * Computes live per-revision `SHEETS` and `ZONES` summaries across all sheets of the drawing.
 * Presentation-only `hidden: true` markers keep their record and location summary; deleting a marker removes it.
 * Manual overrides (`manualSheets`, `manualZones`) always take precedence until explicitly cleared.
 */
export function revisionLocationSummaryMap(
  settings: Pick<DrawingSettings, 'sheet' | 'sheets' | 'revisions' | 'revisionMarkers' | 'sheetContext'>,
): Map<string, RevisionLocationSummary> {
  const out = new Map<string, RevisionLocationSummary>();
  const revisions = settings.revisions ?? [];
  if (!revisions.length) return out;
  const allMarkers = settings.sheetContext?.allRevisionMarkers ?? settings.revisionMarkers ?? [];
  const entries = sheetOrderOf(settings);
  const bySheet = new Map(entries.map(e => [e.id, e]));

  for (const rev of revisions) {
    const sheets = new Set<number>();
    const zones = new Set<string>();
    let markerCount = 0;
    for (const marker of allMarkers) {
      if (marker.revision !== rev.revision) continue;
      const entry = bySheet.get(marker.sheet);
      if (!entry) continue;
      const zone = borderZoneFor(entry.size, marker.at);
      if (!zone) continue;
      markerCount++;
      sheets.add(entry.number);
      zones.add(zone);
    }
    const autoSheetsText = sheets.size ? [...sheets].sort((a, b) => a - b).join(', ') : null;
    const autoZonesText = zones.size ? [...zones].sort(compareZone).join(', ') : null;
    out.set(rev.revision, {
      sheets: resolveRevisionSummaryCell(rev, 'sheets', autoSheetsText),
      zones: resolveRevisionSummaryCell(rev, 'zones', autoZonesText),
      autoSheetsText,
      autoZonesText,
      markerCount,
    });
  }
  return out;
}

function resolveRevisionSummaryCell(
  rev: DrawingRevision,
  field: 'sheets' | 'zones',
  autoText: string | null,
): string | null {
  if (field === 'sheets') {
    if (rev.manualSheets !== undefined) return rev.manualSheets;
    return rev.autoSheets === false ? null : autoText;
  }
  if (rev.manualZones !== undefined) return rev.manualZones;
  return rev.autoZones === false ? null : autoText;
}

/** Upright equilateral revision triangle mark centered at `marker.at` with the revision label inside. */
export function revisionMarkerMarks(marker: DrawingRevisionMarker): Mark[] {
  const [cx, cy] = marker.at;
  const r = REVISION_MARKER_RADIUS_MM;
  const halfBase = r * Math.cos(Math.PI / 6);
  const baseDrop = r * Math.sin(Math.PI / 6);
  const top: XY = [cx, cy - r];
  const right: XY = [cx + halfBase, cy + baseDrop];
  const left: XY = [cx - halfBase, cy + baseDrop];
  const textSize = marker.revision.length > 3 ? 1.5 : marker.revision.length > 2 ? 1.8 : 2.3;
  return [
    { kind: 'polyline', points: [top, right, left, top], pen: 'visible' },
    { kind: 'text', at: [cx, cy + 1.05], text: marker.revision, size: textSize, anchor: 'middle', bold: true },
  ];
}
