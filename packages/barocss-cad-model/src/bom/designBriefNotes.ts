// Explicit, read-only BOM consumer of design intent. No new document field or approval semantics.
import type { StudioDoc } from '../engine/doc';
import type { Field } from '../engine/schema/brief';
import { canonical } from '../util/revision';
import type { BomPanelData } from './bom';
import { purchaseCell } from './csvCell';

const sources = new WeakMap<BomPanelData, StudioDoc>();
/** Called only by the BOM derivation boundary; not stored in a document or serialized report. */
export function rememberBomNoteSource(data: BomPanelData, doc: StudioDoc): void { sources.set(data, doc); }
export interface DesignBriefNoteGroup {
  parts: string[];
  state: 'note' | 'absent' | 'invalid';
  field?: Field<string>;
  raw?: unknown;
}
export interface DesignBriefNoteLine { itemNo: number; parts: string[]; groups: DesignBriefNoteGroup[] }
export type DesignBriefNotes = { ok: true; lines: DesignBriefNoteLine[]; excluded: { itemNo: number; parts: string[]; reason: string }[] } | { ok: false; error: string };
const record = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
function validField(x: unknown): x is Field<string> {
  if (!record(x) || typeof x.value !== 'string' || !['stated', 'assumed', 'ambiguous'].includes(String(x.basis))) return false;
  if (Object.keys(x).some(k => !['value', 'basis', 'source', 'why', 'confirmed', 'said'].includes(k))) return false;
  if (['source', 'why'].some(k => x[k] !== undefined && typeof x[k] !== 'string')) return false;
  if (x.said !== undefined && x.said !== 'verified' && x.said !== 'unverified') return false;
  return x.confirmed === undefined || record(x.confirmed) && x.confirmed.by === 'user' && typeof x.confirmed.at === 'string'
    && Object.keys(x.confirmed).every(k => k === 'by' || k === 'at');
}
/** Diagnostics retain only JSON source data, never invoke accessors or coerce unsupported values. */
function jsonSafe(value: unknown, ancestors = new Set<object>()): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) return;
  if (typeof value !== 'object' || ancestors.has(value)) throw new Error('Unsupported note value');
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new Error('Unsupported note object');
  if (Object.getOwnPropertySymbols(value).length) throw new Error('Symbol note key');
  ancestors.add(value);
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) { if (!Object.hasOwn(value, i)) throw new Error('Sparse note data'); }
  }
  for (const [key, d] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
    if (Array.isArray(value) && key === 'length') continue;
    if (!('value' in d) || !d.enumerable) throw new Error('Unsupported note property');
    jsonSafe(d.value, ancestors);
  }
  ancestors.delete(value);
}
/** The exact accepted source of these BOM rows, never a same-name lookup or a fresh grouping. */
export function designBriefNotes(doc: StudioDoc, data: BomPanelData): DesignBriefNotes {
  try { return readNotes(doc, data); }
  catch { return { ok: false, error: 'Design brief notes contain cyclic or unsupported source data; no note report was produced.' }; }
}
function readNotes(doc: StudioDoc, data: BomPanelData): DesignBriefNotes {
  if (sources.get(data) !== doc) return { ok: false, error: 'Design brief notes require the current document and its own BOM result.' };
  const lines: DesignBriefNoteLine[] = [], excluded: Extract<DesignBriefNotes, { ok: true }>['excluded'] = [];
  for (const [index, line] of data.bom.lines.entries()) {
    const itemNo = index + 1;
    if (line.assembly || line.level || line.parent !== undefined || line.kind !== undefined || line.source !== null || line.plate || line.member) {
      excluded.push({ itemNo, parts: [...line.parts], reason: 'Only top-level ordinary made parts are included; nested assemblies, bought parts and elements are excluded.' });
      continue;
    }
    if (!line.parts.length || new Set(line.parts).size !== line.parts.length) return { ok: false, error: `BOM item ${itemNo} has missing or duplicate occurrence identities.` };
    const groups: DesignBriefNoteGroup[] = [];
    let outside = false;
    for (const id of line.parts) {
      const views = data.view.parts.filter(p => p.id === id);
      if (views.length !== 1) return { ok: false, error: `BOM item ${itemNo} has no unique current occurrence ${id}.` };
      const view = views[0];
      if (view.parent !== undefined || view.assembly || view.fastener || view.library !== null || id.includes('/')) { outside = true; break; }
      const matches = data.single && id === 'base' ? [doc] : (doc.instances ?? []).filter(i => i.id === id).map(i => i.doc);
      if (matches.length !== 1) return { ok: false, error: `BOM item ${itemNo} has no unique definition for ${id}.` };
      const definition = matches[0];
      const terminal = definition.nodes.at(-1);
      const fastener = terminal && 'made' in terminal && terminal.made?.command === 'fastener';
      if (definition.instances?.length || definition.nodes.some(n => n.kind === 'library') || fastener) { outside = true; break; }
      const raw: unknown = definition.brief?.notes;
      if (raw !== undefined) jsonSafe(raw);
      const note: Omit<DesignBriefNoteGroup, 'parts'> = raw === undefined ? { state: 'absent' }
        : validField(raw) ? { state: 'note', field: structuredClone(raw) } : { state: 'invalid', raw: structuredClone(raw) };
      const key = canonical(note), same = groups.find(g => canonical({ state: g.state, field: g.field, raw: g.raw }) === key);
      if (same) same.parts.push(id); else groups.push({ parts: [id], ...note });
    }
    if (outside) excluded.push({ itemNo, parts: [...line.parts], reason: 'This grouped row includes an unsupported nested, bought or non-ordinary part; no partial note mapping is presented.' });
    else lines.push({ itemNo, parts: [...line.parts], groups });
  }
  return { ok: true, lines, excluded };
}
/** Separate opt-in report: one row per original BOM row, quantity never repeated per note variant.
 * Full Field data and occurrence mapping are JSON, not a certified manufacturing instruction.
 * Existing purchase CSV remains byte-for-byte unchanged. */
export function designBriefNotesCsv(doc: StudioDoc, data: BomPanelData): { ok: true; text: string } | { ok: false; error: string } {
  const notes = designBriefNotes(doc, data); if (!notes.ok) return notes;
  const rows: (string | number)[][] = [['item no.', 'item', 'qty', 'note scope', 'design brief notes / occurrence mapping JSON']];
  for (const [index, line] of data.bom.lines.entries()) {
    const itemNo = index + 1, included = notes.lines.find(l => l.itemNo === itemNo), excluded = notes.excluded.find(l => l.itemNo === itemNo);
    rows.push([itemNo, line.item, line.qty, included ? 'Design brief notes: intent, not approval' : `Excluded: ${excluded?.reason ?? 'unsupported'}`,
      JSON.stringify(included ? included.groups : { parts: line.parts, state: 'excluded' })]);
  }
  return { ok: true, text: rows.map(row => row.map(purchaseCell).join(',')).join('\n') + '\n' };
}
