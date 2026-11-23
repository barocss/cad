import { buildProfileLoop, ExtrudedProfileLimits, isExtrudedProfileError } from '@barocss/cad';
import { circleRelation } from './loops';
import { outlineSegments, type P2 } from './profile';
import { checkEdit, hvOf, solveShape, type Polygon } from './rules';
import { settleShape } from './settle';
import { edgeAngle } from './terms';

const tolerance = 2e-6;
const distance = (a: P2, b: P2) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const cross = (a: P2, b: P2) => a[0] * b[1] - a[1] * b[0];
const dot = (a: P2, b: P2) => a[0] * b[0] + a[1] * b[1];
const vector = (a: P2, b: P2): P2 => [b[0] - a[0], b[1] - a[1]];
const finitePoint = (p: P2) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
type Chamfer = { setback: number; corner: P2; incoming: P2; outgoing: P2; turn: number; lengthPerSetback: number };

function inspect(source: Polygon, bevel: number): Chamfer | undefined {
  const n = source.points.length;
  if (!source.closed || source.pending || source.construction || n < 4 || !Number.isInteger(bevel) || bevel < 0 || bevel >= n
    || source.spline || source.ellipse || source.points.some(p => !finitePoint(p))
    || (source.bulges && (source.bulges.length !== n || source.bulges.some(b => !Number.isFinite(b))))) return;
  if (source.ids && (source.ids.length !== n || new Set(source.ids.filter(Boolean)).size !== source.ids.filter(Boolean).length)) return;
  const prev = (bevel - 1 + n) % n, next = (bevel + 1) % n;
  if ([prev, bevel, next].some(i => source.bulges?.[i])) return;
  const length = source.lengths?.[bevel];
  if (!Number.isFinite(length) || !(length! > tolerance * Math.SQRT2)) return;
  // The saved recipe has one joint-angle lock. An ordinary diagonal or an unlocked
  // bevel does not identify an editable equal-setback Chamfer.
  const joints = source.rules?.filter(rule => rule.kind === 'angle' &&
    (([prev, next].includes(rule.a) && rule.b === bevel) || (rule.a === bevel && [prev, next].includes(rule.b)))) ?? [];
  if (joints.length !== 1 || joints[0].kind !== 'angle' || !Number.isFinite(joints[0].value)
    || ![joints[0].a, joints[0].b].includes(prev)) return;
  const hv = hvOf(source);
  const orthogonal = (hv.h.includes(prev) && hv.v.includes(next)) || (hv.v.includes(prev) && hv.h.includes(next))
    || source.rules?.some(rule => rule.kind === 'perpendicular' &&
      ((rule.a === prev && rule.b === next) || (rule.a === next && rule.b === prev)));
  const a = source.points[bevel], b = source.points[next];
  const u = vector(source.points[prev], a), v = vector(b, source.points[(next + 1) % n]);
  const lu = Math.hypot(...u), lv = Math.hypot(...v);
  if (Math.min(lu, lv) < ExtrudedProfileLimits.minimumLengthMM) return;
  const incoming: P2 = [u[0] / lu, u[1] / lu], outgoing: P2 = [v[0] / lv, v[1] / lv];
  const sine = cross(incoming, outgoing), cosine = dot(incoming, outgoing);
  let lengthPerSetback = Math.SQRT2;
  if (orthogonal) {
    if (joints[0].value !== 135 || Math.abs(cosine) > 1e-6) return;
  } else {
    if (Math.abs(sine) <= 1e-6 || Math.abs(cosine) <= 1e-6) return;
    const sweep = Math.abs(Math.atan2(sine, cosine));
    const angleRule = source.rules?.some(rule => rule.kind === 'angle'
      && ((rule.a === prev && rule.b === next) || (rule.a === next && rule.b === prev))
      && Number.isFinite(rule.value) && rule.value > 0 && rule.value < 180
      && Math.abs(edgeAngle(source.points, rule.a, rule.b).degrees - rule.value) * Math.PI / 180 <= 1e-6);
    if (!angleRule || Math.abs(joints[0].value - (180 - sweep * 90 / Math.PI)) * Math.PI / 180 > 1e-6) return;
    lengthPerSetback = 2 * Math.cos(sweep / 2);
  }
  const along = cross(vector(a, b), outgoing) / sine;
  const corner: P2 = [a[0] + incoming[0] * along, a[1] + incoming[1] * along];
  let setback = length! / lengthPerSetback;
  if (!orthogonal) {
    // Remove binary division noise only from the new recipe; retain precise authored distances.
    const normalized = Number(setback.toPrecision(15));
    if (Math.abs(normalized - setback) <= 8 * Number.EPSILON * Math.max(1, Math.abs(setback))) setback = normalized;
  }
  const ac = vector(a, corner), cb = vector(corner, b);
  const turn = Math.sign(sine);
  if (!finitePoint(corner) || dot(ac, incoming) <= tolerance || dot(cb, outgoing) <= tolerance
    || Math.abs(distance(a, corner) - setback) > tolerance || Math.abs(distance(b, corner) - setback) > tolerance
    || Math.abs(distance(a, b) - length!) > tolerance
    || turn * cross(incoming, vector(a, b)) <= tolerance || turn * cross(vector(a, b), outgoing) <= tolerance) return;
  return { setback, corner, incoming, outgoing, turn, lengthPerSetback };
}

/** Discover a saved equal-setback Chamfer on orthogonal or explicitly angle-constrained carriers. */
export function savedChamferSetback(source: Polygon, bevel: number): number | undefined {
  return inspect(source, bevel)?.setback;
}

/** Resize saved Chamfers together without exposing any intermediate sketch. */
export function editChamferSetbacks(source: Polygon, edges: readonly number[], value: number): { shape: Polygon } | { error: string } {
  const selected: { edge: number; setback: number }[] = [];
  for (const edge of new Set(edges)) {
    const setback = savedChamferSetback(source, edge);
    if (setback === undefined) return { error: 'Select saved Chamfers between constrained straight lines.' };
    selected.push({ edge, setback });
  }
  if (!selected.length) return { error: 'Select saved Chamfers between constrained straight lines.' };
  // Shrink larger setbacks before growing smaller ones on a shared carrier. Equal sizes retain selection order.
  selected.sort((a, b) => b.setback - a.setback);
  let shape = source;
  for (const { edge } of selected) {
    const result = editChamferSetback(shape, edge, value);
    if ('error' in result) return result;
    shape = result.shape;
  }
  return { shape };
}

/** Resize one saved Chamfer; all other geometry and authored constraints stay in place. */
export function editChamferSetback(source: Polygon, bevel: number, value: number): { shape: Polygon } | { error: string } {
  const plan = inspect(source, bevel);
  if (!plan) return { error: 'Select a saved Chamfer between constrained straight lines.' };
  if (!Number.isFinite(value) || value <= tolerance)
    return { error: 'Enter a positive chamfer distance that the sketch can resolve.' };
  if (value === plan.setback) return { shape: source };
  const previous = solveShape(source);
  if (!previous.ok || previous.points.some((p, i) => distance(p, source.points[i]) > tolerance)
    || source.bulges?.some((b, i) => Math.abs(b - previous.bulges[i]) > 1e-9)
    || source.circles?.some((circle, i) => !previous.circles[i] || distance(circle.c, previous.circles[i]) > tolerance))
    return { error: 'The saved sketch must satisfy its current constraints before editing the Chamfer.' };
  const n = source.points.length, next = (bevel + 1) % n;
  const points = source.points.map(p => [...p] as P2);
  points[bevel] = [plan.corner[0] - plan.incoming[0] * value, plan.corner[1] - plan.incoming[1] * value];
  points[next] = [plan.corner[0] + plan.outgoing[0] * value, plan.corner[1] + plan.outgoing[1] * value];
  // Point 0 is the sketch's implicit anchor. A local setback edit cannot re-anchor it.
  if (distance(points[0], source.points[0]) > tolerance)
    return { error: 'This Chamfer would move the sketch anchor.' };
  const candidate: Polygon = { ...source, points, hv: hvOf(source), lengths: { ...source.lengths, [bevel]: value * plan.lengthPerSetback } };
  const built = loop(candidate), original = loop(source);
  if (!built || !original || built.reversed !== original.reversed || !keepsDirections(source, candidate))
    return { error: 'The chamfer distance would collapse or cross an edge.' };
  const edited = checkEdit(candidate, source, 'Chamfer');
  if (!edited.ok) return { error: edited.reason };
  // Use the same settlement path as Studio. The preview is already the final shape.
  const settled = settleShape(edited.shape, source);
  if (settled.error || settled.shape?.kind !== 'polygon') return { error: settled.error ?? 'The Chamfer could not be settled.' };
  const shape = settled.shape, actual = inspect(shape, bevel);
  if (!actual || Math.abs(actual.setback - value) > tolerance || actual.turn !== plan.turn
    || distance(actual.corner, plan.corner) > tolerance || !keepsDirections(source, shape)
    || shape.points.some((p, i) => distance(p, candidate.points[i]) > tolerance)
    || source.bulges?.some((b, i) => Math.abs(b - (shape.bulges?.[i] ?? 0)) > 1e-9))
    return { error: 'The Chamfer would move other sketch geometry or change its local solution.' };
  for (let i = 0; i < n; i++) {
    if (i === bevel) continue;
    const sibling = inspect(source, i);
    if (!sibling) continue;
    const after = inspect(shape, i);
    if (!after || after.turn !== sibling.turn || Math.abs(after.setback - sibling.setback) > tolerance
      || distance(after.corner, sibling.corner) > tolerance)
      return { error: 'The edit would change another saved Chamfer.' };
  }
  if (source.circles?.some((circle, i) => !shape.circles?.[i]
    || distance(circle.c, shape.circles[i].c) > tolerance || circle.r !== shape.circles[i].r
    || circleRelation(source, circle) !== circleRelation(shape, shape.circles[i])))
    return { error: 'The Chamfer would change a circle or its region.' };
  const finalLoop = loop(shape);
  if (!finalLoop || finalLoop.reversed !== original.reversed)
    return { error: 'The settled Chamfer would cross an edge or reverse the outline.' };
  return { shape };
}

function keepsDirections(source: Polygon, shape: Polygon): boolean {
  return shape.points.every((p, i) => {
    const next = (i + 1) % shape.points.length;
    const before = vector(source.points[i], source.points[next]), after = vector(p, shape.points[next]);
    return Math.hypot(...after) >= ExtrudedProfileLimits.minimumLengthMM && dot(before, after) > 0;
  });
}

function loop(shape: Polygon) {
  try { return buildProfileLoop(outlineSegments(shape.points, shape.bulges), { maximumSegments: 1024 }); }
  catch (cause) {
    if (!isExtrudedProfileError(cause)) throw cause;
    return null;
  }
}
