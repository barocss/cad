// #251: Foreshortened radial dimension for large arcs whose true center lies far off-sheet.
// The true radius and true center always come from the original native circular edge;
// only the displayed leader start point (`origin`) is shortened with a fixed paper-mm Z-jog.
import type { DimView, DrawingDimension, XY } from './types';

export type OrthographicViewId = 'front' | 'top' | 'right';

export interface ForeshortenedRadius {
  /** Display start point in the view's model coordinates (mm). Never alters the measured radius. */
  origin: XY;
}

export interface ForeshortenedRadiusGeometry {
  /** Actual rim attachment point on the native circle/arc (sheet mm). */
  rim: XY;
  /** Display start point (sheet mm). */
  origin: XY;
  /** Unit radial direction from true center C toward rim (sheet coordinates, y-down). */
  radialDir: XY;
  /** Jogged leader polyline vertices from origin to rim (sheet mm); final segment lies strictly on the true radial ray. */
  polyline: readonly XY[];
  /** True when the dimension label lies outside the arc rim. */
  outside: boolean;
  /** Longer straight segment along the foreshortened leader for interior label placement. */
  labelSegment: readonly [XY, XY];
}

export type ForeshortenedRadiusCheck =
  | { ok: true; geometry: ForeshortenedRadiusGeometry }
  | { ok: false; reason: string };

export type DefaultForeshortenResult =
  | { ok: true; origin: XY }
  | { ok: false; reason: string };

export const FORESHORTEN_JOG_HALF_LEN = 1.4;
export const FORESHORTEN_JOG_AMP = 1.8;
export const FORESHORTEN_MAX_COORD = 1e7;

const ORTHO_VIEWS: readonly OrthographicViewId[] = ['front', 'top', 'right'];

export function isOrthographicView(view: DimView): view is OrthographicViewId {
  return (ORTHO_VIEWS as readonly string[]).includes(view);
}

export function foreshortenOk(raw: unknown): raw is ForeshortenedRadius {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const keys = Object.keys(raw);
  if (keys.length !== 1 || keys[0] !== 'origin') return false;
  const origin = (raw as { origin?: unknown }).origin;
  return Array.isArray(origin) && origin.length === 2
    && origin.every(v => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= FORESHORTEN_MAX_COORD);
}

export function foreshortenSupported(dim: DrawingDimension, scopeKind: 'part' | 'assembly'): boolean {
  return scopeKind === 'part' && dim.kind === 'radius' && !dim.auto && isOrthographicView(dim.view);
}

const sub = (a: XY, b: XY): XY => [a[0] - b[0], a[1] - b[1]];
const add = (a: XY, b: XY, k = 1): XY => [a[0] + b[0] * k, a[1] + b[1] * k];
const dot2 = (a: XY, b: XY): number => a[0] * b[0] + a[1] * b[1];
const unit = (v: XY): XY => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };
const round3 = (v: number): number => Math.round(v * 1000) / 1000 + 0;

/** Minimum paper-mm distance from rim to foreshortened origin so the jog stays clear of the arrowhead. */
export function minForeshortenSheetSpan(arrowLength: number): number {
  return arrowLength + 2 * FORESHORTEN_JOG_HALF_LEN + 6;
}

/**
 * Computes the foreshortened jogged leader in sheet coordinates (y-down).
 * Guarantees that `rim` lies on the true circle (`|rim - centerSheet| === radiusSheet`)
 * and the final segment arriving at `rim` runs strictly along the true radial ray `radialDir`.
 */
export function foreshortenGeometry(
  centerSheet: XY,
  radiusSheet: number,
  placeSheet: XY,
  originSheet: XY,
  arrowLength: number,
  attachedRim?: XY,
): ForeshortenedRadiusCheck {
  if (!Number.isFinite(radiusSheet) || radiusSheet <= 0) {
    return { ok: false, reason: 'The arc radius is not valid for foreshortening.' };
  }
  const toPlace = sub(placeSheet, centerSheet);
  const dist = Math.hypot(toPlace[0], toPlace[1]);
  const radialDir: XY = attachedRim ? unit(sub(attachedRim, centerSheet)) : dist > 1e-9 ? unit(toPlace) : [1, 0];
  const normal: XY = [-radialDir[1], radialDir[0]];
  const rim = attachedRim ?? add(centerSheet, radialDir, radiusSheet);

  const toOrigin = sub(originSheet, rim);
  const span = -dot2(toOrigin, radialDir);
  const perp = dot2(toOrigin, normal);
  const minSpan = minForeshortenSheetSpan(arrowLength);

  if (span < minSpan) {
    return { ok: false, reason: `The foreshortened origin must lie inside the arc at least ${Math.ceil(minSpan)} mm on paper from the rim.` };
  }
  if (span >= radiusSheet - 1) {
    return { ok: false, reason: 'The foreshortened origin must lie closer to the rim than the true center.' };
  }
  if (Math.abs(perp) > Math.max(radiusSheet * 0.5, 80)) {
    return { ok: false, reason: 'The foreshortened origin is too far off the radial line.' };
  }

  const midDist = Math.max(
    arrowLength + FORESHORTEN_JOG_HALF_LEN + 3,
    Math.min(span - FORESHORTEN_JOG_HALF_LEN - 2.5, span * 0.5),
  );
  let polyline: XY[];
  if (Math.abs(perp) < FORESHORTEN_JOG_AMP) {
    const startBreak = add(originSheet, radialDir, span - midDist - FORESHORTEN_JOG_HALF_LEN);
    const j1 = add(add(rim, radialDir, -(midDist + FORESHORTEN_JOG_HALF_LEN * 0.35)), normal, FORESHORTEN_JOG_AMP);
    const j2 = add(add(rim, radialDir, -(midDist - FORESHORTEN_JOG_HALF_LEN * 0.35)), normal, -FORESHORTEN_JOG_AMP);
    const j3 = add(rim, radialDir, -(midDist - FORESHORTEN_JOG_HALF_LEN));
    polyline = [originSheet, startBreak, j1, j2, j3, rim];
  } else {
    const k1 = add(originSheet, radialDir, span - midDist - FORESHORTEN_JOG_HALF_LEN);
    const k2 = add(rim, radialDir, -(midDist - FORESHORTEN_JOG_HALF_LEN));
    polyline = [originSheet, k1, k2, rim];
  }

  const firstSeg: [XY, XY] = [polyline[0], polyline[1]];
  const lastSeg: [XY, XY] = [polyline[polyline.length - 2], rim];
  const firstLen = Math.hypot(firstSeg[1][0] - firstSeg[0][0], firstSeg[1][1] - firstSeg[0][1]);
  const lastLen = Math.hypot(lastSeg[1][0] - lastSeg[0][0], lastSeg[1][1] - lastSeg[0][1]);
  const labelSegment: [XY, XY] = lastLen >= firstLen ? lastSeg : firstSeg;

  return {
    ok: true,
    geometry: {
      rim,
      origin: originSheet,
      radialDir,
      polyline,
      outside: dist > radiusSheet + 1,
      labelSegment,
    },
  };
}

/**
 * Computes an initial in-view foreshortened origin along the true radial ray (model view coordinates, mm).
 * Returns an explicit refusal when the arc is too small at the current sheet scale to foreshorten cleanly.
 */
export function defaultForeshortenOrigin(
  centerView: XY,
  radiusView: number,
  placeView: XY,
  scale: number,
  arrowLength: number,
): DefaultForeshortenResult {
  const radiusSheet = radiusView * scale;
  const minSpan = minForeshortenSheetSpan(arrowLength);
  if (!Number.isFinite(radiusSheet) || !Number.isFinite(scale) || scale <= 0 || radiusSheet <= minSpan + 2) {
    return { ok: false, reason: 'This arc is too small at the current sheet scale to foreshorten cleanly.' };
  }
  const toPlace = sub(placeView, centerView);
  const radialView: XY = Math.hypot(toPlace[0], toPlace[1]) > 1e-9 ? unit(toPlace) : [1, 0];
  const rimView = add(centerView, radialView, radiusView);
  const desiredSheetSpan = Math.min(radiusSheet - 2, Math.max(minSpan + 6, Math.min(24, radiusSheet * 0.35)));
  const originModelSpan = desiredSheetSpan / scale;
  return {
    ok: true,
    origin: [round3(rimView[0] - radialView[0] * originModelSpan), round3(rimView[1] - radialView[1] * originModelSpan)],
  };
}
