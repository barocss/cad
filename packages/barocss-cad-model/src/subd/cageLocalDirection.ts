import { cageTopology, SubdError } from '@barocss/cad';
import type { CageSession } from './cageEdit';
export type CageLocalFrame = 'edge' | 'face' | 'face-u' | 'face-v';
type Direction = [number, number, number];
/** Scale before measuring to avoid overflow/underflow for finite nonzero vectors. */
export function normalizedCageDirection(direction: readonly number[]): Direction {
  if (direction.length !== 3 || direction.some(v => !Number.isFinite(v))) throw new SubdError('INPUT', 'local direction: use three finite coordinates');
  const scale = Math.max(...direction.map(Math.abs));
  if (scale === 0) throw new SubdError('INPUT', 'local direction: direction must be nonzero');
  const scaled = direction.map(v => v / scale), length = Math.hypot(...scaled);
  return scaled.map(v => v / length) as Direction;
}
/** Baseline-only direction. Edge tangent runs from lower to higher vertex ID; face normal follows winding. Quad U starts at the lowest vertex ID toward its winding successor; V = N × U.
 * Face support is a strictly convex planar quad. Length/planarity tolerance in mm is
 * max(1e-9, face extent * 1e-9); normalized turn tolerance is its square relative to extent.
 */
export function cageLocalDirection(s: CageSession, frame: CageLocalFrame): Direction {
  const fail = (reason: string): never => { throw new SubdError('INPUT', `local direction: ${reason}`); };
  const c = s.cage, nv = c.positions.length / 3;
  const valid = (v: number) => Number.isInteger(v) && v >= 0 && v < nv;
  if (!Number.isInteger(nv) || c.positions.some(v => !Number.isFinite(v)) || c.faces.some(f => f.length < 3 || new Set(f).size !== f.length || f.some(v => !valid(v)))) fail('invalid cage coordinates or topology');
  const point = (v: number) => c.positions.slice(3*v,3*v+3);
  const sub = (a: readonly number[], b: readonly number[]) => a.map((v,i) => v-b[i]);
  if (frame === 'edge') {
    if (s.mode !== 'edge' || s.sel.edges.length !== 1 || s.sel.vertices.length || s.sel.faces.length) fail('pick exactly one current edge');
    const [a,b] = [...s.sel.edges[0]].sort((x,y)=>x-y);
    if (!valid(a) || !valid(b) || !cageTopology(c).edges.has(`${a}_${b}`)) fail('pick a current cage edge');
    return normalizedCageDirection(sub(point(b),point(a)));
  }
  if (!(['face', 'face-u', 'face-v'] as string[]).includes(frame) || s.mode !== 'face' || s.sel.faces.length !== 1 || s.sel.edges.length || s.sel.vertices.length) fail('pick exactly one planar convex quad face');
  const face = s.sel.faces[0];
  if (!Number.isInteger(face) || face < 0 || face >= c.faces.length || c.faces[face].length !== 4) fail('pick a current quad face');
  const p = c.faces[face].map(point), local = p.map(q=>sub(q,p[0]));
  const extent = Math.max(...local.map(q=>Math.hypot(...q)));
  if (!Number.isFinite(extent) || extent <= 1e-9) fail('degenerate or unsupported coordinate range');
  const epsilon = Math.max(1e-9,extent*1e-9)/extent;
  const q = local.map(v=>v.map(x=>x/extent));
  const cross = (a: readonly number[],b: readonly number[]) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const dot = (a: readonly number[],b: readonly number[]) => a.reduce((sum,x,i)=>sum+x*b[i],0);
  const raw = cross(q[1],q[2]);
  if (Math.hypot(...raw) <= epsilon*epsilon) fail('degenerate quad');
  const normal = normalizedCageDirection(raw);
  if (q.some(v=>Math.abs(dot(v,normal))>epsilon)) fail('quad must be planar');
  for(let i=0;i<4;i++) {
    const a=sub(q[(i+1)%4],q[i]), b=sub(q[(i+2)%4],q[(i+1)%4]);
    if(Math.hypot(...a)<=epsilon || dot(cross(a,b),normal)<=epsilon*epsilon) fail('quad must be strictly convex and nondegenerate');
  }
  if (frame === 'face') return normal;
  // Canonical corner makes U/V independent of cyclic indexing (winding still matters).
  const ids = c.faces[face], start = ids.indexOf(Math.min(...ids));
  const edge = normalizedCageDirection(sub(p[(start + 1) % 4], p[start]));
  const alongNormal = dot(edge, normal);
  const u = normalizedCageDirection(edge.map((v, k) => v - alongNormal * normal[k]));
  return frame === 'face-u' ? u : normalizedCageDirection(cross(normal, u));
}
