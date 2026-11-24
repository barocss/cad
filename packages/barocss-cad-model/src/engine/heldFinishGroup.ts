import type { Dim, ModelNode, StudioDoc } from './doc';
import type { DisplayEdge } from './mesh';
import type { Problem } from './references';

export type HeldFinish = Extract<ModelNode, { kind: 'fillet' | 'chamfer' }>;
export const point=(p:readonly number[])=>p.length===3&&p.every(Number.isFinite);
export const distinct=(a:readonly number[],b:readonly number[])=>a.some((v,i)=>v!==b[i]);
export type Parameters = Readonly<Record<string, number>>;
export const nativeLine = (edge: DisplayEdge) => (edge.nativeLine || edge.nativeFinishLine) &&
  edge.straight && point(edge.a) && point(edge.b) && distinct(edge.a, edge.b);
export function positiveSize(dim: Dim, parameters: Parameters): boolean {
 const value = typeof dim === 'number' ? dim
  : dim && typeof dim === 'object' && !Array.isArray(dim) && Object.keys(dim).length === 1
    && Object.hasOwn(dim,'parameter') && typeof dim.parameter === 'string' && Object.hasOwn(parameters, dim.parameter) ? parameters[dim.parameter] : NaN;
 return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function isHeldConstantFinishGroup(node: ModelNode | undefined): node is HeldFinish {
 return !!node && (node.kind === 'fillet' || node.kind === 'chamfer') && !!node.held &&
  node.suppressed === true && !node.rematched &&
  (node.edges.length === 2 || node.edges.length === 3) &&
  new Set(node.edges).size === node.edges.length &&
  (node.kind === 'chamfer' || (!node.radii && node.section === undefined));
}

/** Group replacement applies to terminal finishes with original, unmerged line signatures. */
export function isHeldConstantLineFinish(doc: StudioDoc, index: number, node = doc.nodes[index]): node is HeldFinish {
 return isHeldConstantFinishGroup(node) && index === doc.nodes.length - 1 &&
  positiveSize(node.kind === 'fillet' ? node.radius : node.distance, doc.parameters) &&
  node.edges.every(name => node.sigs?.[name]?.k === 'line' && node.sigs[name].n === undefined);
}

/** Match all current problems to the authored slot order of this terminal finish. */
export function heldFinishGroupProblems(doc: StudioDoc, index: number, problems: readonly Problem[]): Problem[] | undefined {
 const node = doc.nodes[index];
 if (!isHeldConstantLineFinish(doc, index, node)) return;
 const here = problems.filter(problem => problem.node === index);
 if (here.length !== node.edges.length || new Set(here.map(problem => problem.index)).size !== here.length) return;
 const ordered: Problem[] = [];
 for (const name of node.edges) {
  const problem = here.find(problem => problem.name === name);
  if (!problem) return;
  ordered.push(problem);
 }
 return ordered;
}

export function validFinishGroupEdge(edge: DisplayEdge | undefined, edges: readonly DisplayEdge[]): edge is DisplayEdge {
 return !!edge && !!edge.nativeJoint && !!nativeLine(edge) && edge.names.length === 1 &&
  !!edge.names[0] && !edge.names[0].includes('+') && edges.includes(edge) &&
  edges.filter(member => member.names.includes(edge.names[0]) || member.nativeJoint?.edgeId === edge.nativeJoint!.edgeId).length === 1;
}
