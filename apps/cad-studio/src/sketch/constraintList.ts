import { rectilinearConflict } from '@barocss/cad-model/sketch/conflict';
import { CadNumericPolicy } from '@barocss/cad';
import { ELLIPSE_POINTS, ellipseMatches } from '@barocss/cad-model/sketch/ellipse';
import { circlePairKeys, constraintEntries, hvOf, samePick, solveShape, type ConstraintEntry, type ConstraintKind, type Polygon, type SketchPick } from '@barocss/cad-model/sketch/rules';

const isSolverLength = (value: number | undefined): value is number =>
  value !== undefined && value >= 0.001 && value <= 2 * CadNumericPolicy.coordinateAbs * Math.SQRT2;

export function constraintListRows(shape: Polygon): ConstraintEntry[] {
  const rows = constraintEntries(shape);
  if (!shape.ellipse || !ellipseMatches(shape)) return rows;
  const arcs = rows.filter(row => row.label === 'Arc');
  return [{
    id: 'ellipse', label: 'Ellipse', detail: `${2 * ELLIPSE_POINTS} tangent arcs`, removable: false,
    involves: arcs.flatMap(row => row.involves),
  }, ...rows.filter(row => row.label !== 'Arc')];
}

export function constraintInvolves(row: ConstraintEntry, picked: readonly SketchPick[]): boolean {
  return row.involves.some(entity => picked.some(pick => samePick(entity, pick)));
}

/** The active circle distance can be inspected even when Dimension consumed its pair of picks. */
export function activeCircleDistanceRow(shape: Polygon, editDim: string | null | undefined): string | undefined {
  if (!editDim?.startsWith('cc')) return;
  const index = shape.rules?.findIndex(rule => {
    if (rule.kind !== 'ccdist' && rule.kind !== 'ccdx' && rule.kind !== 'ccdy') return false;
    const keys = circlePairKeys(rule.a, rule.b);
    return editDim === keys[rule.kind === 'ccdist' ? 'dist' : rule.kind === 'ccdx' ? 'dx' : 'dy'];
  });
  if (index !== undefined && index >= 0) return 'rule:' + index;
}

export function filterConstraintList(rows: readonly ConstraintEntry[], kind: string, pickedOnly: boolean,
  picked: readonly SketchPick[], activeId?: string): ConstraintEntry[] {
  return rows.filter(row => (!kind || row.label === kind) && (!pickedOnly || row.id === activeId || constraintInvolves(row, picked)));
}

/** Prove the attempted length contradicts one existing opposite length and the four axis locks. */
export function opposingLengthConflict(shape: Polygon, key: string, value: number): number | undefined {
  const match = /^len([0-3])$/.exec(key);
  if (!match || !shape.closed || shape.pending || shape.points.length !== 4 || shape.bulges?.some(bulge => bulge !== 0)
    || !Number.isFinite(value) || value < 0.001) return;
  const edge = Number(match[1]), opposite = (edge + 2) % 4;
  if (!shape.lengths || !Object.hasOwn(shape.lengths, opposite)) return;
  const existing = shape.lengths[opposite];
  if (existing === undefined || !Number.isFinite(existing) || existing < 0.001) return;
  const hv = hvOf(shape);
  const alternating = (axis: number[], start: number) => axis.length === 2 && axis.includes(start) && axis.includes(start + 2);
  if (!(alternating(hv.h, 0) && alternating(hv.v, 1) || alternating(hv.h, 1) && alternating(hv.v, 0))) return;
  if (!rectilinearConflict(shape.points, { hv, lengths: { [edge]: value, [opposite]: existing } }).proven) return;
  // The subset names a participating constraint. The full solve must also classify the refusal as a conflict.
  const report = solveShape({ ...shape, hv, lengths: { ...shape.lengths, [edge]: value } });
  if (!report.ok && report.conflict) return opposite;
}

/** A centre distance cannot be shorter than a projection of that same pair. */
export function circleDistanceConflict(shape: Polygon, key: string, value: number) {
  const match = /^ccdist(\d+)_(\d+)$/.exec(key);
  if (!match || !shape.closed || shape.pending || !isSolverLength(value)) return;
  const a = Number(match[1]), b = Number(match[2]);
  if (a >= b || !shape.circles?.[a] || !shape.circles[b]) return;
  // The axis projection can spend two tie residuals, one run residual and one length
  // residual. Allow one for the direct length and one more for floating-point roundoff.
  const margin = 6 * CadNumericPolicy.linearTolerance;
  let conflict: { id: string; axis: 'horizontal' | 'vertical'; value: number } | undefined;
  for (const [i, rule] of (shape.rules ?? []).entries()) {
    if ((rule.kind !== 'ccdx' && rule.kind !== 'ccdy') || !isSolverLength(rule.value)
      || !(rule.a === a && rule.b === b || rule.a === b && rule.b === a)
      || rule.value - value <= margin || (conflict && rule.value <= conflict.value)) continue;
    conflict = { id: `rule:${i}`, axis: rule.kind === 'ccdx' ? 'horizontal' : 'vertical', value: rule.value };
  }
  return conflict;
}

/** Two unambiguous projections of the same circle pair determine their straight-line distance. */
export function circleAxisPairConflict(shape: Polygon, key: string, value: number) {
  const match = /^ccdist(\d+)_(\d+)$/.exec(key);
  if (!match || !shape.closed || shape.pending || !isSolverLength(value)) return;
  const a = Number(match[1]), b = Number(match[2]);
  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b) || a >= b || !shape.circles?.[a] || !shape.circles[b]) return;
  type Projection = { id: string; value: number };
  let horizontal: Projection | undefined, vertical: Projection | undefined;
  for (const [i, rule] of (shape.rules ?? []).entries()) {
    if ((rule.kind !== 'ccdx' && rule.kind !== 'ccdy') || !(rule.a === a && rule.b === b || rule.a === b && rule.b === a)) continue;
    if (!isSolverLength(rule.value)) return;
    const projection = { id: `rule:${i}`, value: rule.value };
    if (rule.kind === 'ccdx') {
      if (horizontal) return;
      horizontal = projection;
    } else {
      if (vertical) return;
      vertical = projection;
    }
  }
  if (!horizontal || !vertical) return;
  const distance = Math.hypot(horizontal.value, vertical.value);
  // Each projection can spend at most four linear residuals; their Euclidean norm
  // spends at most sqrt(32). The direct length adds one, with extra space for roundoff.
  const margin = 16 * CadNumericPolicy.linearTolerance
    + 16 * Number.EPSILON * Math.max(distance, value);
  if (Math.abs(distance - value) <= margin) return;
  return { horizontal, vertical, distance };
}

/** Find a locked span and opposite distance that jointly rule out either absolute-distance branch. */
export function edgeCircleDistanceConflict(shape: Polygon, key: string, value: number) {
  const match = /^cedge([0-3])_(\d+)$/.exec(key);
  if (!match || !shape.closed || shape.pending || shape.points.length !== 4 || !isSolverLength(value)) return;
  const edge = Number(match[1]), circle = Number(match[2]), opposite = (edge + 2) % 4;
  if (!shape.circles?.[circle] || shape.bulges?.[edge] || shape.bulges?.[opposite]) return;
  const hv = hvOf(shape);
  const axisOf = (i: number) => hv.h.includes(i) === hv.v.includes(i) ? undefined : hv.h.includes(i) ? 1 : 0;
  const axis = axisOf(edge);
  if (axis === undefined || axisOf(opposite) !== axis) return;
  // Two helper distances, one side projection and one endpoint tie can spend up to
  // eleven linear residuals in total. Keep extra space for binary64 roundoff.
  const margin = 16 * CadNumericPolicy.linearTolerance;
  for (const spanEdge of [(edge + 1) % 4, (edge + 3) % 4]) {
    const span = shape.lengths?.[spanEdge];
    if (!isSolverLength(span) || shape.bulges?.[spanEdge] || axisOf(spanEdge) !== 1 - axis) continue;
    for (const [index, rule] of (shape.rules ?? []).entries()) {
      if (rule.kind !== 'cedge' || rule.edge !== opposite || rule.circle !== circle || rule.axis !== axis || !isSolverLength(rule.value)) continue;
      if (Math.abs(span - (value + rule.value)) > margin && Math.abs(span - Math.abs(value - rule.value)) > margin) {
        return { ids: [`len:${spanEdge}`, `rule:${index}`], span, spanEdge, opposite, oppositeDistance: rule.value };
      }
    }
  }
}

function explicitFixedPoint(shape: Polygon, point: number) {
  const matches = (shape.rules ?? []).flatMap((rule, i) =>
    rule.kind === 'fix' && rule.point === point ? [{ id: `rule:${i}`, at: rule.at }] : []);
  if (matches.length !== 1) return;
  const [fix] = matches;
  if (fix.at.length === 2 && [...fix.at].every(coordinate => Number.isFinite(coordinate) && Math.abs(coordinate) <= CadNumericPolicy.coordinateAbs)) return fix;
}

/** A straight edge with two fixed ends cannot align if the relevant coordinates differ. */
export function fixedEdgeAxisConflict(shape: Polygon, picked: readonly SketchPick[], kind: ConstraintKind) {
  if ((kind !== 'horizontal' && kind !== 'vertical') || !shape.closed || shape.pending || picked.length !== 1) return;
  const [pick] = picked;
  if (pick.kind !== 'edge' || pick.done || !Number.isSafeInteger(pick.i)) return;
  const a = pick.i, b = (a + 1) % shape.points.length;
  if (a <= 0 || b <= 0 || !shape.points[a] || !shape.points[b] || shape.bulges?.[a]) return;
  const hv = hvOf(shape);
  if (hv.h.includes(a) || hv.v.includes(a)) return;

  const first = explicitFixedPoint(shape, a), second = explicitFixedPoint(shape, b);
  if (!first || !second) return;
  const axis = kind === 'vertical' ? 0 : 1;
  const gap = Math.abs(second.at[axis] - first.at[axis]);
  const margin = 8 * CadNumericPolicy.linearTolerance + 16 * Number.EPSILON * CadNumericPolicy.coordinateAbs;
  if (gap <= margin) return;
  return {
    ids: [first.id, second.id],
    reason: `Edge ${a + 1} cannot be ${kind} because fixed points ${a + 1} and ${b + 1} differ by ${Number(gap.toPrecision(15))} mm in ${axis === 0 ? 'X' : 'Y'}.`,
  };
}

/** Prove a refused relationship from the targets of four distinct explicit Fix constraints. */
export function fixedEdgePairConflict(shape: Polygon, picked: readonly SketchPick[], kind: ConstraintKind) {
  if ((kind !== 'parallel' && kind !== 'perpendicular') || !shape.closed || shape.pending || picked.length !== 2) return;
  const [first, second] = picked;
  if (first.kind !== 'edge' || second.kind !== 'edge' || first.done || second.done) return;
  const a = first.i, b = second.i, n = shape.points.length;
  if (![a, b].every(i => Number.isSafeInteger(i) && i > 0 && i + 1 < n && !shape.bulges?.[i])
    || Math.abs(a - b) < 2) return;
  if (shape.rules?.some(rule => rule.kind === kind
    && ((rule.a === a && rule.b === b) || (rule.a === b && rule.b === a)))) return;
  const startA = explicitFixedPoint(shape, a), endA = explicitFixedPoint(shape, a + 1);
  const startB = explicitFixedPoint(shape, b), endB = explicitFixedPoint(shape, b + 1);
  if (!startA || !endA || !startB || !endB) return;

  const ax = endA.at[0] - startA.at[0], ay = endA.at[1] - startA.at[1];
  const bx = endB.at[0] - startB.at[0], by = endB.at[1] - startB.at[1];
  // Fix allows 1e-7 mm in each endpoint coordinate. Bound the resulting vector error and subtraction roundoff.
  const vectorError = 4 * CadNumericPolicy.linearTolerance + 32 * Number.EPSILON * CadNumericPolicy.coordinateAbs;
  const lengthA = Math.hypot(ax, ay) - vectorError, lengthB = Math.hypot(bx, by) - vectorError;
  if (!isSolverLength(lengthA) || !isSolverLength(lengthB)) return;
  const cross = Math.abs(ax * by - ay * bx), dot = Math.abs(ax * bx + ay * by);
  const gap = kind === 'parallel' ? Math.atan2(cross, dot) : Math.atan2(dot, cross);
  // Include the signed-angle residual tolerance and both directions' maximum rotation.
  const margin = vectorError / lengthA + vectorError / lengthB + 1e-9 + 64 * Number.EPSILON;
  if (gap <= margin) return;
  return {
    ids: [startA.id, endA.id, startB.id, endB.id],
    reason: `Edges ${a + 1} and ${b + 1} cannot be ${kind} with all four endpoints fixed.`,
  };
}

/** A circular arc's chord cannot exceed its diameter. Attribute only explicit endpoint locks. */
export function fixedArcRadiusConflict(shape: Polygon, key: string, value: number) {
  const match = /^rad(\d+)$/.exec(key);
  if (!match || !shape.closed || shape.pending || !isSolverLength(value)) return;
  const a = Number(match[1]), b = a + 1;
  if (!Number.isSafeInteger(a) || !shape.points[a] || !shape.points[b] || !a) return;
  const bulge = shape.bulges?.[a];
  if (!bulge || !Number.isFinite(bulge)) return;
  const first = explicitFixedPoint(shape, a), second = explicitFixedPoint(shape, b);
  if (!first || !second) return;
  const chord = Math.hypot(second.at[0] - first.at[0], second.at[1] - first.at[1]);
  // Allow for both Fix residuals, the radius residual and subtraction at large coordinates.
  const margin = 8 * CadNumericPolicy.linearTolerance + 16 * Number.EPSILON * CadNumericPolicy.coordinateAbs;
  if (chord - 2 * value <= margin) return;
  return { ids: [first.id, second.id], points: [a, b], chord };
}

/** Attribute a refused point distance or straight edge length to the two explicit Fix rows that determine it. */
export function fixedPointDistanceConflict(shape: Polygon, key: string, value: number) {
  if (!shape.closed || shape.pending || !isSolverLength(value)) return;
  const pair = /^(dist|dx|dy)(\d+)_(\d+)$/.exec(key);
  const edgeMatch = pair ? null : /^len(\d+)$/.exec(key);
  let kind: 'dist' | 'dx' | 'dy', a: number, b: number;
  if (pair) {
    kind = pair[1] as 'dist' | 'dx' | 'dy';
    a = Number(pair[2]);
    b = Number(pair[3]);
    // The implicit anchor also fixes point 0. This diagnostic identifies explicit Fix rows only.
    if (a <= 0 || a >= b || !shape.points[a] || !shape.points[b]) return;
  } else if (edgeMatch) {
    const edge = Number(edgeMatch[1]);
    if (!Number.isSafeInteger(edge) || edge < 0 || edge >= shape.points.length || shape.bulges?.[edge]) return;
    kind = 'dist';
    a = edge;
    b = (edge + 1) % shape.points.length;
    if (a <= 0 || b <= 0 || a === b || !shape.points[a] || !shape.points[b]) return;
  } else return;
  const first = explicitFixedPoint(shape, a), second = explicitFixedPoint(shape, b);
  if (!first || !second) return;
  const dx = Math.abs(second.at[0] - first.at[0]), dy = Math.abs(second.at[1] - first.at[1]);
  const distance = kind === 'dx' ? dx : kind === 'dy' ? dy : Math.hypot(dx, dy);
  // Include both fixed-point residuals, the distance measurement and (for axes)
  // its helper ties and run, with room for floating-point arithmetic.
  if (Math.abs(distance - value) <= 8 * CadNumericPolicy.linearTolerance) return;
  return { ids: [first.id, second.id], points: [a, b], distance };
}
