import { CadNumericPolicy, faceGeometry, type Brep, type BrepFace, type BrepProjection, type Point, type ProjectedEdge } from '@barocss/cad';
import { cross, dot, sub } from '../engine/vec3';
import type { XY } from './types';

/** One complete circular cut face in the section's unchanged view coordinates, outer radius first. */
export type SectionCircleHatch = { center: XY; radii: [number] | [number, number] };

const TOL = CadNumericPolicy.linearTolerance;
const TAU = 2 * Math.PI;
const near = (a: readonly number[], b: readonly number[]) => Math.hypot(...a.map((value, i) => value - b[i])) <= TOL;
const project = (point: readonly number[], pr: BrepProjection): XY => [dot(point, pr.right), dot(point, pr.up)];

/** A projected circle descriptor supplies a carrier, never proof that a native curve follows it. */
function literalArc(edge: Brep['edges'][number], projected: ProjectedEdge, pr: BrepProjection): { sweep: number; normal: Point } | undefined {
  const circle = projected.circle, curve = edge.curve, p = curve.controlPoints, w = curve.weights, knots = curve.knots;
  if (projected.kind !== 'circle' || projected.tangent || !circle || !(circle.radius > TOL) || !Number.isFinite(circle.radius)
    || ![...circle.center, ...circle.normal].every(Number.isFinite)
    || Math.abs(Math.hypot(...circle.normal) - 1) > 1e-12 || Math.abs(Math.abs(dot(circle.normal, pr.toward)) - 1) > 1e-12
    || curve.degree !== 2 || p.length < 3 || p.length % 2 !== 1 || w.length !== p.length || knots.length !== p.length + 3
    || knots[0] !== knots[1] || knots[1] !== knots[2]
    || knots.at(-1) !== knots.at(-2) || knots.at(-2) !== knots.at(-3)
    || !knots.every(Number.isFinite) || p.some(point => !point.every(Number.isFinite))) return;
  let sweep = 0, direction = 0;
  const { center, radius, normal } = circle;
  for (let i = 0; i + 2 < p.length; i += 2) {
    const weight = w[i + 1], a = sub(p[i], center), b = sub(p[i + 2], center), middle = sub(p[i + 1], center);
    if (w[i] !== 1 || w[i + 2] !== 1 || !(weight > 0 && weight < 1)
      || !(knots[i + 2] < knots[i + 3]) || (i > 0 && knots[i + 1] !== knots[i + 2])
      || [a, b, middle].some(point => Math.abs(dot(point, normal)) > TOL)
      || Math.abs(Math.hypot(...a) - radius) > TOL || Math.abs(Math.hypot(...b) - radius) > TOL) return;
    const sum = a.map((value, k) => value + b[k]);
    // Every quadratic span has its true circular tangent-intersection pole and cosine weight.
    if (Math.abs(Math.hypot(...sum) - 2 * radius * weight) > TOL
      || !near(middle, sum.map(value => value / (2 * weight * weight)))) return;
    const turn = dot(cross(a, b), normal), sign = Math.sign(turn);
    if (!sign || (direction && sign !== direction)) return;
    direction = sign;
    sweep += sign * Math.atan2(Math.abs(turn), dot(a, b));
  }
  const angular = TOL / Math.max(1, radius) + 256 * Number.EPSILON * p.length;
  if (Math.abs(Math.abs(sweep) - circle.sweep) > angular || Math.abs(sweep) > TAU + angular) return;
  // The visible ink must be this complete native arc, not a hidden, clipped or duplicate-only run.
  if (projected.pieces.length !== 1) return;
  const piece = projected.pieces[0], ink = piece.curve;
  if (!piece.visible || piece.ink === false || ink.kind !== 'arc' || !near(ink.center, project(center, pr))
    || ![...ink.u, ...ink.v, ink.t0, ink.t1].every(Number.isFinite)
    || Math.abs(Math.hypot(...ink.u) - radius) > TOL || Math.abs(Math.hypot(...ink.v) - radius) > TOL
    || Math.abs(ink.u[0] * ink.v[0] + ink.u[1] * ink.v[1]) > TOL * radius
    || Math.abs(Math.abs(ink.t1 - ink.t0) - Math.abs(sweep)) > angular) return;
  const at = (t: number): XY => [ink.center[0] + ink.u[0] * Math.cos(t) + ink.v[0] * Math.sin(t),
    ink.center[1] + ink.u[1] * Math.cos(t) + ink.v[1] * Math.sin(t)];
  const first = project(p[0], pr), last = project(p[p.length - 1], pr), low = at(ink.t0), high = at(ink.t1);
  if (!(near(first, low) && near(last, high) || near(first, high) && near(last, low))) return;
  const radial = sub(p[0], center), tangent = cross(normal, radial), half = sweep / 2;
  const midpoint = center.map((value, k) => value + radial[k] * Math.cos(half) + tangent[k] * Math.sin(half));
  if (!near(project(midpoint, pr), at((ink.t0 + ink.t1) / 2))) return;
  return { sweep, normal };
}

/** Certify one source face; a mixed or incomplete boundary leaves the polygon hatch unchanged. */
function certifiedCircleHatch(brep: Brep, face: BrepFace, pr: BrepProjection): SectionCircleHatch | undefined {
  const plane = faceGeometry(face);
  if (plane.kind !== 'plane' || dot(plane.n, pr.toward) < 1 - 1e-12
    || Math.abs(Math.hypot(...pr.right) - 1) > 1e-12 || Math.abs(Math.hypot(...pr.up) - 1) > 1e-12
    || Math.abs(dot(pr.right, pr.up)) > 1e-12 || face.loops.length < 1 || face.loops.length > 2) return;
  const loops = new Map(brep.loops.map(loop => [loop.id, loop])), uses = new Map(brep.coedges.map(use => [use.id, use]));
  const edges = new Map(brep.edges.map(edge => [edge.id, edge])), vertices = new Map(brep.vertices.map(vertex => [vertex.id, vertex.point]));
  const circles: { kind: 'outer' | 'inner'; center: Point; radius: number }[] = [];
  for (const id of face.loops) {
    const loop = loops.get(id);
    if (!loop || loop.face !== face.id || !loop.coedges.length || new Set(loop.coedges).size !== loop.coedges.length) return;
    const visited = new Set<string>();
    let center: Point | undefined, radius = 0, turn = 0, firstVertex: string | undefined, previousVertex: string | undefined;
    for (let i = 0; i < loop.coedges.length; i++) {
      const use = uses.get(loop.coedges[i]), edge = use && edges.get(use.edge);
      if (!use || !edge || use.loop !== loop.id || visited.has(edge.id)
        || use.next !== loop.coedges[(i + 1) % loop.coedges.length] || use.prev !== loop.coedges[(i + loop.coedges.length - 1) % loop.coedges.length]) return;
      visited.add(edge.id);
      const candidates = pr.edges.filter(value => value.name === (edge.name ?? edge.id));
      if (candidates.length !== 1) return;
      const projected = candidates[0], arc = literalArc(edge, projected, pr), carrier = projected.circle;
      if (!arc || !carrier || Math.abs(dot(sub(carrier.center, plane.o), plane.n)) > TOL) return;
      if (center && (!near(center, carrier.center) || Math.abs(radius - carrier.radius) > TOL)) return;
      center = carrier.center; radius = carrier.radius;
      const [a, b] = edge.vertices, pa = vertices.get(a), pb = vertices.get(b), points = edge.curve.controlPoints;
      if (!pa || !pb || !near(pa, points[0]) || !near(pb, points[points.length - 1])) return;
      const forward = use.sense === 'forward', start = forward ? a : b, end = forward ? b : a;
      if (previousVertex !== undefined && previousVertex !== start) return;
      firstVertex ??= start; previousVertex = end;
      turn += arc.sweep * (forward ? 1 : -1) * Math.sign(dot(arc.normal, pr.toward));
    }
    if (!center || firstVertex !== previousVertex || Math.abs(turn - (loop.kind === 'outer' ? TAU : -TAU)) > 256 * Number.EPSILON * brep.coedges.length) return;
    circles.push({ kind: loop.kind, center, radius });
  }
  const outer = circles.filter(circle => circle.kind === 'outer'), inner = circles.filter(circle => circle.kind === 'inner');
  if (outer.length !== 1 || inner.length !== circles.length - 1) return;
  if (inner.length && (!near(outer[0].center, inner[0].center) || !(outer[0].radius - inner[0].radius > TOL))) return;
  return { center: project(outer[0].center, pr), radii: inner.length ? [outer[0].radius, inner[0].radius] : [outer[0].radius] };
}

/** Unsupported or incomplete native evidence falls back to the unchanged polygon hatch. */
export function sectionCircleHatch(brep: Brep, face: BrepFace, pr: BrepProjection): SectionCircleHatch | undefined {
  try { return certifiedCircleHatch(brep, face, pr); } catch { return; }
}
