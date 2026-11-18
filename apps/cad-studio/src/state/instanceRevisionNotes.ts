import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { Basis } from '@barocss/cad-model/engine/schema/brief';
import { canonical } from '@barocss/cad-model/util/revision';

export interface RevisionNoteText { text: string | null; basis: Basis | null; confirmed: boolean }
export type InstanceRevisionNotes = null | { ok: false; error: string } | {
  ok: true; definitionId: string; currentRevision: string; offeredRevision: string; sharedCount: number;
  current: RevisionNoteText; offered: RevisionNoteText;
  textChange: 'added' | 'removed' | 'changed' | 'same'; metadataChanged: boolean;
};
const record = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const own = (x: object, key: string) => Object.hasOwn(x, key);
// Validate without readBrief: malformed data must not silently become an absent note.
function note(brief: unknown): { summary: RevisionNoteText; metadata: unknown } | null {
  const missing = { summary: { text: null, basis: null, confirmed: false }, metadata: null };
  if (brief === undefined) return missing;
  if (!record(brief) || brief.version !== 1) return null;
  if (!own(brief, 'notes')) return missing;
  const field = brief.notes;
  if (!record(field) || Object.keys(field).some(k => !['value', 'basis', 'source', 'why', 'said', 'confirmed'].includes(k))) return null;
  if (typeof field.value !== 'string' || !field.value.trim() || field.value.length > 500 || !['stated', 'assumed', 'ambiguous'].includes(String(field.basis))) return null;
  for (const key of ['source', 'why']) if (own(field, key) && typeof field[key] !== 'string') return null;
  if (own(field, 'said') && field.said !== 'verified' && field.said !== 'unverified') return null;
  if (own(field, 'confirmed') && (!record(field.confirmed) || field.confirmed.by !== 'user' || typeof field.confirmed.at !== 'string' || Object.keys(field.confirmed).some(k => k !== 'by' && k !== 'at'))) return null;
  const { value, ...metadata } = field;
  return { summary: { text: value, basis: field.basis as Basis, confirmed: own(field, 'confirmed') }, metadata };
}
/** Read-only, minimum disclosure. A recorded confirmation is not authentication or approval. */
export function readInstanceRevisionNotes(doc: StudioDoc, id: string): InstanceRevisionNotes {
  const error = (message: string): InstanceRevisionNotes => ({ ok: false, error: message });
  const instances = doc.instances ?? [], owners = instances.filter(i => i.id === id);
  if (!id || id === 'base' || id.includes('/') || owners.length !== 1 || new Set(instances.map(i => i.id)).size !== instances.length)
    return error('Select one unique top-level part to compare notes.');
  const owner = owners[0], definitionId = owner.part?.id;
  if (!definitionId) return null;
  const pending = own(doc.pendingParts ?? {}, definitionId) ? doc.pendingParts?.[definitionId] : undefined;
  if (pending === undefined) return own(doc.pendingParts ?? {}, definitionId) ? error('Revision information is invalid; notes cannot be compared.') : null;
  if (!record(pending) || !record(pending.doc) || typeof pending.rev !== 'string' || !pending.rev || typeof owner.part?.rev !== 'string' || !owner.part.rev)
    return error('Revision information is invalid; notes cannot be compared.');
  const members = instances.filter(i => i.part?.id === definitionId);
  if (members.some(i => i.part?.rev !== owner.part?.rev || canonical(i.doc) !== canonical(owner.doc)))
    return error('Shared definition content or revisions disagree; notes cannot be compared.');
  if (members.some(i => !note(i.doc.brief))) return error('Stored notes are invalid; they are preserved unchanged.');
  const current = note(owner.doc.brief), offered = note(pending.doc.brief);
  if (!current || !offered) return error('Stored notes are invalid; they are preserved unchanged.');
  const a = current.summary.text, b = offered.summary.text;
  return { ok: true, definitionId, currentRevision: owner.part!.rev, offeredRevision: pending.rev, sharedCount: members.length,
    current: current.summary, offered: offered.summary,
    textChange: a === b ? 'same' : a === null ? 'added' : b === null ? 'removed' : 'changed',
    metadataChanged: canonical(current.metadata) !== canonical(offered.metadata) };
}
