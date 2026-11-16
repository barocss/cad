import { withFilletStations } from '../app/filletEndpoints';
import type { ModelNode, StudioDoc } from '@barocss/cad-model/engine/doc';
import type { DisplayEdge, Vec3 } from '@barocss/cad-model/engine/mesh';
export type HeldFinish = Extract<ModelNode,{kind:'fillet'|'chamfer'}>;
export type ReplacementEndpoints = {start:Vec3;end:Vec3;stations?:{label:string;at:Vec3;fraction:number}[]};
type Candidate = {name:string;endpoints?:ReplacementEndpoints} | {error:string};
const point=(p:readonly number[])=>p.length===3&&p.every(Number.isFinite);
const distinct=(a:readonly number[],b:readonly number[])=>a.some((v,i)=>v!==b[i]);
export function heldFinishReplaceable(node: ModelNode | undefined): node is HeldFinish {
 if(!node?.held || (node.kind!=='fillet'&&node.kind!=='chamfer') || node.edges.length!==1)return false;
 if(node.kind==='chamfer'||!node.radii)return true;
 const controls=node.radii,last=controls.length-1;
 if(node.section!==undefined || typeof node.radius!=='number' || !Number.isFinite(node.radius) || node.radius<=0 || controls.length<2 || controls.length>4)return false;
 return controls.every((p,i)=>point(p.at)&&typeof p.radius==='number'&&Number.isFinite(p.radius)&&p.radius>0
  && (i===0||i===last ? p.atEnd===true&&p.fraction===undefined
    : p.atEnd===undefined&&typeof p.fraction==='number'&&Number.isFinite(p.fraction)&&p.fraction>1e-9&&p.fraction<1-1e-9
      && (i===1||p.fraction-controls[i-1].fraction!>1e-9)))
  && distinct(controls[0].at,controls[last].at);
}
export function heldFinishCandidate(finish: HeldFinish, edge: DisplayEdge | undefined, edges: readonly DisplayEdge[]): Candidate {
 const varying=finish.kind==='fillet'&&!!finish.radii;
 const error=varying?'Select one original unmerged straight edge on this feature’s body. Its first endpoint becomes Start and its second becomes End.':'Select one edge on the body of this feature.';
 if(!edge || !edges.includes(edge)||edge.names.length!==1||!edge.names[0]||edge.names[0].includes('+'))return {error};
 if(!varying)return {name:edge.names[0]};
 if(!heldFinishReplaceable(finish)||!(edge.nativeLine||edge.nativeFinishLine)||!point(edge.a)||!point(edge.b)||!distinct(edge.a,edge.b)
  ||edges.filter(item=>item.names.includes(edge.names[0])).length!==1)return {error};
 const endpoints=withFilletStations({start:[...edge.a],end:[...edge.b]},finish.radii!.slice(1,-1).map(p=>p.fraction!));
 if('reason'in endpoints || endpoints.stationProblem)return {error};
 return {name:edge.names[0],endpoints};
}
/** Explicit new Start/End assignment; numeric radius values are retained verbatim; bound and shaped laws are not offered. */
export function heldFinishReplacement(doc:StudioDoc,index:number,edge:DisplayEdge,edges:readonly DisplayEdge[],signature:NonNullable<HeldFinish['sigs']>[string]): StudioDoc | null {
 const original=doc.nodes[index];if(!heldFinishReplaceable(original)||(original.kind==='fillet'&&original.radii&&index!==doc.nodes.length-1))return null;
 const candidate=heldFinishCandidate(original,edge,edges);if('error'in candidate)return null;
 const feature={...original};delete feature.held;delete feature.suppressed;delete feature.rematched;
 const replacement={...feature,edges:[candidate.name],sigs:{[candidate.name]:signature},
  ...(original.kind==='fillet'&&original.radii&&candidate.endpoints?{radii:original.radii.map((control,i)=>({...control,at:[...(i===0?candidate.endpoints!.start:i===original.radii!.length-1?candidate.endpoints!.end:candidate.endpoints!.stations![i-1].at)] as [number,number,number]}))}:{})};
 return {...doc,nodes:doc.nodes.map((node,i)=>i===index?replacement:node)};
}
