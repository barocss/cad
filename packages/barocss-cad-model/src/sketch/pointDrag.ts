import { buildProfileLoop, isExtrudedProfileError, type ProfileLoop } from '@barocss/cad';
import { outlineMobility, type OutlineMobility } from './mobility';
import { outlineSegments, settledOutlineMobility, solveOutline, type OutlineConstraints, type P2 } from './profile';
import { constraintsOf, type Polygon } from './rules';
import type { SketchShape } from './types';

const point = (p: P2) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
const distance = (a: P2, b: P2) => Math.hypot(a[0] - b[0], a[1] - b[1]);
type DragFacts = { mobility: OutlineMobility; loop: ProfileLoop; constraints: OutlineConstraints };
// Sketch edits replace their shape object. Hover and each pointer frame reuse the same source facts.
const cached = new WeakMap<Polygon, DragFacts | null>();

function loop(shape: Polygon) {
  try { return buildProfileLoop(outlineSegments(shape.points, shape.bulges)); }
  catch (cause) {
    if (!isExtrudedProfileError(cause)) throw cause;
    return null;
  }
}

function inspect(source: Polygon): DragFacts | null {
  if (source.circles?.length || source.circleIds?.length || source.points.some(p => !point(p))) return null;
  const n = source.points.length;
  if (source.bulges && (source.bulges.length !== n || Array.from(source.bulges).some(b => !Number.isFinite(b)))) return null;
  if (source.bulges?.some((bulge, i) => bulge && (!(Math.abs(bulge) < 1)
    || !Number.isFinite(source.radii?.[i]) || !(source.radii![i] > 0)
    || !source.tangents?.includes(i) || !source.tangents.includes((i + 1) % n)))) return null;
  // The mobility diagnosis checks the current authored equations before it exposes a direction.
  const mobility = outlineMobility(source);
  if (!mobility?.points.length) return null;
  const built = loop(source);
  return built ? { mobility, loop: built, constraints: constraintsOf(source) } : null;
}

function facts(source: SketchShape | null): DragFacts | null {
  if (source?.kind !== 'polygon') return null;
  if (cached.has(source)) return cached.get(source)!;
  const result = inspect(source);
  cached.set(source, result);
  return result;
}

/** One settled independent outline, with straight sides or bounded, radius-locked tangent rounds. */
export function canDragOutlinePoint(source: SketchShape | null): source is Polygon {
  return facts(source) !== null;
}

/**
 * Try the pointer target, then its verified local one-DOF direction. The projected point must still
 * satisfy every finite-motion constraint; a tangent direction alone is never acceptance evidence.
 * A refusal returns null, so the caller can keep its last valid preview. No pointer rule is stored.
 */
export function dragOutlinePoint(source: Polygon, index: number, target: P2): Polygon | null {
  const sourceFacts = facts(source);
  if (!sourceFacts || !Number.isInteger(index) || !point(target)) return null;
  const { mobility, loop: before, constraints } = sourceFacts;
  const selected = mobility.directions.find(item => item.point === index);
  if (!selected || !selected.motion) return null;
  const attempt = (at: P2): Polygon | null => {
    if (distance(source.points[index], at) <= 1e-9) return source;
    // Keep the source seed and its anchor: replacing the seed point would move p0's implicit anchor
    // or change the branch used by unsigned dimensions and nearest-angle relations.
    const temporary = { ...constraints, rules: [...(source.rules ?? []), { kind: 'fix' as const, point: index, at }] };
    const result = solveOutline(source.points, temporary, source.bulges);
    if (!result.ok || distance(result.points[index], at) > 1e-7 || distance(result.points[0], source.points[0]) > 1e-7) return null;
    const candidate: Polygon = { ...source, points: result.points, bulges: result.bulges,
      // Legacy outlines without an explicit HV recipe must retain the source's effective axes.
      hv: source.hv ?? constraints.hv };
    // Reconstructing a bulge is a separate step after the solver's residual check. Recheck those
    // adopted coefficients, with the pointer and the original constraints, without taking a step.
    if (!settledOutlineMobility(candidate.points, temporary, candidate.bulges)) return null;
    const candidateMobility = outlineMobility(candidate);
    if (!candidateMobility) return null;
    if (candidate.bulges?.some((bulge, i) => source.bulges?.[i]
      && (Math.sign(bulge) !== Math.sign(source.bulges[i]) || !(Math.abs(bulge) < 1)))) return null;
    const built = loop(candidate);
    if (!built || built.reversed !== before.reversed) return null;
    cached.set(candidate, candidateMobility.points.length
      ? { mobility: candidateMobility, loop: built, constraints: constraintsOf(candidate) } : null);
    return candidate;
  };
  const exact = attempt(target);
  if (exact || selected.motion.dimension !== 1) return exact;
  const origin = source.points[index], direction = selected.motion.direction;
  const along = (target[0] - origin[0]) * direction[0] + (target[1] - origin[1]) * direction[1];
  const projected: P2 = [origin[0] + along * direction[0], origin[1] + along * direction[1]];
  return point(projected) ? attempt(projected) : null;
}
