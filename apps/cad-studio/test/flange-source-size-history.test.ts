import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDoc, withNode, prefixDoc, type StudioDoc, type ModelNode } from '@barocss/cad-model/engine/doc';
import { evaluateDoc, type EvalResult } from '@barocss/cad-model/engine/evaluate';
import { signaturesOf } from '@barocss/cad-model/engine/rematch';
import { toSig } from '@barocss/cad-model/engine/references';
import { isFlangeSourceSizeChange, admitFlangeSourceSizeChange, proveFlangeSourceSizeChange } from '../src/state/flangeSourceSizeHistory';
import { createHistoryFeatureApply } from '../src/state/historyFeatureApply';
function fixture(name='n1.side1|n1.top'){
 const sketch=withNode(emptyDoc(),{kind:'sketch',profile:'rectangle',min:[0,0],max:[80,50]});
 const base=withNode(sketch,{kind:'sheet-base',sketch:0,thickness:1.5,bendRadius:1.5,kFactor:.44});
 const result=evaluateDoc(base,1);assert.ok(result.ok);if(!result.ok)throw Error('parent');
 const sig=signaturesOf(result.bodies[0]).edges.get(name);assert.ok(sig);
 const doc=withNode(base,{kind:'sheet-flange',parent:{node:1,side:'solid'},edges:[name],length:20,sigs:{[name]:toSig(sig)}});
 return{doc,bodies:result.bodies};
}
const flangePatch=(doc:StudioDoc,change:object):StudioDoc=>({...doc,nodes:doc.nodes.map((n,i)=>i===2?{...n,...change} as ModelNode:n)});
const basePatch=(doc:StudioDoc,change:object):StudioDoc=>({...doc,nodes:doc.nodes.map((n,i)=>i===1?{...n,...change} as ModelNode:n)});
const patch=(doc:StudioDoc,change:object):StudioDoc=>({...doc,nodes:doc.nodes.map((n,i)=>i===0?{...n,...change} as ModelNode:n)});
type Call={doc:StudioDoc;revision:number;resolve(r:EvalResult):void;reject(e:Error):void};
const tick=()=>new Promise<void>(resolve=>queueMicrotask(resolve));
function native(doc:StudioDoc){const r=evaluateDoc(doc,99);assert.ok(r.ok);if(!r.ok)throw Error('native');return r.bodies;}
function harness(source=fixture().doc,width=100,depth=50){
 const doc=source,next=patch(doc,{max:[width,depth]});let document=doc,evaluated=doc,scope={},open={},worker=1,draft=true,marker:number|null=null,variant:string|null=null,revision=0;
 const parts:Call[]=[],full:Call[]=[],commits:StudioDoc[]=[];
 const enqueue=(calls:Call[],d:StudioDoc,r:number)=>new Promise<EvalResult>((resolve,reject)=>calls.push({doc:d,revision:r,resolve,reject}));
 const apply=createHistoryFeatureApply({model:{doc,evaluated:doc,editNode:1,fresh:true,busy:false},owner:{document:()=>document,evaluated:()=>evaluated,scope:()=>scope,open:()=>open,worker:()=>worker,marker:()=>marker,variant:()=>variant},worker:{engine:{part:(d,r)=>enqueue(parts,d,r),evaluate:(d,r)=>enqueue(full,d,r)},nextRevision:()=>++revision},changes:{canChangeDocument:()=>true,commit:d=>{commits.push(d);return true;},applyRoundedInsetEdit:()=>assert.fail('inset'),stageFeatureCandidate:()=>assert.fail('pattern')}});
 const good=(c:Call)=>{const r=evaluateDoc(c.doc,c.revision);assert.ok(r.ok,r.ok?'':r.error.detail);c.resolve(r);};
 return{doc,next,parts,full,commits,good,apply:(nodes=next.nodes)=>apply(nodes,()=>draft),invalidate:{document:()=>{document={...doc};},evaluated:()=>{evaluated={...doc};},scope:()=>{scope={};},open:()=>{open={};},worker:()=>{worker++;},draft:()=>{draft=false;},marker:()=>{marker=0;},variant:()=>{variant='other';},sourceMutation:()=>{doc.nextId=(doc.nextId??0)+1;},draftMutation:()=>{const n=next.nodes[0];if(n.kind==='sketch'&&n.profile==='rectangle')n.max=[120,50];}}};
}
test('inherited whole-parent native proof refreshes only the signed top rim after individual and combined extent changes',()=>{
 let before=fixture().doc;
 for(const [width,depth] of [[100,50],[80,50],[80,60],[80,50],[100,60],[80,50]]){
  const next=patch(before,{max:[width,depth]}),saved=structuredClone(before);
  assert.equal(admitFlangeSourceSizeChange(before,next,1),true);
  const a=native(prefixDoc(before,2)),b=native(prefixDoc(next,2));
  const result=proveFlangeSourceSizeChange(before,next,a,b);assert.ok(result);
  const n=result.nodes[2];assert.equal(Object.hasOwn(n,'bendRadius'),false);assert.equal(result.nodes[1],next.nodes[1]);assert.equal(n.kind,'sheet-flange');if(n.kind!=='sheet-flange')throw Error('kind');
  const sig=signaturesOf(b[0]).edges.get('n1.side1|n1.top');assert.ok(sig);
  assert.deepEqual(result,flangePatch(next,{sigs:{'n1.side1|n1.top':toSig(sig)}}));
  assert.equal(n.sigs?.['n1.side1|n1.top'].s,depth);
  assert.deepEqual(n.sigs?.['n1.side1|n1.top'].p,[width,depth/2,1.5]);
  const bodies=native(result);assert.equal(bodies.length,1);assert.ok(Math.abs(bodies[0].volume!-depth*1.5*(width+20-6+Math.PI/2*2.25))<1e-7);
  assert.deepEqual(before,saved);before=result;
 }
});
test('ordinary sheet and an unrelated later sheet flange do not enter this adapter',()=>{
 const doc=fixture().doc,plain=prefixDoc(doc,2);
 assert.equal(isFlangeSourceSizeChange(plain,patch(plain,{max:[100,50]}),1),false);
 const sk=doc.nodes[0],base=doc.nodes[1],relief=doc.nodes[2];assert.equal(relief.kind,'sheet-flange');if(relief.kind!=='sheet-flange')throw Error('kind');
 const independent:StudioDoc={...doc,nodes:[sk,base,{...sk,id:'n2'},{...base,id:'n3',sketch:2} as ModelNode,{...relief,id:'n4',parent:{node:3,side:'solid'}}],outputs:{b4:{node:4,side:'solid'}},nextId:5};
 assert.equal(isFlangeSourceSizeChange(independent,patch(independent,{max:[100,50]}),1),false);
});
test('ordinary sheet keeps its existing direct full-evaluation commit path',async()=>{
 const source=prefixDoc(fixture().doc,2),h=harness(source),pending=h.apply();
 assert.equal(h.parts.length,0);assert.equal(h.full.length,1);assert.deepEqual(h.full[0].doc,h.next);
 h.good(h.full[0]);await pending;assert.deepEqual(h.commits,[h.next]);
});
test('mixed, dependent, unsupported source and invalid extents fail admission without mutation',()=>{
 const {doc}=fixture(),saved=structuredClone(doc),next=patch(doc,{max:[100,50]});
 for(const candidate of [doc,patch(doc,{max:[0,50]}),patch(doc,{max:[-1,50]}),patch(doc,{max:[NaN,60]}),patch(doc,{max:[Infinity,60]}),patch(doc,{max:[{parameter:'W'},60]}),patch(doc,{min:[1,0],max:[100,60]}),basePatch(next,{bendRadius:2}),basePatch(next,{thickness:3}),basePatch(next,{kFactor:.5}),flangePatch(next,{length:21}),flangePatch(next,{measure:'inner'}),flangePatch(next,{bendRadius:1.5})])assert.equal(admitFlangeSourceSizeChange(doc,candidate,1),false);
 for(const raw of [flangePatch(doc,{held:'test'}),flangePatch(doc,{suppressed:true}),flangePatch(doc,{measure:'inner'}),flangePatch(doc,{position:'material-outside'}),flangePatch(doc,{angle:45}),flangePatch(doc,{offsets:[0,0]}),flangePatch(doc,{bendRadius:2}),flangePatch(doc,{bendRadius:{parameter:'R'}}),flangePatch(doc,{bendRadius:0}),basePatch(doc,{bendRadius:{parameter:'R'}}),basePatch(doc,{thickness:{parameter:'T'}}),{...doc,direct:[]},{...doc,nodes:[...doc.nodes,doc.nodes[2]]}]){
  const source=raw as unknown as StudioDoc;assert.equal(admitFlangeSourceSizeChange(source,patch(source,{max:[100,50]}),1),false);
 }
 assert.deepEqual(doc,saved);
});
test('stale original signature, missing topology and foreign parent cannot be refreshed',()=>{
 const {doc}=fixture(),next=patch(doc,{max:[100,50]}),a=native(prefixDoc(doc,2)),b=native(prefixDoc(next,2));
 for(const invalid of [{sigs:undefined},{sigs:{}},{edges:['n1.bottom|n1.side0']}]){const old=flangePatch(doc,invalid);assert.equal(proveFlangeSourceSizeChange(old,patch(old,{max:[100,50]}),a,b),null);}
 const sig=doc.nodes[2].sigs!['n1.side1|n1.top'];
 for(const changed of [{...sig,s:2},{...sig,n:2},{...sig,p:[0,0,.75]}]){const old=flangePatch(doc,{sigs:{'n1.side1|n1.top':changed}});assert.equal(proveFlangeSourceSizeChange(old,patch(old,{max:[100,50]}),a,b),null);}
 for(const side of [0,1]){const aa=structuredClone(a),bb=structuredClone(b);(side===0?aa:bb)[0].mesh.edges.pop();assert.equal(proveFlangeSourceSizeChange(doc,next,aa,bb),null);}
 assert.equal(proveFlangeSourceSizeChange(doc,next,[{...a[0],key:'foreign'}],b),null);
 assert.equal(proveFlangeSourceSizeChange(doc,next,a,[{...b[0],key:'foreign'}]),null);
});
async function reach(h:ReturnType<typeof harness>,stage:'before'|'after'|'full'){
 if(stage!=='before'){h.good(h.parts[0]);await tick();assert.equal(h.parts.length,2);}
 if(stage==='full'){h.good(h.parts[1]);await tick();assert.equal(h.full.length,1);}
 return stage==='full'?h.full[0]:h.parts[stage==='before'?0:1];
}
test('two owned prefixes and final native evaluation commit exactly once',async()=>{
 const h=harness(fixture().doc,100,60),saved=structuredClone(h.doc),pending=h.apply();assert.equal(h.parts.length,1);assert.deepEqual(h.parts[0].doc,prefixDoc(h.doc,2));
 const full=await reach(h,'full');assert.deepEqual(h.parts[1].doc,prefixDoc(h.next,2));
 const expected=proveFlangeSourceSizeChange(h.doc,h.next,native(prefixDoc(h.doc,2)),native(prefixDoc(h.next,2)));assert.ok(expected);assert.deepEqual(full.doc,expected);
 h.good(full);await pending;assert.deepEqual(h.commits,[expected]);assert.equal(Object.hasOwn(h.commits[0].nodes[2],'bendRadius'),false);assert.deepEqual(h.doc,saved);
});
for(const stage of ['before','after','full'] as const)for(const owner of ['document','evaluated','scope','open','worker','draft','marker','variant','sourceMutation','draftMutation'] as const)test(`${stage} stale ${owner} cannot commit`,async()=>{
 const h=harness(),pending=h.apply(),c=await reach(h,stage),r=evaluateDoc(c.doc,c.revision);assert.ok(r.ok);h.invalidate[owner]();c.resolve(r);await pending;assert.equal(h.commits.length,0);
 if(stage!=='full')assert.equal(h.full.length,0);
});
for(const stage of ['before','after','full'] as const)test(`${stage} wrong revision cannot commit`,async()=>{
 const h=harness(),pending=h.apply(),c=await reach(h,stage);c.resolve(evaluateDoc(c.doc,c.revision+10));await pending;assert.equal(h.commits.length,0);if(stage!=='full')assert.equal(h.full.length,0);
});
test('invalid draft fails before worker; parent errors and native full refusal preserve original',async()=>{
 const h=harness();assert.ok(await h.apply(basePatch(h.next,{bendRadius:2}).nodes));assert.equal(h.parts.length,0);assert.equal(h.full.length,0);assert.equal(h.commits.length,0);
 for(const stage of ['before','after'] as const){const h=harness(),saved=structuredClone(h.doc),pending=h.apply(),c=await reach(h,stage);c.reject(Error('worker failure'));assert.ok(await pending);assert.equal(h.commits.length,0);assert.deepEqual(h.doc,saved);}
 const k=harness(),saved=structuredClone(k.doc),pending=k.apply(),c=await reach(k,'full');// Real native error payload tests coordinator failure handling, not reachability of a size-only negative length.
 const refused=evaluateDoc(flangePatch(c.doc,{length:-1}),c.revision);assert.equal(refused.ok,false);c.resolve(refused);assert.ok(await pending);assert.equal(k.commits.length,0);assert.deepEqual(k.doc,saved);
});

test('valid original flange with impossible new width refuses final native build atomically even after depth changes',async()=>{const h=harness(fixture().doc,2,60),saved=structuredClone(h.doc),pending=h.apply();const c=await reach(h,'full');const r=evaluateDoc(c.doc,c.revision);assert.equal(r.ok,false);if(!r.ok)assert.match(r.error.detail,/BEND_DOES_NOT_FIT/);c.resolve(r);assert.ok(await pending);assert.equal(h.commits.length,0);assert.deepEqual(h.doc,saved);});

test('each of four native top-rim semantic roles refreshes only its own edge',()=>{
 for(let side=0;side<4;side++)for(const max of [[100,50],[80,60],[100,60]]){
  const name=`n1.side${side}|n1.top`,{doc}=fixture(name),next=patch(doc,{max}),a=native(prefixDoc(doc,2)),b=native(prefixDoc(next,2));
  const result=proveFlangeSourceSizeChange(doc,next,a,b);assert.ok(result);
  const f=result.nodes[2];if(f.kind!=='sheet-flange')throw Error('flange');
  assert.deepEqual(f.edges,[name]);const [x,y]=max;
  const midpoint=[[x/2,0,1.5],[x,y/2,1.5],[x/2,y,1.5],[0,y/2,1.5]][side];
  assert.deepEqual(f.sigs?.[name].p,midpoint);assert.equal(f.sigs?.[name].s,side%2?y:x);
  assert.equal(native(result).length,1);
 }
});

test('damaged face adjacency or incorrect edge endpoints cannot establish the same semantic rim',()=>{
 const {doc}=fixture(),next=patch(doc,{max:[100,50]}),a=native(prefixDoc(doc,2)),b=native(prefixDoc(next,2));
 for(const mutate of [(bodies:typeof b)=>{bodies[0].mesh.faces.pop();},(bodies:typeof b)=>{const e=bodies[0].mesh.edges.find(e=>e.names.includes('n1.side1|n1.top'))!;e.a=[e.a[0]-1,e.a[1],e.a[2]];}]){
  const damaged=structuredClone(b);mutate(damaged);assert.equal(proveFlangeSourceSizeChange(doc,next,a,damaged),null);
 }
});
