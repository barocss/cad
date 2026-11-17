import test from 'node:test';
import assert from 'node:assert/strict';
import type { StudioDoc, PartInstance } from '@barocss/cad-model/engine/doc';
import { createNoteEditSession, editInstanceBriefNote, instanceNoteScope } from '../src/state/instanceBriefNotes';
import { makeIndependent } from '@barocss/cad-model/assembly/definitions';
import { revisionOf } from '@barocss/cad-model/util/revision';
const at = '2026-11-17T12:00:00Z';
function fixture(): StudioDoc {
    const part: StudioDoc = { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 2, nodes: [{ kind: 'sketch', id: 'n0', profile: 'rectangle', min: [0, 0], max: [10, 5] }, { kind: 'extrude', id: 'n1', sketch: 0, height: 2 }], outputs: { b1: { node: 1, side: 'solid' } }, brief: { version: 1, notes: { value: 'old', basis: 'assumed', source: 'old source', why: 'old reason', said: 'unverified', confirmed: { by: 'user', at: 'old' } }, purpose: { value: 'synthetic', basis: 'assumed' } } };
    return { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nodes: [], outputs: {}, nextId: 0, instances: ['p1', 'p2', 'p3'].map((id, i) => ({ id, name: id, doc: structuredClone(part), position: [i * 15, 0, 0], rotation: [0, 0, 0], part: { id: i < 2 ? 'shared' : 'independent', rev: 'A' } })) };
}
test('explicit text replaces provenance only for the shared definition and increments its revision', () => {
    const d = fixture(), before = structuredClone(d), text = '  user, "words"\n第二行  ';
    const r = editInstanceBriefNote(d, 'p1', text, at);
    assert.ok(r.ok);
    assert.equal(r.changed, true);
    assert.deepEqual(d, before);
    assert.deepEqual(r.doc.instances![0].doc.brief?.notes, { value: text, basis: 'stated', source: text, confirmed: { by: 'user', at } });
    assert.equal(r.doc.instances![0].doc, r.doc.instances![1].doc);
    assert.equal(r.doc.instances![0].part?.rev, 'B');
    assert.deepEqual(r.doc.instances![2], d.instances![2]);
    for (let i = 0; i < 2; i++) {
        const x: PartInstance = r.doc.instances![i], old: PartInstance = d.instances![i];
        assert.deepEqual(x.doc.nodes, old.doc.nodes);
        assert.deepEqual(x.doc.outputs, old.doc.outputs);
        assert.deepEqual(x.position, old.position);
        assert.deepEqual(x.doc.brief?.purpose, old.doc.brief?.purpose);
    }
});
test('same text is exact no-op and blank/long values cannot clear or normalize data', () => {
    const d = fixture();
    const r = editInstanceBriefNote(d, 'p1', 'old', at);
    assert.ok(r.ok);
    assert.equal(r.doc, d);
    assert.equal(r.changed, false);
    for (const text of ['', '   ', 'a'.repeat(501)])
        assert.equal(editInstanceBriefNote(d, 'p1', text, at).ok, false);
    assert.equal(editInstanceBriefNote(d, 'p1', 'a'.repeat(500), at).ok, true);
});
test('absent notes can be created; make-independent isolates subsequent notes', () => {
    const d = fixture();
    for (const i of d.instances!)
        delete i.doc.brief;
    const independent = makeIndependent(d, 'p2'), r = editInstanceBriefNote(independent, 'p2', 'new', at);
    assert.ok(r.ok);
    assert.equal(r.doc.instances![1].doc.brief?.notes?.value, 'new');
    assert.equal(r.doc.instances![0].doc.brief, undefined);
});
test('all shared members must agree and remain eligible; refusals preserve the input', () => {
    const edits: ((d: StudioDoc) => void)[] = [
        d => { d.instancePatterns = [{id:'pattern',seed:'p1',kind:'linear',count:2,spacing:10,dir:[1,0,0]}]; },
        d => { d.instances![1].part!.source = './linked.bcad'; }, d => { d.pendingParts = { shared: { doc: d.instances![0].doc, rev: 'B', name: 'pending' } }; },
        d => { d.instances![1].part!.rev = 'C'; }, d => { d.instances![1].doc.parameters = { x: 2 }; }, d => { d.instances![1].pattern = { id: 'pat', k: 1 }; },
        d => { d.instances![1].doc.instances = [structuredClone(d.instances![2])]; }, d => { d.instances![1].id = 'p1'; },
        d => { (d.instances![0].doc.brief as unknown as {
            extra: string;
        }).extra = 'never delete'; },
        d => { d.instances![0].doc.brief!.notes!.source = 7 as unknown as string; },
    ];
    for (const edit of edits) {
        const d = fixture();
        edit(d);
        const before = structuredClone(d);
        assert.equal(instanceNoteScope(d, 'p1').ok, false);
        assert.equal(editInstanceBriefNote(d, 'p1', 'new', at).ok, false);
        assert.deepEqual(d, before);
    }
});
test('independent ordinary scope rejects element, catalogue, fastener and bought nodes without a shared mismatch', () => {
    const edits: ((d: StudioDoc) => void)[] = [
        ...['library', 'frame', 'frame-member', 'gusset', 'end-cap'].map(kind => (d: StudioDoc) => {
            d.instances![2].doc.nodes.push({ kind } as unknown as StudioDoc['nodes'][number]);
        }),
        d => { Object.assign(d.instances![2].doc.nodes[1], { made: { command: 'fastener', values: {} } }); },
        d => { Object.assign(d.instances![2].doc.nodes[1], { bought: true }); },
    ];
    for (const edit of edits) {
        const d = fixture();
        edit(d);
        const before = structuredClone(d);
        assert.equal(instanceNoteScope(d, 'p3').ok, false);
        assert.equal(editInstanceBriefNote(d, 'p3', 'new', at).ok, false);
        assert.deepEqual(d, before);
    }
});
test('default-purchased elements and report-dependent couplings are excluded even with a made override', () => {
    const kinds = ['bearing', 'retaining-ring', 'key', 'pin', 'oring', 'spring', 'belt', 'connector-body', 'coupling'];
    for (const kind of kinds) {
        for (const bought of [undefined, false, true]) {
            const d = fixture();
            d.instances![2].doc.nodes[1] = { kind, ...(bought === undefined ? {} : { bought }) } as unknown as StudioDoc['nodes'][number];
            const before = structuredClone(d);
            assert.equal(instanceNoteScope(d, 'p3').ok, false, `${kind}/${bought}`);
            assert.equal(editInstanceBriefNote(d, 'p3', 'new', at).ok, false);
            assert.deepEqual(d, before);
        }
    }
});
test('note edit preserves existing baseline records while changing revision inputs, not an approval action', () => {
    const d = fixture();
    d.baselines = { version: 1, baselines: [{ id: 'synthetic-pin', kind: 'bom', parent: null, parentDigest: null, state: 'approved', content: { bom: { lines: [], totalQty: 0, totalMass: 0 }, interfaces: { version: 1, datums: [], keepouts: [], holePatterns: [], envelopes: [], budgets: {} } }, pins: { interfaces: 'sentinel', bom: 'sentinel', parts: {} }, moves: [], digest: 'unverified-sentinel' }] };
    const old = d.baselines, revision = revisionOf(d.instances![0].doc), r = editInstanceBriefNote(d, 'p1', 'new', at);
    assert.ok(r.ok);
    assert.equal(r.doc.baselines, old);
    assert.notEqual(revisionOf(r.doc.instances![0].doc), revision);
    // Sentinel preservation only: does not claim verifyBaseline(currentness) or approval transitions were executed.
});

test('captured Save is retired by Cancel, replacement or unmount; a rejected commit can retry', () => {
 const session = createNoteEditSession(); let calls = 0;
 const first = session.begin(), save = () => session.run(first, () => { calls++; });
 session.end(); assert.equal(save(), false); assert.equal(calls, 0);
 const second = session.begin(); assert.equal(save(), false);
 assert.equal(session.run(second, () => { calls++; }), true);
 assert.equal(session.run(second, () => { calls++; }), true);
 session.end(); assert.equal(session.run(second, () => { calls++; }), false); assert.equal(calls, 2);
});
