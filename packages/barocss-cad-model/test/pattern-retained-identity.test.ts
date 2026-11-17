import {defaultDrawing} from '../src/drawing/types';
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {emptyDoc,rectanglePart,type StudioDoc} from '../src/engine/doc';
import {addInstancePattern,deleteInstancePattern,skipOccurrence,editInstancePattern} from '../src/assembly/patterns';
import {resolveShopTree} from '../src/engine/shopRows';
import {evaluatePart} from '../src/engine/evaluate';
const evaluate=(doc:StudioDoc)=>evaluatePart(resolveShopTree(doc.instances!.find(i=>i.id==='inst2')!.doc,doc,'inst2'),1);
test('a newly created pattern cannot reuse a deleted housing occurrence identity',()=>{
 const doc:StudioDoc=JSON.parse(readFileSync(resolve(import.meta.dirname,'../../../apps/cad-studio/test/fixtures/bearing-housing-identity.bcad'),'utf8'));
 doc.instances![0].position=[-40,0,0];
 const made=addInstancePattern(doc,{kind:'linear',seed:'inst1',count:2,spacing:40,dir:[1,0,0]});
 const occurrence=made.doc.instances!.find(i=>i.pattern)!.id;
 const bearing=made.doc.instances!.find(i=>i.id==='inst2')!.doc.nodes.find(n=>n.kind==='bearing')!;assert.equal(bearing.kind,'bearing');if(bearing.kind!=='bearing')return;
 bearing.housingRef={part:occurrence,body:'b1'};
 assert.ok(evaluate(made.doc).ok,'original patterned housing evaluates');
 const removed=deleteInstancePattern(made.doc,made.id).doc;
 const missing=evaluate(removed);assert.ok(!missing.ok);assert.match(missing.error.detail,/no longer exists/);
 const again=addInstancePattern(removed,{kind:'linear',seed:'inst1',count:2,spacing:40,dir:[1,0,0]});
 const result=evaluate(again.doc);console.log('PATTERN baseline',JSON.stringify({old:made.id,new:again.id,occurrence,evaluated:result.ok}));
 assert.notEqual(again.id,made.id,'new pattern must not steal a retained housing target');assert.ok(!result.ok);
});

const seed=()=>({id:'seed',name:'Pin',doc:rectanglePart(10,10,10),position:[0,0,0] as [number,number,number],rotation:[0,0,0] as [number,number,number]});
const add=(doc:StudioDoc)=>addInstancePattern(doc,{kind:'linear',seed:'seed',count:2,spacing:40,dir:[1,0,0]});
test('held drawing edge occurrence ids reserve patterns without changing the drawing',()=>{
 const doc:StudioDoc={...emptyDoc(),instances:[seed()],drawing:{...defaultDrawing(),dimensions:[{id:'d1',kind:'diameter',view:'top',place:[0,0],edge:'pat1-1/n1.top|n1.side',near:[0,0,0]}]}};
 const before=structuredClone(doc),made=add(doc);assert.equal(made.id,'pat2');assert.deepEqual(made.doc.drawing,before.drawing);assert.deepEqual(doc,before);
 const cleared={...doc,drawing:undefined};assert.equal(add(cleared).id,'pat1');
});
test('pending and suppressed housing refs reserve only the containing assembly namespace',()=>{
 const fixture:StudioDoc=JSON.parse(readFileSync(resolve(import.meta.dirname,'../../../apps/cad-studio/test/fixtures/bearing-housing-identity.bcad'),'utf8'));
 const bearing=fixture.instances![1].doc.nodes.find(n=>n.kind==='bearing')!;
 const part=(id:string):StudioDoc=>({...emptyDoc(),nodes:[{...bearing,suppressed:true as const,housingRef:{part:id,body:'b1'}}]});
 const doc:StudioDoc={...emptyDoc(),nodes:part('pat1-1').nodes,instances:[seed(),{...seed(),id:'owner',doc:{...part('pat2-1'),instances:[{...seed(),id:'inner',doc:part('pat4-1')}]}}],pendingParts:{waiting:{doc:part('pat3-1'),rev:'B',name:'waiting'}}};
 const before=structuredClone(doc);assert.equal(add(doc).id,'pat4');assert.deepEqual(doc,before);
});
test('unreferenced new patterns retain allocation and same-pattern skip restoration',()=>{
 const doc={...emptyDoc(),instances:[seed()]},made=add(doc);assert.equal(made.id,'pat1');
 const removed=deleteInstancePattern(made.doc,made.id).doc;assert.equal(add(removed).id,'pat1');
 const skipped=skipOccurrence(made.doc,'pat1-1').doc;const restored=editInstancePattern(skipped,{id:'pat1',skip:[]}).doc;
 assert.deepEqual(restored.instances,made.doc.instances);assert.deepEqual(restored.instancePatterns,made.doc.instancePatterns);
});
