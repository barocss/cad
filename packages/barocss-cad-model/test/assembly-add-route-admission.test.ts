import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { emptyDoc, rectanglePart, type StudioDoc } from '../src/engine/doc';
import { readStudioFile, encodeStudioFile } from '../src/engine/container';
import { addPart, partCopy } from '../src/assembly/edit';
import { dispatchTool } from '../src/chat/tools';
import { evaluatePart } from '../src/engine/evaluate';
const bytes=readFileSync(resolve(import.meta.dirname,'../../../apps/cad-studio/test/fixtures/revision-route-bundle.bcad'));
test('addPart refuses a root-only linked route before returning an unsaveable assembly',async()=>{
 const read=await readStudioFile(bytes);assert.ok('doc' in read);assert.doesNotThrow(()=>encodeStudioFile(read.doc));
 const doc=emptyDoc(), before=structuredClone(doc);
 let result;try {result=addPart(doc,{name:'Route',doc:read.doc});} catch(error){assert.match(String(error),/route bundle/i);}
 if(result){assert.throws(()=>encodeStudioFile(result.doc),/nested route bundles/);console.log('BASELINE core returned child; native encode rejects');}
 assert.equal(result,undefined);assert.deepEqual(doc,before);
});
test('assembly dispatcher refuses copying a linked route base without changed success',async()=>{
 const read=await readStudioFile(bytes);assert.ok('doc' in read);const doc=read.doc,before=structuredClone(doc);
 const result=await dispatchTool({doc,bodies:[]},'assembly',{action:'add_part',name:'Copy',copy_of:'base'},async d=>evaluatePart(d,1));
 console.log('DISPATCH',JSON.stringify({changed:result.changed,isError:result.isError,content:result.content,instances:result.state.doc.instances?.length}));
 assert.equal(result.isError,true);assert.equal(result.changed,false);assert.deepEqual(result.state.doc,doc);assert.deepEqual(doc,before);
});

const readRoute=async()=>{const r=await readStudioFile(bytes);assert.ok('doc' in r);return r.doc;};
import { detachRouteBundle, routeBundleDocumentIdentity } from '../src/engine/routeBundle';
import { addPartDoc } from '../src/api/assemblyCore';
test('core and facade reject nested, pending, schema-only and orphan route inputs atomically',async()=>{
 const route=await readRoute(), plain=rectanglePart(12,10,8);
 const inst={id:'p1',name:'Child',doc:route,position:[0,0,0] as [number,number,number],rotation:[0,0,0] as [number,number,number]};
 const orphan=structuredClone(plain);Object.assign(orphan.nodes[0],{routeBundleMember:{bundleId:'orphan',memberId:'A'}});
 const candidates:StudioDoc[]=[route,{...emptyDoc(),instances:[inst]},{...emptyDoc(),pendingParts:{wait:{doc:route,rev:'B',name:'Route'}}},{...plain,schema:4},orphan];
 for(const child of candidates){
  const doc=rectanglePart(20,20,5), before=structuredClone(doc), childBefore=structuredClone(child);
  assert.throws(()=>addPart(doc,{name:'Child',doc:child}),/\[VALUE\].*nested route bundles/);
  assert.throws(()=>addPartDoc(doc,'Child',child,[0,0,0],[0,0,0],false),/nested route bundles/);
  assert.throws(()=>partCopy(child,'base'),/nested route bundles/);
  assert.deepEqual(doc,before);assert.deepEqual(child,childBefore);
 }
});
test('ordinary and explicitly detached copies retain features and native Save/Open',async()=>{
 const route=await readRoute(), detached=detachRouteBundle(route,'bundle1',routeBundleDocumentIdentity(route));
 for(const source of [rectanglePart(12,10,8),detached]){
  const before=structuredClone(source), copy=partCopy(source,'base');
  const core=addPart(emptyDoc(),{name:'Copy',doc:copy,position:[40,0,0]});
  const facade=addPartDoc(emptyDoc(),'Copy',copy,[40,0,0],[0,0,0],false);assert.deepEqual(facade.doc,core.doc);
  assert.deepEqual(core.doc.instances![0].doc.nodes,source.nodes);
  const saved=await readStudioFile(encodeStudioFile(core.doc));assert.ok('doc' in saved);assert.deepEqual(saved.doc,JSON.parse(JSON.stringify(core.doc)));
  const result=await dispatchTool({doc:source,bodies:[]},'assembly',{action:'add_part',name:'Copy',copy_of:'base',position:[40,0,0]},async d=>evaluatePart(d,1));
  assert.equal(result.changed,true);assert.equal(result.isError,false);assert.deepEqual(result.state.doc.instances![0].doc.nodes,source.nodes);assert.doesNotThrow(()=>encodeStudioFile(result.state.doc));
  assert.deepEqual(source,before);
 }
});
test('a linked route root may still add an ordinary or empty part without implicit detachment',async()=>{
 const route=await readRoute(),before=structuredClone(route);
 for(const child of [undefined,rectanglePart(12,10,8)]){
  const result=addPart(route,{name:'Ordinary',doc:child});assert.deepEqual(result.doc.routeBundles,route.routeBundles);assert.deepEqual(result.doc.direct,route.direct);assert.doesNotThrow(()=>encodeStudioFile(result.doc));
 }
 assert.deepEqual(route,before);
});
