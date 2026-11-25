import { withFilletStations } from '../app/filletEndpoints';
import { point, distinct, nativeLine, positiveSize, isHeldConstantFinishGroup, heldFinishGroupProblems,
  validFinishGroupEdge, type HeldFinish, type Parameters } from '@barocss/cad-model/engine/heldFinishGroup';
export { heldFinishGroupProblems, validFinishGroupEdge } from '@barocss/cad-model/engine/heldFinishGroup';
export type { HeldFinish } from '@barocss/cad-model/engine/heldFinishGroup';
import type { Dim, ModelNode, StudioDoc } from '@barocss/cad-model/engine/doc';
import type { DisplayEdge, Vec3 } from '@barocss/cad-model/engine/mesh';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import { bodyKeyFor } from '@barocss/cad-model/engine/ids';
import { signaturesOf } from '@barocss/cad-model/engine/rematch';
import { sameDatumTargetSourceSig, toSig, type Problem, type Sig } from '@barocss/cad-model/engine/references';
export type ReplacementEndpoints = {start:Vec3;end:Vec3;stations?:{label:string;at:Vec3;fraction:number}[]};
type Candidate = {name:string;endpoints?:ReplacementEndpoints} | {error:string};
/** Replacement review only; preserve authored parameter names and show their current value. */
export function heldFinishRadiusText(dim: Dim, parameters: Parameters): string {
 if(typeof dim==='number')return String(dim);
 return `${dim.parameter} (${positiveSize(dim,parameters)?String(parameters[dim.parameter]):'unavailable'})`;
}
export function heldFinishReplaceable(node: ModelNode | undefined, parameters: Parameters = {}): node is HeldFinish & { edges: [string] } {
 if(!node?.held || (node.kind!=='fillet'&&node.kind!=='chamfer') || node.edges.length!==1)return false;
 if(node.kind==='chamfer'||!node.radii)return true;
 const controls=node.radii,last=controls.length-1;
 if(node.section!==undefined || !positiveSize(node.radius,parameters) || controls.length<2 || controls.length>4)return false;
 return controls.every((p,i)=>point(p.at)&&positiveSize(p.radius,parameters)
  && (i===0||i===last ? p.atEnd===true&&p.fraction===undefined
    : p.atEnd===undefined&&typeof p.fraction==='number'&&Number.isFinite(p.fraction)&&p.fraction>1e-9&&p.fraction<1-1e-9
      && (i===1||p.fraction-controls[i-1].fraction!>1e-9)))
  && distinct(controls[0].at,controls[last].at);
}
/** Each signature comes from the owned live mesh. Remove historical aliases before writing any pick. */
export function replaceHeldFinishGroup(doc: StudioDoc, index: number, problems: readonly Problem[],
 body: BodyResult, picks: readonly (DisplayEdge | undefined)[], allowDownstream = false): StudioDoc | null {
 const original = doc.nodes[index];
 if (!isHeldConstantFinishGroup(original) || !heldFinishGroupProblems(doc, index, problems, allowDownstream) ||
     picks.length !== original.edges.length || new Set(picks).size !== picks.length) return null;
 const signatures = signaturesOf(body).edges;
 const names: string[] = [];
 const sigs = { ...original.sigs };
 for (const name of original.edges) delete sigs[name];
 for (const pick of picks) {
  if (!validFinishGroupEdge(pick, body.mesh.edges)) return null;
  const name = pick.names[0], signature = signatures.get(name);
  if (signature?.kind !== 'line' || signature.shared !== undefined) return null;
  names.push(name);
  sigs[name] = toSig(signature);
 }
 const next = { ...original, edges: names, sigs };
 delete next.held; delete next.suppressed;
 return { ...doc, nodes: doc.nodes.map((node, i) => i === index ? next : node) };
}

/**
 * Return the unchanged solid passthrough body when a held constant single-edge finish is followed
 * solely by held/suppressed downstream finishes along its body chain.
 */
export function heldFinishPassthroughBody(doc: StudioDoc, index: number, bodies: readonly BodyResult[]): BodyResult | undefined {
 const finish = doc.nodes[index];
 if (!heldFinishReplaceable(finish, doc.parameters) || !finish.suppressed || (finish.kind === 'fillet' && finish.radii)) return;
 if (bodies.some(body => body.key === bodyKeyFor(doc.nodes, index, 'solid'))) return;
 const matches = bodies.filter(body => {
  if (body.ref?.side !== 'solid' || body.ref.node <= index || body.topology?.kind !== 'solid' || body.topology.bodyCount !== 1) return false;
  let cursor = body.ref.node;
  while (cursor > index) {
   const step = doc.nodes[cursor];
   if (!step?.held || !step.suppressed || (step.kind !== 'fillet' && step.kind !== 'chamfer') ||
       step.parent.side !== 'solid' || step.parent.node >= cursor) return false;
   cursor = step.parent.node;
  }
  return cursor === index;
 });
 return matches.length === 1 ? matches[0] : undefined;
}

/** Direct replacement releases a pair only when its other authored line still has its original identity. */
export function heldFinishProblem(doc: StudioDoc, index: number, problems: readonly Problem[], body: BodyResult, allowDownstream = false): Problem | undefined {
 const node = doc.nodes[index];
 if (heldFinishReplaceable(node, doc.parameters)) {
  if (node.kind === 'fillet' && node.radii && index !== doc.nodes.length - 1) return;
  return problems.find(problem => problem.node === index && problem.name === node.edges[0]);
 }
 if (!isHeldConstantFinishGroup(node) || node.kind !== 'fillet' || node.edges.length !== 2 ||
     (allowDownstream ? index !== doc.nodes.length - 2 : index !== doc.nodes.length - 1) ||
     !positiveSize(node.radius, doc.parameters)) return;
 const failures = problems.filter(problem => problem.node === index);
 if (failures.length !== 1) return;
 const [problem] = failures;
 const retained = node.edges.find(name => name !== problem.name);
 if (!retained || !node.edges.includes(problem.name)) return;
 const saved = node.sigs?.[retained], missing = node.sigs?.[problem.name];
 if (saved?.k !== 'line' || saved.n !== undefined || missing?.k !== 'line' || missing.n !== undefined) return;
 const edges = body.mesh.edges.filter(edge => edge.names.includes(retained));
 if (edges.length !== 1 || edges[0].names.length !== 1 || !nativeLine(edges[0])) return;
 const signature = signaturesOf(body).edges.get(retained);
 if (signature && sameDatumTargetSourceSig(saved, toSig(signature))) return problem;
}

export function heldFinishCandidate(finish: HeldFinish, edge: DisplayEdge | undefined, edges: readonly DisplayEdge[], parameters: Parameters = {}, heldName?: string): Candidate {
 const varying=finish.kind==='fillet'&&!!finish.radii;
 const paired=heldName!==undefined;
 const error=varying?'Select one original unmerged straight edge on this feature’s body. Its first endpoint becomes Start and its second becomes End.':
  paired?'Select one unmerged straight edge on the body of this feature.':'Select one edge on the body of this feature.';
 if(!edge || !edges.includes(edge)||edge.names.length!==1||!edge.names[0]||edge.names[0].includes('+'))return {error};
 if (paired) {
  const name = edge.names[0];
  if (name !== heldName && finish.edges.includes(name)) return {error:'This feature already uses that edge.'};
  if (!nativeLine(edge) || edges.filter(item => item.names.includes(name)).length !== 1) return {error};
 }
 if(!varying)return {name:edge.names[0]};
 if(!heldFinishReplaceable(finish,parameters)||!(edge.nativeLine||edge.nativeFinishLine)||!point(edge.a)||!point(edge.b)||!distinct(edge.a,edge.b)
  ||edges.filter(item=>item.names.includes(edge.names[0])).length!==1)return {error};
 const endpoints=withFilletStations({start:[...edge.a],end:[...edge.b]},finish.radii!.slice(1,-1).map(p=>p.fraction!));
 if('reason'in endpoints || endpoints.stationProblem)return {error};
 return {name:edge.names[0],endpoints};
}
/** Explicit new Start/End assignment; radius values and parameter references are retained verbatim; shaped laws are not offered. */
export function heldFinishReplacement(doc:StudioDoc,index:number,edge:DisplayEdge,edges:readonly DisplayEdge[],signature:Sig, heldName?: string, allowDownstream = false): StudioDoc | null {
 const original=doc.nodes[index];
 if (heldName !== undefined) {
  if (!isHeldConstantFinishGroup(original) || original.kind !== 'fillet' || original.edges.length !== 2 ||
      (allowDownstream ? index !== doc.nodes.length - 2 : index !== doc.nodes.length - 1) ||
      !original.edges.includes(heldName) ||
      !positiveSize(original.radius, doc.parameters) || signature.k !== 'line' || signature.n !== undefined) return null;
 } else if (!heldFinishReplaceable(original,doc.parameters)||(original.kind==='fillet'&&original.radii&&index!==doc.nodes.length-1)) return null;
 const candidate=heldFinishCandidate(original,edge,edges,doc.parameters,heldName);if('error'in candidate)return null;
 const feature={...original};delete feature.held;delete feature.suppressed;delete feature.rematched;
 const names = heldName === undefined ? [candidate.name] : original.edges.map(name => name === heldName ? candidate.name : name);
 const sigs = heldName === undefined ? {} : { ...original.sigs };
 if (heldName !== undefined) delete sigs[heldName];
 sigs[candidate.name] = signature;
 const replacement={...feature,edges:names,sigs,
  ...(original.kind==='fillet'&&original.radii&&candidate.endpoints?{radii:original.radii.map((control,i)=>({...control,at:[...(i===0?candidate.endpoints!.start:i===original.radii!.length-1?candidate.endpoints!.end:candidate.endpoints!.stations![i-1].at)] as [number,number,number]}))}:{})};
 return {...doc,nodes:doc.nodes.map((node,i)=>i===index?replacement:node)};
}
