import test from 'node:test';
import assert from 'node:assert/strict';
import type {StudioDoc,ModelNode} from '@barocss/cad-model/engine/doc';
import {convertLinearPatternDistance} from '@barocss/cad-model/engine/linearSpanPattern';
import {evaluateDoc, type EvalResult} from '@barocss/cad-model/engine/evaluate';
import {toPartDocument} from '@barocss/cad-model/engine/part';
import {evaluateCadPart,checkBrep,massPropertiesOf,faceGeometry} from '@barocss/cad';
import {prepareLinearPatternHoleEdit as prepare} from '../src/app/patternHoleSpacing';
import {createHistoryFeatureApply} from '../src/state/historyFeatureApply';
function fixture(axis:'x'|'y'='x',origin=-50):StudioDoc {
 const c:[number,number]=[origin+2,13];c[axis==='x'?0:1]+=32;
 return {format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nextId:4,nodes:[
 {id:'n0',kind:'sketch',profile:'rectangle',min:[origin,10],max:[origin+4,16]},
 {id:'n1',kind:'extrude',sketch:0,height:8},
 {id:'n2',kind:'linear-span-pattern',parent:{node:1,side:'solid'},axis,span:32,count:3},
 {id:'n3',kind:'hole',parent:{node:2,side:'solid'},radius:1,center:c,face:'n1.top@2'}],outputs:{b3:{node:3,side:'solid'}}};
}
const patch=(nodes:ModelNode[],i:number,p:object)=>nodes.map((n,j)=>j===i?{...n,...p} as ModelNode:n);
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-7,`${a} vs ${b}`);
for(const axis of ['x','y'] as const)for(const span of [32.5,40])test(`${axis} span ${span} preserves local bore, native geometry and inputs`,()=>{
 const doc=fixture(axis),draft=patch(doc.nodes,2,{span}),saved=structuredClone({doc,draft});
 const result=prepare(doc,draft,2);assert.ok('nodes' in result);if(!('nodes' in result))return;
 const h=result.nodes[3];assert.equal(h.kind,'hole');if(h.kind!=='hole')return;
 const expected:[number,number]=axis==='x'?[-48+span,13]:[-48,13+span];assert.deepEqual(h.center,expected);
 for(let i=0;i<3;i++)assert.equal(result.nodes[i],draft[i]);
 assert.deepEqual(h,{...doc.nodes[3],center:expected});assert.deepEqual({doc,draft},saved);
 const [out]=evaluateCadPart(toPartDocument({...doc,nodes:result.nodes})).outputs;
 assert.equal(out.bodyCount,3);assert.equal(checkBrep(out.brep,{strict:true}).valid,true);
 const mass=massPropertiesOf(out),v=576-8*Math.PI;near(mass.volume,v);
 const base=[-48,13];base[axis==='x'?0:1]+=span/2;
 near(mass.centroid[0],(576*base[0]-8*Math.PI*expected[0])/v);
 near(mass.centroid[1],(576*base[1]-8*Math.PI*expected[1])/v);near(mass.centroid[2],4);
 const walls=out.brep.faces.filter(f=>f.name?.startsWith('n3.')).map(faceGeometry);assert.equal(walls.length,2);
 for(const wall of walls){assert.equal(wall?.kind,'cylinder');if(wall?.kind==='cylinder'){near(wall.c[0],expected[0]);near(wall.c[1],expected[1]);near(wall.r,1);}}
});
test('unsupported active dependencies and mixed edits refuse without mutations',()=>{
 const doc=fixture(),draft=patch(doc.nodes,2,{span:40});
 const cases:[number,object][]=[[0,{plane:{}}],[1,{height:{parameter:'H'}}],[2,{count:65}],[2,{axis:'y'}],[2,{parent:{node:0,side:'solid'}}],[2,{span:-40}],[2,{span:0}],[2,{span:NaN}],[2,{span:Infinity}],[2,{span:8}],[3,{sigs:{}}],[3,{made:{}}],[3,{depth:3}],[3,{face:undefined}],[3,{face:'n1.top'}],[3,{face:'n1.top@1'}],[3,{center:[-17,13]}]];
 for(const [i,p] of cases){const a={...doc,nodes:patch(doc.nodes,i,p)},b=patch(draft,i,p);if(i===2){a.nodes=doc.nodes;}
 const saved=structuredClone({a,b});assert.ok('error' in prepare(a,b,2),JSON.stringify(p));assert.deepEqual({a,b},saved);}
 for(const key of ['direct','instances','unknownConsumer'])assert.ok('error' in prepare({...doc,[key]:{}} as StudioDoc,draft,2));
 const pattern=doc.nodes[2];assert.equal(pattern.kind,'linear-span-pattern');
 if(pattern.kind!=='linear-span-pattern')return;
 const converted=convertLinearPatternDistance(pattern,'spacing',2);assert.ok('node' in converted);
 if(!('node' in converted))return;
 const mode=doc.nodes.map((n,i)=>i===2?converted.node:n);
 assert.deepEqual(prepare(doc,mode,2),{nodes:mode});
 const [modeOut]=evaluateCadPart(toPartDocument({...doc,nodes:mode})).outputs;
 assert.equal(checkBrep(modeOut.brep,{strict:true}).valid,true);near(massPropertiesOf(modeOut).volume,576-8*Math.PI);
 assert.ok('error' in prepare(doc,patch(draft,3,{suppressed:true}),2));
});
test('suppressed end-copy Hole follows span; held and absent Hole and Count-only behavior stay unchanged',()=>{
 const doc=fixture(),suppressed={...doc,nodes:patch(doc.nodes,3,{suppressed:true})};
 const draft=patch(suppressed.nodes,2,{span:40}),before=structuredClone({suppressed,draft});
 const remapped=prepare(suppressed,draft,2);
 assert.deepEqual(remapped,{nodes:patch(draft,3,{center:[-8,13],suppressed:true})});
 assert.ok('error' in prepare(suppressed,patch(draft,2,{count:4}),2));
 assert.deepEqual({suppressed,draft},before);
 const held={...doc,nodes:patch(doc.nodes,3,{held:'missing'})},heldDraft=patch(held.nodes,2,{span:40});
 const heldEdit=prepare(held,heldDraft,2);
 assert.ok('nodes' in heldEdit);if('nodes' in heldEdit)assert.equal(heldEdit.nodes,heldDraft);
 const noHole={...doc,nodes:doc.nodes.slice(0,3)},d=patch(noHole.nodes,2,{span:40});assert.deepEqual(prepare(noHole,d,2),{nodes:d});
 const count=prepare(doc,patch(doc.nodes,2,{count:4}),2);assert.ok('nodes' in count);if('nodes' in count){const h=count.nodes[3];assert.equal(h.kind,'hole');if(h.kind==='hole'){assert.equal(h.face,'n1.top@3');assert.deepEqual(h.center,[-16,13]);}}
});

test('paired Count and span validate the old and final layouts without requiring an intermediate edit', () => {
 const seed=fixture();
 for(const [oldSpan,count,span] of [[32,4,42],[32,4,48],[12,4,18]]){
  const source={...seed,nodes:patch(patch(seed.nodes,2,{span:oldSpan}),3,{center:[-48+oldSpan,13]})};
  const draft=patch(source.nodes,2,{count,span}), saved=structuredClone({source,draft});
  const updated=prepare(source,draft,2);
  const expected=patch(draft,3,{center:[-48+span,13],face:`n1.top@${count-1}`});
  assert.deepEqual(updated,{nodes:expected});
  const [body]=evaluateCadPart(toPartDocument({...source,nodes:expected})).outputs;
  assert.equal(body.bodyCount,count);
  assert.equal(checkBrep(body.brep,{strict:true}).valid,true);
  near(massPropertiesOf(body).volume,count*192-8*Math.PI);
  const reversed=prepare({...source,nodes:expected},patch(expected,2,{count:3,span:oldSpan}),2);
  assert.deepEqual(reversed,{nodes:source.nodes});
  assert.deepEqual({source,draft},saved);
 }
 assert.ok('error' in prepare(seed,patch(seed.nodes,2,{count:4,span:12}),2));
 assert.ok('error' in prepare(seed,patch(seed.nodes,2,{count:4,span:42,axis:'y'}),2));
});

test('paired span and Count commit once with an owned native reply and never after replacement', async () => {
 for(const retirement of ['current','evaluated','draft','revision'] as const){
  const doc=fixture(), draft=patch(doc.nodes,2,{count:4,span:42});
  const expected={...doc,nodes:patch(draft,3,{center:[-6,13],face:'n1.top@3'})};
  const scope={},open={},commits:StudioDoc[]=[];
  const requests:{doc:StudioDoc;revision:number;resolve(reply:EvalResult):void}[]=[];
  let evaluated=doc, currentDraft=true, revision=0;
  const apply=createHistoryFeatureApply({
   model:{doc,evaluated:doc,editNode:2,fresh:true,busy:false},
   owner:{document:()=>doc,evaluated:()=>evaluated,scope:()=>scope,open:()=>open,worker:()=>1,marker:()=>null,variant:()=>null},
   worker:{nextRevision:()=>++revision,engine:{
    part:()=>assert.fail('unexpected prefix read'),
    evaluate:(candidate,at)=>new Promise(resolve=>requests.push({doc:candidate,revision:at,resolve})),
   }},
   changes:{canChangeDocument:()=>true,commit:next=>{commits.push(next);return true;},
    applyRoundedInsetEdit:()=>assert.fail('unexpected inset edit'),stageFeatureCandidate:()=>assert.fail('unexpected candidate')},
  });
  const pending=apply(draft,()=>currentDraft);
  assert.equal(requests.length,1);
  assert.deepEqual(requests[0].doc,expected);
  assert.deepEqual(commits,[]);
  if(retirement==='evaluated')evaluated={...doc};
  if(retirement==='draft')currentDraft=false;
  const request=requests[0];
  const reply=evaluateDoc(request.doc,request.revision+(retirement==='revision'?1:0));
  assert.ok(reply.ok);
  request.resolve(reply);
  await pending;
  assert.deepEqual(commits,retirement==='current'?[expected]:[]);
 }
});

test('invalid authored old span and excessive new derived spacing are refused',()=>{
 const doc=fixture();
 for(const span of [-32,0,NaN,Infinity]){const before={...doc,nodes:patch(doc.nodes,2,{span})};assert.ok('error' in prepare(before,patch(doc.nodes,2,{span:40}),2));}
 assert.ok('error' in prepare(doc,patch(doc.nodes,2,{span:1e9}),2));
});
