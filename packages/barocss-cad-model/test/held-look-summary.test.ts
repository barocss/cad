import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyDoc,rectanglePart,type StudioDoc} from '../src/engine/doc';
import {heldLooksForInstance} from '../src/assembly/looks';
test('current/pending duplicate body holds appear once per instance without modifying overrides',()=>{
 const base=rectanglePart(10,10,10);
 const doc:StudioDoc={...emptyDoc(),instances:['p1','p2'].map(id=>({id,name:id,position:[0,0,0],rotation:[0,0,0],doc:base,part:{id:'shared',rev:'C'},looks:{b3:{hidden:true}}})),pendingParts:{shared:{doc:base,rev:'D',name:'next'}}};
 const before=JSON.stringify(doc);
 for(const id of ['p1','p2']){const rows=heldLooksForInstance(doc,id);assert.equal(rows.length,1);assert.equal(rows[0].part,id);assert.equal(rows[0].body,'b3');}
 assert.equal(JSON.stringify(doc),before);assert.deepEqual(heldLooksForInstance(doc,'missing'),[]);
 const pendingOnly={...doc,instances:doc.instances!.map(i=>({...i,looks:{b1:{hidden:true}}})),pendingParts:{shared:{doc:emptyDoc(),rev:'D',name:'next'}}};
 assert.equal(heldLooksForInstance(pendingOnly,'p1').length,1);
});

test('reset removes only the explicitly saved held key, including missing nested parts',async()=>{
 const {resetInstanceLook,setInstanceLook}=await import('../src/assembly/looks');
 const base=rectanglePart(10,10,10);
 const doc:StudioDoc={...emptyDoc(),instances:['p1','p2'].map(id=>({id,name:id,position:[0,0,0],rotation:[0,0,0],doc:base,looks:{b3:{hidden:true,color:'#ff0000'},'gone/b1':{hidden:true},b1:{color:'#0000ff'}}}))};
 const before=JSON.stringify(doc);
 const field=resetInstanceLook(doc,{part:'p1',body:'b3',field:'hidden'}).doc;
 assert.deepEqual(field.instances![0].looks!.b3,{color:'#ff0000'});
 const next=resetInstanceLook(field,{part:'p1',body:'b3'}).doc;
 assert.ok(!next.instances![0].looks!.b3);assert.deepEqual(next.instances![1],doc.instances![1]);
 const nested=resetInstanceLook(next,{part:'p1/gone',body:'b1'}).doc;
 assert.deepEqual(nested.instances![0].looks,{b1:{color:'#0000ff'}});
 assert.equal(JSON.stringify(doc),before);
 assert.throws(()=>setInstanceLook(doc,{part:'p1',body:'b3',patch:{hidden:false}}));
 assert.throws(()=>resetInstanceLook(doc,{part:'p1',body:'missing/b99'}));
 assert.throws(()=>resetInstanceLook(doc,{part:'missing',body:'b3'}));
});
