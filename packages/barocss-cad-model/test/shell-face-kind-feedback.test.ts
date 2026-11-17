import test from 'node:test';
import assert from 'node:assert/strict';
import { friendly, friendlyCause } from '../src/engine/errors';
const title='Shell does not support this face';
const suffix=' is not an untrimmed patch, a plane or a cylinder beside a sharp edge: shelling it is not supported yet';
const hint=(face:string)=>`Shell cannot offset face ${face} in this configuration. This is not a Wall thickness error. Cancel Shell, then try another source or Shell before the finishing feature; check the new preview.`;
test('exact unsupported native Shell face is distinguished from Wall thickness without inventing its owner',()=>{
 for(const face of ['n2.face#1','imported.face7','face-42']) for(const prefix of ['', 'shell: ']) {
  const detail=`[SHELL_FACE_KIND] ${prefix}face ${face}${suffix}`;
  const result=friendly(detail);
  assert.equal(result.title,title);assert.equal(result.hint,hint(face));assert.equal(result.detail,detail);assert.equal(result.code,'SHELL_FACE_KIND');assert.equal(result.feature,undefined);
  const error=Object.assign(new Error(detail),{feature:'n3',code:'SHELL_FACE_KIND'});
  assert.deepEqual(friendlyCause(error),{...result,feature:'n3'});
 }
});
test('unknown or malformed face-kind diagnostics do not guess a surface or feature',()=>{
 for(const detail of ['[SHELL_FACE_KIND] unknown boundary',`[SHELL_FACE_KIND] face n2.face#1${suffix} extra`,`[SHELL_FACE_KIND] face n2.face#1\nother${suffix}`,`[SHELL_FACE_KIND] face ${suffix}`,`[SHELL_FACE_KIND] face n2.face#1\rother${suffix}`,`[OTHER] face n2.face#1${suffix}`,`face n2.face#1${suffix}`]) {
  assert.notEqual(friendly(detail).title,title);
 }
});
test('existing thickness and sharp-region refusals remain distinct',()=>{
 assert.equal(friendly('a wall of 2.5 mm leaves no hollow at n1.bottom; use a wall less than 2.5 mm','PARAMETER').title,'The wall is too thick');
 assert.equal(friendly('[SHELL_REGIONS_SHARP] shell: faces a and b of two smooth regions meet at a sharp edge (at 1, 2, 3): shelling there is not supported yet').title,'Shell cannot cross this sharp edge');
});

test('native G2 Shell refuses closed and both openings without changing source geometry',async()=>{
 const {partSnapshot}=await import('../src/engine/part');
 const doc:import('../src/engine/doc').StudioDoc={format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nextId:3,outputs:{b2:{node:2,side:'solid'}},nodes:[
 {id:'n0',kind:'sketch',profile:'rectangle',min:[0,0],max:[40,30]},
 {id:'n1',kind:'extrude',sketch:0,height:20},
 {id:'n2',kind:'fillet',parent:{node:1,side:'solid'},edges:['n1.side0|n1.top'],radius:4,section:{kind:'g2',tension:.5}}]};
 const before=structuredClone(doc),native=partSnapshot(doc);
 for(const open of [[],['n1.top'],['n1.bottom']]) {
  const candidate={...doc,nextId:4,outputs:{b3:{node:3,side:'solid' as const}},nodes:[...doc.nodes,{id:'n3',kind:'shell' as const,parent:{node:2,side:'solid' as const},thickness:2,open}]};
  assert.throws(()=>partSnapshot(candidate),error=>{const friendly=friendlyCause(error);assert.equal(friendly.code,'SHELL_FACE_KIND');assert.equal(friendly.title,title);assert.match(friendly.hint,/n2\.face#1/);return true;});
  assert.deepEqual(doc,before);assert.deepEqual(partSnapshot(doc),native);
 }
});
