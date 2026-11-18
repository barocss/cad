import { arcOf, signedArea, settledOutlineMobility } from './profile';
import { constraintsOf, type Polygon } from './rules';
import type { SketchRule } from './terms';

export type PointMotion = { dimension: 1; direction: readonly [number, number] } | { dimension: 2 } | null;
export interface OutlineMobility {
  points: readonly number[];
  edges: readonly number[];
  directions: readonly { point: number; motion: PointMotion }[];
  circleDirections?: readonly { circle: number; motion: PointMotion }[];
}

const validIndex = (index: number, count: number) => Number.isInteger(index) && index >= 0 && index < count;

function supportedRule(rule: SketchRule, count: number, arc = -1, circleCount = 0): boolean {
  const valid = (index: number) => validIndex(index, count);
  const line = (index: number) => valid(index) && index !== arc;
  switch (rule.kind) {
    case 'fix': return valid(rule.point) && Array.isArray(rule.at) && rule.at.length === 2 && rule.at.every(Number.isFinite);
    case 'parallel': case 'perpendicular': case 'equal': case 'angle':
      return line(rule.a) && line(rule.b) && rule.a !== rule.b;
    case 'distance': case 'dx': case 'dy':
      return valid(rule.a) && valid(rule.b) && rule.a !== rule.b;
    case 'cdist': case 'cdx': case 'cdy':
      return circleCount === 1 && rule.circle === 0 && valid(rule.a) && Number.isFinite(rule.value) && rule.value >= 0;
    case 'symmetric': return valid(rule.a) && valid(rule.b) && rule.a !== rule.b && line(rule.line);
    default: return false;
  }
}

/** Fail closed where the existing solver would ignore malformed or non-applicable arc metadata. */
function supportedArc(shape: Polygon, arc: number): boolean {
  const n = shape.points.length, bulges = shape.bulges!;
  if (bulges.length !== n || !bulges.every(Number.isFinite)) return false;
  const a = shape.points[arc], b = shape.points[(arc + 1) % n];
  if (!a || !b || ![...a,...b].every(Number.isFinite) || a.every((v,i)=>v===b[i])) return false;
  const circle = arcOf(a,b,bulges[arc]);
  if (![...circle.center,circle.radius,circle.sweep].every(Number.isFinite) || circle.radius <= 0) return false;
  const dimensions = (record: Record<number,number> | undefined, curved: boolean) => Object.entries(record ?? {}).every(([key,value]) =>
    /^(0|[1-9][0-9]*)$/.test(key) && validIndex(Number(key),n) && (Number(key)===arc)===curved && Number.isFinite(value) && value>0);
  return dimensions(shape.lengths,false) && dimensions(shape.radii,true)
    && !(shape.hv && [...shape.hv.h,...shape.hv.v].some(i=>!validIndex(i,n)||i===arc))
    && !(shape.tangents?.some(i=>!validIndex(i,n)||(i!==arc&&(i-1+n)%n!==arc)));
}

/** Local first-order mobility of a straight outline (optionally one circle centre) or one line+arc outline; never finite-motion certification. */
export function outlineMobility(shape: Polygon): OutlineMobility | null {
  if (shape.kind !== 'polygon' || !shape.closed || shape.pending || shape.construction || shape.points.length < 3 || shape.points.length > 16
    || shape.fromSpline || shape.spline || shape.fromEllipse || shape.ellipse
    || shape.equalRadii?.length || shape.concentric?.length
    ) return null;
  const arcs = (shape.bulges ?? []).flatMap((value,i)=>value!==0?[i]:[]);
  const circleCount = shape.circles?.length ?? 0, circle = shape.circles?.[0];
  if (circleCount > 1 || circleCount && (arcs.length > 0 || !circle ||
    !Array.isArray(circle.c) || circle.c.length !== 2 || !Number.isFinite(circle.c[0]) || !Number.isFinite(circle.c[1]) || !Number.isFinite(circle.r) || circle.r <= 0)
    || shape.circleIds && (shape.circleIds.length !== circleCount || circleCount === 1 && (typeof shape.circleIds[0] !== 'string' || !shape.circleIds[0]))) return null;
  if (arcs.length>1 || (arcs.length===1 ? !supportedArc(shape,arcs[0]) : !!shape.tangents?.length || !!Object.keys(shape.radii ?? {}).length)
    || shape.rules?.some(rule=>!supportedRule(rule,shape.points.length,arcs[0]??-1,circleCount))) return null;

  const { points, hv } = shape;
  if (hv && [...hv.h, ...hv.v].some(index => !validIndex(index, points.length))) return null;

  const [x, y] = points[0];
  const relative = points.map(([u, v]) => [u - x, v - y]);
  const scale = Math.max(...relative.map(point => Math.hypot(...point)));
  if (!(Math.abs(signedArea(relative)) > 32 * Number.EPSILON * scale * scale)) return null;

  const diagnosis = settledOutlineMobility(points, constraintsOf(shape), shape.bulges);
  if (!diagnosis) return null;
  const { directions, movingArcEdges } = diagnosis;
  const moving = directions.map(item => item.point);
  const movable = new Set(moving);
  const edges = points.flatMap((_, i) => movable.has(i) || movable.has((i + 1) % points.length) || movingArcEdges.includes(i) ? [i] : []);
  return { points: moving, edges, directions, ...(circleCount ? { circleDirections: diagnosis.circleDirections } : {}) };
}
