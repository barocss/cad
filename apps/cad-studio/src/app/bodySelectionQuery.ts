import { bodyName, lookOf, materialIdOf } from '@barocss/cad-model/app/bodies';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import { bodyKeyFor } from '@barocss/cad-model/engine/ids';

export const BODY_SELECTION_QUERY_MAX = 256;
export type BodySelectionMaterial = { kind: 'any' } | { kind: 'unspecified' } | { kind: 'id'; id: string };
export interface BodySelectionQuery { name: string; material: BodySelectionMaterial }
export interface BodySelectionMatch { index: number; key: string; name: string; materialId: string | undefined }
export interface BodySelectionQueryResult { matches: BodySelectionMatch[]; reason: string | null }

/** Read-only preview. Callers must revalidate document/evaluation ownership before explicit selection. */
export function bodySelectionQuery(doc: StudioDoc, bodies: readonly BodyResult[], query: BodySelectionQuery): BodySelectionQueryResult {
  const refuse = (reason: string): BodySelectionQueryResult => ({ matches: [], reason });
  if (query.name.length > BODY_SELECTION_QUERY_MAX) return refuse(`Name contains must be at most ${BODY_SELECTION_QUERY_MAX} characters.`);
  const needle = query.name.trim().toLowerCase(), material = query.material;
  if (material.kind === 'id' && !material.id) return refuse('Choose a material ID.');
  if (!needle && material.kind === 'any') return refuse('Enter a name condition or choose a material condition.');
  const matches: BodySelectionMatch[] = [];
  const counts = new Map<string, number>();
  for (const body of bodies) counts.set(body.key, (counts.get(body.key) ?? 0) + 1);
  bodies.forEach((body, index) => {
    const ref = body.ref, output = doc.outputs[body.key];
    if (!ref || !Number.isInteger(ref.node) || ref.node < 0 || !doc.nodes[ref.node]
      || body.key.includes('/') || counts.get(body.key) !== 1 || !output || output.node !== ref.node || output.side !== ref.side
      || bodyKeyFor(doc.nodes, ref.node, ref.side) !== body.key || lookOf(doc, body).hidden) return;
    const name = bodyName(doc, body), materialId = materialIdOf(doc, body);
    if (!name.toLowerCase().includes(needle)) return;
    if (material.kind === 'unspecified' && materialId !== undefined || material.kind === 'id' && materialId !== material.id) return;
    matches.push({ index, key: body.key, name, materialId });
  });
  return { matches, reason: matches.length ? null : 'No visible bodies match these conditions. Selection has not changed.' };
}
