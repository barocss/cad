import { CadNumericPolicy } from '@barocss/cad';

type Point = readonly [number, number];
const linear = CadNumericPolicy.linearTolerance;
// The existing sketch solver and driven-sketch angular residual budget, in radians.
const angular = 1e-9;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const point = (value: unknown): value is Point => Array.isArray(value) && value.length === 2 && value.every(v => typeof v === 'number' && Number.isFinite(v));
const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const vector = (a: Point, b: Point): Point => [b[0] - a[0], b[1] - a[1]];

/** A marker is deliberate authoring, never an interpretation of an old mixed rule. */
export const hasEndpointMarker = (rule: unknown): rule is Record<string, unknown> & { at: unknown } => record(rule) && Object.hasOwn(rule, 'at');

/** The joint comes only from the two stored segment indices, including last/first. */
export function endpointPerpendicular(points: readonly Point[], bulges: readonly number[], a: number, b: number) {
  const n = points.length, valid = (i: number) => Number.isInteger(i) && i >= 0 && i < n;
  if (n < 3 || !valid(a) || !valid(b) || a === b || !points.every(point)
    || !Number.isFinite(bulges[a] ?? 0) || !Number.isFinite(bulges[b] ?? 0)
    || Boolean(bulges[a]) === Boolean(bulges[b])) return;
  const joint = (a + 1) % n === b ? b : (b + 1) % n === a ? a : undefined;
  if (joint === undefined) return;
  const arc = bulges[a] ? a : b, line = arc === a ? b : a, bulge = bulges[arc];
  if (!Number.isFinite(bulge) || bulge === 0) return;
  const start = points[arc], end = points[(arc + 1) % n], first = points[line], last = points[(line + 1) % n];
  const chord = distance(start, end), lineLength = distance(first, last);
  if (!(chord > linear && lineLength > linear)) return;
  const d = (chord / 2) * (1 - bulge * bulge) / (2 * bulge);
  const centre: Point = [(start[0] + end[0]) / 2 - (end[1] - start[1]) / chord * d,
    (start[1] + end[1]) / 2 + (end[0] - start[0]) / chord * d];
  const radius = distance(centre, points[joint]);
  if (!centre.every(Number.isFinite) || !Number.isFinite(radius) || !(radius > linear)) return;
  const direction = vector(first, last), radial = vector(centre, points[joint]);
  const farLine = joint === line ? last : first, farArc = joint === arc ? end : start;
  if (!(distance(farLine, farArc) > linear)) return;
  const cosine = direction[0] / lineLength * (radial[0] / radius) + direction[1] / lineLength * (radial[1] / radius);
  return { line, arc, joint, centre, radius, direction, radial,
    radiusSegment: `${joint === arc ? 'ra' : 'rb'}${arc}`, angle: cosine >= 0 ? 0 : Math.PI };
}

export function endpointPerpendicularMet(direction: Point, radial: Point): boolean {
  const l = Math.hypot(...direction), r = Math.hypot(...radial);
  if (!(l > linear && r > linear) || !Number.isFinite(l) || !Number.isFinite(r)) return false;
  const x = direction[0] / l, y = direction[1] / l, u = radial[0] / r, v = radial[1] / r;
  return Math.abs(Math.atan2(x * v - y * u, Math.abs(x * u + y * v))) <= angular;
}

/** Invalid marked rules must not disappear from the solver's term list. */
export function endpointRuleProblem(rule: unknown, points: readonly Point[], bulges: readonly number[]): string | null {
  if (!hasEndpointMarker(rule) || rule.kind !== 'perpendicular') return null;
  if (rule.at !== 'shared-endpoint'
    || Object.keys(rule).length !== 4 || !['kind', 'a', 'b', 'at'].every(key => Object.hasOwn(rule, key))
    || typeof rule.a !== 'number' || typeof rule.b !== 'number'
    || !endpointPerpendicular(points, bulges, rule.a, rule.b))
    return 'Perpendicular at a shared endpoint needs one adjacent nondegenerate line and circular arc.';
  return null;
}

/** Read both authored representations; neither a glyph nor a later solve repairs a saved file. */
export function savedEndpointPerpendicularProblem(node: Record<string, unknown>, rule: unknown): string | null {
  const invalid = 'the marked shared-endpoint perpendicular must agree with its native line, circular arc and editable outline.';
  if (!record(node.outline) || !Array.isArray(node.outline.points) || !node.outline.points.every(point)
    || !Array.isArray(node.outline.bulges) || node.outline.bulges.length !== node.outline.points.length
    || !node.outline.bulges.every(v => typeof v === 'number' && Number.isFinite(v))) return invalid;
  const points = node.outline.points, bulges = node.outline.bulges;
  if (!hasEndpointMarker(rule) || rule.kind !== 'perpendicular' || endpointRuleProblem(rule, points, bulges)) return invalid;
  const match = endpointPerpendicular(points, bulges, rule.a as number, rule.b as number);
  if (!match || !endpointPerpendicularMet(match.direction, match.radial)
    || node.profile !== 'loop' || !Array.isArray(node.segments) || node.segments.length !== points.length) return invalid;
  const segments = node.segments, nativeLine = segments[match.line], nativeArc = segments[match.arc];
  if (!record(nativeLine) || nativeLine.kind !== 'line' || !record(nativeArc) || nativeArc.kind !== 'arc'
    || !point(nativeArc.center) || nativeArc.direction !== (bulges[match.arc] > 0 ? 'ccw' : 'cw')) return invalid;
  for (const i of new Set([match.line, (match.line + 1) % points.length, match.arc, (match.arc + 1) % points.length])) {
    const segment = segments[i];
    if (!record(segment) || !point(segment.start) || distance(segment.start, points[i]) > linear) return invalid;
  }
  const nativePoint = (i: number) => (segments[i] as { start: Point }).start;
  const centre = nativeArc.center, p = nativePoint(match.joint), start = nativePoint(match.arc), end = nativePoint((match.arc + 1) % points.length);
  if (distance(centre, match.centre) > linear || Math.abs(distance(start, centre) - match.radius) > linear
    || Math.abs(distance(end, centre) - match.radius) > linear
    || !endpointPerpendicularMet(vector(nativePoint(match.line), nativePoint((match.line + 1) % points.length)), vector(centre, p))) return invalid;
  return null;
}
