import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import { readBaselines, verifyBaseline, type Baseline } from '@barocss/cad-model/team/baseline';

export type NoteBaselineStatus = { id: string; state: 'matching' | 'changed' | 'unverified'; details: string[] };
const record = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const hash = (x: unknown) => typeof x === 'string' && /^[a-f0-9]{64}$/.test(x);
const states = ['draft', 'review', 'approved', 'rejected'];
const reservedKey = (key: string) => Object.hasOwn(Object.prototype, key);
/** Admission for the existing verifier, not a replacement file schema or approval validator. */
function readable(x: unknown): x is Baseline {
  if (!record(x) || typeof x.id !== 'string' || !x.id || x.kind !== 'bom' || !states.includes(String(x.state))
    || !hash(x.digest) || !(x.parent === null || typeof x.parent === 'string' && !!x.parent)
    || !(x.parentDigest === null || hash(x.parentDigest)) || (x.parent === null) !== (x.parentDigest === null)
    || !record(x.content) || !record(x.content.bom) || !record(x.content.interfaces)
    || !record(x.pins) || !hash(x.pins.bom) || !hash(x.pins.interfaces) || !record(x.pins.parts)
    || Object.keys(x.pins.parts).some(reservedKey) || !Object.values(x.pins.parts).every(hash) || !Array.isArray(x.moves)
    || !x.moves.every(m => record(m) && states.includes(String(m.to)) && typeof m.at === 'string')
    || (x.cites !== undefined && !Array.isArray(x.cites))) return false;
  return true;
}
const unavailable = (id: string, detail: string): NoteBaselineStatus => ({ id, state: 'unverified', details: [detail] });
/** Read stored approved records against authored inputs only. Does not approve, repair, or evaluate cited analyses. */
export function noteBaselineStatus(doc: StudioDoc): NoteBaselineStatus[] {
  const raw: unknown = doc.baselines;
  if (raw === undefined) return [];
  if (!record(raw) || raw.version !== 1 || !Array.isArray(raw.baselines))
    return [unavailable('Baseline records', 'Stored baseline log cannot be read.')];
  const rows = raw.baselines;
  if (!rows.every(readable)) return [unavailable('Baseline records', 'Stored baseline record is malformed.')];
  const ids = rows.map(b => b.id);
  if (new Set(ids).size !== ids.length) return [unavailable('Baseline records', 'Stored baseline IDs are ambiguous.')];
  const instances = doc.instances ?? [];
  if (!Array.isArray(instances) || !Array.isArray(doc.nodes) || !instances.every(i => record(i) && typeof i.id === 'string' && !!i.id && !reservedKey(i.id))
    || new Set(instances.map(i => i.id)).size !== instances.length || doc.nodes.length > 0 && instances.some(i => i.id === 'base'))
    return [unavailable('Baseline records', 'Current part identities are ambiguous or unreadable.')];
  const log = readBaselines(raw), byId = new Map(log.baselines.map(b => [b.id, b]));
  return log.baselines.filter(b => b.state === 'approved').map(b => {
    const seen = new Set<string>();
    for (let current: Baseline | undefined = b; current; current = current.parent === null ? undefined : byId.get(current.parent)) {
      if (seen.has(current.id)) return unavailable(b.id, 'Stored baseline parent chain is cyclic.');
      seen.add(current.id);
      if (seen.size > 4096) return unavailable(b.id, 'Stored baseline parent chain exceeds the verifier limit.');
      if (current.parent !== null && !byId.has(current.parent)) return unavailable(b.id, `Parent ${current.parent} is missing.`);
    }
    try {
      const check = verifyBaseline(doc, b.id);
      if (!check.intact) return { id: b.id, state: 'unverified', details: check.mismatches };
      return { id: b.id, state: check.current ? 'matching' : 'changed', details: check.changed };
    } catch {
      return unavailable(b.id, 'Stored record or current document cannot be verified.');
    }
  });
}
