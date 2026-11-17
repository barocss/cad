import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const old = { value: 'Synthetic original design intent', basis: 'assumed', source: 'Test fixture only', why: 'Not a real approval' };
const part = () => ({ format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 2,
  nodes: [{ kind: 'sketch', id: 'n0', profile: 'rectangle', min: [0, 0], max: [10, 5] }, { kind: 'extrude', id: 'n1', sketch: 0, height: 2 }],
  outputs: { b1: { node: 1, side: 'solid' } }, brief: { version: 1, notes: old, purpose: { value: 'Preserved purpose', basis: 'stated', source: 'fixture' } } });
const seed = { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nodes: [], outputs: {}, nextId: 0,
  instances: ['p1', 'p2', 'p3'].map((id, i) => ({ id, name: 'Synthetic box', doc: part(), position: [i * 15, 0, 0], rotation: [0, 0, 0], part: { id: i < 2 ? 'sharedA' : 'independentB', rev: 'A' } })) };
const f = await createFlow({ name: 'instance-note-baseline', output: process.argv[2], envFrozen: 'NOTE_BASELINE_FROZEN',
  initialFiles: ['apps/cad-studio/test/instance-note-baseline-browser.mjs', 'apps/cad-studio/src/ui/InstanceBriefNotes.tsx'],
  qualification: 'Synthetic approved-record currentness during explicit shared note Save/Clear, Undo/Redo and actual Save/fresh Open',
  limits: ['Synthetic test-only approval API token, not an owner decision or manufacturing approval.', 'No new geometry/mass certification, cited-analysis freshness, parent-chain tamper or malformed-record actual flow.'],
  inspectorSource: `import {readFileSync} from 'node:fs';
import {bomView,deriveBom} from '@barocss/cad-model/team/assembly';
import {draftBaseline,moveBaseline,verifyBaseline} from '@barocss/cad-model/team/baseline';
import {userToken} from '@barocss/cad-model/team/ecr';
import {evaluatePart} from '@barocss/cad-model/engine/evaluate';
const doc=JSON.parse(readFileSync(process.argv[2],'utf8')),mode=JSON.parse(process.argv[3]);
if(mode==='fixture'){
 const view=await bomView(doc,async d=>evaluatePart(d,1));
 const draft=draftBaseline(doc,deriveBom(view),view);
 const review=await moveBaseline(draft.doc,draft.baseline.id,'review',userToken('2026-11-17T00:00:00Z'));
 const approved=await moveBaseline(review.doc,draft.baseline.id,'approved',userToken('2026-11-17T00:00:01Z'));
 console.log(JSON.stringify({doc:approved.doc,verification:verifyBaseline(approved.doc,draft.baseline.id)}));
}else console.log(JSON.stringify(verifyBaseline(doc,'BL1')));
`,
  oracleSource: String.raw`import json,sys,hashlib
d=json.load(sys.stdin);base=d['base'];saved=d['saved'];cleared=d['cleared'];reopened=d['reopened']
canon=lambda x:json.dumps(x,ensure_ascii=False,separators=(',',':'))
b=canon(base['baselines'])
assert base['baselines']['baselines'][0]['state']=='approved'
for doc in [saved,cleared,reopened]:
 assert canon(doc['baselines'])==b
 assert doc['instances'][2]==base['instances'][2]
 for i in [0,1]:
  for key in ['position','rotation','id','name']:assert doc['instances'][i][key]==base['instances'][i][key]
  expected=dict(base['instances'][i]['doc']);expected['brief']=dict(expected['brief']);expected['brief'].pop('notes')
  actual=dict(doc['instances'][i]['doc']);actual['brief']=dict(actual['brief']);actual['brief'].pop('notes',None)
  assert actual==expected
 assert doc['instances'][0]['doc']==doc['instances'][1]['doc']
assert saved['instances'][0]['doc']['brief']['notes']['value']=='Explicit synthetic revised intent'
assert 'notes' not in cleared['instances'][0]['doc']['brief'];assert reopened==cleared
print(json.dumps({'status':'PASS','baselineJSONSHA256':hashlib.sha256(b.encode()).hexdigest(),'shared':['p1','p2'],'independentUnchanged':'p3','otherDefinitionDataExact':True}))
` });
const editor = () => f.page.getByRole('region', { name: 'Definition design-brief notes' });
const status = () => f.page.getByRole('region', { name: 'Saved approval record status' });
async function choose(id) {
  const row = f.page.locator(`[data-browser-instance-path="${id}"]`);
  if (!(await row.getAttribute('class')).split(' ').includes('sel')) await row.click();
  await editor().waitFor();
}
async function open(doc, name) {
  await f.page.setInputFiles('input[aria-label="Model file"]', { name: name + '.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) });
  await f.same(doc);
}
async function verify(doc, current, label) {
  assert.deepEqual(await f.inspect(label, doc, 'verify'), { intact: true, mismatches: [], current, changed: current ? [] : ['part p1', 'part p2'] });
  const text = current ? 'BL1: Record intact; pinned part inputs and interfaces match.' : 'BL1: Record intact; pinned part inputs or interfaces changed. Explicit review is needed. part p1; part p2.';
  await status().getByRole('status').filter({ hasText: text }).waitFor();
  assert.equal(await status().getByRole('status').innerText(), text);
  await f.same(doc);
}
await f.run(async () => {
  await f.newPage(); await open(seed, 'synthetic-before-approval');
  const accepted = await f.doc(); assert.deepEqual(accepted, seed);
  const generated = await f.inspect('synthetic-approved-fixture', accepted, 'fixture');
  assert.deepEqual(generated.verification, { intact: true, mismatches: [], current: true, changed: [] });
  const base = generated.doc; await open(base, 'synthetic-approved-record'); await choose('p1'); await verify(base, true, 'initial-current');
  const baselineBytes = JSON.stringify(base.baselines); await f.snapshot('01-synthetic-record-current');
  await editor().getByRole('button', { name: 'Edit notes', exact: true }).click();
  await editor().getByLabel('Definition notes', { exact: true }).fill('Explicit synthetic revised intent');
  await editor().getByRole('button', { name: 'Save notes', exact: true }).click(); await f.changed(base);
  const saved = await f.doc(); assert.equal(JSON.stringify(saved.baselines), baselineBytes); await choose('p2'); await verify(saved, false, 'saved-changed'); await f.snapshot('02-shared-save-changed');
  await f.undo(); await f.same(base); await choose('p1'); await verify(base, true, 'undo-current');
  await f.redo(); await f.same(saved); await choose('p1'); await verify(saved, false, 'redo-changed');
  await editor().getByRole('button', { name: 'Edit notes', exact: true }).click();
  await editor().getByRole('button', { name: 'Clear note', exact: true }).click(); await f.changed(saved);
  const cleared = await f.doc(); assert.equal(JSON.stringify(cleared.baselines), baselineBytes); await verify(cleared, false, 'cleared-changed'); await f.snapshot('03-shared-clear-changed');
  await f.undo(); await f.same(saved); await choose('p1'); await verify(saved, false, 'undo-clear');
  await f.redo(); await f.same(cleared); await choose('p1'); await verify(cleared, false, 'redo-clear');
  const file = await f.save('synthetic-notes-cleared'); await f.freshOpen(file.file, cleared, '04-fresh-open'); await choose('p1'); await verify(cleared, false, 'reopened-changed');
  const reopened = await f.doc(); assert.equal(JSON.stringify(reopened.baselines), baselineBytes);
  await f.runOracle({ base, saved, cleared, reopened }, '05-baseline-and-definition-preservation'); await f.snapshot('05-fresh-status');
  f.report.observations.push({ syntheticApprovalOnly: true, initialAcceptedExact: true, noJoints: true, baselineBytesUnchanged: true, saveClearSharedMembers: ['p1', 'p2'], undoRedoCurrentness: true, actualSaveFreshOpen: true });
});
