import assert from 'node:assert/strict';
import test from 'node:test';
import { rectanglePart, type StudioDoc } from '@barocss/cad-model/engine/doc';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import type { EngineClient } from '../src/engine/client';
import { holeResultPieces } from '../src/app/holeResultPieces';
import { createHistoryFeatureApply } from '../src/state/historyFeatureApply';
import type { StudioNotice } from '../src/app/studioNotice';
const base=rectanglePart(40,30,20);
const doc:StudioDoc={...base,nodes:[...base.nodes,{kind:'hole',id:'n2',parent:{node:1,side:'solid'},radius:2,center:[20,15],depth:8}],outputs:{b2:{node:2,side:'solid'}},nextId:3};
const body={key:'b2',ref:{node:2,side:'solid'},pieces:2} as BodyResult;
test('only exact unique terminal output reports native disconnected count',()=>{
 const saved=JSON.stringify({doc,body});assert.match(holeResultPieces(doc,2,[body])!.title,/contains 2 disconnected pieces/);assert.equal(JSON.stringify({doc,body}),saved);
 for(const b of [{...body,pieces:undefined},{...body,pieces:1},{...body,pieces:2.1},{...body,pieces:Infinity},{...body,lumpTouch:[[0,1]] as [number,number][]},{...body,key:'placed/b2'},{...body,ref:undefined},{...body,ref:{node:1,side:'solid' as const}}])assert.equal(holeResultPieces(doc,2,[b]),undefined);
 assert.equal(holeResultPieces(doc,2,[body,body]),undefined);
 for(const changed of [{...doc,outputs:{other:{node:2,side:'solid' as const}}},{...doc,outputs:{b2:{node:2,side:'solid' as const},alias:{node:2,side:'solid' as const}}},{...doc,nodes:[...doc.nodes,{...doc.nodes[2],id:'n3'}]},{...doc,nodes:[{...doc.nodes[0],id:'n2'},...doc.nodes.slice(1)]}])assert.equal(holeResultPieces(changed,2,[body]),undefined);
 assert.equal(holeResultPieces(doc,1,[body]),undefined);
});
function setup(){
 let current=doc,scope={},open={},worker=1,draft=true,marker:number|null=null,variant:string|null=null,evaluated=doc,commitOK=true;
 let resolve!:(reply:Awaited<ReturnType<EngineClient['evaluate']>>)=>void;
 const notices:StudioNotice[]=[],commits:StudioDoc[]=[];
 const nodes=doc.nodes.map(n=>n.kind==='hole'?{...n,depth:12.8}:n);
 const apply=createHistoryFeatureApply({model:{doc,evaluated:doc,editNode:2,fresh:true,busy:false},owner:{document:()=>current,evaluated:()=>evaluated,scope:()=>scope,open:()=>open,worker:()=>worker,marker:()=>marker,variant:()=>variant},worker:{nextRevision:()=>42,engine:{evaluate:()=>new Promise(r=>{resolve=r;}),part:async()=>{throw Error('Unexpected part');}}},changes:{canChangeDocument:()=>true,commit:next=>{if(!commitOK)return false;current={...next};commits.push(current);return true;},onNotice:n=>notices.push(n),applyRoundedInsetEdit:()=>{},stageFeatureCandidate:()=>{}}});
 return {notices,commits,current:()=>current,run:()=>apply(nodes,()=>draft),finish:(revision=42,ok=true)=>resolve(ok?{ok:true,revision,bodies:[body],wallTime:0}:{ok:false,revision,error:{title:'failed',hint:'failed',detail:''},wallTime:0}),invalidate:{document:()=>{current={...doc};},scope:()=>{scope={};},open:()=>{open={};},worker:()=>{worker++;},draft:()=>{draft=false;},marker:()=>{marker=2;},variant:()=>{variant='v';},evaluated:()=>{evaluated={...doc};},commit:()=>{commitOK=false;}}};
}
test('successful commit notice captures transformed accepted document identity',async()=>{const f=setup(),pending=f.run();f.finish();await pending;assert.equal(f.notices.length,1);assert.equal(f.notices[0].documentSource?.doc,f.current());assert.equal(f.commits.length,1);});
for(const key of ['document','scope','open','worker','draft','marker','variant','evaluated','commit'] as const)test(`no notice after ${key} changes/refuses`,async()=>{const f=setup(),pending=f.run();f.invalidate[key]();f.finish();await pending;assert.equal(f.notices.length,0);});
test('failed and mismatched revision replies never publish a pieces notice',async()=>{for(const [revision,ok] of [[42,false],[41,true]] as const){const f=setup(),pending=f.run();f.finish(revision,ok);await pending;assert.equal(f.notices.length,0);}});
