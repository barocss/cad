import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {emptyDoc, type StudioDoc} from '../src/engine/doc';
import {resolveShopTree} from '../src/engine/shopRows';
import {evaluatePart} from '../src/engine/evaluate';
import {nextInstanceId,takenInstanceIds} from '../src/assembly/takenIds';
const fixture=():StudioDoc=>JSON.parse(readFileSync(resolve(import.meta.dirname,'../../../apps/cad-studio/test/fixtures/bearing-housing-identity.bcad'),'utf8'));
const evaluate=(doc:StudioDoc)=>evaluatePart(resolveShopTree(doc.instances!.find(i=>i.id==='inst2')!.doc,doc,'inst2'),1);
test('a new occurrence cannot take a deleted housing target referenced by a bearing',()=>{
 const original=fixture();assert.ok(evaluate(original).ok);
 const removed={...original,instances:original.instances!.filter(i=>i.id!=='inst1')};
 const missing=evaluate(removed);assert.ok(!missing.ok);assert.match(missing.error.detail,/housing part inst1 no longer exists/);
 const id=nextInstanceId(removed,'inst'),added={...removed,instances:[...removed.instances,{...original.instances![0],id}]};
 const result=evaluate(added);
 assert.notEqual(id,'inst1',`old housing link must stay missing; new part evaluation was ${result.ok}`);
 assert.ok(!result.ok);assert.deepEqual(added.instances[0].doc,removed.instances[0].doc);
});

test('housing reservations retain suppressed and pending owners without mixing deeper assembly ids',()=>{
 const original=fixture(),bearing=original.instances![1].doc.nodes.find(n=>n.kind==='bearing')!;
 const node=(part:string)=>({...bearing,suppressed:true as const,housingRef:{part,body:'b1'}});
 const part=(nodes:StudioDoc['nodes']):StudioDoc=>({...emptyDoc(),nodes});
 const doc:StudioDoc={...emptyDoc(),nodes:[node('inst1')],instances:[{...original.instances![1],doc:{...part([node('inst3')]),instances:[{...original.instances![0],doc:part([node('inst5')])}]}}],pendingParts:{waiting:{doc:part([node('inst4')]),rev:'B',name:'waiting'}}};
 const before=structuredClone(doc),taken=takenInstanceIds(doc);
 for(const id of ['inst1','inst2','inst3','inst4'])assert.ok(taken.has(id));assert.equal(taken.has('inst5'),false);
 assert.equal(nextInstanceId(doc,'inst'),'inst5');assert.deepEqual(doc,before);
});
test('free ids remain available after references are explicitly removed',()=>{
 const original=fixture();const removed={...original,instances:original.instances!.filter(i=>i.id==='inst2').map(i=>({...i,doc:{...i.doc,nodes:i.doc.nodes.filter(n=>n.kind!=='bearing')}}))};
 assert.equal(nextInstanceId(removed,'inst'),'inst1');
});

test('existing partial naming inputs remain supported',()=>{
 assert.equal(nextInstanceId({instances:[]},'inst'),'inst1');
 assert.deepEqual([...takenInstanceIds({})],[]);
});
