import type { XY } from './types';
import type { Mark } from './sheet';
import { textCorners } from './text';

/** Visible paper-space gap; the half stroke is added separately for round line caps. */
export const SVG_HATCH_TEXT_GAP = 0.6;
/** SVG coordinates round to 1e-4 mm; cover endpoint rounding along either axis. */
export const SVG_HATCH_ROUNDING_PAD = 0.0002;
type Line = Extract<Mark, { kind: 'line' }>;
type Text = Extract<Mark, { kind: 'text' }>;
const cross = (a: XY, b: XY) => a[0] * b[1] - a[1] * b[0];
const sub = (a: XY, b: XY): XY => [a[0] - b[0], a[1] - b[1]];
const finite = (p: XY) => Array.isArray(p) && p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]);

/** Expanded, rotated conservative typographic box, not exact glyph ink. */
export function hatchTextExclusion(text: Text, strokeWidth: number): XY[] | null {
  if (!text.text || !finite(text.at) || !Number.isFinite(text.size) || text.size <= 0 || !Number.isFinite(text.angle ?? 0) || !Number.isFinite(strokeWidth) || strokeWidth < 0) return null;
  const q = textCorners(text.at, text.text, text.size, text.anchor, text.angle ?? 0, !!text.bold);
  const u = sub(q[1], q[0]), v = sub(q[3], q[0]), a = Math.hypot(...u), b = Math.hypot(...v);
  if (!(a > 0 && b > 0) || !Number.isFinite(a + b)) return null;
  const pad = SVG_HATCH_TEXT_GAP + strokeWidth / 2 + SVG_HATCH_ROUNDING_PAD;
  const grow = (p: XY, x: number, y: number): XY => [p[0] + pad * (x * u[0] / a + y * v[0] / b), p[1] + pad * (x * u[1] / a + y * v[1] / b)];
  const result = [grow(q[0], -1, -1), grow(q[1], 1, -1), grow(q[2], 1, 1), grow(q[3], -1, 1)];
  return result.every(finite) ? result : null;
}

function winding(q: readonly XY[]): number | null {
  if (q.length !== 4 || !Array.from(q).every(finite)) return null;
  const turns = q.map((p, i) => cross(sub(q[(i + 1) % 4], p), sub(q[(i + 2) % 4], q[(i + 1) % 4])));
  if (turns.every(v => Number.isFinite(v) && v > 0)) return 1;
  if (turns.every(v => Number.isFinite(v) && v < 0)) return -1;
  return null;
}
/** Subtract the UNION of convex text boxes from already generated material hatch lines.
 * Material rings, holes, hatch phase and other marks are never changed. Invalid
 * external metadata leaves the original lines intact rather than guessing.
 */
export function subtractHatchText(lines: readonly Line[], boxes: readonly (readonly XY[])[]): Line[] {
  if (!boxes.length) return [...lines];
  const signs = boxes.map(winding);
  if (signs.some(s => s === null)) return [...lines];
  return lines.flatMap(line => {
    if (!finite(line.a) || !finite(line.b)) return [line];
    const d = sub(line.b, line.a), intervals: [number, number][] = [];
    for (let j = 0; j < boxes.length; j++) {
      const q = boxes[j], sign = signs[j]!;
      let lo = 0, hi = 1;
      for (let k = 0; k < q.length && hi > lo; k++) {
        const edge = sub(q[(k + 1) % q.length], q[k]);
        const c = sign * cross(edge, sub(line.a, q[k])), v = sign * cross(edge, d);
        if (!Number.isFinite(c) || !Number.isFinite(v)) return [line];
        if (v === 0) { if (c < 0) hi = lo; }
        else if (v > 0) lo = Math.max(lo, -c / v);
        else hi = Math.min(hi, -c / v);
      }
      if (hi > lo) intervals.push([lo, hi]);
    }
    if (!intervals.length) return [line];
    intervals.sort((a, b) => a[0] - b[0]);
    const union: [number, number][] = [];
    for (const i of intervals) {
      const last = union[union.length - 1];
      if (last && i[0] <= last[1]) last[1] = Math.max(last[1], i[1]);
      else union.push([...i]);
    }
    const at = (t: number): XY => [line.a[0] + d[0] * t, line.a[1] + d[1] * t];
    const result: Line[] = []; let from = 0;
    for (const [lo, hi] of union) { if (lo > from) result.push({ ...line, a: at(from), b: at(lo) }); from = hi; }
    if (from < 1) result.push({ ...line, a: at(from), b: at(1) });
    return result;
  });
}
