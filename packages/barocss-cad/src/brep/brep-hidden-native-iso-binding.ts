// Private native rectangular iso binding. It grants no contour or visibility permission.
import type { Brep, BrepBody, BrepShell, BrepFace, BrepLoop, BrepCoedge, BrepEdge, BrepVertex } from './brep-core.js';
import type { Curve, Surface, Point } from '../types.js';
import { validateCurve, validateSurface } from '../core/math.js';
import { binary64Dyadic } from '../core/dyadic.js';

const RECTANGULAR_ISO_LIMITS = Object.freeze({ work: 2000000, topologyRecords: 16384, referenceEntries: 32768, integerBits: 8192, idCharacters: 256 });
export class NativeIsoBudgetError extends Error { constructor(detail: string) { super(detail); this.name = 'NativeIsoBudgetError'; } }
export type Direction = 1 | -1;
export type Domain = readonly [number, number];
export type Side = 0 | 1 | 2 | 3; // vMin, uMax, vMax, uMin; each iso uses increasing native parameter.
export interface NativeIsoParameterBinding {
  readonly edgeDomain: Domain;
  readonly isoDomain: Domain;
  readonly direction: Direction;
  readonly fixedAxis: 'u' | 'v';
  readonly fixedValue: number;
  readonly varyingAxis: 'u' | 'v';
}
export interface NativeIsoBoundary {
  readonly edge: BrepEdge;
  readonly curve: Curve;
  readonly coedge: BrepCoedge;
  readonly face: BrepFace;
  readonly originalSurface: Surface;
  readonly side: Side;
  readonly parameters: NativeIsoParameterBinding;
  /** Exact squared-distance comparisons against this represented policy bound. Not an exact coincidence claim. */
  readonly coefficientRoundoffMM: number;
  readonly pcurveRoundoffUV: number;
}
export interface NativeRectangle {
  readonly face: BrepFace;
  readonly surface: Surface;
  readonly loop: BrepLoop;
  readonly boundaries: readonly NativeIsoBoundary[];
}
export interface NativeIsoJoin {
  readonly brep: Brep;
  readonly body: BrepBody;
  readonly shell: BrepShell;
  readonly edge: BrepEdge;
  readonly curve: Curve;
  readonly first: NativeRectangle;
  readonly second: NativeRectangle;
  readonly firstBoundary: NativeIsoBoundary;
  readonly secondBoundary: NativeIsoBoundary;
  readonly authority: 'complete-native-iso-coefficients-with-reconstruction-roundoff';
}
export type NativeIsoResult = { readonly kind: 'bound'; readonly binding: NativeIsoJoin }
  | { readonly kind: 'declined'; readonly reason: string };
interface Topology {
  bodies: Map<string, BrepBody>; shells: Map<string, BrepShell>; faces: Map<string, BrepFace>;
  loops: Map<string, BrepLoop>; coedges: Map<string, BrepCoedge>; edges: Map<string, BrepEdge>; vertices: Map<string, BrepVertex>;
  uses: Map<string, BrepCoedge[]>;
  faceShells: Map<string, BrepShell[]>; shellBodies: Map<string, BrepBody[]>;
  loopFaces: Map<string, BrepFace[]>; coedgeLoops: Map<string, BrepLoop[]>;
}
interface Iso { degree: number; knots: readonly number[]; points: readonly Point[]; weights: readonly number[]; domain: Domain; fixedAxis: 'u' | 'v'; fixed: number; varyingAxis: 'u' | 'v' }
interface Dyad { m: bigint; k: number }
const CORNERS: readonly (readonly [number, number])[] = [[0, 1], [1, 2], [3, 2], [0, 3]];
const UNIT_CORNERS: readonly (readonly [number, number])[] = [[0, 0], [1, 0], [1, 1], [0, 1]];
const EPS = Number.EPSILON;
const validSense = (s: unknown): s is 'forward' | 'reversed' => s === 'forward' || s === 'reversed';
const signOf = (s: 'forward' | 'reversed'): Direction => s === 'forward' ? 1 : -1;
const finitePoint = (p: readonly number[]) => p.length === 3 && p.every(Number.isFinite);
const domain = (c: Curve): Domain => [c.knots[c.degree], c.knots[c.controlPoints.length]];

/** One caller-owned cumulative work budget. No geometry/source cache is retained. */
export function createRectangularIsoBinder() {
  let work = 0;
  const charge = (n: number) => {
    if (!Number.isSafeInteger(n) || n < 0 || work + n > RECTANGULAR_ISO_LIMITS.work) throw new NativeIsoBudgetError('Native iso binding work limit exceeded.');
    work += n;
  };
  const id = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= RECTANGULAR_ISO_LIMITS.idCharacters;
  const checkInt = (m: bigint): bigint => {
    const bits = (m < 0n ? -m : m).toString(2).length;
    if (bits > RECTANGULAR_ISO_LIMITS.integerBits) throw new NativeIsoBudgetError('Native iso binding integer width exceeded.');
    charge(1 + Math.ceil(bits / 64)); return m;
  };
  const dyad = (v: number): Dyad => { charge(64); const d = binary64Dyadic(v); checkInt(d.m); return d; };
  const sub = (a: Dyad, b: Dyad): Dyad => {
    charge(4); const k = Math.max(a.k, b.k);
    const width = (d: Dyad) => d.m === 0n ? 0 : (d.m < 0n ? -d.m : d.m).toString(2).length + k - d.k;
    if (Math.max(width(a), width(b)) + 1 > RECTANGULAR_ISO_LIMITS.integerBits) throw new NativeIsoBudgetError('Native iso subtraction preflight width exceeded.');
    return { m: checkInt((a.m << BigInt(k - a.k)) - (b.m << BigInt(k - b.k))), k };
  };
  const add = (a: Dyad, b: Dyad): Dyad => sub(a, { m: -b.m, k: b.k });
  const mul = (a: Dyad, b: Dyad): Dyad => {
    charge(8); // Binary64 differences/products below have a fixed bounded degree.
    const width = (m: bigint) => m === 0n ? 0 : (m < 0n ? -m : m).toString(2).length;
    if (width(a.m) + width(b.m) > RECTANGULAR_ISO_LIMITS.integerBits) throw new NativeIsoBudgetError('Native iso product preflight width exceeded.');
    return { m: checkInt(a.m * b.m), k: a.k + b.k };
  };
  const compare = (a: Dyad, b: Dyad): number => { const d = sub(a, b).m; return d < 0n ? -1 : d > 0n ? 1 : 0; };
  const productEqual = (a: number, b: number, c: number, d: number) => compare(mul(dyad(a), dyad(b)), mul(dyad(c), dyad(d))) === 0;
  const within = (a: Point, b: Point, e: number): boolean => {
    if (!finitePoint(a) || !finitePoint(b) || !Number.isFinite(e) || e < 0) return false;
    let squared: Dyad = { m: 0n, k: 0 };
    for (let k = 0; k < 3; k++) { const delta = sub(dyad(a[k]), dyad(b[k])); squared = add(squared, mul(delta, delta)); }
    return compare(squared, mul(dyad(e), dyad(e))) <= 0;
  };
  const knotsSame = (edge: Curve, iso: Iso, reverse: boolean): boolean => {
    const [a, b] = domain(edge), [c, d] = iso.domain;
    const edgeWidth = sub(dyad(b), dyad(a)), isoWidth = sub(dyad(d), dyad(c));
    for (let i = 0; i < edge.knots.length; i++) {
      const j = reverse ? iso.knots.length - 1 - i : i;
      const left = sub(dyad(edge.knots[i]), dyad(a));
      const right = reverse ? sub(dyad(d), dyad(iso.knots[j])) : sub(dyad(iso.knots[j]), dyad(c));
      if (compare(mul(left, isoWidth), mul(right, edgeWidth)) !== 0) return false;
    }
    return true;
  };
  const curveValid = (c: Curve): boolean => {
    charge(512);
    if (!c || !id(c.id)) return false;
    try { validateCurve(c); return true; } catch { return false; }
  };
  const surfaceValid = (s: Surface): boolean => {
    charge(4096);
    if (!s || !id(s.id)) return false;
    try { validateSurface(s); return true; } catch { return false; }
  };
  const uniqueMap = <T extends { readonly id: string }>(items: readonly T[]): Map<string, T> | undefined => {
    charge(items.length); const result = new Map<string, T>();
    for (const value of items) { if (!id(value.id) || result.has(value.id)) return; result.set(value.id, value); }
    return result;
  };
  const topology = (b: Brep): Topology | undefined => {
    const lists = [b.bodies, b.shells, b.faces, b.loops, b.coedges, b.edges, b.vertices];
    const count = lists.reduce((n, a) => n + a.length, 0);
    if (count > RECTANGULAR_ISO_LIMITS.topologyRecords) throw new NativeIsoBudgetError('Native iso topology storage bound exceeded.');
    charge(count * 4 + 32);
    const bodies = uniqueMap(b.bodies), shells = uniqueMap(b.shells), faces = uniqueMap(b.faces), loops = uniqueMap(b.loops), coedges = uniqueMap(b.coedges), edges = uniqueMap(b.edges), vertices = uniqueMap(b.vertices);
    if (!bodies || !shells || !faces || !loops || !coedges || !edges || !vertices) return;
    const uses = new Map<string, BrepCoedge[]>();
    for (const use of b.coedges) {
      if (!id(use.edge) || !id(use.loop) || !id(use.next) || !id(use.prev) || (use.twin !== null && !id(use.twin)) || !validSense(use.sense)) return;
      const row = uses.get(use.edge); if (row) row.push(use); else uses.set(use.edge, [use]);
    }
    // Reverse ownership indexes preserve duplicate references instead of hiding ambiguity.
    let references = 0;
    const countReferences = (rows: readonly { readonly length: number }[]) => {
      for (const row of rows) {
        if (row.length > RECTANGULAR_ISO_LIMITS.referenceEntries - references) return false;
        references += row.length;
      }
      return true;
    };
    charge(count);
    if (!countReferences(b.bodies.map(x => x.shells)) || !countReferences(b.shells.map(x => x.faces))
      || !countReferences(b.faces.map(x => x.loops)) || !countReferences(b.loops.map(x => x.coedges))) throw new NativeIsoBudgetError('Native iso reference storage bound exceeded.');
    charge(references * 4);
    const reverse = <T>(values: readonly T[], refs: (value: T) => readonly string[]): Map<string, T[]> | undefined => {
      const result = new Map<string, T[]>();
      for (const value of values) for (const key of refs(value)) {
        if (!id(key)) return;
        const row = result.get(key); if (row) row.push(value); else result.set(key, [value]);
      }
      return result;
    };
    const faceShells = reverse(b.shells, x => x.faces), shellBodies = reverse(b.bodies, x => x.shells),
      loopFaces = reverse(b.faces, x => x.loops), coedgeLoops = reverse(b.loops, x => x.coedges);
    if (!faceShells || !shellBodies || !loopFaces || !coedgeLoops) return;
    return { bodies, shells, faces, loops, coedges, edges, vertices, uses, faceShells, shellBodies, loopFaces, coedgeLoops };
  };
  const member = (t: Topology, face: BrepFace): { body: BrepBody; shell: BrepShell } | undefined => {
    if (t.faces.get(face.id) !== face || !validSense(face.sense)) return;
    const shell = t.shells.get(face.shell), body = shell && t.bodies.get(shell.body);
    if (!shell || !body || typeof shell.closed !== 'boolean' || !['solid', 'sheet'].includes(body.kind)) return;
    charge(8);
    const faceOwners = t.faceShells.get(face.id), shellOwners = t.shellBodies.get(shell.id);
    if (faceOwners?.length !== 1 || faceOwners[0] !== shell || shellOwners?.length !== 1 || shellOwners[0] !== body) return;
    return { body, shell };
  };
  const twinValid = (t: Topology, use: BrepCoedge, shell: BrepShell, body: BrepBody): boolean => {
    const uses = t.uses.get(use.edge);
    charge(4);
    if (!uses || uses.length < 1 || uses.length > 2 || !uses.includes(use)) return false;
    if (use.twin === null) return body.kind === 'sheet' && !shell.closed && uses.length === 1;
    const twin = t.coedges.get(use.twin), loop = twin && t.loops.get(twin.loop), face = loop && t.faces.get(loop.face);
    if (!twin || twin === use || twin.twin !== use.id || twin.edge !== use.edge || twin.sense === use.sense || !loop || !face || uses.length !== 2 || !uses.includes(twin)) return false;
    charge(8);
    const coOwners = t.coedgeLoops.get(twin.id), loopOwners = t.loopFaces.get(loop.id);
    if (coOwners?.length !== 1 || coOwners[0] !== loop || loopOwners?.length !== 1 || loopOwners[0] !== face) return false;
    const owner = member(t, face); return !!owner && owner.body === body && owner.shell === shell;
  };
  const isos = (s: Surface): readonly Iso[] => {
    const nu = s.controlPoints.length, nv = s.controlPoints[0].length;
    const u: Domain = [s.knotsU[s.degreeU], s.knotsU[nu]], v: Domain = [s.knotsV[s.degreeV], s.knotsV[nv]];
    charge(8 * (nu + nv));
    return [
      { degree: s.degreeU, knots: s.knotsU, points: s.controlPoints.map(r => r[0]), weights: s.weights.map(r => r[0]), domain: u, fixedAxis: 'v', fixed: v[0], varyingAxis: 'u' },
      { degree: s.degreeV, knots: s.knotsV, points: s.controlPoints[nu - 1], weights: s.weights[nu - 1], domain: v, fixedAxis: 'u', fixed: u[1], varyingAxis: 'v' },
      { degree: s.degreeU, knots: s.knotsU, points: s.controlPoints.map(r => r[nv - 1]), weights: s.weights.map(r => r[nv - 1]), domain: u, fixedAxis: 'v', fixed: v[1], varyingAxis: 'u' },
      { degree: s.degreeV, knots: s.knotsV, points: s.controlPoints[0], weights: s.weights[0], domain: v, fixedAxis: 'u', fixed: u[0], varyingAxis: 'v' },
    ];
  };
  const direction = (c: Curve, iso: Iso, eps: number): Direction | undefined => {
    if (c.degree !== iso.degree || c.knots.length !== iso.knots.length || c.controlPoints.length !== iso.points.length || c.weights.length !== iso.weights.length) return;
    const same = (reverse: boolean) => {
      if (!knotsSame(c, iso, reverse)) return false;
      const first = reverse ? iso.weights.length - 1 : 0;
      for (let i = 0; i < c.weights.length; i++) {
        const j = reverse ? c.weights.length - 1 - i : i;
        if (!productEqual(c.weights[i], iso.weights[first], iso.weights[j], c.weights[0]) || !within(c.controlPoints[i], iso.points[j], eps)) return false;
      }
      return true;
    };
    const forward = same(false), backward = same(true);
    return forward !== backward ? forward ? 1 : -1 : undefined;
  };
  const pcurveValid = (pc: Curve | null, edge: Curve, iso: Iso, d: Direction, u: Domain, v: Domain): boolean => {
    if (pc === null) return true;
    if (!curveValid(pc) || pc.degree !== 1 || pc.controlPoints.length !== 2 || pc.weights.length !== 2 || pc.weights[0] !== pc.weights[1] || pc.controlPoints.some(p => p[2] !== 0)) return false;
    const [a, b] = domain(edge);
    if (pc.knots.length !== 4 || pc.knots[0] !== a || pc.knots[1] !== a || pc.knots[2] !== b || pc.knots[3] !== b) return false;
    const eps = 1024 * EPS * Math.max(1, Math.abs(u[0]), Math.abs(u[1]), Math.abs(v[0]), Math.abs(v[1]));
    if (!(Number.isFinite(eps) && eps <= Math.min(u[1] - u[0], v[1] - v[0]) * 1e-6)) return false;
    const point = (t: number): Point => iso.fixedAxis === 'u' ? [iso.fixed, t, 0] : [t, iso.fixed, 0];
    return within(pc.controlPoints[0], point(iso.domain[d === 1 ? 0 : 1]), eps) && within(pc.controlPoints[1], point(iso.domain[d === 1 ? 1 : 0]), eps);
  };
  const rectangle = (t: Topology, face: BrepFace, shell: BrepShell, body: BrepBody): NativeRectangle | undefined => {
    if (face.surface.kind !== 'surface' || face.loops.length !== 1 || !surfaceValid(face.surface)) return;
    const s = face.surface, loop = t.loops.get(face.loops[0]);
    if (!loop || loop.face !== face.id || loop.kind !== 'outer' || loop.coedges.length !== 4 || new Set(loop.coedges).size !== 4) return;
    charge(24);
    const loopOwners = t.loopFaces.get(loop.id);
    if (loopOwners?.length !== 1 || loopOwners[0] !== face) return;
    for (const key of loop.coedges) { const owners = t.coedgeLoops.get(key); if (owners?.length !== 1 || owners[0] !== loop) return; }
    const u: Domain = [s.knotsU[s.degreeU], s.knotsU[s.controlPoints.length]], v: Domain = [s.knotsV[s.degreeV], s.knotsV[s.controlPoints[0].length]];
    if (!Number.isFinite(u[1] - u[0]) || !Number.isFinite(v[1] - v[0])) return;
    const uvRoundoff = 1024 * EPS * Math.max(1, Math.abs(u[0]), Math.abs(u[1]), Math.abs(v[0]), Math.abs(v[1]));
    if (!(uvRoundoff <= Math.min(u[1] - u[0], v[1] - v[0]) * 1e-6)) return;
    let magnitude = 1; const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    charge(s.controlPoints.length * s.controlPoints[0].length * 8);
    for (const row of s.controlPoints) for (const p of row) for (let k = 0; k < 3; k++) { magnitude = Math.max(magnitude, Math.abs(p[k])); lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); }
    const eps = 1024 * EPS * magnitude, span = Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
    if (!(span > 0 && eps <= span * 1e-6)) return;
    const boundaries = isos(s), usedSides = new Set<Side>(), usedEdges = new Set<BrepEdge>(), result: NativeIsoBoundary[] = [], steps: (readonly [number, number])[] = [];
    const starts: string[] = [], ends: string[] = [];
    for (let k = 0; k < 4; k++) {
      const co = t.coedges.get(loop.coedges[k]);
      if (!co || co.loop !== loop.id || co.next !== loop.coedges[(k + 1) % 4] || co.prev !== loop.coedges[(k + 3) % 4] || !twinValid(t, co, shell, body)) return;
      const edge = t.edges.get(co.edge);
      if (!edge || !Number.isFinite(edge.tolerance) || edge.tolerance < 0 || usedEdges.has(edge) || !curveValid(edge.curve) || edge.vertices.length !== 2 || edge.vertices[0] === edge.vertices[1]) return;
      usedEdges.add(edge);
      const [a, b] = domain(edge.curve); if (!Number.isFinite(b - a)) return;
      let matched: { side: Side; direction: Direction } | undefined;
      for (let side = 0; side < 4; side++) {
        const d = direction(edge.curve, boundaries[side], eps);
        if (d) { if (matched) return; matched = { side: side as Side, direction: d }; }
      }
      if (!matched || usedSides.has(matched.side)) return;
      usedSides.add(matched.side);
      const first = t.vertices.get(edge.vertices[0]), last = t.vertices.get(edge.vertices[1]);
      if (!first || !last || !Number.isFinite(first.tolerance) || first.tolerance < 0 || !Number.isFinite(last.tolerance) || last.tolerance < 0 || !within(first.point, edge.curve.controlPoints[0], eps) || !within(last.point, edge.curve.controlPoints.at(-1)!, eps)) return;
      const iso = boundaries[matched.side], d = matched.direction;
      if (!pcurveValid(co.pcurve, edge.curve, iso, d, u, v)) return;
      const corners = CORNERS[matched.side], traversal = d * signOf(co.sense);
      steps.push(traversal === 1 ? corners : [corners[1], corners[0]]);
      starts.push(edge.vertices[co.sense === 'forward' ? 0 : 1]); ends.push(edge.vertices[co.sense === 'forward' ? 1 : 0]);
      result.push({ edge, curve: edge.curve, coedge: co, face, originalSurface: s, side: matched.side,
        parameters: { edgeDomain: [a, b], isoDomain: iso.domain, direction: d, fixedAxis: iso.fixedAxis, fixedValue: iso.fixed, varyingAxis: iso.varyingAxis },
        coefficientRoundoffMM: eps, pcurveRoundoffUV: uvRoundoff });
    }
    if (!steps.every((step, k) => step[1] === steps[(k + 1) % 4][0] && ends[k] === starts[(k + 1) % 4])) return;
    let twiceArea = 0;
    for (const [a, b] of steps) { const p = UNIT_CORNERS[a], q = UNIT_CORNERS[b]; twiceArea += p[0] * q[1] - p[1] * q[0]; }
    if (twiceArea !== (face.sense === 'forward' ? 2 : -2)) return;
    return { face, surface: s, loop, boundaries: result };
  };
  return {
    bind(brep: Brep, edge: BrepEdge, first: BrepFace, second: BrepFace): NativeIsoResult {
      charge(1);
      const decline = (reason: string): NativeIsoResult => ({ kind: 'declined', reason });
      if (brep.format !== 'barocss-brep' || brep.version !== 0 || brep.lengthUnit !== 'mm' || first === second) return decline('Unsupported B-rep header or repeated face.');
      const t = topology(brep); if (!t || t.edges.get(edge.id) !== edge) return decline('Ambiguous topology IDs, topology bound or foreign edge object.');
      const a = member(t, first), b = member(t, second);
      if (!a || !b || a.body !== b.body || a.shell !== b.shell) return decline('Faces do not have unique actual membership in one body/shell.');
      const uses = t.uses.get(edge.id);
      if (uses?.length !== 2 || uses[0].twin !== uses[1].id || uses[1].twin !== uses[0].id || uses[0].sense === uses[1].sense) return decline('Shared edge does not have two reciprocal opposite uses.');
      const ca = rectangle(t, first, a.shell, a.body), cb = rectangle(t, second, a.shell, a.body);
      if (!ca || !cb) return decline('Whole rectangular topology/coefficient/PC binding is unavailable or ambiguous.');
      const ea = ca.boundaries.find(x => x.edge === edge), eb = cb.boundaries.find(x => x.edge === edge);
      if (!ea || !eb || !uses.includes(ea.coedge) || !uses.includes(eb.coedge) || ea.coedge === eb.coedge) return decline('Shared edge does not bind both requested whole rectangles.');
      return { kind: 'bound', binding: { brep, body: a.body, shell: a.shell, edge, curve: edge.curve, first: ca, second: cb,
        firstBoundary: ea, secondBoundary: eb, authority: 'complete-native-iso-coefficients-with-reconstruction-roundoff' } };
    },
  };
}
