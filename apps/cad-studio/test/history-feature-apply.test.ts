import test from 'node:test';
import assert from 'node:assert/strict';
import { rectanglePart, type StudioDoc } from '@barocss/cad-model/engine/doc';
import type { EngineClient } from '../src/engine/client';
import { createHistoryFeatureApply } from '../src/state/historyFeatureApply';

function fixture() {
  const doc = rectanglePart(30, 20, 10);
  const nodes = doc.nodes.map(node => node.kind === 'extrude' ? { ...node, height: 12 } : node);
  let document = doc, scope = {}, worker = 1, open = {}, ownsDraft = true, allowed = true;
  let finish!: (result: Awaited<ReturnType<EngineClient['evaluate']>>) => void;
  const commits: StudioDoc[] = [];
  let calls = 0;
  const apply = createHistoryFeatureApply({
    model: { doc, evaluated: doc, editNode: 1, fresh: true, busy: false },
    owner: { document: () => document, evaluated: () => doc, scope: () => scope,
      worker: () => worker, open: () => open, marker: () => null, variant: () => null },
    worker: { engine: { evaluate: () => { calls++; return new Promise(resolve => { finish = resolve; }); },
      part: async () => { throw new Error('Plain height edit must not read reference geometry'); } }, nextRevision: () => 42 },
    changes: { canChangeDocument: () => allowed, commit: next => commits.push(next),
      applyRoundedInsetEdit: () => assert.fail('Unexpected inset routing'),
      stageFeatureCandidate: () => assert.fail('Unexpected staged candidate') },
  });
  return { doc, nodes, commits, apply: () => apply(nodes, () => ownsDraft),
    finish: () => finish({ ok: true, revision: 42, bodies: [], wallTime: 0 }),
    refuse: () => { allowed = false; }, calls: () => calls,
    invalidate: {
      document: () => { document = { ...doc }; }, scope: () => { scope = {}; },
      worker: () => { worker++; }, open: () => { open = {}; }, draft: () => { ownsDraft = false; },
    } };
}
test('History controller commits one owned accepted edit without mutating source', async () => {
  const f = fixture(), original = structuredClone(f.doc), pending = f.apply();
  assert.equal(f.commits.length, 0); f.finish(); await pending;
  assert.equal(f.commits.length, 1); assert.deepEqual(f.commits[0].nodes, f.nodes);
  assert.deepEqual(f.doc, original);
});
for (const owner of ['document', 'scope', 'worker', 'open', 'draft'] as const) {
  test(`History controller discards a successful late reply after ${owner} changes`, async () => {
    const f = fixture(), pending = f.apply(); f.invalidate[owner](); f.finish(); await pending;
    assert.equal(f.commits.length, 0);
  });
}
test('History controller does not evaluate when document changes are blocked', async () => {
  const f = fixture(); f.refuse(); await f.apply();
  assert.equal(f.calls(), 0); assert.equal(f.commits.length, 0);
});
