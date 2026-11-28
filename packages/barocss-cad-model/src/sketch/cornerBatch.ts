import { buildProfileLoop, ExtrudedProfileLimits, isExtrudedProfileError } from '@barocss/cad';
import { canChamferWithTwoSetbacks, chamferCorner, roundStraightCornerForEdit } from './corner';
import { nextIdOf, withIds } from './entityIds';
import { arcOf, outlineSegments, type P2 } from './profile';
import type { Polygon } from './rules';
import { settleShape } from './settle';
import { arcMeetsOtherOutline, sideMeetsOtherOutline } from './trim';

type Result = { shape: Polygon; display: Polygon } | { error: string };
type Operation = 'fillet' | 'chamfer';
type Corner = { from: P2; to: P2; bulge: number };

const tolerance = 2e-6;
const idError = 'The outline needs distinct side IDs and room for new IDs.';
const spanError = 'The selected corners leave too little of a shared edge.';
const geometryError = 'The corner edit would move sketch geometry or lose a requested size.';
const distance = (a: P2, b: P2) => Math.hypot(b[0] - a[0], b[1] - a[1]);

function hasCarrierSpan(a: P2, b: P2, from: P2, to: P2): boolean {
  // A reversed remainder can still have a positive length. Check it along the original side.
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const along = ((to[0] - from[0]) * dx + (to[1] - from[1]) * dy) / Math.hypot(dx, dy);
  return along >= ExtrudedProfileLimits.minimumLengthMM;
}

function tangentToCarrier(center: P2, contact: P2, tip: P2, end: P2): boolean {
  const length = distance(tip, end), x = (end[0] - tip[0]) / length, y = (end[1] - tip[1]) / length;
  const dx = contact[0] - tip[0], dy = contact[1] - tip[1];
  return Math.abs(dx * y - dy * x) <= tolerance
    && Math.abs((center[0] - contact[0]) * x + (center[1] - contact[1]) * y) <= tolerance;
}

/** Stage the selected straight-corner edits and accept them only if the complete outline can settle. */
export function prepareStraightCornerBatch(source: Polygon, operation: Operation, corners: readonly number[], value: number, firstId = 1, outgoing?: number): Result {
  const n = source.points.length;
  const ordered = [...new Set(corners)].sort((a, b) => a - b);
  if (!source.closed || source.pending || source.construction || source.spline || source.ellipse || source.circles?.length
    || n < 3 || !ordered.length || ordered.some(i => !Number.isInteger(i) || i < 0 || i >= n))
    return { error: 'Select corners on one independent closed outline.' };
  if (outgoing !== undefined && (operation !== 'chamfer' || ordered.length !== 2 || ordered.some(i => !canChamferWithTwoSetbacks(source, i))))
    return { error: 'Two chamfer distances need two perpendicular corners on one outline.' };

  const existing = Array.from(source.ids ?? []).filter(id => id !== '');
  if ((source.ids && source.ids.length !== n) || new Set(existing).size !== existing.length
    || existing.some(id => typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,32}$/.test(id)) || !Number.isSafeInteger(firstId) || firstId < 1)
    return { error: idError };
  const from = Math.max(firstId, nextIdOf([source]));
  const needed = n - existing.length + ordered.length;
  if (from > Number.MAX_SAFE_INTEGER - needed) return { error: idError };
  const [base] = withIds([source], from) as [Polygon];
  const finishFrom = from + n - existing.length;

  const edit = operation === 'fillet' ? (shape: Polygon, index: number) => roundStraightCornerForEdit(shape, index, value)
    : (shape: Polygon, index: number) => chamferCorner(shape, index, value, outgoing);
  const first = edit(base, ordered[0]);
  if ('error' in first) return first;
  const local = new Map<number, Corner>();
  for (const [offset, i] of ordered.entries()) {
    const planned = offset === 0 ? first : edit(base, i);
    if ('error' in planned) return planned;
    const { points, bulges } = planned.shape;
    local.set(i, { from: points[i], to: points[i + 1], bulge: bulges?.[i] ?? 0 });
  }
  for (const [i, corner] of local) {
    const j = (i + 1) % n, next = local.get(j);
    if (next && !hasCarrierSpan(source.points[i], source.points[j], corner.to, next.from)) return { error: spanError };
  }

  // Reuse the single-corner constraint remapping. None of the intermediate shapes leaves this function.
  let draft = first.shape;
  const at = ordered.map((i, offset) => i + offset);
  for (const index of at.slice(1)) {
    const staged = edit(draft, index);
    if ('error' in staged) return staged;
    draft = staged.shape;
  }
  const [shape] = withIds([draft], finishFrom) as [Polygon];
  const settled = settleShape(shape, source);
  if (settled.error || settled.shape?.kind !== 'polygon') return { error: settled.error ?? geometryError };

  const check = (candidate: Polygon): string | null => {
    let j = 0;
    for (const [i, tip] of source.points.entries()) {
      const next = (i + 1) % n;
      const corner = local.get(i);
      const incoming = candidate.points[j];
      if (distance(incoming, corner?.from ?? tip) > tolerance) return geometryError;
      if (corner) {
        const outgoingPoint = candidate.points[j + 1], bulge = candidate.bulges?.[j] ?? 0;
        if (distance(outgoingPoint, corner.to) > tolerance || Math.abs(bulge - corner.bulge) > 1e-9) return geometryError;
        if (operation === 'fillet') {
          const arc = arcOf(incoming, outgoingPoint, bulge);
          if (!(Math.abs(arc.radius - value) <= tolerance)
            || !tangentToCarrier(arc.center, incoming, tip, source.points[(i - 1 + n) % n])
            || !tangentToCarrier(arc.center, outgoingPoint, tip, source.points[next])) return geometryError;
        } else if (Math.abs(distance(incoming, tip) - value) > tolerance || Math.abs(distance(outgoingPoint, tip) - (outgoing ?? value)) > tolerance) {
          return geometryError;
        }
        j++;
      }
      if (Math.abs((candidate.bulges?.[j] ?? 0) - (source.bulges?.[i] ?? 0)) > 1e-9) return geometryError;
      if (corner && local.has(next) && !hasCarrierSpan(tip, source.points[next], candidate.points[j], candidate.points[(j + 1) % candidate.points.length]))
        return spanError;
      j++;
    }

    const contact = operation === 'fillet' ? arcMeetsOtherOutline : sideMeetsOtherOutline;
    const pointKeys = new Set(candidate.points.map(p => p.map(coord => coord.toFixed(6)).join(',')));
    if (pointKeys.size !== candidate.points.length || at.some(i => contact(candidate, i))) return 'The corner edit would touch another edge.';
    try { buildProfileLoop(outlineSegments(candidate.points, candidate.bulges), { maximumSegments: 1024 }); }
    catch (cause) {
      if (!isExtrudedProfileError(cause)) throw cause;
      return cause.message;
    }
    return null;
  };
  const error = check(shape) ?? check(settled.shape);
  return error ? { error } : { shape, display: settled.shape };
}
