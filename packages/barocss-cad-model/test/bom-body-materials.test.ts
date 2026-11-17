import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyDoc,rectanglePart,withNode,type StudioDoc} from '../src/engine/doc';
import {evaluateDoc} from '../src/engine/evaluate';
import {lookKey} from '../src/app/bodies';
import {setInstanceLook} from '../src/assembly/looks';
import {bomPanelDataOf,purchaseCsv} from '../src/bom/bom';
import {checkBom} from '../src/team/assembly';
import {readStudioDoc} from '../src/engine/migrate';
import {bomViewOf,deriveBom} from '../src/bom/core';
const two=()=>withNode(withNode(rectanglePart(10,10,20),{kind:'sketch',profile:'rectangle',min:[30,0],max:[40,10]}),{kind:'extrude',sketch:2,height:5});
const fixture=()=>{const part=two(),e=evaluateDoc(part,1);assert.ok(e.ok);assert.equal(e.bodies.length,2);const keys=e.bodies.map(b=>lookKey(part.nodes,b));const doc:StudioDoc={...emptyDoc(),instances:['p1','p2'].map((id,k)=>({id,name:id,doc:part,position:[k*60,0,0],rotation:[0,0,0]}))};return {doc,keys};};
test('different material on the second body must split a placed-part BOM line',()=>{const {doc,keys}=fixture();const changed=setInstanceLook(doc,{part:'p2',body:keys[1],patch:{material:'steel'}}).doc;const view=bomViewOf(changed,d=>evaluateDoc(d,1)),bom=deriveBom(view);assert.notEqual(view.parts[0].mass,view.parts[1].mass);assert.equal(bom.lines.length,2);});

const read=(doc:StudioDoc)=>bomPanelDataOf(doc,d=>evaluateDoc(d,1));
const material=(doc:StudioDoc,part:string,body:string,value:string)=>setInstanceLook(doc,{part,body,patch:{material:value}}).doc;
test('identical body materials merge; swapping material ownership splits even with equal sets',()=>{
 const {doc,keys}=fixture();let same=doc;
 for(const id of ['p1','p2'])same=material(material(same,id,keys[0],'brass'),id,keys[1],'steel');
 assert.deepEqual(read(same).bom.lines.map(l=>[l.qty,l.material]),[[2,null]]);
 let uniform=doc;for(const id of ['p1','p2'])for(const key of keys)uniform=material(uniform,id,key,'steel');assert.deepEqual(read(uniform).bom.lines.map(l=>[l.qty,l.material]),[[2,'steel']]);
 const different=material(material(same,'p2',keys[0],'steel'),'p2',keys[1],'brass');
 const data=read(different);assert.equal(data.bom.lines.length,2);assert.ok(data.bom.lines.every(l=>l.material===null));assert.deepEqual(checkBom(data.view,data.bom),[]);
});
test('colours, hidden body looks and material reset preserve grouping; single-body convention unchanged',()=>{
 const {doc,keys}=fixture();const colours=setInstanceLook(doc,{part:'p2',body:keys[1],patch:{color:'#00ff00',hidden:true}}).doc;
 assert.deepEqual(read(colours).bom.lines.map(l=>l.qty),[2]);
 const changed=material(doc,'p2',keys[1],'steel');const reset=setInstanceLook(changed,{part:'p2',body:keys[1],patch:{material:null}}).doc;
 assert.deepEqual(read(reset).bom,read(doc).bom);
 const single={...doc,instances:doc.instances!.map(i=>({...i,doc:rectanglePart(10,10,20)}))};
 assert.deepEqual(read(single).bom.lines.map(l=>[l.qty,l.material]),[[2,null]]);
 const steel=material(single,'p2','b1','steel');assert.deepEqual(read(steel).bom.lines.map(l=>[l.qty,l.material]),[[1,null],[1,'steel']]);
});
test('nested parents retain different child material compositions and native roundtrip',()=>{
 const {doc,keys}=fixture();const leaf=doc.instances![0];const sub={...emptyDoc(),instances:[leaf]};
 const root:StudioDoc={...emptyDoc(),instances:['a','b'].map((id,k)=>({id,name:id,doc:sub,position:[k*100,0,0],rotation:[0,0,0]}))};
 const next=material(root,'b',`p1/${keys[1]}`,'steel');const data=read(next);assert.equal(data.bom.lines.filter(l=>l.assembly).length,2);
 const reopened=readStudioDoc(JSON.stringify(next));assert.ok('doc' in reopened);if('doc' in reopened)assert.deepEqual(read(reopened.doc).bom,data.bom);
});
test('BOM quantities, masses and existing purchase CSV columns are preserved',()=>{
 const {doc,keys}=fixture();const next=material(doc,'p2',keys[1],'steel'),before=JSON.stringify(next),data=read(next);
 assert.equal(data.bom.totalQty,2);assert.equal(data.bom.totalMass,16.075);assert.deepEqual(data.bom.lines.map(l=>l.mass),[6.75,9.325]);assert.deepEqual(checkBom(data.view,data.bom),[]);
 const csv=purchaseCsv(data,true).trimEnd().split('\n');assert.equal(csv.length,3);assert.equal(csv[0],'item no.,item,qty,kind,size,row,catalogue,source,estimate');assert.ok(csv.every(row=>row.split(',').length===9));assert.deepEqual(csv.slice(1).map(row=>row.split(',').slice(1,3)),[['p1','1'],['p2','1']]);assert.equal(JSON.stringify(next),before);
});
