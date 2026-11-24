import { curveDomain, surfaceDomain } from '../core/math.js';
import { add, cross, dot, len, scale, sub } from '../core/vec3.js';
import { revolutionOf } from '../nurbs/surfaces/surface-revolution.js';
import { geometryScaleMM } from '../numeric-policy.js';
import type { Curve, Point, Surface } from '../types.js';
import { faceGeometry } from './analytic-boolean.js';
import type { Brep, BrepCoedge } from './brep-core.js';
import { circleOf } from './brep-tessellate.js';

/** Compare the complete rational coefficients, allowing only reconstruction roundoff and edge reversal. */
function directionOf(edge: Curve, boundary: Curve, roundoff: number): 1 | -1 | undefined {
  if (edge.degree !== 2 || boundary.degree !== 2 || edge.knots.length !== boundary.knots.length
    || edge.controlPoints.length !== boundary.controlPoints.length || edge.weights.length !== boundary.weights.length) return;
  const [a, b] = curveDomain(edge), [c, d] = curveDomain(boundary);
  if (!(a < b && c < d) || edge.weights.some(w => !(w > 0)) || boundary.weights.some(w => !(w > 0))) return;
  const same = (reverse: boolean) => edge.knots.every((knot, i) => {
    const j = reverse ? boundary.knots.length - 1 - i : i;
    const at = (boundary.knots[j] - c) / (d - c);
    return Math.abs((knot - a) / (b - a) - (reverse ? 1 - at : at)) <= 64 * Number.EPSILON;
  }) && edge.weights.every((weight, i) => {
    const j = reverse ? edge.weights.length - 1 - i : i, first = reverse ? boundary.weights.at(-1)! : boundary.weights[0];
    return Math.abs(weight / edge.weights[0] - boundary.weights[j] / first) <= 64 * Number.EPSILON
      && len(sub(edge.controlPoints[i], boundary.controlPoints[j])) <= roundoff;
  });
  const forward = same(false), reversed = same(true);
  if (forward !== reversed) return forward ? 1 : -1;
}

/** A whole circular boundary of a clamped chart. No inverse map, sampled fit or interior isocurve is admitted. */
function circularBinding(edge: Curve, surface: Surface, roundoff: number): Curve | undefined {
  const { u, v } = surfaceDomain(surface), matches: Curve[] = [], grid = surface.controlPoints;
  const [a, b] = curveDomain(edge);
  const bind = (degree: number, knots: number[], points: Point[], weights: number[], fixed: number,
    domain: readonly [number, number], varying: 'u' | 'v') => {
    const boundary: Curve = { kind: 'curve', id: 'boundary', degree, knots, controlPoints: points, weights };
    const direction = directionOf(edge, boundary, roundoff);
    if (!direction) return;
    const range = direction === 1 ? domain : [domain[1], domain[0]];
    const point = (at: number): Point => varying === 'u' ? [at, fixed, 0] : [fixed, at, 0];
    matches.push({ kind: 'curve', id: 'pcurve', degree: 1, knots: [a, a, b, b],
      controlPoints: [point(range[0]), point(range[1])], weights: [1, 1] });
  };
  for (const end of [0, 1]) {
    const row = end ? grid.length - 1 : 0, col = end ? grid[0].length - 1 : 0;
    const clamped = (knots: number[], degree: number, at: number) =>
      (end ? knots.slice(-degree - 1) : knots.slice(0, degree + 1)).every(knot => knot === at);
    if (clamped(surface.knotsU, surface.degreeU, u[end]))
      bind(surface.degreeV, surface.knotsV, grid[row], surface.weights[row], u[end], v, 'v');
    if (clamped(surface.knotsV, surface.degreeV, v[end]))
      bind(surface.degreeU, surface.knotsU, grid.map(row => row[col]), surface.weights.map(row => row[col]), v[end], u, 'u');
  }
  if (matches.length === 1) return matches[0];
}

function boundAs(actual: Curve | null, expected: Curve | undefined): boolean {
  return !!actual && !!expected && actual.degree === 1 && actual.weights.length === 2
    && actual.weights[0] > 0 && actual.weights[0] === actual.weights[1]
    && actual.knots.length === 4 && actual.knots.every((knot, i) => knot === expected.knots[i])
    && actual.controlPoints.length === 2 && actual.controlPoints.every((point, i) =>
      len(sub(point, expected.controlPoints[i])) <= 512 * Number.EPSILON * Math.max(1, geometryScaleMM(expected.controlPoints)));
}

function joinOwners(body: Brep, edge: string, scaleMM: number) {
  const uses = body.coedges.filter(use => use.edge === edge);
  if (uses.length !== 2 || uses[0].twin !== uses[1].id || uses[1].twin !== uses[0].id || uses[0].sense === uses[1].sense) return;
  const owners = uses.map(use => {
    const faces = body.faces.filter(face => face.loops.includes(use.loop));
    if (faces.length !== 1 || faces[0].surface.kind !== 'surface') return;
    const face = faces[0], surface = face.surface as Surface;
    const geometry = faceGeometry(face, scaleMM), revolution = geometry.kind === 'other' ? revolutionOf(surface, scaleMM) : undefined;
    const kind = geometry.kind === 'cylinder' ? 'cylinder' : revolution?.profile.kind === 'arc' ? 'torus' : undefined;
    const torus = revolution?.profile.kind === 'arc' ? {
      center: add(revolution.c, scale(revolution.a, revolution.profile.c[1])), axis: revolution.a,
      major: revolution.profile.c[0], minor: revolution.profile.r,
    } : undefined;
    return kind ? { use, face, surface, kind, torus } : undefined;
  });
  const [first, second] = owners;
  if (!first || !second || first.face.id === second.face.id) return;
  if (first.kind !== second.kind) return [first, second];
  // Two perpendicular quarter carriers have no cylinder owner to distinguish the two uses.
  // Keep only regular tori with perpendicular native axes; signed use and carrier identity
  // below must independently identify each inherited owner after reconstruction.
  const a = first.torus, b = second.torus, roundoff = 512 * Number.EPSILON * scaleMM;
  if (a && b && a.major > a.minor && b.major > b.minor && a.minor > 0 && b.minor > 0
    && Math.abs(dot(a.axis, b.axis)) * Math.max(a.major, b.major) <= roundoff) return [first, second];
}

/** Retain only inherited whole circular cylinder/bend or perpendicular bend/bend joints after a finish rebuild. */
export function retainSweepCircularJoinBindings(source: Brep, result: Brep): Brep {
  if (source.source.family !== 'sweep-curve') return result;
  const scaleMM = Math.max(1, geometryScaleMM(source.vertices.map(vertex => vertex.point)),
    geometryScaleMM(result.vertices.map(vertex => vertex.point)));
  const roundoff = 512 * Number.EPSILON * scaleMM;
  const originals = source.edges.flatMap(edge => {
    if (edge.curve.degree !== 2 || !circleOf(edge.curve)) return [];
    const owners = joinOwners(source, edge.id, scaleMM);
    if (!owners || !owners.every(owner => boundAs(owner.use.pcurve, circularBinding(edge.curve, owner.surface, roundoff)))) return [];
    return [{ edge, owners }];
  });
  const pairs = result.edges.flatMap(edge => {
    const matches = originals.flatMap(original => {
      const direction = directionOf(edge.curve, original.edge.curve, roundoff);
      return direction ? [{ original, direction }] : [];
    });
    return matches.length === 1 ? [{ edge, original: matches[0].original, direction: matches[0].direction }] : [];
  });
  const keep = new Map<string, Curve>();
  for (const { edge, original, direction } of pairs) {
    if (pairs.filter(pair => pair.original === original).length !== 1) continue;
    const owners = joinOwners(result, edge.id, scaleMM);
    if (!owners) continue;
    const bindings = owners.map(owner => {
      const candidates = original.owners.filter(candidate => candidate.kind === owner.kind
        && (candidate.use.sense === owner.use.sense) === (direction === 1));
      if (candidates.length !== 1) return;
      const old = candidates[0];
      if (original.owners.every(candidate => candidate.kind === 'torus')) {
        const a = old.torus, b = owner.torus;
        if (!a || !b || len(sub(a.center, b.center)) > roundoff || Math.abs(a.major - b.major) > roundoff
          || Math.abs(a.minor - b.minor) > roundoff || len(cross(a.axis, b.axis)) * Math.max(a.major, b.major) > roundoff) return;
      }
      const binding = circularBinding(edge.curve, owner.surface, roundoff);
      return binding && (!owner.use.pcurve || boundAs(owner.use.pcurve, binding)) ? binding : undefined;
    });
    if (bindings.every((binding): binding is Curve => !!binding))
      owners.forEach((owner, i) => keep.set(owner.use.id, bindings[i]));
  }
  if (!keep.size) return result;
  return { ...result, coedges: result.coedges.map((use): BrepCoedge => {
    const pcurve = keep.get(use.id);
    if (!pcurve) return use;
    const { id, edge, sense, loop, next, prev, twin } = use;
    return { id, edge, sense, loop, next, prev, twin, pcurve };
  }) };
}
