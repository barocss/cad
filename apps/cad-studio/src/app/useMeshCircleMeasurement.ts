import { useMemo, useRef, useState } from 'react';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import type { Vec3 } from '@barocss/cad-model/engine/mesh';
import { meshCircle } from '@barocss/cad-model/app/meshCircle';
import { stlCornerOccurrences } from '../files/stlCornerProvenance';
import { captureMeshVertexPick, currentMeshVertexTarget, type MeshVertexTarget } from '../viewport/vertexPick';
export type MeshCircleMode = 'evaluated' | 'stl' | null;
export interface MeshCircleHit { vertex?: {body:number;at:Vec3}; instance?:string; direct?:string }
export interface MeshCircleState { points: MeshVertexTarget[]; result: ReturnType<typeof meshCircle> | null; reason: string | null }
export const emptyMeshCircle = (): MeshCircleState => ({points:[],result:null,reason:null});
export function appendMeshCircle(state:MeshCircleState,target:MeshVertexTarget):MeshCircleState {
 if(state.points.length===3)return {...state,reason:'Reset before choosing another set of three points.'};
 if(state.points.some(p=>p.doc!==target.doc||p.body!==target.body||p.mesh!==target.mesh))return {...state,reason:'Choose three vertices on the same current base body.'};
 if(state.points.some(p=>p.id===target.id||p.at.every((x,k)=>x===target.at[k])))return {...state,reason:'Choose a different welded vertex.'};
 const points=[...state.points,target];
 if(points.length<3)return {points,result:null,reason:null};
 const result=meshCircle(points.map(p=>p.at));
 return result.ok?{points,result,reason:null}:{...state,reason:result.reason};
}
/** Transient only. Owner changes invalidate synchronously, before stale callbacks can append. */
export function useMeshCircleMeasurement(doc:StudioDoc,bodies:readonly BodyResult[],session:unknown,enabled:boolean,ready:boolean){
 const owner=useMemo(()=>({}),[doc,bodies,session,enabled,ready]);
 const [stored,setStored]=useState({owner,token:{},mode:null as MeshCircleMode,state:emptyMeshCircle()});
 const retained=stored.owner===owner && stored.state.points.every(p=>currentMeshVertexTarget(p,doc,bodies));
 const current=retained?stored:{owner,token:{},mode:enabled?stored.mode:null,state:emptyMeshCircle()};
 if(!retained)setStored(current);
 const token=current.token;
 const live=useRef({owner,token,mode:current.mode,enabled,ready});live.current={owner,token,mode:current.mode,enabled,ready};
 const valid=()=>live.current.owner===owner&&live.current.token===token&&live.current.enabled;
 const update=(state:MeshCircleState)=>setStored(prev=>valid()&&prev.owner===owner&&prev.token===token&&live.current.mode?{...prev,state}:prev);
 const pick=(hit:MeshCircleHit):boolean=>{
  if(!current.mode||!enabled)return false;
  if(!valid()||!live.current.mode)return true;
  if(!ready){update({...current.state,reason:'Current unmodified base mesh is unavailable. Close section or preview and wait for evaluation.'});return true;}
  if(hit.instance||hit.direct||!hit.vertex){update({...current.state,reason:'Select a visible evaluated welded mesh vertex.'});return true;}
  const target=captureMeshVertexPick(hit.vertex,doc,bodies);
  if(!target||!currentMeshVertexTarget(target,doc,bodies)){update({...current.state,reason:'This endpoint has no current welded mesh vertex authority.'});return true;}
  if (current.mode === 'stl' && !stlCornerOccurrences(target.doc, target.at)) {
   update({...current.state,reason:'Original STL corners are unavailable for this endpoint.'});
   return true;
  }
  setStored(prev=>{
   if(prev.owner!==owner||prev.token!==token||!live.current.mode||!live.current.ready||!valid())return prev;
   const state=prev.state.points.every(p=>currentMeshVertexTarget(p,doc,bodies))?prev.state:emptyMeshCircle();
   return {...prev,state:appendMeshCircle(state,target)};
  });return true;
 };
 const restart=(mode:MeshCircleMode)=>{
  if(!valid())return;
  const nextToken={};
  live.current={...live.current,token:nextToken,mode};
  setStored({owner,token:nextToken,mode,state:emptyMeshCircle()});
 };
 return {mode:current.mode,state:current.state,ready,pick,choose:restart,reset:()=>restart(current.mode)};
}
