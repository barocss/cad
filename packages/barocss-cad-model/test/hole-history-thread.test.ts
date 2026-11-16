import test from 'node:test';
import assert from 'node:assert/strict';
import { rectanglePart, type StudioDoc, type ModelNode } from '../src/engine/doc';
import { evaluateDoc } from '../src/engine/evaluate';
import { editFields } from '../src/app/editFields';
import { withSampleRows } from './person-file';
const fixture = () => { const doc = withSampleRows(rectanglePart(64,32,12)); return {...doc,nodes:[...doc.nodes,{kind:'hole',parent:{node:1,side:'solid'},center:[32,16],radius:2.5,thread:'M6×1'} as ModelNode]}; };
const field = (doc:StudioDoc) => { const f=editFields(doc.nodes,2,doc.parameters,undefined,{doc}).find(f=>f.key==='thread');assert.ok(f?.kind==='choice');return f; };
test('existing tapped Hole explicitly changes only designation and drill; native volume agrees',()=>{
 const doc=fixture(),before=structuredClone(doc),f=field(doc),nodes=f.set(doc.nodes,'M8×1.25');
 assert.deepEqual(nodes[2],{...doc.nodes[2],thread:'M8×1.25',radius:3.4});assert.equal(nodes[0],doc.nodes[0]);assert.equal(nodes[1],doc.nodes[1]);
 const evaluated=evaluateDoc({...doc,nodes},1);assert.ok(evaluated.ok);assert.ok(Math.abs(evaluated.bodies[0].volume!-(64*32*12-Math.PI*3.4**2*12))<1e-6);
 assert.deepEqual(doc,before);
});
test('same designation retains custom drill; bound radius refuses without unbinding',()=>{
 const doc=fixture();doc.nodes[2]={...doc.nodes[2],radius:2.75} as ModelNode;
 assert.equal(field(doc).set(doc.nodes,'M6×1')[2],doc.nodes[2]);
 doc.nodes[2]={...doc.nodes[2],radius:{parameter:'R'}} as ModelNode;
 assert.throws(()=>field(doc).set(doc.nodes,'M8×1.25'),/Unbind/);
});
test('no row, duplicate, invalid and changed pitch retain saved placeholder; stale non-tapped setter cannot convert',()=>{
 for(const variant of ['missing','duplicate','invalid','pitch']){
 const doc=fixture(),rows=doc.fastenerSizes!.rows;doc.fastenerSizes={version:1,rows:variant==='missing'?[]:variant==='duplicate'?[...rows,...rows]:rows.map(r=>r.id==='M6'?{...r,...(variant==='pitch'?{pitch:0.75}:{tap:NaN})}:r)};
 const f=field(doc);assert.match(f.options.find(o=>o.value==='M6×1')!.label,/Saved/);assert.equal(f.set(doc.nodes,'M6×1')[2],doc.nodes[2]);
 assert.throws(()=>f.set(doc.nodes,'not-a-row'),/unique valid/);
 }
 const doc=fixture(),f=field(doc),plain={...doc.nodes[2]} as Extract<ModelNode,{kind:'hole'}>;delete plain.thread;const nodes=[...doc.nodes.slice(0,2),plain];assert.equal(f.set(nodes,'M8×1.25')[2],plain);
 assert.equal(editFields(nodes,2,{},undefined,{doc}).some(f=>f.key==='thread'),false);
});
test('blind and patterned placement and downstream feature identity are untouched',()=>{
 const doc=fixture();doc.nodes[2]={...doc.nodes[2],depth:5,axis:'x',side:'min',face:'n1.side0',pattern:{count:2,step:[12,0]}} as ModelNode;
 const f=field(doc),nodes=f.set(doc.nodes,'M8×1.25');assert.deepEqual(nodes[2],{...doc.nodes[2],thread:'M8×1.25',radius:3.4});
});
