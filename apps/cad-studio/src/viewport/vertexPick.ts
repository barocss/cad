import { lookOf } from '@barocss/cad-model/app/bodies';
import type { VertexSel } from '@barocss/cad-model/app/commands';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import type { SectionVertexIds } from './sectionEdgePick';
import type { DisplayMesh, Vec3 } from '@barocss/cad-model/engine/mesh';

type PickFilter = 'all' | 'face' | 'edge' | 'body';
type EdgeEnds = { a: readonly number[]; b: readonly number[]; index?: number; faces?: readonly number[]; nativeVertices?: readonly [string, string]; meshVertices?: readonly [string, string] };
type NativePickSource = { mesh: DisplayMesh; sectionVertices?: SectionVertexIds } & ({ face: number } | { edge: number });
type VertexPick = VertexSel;

const meshOwners = new WeakMap<VertexPick, { id: string; mesh: DisplayMesh; at: Vec3 }>();
export interface MeshVertexTarget { doc: StudioDoc; body: string; mesh: DisplayMesh; id: string; at: Vec3 }
const meshTargets = new WeakMap<MeshVertexTarget, { at: Vec3; id: string; body: string; doc: StudioDoc; mesh: DisplayMesh }>();
/** First bounded consumer: one direct, unrepaired imported mesh node. Never raw-file vertex identity. */
function meshRoot(doc: StudioDoc, bodies: readonly BodyResult[], body: BodyResult | undefined): body is BodyResult {
  const node = doc.nodes[0];
  return !!body && doc.nodes.length === 1 && node?.kind === 'mesh' && !node.repair && !node.role
    && !doc.instances?.length && body.ref?.node === 0 && !lookOf(doc, body).hidden
    && bodies.filter(b => b.key === body.key).length === 1;
}
const finitePoint = (p: readonly number[]): boolean => Array.isArray(p) && p.length === 3 && [0, 1, 2].every(k => Object.hasOwn(p, k) && Number.isFinite(p[k]));
export function captureMeshVertexPick(pick: VertexPick, doc: StudioDoc, bodies: readonly BodyResult[]): MeshVertexTarget | null {
  const owner = meshOwners.get(pick), body = bodies[pick.body];
  if (!owner || !meshRoot(doc, bodies, body) || owner.mesh !== body.mesh || !finitePoint(pick.at) || !pick.at.every((v, k) => v === owner.at[k])) return null;
  const target: MeshVertexTarget = { doc, body: body.key, mesh: body.mesh, id: owner.id, at: [...owner.at] };
  meshTargets.set(target, { ...target, at: [...target.at] });
  return target;
}
export function currentMeshVertexTarget(target: MeshVertexTarget, doc: StudioDoc, bodies: readonly BodyResult[]): boolean {
  const saved = meshTargets.get(target), body = bodies.find(b => b.key === target.body);
  return !!saved && saved.doc === doc && target.doc === doc && saved.body === target.body && saved.id === target.id
    && saved.mesh === target.mesh && meshRoot(doc, bodies, body) && body.mesh === saved.mesh
    && finitePoint(target.at) && target.at.every((v, k) => v === saved.at[k]);
}

const nativeOwners = new WeakMap<VertexPick, { id: string; source: NativePickSource; at: Vec3; body: number; doc?: StudioDoc }>();

/** Read the visible incident geometry that supplied a real native pointer corner. */
export function nativeVertexWitness(pick: VertexPick, mesh: DisplayMesh) {
  const owner = nativeOwners.get(pick);
  return owner && owner.source.mesh === mesh && owner.body === pick.body && owner.at.every((value, k) => pick.at[k] === value)
    ? { id: owner.id, source: owner.source } : null;
}

export function bindNativeVertexPick(pick: VertexPick, doc: StudioDoc): void {
  const owner = nativeOwners.get(pick);
  if (owner) owner.doc = doc;
}

export function currentSolidVertexPick(doc: StudioDoc, bodies: readonly BodyResult[], picks?: readonly VertexPick[]): VertexPick | undefined {
  return picks?.length === 1 && ownsSolidVertex(doc, bodies, picks[0]) ? picks[0] : undefined;
}

export function currentSolidMoveVertices(doc: StudioDoc, bodies: readonly BodyResult[], picks?: readonly VertexPick[]): readonly [VertexPick, VertexPick] | undefined {
  if (picks?.length !== 2) return;
  const [source, destination] = picks;
  if (source.body !== destination.body && ownsSolidVertex(doc, bodies, source) && ownsSolidVertex(doc, bodies, destination))
    return [source, destination];
}

function ownsSolidVertex(doc: StudioDoc, bodies: readonly BodyResult[], pick: VertexPick): boolean {
  const body = bodies[pick.body], owner = nativeOwners.get(pick);
  return !!body?.ref && body.topology?.kind === 'solid' && body.topology.bodyCount === 1
    && owner?.doc === doc && !owner.source.sectionVertices && !!nativeVertexWitness(pick, body.mesh);
}

/** Resolve the original ordered endpoints of the current body. View-only or older picks have no authority here. */
export function currentNativeVertexPoints(doc: StudioDoc, bodies: readonly BodyResult[], picks: readonly VertexPick[]): [Vec3, Vec3, Vec3] | null {
  if (picks.length !== 3 || picks.some(pick => pick.body !== picks[0].body)) return null;
  const mesh = bodies[picks[0].body]?.mesh;
  const ids = new Set<string>();
  for (const pick of picks) {
    const owner = nativeOwners.get(pick);
    if (!owner || owner.doc !== doc || owner.source.mesh !== mesh || owner.source.sectionVertices || ids.has(owner.id)) return null;
    ids.add(owner.id);
  }
  return [picks[0].at, picks[1].at, picks[2].at];
}
/** The actual 7 px corner search used by hover and click. Explicit filters keep their own pick. */
export function pickVertex(filter: PickFilter, body: number | undefined, edges: readonly EdgeEnds[], x: number, y: number,
  project: (point: readonly number[]) => readonly number[], printedTop?: number, source?: NativePickSource, orthographic = false): VertexPick | null {
  if (body === undefined || filter !== 'all') return null;
  const radius = 7;
  let best: Vec3 | null = null, distance = radius, ambiguous = false;
  let meshPoints: Map<string, Vec3> | undefined, meshAmbiguous = false;
  let native: Map<string, { at: Vec3; pixel: readonly number[] }> | undefined;
  // A native pick must belong to the edge or face that passed the renderer's visibility test.
  for (const edge of edges) {
    const visible = source && ('edge' in source ? edge.index === source.edge : edge.faces?.includes(source.face));
    for (let k = 0; k < 2; k++) {
      const point = k ? edge.b : edge.a;
      if (printedTop !== undefined && point[2] > printedTop + 1e-7) continue;
      const pixel = project(point), gap = Math.hypot(pixel[0] - x, pixel[1] - y);
      if (gap < radius && visible) {
        const meshId = edge.meshVertices?.[k];
        if (!meshId) meshAmbiguous = true;
        else {
          meshPoints ??= new Map();
          const old = meshPoints.get(meshId);
          if (old && !old.every((v, axis) => v === point[axis])) meshAmbiguous = true;
          meshPoints.set(meshId, [...point] as Vec3);
        }
        const id = source.sectionVertices && edge.index !== undefined
          ? source.sectionVertices.get(edge.index)?.[k] : edge.nativeVertices?.[k];
        if (!id) ambiguous = true;
        else {
          native ??= new Map();
          if (!native.has(id)) native.set(id, { at: [...point] as Vec3, pixel });
        }
      }
      if (gap < distance) { distance = gap; best = [...point] as Vec3; }
    }
  }
  if (source && native?.size && !ambiguous) {
    const entries = [...native];
    const [id, chosen] = native.size > 1 && orthographic
      ? entries.sort(([, a], [, b]) => a.pixel[2] - b.pixel[2])[0] : entries[0];
    // A nearly end-on edge can put its visible and rear endpoints in the same pixel.
    const front = native.size === 1 || orthographic && Number.isFinite(chosen.pixel[2]) && entries.every(([other, { pixel }]) =>
      other === id || pixel[2] > chosen.pixel[2] && Math.hypot(pixel[0] - chosen.pixel[0], pixel[1] - chosen.pixel[1]) <= 0.1);
    if (front) {
      const pick = { body, at: chosen.at };
      nativeOwners.set(pick, { id, source, at: [...chosen.at], body });
      return pick;
    }
  }
  if (!best) return null;
  const pick = { body, at: best };
  // Do not change the ordinary corner pick or lend this authority to native Sketch operations.
  // Reject even orthographic overlaps: a visible incident edge is not proof of both endpoints' visibility.
  if (source && meshPoints?.size === 1 && !meshAmbiguous) {
    const [id, at] = [...meshPoints][0];
    if (at.every((v, k) => v === best![k])) meshOwners.set(pick, { id, mesh: source.mesh, at: [...at] });
  }
  return pick;
}
