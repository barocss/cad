import test from 'node:test';
import assert from 'node:assert/strict';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import type { SheetRuleSource } from '../src/state/sharedSheetRules';
import { flangeBendOwners, canOpenFlangeBendOwner } from '../src/state/flangeBendOwners';
function fixture() {
  const doc: StudioDoc = { format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nodes:[
    {id:'profile',kind:'sketch',profile:'rectangle',min:[0,0],max:[80,50]},
    {id:'rules',kind:'sheet-base',sketch:0,thickness:1.5,bendRadius:1.5,kFactor:.44},
    {id:'corner',kind:'sheet-corner-relief',parent:{node:1,side:'solid'},edges:['corner-edge'],shape:'square',size:3},
    {id:'first-flange',kind:'sheet-flange',parent:{node:2,side:'solid'},edges:['first-edge'],length:20},
    {id:'second-flange',kind:'sheet-flange',parent:{node:3,side:'solid'},edges:['second-edge'],length:20,bendRadius:2}],outputs:{result:{node:4,side:'solid'}},nextId:5 };
  // Guard unit fixture only: native sidecar production is independently tested by its producer.
  const body = {key:'result',ref:{node:4,side:'solid'},sheet:{},flat:{bends:[{name:'arbitrary label B',faces:['b.inner']},{name:'arbitrary label A',faces:['a.outer']}]},sheetBendOwners:[{featureId:'first-flange',faces:['a.outer']},{featureId:'second-flange',faces:['b.inner']}]} as unknown as BodyResult;
  const source: SheetRuleSource = {doc,evaluated:{...doc,nodes:[...doc.nodes]},bodies:[body],open:{},generation:{},worker:1,available:true};
  return {doc,body,source};
}
test('typed face-set mapping, not display name or row order, identifies both owners and rule sources',()=>{
  const {source,body}=fixture();const rows=flangeBendOwners(source,body);
  assert.deepEqual(rows.map(r=>[r.index,r.id,r.rulesIndex,r.rulesId,r.radiusSource,r.rulesSource]),[[4,'second-flange',1,'rules','own','k-factor'],[3,'first-flange',1,'rules','sheet','k-factor']]);
  for(const row of rows)assert.equal(canOpenFlangeBendOwner(source,{...source},body,row),true);
  assert.equal(canOpenFlangeBendOwner(source,source,body,{...rows[0]}),false);
});
for(const key of ['doc','evaluated','open','generation','worker','available','bodies'] as const)test(`deferred ownership rejects changed ${key}`,()=>{
  const {source,body}=fixture(),row=flangeBendOwners(source,body)[0],current={...source};
  if(key==='doc'||key==='evaluated')current[key]={...current[key]};else if(key==='open'||key==='generation')current[key]={};else if(key==='worker')current.worker++;else if(key==='available')current.available=false;else current.bodies=[{...body}];
  assert.equal(canOpenFlangeBendOwner(source,current,body,row),false);
});
test('old rows reject in-place source or sidecar mutation',()=>{
  for(const change of [(f:ReturnType<typeof fixture>)=>{f.doc.nodes[3]={...f.doc.nodes[3],id:'replaced'};},(f:ReturnType<typeof fixture>)=>{f.body.sheetBendOwners=[{featureId:'first-flange',faces:['b.inner']},{featureId:'second-flange',faces:['a.outer']}];},(f:ReturnType<typeof fixture>)=>{(f.body.flat!.bends[0].faces as string[]).push('foreign');}]){
    const f=fixture(), row=flangeBendOwners(f.source,f.body)[0];change(f);assert.equal(canOpenFlangeBendOwner(f.source,f.source,f.body,row),false);
  }
});
test('missing, duplicate, overlapping, partial and unknown provenance fails closed',()=>{
  const cases = [undefined,[],[{featureId:'first-flange',faces:['a.outer']},{featureId:'first-flange',faces:['b.inner']}],[{featureId:'unknown',faces:['a.outer']},{featureId:'second-flange',faces:['b.inner']}],[{featureId:'first-flange',faces:['a.outer','b.inner']},{featureId:'second-flange',faces:['b.inner']}],[{featureId:'first-flange',faces:['a.outer','extra']},{featureId:'second-flange',faces:['b.inner']}],[{featureId:'first-flange',faces:[]},{featureId:'second-flange',faces:['b.inner']}]];
  for(const owners of cases){const f=fixture();f.body.sheetBendOwners=owners;assert.deepEqual(flangeBendOwners(f.source,f.body),[]);}
});
test('unsupported ancestry, binding, dimensions, metadata and alias are not navigable',()=>{
  const changes: ((f:ReturnType<typeof fixture>)=>void)[] = [
    f=>{f.doc.nodes[4]={...f.doc.nodes[4],suppressed:true};},
    f=>{f.doc.nodes[4]={id:'second-flange',kind:'translate',parent:{node:3,side:'solid'},offset:[1,0,0]};},
    f=>{f.doc.nodes[3]={...f.doc.nodes[3],id:'second-flange'};},
    f=>{const n=f.doc.nodes[3];if(n.kind==='sheet-flange')n.length={parameter:'L'};},
    f=>{const n=f.doc.nodes[1];if(n.kind==='sheet-base')n.thickness={parameter:'T'};},
    f=>{const n=f.doc.nodes[3];if(n.kind==='sheet-flange')n.angle=45;},
    f=>{const n=f.doc.nodes[4];if(n.kind==='sheet-flange')n.parent={node:1,side:'solid'};},
    f=>{f.doc.outputs.alias={node:4,side:'solid'};},
    f=>{f.body.ref={node:4,side:'positive'};},
    f=>{f.doc.direct={sources:{},objects:[]};},
    f=>{f.doc.nodes.push({...f.doc.nodes[4],id:'downstream'});},
  ];
  for(const change of changes){const f=fixture();change(f);f.source.evaluated={...f.doc,nodes:[...f.doc.nodes]};assert.deepEqual(flangeBendOwners(f.source,f.body),[]);}
});
test('foreign bodies, cloned evaluated nodes and unrelated documents are refused',()=>{
  const f=fixture();assert.deepEqual(flangeBendOwners(f.source,{...f.body}),[]);
  f.source.evaluated={...f.doc,nodes:f.doc.nodes.map(n=>({...n}))};assert.deepEqual(flangeBendOwners(f.source,f.body),[]);
  const a=fixture(),b=fixture(),row=flangeBendOwners(a.source,a.body)[0];assert.equal(canOpenFlangeBendOwner(a.source,b.source,a.body,row),false);
});
test('same source remains unchanged after issuing and verifying rows',()=>{
  const f=fixture(),before=JSON.stringify([f.doc,f.body]);const rows=flangeBendOwners(f.source,f.body);for(const row of rows)assert.ok(canOpenFlangeBendOwner(f.source,f.source,f.body,row));assert.equal(JSON.stringify([f.doc,f.body]),before);
});
