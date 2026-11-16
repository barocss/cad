import type { DisplayEdge, Vec3 } from '@barocss/cad-model/engine/mesh';
import type { ModelNode } from '@barocss/cad-model/engine/doc';
import type { Active } from './commandState';
export type FilletStationDraft = {nodes: ModelNode[]; index: number; original: ModelNode; fractions: number[]};
export type FilletEndpoints = { start: Vec3; end: Vec3; stationProblem?: string; stations?: {label: string; at: Vec3; fraction: number}[] } | { reason: string };
const unsupported = (): FilletEndpoints => ({reason:'Endpoint locations require one original straight edge; curved edges, chains and ambiguous references are not supported.'});
const distance = (a: Vec3,b: Vec3) => Math.hypot(...a.map((v,i)=>v-b[i]));
export function filletEdgeEndpoints(edge?: DisplayEdge, node?: Extract<ModelNode,{kind:'fillet'}>): FilletEndpoints {
 if(!edge || !(edge.nativeLine || edge.nativeFinishLine) || edge.names.length!==1 || ![...edge.a,...edge.b].every(Number.isFinite) || distance(edge.a,edge.b)<=1e-9)return unsupported();
 let start=edge.a,end=edge.b;
 if(node){
  const controls=node.radii,a=controls?.[0],b=controls?.[controls.length-1];
  if(node.held || node.suppressed || node.edges.length!==1 || !a?.atEnd || !b?.atEnd || ![...a.at,...b.at].every(Number.isFinite))return unsupported();
  if(controls!.some(p=>p.fraction!==undefined)){
   const original=b.at.map((v,i)=>v-a.at[i]),live=end.map((v,i)=>v-start[i]);
   const ol=Math.hypot(...original),ll=Math.hypot(...live),dot=original.reduce((s,v,i)=>s+v*live[i],0)/(ol*ll);
   const cross=Math.hypot(original[1]*live[2]-original[2]*live[1],original[2]*live[0]-original[0]*live[2],original[0]*live[1]-original[1]*live[0])/(ol*ll);
   if(!Number.isFinite(dot)||!Number.isFinite(cross)||cross>1e-9)return unsupported();
   if(dot<0)[start,end]=[end,start];
  }else{
   const keep=distance(a.at,start)+distance(b.at,end),swap=distance(a.at,end)+distance(b.at,start);
   if(Math.abs(keep-swap)<=1e-9*Math.max(1,keep,swap))return {reason:'The original Start/End assignment is ambiguous; endpoint locations are not shown.'};
   if(swap<keep)[start,end]=[end,start];
  }
 }
 return withFilletStations({start:[...start],end:[...end]},node?.radii?.slice(1,-1).map(p=>p.fraction ?? NaN) ?? []);
}
export function activeFilletEndpoints(active: Active | null): FilletEndpoints | null {
 if(active?.cmd.id!=='fillet'||active.fillet?.radiusMode!=='varying')return null;
 const selected=active.ctx.selection;
 if(selected.edges.length!==1||selected.faces.length)return unsupported();
 const pick=selected.edges[0], ends=filletEdgeEndpoints(active.ctx.bodies[pick.body]?.mesh.edges[pick.edge]);
 const fractions=active.values.stationMode==='two-interior' ? [Number(active.values.stationAt)/100,Number(active.values.station2At)/100] : active.values.stationMode==='interior' ? [Number(active.values.stationAt)/100] : [];
 return withFilletStations(ends,fractions);
}

/** Positions on the current original straight edge, never on the preview's rounded output. */
export function withFilletStations(ends: FilletEndpoints, fractions: readonly number[]): FilletEndpoints {
 if('reason' in ends)return ends;
 if(fractions.length>2 || fractions.some((f,i)=>!Number.isFinite(f)||f<=1e-9||f>=1-1e-9||(i>0&&f-fractions[i-1]<=1e-9)))
  return {start:ends.start,end:ends.end,stationProblem:'Interior locations require one or two increasing positions strictly between 0% and 100%.'};
 const {start,end}=ends;
 return {start,end,...(fractions.length ? {stations:fractions.map((fraction,i)=>({label:fractions.length===1?'Interior':`Interior ${i+1}`,fraction,at:start.map((v,k)=>v+(end[k]-v)*fraction) as Vec3}))} : {})};
}

/** A narrow store subscription: radius edits do not move the read-only station locations. */
export function filletStationInputKey(active: {cmd: {id: string}; fillet?: {radiusMode?: string}; values: Active['values']} | null): string {
 if(active?.cmd.id!=='fillet'||active.fillet?.radiusMode!=='varying')return '';
 return JSON.stringify(['stationMode','stationAt','station2At'].map(key=>[typeof active.values[key],String(active.values[key])]));
}
