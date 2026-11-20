import assert from 'node:assert/strict';
import test from 'node:test';
import { editFields } from '@barocss/cad-model/app/editFields';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import { evaluateDoc } from '@barocss/cad-model/engine/evaluate';
import { canonical } from '@barocss/cad-model/util/revision';
import { createHistoryFeatureApply } from '../src/state/historyFeatureApply';
import { beginWork, createWorkOwnership, finishWork, workEditRefusal } from '../src/state/workOwnership';

function fixture(explicitOrigin = false): StudioDoc {
  const ref = (node: number) => ({ node, side: 'solid' as const });
  return {
    format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {},
    nodes: [
      { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [10, 20], max: [14, 26] },
      { id: 'n1', kind: 'extrude', sketch: 0, height: 8 },
      { id: 'n2', kind: 'circular-pattern', parent: ref(1), axis: 'z', count: 4, angle: 90, span: 360,
        ...(explicitOrigin ? { pivot: [0, 0, 0] as [number, number, number] } : {}) },
      { id: 'n3', kind: 'hole', parent: ref(2), center: [-12, -23], radius: 1, face: 'n1.top@2' },
    ],
    outputs: { b3: ref(3) }, nextId: 4,
  };
}

function harness(doc: StudioDoc) {
  const initial = canonical(doc);
  const index = 2, editScope = {}, open = {};
  let revision = 0, ownsDraft = true, evaluated = doc;
  let work = createWorkOwnership<StudioDoc, StudioDoc>();
  const acceptanceScope = work.scope;
  const commits: StudioDoc[] = [], requests: StudioDoc[] = [];
  let resolveEvaluation: ((reply: ReturnType<typeof evaluateDoc>) => void) | undefined;
  const apply = createHistoryFeatureApply({
    model: { doc, evaluated: doc, editNode: index, fresh: true, busy: false },
    owner: { document: () => doc, evaluated: () => evaluated, scope: () => editScope,
      worker: () => 1, open: () => open, marker: () => null, variant: () => null },
    worker: { nextRevision: () => ++revision, engine: {
      evaluate: (next) => {
        requests.push(structuredClone(next));
        return new Promise(resolve => { resolveEvaluation = resolve; });
      },
      part: () => assert.fail('unexpected part request'),
    } },
    changes: {
      canChangeDocument: () => workEditRefusal(work, acceptanceScope) === null,
      commit: next => commits.push(next),
      applyRoundedInsetEdit: () => assert.fail('unexpected inset edit'),
      stageFeatureCandidate: () => assert.fail('unexpected candidate staging'),
    },
  });
  const axis = editFields(doc.nodes, index, doc.parameters, undefined, { doc }).find(field => field.label === 'Axis at X');
  assert.ok(axis?.kind === 'number');
  return {
    axis, commits, requests, verifySource: () => assert.equal(canonical(doc), initial),
    apply: (nodes: StudioDoc['nodes']) => apply(nodes, () => ownsDraft),
    retire: (event: 'draft' | 'evaluated' | 'completed newer work') => {
      if (event === 'draft') ownsDraft = false;
      if (event === 'evaluated') evaluated = { ...doc };
      if (event === 'completed newer work') {
        const started = beginWork(work, doc, evaluated, true);
        assert.ok(started.run);
        work = finishWork(started, started.run.token);
        assert.equal(work.run, null);
      }
    },
    reply: (delta = 0) => {
      const next = requests.at(-1);
      assert.ok(next && resolveEvaluation);
      const reply = evaluateDoc(next, revision);
      assert.ok(reply.ok, JSON.stringify(reply));
      resolveEvaluation({ ...reply, revision: reply.revision + delta });
    },
  };
}

test('axis field round-trips are no-op History applies for both world-origin representations', async () => {
  for (const explicit of [false, true]) {
    const doc = fixture(explicit), h = harness(doc);
    const roundTrip = h.axis.set(h.axis.set(doc.nodes, 0.125), 0);
    assert.notEqual(roundTrip, doc.nodes);
    assert.equal(h.axis.get(roundTrip), 0);
    const pending = h.apply(roundTrip);
    if (h.requests.length) h.reply(); // Settle an accidental request so a regression fails instead of hanging.
    assert.equal(await pending, undefined);
    assert.equal(h.requests.length, 0);
    assert.deepEqual(h.commits, []);
    h.verifySource();
  }
});

test('a circular axis edit commits its dependent Hole once, and only from an owned native reply', async () => {
  for (const invalidation of [null, 'draft', 'evaluated', 'completed newer work', 'revision'] as const) {
    const doc = fixture(), h = harness(doc);
    const pending = h.apply(h.axis.set(doc.nodes, 0.25));
    assert.equal(h.requests.length, 1);
    assert.deepEqual(h.commits, []);
    if (invalidation && invalidation !== 'revision') h.retire(invalidation);
    h.reply(invalidation === 'revision' ? -1 : 0);
    assert.equal(await pending, undefined);
    const expected = structuredClone(doc);
    const pattern = expected.nodes[2], hole = expected.nodes[3];
    assert.ok(pattern?.kind === 'circular-pattern' && hole?.kind === 'hole');
    pattern.pivot = [0.25, 0, 0];
    hole.center = [-11.5, -23];
    assert.deepEqual(h.commits, invalidation ? [] : [expected], String(invalidation));
    h.verifySource();
  }
});
