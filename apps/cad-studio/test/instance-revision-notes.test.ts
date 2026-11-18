import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import { InstanceRevisionNotes } from '../src/ui/InstanceRevisionNotes';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import { readInstanceRevisionNotes } from '../src/state/instanceRevisionNotes';
function fixture(): StudioDoc {
  const part: StudioDoc = { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 0, nodes: [], outputs: {}, brief: { version: 1, notes: { value: 'Current', basis: 'assumed', source: 'SECRET_SOURCE', why: 'SECRET_WHY', said: 'unverified', confirmed: { by: 'user', at: 'SECRET_TIME' } }, purpose: { value: 'SECRET_OTHER', basis: 'stated' } } };
  const next = structuredClone(part); next.brief!.notes!.value = 'Offered';
  return { ...structuredClone(part), instances: ['p1', 'p2', 'p3'].map((id, i) => ({ id, name: id, doc: structuredClone(part), position: [i, 0, 0], rotation: [0, 0, 0], part: { id: i < 2 ? 'shared' : 'other', rev: 'A' } })), pendingParts: { shared: { doc: next, rev: 'B', name: 'SECRET_PATH' } } };
}
function read(d: StudioDoc) { const before = structuredClone(d); const r = readInstanceRevisionNotes(d, 'p1'); assert.deepEqual(d, before); assert.ok(r?.ok); return r; }
test('shared exact owner comparison exposes only permitted note text/status', () => {
  const r = read(fixture());
  assert.deepEqual(r, { ok: true, definitionId: 'shared', currentRevision: 'A', offeredRevision: 'B', sharedCount: 2, current: { text: 'Current', basis: 'assumed', confirmed: true }, offered: { text: 'Offered', basis: 'assumed', confirmed: true }, textChange: 'changed', metadataChanged: false });
  assert.ok(!JSON.stringify(r).includes('SECRET')); assert.ok(!JSON.stringify(r).includes('unverified'));
});
test('added removed absent and unchanged note text remain distinct', () => {
  for (const mode of ['added', 'removed', 'same', 'missing'] as const) {
    const d = fixture();
    if (mode === 'added' || mode === 'missing') for (const i of d.instances!) delete i.doc.brief;
    if (mode === 'removed' || mode === 'missing') delete d.pendingParts!.shared.doc.brief!.notes;
    if (mode === 'same') d.pendingParts!.shared.doc = structuredClone(d.instances![0].doc);
    const r = read(d); assert.equal(r.textChange, mode === 'missing' ? 'same' : mode);
    if (mode === 'missing') assert.deepEqual(r.current, { text: null, basis: null, confirmed: false });
  }
});
test('same text with metadata-only change never implies full Field equality', () => {
  const d = fixture(); const f = d.pendingParts!.shared.doc.brief!.notes!; f.value = 'Current'; f.source = 'SECRET_DIFFERENT';
  const r = read(d); assert.equal(r.textChange, 'same'); assert.equal(r.metadataChanged, true); assert.ok(!JSON.stringify(r).includes('SECRET'));
});
test('ambiguous/stated and confirmation presence are displayed without provenance', () => {
  const d = fixture(); for (const i of d.instances!) { i.doc.brief!.notes!.basis = 'ambiguous'; delete i.doc.brief!.notes!.confirmed; }
  d.pendingParts!.shared.doc.brief!.notes!.basis = 'stated';
  const r = read(d); assert.equal(r.current.basis, 'ambiguous'); assert.equal(r.current.confirmed, false); assert.equal(r.offered.basis, 'stated');
});
test('missing unrelated pending and no definition offer return null', () => {
  const d = fixture(); assert.equal(readInstanceRevisionNotes(d, 'p3'), null); delete d.pendingParts; assert.equal(readInstanceRevisionNotes(d, 'p1'), null);
  delete d.instances![0].part; assert.equal(readInstanceRevisionNotes(d, 'p1'), null);
});
test('duplicate nested unknown owner and inconsistent shared content fail closed', () => {
  for (const id of ['base', 'p1/child', 'missing', '']) assert.equal(readInstanceRevisionNotes(fixture(), id)?.ok, false);
  for (const change of [(d: StudioDoc) => { d.instances![2].id = 'p2'; }, (d: StudioDoc) => { d.instances![1].part!.rev = 'Z'; }, (d: StudioDoc) => { d.instances![1].doc.parameters = { changed: 1 }; }]) {
    const d = fixture(); change(d); const before = structuredClone(d); assert.equal(readInstanceRevisionNotes(d, 'p1')?.ok, false); assert.deepEqual(d, before);
  }
});
test('malformed note Field or brief version is refused without normalization', () => {
  for (const value of [undefined, null, { value: '', basis: 'stated' }, { value: 'x'.repeat(501), basis: 'stated' }, { value: 1, basis: 'stated' }, { value: 'valid', basis: 'other' }, { value: 'valid', basis: 'stated', source: 1 }, { value: 'valid', basis: 'stated', confirmed: null }, { value: 'valid', basis: 'stated', extra: 'SECRET' }]) {
    const d = fixture(); Object.assign(d.pendingParts!.shared.doc.brief!, { notes: value }); const before = structuredClone(d);
    assert.equal(readInstanceRevisionNotes(d, 'p1')?.ok, false); assert.deepEqual(d, before);
  }
  const d = fixture(); Object.assign(d.pendingParts!.shared.doc.brief!, { version: 2 }); assert.equal(readInstanceRevisionNotes(d, 'p1')?.ok, false);
});

// SSR covers initial minimum disclosure only; interactive resets require the browser fixture.
test('initial comparison markup contains no note or provenance text before opt-in', () => {
  const d = fixture(), before = structuredClone(d);
  const markup = renderToStaticMarkup(createElement(InstanceRevisionNotes, { doc: d, id: 'p1' }));
  assert.match(markup, /Compare design-brief notes/);
  assert.match(markup, /aria-expanded="false"/);
  for (const text of ['Current', 'Offered', 'SECRET', 'assumed', 'confirmed']) assert.ok(!markup.includes(text));
  assert.deepEqual(d, before);
  assert.equal(renderToStaticMarkup(createElement(InstanceRevisionNotes, { doc: d, id: 'p3' })), '');
});
test('invalid comparison does not echo malformed input in markup', () => {
  const d = fixture(); Object.assign(d.pendingParts!.shared.doc.brief!, { notes: { value: 'PRIVATE_INVALID', basis: 'unknown' } });
  const before = structuredClone(d);
  const markup = renderToStaticMarkup(createElement(InstanceRevisionNotes, { doc: d, id: 'p1' }));
  assert.match(markup, /Note comparison unavailable/);
  assert.ok(!markup.includes('PRIVATE_INVALID'));
  assert.ok(!markup.includes('SECRET'));
  assert.deepEqual(d, before);
});
