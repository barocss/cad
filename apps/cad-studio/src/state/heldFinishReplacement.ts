import { withFilletStations } from '../app/filletEndpoints';
import type { Dim, ModelNode, StudioDoc } from '@barocss/cad-model/engine/doc';
import type { DisplayEdge, Vec3 } from '@barocss/cad-model/engine/mesh';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import { signaturesOf } from '@barocss/cad-model/engine/rematch';
import { sameDatumTargetSourceSig, toSig, type Problem, type Sig } from '@barocss/cad-model/engine/references';
export type HeldFinish = Extract<ModelNode,{kind:'fillet'|'chamfer'}>;
export type ReplacementEndpoints = {start:Vec3;end:Vec3;stations?:{label:string;at:Vec3;fraction:number}[]};
type Candidate = {name:string;endpoints?:ReplacementEndpoints} | {error:string};
const point=(p:readonly number[])=>p.length===3&&p.every(Number.isFinite);
const distinct=(a:readonly number[],b:readonly number[])=>a.some((v,i)=>v!==b[i]);
type Parameters = Readonly<Record<string, number>>;
const nativeLine = (edge: DisplayEdge) => (edge.nativeLine || edge.nativeFinishLine) &&
  edge.straight && point(edge.a) && point(edge.b) && distinct(edge.a, edge.b);
function positiveRadius(dim: Dim, parameters: Parameters): boolean {
 const value = typeof dim === 'number' ? dim
  : dim && typeof dim === 'object' && !Array.isArray(dim) && Object.keys(dim).length === 1
    && Object.hasOwn(dim,'parameter') && typeof dim.parameter === 'string' && Object.hasOwn(parameters, dim.parameter) ? parameters[dim.parameter] : NaN;
 return typeof value === 'number' && Number.isFinite(value) && value > 0;
}
/** Replacement review only; preserve authored parameter names and show their current value. */
export function heldFinishRadiusText(dim: Dim, parameters: Parameters): string {
 if(typeof dim==='number')return String(dim);
 return `${dim.parameter} (${positiveRadius(dim,parameters)?String(parameters[dim.parameter]):'unavailable'})`;
}
export function heldFinishReplaceable(node: ModelNode | undefined, parameters: Parameters = {}): node is HeldFinish & { edges: [string] } {
 if(!node?.held || (node.kind!=='fillet'&&node.kind!=='chamfer') || node.edges.length!==1)return false;
 if(node.kind==='chamfer'||!node.radii)return true;
 const controls=node.radii,last=controls.length-1;
 if(node.section!==undefined || !positiveRadius(node.radius,parameters) || controls.length<2 || controls.length>4)return false;
 return controls.every((p,i)=>point(p.at)&&positiveRadius(p.radius,parameters)
  && (i===0||i===last ? p.atEnd===true&&p.fraction===undefined
    : p.atEnd===undefined&&typeof p.fraction==='number'&&Number.isFinite(p.fraction)&&p.fraction>1e-9&&p.fraction<1-1e-9
      && (i===1||p.fraction-controls[i-1].fraction!>1e-9)))
  && distinct(controls[0].at,controls[last].at);
}
function constantPair(node: ModelNode | undefined): node is Extract<HeldFinish, { kind: 'fillet' }> & { edges: [string, string] } {
 return node?.kind === 'fillet' && !!node.held && node.suppressed === true && node.edges.length === 2 &&
  node.edges[0] !== node.edges[1] && !node.radii && node.section === undefined && !node.rematched;
}

/** Match the two current problems to the author's slot order. Both must still be held by this terminal Fillet. */
export function heldFilletPairProblems(doc: StudioDoc, index: number, problems: readonly Problem[]): [Problem, Problem] | undefined {
 const node = doc.nodes[index];
 if (!constantPair(node) || index !== doc.nodes.length - 1 || !positiveRadius(node.radius, doc.parameters) ||
     !node.edges.every(name => node.sigs?.[name]?.k === 'line' && node.sigs[name].n === undefined)) return;
 const here = problems.filter(problem => problem.node === index);
 if (here.length !== 2) return;
 const first = here.find(problem => problem.name === node.edges[0]);
 const second = here.find(problem => problem.name === node.edges[1]);
 if (first && second && first.index !== second.index) return [first, second];
}

export function validFilletPairEdge(edge: DisplayEdge | undefined, edges: readonly DisplayEdge[]): edge is DisplayEdge {
 return !!edge && !!edge.nativeJoint && !!nativeLine(edge) && edge.names.length === 1 &&
  !!edge.names[0] && !edge.names[0].includes('+') && edges.includes(edge) &&
  edges.filter(member => member.names.includes(edge.names[0]) || member.nativeJoint?.edgeId === edge.nativeJoint!.edgeId).length === 1;
}

/** Both signatures come from the owned live mesh. Remove both authored aliases before writing either pick. */
export function replaceHeldFilletPair(doc: StudioDoc, index: number, problems: readonly Problem[],
 body: BodyResult, picks: readonly [DisplayEdge | undefined, DisplayEdge | undefined]): StudioDoc | null {
 const original = doc.nodes[index];
 if (!constantPair(original) || !heldFilletPairProblems(doc, index, problems)) return null;
 const [first, second] = picks, edges = body.mesh.edges;
 if (!validFilletPairEdge(first, edges) || !validFilletPairEdge(second, edges) || first === second) return null;
 const names = [first.names[0], second.names[0]];
 const signatures = signaturesOf(body).edges;
 const a = signatures.get(names[0]), b = signatures.get(names[1]);
 if (a?.kind !== 'line' || b?.kind !== 'line' || a.shared !== undefined || b.shared !== undefined) return null;
 const sigs = { ...original.sigs };
 for (const name of original.edges) delete sigs[name];
 sigs[names[0]] = toSig(a);
 sigs[names[1]] = toSig(b);
 const next = { ...original, edges: names, sigs };
 delete next.held; delete next.suppressed;
 return { ...doc, nodes: doc.nodes.map((node, i) => i === index ? next : node) };
}

/** Direct replacement releases a pair only when its other authored line still has its original identity. */
export function heldFinishProblem(doc: StudioDoc, index: number, problems: readonly Problem[], body: BodyResult): Problem | undefined {
 const node = doc.nodes[index];
 if (heldFinishReplaceable(node, doc.parameters)) {
  if (node.kind === 'fillet' && node.radii && index !== doc.nodes.length - 1) return;
  return problems.find(problem => problem.node === index && problem.name === node.edges[0]);
 }
 if (!constantPair(node) || index !== doc.nodes.length - 1 || !positiveRadius(node.radius, doc.parameters)) return;
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
export function heldFinishReplacement(doc:StudioDoc,index:number,edge:DisplayEdge,edges:readonly DisplayEdge[],signature:Sig, heldName?: string): StudioDoc | null {
 const original=doc.nodes[index];
 if (heldName !== undefined) {
  if (!constantPair(original) || index !== doc.nodes.length - 1 || !original.edges.includes(heldName) ||
      !positiveRadius(original.radius, doc.parameters) || signature.k !== 'line' || signature.n !== undefined) return null;
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
