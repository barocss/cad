import { curveD1Evaluator } from '../core/derivatives.js';
import { gauss } from '../core/quadrature.js';
import { add, cross, dist, dot, len, scale, sub, unit } from '../core/vec3.js';
import type { Point } from '../types.js';
import type { Brep } from './brep-core.js';
import { sphericalHalfTurnFrame } from './sphere-cone-seams.js';

type Edge = Brep['edges'][number];
type Sphere = NonNullable<ReturnType<typeof sphericalHalfTurnFrame>>;
const coarseRule = gauss(12), fineRule = gauss(20);

// Admit a whole short positive-weight quadratic against the known sphere, independent
// of edge names, file provenance and fitted circle centres.
function boundaryArc(edge: Edge, sphere: Sphere) {
  const curve = edge.curve;
  if (curve.degree !== 2 || curve.controlPoints.length !== 3 || curve.knots.length !== 6) return;
  const [lo, a, b, c, d, hi] = curve.knots, [wa, wm, wb] = curve.weights;
  if (a !== lo || b !== lo || c !== hi || d !== hi || !(lo < hi) || !(wa > 0 && wm > 0) || wb !== wa) return;
  const [p, m, q] = curve.controlPoints.map(point => sub(point, sphere.centre));
  const r = sphere.radius, start = unit(p), end = unit(q), cosine = dot(start, end);
  const limit = Math.min(edge.tolerance, r * 1e-9);
  if (!(cosine > -1e-9 && cosine < 1 - 1e-9 && limit > 0)
    || Math.abs(len(p) - r) > limit || Math.abs(len(q) - r) > limit
    || dist(m, scale(add(start, end), r / (1 + cosine))) > limit
    || Math.abs(wm / wa - Math.sqrt((1 + cosine) / 2)) > limit / r) return;
  return { start, end, poles: [p, m, q], curve, lo, hi, limit };
}

type Arc = NonNullable<ReturnType<typeof boundaryArc>>;
type LoopArc = { arc: Arc; reversed: boolean; from: string; to: string };

function solidAngle(arcs: readonly LoopArc[], pole: Point, rule: typeof fineRule) {
  let result = 0;
  for (const { arc, reversed } of arcs) {
    const at = curveD1Evaluator({ ...arc.curve, controlPoints: arc.poles }), span = arc.hi - arc.lo;
    for (const [i, sample] of rule.x.entries()) {
      const { point: position, derivative } = at(arc.lo + span * sample);
      const length = len(position);
      // Integrate a regular solid-angle potential along the radial image of the native curve.
      const angle = dot(cross(pole, position), derivative) / (length * (length + dot(pole, position)));
      result += angle * span * rule.w[i] * (reversed ? -1 : 1);
    }
  }
  return result;
}

/** Default-area corrections for small, convex minor-arc trims of a proven spherical carrier. */
export function sphericalTrimAreas(brep: Brep): ReadonlyMap<string, number> {
  const areas = new Map<string, number>();
  const candidates = brep.faces.filter(({ surface, loops }) => surface.kind === 'surface'
    && surface.degreeU === 2 && surface.degreeV === 2 && surface.controlPoints.length === 5 && loops.length === 1);
  if (!candidates.length) return areas;
  const loops = new Map(brep.loops.map(loop => [loop.id, loop]));
  const uses = new Map(brep.coedges.map(use => [use.id, use]));
  const edges = new Map(brep.edges.map(edge => [edge.id, edge]));
  const vertices = new Map(brep.vertices.map(vertex => [vertex.id, vertex.point]));
  for (const face of candidates) {
    if (face.surface.kind !== 'surface') continue;
    const circle = sphericalHalfTurnFrame(face.surface), loop = loops.get(face.loops[0]);
    if (!circle || loop?.kind !== 'outer' || loop.face !== face.id || loop.coedges.length < 3 || loop.coedges.length > 4) continue;
    const arcs: LoopArc[] = [];
    for (const id of loop.coedges) {
      const use = uses.get(id);
      const edge = use && edges.get(use.edge);
      const arc = edge && boundaryArc(edge, circle);
      if (!use || use.loop !== loop.id || use.pcurve || !edge || !arc) break;
      const [edgeStart, edgeEnd] = edge.vertices.map(vertex => vertices.get(vertex));
      if (!edgeStart || !edgeEnd || dist(edgeStart, arc.curve.controlPoints[0]) > arc.limit
        || dist(edgeEnd, arc.curve.controlPoints[2]) > arc.limit) break;
      const reversed = use.sense === 'reversed', [from, to] = reversed ? [...edge.vertices].reverse() : edge.vertices;
      if (arcs.length && arcs[arcs.length - 1].to !== from) break;
      arcs.push({ arc, reversed, from, to });
    }
    if (arcs.length !== loop.coedges.length || arcs.at(-1)!.to !== arcs[0].from || new Set(arcs.map(a => a.from)).size !== arcs.length) continue;
    const rim = arcs.map(({ arc, reversed }) => reversed ? arc.end : arc.start);
    const pole = unit(rim.reduce((sum, point) => add(sum, point), [0, 0, 0] as Point));
    const planes = rim.map((point, i) => unit(cross(point, rim[(i + 1) % rim.length])));
    const side = circle.orientation * (face.sense === 'forward' ? 1 : -1);
    if (arcs.some(({ arc }) => arc.poles.some(point =>
      dot(circle.inside, point) < -1e-9 * circle.radius || dot(pole, point) < circle.radius / 2))
      || planes.some(plane => side * dot(plane, pole) <= 1e-9
        || rim.some(point => side * dot(plane, point) < -1e-9))) continue;
    try {
      const coarse = solidAngle(arcs, pole, coarseRule), fine = solidAngle(arcs, pole, fineRule);
      if (fine * side > 0 && Math.abs(fine) < Math.PI && Math.abs(coarse - fine) <= 1e-10 * Math.abs(fine))
        areas.set(face.id, Math.abs(fine) * circle.radius ** 2);
    } catch {
      // Keep surface quadrature when the native boundary cannot be evaluated.
    }
  }
  return areas;
}
