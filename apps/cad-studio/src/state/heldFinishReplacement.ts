import type { ModelNode, StudioDoc } from '@barocss/cad-model/engine/doc';
import type { DisplayEdge, Vec3 } from '@barocss/cad-model/engine/mesh';
export type HeldFinish = Extract<ModelNode,{kind:'fillet'|'chamfer'}>;
export type ReplacementEndpoints = {start:Vec3;end:Vec3};
type Candidate = {name:string;endpoints?:ReplacementEndpoints} | {error:string};
const point=(p:readonly number[])=>p.length===3&&p.every(Number.isFinite);
const distinct=(a:readonly number[],b:readonly number[])=>a.some((v,i)=>v!==b[i]);
export function heldFinishReplaceable(node: ModelNode | undefined): node is HeldFinish {
 if(!node?.held || (node.kind!=='fillet'&&node.kind!=='chamfer') || node.edges.length!==1)return false;
 if(node.kind==='chamfer'||!node.radii)return true;
 return node.section===undefined && typeof node.radius==='number' && Number.isFinite(node.radius) && node.radius>0 && node.radii.length===2 && node.radii.every(p=>p.atEnd===true&&p.fraction===undefined&&point(p.at)&&typeof p.radius==='number'&&Number.isFinite(p.radius)&&p.radius>0)
  && distinct(node.radii[0].at,node.radii[1].at);
}
export function heldFinishCandidate(finish: HeldFinish, edge: DisplayEdge | undefined, edges: readonly DisplayEdge[]): Candidate {
 const varying=finish.kind==='fillet'&&!!finish.radii;
 const error=varying?'Select one original unmerged straight edge on this feature’s body. Its first endpoint becomes Start and its second becomes End.':'Select one edge on the body of this feature.';
 if(!edge || !edges.includes(edge)||edge.names.length!==1||!edge.names[0]||edge.names[0].includes('+'))return {error};
 if(!varying)return {name:edge.names[0]};
 if(!heldFinishReplaceable(finish)||!(edge.nativeLine||edge.nativeFinishLine)||!point(edge.a)||!point(edge.b)||!distinct(edge.a,edge.b)
  ||edges.filter(item=>item.names.includes(edge.names[0])).length!==1)return {error};
 return {name:edge.names[0],endpoints:{start:[...edge.a],end:[...edge.b]}};
}
/** Explicit new Start/End assignment; numeric radius values are retained verbatim; bound and shaped laws are not offered. */
export function heldFinishReplacement(doc:StudioDoc,index:number,edge:DisplayEdge,edges:readonly DisplayEdge[],signature:NonNullable<HeldFinish['sigs']>[string]): StudioDoc | null {
 const original=doc.nodes[index];if(!heldFinishReplaceable(original)||(original.kind==='fillet'&&original.radii&&index!==doc.nodes.length-1))return null;
 const candidate=heldFinishCandidate(original,edge,edges);if('error'in candidate)return null;
 const feature={...original};delete feature.held;delete feature.suppressed;delete feature.rematched;
 const replacement={...feature,edges:[candidate.name],sigs:{[candidate.name]:signature},
  ...(original.kind==='fillet'&&original.radii&&candidate.endpoints?{radii:original.radii.map((control,i)=>({...control,at:[...(i?candidate.endpoints!.end:candidate.endpoints!.start)] as [number,number,number]}))}:{})};
 return {...doc,nodes:doc.nodes.map((node,i)=>i===index?replacement:node)};
}
