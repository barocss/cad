import { buildProfileLoop, ExtrudedProfileLimits, isExtrudedProfileError } from '@barocss/cad';
import { circleRelation } from './loops';
import { arcOf, outlineSegments, type P2 } from './profile';
import { checkEdit, hvOf, solveShape, type Polygon } from './rules';
import { settleShape } from './settle';
import { arcMeetsOtherOutline, sideMeetsOtherOutline } from './trim';

const tolerance = 2e-6;
const distance = (a: P2, b: P2) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const vector = (a: P2, b: P2): P2 => [b[0] - a[0], b[1] - a[1]];
const dot = (a: P2, b: P2) => a[0] * b[0] + a[1] * b[1];
const cross = (a: P2, b: P2) => a[0] * b[1] - a[1] * b[0];
const finitePoint = (p: P2) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
type Fillet = { radius: number; corner: P2; incoming: P2; outgoing: P2; turn: number };

function inspect(source: Polygon, edge: number): Fillet | undefined {
  const n = source.points.length;
  if (!source.closed || source.pending || source.construction || n < 4 || !Number.isInteger(edge) || edge < 0 || edge >= n
    || source.spline || source.ellipse || source.points.some(p => !finitePoint(p))
    || !source.bulges || source.bulges.length !== n || source.bulges.some(b => !Number.isFinite(b))) return;
  if (source.ids && (source.ids.length !== n || new Set(source.ids.filter(Boolean)).size !== source.ids.filter(Boolean).length)) return;
  const prev = (edge - 1 + n) % n, next = (edge + 1) % n;
  const radius = source.radii?.[edge], bulge = source.bulges[edge];
  if (!Number.isFinite(radius) || !(radius! >= ExtrudedProfileLimits.minimumRadiusMM)
    || !bulge || !(Math.abs(bulge) < 1) || source.bulges[prev] || source.bulges[next]
    || !source.tangents?.includes(edge) || !source.tangents.includes(next)) return;
  const hv = hvOf(source);
  const orthogonal = (hv.h.includes(prev) && hv.v.includes(next)) || (hv.v.includes(prev) && hv.h.includes(next))
    || source.rules?.some(rule => rule.kind === 'perpendicular'
      && ((rule.a === prev && rule.b === next) || (rule.a === next && rule.b === prev)));
  if (!orthogonal) return;
  const a = source.points[edge], b = source.points[next];
  const u = vector(source.points[prev], a), v = vector(b, source.points[(next + 1) % n]);
  const lu = Math.hypot(...u), lv = Math.hypot(...v);
  if (Math.min(lu, lv) < ExtrudedProfileLimits.minimumLengthMM) return;
  const incoming: P2 = [u[0] / lu, u[1] / lu], outgoing: P2 = [v[0] / lv, v[1] / lv];
  if (Math.abs(dot(incoming, outgoing)) > 1e-6) return;
  const along = cross(vector(a, b), outgoing) / cross(incoming, outgoing);
  const corner: P2 = [a[0] + incoming[0] * along, a[1] + incoming[1] * along];
  const arc = arcOf(a, b, bulge), turn = Math.sign(cross(incoming, outgoing));
  if (!finitePoint(corner) || turn !== Math.sign(bulge)
    || dot(vector(a, corner), incoming) <= tolerance || dot(vector(corner, b), outgoing) <= tolerance
    || Math.abs(distance(a, corner) - radius!) > tolerance || Math.abs(distance(b, corner) - radius!) > tolerance
    || Math.abs(arc.radius - radius!) > tolerance || Math.abs(Math.abs(arc.sweep) - Math.PI / 2) > 1e-6
    || Math.abs(dot(vector(a, arc.center), incoming)) > tolerance
    || Math.abs(dot(vector(b, arc.center), outgoing)) > tolerance) return;
  return { radius: radius!, corner, incoming, outgoing, turn };
}

/** Discover a saved radius-locked Fillet tangent to two constrained orthogonal straight carriers. */
export function savedFilletRadius(source: Polygon, edge: number): number | undefined {
  return inspect(source, edge)?.radius;
}

/** Resize saved Fillets together without exposing any intermediate sketch. */
export function editFilletRadii(source: Polygon, edges: readonly number[], value: number): { shape: Polygon } | { error: string } {
  const selected: { edge: number; radius: number }[] = [];
  for (const edge of new Set(edges)) {
    const radius = savedFilletRadius(source, edge);
    if (radius === undefined) return { error: 'Select saved, constrained orthogonal Fillets.' };
    selected.push({ edge, radius });
  }
  if (!selected.length) return { error: 'Select saved, constrained orthogonal Fillets.' };
  // Shrink larger radii before growing smaller ones on a shared carrier. Equal radii retain selection order.
  selected.sort((a, b) => b.radius - a.radius);
  let shape = source;
  for (const { edge } of selected) {
    const result = editFilletRadius(shape, edge, value);
    if ('error' in result) return result;
    shape = result.shape;
  }
  return { shape };
}

/** Resize one saved Fillet while retaining its carriers and every other sketch element. */
export function editFilletRadius(source: Polygon, edge: number, value: number): { shape: Polygon } | { error: string } {
  const plan = inspect(source, edge);
  if (!plan) return { error: 'Select a saved, constrained orthogonal Fillet.' };
  if (!Number.isFinite(value) || value < ExtrudedProfileLimits.minimumRadiusMM)
    return { error: `Enter a finite radius of at least ${ExtrudedProfileLimits.minimumRadiusMM} mm.` };
  if (value === plan.radius) return { shape: source };
  const previous = solveShape(source);
  if (!previous.ok || previous.points.some((p, i) => distance(p, source.points[i]) > tolerance)
    || source.bulges?.some((b, i) => Math.abs(b - previous.bulges[i]) > 1e-9)
    || source.circles?.some((circle, i) => !previous.circles[i] || distance(circle.c, previous.circles[i]) > tolerance))
    return { error: 'The saved sketch must satisfy its current constraints before editing the Fillet.' };
  const n = source.points.length, next = (edge + 1) % n, prev = (edge - 1 + n) % n;
  const points = source.points.map(p => [...p] as P2);
  points[edge] = [plan.corner[0] - plan.incoming[0] * value, plan.corner[1] - plan.incoming[1] * value];
  points[next] = [plan.corner[0] + plan.outgoing[0] * value, plan.corner[1] + plan.outgoing[1] * value];
  // Point zero is the implicit sketch anchor, including either endpoint of a wraparound arc.
  if (distance(points[0], source.points[0]) > tolerance) return { error: 'This Fillet would move the sketch anchor.' };
  const candidate: Polygon = { ...source, points, hv: hvOf(source), radii: { ...source.radii, [edge]: value } };
  const original = loop(source), built = loop(candidate);
  const validOutline = (shape: Polygon) => keepsDirections(source, shape)
    && !arcMeetsOtherOutline(shape, edge) && !sideMeetsOtherOutline(shape, prev) && !sideMeetsOtherOutline(shape, next);
  if (!original || !built || built.reversed !== original.reversed || !validOutline(candidate))
    return { error: 'The Fillet radius would collapse, touch or cross an edge.' };
  const edited = checkEdit(candidate, source, 'Fillet');
  if (!edited.ok) return { error: edited.reason };
  const settled = settleShape(edited.shape, source);
  if (settled.error || settled.shape?.kind !== 'polygon') return { error: settled.error ?? 'The Fillet could not be settled.' };
  const shape = settled.shape, actual = inspect(shape, edge);
  if (!actual || Math.abs(actual.radius - value) > tolerance || actual.turn !== plan.turn
    || distance(actual.corner, plan.corner) > tolerance || !validOutline(shape)
    || shape.points.some((p, i) => distance(p, candidate.points[i]) > tolerance)
    || source.bulges?.some((b, i) => Math.abs(b - (shape.bulges?.[i] ?? 0)) > 1e-9))
    return { error: 'The Fillet would move other sketch geometry or change its local solution.' };
  if (source.circles?.some((circle, i) => !shape.circles?.[i]
    || distance(circle.c, shape.circles[i].c) > tolerance || circle.r !== shape.circles[i].r
    || circleRelation(source, circle) !== circleRelation(shape, shape.circles[i])))
    return { error: 'The Fillet would change a circle or its region.' };
  const finalLoop = loop(shape);
  if (!finalLoop || finalLoop.reversed !== original.reversed)
    return { error: 'The settled Fillet would cross an edge or reverse the outline.' };
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
