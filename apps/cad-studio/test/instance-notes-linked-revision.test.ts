import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDoc, rectanglePart, type StudioDoc } from '@barocss/cad-model/engine/doc';
import { acceptRevision, dismissRevision } from '@barocss/cad-model/assembly/definitions';
import { draftBaseline, moveBaseline, verifyBaseline } from '@barocss/cad-model/team/baseline';
import { userToken } from '@barocss/cad-model/team/ecr';
import { deriveBom, type BomView } from '@barocss/cad-model/bom/core';
import { memoryStore } from '../src/storage/memoryStore';
import { readPart, writePart } from '../src/storage/project';
import { linkedRevisions, linkSource } from '../src/storage/linked';
import { instanceNoteScope, editInstanceBriefNote, clearInstanceBriefNote } from '../src/state/instanceBriefNotes';
import { noteBaselineStatus } from '../src/state/noteBaselineStatus';

// Storage/definition contract only: memory ProjectStore is not actual OPFS, public UI, or native geometry proof.
async function fixture() {
  const store = memoryStore('synthetic-note-revision');
  const part: StudioDoc = { ...rectanglePart(10, 5, 2), brief: { version: 1,
    notes: { value: 'Note A', basis: 'assumed', source: 'Synthetic original', why: 'Fixture intent', said: 'unverified' },
    purpose: { value: 'Preserve purpose', basis: 'stated' } } };
  const written = await writePart(store, 'source.bcad', part);
  const read = await readPart(store, 'source.bcad'); assert.ok('doc' in read);
  const source = read.doc;
  const doc: StudioDoc = { ...emptyDoc(), instances: ['p1', 'p2', 'p3'].map((id, i) => ({ id, name: id,
    doc: structuredClone(source), position: [i * 15, 0, 0], rotation: [0, 0, 0],
    part: { id: i < 2 ? 'shared' : 'independent', rev: 'A', ...(i < 2 ? { source: linkSource('source.bcad') } : {}) } })) };
  // Literal synthetic built-view values exercise existing approval record APIs; no mass/geometry claim.
  const view: BomView = { parts: doc.instances!.map(i => ({ id: i.id, name: i.name, material: null, mass: 1, library: null, shape: 'synthetic-box' })) };
  const drafted = draftBaseline(doc, deriveBom(view), view), at = '2026-11-17T12:00:00Z';
  const review = await moveBaseline(drafted.doc, drafted.baseline.id, 'review', userToken(at));
  const approved = await moveBaseline(review.doc, drafted.baseline.id, 'approved', userToken(at));
  const next: StudioDoc = { ...source, brief: { ...source.brief!, notes: { value: 'Note B, "review"\n第二行', basis: 'stated', source: 'Synthetic replacement', confirmed: { by: 'user', at } } } };
  await writePart(store, 'source.bcad', next, { expect: written.tag });
  return { store, source, next, doc: approved.doc };
}
function current(doc: StudioDoc, expected: boolean) {
  const read = verifyBaseline(doc, 'BL1');
  assert.equal(read.intact, true); assert.equal(read.current, expected);
  assert.deepEqual(read.changed, expected ? [] : ['part p1', 'part p2']);
  assert.equal(noteBaselineStatus(doc)[0].state, expected ? 'matching' : 'changed');
}
function refusesDirectNoteEdit(doc: StudioDoc) {
  for (const id of ['p1', 'p2']) {
    assert.equal(instanceNoteScope(doc, id).ok, false);
    assert.equal(editInstanceBriefNote(doc, id, 'must not replace linked note', 'synthetic').ok, false);
    assert.equal(clearInstanceBriefNote(doc, id).ok, false);
  }
}

test('note-only file change is offered through linked storage without changing accepted notes or baseline inputs', async () => {
  const { store, doc, next } = await fixture(), original = JSON.stringify(doc);
  const offered = await linkedRevisions(doc, store);
  assert.deepEqual(offered.offered, ['source.bcad']); assert.deepEqual(offered.missing, []);
  assert.equal(offered.doc.pendingParts?.shared.rev, 'B');
  assert.equal(offered.doc.pendingParts?.shared.name, './source.bcad');
  assert.deepEqual(offered.doc.pendingParts?.shared.doc.brief, next.brief);
  assert.deepEqual(offered.doc.instances, doc.instances);
  assert.equal(offered.doc.baselines, doc.baselines); current(offered.doc, true);
  refusesDirectNoteEdit(doc); refusesDirectNoteEdit(offered.doc);
  assert.equal(JSON.stringify(doc), original);
  const again = await linkedRevisions(offered.doc, store);
  assert.deepEqual(again.offered, []); assert.equal(again.doc, offered.doc);
});

test('Keep dismisses only the pending offer; recheck and Accept update shared notes while preserving all other owned data', async () => {
  const { store, doc, next } = await fixture(), records = JSON.stringify(doc.baselines);
  const waiting = (await linkedRevisions(doc, store)).doc;
  const kept = dismissRevision(waiting, 'shared');
  assert.equal(kept.pendingParts, undefined); assert.deepEqual(kept.instances, doc.instances); current(kept, true);
  const reoffered = await linkedRevisions(kept, store); assert.deepEqual(reoffered.offered, ['source.bcad']);
  const accepted = acceptRevision(reoffered.doc, 'shared');
  assert.equal(accepted.pendingParts, undefined); assert.equal(JSON.stringify(accepted.baselines), records);
  assert.deepEqual(accepted.instances![2], doc.instances![2]);
  for (let i = 0; i < 2; i++) {
    const now = accepted.instances![i], old = doc.instances![i];
    assert.deepEqual(now.doc.brief, next.brief);
    const expectedDoc = { ...old.doc, brief: next.brief, render: undefined, direct: undefined };
    assert.deepEqual(now.doc, expectedDoc);
    assert.deepEqual({ ...now, doc: old.doc, part: old.part }, old);
    assert.deepEqual(now.part, { ...old.part, rev: 'B' });
  }
  current(accepted, false); refusesDirectNoteEdit(accepted);
  assert.deepEqual((await linkedRevisions(accepted, store)).offered, []);
  current(doc, true); current(accepted, false); // immutable document restoration, not actual UI Undo/Redo
});

test('container storage round trip preserves accepted note fields, links and immutable baseline record', async () => {
  const { store, doc } = await fixture();
  const accepted = acceptRevision((await linkedRevisions(doc, store)).doc, 'shared'), before = JSON.stringify(accepted.baselines);
  await writePart(store, 'assembly.bcad', accepted, { expect: null });
  const reopened = await readPart(store, 'assembly.bcad'); assert.ok('doc' in reopened);
  assert.deepEqual(reopened.doc, JSON.parse(JSON.stringify(accepted)));
  assert.equal(JSON.stringify(reopened.doc.baselines), before); current(reopened.doc, false);
  refusesDirectNoteEdit(reopened.doc);
  assert.deepEqual((await linkedRevisions(reopened.doc, store)).offered, []);
});
