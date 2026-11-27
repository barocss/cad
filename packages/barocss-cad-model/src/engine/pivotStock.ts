import { isBoxReplacementSource, isStraightPolygonReplacementSource, type ModelNode } from './doc';
import type { BodyResult } from './evaluate';

type RotatedPivotStockMode = 'rotated' | 'rotated-polygon';
export type PivotStockMode = 'cardinal' | 'polygon' | RotatedPivotStockMode;

/** Original stock with owned single-solid placement features. */
export function pivotStockMode(nodes: readonly ModelNode[], index: number): PivotStockMode | undefined {
  let at = index, rotated = false;
  for (;;) {
    const node = nodes[at];
    if (!node || node.suppressed || node.held) return;
    if (node.kind !== 'translate' && node.kind !== 'rotate') {
      if (isBoxReplacementSource(nodes, at)) return rotated ? 'rotated' : 'cardinal';
      if (node.kind === 'extrude' && node.cutDepth === undefined && isStraightPolygonReplacementSource(nodes, node))
        return rotated ? 'rotated-polygon' : 'polygon';
      return;
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

export function pivotPolygonCap(face: string, support: string): 'top' | 'bottom' | undefined {
  const owner = /^(.+)\.side\d+$/.exec(face)?.[1];
  if (!owner) return;
  if (support === `${owner}.top`) return 'top';
  if (support === `${owner}.bottom`) return 'bottom';
}

export function rotatedPivotStockMode(nodes: readonly ModelNode[], node: ModelNode): RotatedPivotStockMode | undefined {
  if (node.kind !== 'draft' || node.hingeEdge === undefined || node.pull !== undefined || node.neutral !== undefined
    || node.parent.side !== 'solid') return;
  const mode = pivotStockMode(nodes, node.parent.node);
  if (mode === 'rotated' || mode === 'rotated-polygon') return mode;
}

export function followsRotatedPivotStock(nodes: readonly ModelNode[], node: ModelNode): boolean {
  return rotatedPivotStockMode(nodes, node) !== undefined;
}

export function hasRotatedPivotBinding(body: BodyResult, faceName: string, edgeName: string, mode: RotatedPivotStockMode = 'rotated'): boolean {
  const faces = body.mesh.faces.filter(face => face.nativePlaneName === faceName);
  const edges = body.mesh.edges.filter(edge => edge.names.includes(edgeName));
  if (faces.length !== 1 || edges.length !== 1) return false;
  const hinge = pivotStockEdge(body, faces[0].index, edges[0].index);
  return !!hinge && (mode === 'rotated' || !!pivotPolygonCap(hinge.faceName, hinge.supportName));
}
