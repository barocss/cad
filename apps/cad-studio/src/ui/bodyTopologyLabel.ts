import type { BodyResult } from '@barocss/cad-model/engine/evaluate';

type Body = Pick<BodyResult, 'topology'>;
export function bodyTopologyLabel(body: Body): string {
  const t = body.topology;
  if (!t || t.kind === 'unknown') return 'Body · topology unknown';
  if (t.kind === 'solid') return 'Solid';
  if (t.kind === 'mixed') return 'Mixed solid/surface body';
  return t.openShells ? 'Open surface' : 'Surface';
}
export function bodyTopologyCounts(bodies: readonly Body[]): string {
  const counts = new Map<string, number>();
  for (const body of bodies) { const label = bodyTopologyLabel(body).toLowerCase(); counts.set(label, (counts.get(label) ?? 0) + 1); }
  return counts.size ? [...counts].map(([label, count]) => `${count} ${count === 1 ? label : label === 'body · topology unknown' ? 'bodies · topology unknown' : label === 'mixed solid/surface body' ? 'mixed solid/surface bodies' : label + 's'}`).join(' · ') : '0 bodies';
}
export function nativeBoundaryLabel(body: Body): string {
  return body.topology?.boundaryEdges == null ? 'Native boundary count unknown' : `${body.topology.boundaryEdges} native boundary edges`;
}
