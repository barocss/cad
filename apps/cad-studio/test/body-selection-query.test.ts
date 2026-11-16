import test from 'node:test';
import assert from 'node:assert/strict';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import { bodySelectionQuery, BODY_SELECTION_QUERY_MAX } from '../src/app/bodySelectionQuery';
function fixture(){
 const doc:StudioDoc={format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nodes:[],outputs:{},nextId:10,bodies:{}};
 const bodies:BodyResult[]=[];
 for(let i=0;i<5;i++){const n=i*2,key=`b${n+1}`;doc.nodes.push({kind:'sketch',id:`n${n}`,profile:'rectangle',min:[i*20,0],max:[i*20+10,10]},{kind:'extrude',id:`n${n+1}`,sketch:n,height:10});doc.outputs[key]={node:n+1,side:'solid'};doc.bodies![key]={name:i===3?'Bolt':'Plate',material:i===2?'M2':'M1',...(i===4?{hidden:true}:{})};bodies.push({key,ref:{node:n+1,side:'solid'}} as BodyResult);}
 return {doc,bodies};
}
test('literal case-insensitive name AND exact material returns original indices and duplicate names',()=>{
 const {doc,bodies}=fixture(),saved=JSON.stringify({doc,bodies});
 assert.deepEqual(bodySelectionQuery(doc,bodies,{name:' pLaTe ',material:{kind:'id',id:'M1'}}).matches.map(x=>[x.index,x.key]),[[0,'b1'],[1,'b3']]);
 assert.deepEqual(bodySelectionQuery(doc,bodies,{name:'plate',material:{kind:'id',id:'M2'}}).matches.map(x=>x.key),['b5']);
 assert.equal(bodySelectionQuery(doc,bodies,{name:'plate',material:{kind:'id',id:'m1'}}).matches.length,0);
 doc.bodies!.b3.name='[Plate]';assert.deepEqual(bodySelectionQuery(doc,bodies,{name:'[plate]',material:{kind:'any'}}).matches.map(x=>x.key),['b3']);doc.bodies!.b3.name='Plate';
 assert.equal(JSON.stringify({doc,bodies}),saved);
});
test('material inheritance uses body then stated brief, never assumed density',()=>{
 const {doc,bodies}=fixture();delete doc.bodies!.b1.material;doc.bodies!.b3.material='';
 assert.deepEqual(bodySelectionQuery(doc,bodies,{name:'',material:{kind:'unspecified'}}).matches.map(x=>x.key),['b1','b3']);
 doc.brief={version:1,material:{basis:'stated',value:'al6061',source:'Aluminium 6061'}};
 assert.deepEqual(bodySelectionQuery(doc,bodies,{name:'plate',material:{kind:'id',id:'al6061'}}).matches.map(x=>x.key),['b1','b3']);
 assert.equal(bodySelectionQuery(doc,bodies,{name:'',material:{kind:'unspecified'}}).matches.length,0);
 assert.deepEqual(bodySelectionQuery(doc,bodies,{name:'',material:{kind:'id',id:'M2'}}).matches.map(x=>x.key),['b5']);
});
test('empty/too long/zero conditions refuse without mutating any document or input',()=>{
 const {doc,bodies}=fixture(),saved=JSON.stringify({doc,bodies});
 for(const name of ['', '   ', 'x'.repeat(BODY_SELECTION_QUERY_MAX+1),'missing']){const result=bodySelectionQuery(doc,bodies,{name,material:{kind:'any'}});assert.ok(result.reason);assert.deepEqual(result.matches,[]);}
 assert.ok(bodySelectionQuery(doc,bodies,{name:'plate',material:{kind:'id',id:''}}).reason);
 assert.equal(JSON.stringify({doc,bodies}),saved);
});
test('hidden, placed, direct, ambiguous and stale outputs never shift retained source indices',()=>{
 const {doc,bodies}=fixture();
 const list=[{...bodies[0],key:'instance/b1'},bodies[4],bodies[1],{key:'direct1'} as BodyResult,bodies[2]];
 assert.deepEqual(bodySelectionQuery(doc,list,{name:'plate',material:{kind:'any'}}).matches.map(x=>[x.index,x.key]),[[2,'b3'],[4,'b5']]);
 assert.deepEqual(bodySelectionQuery(doc,[bodies[0],bodies[0]],{name:'plate',material:{kind:'any'}}).matches,[]);
 delete doc.outputs.b3;assert.deepEqual(bodySelectionQuery(doc,list,{name:'plate',material:{kind:'any'}}).matches.map(x=>x.index),[4]);
});
