// Jogged extension line geometry for manual orthographic linear drawing dimensions.
// Keeps true model reference endpoints (A/B), arrowhead tips (A2/B2), and measured values untouched.
import {
  DEFAULT_EXTENSION_JOG_AT,
  DEFAULT_EXTENSION_JOG_OFFSET,
  MAX_EXTENSION_JOG_AT,
  MAX_EXTENSION_JOG_OFFSET,
  MIN_EXTENSION_JOG_AT,
  MIN_EXTENSION_JOG_OFFSET,
  extensionJogAtOk,
  extensionJogOffsetOk,
  readLinearExtensionJog,
  type LinearExtensionJog,
  type XY,
} from './types';
export {
  DEFAULT_EXTENSION_JOG_AT,
  DEFAULT_EXTENSION_JOG_OFFSET,
  MAX_EXTENSION_JOG_AT,
  MAX_EXTENSION_JOG_OFFSET,
  MIN_EXTENSION_JOG_AT,
  MIN_EXTENSION_JOG_OFFSET,
  extensionJogAtOk,
  extensionJogOffsetOk,
  readLinearExtensionJog,
  type LinearExtensionJog,
};

/** Minimum usable extension length (from GAP to dimension line Q) required to render a clean jog in sheet mm. */
export const MIN_EXTENSION_JOG_RUN = 6;
const EXT_GAP = 1;
const EXT_OVER = 2;
const END_CLEAR = 1;

export interface ExtensionJogGeometry {
  /** Five connected straight segments forming the jogged extension path from P0 to P5 (through Q). */
  readonly segments: readonly (readonly [XY, XY])[];
  /** Midpoint of the laterally offset plateau segment (P2..P3) in sheet mm, used for the Studio drag handle. */
  readonly handle: XY;
  /** Unit vector along the extension line from model point P toward dimension line Q. */
  readonly extDir: XY;
  /** Unit vector perpendicular to extDir (along A2 -> B2) in which positive offset shifts the jog. */
  readonly lateralAxis: XY;
  /** Usable run length between P0 and Q in sheet mm. */
  readonly usableRun: number;
}

export type ExtensionJogResult =
  | { readonly ok: true; readonly geometry: ExtensionJogGeometry }
  | { readonly ok: false; readonly reason: string };

const add2 = (a: XY, b: XY, k = 1): XY => [a[0] + b[0] * k, a[1] + b[1] * k];
const sub2 = (a: XY, b: XY): XY => [a[0] - b[0], a[1] - b[1]];

/**
 * Compute the 5-segment jogged extension path from model reference `P` to dimension-line touchpoint `Q`
 * (overshooting by `EXT_OVER` mm), shifting laterally by `jog.offset` sheet mm along `axis` (unit A2 -> B2).
 * Every segment stays non-degenerate; returns `{ ok: false }` if the extension is too short or invalid.
 */
export function extensionJogGeometry(
  P: XY,
  Q: XY,
  axis: XY,
  jog: LinearExtensionJog,
): ExtensionJogResult {
  if (!extensionJogOffsetOk(jog.offset)) {
    return { ok: false, reason: 'Extension jog offset is outside the supported range.' };
  }
  const at = jog.at ?? DEFAULT_EXTENSION_JOG_AT;
  if (!extensionJogAtOk(at)) {
    return { ok: false, reason: 'Extension jog position is outside the supported range.' };
  }
  const out = sub2(Q, P);
  const len = Math.hypot(out[0], out[1]);
  const usableRun = len - EXT_GAP;
  if (!(usableRun >= MIN_EXTENSION_JOG_RUN)) {
    return { ok: false, reason: `Extension line (${Math.max(0, Math.round(len * 10) / 10)} mm) is too short for a jog.` };
  }
  const axisLen = Math.hypot(axis[0], axis[1]);
  if (!(axisLen > 1e-9)) {
    return { ok: false, reason: 'Dimension axis is degenerate.' };
  }
  const extDir: XY = [out[0] / len, out[1] / len];
  const lateralAxis: XY = [axis[0] / axisLen, axis[1] / axisLen];

  const available = usableRun - 2 * END_CLEAR; // >= 4 mm
  const ramp = Math.max(1, Math.min(Math.abs(jog.offset), available * 0.3, 3));
  const plateau = Math.max(1.5, Math.min(available - 2 * ramp, usableRun * 0.3, 4));
  const jogSpan = 2 * ramp + plateau;
  const minStart = EXT_GAP + END_CLEAR;
  const maxStart = len - END_CLEAR - jogSpan;
  if (maxStart < minStart - 1e-9) {
    return { ok: false, reason: 'Extension line is too short for a non-degenerate jog.' };
  }
  const desiredCenter = EXT_GAP + usableRun * at;
  const start = Math.max(minStart, Math.min(maxStart, desiredCenter - jogSpan / 2));

  const p0 = add2(P, extDir, EXT_GAP);
  const p1 = add2(P, extDir, start);
  const p2 = add2(add2(P, extDir, start + ramp), lateralAxis, jog.offset);
  const p3 = add2(add2(P, extDir, start + ramp + plateau), lateralAxis, jog.offset);
  const p4 = add2(P, extDir, start + jogSpan);
  const p5 = add2(Q, extDir, EXT_OVER);

  const handle: XY = [(p2[0] + p3[0]) / 2, (p2[1] + p3[1]) / 2];
  return {
    ok: true,
    geometry: {
      segments: [[p0, p1], [p1, p2], [p2, p3], [p3, p4], [p4, p5]],
      handle,
      extDir,
      lateralAxis,
      usableRun,
    },
  };
}

/** Project a dragged sheet-mm pointer position onto valid `{ side, offset, at }` parameters for the given extension line. */
export function extensionJogFromSheetPoint(
  P: XY,
  Q: XY,
  axis: XY,
  side: 'a' | 'b',
  point: XY,
): LinearExtensionJog | null {
  const out = sub2(Q, P);
  const len = Math.hypot(out[0], out[1]);
  const usableRun = len - EXT_GAP;
  const axisLen = Math.hypot(axis[0], axis[1]);
  if (!(usableRun >= MIN_EXTENSION_JOG_RUN) || !(axisLen > 1e-9)) return null;
  const extDir: XY = [out[0] / len, out[1] / len];
  const lateralAxis: XY = [axis[0] / axisLen, axis[1] / axisLen];
  const rel = sub2(point, P);
  const rawOffset = rel[0] * lateralAxis[0] + rel[1] * lateralAxis[1];
  const rawAlong = rel[0] * extDir[0] + rel[1] * extDir[1];
  if (!Number.isFinite(rawOffset) || !Number.isFinite(rawAlong)) return null;
  const sign = rawOffset < 0 ? -1 : 1;
  const absOffset = Math.max(MIN_EXTENSION_JOG_OFFSET, Math.min(MAX_EXTENSION_JOG_OFFSET, Math.abs(rawOffset)));
  const offset = Math.round(sign * absOffset * 100) / 100;
  const rawAt = (rawAlong - EXT_GAP) / usableRun;
  const at = Math.round(Math.max(MIN_EXTENSION_JOG_AT, Math.min(MAX_EXTENSION_JOG_AT, rawAt)) * 1000) / 1000;
  return readLinearExtensionJog({ side, offset, at }) ?? null;
}
