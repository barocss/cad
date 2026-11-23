// Round a sketch corner with a circular arc tangent to the two trimmed sides. Straight-edge rounds carry
// direction rules and drop trimmed length locks. The bounded line–arc round requires pinned carriers.
import { buildProfileLoop, ExtrudedProfileLimits, isExtrudedProfileError } from '@barocss/cad';
import { circleRelation } from './loops';
import { arcOf, outlineSegments } from './profile';
import { matchesPinnedRound, preparePinnedLineArcRound } from './internal/pinnedLineArcRound';
import { settleShape } from './settle';
import type { SketchShape } from './types';
import type { SketchRule } from './terms';
import { hvOf } from './rules';
import { arcMeetsOtherOutline, sideMeetsOtherOutline } from './trim';
import { r6Signed as r6 } from '../util/round';

type Polygon = Extract<SketchShape, { kind: 'polygon' }>;
type P2 = [number, number];

function roundLineArc(s: Polygon, i: number, r: number): { shape: Polygon } | { error: string } {
  const prepared = preparePinnedLineArcRound(s, i, r);
  if ('error' in prepared) return prepared;
  const { shape, error } = settleShape(prepared.shape, s);
  if (error || shape?.kind !== 'polygon' || !matchesPinnedRound(shape, prepared.plan)) {
    return { error: error ?? 'The settled round would change the source circle or lose tangency.' };
  }
  return { shape };
}

/** The outline with corner `i` rounded to radius `r`, or why it cannot be. */
export function roundCorner(s: Polygon, i: number, r: number): { shape: Polygon } | { error: string } {
  const n = s.points.length, bulges = s.bulges ?? s.points.map(() => 0);
  if (!s.closed && (i === 0 || i === n - 1)) return { error: 'Pick a corner between two edges.' };
  if (!(r > 0)) return { error: 'Give the round a radius.' };
  const prev = (i - 1 + n) % n;
  if (bulges[prev] || bulges[i]) return roundLineArc(s, i, r);
  const p = s.points[i], a = s.points[prev], b = s.points[(i + 1) % n];
  const la = Math.hypot(a[0] - p[0], a[1] - p[1]), lb = Math.hypot(b[0] - p[0], b[1] - p[1]);
  const ua: P2 = [(a[0] - p[0]) / la, (a[1] - p[1]) / la], ub: P2 = [(b[0] - p[0]) / lb, (b[1] - p[1]) / lb];
  const theta = Math.acos(Math.max(-1, Math.min(1, ua[0] * ub[0] + ua[1] * ub[1])));
  if (theta < 1e-3 || Math.PI - theta < 1e-3) return { error: 'The edges there run straight on: there is no corner to round.' };
  const t = r / Math.tan(theta / 2);
  if (t >= la - 1e-6 || t >= lb - 1e-6) return { error: `R${r} does not fit there: the edges are too short (at most R${Math.floor(Math.min(la, lb) * Math.tan(theta / 2) * 10) / 10}).` };
  const A: P2 = [r6(p[0] + ua[0] * t), r6(p[1] + ua[1] * t)], B: P2 = [r6(p[0] + ub[0] * t), r6(p[1] + ub[1] * t)];
  // The arc turns as the outline turns there (left: a positive bulge), through π − θ.
  const din: P2 = [-ua[0], -ua[1]], turn = Math.sign(din[0] * ub[1] - din[1] * ub[0]), bulge = turn * Math.tan((Math.PI - theta) / 4);
  const out = replaceCorner(s, i, A, B, bulge);
  out.radii = { ...out.radii, [i]: r };
  out.tangents = [...(out.tangents ?? []), i, i + 1];
  return { shape: out };
}

/** Prepare a straight-corner edit of a saved outline without removing driving inputs. */
export function roundStraightCornerForEdit(s: Polygon, i: number, radius: number): { shape: Polygon } | { error: string } {
  const n = s.points.length;
  if (!s.closed || s.pending || n < 3 || !Number.isInteger(i) || i < 0 || i >= n)
    return { error: 'Select a corner on a closed outline.' };
  if (!Number.isFinite(radius) || radius < ExtrudedProfileLimits.minimumRadiusMM)
    return { error: `Enter a finite radius of at least ${ExtrudedProfileLimits.minimumRadiusMM} mm.` };
  const prev = (i - 1 + n) % n;
  if (s.bulges?.[prev] || s.bulges?.[i] || s.spline || s.ellipse || s.circles?.length)
    return { error: 'Select a corner between two straight edges of an independent outline.' };
  const planned = roundCorner({ ...s, hv: hvOf(s) }, i, radius);
  if ('error' in planned) return planned;
  const candidate = planned.shape;
  if (s.lengths?.[prev] !== undefined || s.lengths?.[i] !== undefined || s.tangents?.includes(i)
    || (s.rules?.length ?? 0) !== (candidate.rules?.length ?? 0))
    return { error: 'The round would remove a constraint on the original corner or its trimmed edges.' };

  // Settlement can snap an unrelated tip off a touching arc by a fraction of a micron.
  if (arcMeetsOtherOutline(candidate, i)) return { error: 'The round would touch another edge.' };
  const { shape, error } = settleShape(candidate, s);
  if (error || shape?.kind !== 'polygon') return { error: error ?? 'The round could not be settled.' };
  const tolerance = 2e-6;
  const bulge = shape.bulges?.[i] ?? 0;
  const from = shape.points[i], to = shape.points[i + 1];
  const arc = arcOf(from, to, bulge);
  if (!bulge || Math.abs(bulge) >= 1 || Math.sign(bulge) !== Math.sign(candidate.bulges![i]) || !(Math.abs(arc.radius - radius) <= tolerance)
    || !tangentToCarrier(arc.center, from, s.points[i], s.points[prev], tolerance)
    || !tangentToCarrier(arc.center, to, s.points[i], s.points[(i + 1) % n], tolerance))
    return { error: 'The settled arc would lose the requested radius or tangency to its original edges.' };
  const movedOther = shape.points.some((point, index) => index !== i && index !== i + 1
    && Math.hypot(point[0] - candidate.points[index][0], point[1] - candidate.points[index][1]) > tolerance);
  const changedOtherArc = candidate.bulges?.some((before, index) => index !== i
    && Math.abs((shape.bulges?.[index] ?? 0) - before) > 1e-9);
  if (movedOther || changedOtherArc) return { error: 'The round would move other sketch geometry.' };

  const keys = new Set(shape.points.map(point => point.map(value => value.toFixed(6)).join(',')));
  if (keys.size !== shape.points.length || arcMeetsOtherOutline(shape, i))
    return { error: 'The round would touch another edge.' };
  try { buildProfileLoop(outlineSegments(shape.points, shape.bulges), { maximumSegments: 1024 }); }
  catch (cause) {
    if (!isExtrudedProfileError(cause)) throw cause;
    return { error: cause.message };
  }
  return { shape };
}

function tangentToCarrier(center: P2, contact: P2, corner: P2, other: P2, tolerance: number): boolean {
  const carrier = unitFrom(corner, other);
  if (!carrier) return false;
  const [x, y] = carrier.direction;
  const dx = contact[0] - corner[0], dy = contact[1] - corner[1];
  const along = dx * x + dy * y;
  const tangentError = (center[0] - contact[0]) * x + (center[1] - contact[1]) * y;
  return along > tolerance && along < carrier.length - tolerance
    && Math.abs(dx * y - dy * x) <= tolerance && Math.abs(tangentError) <= tolerance;
}

/** Shorten the two straight carriers by the same setback and join their new ends. */
export function chamferCorner(s: Polygon, i: number, distance: number): { shape: Polygon } | { error: string } {
  const n = s.points.length;
  // Outline settlement can snap points to the 1e-6 mm grid.
  const grid = 1e-6, tolerance = 2 * grid, minimum = ExtrudedProfileLimits.minimumLengthMM;
  if (!s.closed || s.pending || n < 3 || !Number.isInteger(i) || i < 0 || i >= n)
    return { error: 'Select a corner on a closed outline.' };
  if (!Number.isFinite(distance) || distance <= tolerance)
    return { error: 'Enter a positive chamfer distance that the sketch can resolve.' };
  const prev = (i - 1 + n) % n;
  if (s.bulges?.[prev] || s.bulges?.[i])
    return { error: 'Select a corner between two straight edges.' };
  const p = s.points[i], a = s.points[prev], b = s.points[(i + 1) % n];
  const u = unitFrom(p, a), v = unitFrom(p, b);
  if (!u || !v || Math.abs(turn(u.direction, v.direction)) <= 1e-6)
    return { error: 'The edges do not form a usable corner.' };
  if (Math.min(u.length, v.length) - distance < minimum)
    return { error: 'The chamfer distance must be shorter than both edges.' };

  const A: P2 = [p[0] + u.direction[0] * distance, p[1] + u.direction[1] * distance];
  const B: P2 = [p[0] + v.direction[0] * distance, p[1] + v.direction[1] * distance];
  const delta = (x: P2, y: P2) => Math.hypot(x[0] - y[0], x[1] - y[1]);
  if (delta(A, B) < minimum) return { error: 'The bevel would be too short to keep as a separate edge.' };

  const hv = hvOf(s);
  const candidate = replaceCorner({ ...s, hv }, i, A, B, 0, true);
  const angleAtCorner = s.rules?.some(rule => rule.kind === 'angle' &&
    ((rule.a === prev && rule.b === i) || (rule.a === i && rule.b === prev)));
  if (angleAtCorner || s.tangents?.includes(i) || (s.rules?.length ?? 0) !== (candidate.rules?.length ?? 0) ||
    s.lengths?.[prev] !== undefined || s.lengths?.[i] !== undefined)
    return { error: 'Remove the constraints on this corner or the trimmed lengths before chamfering.' };
  const perpendicularCarriers = s.rules?.some(rule => rule.kind === 'perpendicular' &&
    ((rule.a === prev && rule.b === i) || (rule.a === i && rule.b === prev)));
  if (perpendicularCarriers || (hv.h.includes(prev) && hv.v.includes(i)) || (hv.v.includes(prev) && hv.h.includes(i))) {
    // Orthogonal carriers leave two independent setback freedoms. The bevel's
    // length and its 135° joint angle hold both, including the opposite turn at a reflex corner.
    // The native angle rule takes its sign from this seed; no pointer constraint is persisted.
    candidate.lengths = { ...candidate.lengths, [i]: distance * Math.SQRT2 };
    candidate.rules = [...(candidate.rules ?? []), { kind: 'angle', a: i === 0 ? n : prev, b: i, value: 135 }];
  }
  const { shape, error } = settleShape(candidate, s);
  if (error || shape?.kind !== 'polygon') return { error: error ?? 'The chamfer could not be settled.' };
  if (shape.points.some((point, j) => delta(point, candidate.points[j]) > grid) ||
    [shape.points[i], shape.points[i + 1]].some(point => Math.abs(delta(point, p) - distance) > tolerance) ||
    shape.bulges?.some((bulge, j) => Math.abs(bulge - (candidate.bulges?.[j] ?? 0)) > 1e-9) ||
    shape.circles?.some((circle, j) => delta(circle.c, s.circles![j].c) > grid))
    return { error: 'The chamfer would move other sketch geometry or lose the requested distance.' };

  const incoming = unitFrom(shape.points[(i - 1 + shape.points.length) % shape.points.length], shape.points[i]);
  const bevel = unitFrom(shape.points[i], shape.points[i + 1]);
  const outgoing = unitFrom(shape.points[i + 1], shape.points[(i + 2) % shape.points.length]);
  const orientation = Math.sign(-turn(u.direction, v.direction));
  if (!incoming || !bevel || !outgoing || orientation * turn(incoming.direction, bevel.direction) <= 1e-7 ||
    orientation * turn(bevel.direction, outgoing.direction) <= 1e-7)
    return { error: 'The settled bevel does not form two distinct corners.' };

  // Side tags are matched by six-decimal XY keys at sketch Finish.
  const unique = new Set(shape.points.map(point => point.map(value => value.toFixed(6)).join(',')));
  const movedCircle = shape.circles?.some((circle, j) => circleRelation(shape, circle) !== circleRelation(s, s.circles![j]));
  if (unique.size !== shape.points.length || sideMeetsOtherOutline(shape, i) || movedCircle)
    return { error: 'The bevel would touch another edge or change a circle’s region.' };
  try { buildProfileLoop(outlineSegments(shape.points, shape.bulges), { maximumSegments: 1024 }); }
  catch (cause) {
    if (!isExtrudedProfileError(cause)) throw cause;
    return { error: cause.message };
  }
  return { shape };
}

const turn = (a: P2, b: P2) => a[0] * b[1] - a[1] * b[0];

function unitFrom(p: P2, q: P2): { length: number; direction: P2 } | null {
  const x = q[0] - p[0], y = q[1] - p[1], length = Math.hypot(x, y);
  return Number.isFinite(length) && length > 0 ? { length, direction: [x / length, y / length] } : null;
}

/** Copy the outline with one corner replaced by two ends and a new segment. */
function replaceCorner(s: Polygon, i: number, A: P2, B: P2, bulge: number, chamfer = false): Polygon {
  const n = s.points.length, prev = (i - 1 + n) % n, bulges = s.bulges ?? s.points.map(() => 0);
  const pt = (j: number) => j < i ? j : j === i ? -1 : j + 1, seg = (k: number) => k < i ? k : k + 1; // old → new numbering
  const points = [...s.points.slice(0, i), A, B, ...s.points.slice(i + 1)];
  const nb = [...bulges.slice(0, i), bulge, ...bulges.slice(i)];
  const out: Polygon = { ...s, points, bulges: nb };
  delete out.fromRectangle;
  delete out.fromSpline; delete out.spline; delete out.fromEllipse; delete out.ellipse; // (A rounded corner makes a spline or ellipse an ordinary outline.)
  // (Ids, R10a: the edges either side keep theirs — the one leaving the corner now from B; the new segment's is given with the
  // sketch's others, unique in it: withIds.)
  if (s.ids?.length === s.points.length) out.ids = [...s.ids.slice(0, i), '', ...s.ids.slice(i)];
  const remap = <T,>(rec: Record<number, T> | undefined, drop: number[]) => rec && Object.fromEntries(Object.entries(rec).filter(([k]) => !drop.includes(+k)).map(([k, v]) => [seg(+k), v]));
  out.lengths = remap(s.lengths, [prev, i]);
  out.radii = remap(s.radii, []);
  out.tangents = (s.tangents ?? []).filter(j => j !== i).map(pt);
  if (s.hv) out.hv = { h: s.hv.h.map(seg), v: s.hv.v.map(seg) };
  if (s.equalRadii) out.equalRadii = s.equalRadii.map(([x, y]) => [seg(x), seg(y)] as [number, number]);
  if (s.concentric) out.concentric = s.concentric.map(([x, y]) => [seg(x), seg(y)] as [number, number]);
  if (s.rules) out.rules = s.rules.flatMap((rule): SketchRule[] => {
    switch (rule.kind) {
      case 'fix': return pt(rule.point) < 0 ? [] : [{ ...rule, point: pt(rule.point) }];
      case 'distance': case 'dx': case 'dy': return pt(rule.a) < 0 || pt(rule.b) < 0 ? [] : [{ ...rule, a: pt(rule.a), b: pt(rule.b) }];
      case 'coincident': return pt(rule.point) < 0 ? [] : [{ ...rule, point: pt(rule.point), arc: seg(rule.arc) }];
      case 'equal': {
        const trimsA = rule.a === prev || rule.a === i, trimsB = rule.b === prev || rule.b === i;
        return (trimsA || trimsB) && !(chamfer && trimsA && trimsB) ? [] : [{ ...rule, a: seg(rule.a), b: seg(rule.b) }];
      }
      // Point to circle centre; edge to circle centre (the edge's direction is kept); circle to circle.
      case 'cdist': case 'cdx': case 'cdy': return pt(rule.a) < 0 ? [] : [{ ...rule, a: pt(rule.a) }];
      case 'cedge': return [{ ...rule, edge: seg(rule.edge) }];
      case 'ccdist': case 'ccdx': case 'ccdy': case 'cconc': return [rule];
      case 'ctan': return [prev, i].includes(rule.edge) ? [] : [{ ...rule, edge: seg(rule.edge) }];
      case 'symmetric': return pt(rule.a) < 0 || pt(rule.b) < 0 || (!chamfer && [prev, i].includes(rule.line)) ? [] : [{ ...rule, a: pt(rule.a), b: pt(rule.b), line: seg(rule.line) }];
      case 'angle': {
        // These carriers shared the removed corner. Once separated by a Fillet, the same
        // physical included angle is stored between drawn directions (terms.edgeAngle).
        const separated = !chamfer && ((rule.a === prev && rule.b === i) || (rule.a === i && rule.b === prev));
        return [{ ...rule, a: seg(rule.a), b: seg(rule.b), value: separated ? 180 - rule.value : rule.value }];
      }
      default: return [{ ...rule, a: seg(rule.a), b: seg(rule.b) }];
    }
  });
  return out;
}
