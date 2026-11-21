import { cageProportionalWeights } from './cageProportional';
import { normalizedCageDirection } from './cageLocalDirection';
// SD3 (R8.2, D81): the studio's cage-editing session on a subd node — what is edited (the node's cage, or its half
// when mirrored), what is picked, the session's own undo, and the operations of R8.1 (`@barocss/cad` subd-cage)
// applied to the selection. Pure: the App holds a session and draws it; every drag or operation is one step of the
// session's undo; Done writes the node once (one step of the document's undo, the same timeline feature).
import {
  boundaryLoop, bridge, cageTopology, deleteFaces, edgeLoop, edgeRing, extrudeEdges, extrudeFaces, fillHole, halfCage, insertEdgeLoop, keepOnPlane,
  mirrorCage, moveVertices, selectionVertices, setCreases, SubdError, subdPreviewMesh, validateCage, weldVertices, weldWithin, type Cage, type CageValidation, type MirrorAxis,
} from '@barocss/cad';

import { planCageEdgeSlide, slideEdgeLoop, type CageEdgeSlideDirections } from './cageEdgeSlide';
import { insetPlanarRegion } from './cageInset';

export type CageMode = 'vertex' | 'edge' | 'face';
export interface CageSelection { readonly vertices: readonly number[]; readonly edges: readonly (readonly [number, number])[]; readonly faces: readonly number[] }
export const emptyCageSel: CageSelection = { vertices: [], edges: [], faces: [] };
export interface StudioCage { positions: number[]; faces: number[][]; creases?: [number, number][] }
export interface CageSession {
  /** The subd node edited. */
  readonly node: number;
  /** The cage as edited (the half, when mirrored) and the mirror plane. */
  readonly cage: StudioCage; readonly mirror?: MirrorAxis;
  /** What the node held when the session began (Cancel puts it back). */
  readonly start: { readonly cage: StudioCage; readonly mirror?: MirrorAxis };
  readonly mode: CageMode; readonly sel: CageSelection;
  /** Box: the cage drawn as it is; Smooth: the limit surface, the cage over it. */
  readonly smooth: boolean;
  readonly undo: readonly { cage: StudioCage; mirror?: MirrorAxis; sel: CageSelection }[]; readonly redo: readonly { cage: StudioCage; mirror?: MirrorAxis; sel: CageSelection }[];
}
export type CageHit = { kind: 'vertex'; v: number } | { kind: 'edge'; a: number; b: number } | { kind: 'face'; f: number };

/** The session without its mirror (so a step can set or drop it). */
const unmirrored = (s: CageSession): Omit<CageSession, 'mirror'> => { const out: { mirror?: MirrorAxis } & Omit<CageSession, 'mirror'> = { ...s }; delete out.mirror; return out; };
const plain = (c: Cage): StudioCage => ({ positions: [...c.positions], faces: c.faces.map(f => [...f]), ...(c.creases?.length ? { creases: c.creases.map(([a, b]) => [a, b] as [number, number]) } : {}) });
const ek = (a: number, b: number) => a < b ? `${a}_${b}` : `${b}_${a}`;

export function startSession(node: number, cage: StudioCage, mirror?: MirrorAxis): CageSession {
  return { node, cage: plain(cage), ...(mirror ? { mirror } : {}), start: { cage: plain(cage), ...(mirror ? { mirror } : {}) }, mode: 'vertex', sel: emptyCageSel, smooth: true, undo: [], redo: [] };
}
/** The actual selected cage edges, not mirrored copies or the smoothed limit surface. */
export interface SelectedCageEdge {
  readonly edge: readonly [number, number];
  readonly centre: readonly [number, number, number];
  readonly sharp: boolean;
}
/** Inspection only. Invalid references/coordinates return no details rather than a misleading partial list. */
export function selectedCageEdges(s: CageSession): readonly SelectedCageEdge[] {
  if (!s.sel.edges.length && !s.sel.faces.length) return [];
  const c = s.cage, nv = c.positions.length / 3;
  const vertex = (v: number) => Number.isInteger(v) && v >= 0 && v < nv;
  if (!Number.isInteger(nv) || c.faces.some(f => f.length < 3 || f.some(v => !vertex(v)))) return [];
  if (!s.sel.edges.length && s.sel.faces.some(f => !Number.isInteger(f) || f < 0 || f >= c.faces.length)) return [];
  const edges = s.sel.edges.length ? s.sel.edges : s.sel.faces.flatMap(f => c.faces[f].map((v, i, F) => [v, F[(i + 1) % F.length]] as [number, number]));
  const topology = cageTopology(c), creases = new Set((c.creases ?? []).map(([a, b]) => ek(a, b)));
  const seen = new Set<string>(), details: SelectedCageEdge[] = [];
  for (const [a, b] of edges) {
    if (!vertex(a) || !vertex(b) || a === b) return [];
    const key = ek(a, b), e = topology.edges.get(key);
    if (!e || e.faces.length > 2) return [];
    if (seen.has(key)) continue;
    const ends = [e.a, e.b] as const;
    if (ends.some(v => [0, 1, 2].some(axis => !Number.isFinite(c.positions[3 * v + axis])))) return [];
    // Halving first avoids overflow for finite endpoints with large coordinates.
    const centre: [number, number, number] = [0, 1, 2].map(axis => c.positions[3 * e.a + axis] / 2 + c.positions[3 * e.b + axis] / 2) as [number, number, number];
    details.push({ edge: [e.a, e.b], centre, sharp: creases.has(key) }); seen.add(key);
  }
  return details;
}
/** The cage the kernel builds: the half mirrored, else as edited. */
export const fullCage = (s: Pick<CageSession, 'cage' | 'mirror'>): StudioCage => s.mirror ? plain(mirrorCage(s.cage, s.mirror)) : s.cage;
/** Selection-changing operations follow their actual result; an empty selection preserves the active mode. */
const selectionMode = (sel: CageSelection, fallback: CageMode): CageMode => sel.faces.length ? 'face' : sel.edges.length ? 'edge' : sel.vertices.length ? 'vertex' : fallback;
/** A step: the new cage (and mirror and selection) with the old one on the undo stack. */
function step(s: CageSession, cage: StudioCage, sel: CageSelection, mirror: MirrorAxis | null = s.mirror ?? null): CageSession {
  const rest = unmirrored(s);
  return { ...rest, ...(mirror ? { mirror } : {}), cage, sel, mode: selectionMode(sel, s.mode), undo: [...s.undo.slice(-99), { cage: s.cage, ...(s.mirror ? { mirror: s.mirror } : {}), sel: s.sel }], redo: [] };
}
export function undoSession(s: CageSession): CageSession {
  const last = s.undo[s.undo.length - 1]; if (!last) return s;
  const rest = unmirrored(s);
  return { ...rest, ...(last.mirror ? { mirror: last.mirror } : {}), cage: last.cage, sel: last.sel, mode: selectionMode(last.sel, s.mode), undo: s.undo.slice(0, -1), redo: [...s.redo, { cage: s.cage, ...(s.mirror ? { mirror: s.mirror } : {}), sel: s.sel }] };
}
export function redoSession(s: CageSession): CageSession {
  const next = s.redo[s.redo.length - 1]; if (!next) return s;
  const rest = unmirrored(s);
  return { ...rest, ...(next.mirror ? { mirror: next.mirror } : {}), cage: next.cage, sel: next.sel, mode: selectionMode(next.sel, s.mode), redo: s.redo.slice(0, -1), undo: [...s.undo, { cage: s.cage, ...(s.mirror ? { mirror: s.mirror } : {}), sel: s.sel }] };
}

// ---- Picking ------------------------------------------------------------------------------------------------------------

type Project = (p: [number, number, number]) => [number, number, number];
const at = (c: StudioCage, v: number): [number, number, number] => [c.positions[3 * v], c.positions[3 * v + 1], c.positions[3 * v + 2]];
/**
 * Pick within 8 CSS px of a vertex or 6 CSS px of an edge. Candidates within 0.5 CSS px of
 * the closest screen distance overlap for picking: front/back chooses their projected depth.
 * Faces retain centre-depth picking. This is a cage pick, not rendered-surface occlusion.
 */
export function pickCage(c: StudioCage, project: Project, x: number, y: number, mode: CageMode, depth: 'front' | 'back' = 'front'): CageHit | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const P = Array.from({ length: c.positions.length / 3 }, (_, v) => project(at(c, v)));
  const finite = (p: readonly number[] | undefined): p is [number, number, number] => !!p && p.length === 3 && p.every(Number.isFinite);
  const candidates: { hit: CageHit; distance: number; z: number }[] = [];
  if (mode === 'vertex') {
    P.forEach((q, v) => {
      if (!finite(q)) return;
      const distance = Math.hypot(q[0] - x, q[1] - y);
      if (distance < 8) candidates.push({ hit: { kind: 'vertex', v }, distance, z: q[2] });
    });
  } else if (mode === 'edge') {
    for (const e of cageTopology(c).edges.values()) {
      const a = P[e.a], b = P[e.b];
      if (!finite(a) || !finite(b)) continue;
      const dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy);
      if (!Number.isFinite(length)) continue;
      const t = length > 0 ? Math.max(0, Math.min(1, ((x - a[0]) * (dx / length) + (y - a[1]) * (dy / length)) / length)) : 0;
      const distance = Math.hypot(a[0] + t * dx - x, a[1] + t * dy - y);
      // An edge projected to a point has no unique screen parameter. Use its near/far endpoint.
      const z = length === 0 ? (depth === 'back' ? Math.max(a[2], b[2]) : Math.min(a[2], b[2])) : (1 - t) * a[2] + t * b[2];
      if (distance < 6 && Number.isFinite(z)) candidates.push({ hit: { kind: 'edge', a: e.a, b: e.b }, distance, z });
    }
  } else {
    c.faces.forEach((f, k) => {
      if (f.length < 3 || !f.every(v => finite(P[v]))) return;
      let inside = false;
      for (let i = 0, j = f.length - 1; i < f.length; j = i++) {
        const a = P[f[i]], b = P[f[j]];
        if ((a[1] > y) !== (b[1] > y) && x < a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1])) inside = !inside;
      }
      if (!inside) return;
      const z = f.reduce((sum, v) => sum + P[v][2] / f.length, 0);
      if (Number.isFinite(z)) candidates.push({ hit: { kind: 'face', f: k }, distance: 0, z });
    });
  }
  if (!candidates.length) return null;
  const closest = candidates.reduce((minimum, candidate) => Math.min(minimum, candidate.distance), Infinity);
  // Fix the overlap set before sorting; pairwise epsilon comparisons are not transitive.
  const overlaps = candidates.filter(candidate => candidate.distance <= closest + 0.5);
  overlaps.sort((a, b) => (depth === 'back' ? b.z - a.z : a.z - b.z) || a.distance - b.distance);
  return overlaps[0].hit;
}
/**
 * The open edges round the hole (or along the open chain) an open edge a–b is on, in order: a double-click on a
 * hole's rim takes the whole rim, to fill or bridge (D84). Null when a–b has a face on both sides.
 */
export function openRun(c: StudioCage, a: number, b: number): [number, number][] | null {
  const t = cageTopology(c);
  if (t.edges.get(ek(a, b))?.faces.length !== 1) return null;
  const next = new Map<number, number[]>();
  for (const e of t.edges.values()) if (e.faces.length === 1) { (next.get(e.a) ?? next.set(e.a, []).get(e.a)!).push(e.b); (next.get(e.b) ?? next.set(e.b, []).get(e.b)!).push(e.a); }
  const out: [number, number][] = [[a, b]], seen = new Set([ek(a, b)]);
  // On from b, then back from a, along the open edges (one way on at a manifold's boundary vertex; stop where it branches).
  for (const [from, to, back] of [[a, b, false], [b, a, true]] as const) {
    let p: number = from, q: number = to;
    for (;;) {
      const on = (next.get(q) ?? []).filter(r => r !== p && !seen.has(ek(q, r)));
      if (on.length !== 1) break;
      seen.add(ek(q, on[0]));
      if (back) out.unshift([on[0], q]); else out.push([q, on[0]]);
      p = q; q = on[0];
    }
  }
  return out;
}
/** A pick applied to the selection: alone, or added / taken away (`additive`); `grow` an edge's loop (a hole's whole rim for an open edge) or ring. */
export function select(s: CageSession, hit: CageHit | null, additive: boolean, grow?: 'loop' | 'ring'): CageSession {
  if (!hit) return additive ? s : { ...s, sel: emptyCageSel };
  const selected = (sel: CageSelection): CageSession => ({ ...s, sel, mode: selectionMode(sel, s.mode) });
  const base = additive ? s.sel : emptyCageSel;
  if (hit.kind === 'vertex') { const has = base.vertices.includes(hit.v); return selected({ ...emptyCageSel, vertices: has ? base.vertices.filter(v => v !== hit.v) : [...base.vertices, hit.v] }); }
  if (hit.kind === 'face') { const has = base.faces.includes(hit.f); return selected({ ...emptyCageSel, faces: has ? base.faces.filter(f => f !== hit.f) : [...base.faces, hit.f] }); }
  const add: (readonly [number, number])[] = grow === 'loop' ? openRun(s.cage, hit.a, hit.b) ?? edgeLoop(s.cage, hit.a, hit.b) : grow === 'ring' ? edgeRing(s.cage, hit.a, hit.b) : [[hit.a, hit.b]];
  const keys = new Set(base.edges.map(([a, b]) => ek(a, b)));
  const toggled = !grow && keys.has(ek(hit.a, hit.b));
  const edges = toggled ? base.edges.filter(([a, b]) => ek(a, b) !== ek(hit.a, hit.b)) : [...base.edges, ...add.filter(([a, b]) => !keys.has(ek(a, b)))];
  return selected({ ...emptyCageSel, edges });
}
/** Selection adjacency is topological: vertices share an edge, edges a vertex, faces an edge.
 * Shrink removes picked elements touching an unpicked neighbour; open borders are not imaginary neighbours.
 * Linked crosses creases. Linked within creases only follows face neighbours across uncreased edges.
 * Selection alone changes no geometry, document history or cage Undo entry.
 */
export function connectedSelection(s: CageSession, action: 'grow' | 'shrink' | 'linked' | 'linked-within-creases'): CageSession {
  const stopAtCreases = action === 'linked-within-creases';
  if (stopAtCreases && s.mode !== 'face') throw new SubdError('INPUT', 'selection: pick faces for Linked within creases');
  const c = s.cage, nv = c.positions.length / 3;
  if (!Number.isInteger(nv) || c.faces.some(f => f.length < 3 || f.some(v => !Number.isInteger(v) || v < 0 || v >= nv))) {
    throw new SubdError('INPUT', 'selection: invalid cage topology');
  }
  const topology = cageTopology(c), edges = [...topology.edges.values()];
  const edgeIndex = new Map(edges.map((e, i) => [ek(e.a, e.b), i]));
  const count = s.mode === 'vertex' ? nv : s.mode === 'edge' ? edges.length : c.faces.length;
  const neighbours = Array.from({ length: count }, () => new Set<number>());
  const connect = (a: number, b: number) => { if (a !== b) { neighbours[a].add(b); neighbours[b].add(a); } };
  if (s.mode === 'vertex') edges.forEach(e => connect(e.a, e.b));
  else if (s.mode === 'edge') {
    const incident = Array.from({ length: nv }, () => [] as number[]);
    edges.forEach((e, i) => { incident[e.a].push(i); incident[e.b].push(i); });
    incident.forEach(list => list.forEach((a, i) => list.slice(i + 1).forEach(b => connect(a, b))));
  } else {
    const creases = stopAtCreases ? new Set((c.creases ?? []).map(([a, b]) => ek(a, b))) : undefined;
    for (const edge of edges) {
      if (creases?.has(ek(edge.a, edge.b))) continue;
      edge.faces.forEach((a, i) => edge.faces.slice(i + 1).forEach(b => connect(a, b)));
    }
  }
  const picked = s.mode === 'vertex' ? s.sel.vertices : s.mode === 'face' ? s.sel.faces : s.sel.edges.map(([a, b]) => edgeIndex.get(ek(a, b)) ?? -1);
  if (picked.some(i => !Number.isInteger(i) || i < 0 || i >= count)) throw new SubdError('INPUT', 'selection: pick current cage elements again');
  const selected = new Set(picked);
  if (!selected.size) return s;
  const next = new Set(selected);
  if (action === 'shrink') {
    selected.forEach(i => { if ([...neighbours[i]].some(j => !selected.has(j))) next.delete(i); });
  } else {
    const queue = [...selected];
    for (let at = 0; at < queue.length; at++) {
      for (const j of neighbours[queue[at]]) if (!next.has(j)) { next.add(j); if (action !== 'grow') queue.push(j); }
    }
  }
  if (next.size === selected.size && [...next].every(i => selected.has(i))) return s;
  const ids = [...next].sort((a, b) => a - b);
  const sel = s.mode === 'vertex' ? { ...emptyCageSel, vertices: ids } : s.mode === 'face' ? { ...emptyCageSel, faces: ids } : { ...emptyCageSel, edges: ids.map(i => [edges[i].a, edges[i].b] as [number, number]) };
  return { ...s, sel };
}

/** Minimum edge-count path between exactly two picked vertices. Ties use ascending vertex IDs,
 * starting at the lower seed ID, independent of pick order, face order, coordinates and creases.
 * Returns only path edges in Edge mode; never adds geometry or a history step.
 */
export function shortestCagePath(s: CageSession): CageSession {
  if (s.mode !== 'vertex' || s.sel.vertices.length !== 2 || s.sel.edges.length || s.sel.faces.length) {
    throw new SubdError('INPUT', 'shortest path: pick exactly two vertices (Shift-click the second)');
  }
  const c = s.cage, nv = c.positions.length / 3;
  if (!Number.isInteger(nv) || c.faces.some(f => f.length < 3 || new Set(f).size !== f.length || f.some(v => !Number.isInteger(v) || v < 0 || v >= nv))) {
    throw new SubdError('INPUT', 'shortest path: invalid cage topology');
  }
  if (s.sel.vertices.some(v => !Number.isInteger(v) || v < 0 || v >= nv) || s.sel.vertices[0] === s.sel.vertices[1]) {
    throw new SubdError('INPUT', 'shortest path: pick two distinct current cage vertices again');
  }
  const [start, end] = [...s.sel.vertices].sort((a, b) => a - b);
  const topology = cageTopology(c), neighbours = Array.from({ length: nv }, () => new Set<number>());
  for (const e of topology.edges.values()) { neighbours[e.a].add(e.b); neighbours[e.b].add(e.a); }
  const parent = new Map<number, number>([[start, start]]), queue = [start];
  for (let at = 0; at < queue.length && !parent.has(end); at++) {
    const v = queue[at];
    for (const next of [...neighbours[v]].sort((a, b) => a - b)) {
      if (parent.has(next)) continue;
      parent.set(next, v); queue.push(next);
    }
  }
  if (!parent.has(end)) throw new SubdError('INPUT', 'shortest path: the vertices are in disconnected cage components; selection unchanged');
  const vertices = [end];
  while (vertices[vertices.length - 1] !== start) vertices.push(parent.get(vertices[vertices.length - 1])!);
  vertices.reverse();
  const edges = vertices.slice(1).map((v, i) => [vertices[i], v] as [number, number]);
  return { ...s, mode: 'edge', sel: { ...emptyCageSel, edges } };
}

export const selectedVertices = (s: CageSession) => selectionVertices(s.cage, s.sel);
/** The selection's centre (where the gizmo sits), or null. */
export function selectionCentre(s: CageSession): [number, number, number] | null {
  const vs = selectedVertices(s); if (!vs.length) return null;
  const m: [number, number, number] = [0, 0, 0];
  for (const v of vs) for (let k = 0; k < 3; k++) m[k] += s.cage.positions[3 * v + k] / vs.length;
  return m;
}

// ---- Dragging and the operations -------------------------------------------------------------------------------------

/** The vertices on the mirror plane (kept on it as they move). */
function onPlane(s: Pick<CageSession, 'cage' | 'mirror'>): number[] {
  if (!s.mirror) return [];
  const k = s.mirror === 'x' ? 0 : s.mirror === 'y' ? 1 : 2;
  return Array.from({ length: s.cage.positions.length / 3 }, (_, v) => v).filter(v => s.cage.positions[3 * v + k] === 0);
}
/**
 * The cage while the selection is dragged by `delta` (not yet a step): moved — or, with `extrude`, faces or boundary
 * edges extruded first and the new ones moved. The mirror plane's vertices stay on it.
 */
export function dragged(s: CageSession, delta: readonly number[], extrude: boolean): { cage: StudioCage; sel: CageSelection } {
  if (extrude && s.sel.faces.length) {
    // (Mirrored: no wall along the open side on the plane, and what is on the plane stays there.)
    const plane = new Set(onPlane(s)), e = extrudeFaces(s.cage, s.sel.faces, 0, s.mirror ? (a, b) => plane.has(a) && plane.has(b) : undefined);
    const moved = moveVertices(e.cage, e.vertices, delta);
    return { cage: plain(s.mirror ? keepOnPlane(moved, s.mirror, onPlane({ cage: plain(e.cage), mirror: s.mirror })) : moved), sel: { ...emptyCageSel, faces: e.faces } };
  }
  if (extrude && s.sel.edges.length) {
    const e = extrudeEdges(s.cage, s.sel.edges, delta), c = plain(e.cage), t = cageTopology(c);
    // (The new edges: those between the new vertices, the extrusion's open end.)
    const edges = [...t.edges.values()].filter(x => e.vertices.includes(x.a) && e.vertices.includes(x.b)).map(x => [x.a, x.b] as [number, number]);
    return { cage: c, sel: { ...emptyCageSel, edges } };
  }
  const plane = onPlane(s);
  return { cage: plain(keepOnPlane(moveVertices(s.cage, selectedVertices(s), delta), s.mirror ?? 'x', plane)), sel: s.sel };
}
/** A drag let go: one step. */
export function commitDrag(s: CageSession, delta: readonly number[], extrude: boolean): CageSession {
  // (A drag of nothing is no step; extruded, it would leave the copies on the faces they came from, which the kernel
  // refuses — a Shift-click on the gizmo did that, D84. Extrude-then-drag is the E key's.)
  if (delta.every(x => x === 0)) return s;
  const d = dragged(s, delta, extrude);
  // A mirror-plane constraint may consume a nonzero pointer drag completely.
  if (!extrude && d.cage.positions.every((value, i) => value === s.cage.positions[i])) return s;
  return step(s, d.cage, d.sel);
}

export interface CageProportionalDragPlan {
  readonly base: CageSession;
  readonly radius: number;
  /** Baseline graph weights, indexed by cage vertex ID. */
  readonly weights: readonly number[];
}

/** Use one cage, selection, radius and weight array for the full drag. */
export function planCageProportionalDrag(base: CageSession, radius: number): CageProportionalDragPlan {
  const weights = Object.freeze(cageProportionalWeights(base, radius));
  return Object.freeze({ base, radius, weights });
}

/** Apply the full pointer displacement from the baseline without adding history. */
export function previewCageProportionalDrag(plan: CageProportionalDragPlan, delta: readonly number[]): CageSession {
  if (delta.length !== 3 || ![0, 1, 2].every(axis => Number.isFinite(delta[axis]))) {
    throw new SubdError('INPUT', 'proportional move: use three finite displacement coordinates in mm');
  }
  const { base, weights } = plan;
  if (delta.every(value => value === 0)) return base;

  const source = base.cage.positions;
  const mirrorAxis = base.mirror ? 'xyz'.indexOf(base.mirror) : -1;
  let positions: number[] | undefined;
  for (const [vertex, weight] of weights.entries()) {
    if (weight === 0) continue;
    const first = 3 * vertex;
    for (const [axis, displacement] of delta.entries()) {
      if (displacement === 0 || (axis === mirrorAxis && source[first + axis] === 0)) continue;
      const index = first + axis;
      const next = source[index] + weight * displacement;
      if (!Number.isFinite(next)) throw new SubdError('INPUT', 'proportional move: coordinates overflow; reduce the displacement');
      if (next === source[index]) continue;
      positions ??= [...source];
      positions[index] = next;
    }
  }
  return positions ? { ...base, cage: { ...base.cage, positions } } : base;
}

/** Commit one drag from its original baseline. A constrained or rounded no-op preserves redo. */
export function commitCageProportionalDrag(plan: CageProportionalDragPlan, delta: readonly number[]): CageSession {
  const preview = previewCageProportionalDrag(plan, delta);
  return preview === plan.base ? plan.base : step(plan.base, preview.cage, plan.base.sel);
}

function requireEdgeSlideSelection(s: CageSession): void {
  if (s.mirror) throw new SubdError('INPUT', 'edge slide: mirrored cages are unsupported');
  if (s.mode !== 'edge' || !s.sel.edges.length || s.sel.vertices.length || s.sel.faces.length) {
    throw new SubdError('INPUT', 'edge slide: select one complete edge loop');
  }
}

/** The selected anchor edge and its two target edges, using the current cage's vertex IDs. */
export function cageEdgeSlideDirections(s: CageSession): CageEdgeSlideDirections {
  requireEdgeSlideSelection(s);
  return planCageEdgeSlide(s.cage, s.sel.edges).directions;
}

/** Slide the current loop along its rails and record one cage step if its coordinates changed. */
export function slideCageSelection(s: CageSession, ratio: number): CageSession {
  requireEdgeSlideSelection(s);
  const cage = slideEdgeLoop(s.cage, s.sel.edges, ratio);
  return cage === s.cage ? s : step(s, cage, s.sel);
}

/** Inset the selected planar quad region once and retain the inner faces for Extrude. */
export function insetCageSelection(s: CageSession, distance: number): CageSession {
  if (s.mode !== 'face' || !s.sel.faces.length || s.sel.vertices.length || s.sel.edges.length) throw new SubdError('INPUT', 'inset: pick quad faces');
  if (s.mirror) {
    const axis = s.mirror === 'x' ? 0 : s.mirror === 'y' ? 1 : 2;
    const coordinates = s.sel.faces.flatMap(face => s.cage.faces[face]?.map(v => s.cage.positions[3 * v + axis]) ?? []);
    if (coordinates.some(value => Math.abs(value) <= 1e-9)
      || (coordinates.some(value => value < 0) && coordinates.some(value => value > 0))) {
      throw new SubdError('INPUT', 'inset: faces touching or crossing the mirror seam are not supported');
    }
  }
  const cage = insetPlanarRegion(s.cage, s.sel.faces, distance);
  return step(s, plain(cage), { ...emptyCageSel, faces: [...s.sel.faces] });
}

export type CageSelectionTransform =
  | { kind: 'move-proportional'; axis: 0 | 1 | 2; distance: number; radius: number }
  | { kind: 'move-along'; direction: readonly [number, number, number]; distance: number }
  | { kind: 'move'; axis: 0 | 1 | 2; distance: number }
  | { kind: 'rotate-along'; direction: readonly [number, number, number]; degrees: number; pivot: readonly [number, number, number] }
  | { kind: 'rotate'; axis: 0 | 1 | 2; degrees: number; pivot: readonly [number, number, number] }
  | { kind: 'scale'; factor: number; pivot: readonly [number, number, number] };
/** Transform only selected cage vertices from this immutable baseline. Mirror-seam coordinates stay fixed.
 * This is cage editing, not a rigid transform of the final smooth surface. No-op transformations add no history.
 */
export function transformCageSelection(s: CageSession, transform: CageSelectionTransform): CageSession {
  if (transform.kind === 'move-proportional') {
    if (![0, 1, 2].includes(transform.axis) || !Number.isFinite(transform.distance)) {
      throw new SubdError('INPUT', 'move: use a world axis and finite distance in mm');
    }
    const delta: [number, number, number] = [0, 0, 0];
    delta[transform.axis] = transform.distance;
    return commitCageProportionalDrag(planCageProportionalDrag(s, transform.radius), delta);
  }
  const c = s.cage, nv = c.positions.length / 3, validVertex = (v: number) => Number.isInteger(v) && v >= 0 && v < nv;
  if (!Number.isInteger(nv) || c.positions.some(v => !Number.isFinite(v)) || c.faces.some(f => f.length < 3 || f.some(v => !validVertex(v)))) throw new SubdError('INPUT', 'transform: invalid cage coordinates or topology');
  if (s.sel.vertices.some(v => !validVertex(v)) || s.sel.edges.some(([a, b]) => !validVertex(a) || !validVertex(b)) || s.sel.faces.some(f => !Number.isInteger(f) || f < 0 || f >= c.faces.length)) throw new SubdError('INPUT', 'transform: pick current cage elements again');
  const topology = cageTopology(c);
  if (s.sel.edges.some(([a, b]) => !topology.edges.has(ek(a, b)))) throw new SubdError('INPUT', 'transform: selected edge is not in this cage');
  const vertices = selectedVertices(s);
  if (!vertices.length) throw new SubdError('INPUT', 'transform: pick vertices, edges or faces first');
  if (transform.kind !== 'move' && transform.kind !== 'move-along' && (transform.pivot.length !== 3 || transform.pivot.some(v => !Number.isFinite(v)))) throw new SubdError('INPUT', 'transform: pivot must be finite');
  if (transform.kind === 'rotate' && (![0, 1, 2].includes(transform.axis) || !Number.isFinite(transform.degrees))) throw new SubdError('INPUT', 'rotate: use a world axis and finite degrees');
  if (transform.kind === 'scale' && (!Number.isFinite(transform.factor) || transform.factor <= 0)) throw new SubdError('INPUT', 'scale: factor must be finite and greater than zero');
  if (transform.kind === 'move' && (![0, 1, 2].includes(transform.axis) || !Number.isFinite(transform.distance))) throw new SubdError('INPUT', 'move: use a world axis and finite distance in mm');
  const direction = transform.kind === 'move-along' || transform.kind === 'rotate-along' ? normalizedCageDirection(transform.direction) : null;
  if (transform.kind === 'move-along' && !Number.isFinite(transform.distance)) throw new SubdError('INPUT', 'move: use finite distance in mm');
  if (transform.kind === 'rotate-along' && !Number.isFinite(transform.degrees)) throw new SubdError('INPUT', 'rotate: use finite degrees');
  const angle = transform.kind === 'rotate' || transform.kind === 'rotate-along' ? transform.degrees % 360 : 0;
  if (transform.kind === 'move' || transform.kind === 'move-along' ? transform.distance === 0 : transform.kind === 'rotate' || transform.kind === 'rotate-along' ? angle === 0 : transform.factor === 1) return s;
  const positions = [...c.positions], radians = angle * Math.PI / 180, cosine = Math.cos(radians), sine = Math.sin(radians);
  for (const v of vertices) {
    if (transform.kind === 'move-along') { for (let k = 0; k < 3; k++) positions[3*v+k] += direction![k]*transform.distance; continue; }
    if (transform.kind === 'move') { positions[3 * v + transform.axis] += transform.distance; continue; }
    const p = at(c, v).map((x, k) => x - transform.pivot[k]);
    const q = [...p];
    if (transform.kind === 'scale') for (let k = 0; k < 3; k++) q[k] *= transform.factor;
    else if (transform.kind === 'rotate-along') {
      // Rodrigues: positive angle follows the right-hand rule about the baseline unit axis.
      const n = direction!, scale = Math.max(...p.map(Math.abs));
      // A point on this axis is invariant. Compare normalized directions at roundoff scale,
      // not with a model-unit tolerance; retain the original coordinate bit-for-bit.
      const unitP = scale === 0 ? [0, 0, 0] : p.map(x => x / scale);
      const products = [[n[1]*unitP[2], n[2]*unitP[1]], [n[2]*unitP[0], n[0]*unitP[2]], [n[0]*unitP[1], n[1]*unitP[0]]];
      if (products.every(([a, b]) => Math.abs(a-b) <= 4 * Number.EPSILON * (Math.abs(a)+Math.abs(b)))) continue;
      const cross = [n[1]*p[2]-n[2]*p[1], n[2]*p[0]-n[0]*p[2], n[0]*p[1]-n[1]*p[0]];
      const second = [n[1]*cross[2]-n[2]*cross[1], n[2]*cross[0]-n[0]*cross[2], n[0]*cross[1]-n[1]*cross[0]];
      for (let k = 0; k < 3; k++) q[k] = p[k] + cross[k]*sine + second[k]*(1-cosine);
    } else {
      const a = (transform.axis + 1) % 3, b = (transform.axis + 2) % 3;
      q[a] = cosine * p[a] - sine * p[b]; q[b] = sine * p[a] + cosine * p[b];
    }
    for (let k = 0; k < 3; k++) positions[3 * v + k] = q[k] + transform.pivot[k];
  }
  const result = plain(keepOnPlane({ ...c, positions }, s.mirror ?? 'x', onPlane(s)));
  if (result.positions.some(v => !Number.isFinite(v))) throw new SubdError('INPUT', 'transform: coordinates overflow; reduce the value or change pivot');
  if (result.positions.every((v, i) => v === c.positions[i])) return s;
  return step(s, result, s.sel);
}

export type CageOp = 'extrude' | 'insert-loop' | 'bridge' | 'fill' | 'weld' | 'weld-near' | 'crease' | 'uncrease' | 'delete' | 'select-loop' | 'select-ring' | 'select-grow' | 'select-shrink' | 'select-linked' | 'select-linked-within-creases' | 'select-path' | 'mirror-x' | 'mirror-y' | 'mirror-z' | 'mirror-off';
/** Two boundary edge sets from one selection: its edges split into connected chains. */
function twoBoundaries(c: StudioCage, edges: readonly (readonly [number, number])[]): [(readonly [number, number])[], (readonly [number, number])[]] {
  const groups: (readonly [number, number])[][] = [];
  for (const e of edges) {
    const touching = groups.filter(g => g.some(([a, b]) => a === e[0] || a === e[1] || b === e[0] || b === e[1]));
    const merged = [e, ...touching.flat()];
    for (const g of touching) groups.splice(groups.indexOf(g), 1);
    groups.push(merged);
  }
  if (groups.length !== 2) throw new SubdError('INPUT', `bridge: select two boundary loops or chains (${groups.length} picked)`);
  void c;
  return [groups[0], groups[1]];
}
/** Selection-only readiness; the native operation remains responsible for the resulting geometry. */
export function cageBoundaryReadiness(s: CageSession, op: 'fill' | 'bridge'): { ok: boolean; reason: string } {
  const edges = s.sel.edges;
  if (!edges.length) return { ok: false, reason: op === 'fill' ? 'Select one complete hole boundary. Use Loop on a boundary edge.' : 'Select two separate boundary loops or open chains with matching edge counts.' };
  try {
    const topology = cageTopology(s.cage);
    if (edges.some(([a, b]) => topology.edges.get(ek(a, b))?.faces.length !== 1)) {
      return { ok: false, reason: 'Select open boundary edges, not interior edges of a closed surface.' };
    }
    if (op === 'fill') {
      const boundary = boundaryLoop(s.cage, edges);
      return boundary.closed
        ? { ok: true, reason: 'One complete hole boundary selected. Fill will attempt to close it.' }
        : { ok: false, reason: 'Select the complete hole boundary. Use Loop on a boundary edge; an open chain cannot be filled.' };
    }
    const [a, b] = twoBoundaries(s.cage, edges);
    const A = boundaryLoop(s.cage, a), B = boundaryLoop(s.cage, b);
    if (A.closed !== B.closed) return { ok: false, reason: 'Select two closed loops or two open chains, not one of each.' };
    if (A.vertices.length !== B.vertices.length) return { ok: false, reason: 'The two boundaries need matching edge counts.' };
    if (A.vertices.some(v => B.vertices.includes(v))) return { ok: false, reason: 'Select two boundaries that do not share vertices.' };
    return { ok: true, reason: 'Two matching boundaries selected. Bridge will attempt to connect them.' };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message.replace(/^SubD: /, '') : 'The boundary selection could not be checked.' };
  }
}
/**
 * An operation on the selection: one step, or refused (SubdError, said by the panel). Extrude here goes out 0 (the
 * gizmo then moves it); insert-loop runs across the ring through the first selected edge, at `t` along it from its
 * first vertex (the middle unless told: a holding loop near an edge, D84).
 */
export function runOp(s: CageSession, op: CageOp, tolerance = 0.01, t = 0.5): CageSession {
  const c = s.cage, sel = s.sel;
  switch (op) {
    case 'select-path': return shortestCagePath(s);
    case 'select-grow': return connectedSelection(s, 'grow');
    case 'select-shrink': return connectedSelection(s, 'shrink');
    case 'select-linked': return connectedSelection(s, 'linked');
    case 'select-linked-within-creases': return connectedSelection(s, 'linked-within-creases');
    case 'select-loop': case 'select-ring': {
      const e = sel.edges[0]; if (!e) throw new SubdError('INPUT', 'pick an edge first');
      return select(s, { kind: 'edge', a: e[0], b: e[1] }, false, op === 'select-loop' ? 'loop' : 'ring');
    }
    case 'extrude': {
      if (sel.faces.length) { const d = dragged(s, [0, 0, 0], true); return step(s, d.cage, d.sel); }
      if (sel.edges.length) { const d = dragged(s, [0, 0, 0], true); return step(s, d.cage, d.sel); }
      throw new SubdError('INPUT', 'extrude: pick faces, or boundary edges');
    }
    case 'insert-loop': {
      const e = sel.edges[0]; if (!e) throw new SubdError('INPUT', 'insert loop: pick an edge across which the loop runs');
      const r = insertEdgeLoop(c, e[0], e[1], t), topo = cageTopology(r.cage);
      const edges = [...topo.edges.values()].filter(x => r.vertices.includes(x.a) && r.vertices.includes(x.b)).map(x => [x.a, x.b] as [number, number]);
      return step(s, plain(r.cage), { ...emptyCageSel, edges });
    }
    case 'bridge': { const [a, b] = twoBoundaries(c, sel.edges); return step(s, plain(bridge(c, a, b)), emptyCageSel); }
    case 'fill': { const out = fillHole(c, sel.edges); return step(s, plain(out), { ...emptyCageSel, faces: [out.faces.length - 1] }); }
    case 'weld': return step(s, plain(weldVertices(c, selectedVertices(s))), emptyCageSel);
    case 'weld-near': {
      const vertices = selectedVertices(s);
      if (vertices.length < 2) throw new SubdError('INPUT', 'weld near: pick at least two vertices (or edges/faces containing them)');
      return step(s, plain(weldWithin(c, vertices, tolerance)), emptyCageSel);
    }
    case 'crease': case 'uncrease': {
      const edges = sel.edges.length ? sel.edges : sel.faces.flatMap(f => c.faces[f].map((v, i, F) => [v, F[(i + 1) % F.length]] as [number, number]));
      if (!edges.length) throw new SubdError('INPUT', 'crease: pick edges (or faces: their sides)');
      // Always ask the kernel first: even an apparent no-op must reject invalid picked edges.
      const out = setCreases(c, edges, op === 'crease');
      const before = new Set((c.creases ?? []).map(([a, b]) => ek(a, b)));
      const after = new Set((out.creases ?? []).map(([a, b]) => ek(a, b)));
      if (before.size === after.size && [...before].every(key => after.has(key))) return s;
      return step(s, plain(out), s.sel);
    }
    case 'delete': {
      if (!sel.faces.length) throw new SubdError('INPUT', 'delete: pick faces');
      return step(s, plain(deleteFaces(c, sel.faces)), emptyCageSel);
    }
    case 'mirror-off': return s.mirror ? step(s, fullCage(s), emptyCageSel, null) : s;
    default: {
      const axis = op.slice(-1) as MirrorAxis;
      // (From a whole cage: its positive side kept; from another mirror: made whole first.)
      return step(s, plain(halfCage(fullCage(s), axis)), emptyCageSel, axis);
    }
  }
}
/** The boundary loop (or chain) through the selected boundary edges, for the panel to say what Fill / Bridge would take. */
export const boundaryOf = (s: CageSession) => boundaryLoop(s.cage, s.sel.edges);

// ---- What is drawn ----------------------------------------------------------------------------------------------------

/** The validation of the cage the kernel builds, for the overlay. */
/**
 * The cage's validation — a matter of its faces, creases and vertex count only (no position) — kept for the last
 * cage: a move, and every step of an extrusion's drag (its topology fixed while it is dragged), reads it again rather
 * than validating a 2k-face cage per frame (4.4 ms; PERF3 C16). The cage compared face by face.
 */
let lastValidation: { faces: readonly (readonly number[])[]; creases: readonly (readonly number[])[]; nv: number; v: CageValidation } | null = null;
export function validationOf(s: CageSession): CageValidation {
  const c = fullCage(s), nv = c.positions.length / 3, creases = c.creases ?? [];
  const last = lastValidation;
  if (last && last.nv === nv && sameLists(last.faces, c.faces) && sameLists(last.creases, creases)) return last.v;
  const v = validateCage(c);
  lastValidation = { faces: c.faces, creases, nv, v };
  return v;
}
function sameLists(a: readonly (readonly number[])[], b: readonly (readonly number[])[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) { const x = a[i], y = b[i]; if (x === y) continue; if (x.length !== y.length) return false; for (let j = 0; j < x.length; j++) if (x[j] !== y[j]) return false; }
  return true;
}
/** Refinement levels for the preview: as fine as stays quick (≈ 20 000 triangles; the exact body follows on release). */
export function previewLevels(c: StudioCage): number { let l = 1; while (l < 3 && 2 * c.faces.length * 4 ** (l + 1) <= 20000) l++; return l; }
/** The limit surface's quick preview (Smooth), or the cage itself (Box), as triangles. */
export function previewTriangles(c: StudioCage, smooth: boolean): { positions: ArrayLike<number>; indices: ArrayLike<number>; normals: ArrayLike<number> | null } {
  if (smooth) return subdPreviewMesh(c, previewLevels(c));
  const idx: number[] = []; for (const f of c.faces) for (let i = 1; i + 1 < f.length; i++) idx.push(f[0], f[i], f[i + 1]);
  return { positions: c.positions, indices: idx, normals: null };
}
