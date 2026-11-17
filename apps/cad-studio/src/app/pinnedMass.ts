import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import { bodyKeyFor } from '@barocss/cad-model/engine/ids';
import { bodyMaterialOf, bodyName, lookOf } from '@barocss/cad-model/app/bodies';
import { bodyMass, combined } from '@barocss/cad-model/app/mass';
import { MATERIALS } from '@barocss/cad-model/library/materials';

export interface MassMember { key: string; feature: string; kind: string }
export type PinnedMassResult = { ok: false; reason: string } | {
  ok: true; mass: number; centroid: [number, number, number]; members: { name: string; key: string; hidden: boolean; basis: string }[];
};
function owner(doc: StudioDoc, body: BodyResult): MassMember | null {
  const ref = body.ref, output = doc.outputs[body.key];
  if (!ref || ref.side !== 'solid' || output?.side !== 'solid' || output.node !== ref.node
    || bodyKeyFor(doc.nodes, ref.node) !== body.key || body.topology?.kind !== 'solid') return null;
  const node = doc.nodes[ref.node];
  if (!node?.id || node.held || node.suppressed || doc.nodes.filter(n => n.id === node.id).length !== 1) return null;
  return { key: body.key, feature: node.id, kind: node.kind };
}
export function captureMassMembers(doc: StudioDoc, bodies: readonly BodyResult[], indices: readonly number[]): MassMember[] | null {
  if (doc.instances?.length || indices.length < 1 || indices.length > 2 || new Set(indices).size !== indices.length) return null;
  const members: MassMember[] = [];
  for (const index of indices) {
    const body = bodies[index];
    if (!body || bodies.filter(b => b.key === body.key).length !== 1) return null;
    const member = owner(doc, body); if (!member) return null;
    members.push(member);
  }
  return members;
}
/** Only current accepted arrays enter here. Missing members never become a partial aggregate. */
export function readPinnedMass(doc: StudioDoc, bodies: readonly BodyResult[], members: readonly MassMember[], defaultMaterial: string): PinnedMassResult {
  const unavailable = (reason: string): PinnedMassResult => ({ ok: false, reason });
  if (doc.instances?.length || members.length < 1 || members.length > 2 || new Set(members.map(m => m.key)).size !== members.length) return unavailable('The pinned set is not an ordinary base-part set.');
  const parts = [], descriptions = [];
  for (const member of members) {
    const matches = bodies.filter(b => b.key === member.key);
    if (matches.length !== 1) return unavailable(`Pinned body ${member.key} is missing or ambiguous.`);
    const body = matches[0], current = owner(doc, body);
    if (!current || current.feature !== member.feature || current.kind !== member.kind) return unavailable(`Pinned body ${member.key} no longer has its original source identity.`);
    if (body.massRef !== undefined) return unavailable(`Waiting for current mass of ${member.key}.`);
    const material = bodyMaterialOf(doc, body), fallback = MATERIALS.find(m => m.id === defaultMaterial);
    const density = material.assumed ? fallback?.density : material.material.density;
    if (material.invalid || material.unresolved !== undefined || density === undefined || !Number.isFinite(density) || density <= 0) return unavailable(`Material density is unavailable for ${member.key}.`);
    const properties = bodyMass(body, density);
    if (!properties || !Number.isFinite(properties.mass) || properties.mass <= 0 || properties.centroid.length !== 3 || !properties.centroid.every(Number.isFinite)
      || properties.inertia.length !== 3 || !properties.inertia.every(row => row.length === 3 && row.every(Number.isFinite)) || !body.massMethod) return unavailable(`Qualified current mass is unavailable for ${member.key}.`);
    parts.push(properties);
    const estimate = body.massMethod === 'tessellated' || body.volumeBasis !== undefined;
    descriptions.push({ name: bodyName(doc, body), key: member.key, hidden: !!lookOf(doc, body).hidden,
      basis: `${body.massMethod}${estimate ? ` (estimate; volume bound ${body.volumeBasis?.bound ?? 'unknown'} mm³ is not a centroid error bound)` : ''}; ${material.assumed ? `assumed default ${defaultMaterial}` : material.material.label}; density ${density} g/cm³` });
  }
  const total = combined(parts);
  return total && Number.isFinite(total.mass) && total.mass > 0 && total.centroid.every(Number.isFinite)
    ? { ok: true, ...total, members: descriptions } : unavailable('The complete pinned set has no finite positive mass.');
}
