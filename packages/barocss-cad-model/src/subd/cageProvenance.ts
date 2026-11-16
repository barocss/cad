import type { ModelNode } from '../engine/doc';
import { canonical } from '../util/revision';
type SubdNode = Extract<ModelNode, { kind: 'subd' }>;
/** Opening or cancelling cage editing does not erase a recipe; actual cage changes do. */
export function updateSubdCage(node: SubdNode, cage: SubdNode['cage'], mirror?: SubdNode['mirror']): SubdNode {
  if (node.mirror === mirror && canonical(node.cage) === canonical(cage)) return node;
  const next = { ...node, cage };
  delete next.made; delete next.mirror;
  if (mirror) next.mirror = mirror;
  return next;
}
