import type { ModelNode } from '@barocss/cad-model/engine/doc';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import { toSig } from '@barocss/cad-model/engine/references';
import { signaturesOf } from '@barocss/cad-model/engine/rematch';

type Fillet = Extract<ModelNode, { kind: 'fillet' }>;

export const sameVec=(a:readonly number[],b:readonly number[])=>a.length===3&&b.length===3&&a.every((v,k)=>Number.isFinite(v)&&v===b[k]);

export function originalFilletEdge(stock: BodyResult, fillet: Fillet, edge: string, signatures: ReturnType<typeof signaturesOf>) {
  const sources = stock.mesh.edges.filter(source => source.names.includes(edge));
  const [source] = sources, sig = signatures.edges.get(edge), stored = fillet.sigs?.[edge];
  if (sources.length !== 1 || source.names.length !== 1 || !source.nativeJoint ||
    !sig || sig.shared || !stored || stored.k !== sig.kind || stored.n !== undefined) return;
  const native = toSig(sig);
  if (stored.s === native.s && sameVec(stored.p, native.p)) return { source, sig, stored, native };
}

export function exactStraightEdge(match: NonNullable<ReturnType<typeof originalFilletEdge>>) {
  const { sig, source, stored, native } = match;
  return sig.kind === 'line' && source.straight && source.nativeLine && stored.d && native.d && sameVec(stored.d, native.d);
}

export function closedSolid(body: BodyResult) {
  return body.topology?.kind === 'solid' && body.topology.bodyCount === 1 &&
    body.topology.openShells === 0 && body.topology.boundaryEdges === 0;
}
