import type { BodyResult } from '../engine/evaluate';

/** A complete straight native edge with unambiguous endpoints on one solid body. */
export function nativeSolidLine(body: BodyResult | undefined, index: number) {
  if (!body || body.ref?.side !== 'solid' || body.topology?.kind !== 'solid' || body.topology.bodyCount !== 1) return;
  const edge = body.mesh.edges[index];
  if (!edge?.nativeLine || !edge.nativeVertices || !edge.nativeJoint || edge.names.length !== 1
    || edge.nativeVertices[0] === edge.nativeVertices[1] || edge.nativeJoint.faces[0] === edge.nativeJoint.faces[1]) return;
  const { edgeId } = edge.nativeJoint;
  if (body.mesh.edges.some(other => other !== edge && (other.nativeJoint?.edgeId === edgeId || other.names.includes(edge.names[0])))) return;
  if (![...edge.a, ...edge.b].every(Number.isFinite) || edge.a.every((coordinate, k) => coordinate === edge.b[k])) return;
  return edge;
}
