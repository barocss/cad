// Source-bound Note endpoints are display references, not datum/manufacturing symbols.
import type { BrepProjection } from '@barocss/cad';
import { sameDatumTargetSourceSig, toSig, type Sig } from '../engine/references';
import type { Vec3 } from '../engine/mesh';
import type { DrawingNote, DrawingSettings, DrawingViews, XY } from './types';
import { viewBreaksOf } from './breaks';
import { drawingScopeOf } from './scope';

export interface NoteTarget { edge: string; at: 'end'; near: Vec3; endpoint: 'min' | 'max'; sig: Sig; was?: string }
export type NoteTargetFailureCode = 'NOTE_TARGET_INVALID' | 'NOTE_TARGET_LOST' | 'NOTE_TARGET_AMBIGUOUS' | 'NOTE_TARGET_UNSUPPORTED' | 'NOTE_TARGET_UNVERIFIED';
export type NoteTargetFailure = { ok: false; code: NoteTargetFailureCode; reason: string };
export type NoteTargetResolution = { ok: true; at: Vec3; edge: string } | NoteTargetFailure;
export type NoteLeaderResolution = { ok: true; at: XY; point?: Vec3 } | NoteTargetFailure;
const fail = (code: NoteTargetFailureCode, reason: string): NoteTargetFailure => ({ ok: false, code, reason });
const record = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const tuple = (x: unknown, n: number): x is number[] => Array.isArray(x) && x.length === n && Array.from({length:n},(_,k)=>Object.hasOwn(x,k) && typeof x[k] === 'number' && Number.isFinite(x[k])).every(Boolean);
const keys = (x: Record<string, unknown>, allowed: string[]) => Object.keys(x).every(k => allowed.includes(k));
export function noteTargetValid(raw: unknown): raw is NoteTarget {
  if (!record(raw) || !keys(raw, ['edge','at','near','endpoint','sig','was']) || typeof raw.edge !== 'string' || !raw.edge.trim() || raw.at !== 'end' || !tuple(raw.near, 3) || (raw.endpoint !== 'min' && raw.endpoint !== 'max') || (raw.was !== undefined && typeof raw.was !== 'string')) return false;
  const s = raw.sig;
  return record(s) && keys(s, ['k','p','d','s','r','n']) && s.k === 'line' && tuple(s.p, 3) && tuple(s.d, 3) && Math.hypot(...s.d) > 0
    && typeof s.s === 'number' && Number.isFinite(s.s) && s.s > 0 && s.r === undefined
    && (s.n === undefined || (typeof s.n === 'number' && Number.isFinite(s.n)));
}
/** Never silently downgrade a malformed bound leader into a free-coordinate one. */
export function readNoteTarget(raw: unknown): NoteTarget {
  if (!noteTargetValid(raw)) throw new Error('[DRAWING_OPTIONS] A source-bound Note requires a signed straight-edge endpoint; the original note is retained.');
  return { edge: raw.edge, at: 'end', near: [...raw.near], endpoint: raw.endpoint,
    sig: { ...raw.sig, p: [...raw.sig.p], ...(raw.sig.d ? {d: [...raw.sig.d] as Vec3} : {}) }, ...(raw.was !== undefined ? {was: raw.was} : {}) };
}
function ordered(ends: readonly Vec3[] | null): [Vec3, Vec3] | null {
  if (!ends || ends.length !== 2 || !tuple(ends[0], 3) || !tuple(ends[1], 3)) return null;
  for (let k=0;k<3;k++) { if (ends[0][k]<ends[1][k]) return [ends[0],ends[1]]; if (ends[0][k]>ends[1][k]) return [ends[1],ends[0]]; }
  return null;
}
export function noteTargetEndpoint(ends: readonly Vec3[] | null, at: Vec3): 'min' | 'max' | null {
  const pair=ordered(ends); if (!pair || !tuple(at,3)) return null;
  return pair[0].every((x,k)=>x===at[k]) ? 'min' : pair[1].every((x,k)=>x===at[k]) ? 'max' : null;
}
function source(projection: BrepProjection, name: string): { ok: true; ends: [Vec3,Vec3]; sig: Sig } | NoteTargetFailure {
  const edges=projection.edges.filter(e=>e.name===name);
  if (!edges.length) return fail('NOTE_TARGET_LOST','The source edge is absent. Select a current endpoint explicitly.');
  if (edges.length!==1) return fail('NOTE_TARGET_AMBIGUOUS','The source edge name has multiple candidates.');
  const edge=edges[0], ends=ordered(edge.ends);
  if (!edge.pieces.some(piece=>piece.visible)) return fail('NOTE_TARGET_UNSUPPORTED','The source edge is not visible in this view. The note is retained until the edge is visible or explicitly reselected.');
  if (edge.kind!=='line' || edge.circle!==null || !ends) return fail('NOTE_TARGET_UNSUPPORTED','A unique straight B-rep edge with distinct finite endpoints is required.');
  const d:Vec3=[ends[1][0]-ends[0][0],ends[1][1]-ends[0][1],ends[1][2]-ends[0][2]], length=Math.hypot(...d);
  if (!Number.isFinite(length) || length<=0) return fail('NOTE_TARGET_UNSUPPORTED','The source edge length is invalid.');
  return {ok:true,ends,sig:toSig({kind:'line',at:ends[0].map((x,k)=>(x+ends[1][k])/2) as Vec3,dir:d.map(x=>x/length) as Vec3,size:length})};
}
export function captureNoteTarget(projection: BrepProjection, edge: string, at: Vec3): NoteTarget | null {
  const current=source(projection,edge); if (!current.ok) return null;
  const endpoint=noteTargetEndpoint(current.ends,at); if (!endpoint) return null;
  const target:NoteTarget={edge,at:'end',near:[...at],endpoint,sig:current.sig};
  return noteTargetValid(target) ? target : null;
}
export function resolveNoteTarget(projection: BrepProjection, target: NoteTarget): NoteTargetResolution {
  if (!noteTargetValid(target)) return fail('NOTE_TARGET_INVALID','The saved source endpoint is invalid; explicitly select it again.');
  if (target.was!==undefined) return fail('NOTE_TARGET_UNVERIFIED','A rematched endpoint requires explicit reselection.');
  const current=source(projection,target.edge); if (!current.ok) return current;
  if (!sameDatumTargetSourceSig(target.sig,current.sig)) return fail('NOTE_TARGET_UNVERIFIED','The source edge geometry changed. The note is retained; select the endpoint again.');
  return {ok:true,at:[...current.ends[target.endpoint==='min'?0:1]],edge:target.edge};
}
/** Scope must be supplied for a bound note. A free-coordinate legacy leader is never auto-attached. */
export function resolveNoteLeader(views: DrawingViews, note: DrawingNote, settings?: DrawingSettings): NoteLeaderResolution {
  const leader=note.leader;
  if (!leader) return fail('NOTE_TARGET_INVALID','This note has no leader.');
  if (!Object.hasOwn(leader,'target')) return {ok:true,at:[...leader.at]};
  if (!settings) return fail('NOTE_TARGET_UNVERIFIED','Current drawing ownership is required to verify a source-bound note.');
  let scope; try {scope=drawingScopeOf(settings);} catch {return fail('NOTE_TARGET_UNSUPPORTED','The drawing scope is invalid.');}
  if (scope.kind!=='part' || scope.part!==undefined || scope.body!==undefined || !['front','top','right'].includes(leader.view)) return fail('NOTE_TARGET_UNSUPPORTED','Source-bound notes require an ordinary base-part orthographic view.');
  const projection=views[leader.view];
  if (!projection || viewBreaksOf(projection,settings.breaks).length) return fail('NOTE_TARGET_UNSUPPORTED','Source-bound notes do not support broken or missing views.');
  if (settings.notes && settings.notes.filter(n=>n.id===note.id).length!==1) return fail('NOTE_TARGET_AMBIGUOUS','The note ID is not unique in this drawing.');
  const resolved=resolveNoteTarget(projection,leader.target!); if (!resolved.ok) return resolved;
  const point=resolved.at, dot=(axis:Vec3)=>point[0]*axis[0]+point[1]*axis[1]+point[2]*axis[2];
  return {ok:true,point,at:[dot(projection.right),dot(projection.up)]};
}
