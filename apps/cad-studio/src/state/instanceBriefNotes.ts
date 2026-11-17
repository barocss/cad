import type { StudioDoc, PartInstance } from '@barocss/cad-model/engine/doc';
import { badValue, confirmField } from '@barocss/cad-model/chat/brief';
import { BRIEF_FIELDS, type Brief, type BriefKey } from '@barocss/cad-model/engine/schema/brief';
import { editDefinition } from '@barocss/cad-model/assembly/definitions';
import { BOUGHT_BY_DEFAULT } from '@barocss/cad-model/engine/elements';
import { canonical } from '@barocss/cad-model/util/revision';
const record = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
/** Refuse malformed stored fields instead of invoking permissive readBrief and dropping data. */
function validBrief(raw: unknown): boolean {
    if (raw === undefined)
        return true;
    if (!record(raw) || raw.version !== 1 || Object.keys(raw).some(k => k !== 'version' && !BRIEF_FIELDS.includes(k as BriefKey)))
        return false;
    return BRIEF_FIELDS.every(key => {
        const f = raw[key];
        if (f === undefined)
            return !Object.hasOwn(raw, key);
        return record(f) && !Object.keys(f).some(k => !['value', 'basis', 'source', 'why', 'said', 'confirmed'].includes(k)) && !badValue(key, f.value)
            && ['stated', 'assumed', 'ambiguous'].includes(String(f.basis)) && ['source', 'why'].every(k => f[k] === undefined || typeof f[k] === 'string')
            && (f.said === undefined || f.said === 'verified' || f.said === 'unverified')
            && (f.confirmed === undefined || record(f.confirmed) && f.confirmed.by === 'user' && typeof f.confirmed.at === 'string' && Object.keys(f.confirmed).every(k => k === 'by' || k === 'at'));
    });
}
export type InstanceNoteScope = {
    ok: true;
    owner: PartInstance;
    members: PartInstance[];
    text: string;
} | {
    ok: false;
    error: string;
};
export function instanceNoteScope(doc: StudioDoc, id: string): InstanceNoteScope {
    const list = doc.instances ?? [], owners = list.filter(i => i.id === id);
    if (owners.length !== 1 || id.includes('/'))
        return { ok: false, error: 'Select one unique top-level part.' };
    const owner = owners[0], members = owner.part ? list.filter(i => i.part?.id === owner.part!.id) : [owner];
    if (new Set(list.map(i => i.id)).size !== list.length)
        return { ok: false, error: 'Occurrence identities are ambiguous.' };
    for (const i of members) {
        const d = i.doc;
        if (i.pattern || doc.instancePatterns?.some(p => p.seed === i.id) || i.part?.source?.startsWith('./') || i.part && doc.pendingParts?.[i.part.id])
            return { ok: false, error: 'Linked parts, patterns and pending revisions are not editable here.' };
        if (d.instances?.length || !d.nodes.length || !Object.values(d.outputs).some(o => o.side === 'solid') || d.nodes.some(n => BOUGHT_BY_DEFAULT.has(n.kind) || ['coupling', 'library', 'frame', 'frame-member', 'gusset', 'end-cap'].includes(n.kind) || 'made' in n && n.made?.command === 'fastener' || 'bought' in n && n.bought))
            return { ok: false, error: 'Only ordinary made parts are supported; nested, library, fastener, frame/plate and default-purchased elements (including made overrides), and couplings are excluded.' };
        if (!validBrief(d.brief))
            return { ok: false, error: 'The stored brief is invalid; it is preserved unchanged.' };
        if (i.part?.rev !== owner.part?.rev || canonical(d) !== canonical(owner.doc))
            return { ok: false, error: 'Shared definition content or revisions disagree; no notes were changed.' };
    }
    return { ok: true, owner, members, text: owner.doc.brief?.notes?.value ?? '' };
}
/** Only called by explicit Save: confirmation records the new text, never stale provenance. */
export function editInstanceBriefNote(doc: StudioDoc, id: string, text: string, at: string): {
    ok: true;
    doc: StudioDoc;
    changed: boolean;
} | {
    ok: false;
    error: string;
} {
    const scope = instanceNoteScope(doc, id);
    if (!scope.ok)
        return scope;
    const bad = badValue('notes', text);
    if (bad)
        return { ok: false, error: `Notes must be ${bad}. Blank clearing is not supported here.` };
    if (text === scope.text)
        return { ok: true, doc, changed: false };
    const brief: Brief = { ...(scope.owner.doc.brief ?? { version: 1 }), notes: { value: text, basis: 'stated', source: text } };
    const confirmed = confirmField(brief, 'notes', at);
    if ('error' in confirmed)
        return { ok: false, error: confirmed.error };
    const result = editDefinition(doc, id, { ...scope.owner.doc, brief: confirmed });
    return 'error' in result ? { ok: false, error: result.error } : { ok: true, doc: result.doc, changed: result.changed };
}

/** Explicit deletion only: retain the brief container and every unrelated field. */
export function clearInstanceBriefNote(doc: StudioDoc, id: string): ReturnType<typeof editInstanceBriefNote> {
    const scope = instanceNoteScope(doc, id);
    if (!scope.ok) return scope;
    if (!scope.owner.doc.brief?.notes) return { ok: true, doc, changed: false };
    const brief = { ...scope.owner.doc.brief };
    delete brief.notes;
    const result = editDefinition(doc, id, { ...scope.owner.doc, brief });
    return 'error' in result ? { ok: false, error: result.error } : { ok: true, doc: result.doc, changed: result.changed };
}

/** A closed or replaced editor cannot submit a previously captured Save callback. */
export function createNoteEditSession() {
  let current: object | null = null;
  return {
    begin() { current = {}; return current; },
    end() { current = null; },
    run(token: object | null, action: () => void): boolean {
      if (!token || token !== current) return false;
      action();
      return true;
    },
  };
}
