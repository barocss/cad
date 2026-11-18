import { CadPartLimits } from '@barocss/cad';
import type { ModelNode } from '../engine/doc';
import type { Vec3 } from '../engine/mesh';
import { toSig } from '../engine/references';
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const positive = (v: unknown): v is number => finite(v) && v > 0 && v <= CadPartLimits.length;
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const only = (v: unknown, keys: string[]) => record(v) && Object.keys(v).every(k => keys.includes(k));
const point = (v: unknown): v is Vec3 => Array.isArray(v) && v.length === 3 && v.every(finite);
const equal = (a: Vec3, b: Vec3) => a.every((v, i) => v === b[i]);
/** UI eligibility only. Apply must independently prove the named native parent edge and its exact endpoints. */
export function filletRadiusMode(nodes: readonly ModelNode[], index: number): { mode: 'constant' | 'varying'; ends: [Vec3, Vec3] } | undefined {
  if (index !== 2 || nodes.length !== 3) return;
  const [sk, ex, f] = nodes;
  if (sk.kind !== 'sketch' || sk.profile !== 'rectangle' || !only(sk, ['id','kind','profile','min','max'])
    || !Array.isArray(sk.min) || !Array.isArray(sk.max) || sk.min.length !== 2 || sk.max.length !== 2 || ![...sk.min,...sk.max].every(finite)) return;
  if (ex.kind !== 'extrude' || ex.sketch !== 0 || !only(ex, ['id','kind','sketch','height','from','draft'])
    || !positive(ex.height) || (ex.from !== undefined && !finite(ex.from)) || (ex.draft !== undefined && ex.draft !== 0)) return;
  if (f.kind !== 'fillet' || !only(f, ['id','kind','parent','edges','radius','radii','section','sigs']) || f.section !== undefined
    || !only(f.parent, ['node','side']) || f.parent.node !== 1 || f.parent.side !== 'solid' || !positive(f.radius)
    || !Array.isArray(f.edges) || f.edges.length !== 1 || typeof f.edges[0] !== 'string' || !f.edges[0]
    || !record(f.sigs) || Object.keys(f.sigs).length !== 1 || !Object.hasOwn(f.sigs, f.edges[0])) return;
  const sig = f.sigs[f.edges[0]];
  if (!only(sig, ['k','p','d','s']) || sig.k !== 'line' || !point(sig.p) || !point(sig.d) || !finite(sig.s) || sig.s <= 0) return;
  const low: Vec3 = [sk.min[0] as number, sk.min[1] as number, ex.from ?? 0], high: Vec3 = [sk.max[0] as number, sk.max[1] as number, (ex.from ?? 0) + ex.height];
  if (!point(low) || !point(high) || !low.every((v, i) => v < high[i])) return;
  const candidates: [Vec3,Vec3][] = [];
  for (let axis = 0; axis < 3; axis++) for (let mask = 0; mask < 4; mask++) {
    const other = [0,1,2].filter(i => i !== axis), a: Vec3 = [...low], b: Vec3 = [...low];
    other.forEach((k, j) => { a[k] = b[k] = mask & (1 << j) ? high[k] : low[k]; }); b[axis] = high[axis];
    const length = Math.hypot(...b.map((v, i) => v - a[i]));
    if (!finite(length) || length <= 0) return;
    const direction: Vec3 = [0,0,0]; direction[axis] = 1;
    if (sig.d[axis] === -1) { direction[axis] = -1; const tmp: Vec3 = [...a]; a.splice(0,3,...b); b.splice(0,3,...tmp); }
    const s = toSig({kind:'line', at: a.map((v,i) => (v+b[i])/2) as Vec3, dir:direction, size:length});
    if (point(s.p) && finite(s.s) && equal(s.p,sig.p) && s.s === sig.s && equal(s.d!,sig.d)) candidates.push([a,b]);
  }
  if (candidates.length !== 1) return;
  const ends = candidates[0];
  if (f.radii !== undefined) {
    if (!Array.isArray(f.radii) || f.radii.length !== 2 || !f.radii.every(p => only(p,['at','radius','atEnd']) && point(p.at) && p.atEnd === true && p.radius === f.radius)) return;
    const [a,b] = f.radii;
    if (!(equal(a.at,ends[0]) && equal(b.at,ends[1]) || equal(a.at,ends[1]) && equal(b.at,ends[0]))) return;
  }
  return {mode:f.radii === undefined ? 'constant' : 'varying', ends};
}
export function setFilletRadiusMode(nodes: readonly ModelNode[], index: number, value: unknown): ModelNode[] {
  const info = filletRadiusMode(nodes,index), out = [...nodes];
  if (!info || (value !== 'constant' && value !== 'varying') || info.mode === value) return out;
  const f = nodes[index]; if (f.kind !== 'fillet') return out;
  if (value === 'constant') { const next = {...f}; delete next.radii; out[index] = next; }
  else out[index] = {...f, radii: info.ends.map(at => ({at:[...at] as Vec3, radius:f.radius, atEnd:true as const}))};
  return out;
}
