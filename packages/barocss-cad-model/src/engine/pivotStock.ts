import { isBoxReplacementSource, type ModelNode } from './doc';
import type { BodyResult } from './evaluate';

/** An original rectangular extrusion and a chain of single solid Move/Rotate features. */
export function pivotStockMode(nodes: readonly ModelNode[], index: number): 'cardinal' | 'rotated' | undefined {
  let at = index, rotated = false;
  for (;;) {
    const node = nodes[at];
    if (!node || node.suppressed || node.held) return;
    if (node.kind !== 'translate' && node.kind !== 'rotate') {
      if (!isBoxReplacementSource(nodes, at)) return;
      return rotated ? 'rotated' : 'cardinal';
    }
    const { side, node: parent } = node.parent;
    if (side !== 'solid' || !Number.isSafeInteger(parent) || parent < 0 || parent >= at) return;
    if (node.kind === 'rotate') rotated = true;
    at = parent;
  }
}

/** Exact native membership serves both a cardinal pull and a support-relative hinge. */
export function pivotStockEdge(body: BodyResult, faceIndex: number, edgeIndex: number) {
  if (body.topology?.kind !== 'solid' || body.topology.bodyCount !== 1) return;
  const face = body.mesh.faces[faceIndex], edge = body.mesh.edges[edgeIndex];
  if (!face?.nativePlaneName || face.exact?.kind !== 'plane' || !edge?.nativeLine || !edge.nativeJoint
    || edge.names.length !== 1 || edge.faces.length !== 2 || !edge.faces.includes(faceIndex)) return;
  const otherIndex = edge.faces.find(index => index !== faceIndex);
  const other = otherIndex === undefined ? undefined : body.mesh.faces[otherIndex];
  if (!other?.nativePlaneName || other.exact?.kind !== 'plane') return;
  return { faceName: face.nativePlaneName, supportName: other.nativePlaneName, face, edge, other };
}

export function followsRotatedPivotStock(nodes: readonly ModelNode[], node: ModelNode): boolean {
  return node.kind === 'draft' && node.hingeEdge !== undefined && node.pull === undefined && node.neutral === undefined
    && node.parent.side === 'solid' && pivotStockMode(nodes, node.parent.node) === 'rotated';
}

export function hasRotatedPivotBinding(body: BodyResult, faceName: string, edgeName: string): boolean {
  const faces = body.mesh.faces.filter(face => face.nativePlaneName === faceName);
  const edges = body.mesh.edges.filter(edge => edge.names.includes(edgeName));
  return faces.length === 1 && edges.length === 1 && !!pivotStockEdge(body, faces[0].index, edges[0].index);
}
