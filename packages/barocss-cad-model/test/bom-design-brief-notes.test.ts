import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDoc, rectanglePart, type StudioDoc } from '../src/engine/doc';
import { bomPanelData, bomPanelDataOf, purchaseCsv } from '../src/bom/bom';
import { designBriefNotes, designBriefNotesCsv } from '../src/bom/designBriefNotes';
import { evaluateDoc } from '../src/engine/evaluate';
import { encodeStudioFile, readStudioFile } from '../src/engine/container';
import type { Field } from '../src/engine/schema/brief';
const A: Field<string> = { value: '검토용 A', basis: 'assumed', source: 'source A', why: 'trial', said: 'unverified' };
const B: Field<string> = { value: '검토용 B', basis: 'stated', source: 'source B', confirmed: { by: 'user', at: '2026-11-17T00:00:00Z' }, said: 'verified' };
function fixture(): StudioDoc {
  const base = rectanglePart(10, 10, 10), a = { ...base, brief: { version: 1 as const, notes: A } }, b = { ...base, brief: { version: 1 as const, notes: B } };
  return { ...emptyDoc(), instances: [a, a, b].map((doc, i) => ({ id: `p${i + 1}`, name: 'same name', doc, position: [i * 20, 0, 0], rotation: [0, 0, 0], ...(i < 2 ? { part: { id: 'shared', rev: 'r1' } } : {}) })) };
}
const dataOf = (doc: StudioDoc) => bomPanelDataOf(doc, d => evaluateDoc(d, 1));
const notesOf = (doc: StudioDoc, data = dataOf(doc)) => { const r = designBriefNotes(doc, data); assert.ok(r.ok, JSON.stringify(r)); return r; };
// Independent CSV reader: quoted CR/LF, quote doubling and trailing empty cells.
function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], cell = '', quote = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') { if (quote && text[i + 1] === '"') { cell += '"'; i++; } else quote = !quote; }
    else if (!quote && (c === ',' || c === '\n')) { row.push(cell); cell = ''; if (c === '\n') { rows.push(row); row = []; } }
    else cell += c;
  }
  assert.equal(quote, false); return rows;
}

test('one geometry row retains all Field metadata and note-to-occurrence mapping without changing quantity/mass', () => {
  const doc = fixture(), before = JSON.stringify(doc), data = dataOf(doc), original = structuredClone(data), csv = purchaseCsv(data, true);
  const notes = notesOf(doc, data); assert.equal(notes.lines.length, 1);
  assert.equal(data.bom.lines[0].qty, 3); assert.deepEqual(notes.lines[0].groups, [
    { parts: ['p1', 'p2'], state: 'note', field: A }, { parts: ['p3'], state: 'note', field: B },
  ]);
  assert.deepEqual(data, original); assert.equal(purchaseCsv(data, true), csv); assert.equal(JSON.stringify(doc), before);
  const exported = designBriefNotesCsv(doc, data); assert.ok(exported.ok);
  const rows = parseCsv(exported.text); assert.equal(rows.length, 2); assert.equal(rows[1][2], '3');
  assert.deepEqual(JSON.parse(rows[1][4]), notes.lines[0].groups);
  assert.deepEqual(Object.keys(data).sort(), Object.keys(original).sort());
});

test('identical values with differing basis or missing notes remain separate, absent and malformed are explicit', () => {
  const doc = fixture(); doc.instances![1].doc = { ...doc.instances![1].doc, brief: { version: 1, notes: { ...A, basis: 'ambiguous' } } };
  doc.instances![2].doc = { ...doc.instances![2].doc, brief: undefined };
  const r = notesOf(doc); assert.equal(r.lines[0].groups.length, 3); assert.equal(r.lines[0].groups[2].state, 'absent');
  const bad = { ...doc, instances: doc.instances!.map((i, k) => k === 2 ? { ...i, doc: { ...i.doc, brief: { version: 1, notes: { value: 'raw', basis: 'invented' } } } } : i) } as unknown as StudioDoc;
  assert.equal(notesOf(bad).lines[0].groups[2].state, 'invalid');
  assert.deepEqual(notesOf(bad).lines[0].groups[2].raw, { value: 'raw', basis: 'invented' });
});

test('foreign documents and copied result objects cannot borrow a BOM owner', async () => {
  const doc = fixture(), data = dataOf(doc);
  assert.equal(designBriefNotes({ ...doc }, data).ok, false);
  assert.equal(designBriefNotes(doc, structuredClone(data)).ok, false);
  const asyncData = await bomPanelData(doc, async d => evaluateDoc(d, 1));
  assert.equal(designBriefNotes(doc, asyncData).ok, true);
  const wrong = structuredClone(doc); wrong.instances![0].doc.brief!.notes = B;
  assert.equal(designBriefNotesCsv(wrong, data).ok, false);
});

test('notes do not alter geometry grouping, and parameter-based grouping remains distinct', () => {
  const doc = fixture(), baseline = dataOf(doc);
  const changed = { ...doc, instances: doc.instances!.map(i => ({ ...i, doc: { ...i.doc, brief: { version: 1 as const, notes: B } } })) };
  assert.deepEqual(dataOf(changed).bom, baseline.bom);
  assert.deepEqual(notesOf(changed).lines[0].groups[0].parts, ['p1', 'p2', 'p3']);
  const param = { ...doc, instances: doc.instances!.map((i, k) => ({ ...i, doc: { ...i.doc, parameters: { L: k === 2 ? 11 : 10 } } })) };
  assert.equal(dataOf(param).bom.lines.length, 2);
});

test('Unicode multiline quotes and formula-like strings preserve source JSON with existing CSV protection', () => {
  const doc = fixture(), note: Field<string> = { ...A, value: '=1+1, 한글\r\n"quoted"', source: '\t@danger', why: '+reason' };
  for (const i of doc.instances!) { i.doc = { ...i.doc, brief: { version: 1, notes: note } }; i.name = '  =SUM(1,2)'; }
  const data = dataOf(doc), result = designBriefNotesCsv(doc, data); assert.ok(result.ok);
  const rows = parseCsv(result.text); assert.equal(rows[1][1], "'  =SUM(1,2)");
  assert.deepEqual(JSON.parse(rows[1][4])[0].field, note);
  assert.equal(JSON.parse(rows[1][4])[0].parts.length, 3);
});

test('nested parts are explicitly excluded; missing occurrences refuse instead of empty success', () => {
  const doc = fixture(), nested = { ...emptyDoc(), instances: [doc.instances![0]] };
  doc.instances![2] = { ...doc.instances![2], doc: nested };
  const r = notesOf(doc); assert.ok(r.excluded.length >= 2); assert.ok(r.excluded.every(e => e.reason.length > 0));
  const data = dataOf(fixture()), copiedDoc = fixture();
  assert.equal(designBriefNotes(copiedDoc, data).ok, false);
  const own = fixture(), ownData = dataOf(own); ownData.bom.lines[0].parts.push('missing');
  assert.equal(designBriefNotes(own, ownData).ok, false);
});

test('Save/Open retains existing Brief values only; single-part notes remain read-only', async () => {
  const doc = { ...rectanglePart(10, 10, 10), brief: { version: 1 as const, notes: B } }, before = encodeStudioFile(doc);
  const r = notesOf(doc); assert.deepEqual(r.lines[0].groups, [{ parts: ['base'], state: 'note', field: B }]);
  const read = await readStudioFile(before); assert.ok('doc' in read);
  assert.deepEqual(notesOf(read.doc).lines[0].groups, r.lines[0].groups);
  assert.deepEqual(encodeStudioFile(doc), before);
});

test('cyclic and unsupported raw note values fail explicitly without coercion', () => {
  const doc = fixture(), data = dataOf(doc), cycle: Record<string, unknown> = { value: 'bad' }; cycle.self = cycle;
  doc.instances![0].doc.brief!.notes = cycle as unknown as Field<string>;
  assert.equal(designBriefNotes(doc, data).ok, false);
  doc.instances![0].doc.brief!.notes = { value: 'bad', basis: 'stated', source: BigInt(1) } as unknown as Field<string>;
  assert.equal(designBriefNotesCsv(doc, data).ok, false);
});


test('bought line and mixed ordinary/library occurrence metadata are explicitly excluded', () => {
  // Controlled consumer admission using a real bound BOM result; no library geometry execution is claimed.
  const doc = fixture(), bought = dataOf(doc); bought.bom.lines[0].source = 'catalogue';
  const b = notesOf(doc, bought); assert.equal(b.lines.length, 0); assert.equal(b.excluded.length, 1);
  const mixed = dataOf(doc); mixed.view.parts[2].library = 'catalogue@1/item';
  const m = notesOf(doc, mixed); assert.equal(m.lines.length, 0); assert.equal(m.excluded.length, 1);
  assert.deepEqual(m.excluded[0].parts, ['p1', 'p2', 'p3']);
});


test('standalone base row cannot disguise library or generated fastener source as ordinary', () => {
  // Bound consumer admission controls: native library/fastener execution is covered by existing BOM tests, not this probe.
  for (const kind of ['library', 'fastener'] as const) {
    const doc = { ...rectanglePart(10, 10, 10), brief: { version: 1 as const, notes: A } }, data = dataOf(doc);
    if (kind === 'library') doc.nodes.push({ kind: 'library', name: 'owned', library: { library: 'owned', version: '1', part: 'p', params: {}, values: {} }, prefix: 'owned', features: [], outputs: [], interfaces: [], warnings: [] });
    else doc.nodes[1] = { ...doc.nodes[1], made: { command: 'fastener', values: {}, nodes: 2 } } as typeof doc.nodes[number];
    const r = notesOf(doc, data); assert.equal(r.lines.length, 0); assert.equal(r.excluded.length, 1);
  }
});
