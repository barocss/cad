import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDoc, rectanglePart, withNode, type StudioDoc } from '@barocss/cad-model/engine/doc';
import { commandById } from '@barocss/cad-model/app/commands';
import { smoothScrewAngleField } from '@barocss/cad-model/app/smoothLoftTurn';
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

test('Split output-side History commit rebuilds only the explicit output map', async () => {
  const base = rectanglePart(40, 30, 10);
  const doc: StudioDoc = { ...base, nodes: [...base.nodes, { kind:'split',id:'n2',parent:{node:1,side:'solid'},axis:'x',at:16,outputSide:'negative' }], outputs:{b2_negative:{node:2,side:'negative'}},nextId:3 };
  const nodes = doc.nodes.map(node => node.kind === 'split' ? {...node,outputSide:'positive' as const} : node);
  const commits: StudioDoc[]=[];const scope={},open={};
  const apply=createHistoryFeatureApply({model:{doc,evaluated:doc,editNode:2,fresh:true,busy:false},
    owner:{document:()=>doc,evaluated:()=>doc,scope:()=>scope,worker:()=>1,open:()=>open,marker:()=>null,variant:()=>null},
    worker:{engine:{evaluate:async()=>({ok:true,revision:1,bodies:[],wallTime:0}),part:async()=>{throw new Error('Unexpected part call');}},nextRevision:()=>1},
    changes:{canChangeDocument:()=>true,commit:next=>commits.push(next),applyRoundedInsetEdit:()=>{},stageFeatureCandidate:()=>{}}});
  await apply(nodes,()=>true);assert.equal(commits.length,1);assert.deepEqual(commits[0].outputs,{b2_positive:{node:2,side:'positive'}});assert.deepEqual(doc.outputs,{b2_negative:{node:2,side:'negative'}});
});

test('Screw winding apply requests native validation and commits only an owned successful revision', async () => {
  const source = withNode(emptyDoc(), { kind: 'sketch', profile: 'rectangle', min: [1, 2], max: [13, 10] });
  const doc = commandById('smooth-screw')!.build!({
    doc: source, bodies: [], selection: { faces: [], edges: [], bodies: [], sketches: [0] },
  }, { axisX: -1, axisY: 1, pitch: 56, angle: -450 });
  const index = doc.nodes.length - 1;
  const angle = smoothScrewAngleField(doc.nodes, index);
  assert.ok(angle?.kind === 'number');
  const nodes = angle.set(doc.nodes, 360);
  const commits: StudioDoc[] = [], requests: unknown[][] = [], scope = {}, open = {};
  let reply: Awaited<ReturnType<EngineClient['evaluate']>> = {
    ok: false, revision: 42, wallTime: 0, error: { code: 'GEOMETRY', title: 'Screw refused', hint: '', detail: '' },
  };
  const apply = createHistoryFeatureApply({
    model: { doc, evaluated: doc, editNode: index, fresh: true, busy: false },
    owner: { document: () => doc, evaluated: () => doc, scope: () => scope, worker: () => 1,
      open: () => open, marker: () => null, variant: () => null },
    worker: { engine: { evaluate: async (...args) => { requests.push(args); return reply; },
      part: async () => assert.fail('Unexpected reference evaluation') }, nextRevision: () => 42 },
    changes: { canChangeDocument: () => true, commit: next => commits.push(next),
      applyRoundedInsetEdit: () => assert.fail('Unexpected inset routing'),
      stageFeatureCandidate: () => assert.fail('Unexpected staged candidate') },
  });
  assert.equal((await apply(nodes, () => true))?.title, 'Screw refused');
  assert.deepEqual(requests[0].slice(1), [42, index]);
  assert.equal(commits.length, 0);
  assert.equal(angle.get(doc.nodes), -450);
  reply = { ok: true, revision: 41, bodies: [], wallTime: 0 };
  await apply(nodes, () => true);
  assert.equal(commits.length, 0);
  reply = { ...reply, revision: 42 };
  await apply(nodes, () => true);
  assert.equal(commits.length, 1);
  assert.equal(angle.get(commits[0].nodes), 360);
});
