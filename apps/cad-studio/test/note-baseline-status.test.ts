import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import { draftBaseline, moveBaseline, readBaselines, verifyBaseline } from '@barocss/cad-model/team/baseline';
import { userToken } from '@barocss/cad-model/team/ecr';
import { deriveBom, type BomView } from '@barocss/cad-model/bom/core';
import { noteBaselineStatus } from '../src/state/noteBaselineStatus';
import { NoteBaselineStatus } from '../src/ui/NoteBaselineStatus';
import { editInstanceBriefNote, clearInstanceBriefNote } from '../src/state/instanceBriefNotes';

const time = '2026-11-17T12:00:00Z';
async function fixture() {
  const part: StudioDoc = { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 2,
    nodes: [{ kind: 'sketch', id: 'n0', profile: 'rectangle', min: [0, 0], max: [10, 5] }, { kind: 'extrude', id: 'n1', sketch: 0, height: 2 }],
    outputs: { b1: { node: 1, side: 'solid' } }, brief: { version: 1, notes: { value: 'synthetic note', basis: 'stated' } } };
  const doc: StudioDoc = { format: 'barocss-cad-model', schema: 3, units: 'mm', nodes: [], parameters: {}, outputs: {}, nextId: 0,
    instances: ['p1', 'p2', 'p3'].map((id, i) => ({ id, name: id, doc: structuredClone(part), position: [i * 15, 0, 0], rotation: [0, 0, 0], part: { id: i < 2 ? 'shared' : 'independent', rev: 'A' } })) };
  // Synthetic built-view inputs test the existing baseline API, not native mass or geometry correctness.
  const view: BomView = { parts: doc.instances!.map(i => ({ id: i.id, name: i.name, material: null, mass: 1, library: null, shape: 'synthetic-box' })) };
  const drafted = draftBaseline(doc, deriveBom(view), view);
  const review = await moveBaseline(drafted.doc, drafted.baseline.id, 'review', userToken(time));
  return (await moveBaseline(review.doc, drafted.baseline.id, 'approved', userToken(time))).doc;
}
const render = (doc: StudioDoc) => renderToStaticMarkup(createElement(NoteBaselineStatus, { doc }));

test('real baseline API record is intact/current and reading never modifies the document', async () => {
  const doc = await fixture(), before = JSON.stringify(doc);
  assert.deepEqual(noteBaselineStatus(doc), [{ id: 'BL1', state: 'matching', details: [] }]);
  assert.deepEqual(verifyBaseline(doc, 'BL1'), { intact: true, current: true, mismatches: [], changed: [] });
  assert.equal(JSON.stringify(doc), before);
  assert.deepEqual(noteBaselineStatus({ ...doc, baselines: undefined }), []);
  assert.deepEqual(noteBaselineStatus({ ...doc, baselines: { version: 1, baselines: [] } }), []);
});

test('shared Save and Clear keep the complete approved record while changing both occurrence pins', async () => {
  const doc = await fixture(), records = JSON.stringify(doc.baselines), original = JSON.stringify(doc);
  for (const result of [editInstanceBriefNote(doc, 'p1', 'new synthetic note', time), clearInstanceBriefNote(doc, 'p1')]) {
    assert.ok(result.ok && result.changed);
    assert.equal(JSON.stringify(result.doc.baselines), records);
    assert.equal(result.doc.baselines, doc.baselines);
    assert.deepEqual(noteBaselineStatus(result.doc), [{ id: 'BL1', state: 'changed', details: ['part p1', 'part p2'] }]);
    assert.equal(verifyBaseline(result.doc, 'BL1').intact, true);
    assert.deepEqual(result.doc.instances![2], doc.instances![2]);
    assert.deepEqual(noteBaselineStatus(doc), [{ id: 'BL1', state: 'matching', details: [] }], 'original document restoration, not a browser Undo claim');
  }
  assert.equal(JSON.stringify(doc), original);
});

test('independent note change names only its own occurrence', async () => {
  const doc = await fixture(), result = editInstanceBriefNote(doc, 'p3', 'independent change', time);
  assert.ok(result.ok);
  assert.deepEqual(noteBaselineStatus(result.doc), [{ id: 'BL1', state: 'changed', details: ['part p3'] }]);
  assert.deepEqual(result.doc.instances!.slice(0, 2), doc.instances!.slice(0, 2));
});

test('malformed log or record is unavailable, never a current success', async () => {
  const doc = await fixture();
  for (const raw of [null, {}, { version: 2, baselines: [] }, { version: 1, baselines: [null] }, { version: 1, baselines: [{ id: 'BL1', state: 'approved' }] }]) {
    const bad = { ...doc, baselines: raw } as StudioDoc;
    assert.equal(noteBaselineStatus(bad)[0].state, 'unverified');
    assert.doesNotMatch(render(bad), /pinned part inputs and interfaces match/);
  }
  const bad = structuredClone(doc);
  readBaselines(bad.baselines).baselines[0].pins.parts = null as unknown as Record<string, string>;
  assert.equal(noteBaselineStatus(bad)[0].state, 'unverified');
});

test('duplicate IDs, cyclic chains and absent parents cannot silently use a first record', async () => {
  for (const kind of ['duplicate', 'cycle', 'missing'] as const) {
    const doc = await fixture(), rows = readBaselines(doc.baselines).baselines;
    if (kind === 'duplicate') rows.push(structuredClone(rows[0]));
    else { rows[0].parent = kind === 'cycle' ? 'BL1' : 'gone'; rows[0].parentDigest = rows[0].digest; }
    const status = noteBaselineStatus(doc);
    assert.equal(status.length, 1);
    assert.equal(status[0].state, 'unverified');
    assert.match(status[0].details.join(' '), kind === 'duplicate' ? /ambiguous/ : kind === 'cycle' ? /cyclic/ : /missing/);
  }
});

test('intact and authored-current are separate: a changed record cannot present matching pins as success', async () => {
  const doc = await fixture();
  readBaselines(doc.baselines).baselines[0].content.bom.totalMass += 1;
  assert.equal(verifyBaseline(doc, 'BL1').current, true);
  assert.equal(verifyBaseline(doc, 'BL1').intact, false);
  const status = noteBaselineStatus(doc);
  assert.equal(status[0].state, 'unverified');
  assert.ok(status[0].details.includes('BL1: content.bom'));
});

test('read-only UI separates document match, mismatch and unverifiable record without approval actions', async () => {
  const doc = await fixture(), html = render(doc);
  assert.match(html, /Saved approval record status/);
  assert.match(html, /Record intact; pinned part inputs and interfaces match/);
  assert.match(html, /not manufacturing approval or verification of cited analyses/);
  assert.match(html, /Digest consistency is not signer authentication/);
  assert.doesNotMatch(html, /<button|<input/);
  const result = clearInstanceBriefNote(doc, 'p1'); assert.ok(result.ok);
  assert.match(render(result.doc), /pinned part inputs or interfaces changed/);
  assert.match(render(result.doc), /part p1; part p2/);
  assert.match(render({ ...doc, baselines: null } as unknown as StudioDoc), /Record cannot be verified/);
  assert.equal(render({ ...doc, baselines: undefined }), '');
});


test('overlong parent chains cannot silently truncate integrity verification', async () => {
  const doc = await fixture(), original = readBaselines(doc.baselines).baselines[0];
  const rows = Array.from({ length: 4097 }, (_, i) => ({ ...structuredClone(original), id: `BL${i}`, state: i === 0 ? 'approved' as const : 'rejected' as const,
    parent: i < 4096 ? `BL${i + 1}` : null, parentDigest: i < 4096 ? original.digest : null }));
  doc.baselines = { version: 1, baselines: rows };
  const status = noteBaselineStatus(doc);
  assert.equal(status[0].state, 'unverified'); assert.match(status[0].details[0], /verifier limit/);
});

test('ambiguous occurrence digest keys cannot report matching part inputs', async () => {
  for (const kind of ['duplicate', 'base', 'prototype'] as const) {
    const doc = await fixture();
    if (kind === 'duplicate') doc.instances![1].id = doc.instances![0].id;
    else if (kind === 'prototype') doc.instances![0].id = '__proto__';
    else { doc.nodes = structuredClone(doc.instances![0].doc.nodes); doc.instances![0].id = 'base'; }
    const status = noteBaselineStatus(doc);
    assert.equal(status[0].state, 'unverified'); assert.match(status[0].details[0], /identities/);
  }
});


test('inherited object keys in current IDs or stored pins are not trusted as part identities', async () => {
  for (const key of ['__proto__', 'constructor', 'toString']) {
    const current = await fixture(); current.instances![0].id = key;
    assert.equal(noteBaselineStatus(current)[0].state, 'unverified');
    const saved = await fixture(), pins = readBaselines(saved.baselines).baselines[0].pins;
    pins.parts = { ...pins.parts, [key]: 'a'.repeat(64) };
    assert.equal(noteBaselineStatus(saved)[0].state, 'unverified');
  }
});
