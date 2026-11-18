import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDoc, withNode, prefixDoc, type StudioDoc, type ModelNode } from '@barocss/cad-model/engine/doc';
import { evaluateDoc, type EvalResult } from '@barocss/cad-model/engine/evaluate';
import { signaturesOf } from '@barocss/cad-model/engine/rematch';
import { toSig } from '@barocss/cad-model/engine/references';
import { proveFlangeRadiusSourceChange } from '../src/state/flangeRadiusSourceHistory';
import { createHistoryFeatureApply } from '../src/state/historyFeatureApply';
function fixture(){
 const sketch=withNode(emptyDoc(),{kind:'sketch',profile:'rectangle',min:[0,0],max:[80,50]});
 const base=withNode(sketch,{kind:'sheet-base',sketch:0,thickness:1.5,bendRadius:1.5,kFactor:.44});
 const result=evaluateDoc(base,1);assert.ok(result.ok);if(!result.ok)throw Error('parent');
 const name='n1.side1|n1.top',sig=signaturesOf(result.bodies[0]).edges.get(name);assert.ok(sig);
 const doc=withNode(base,{kind:'sheet-flange',parent:{node:1,side:'solid'},edges:[name],length:20,bendRadius:2,sigs:{[name]:toSig(sig)}});
 return{doc,bodies:result.bodies};
}
const inherit=(doc:StudioDoc):StudioDoc=>({...doc,nodes:doc.nodes.map((n,i)=>{if(i!==2||n.kind!=='sheet-flange')return n;const out={...n};delete out.bendRadius;return out;})});
const patch=(doc:StudioDoc,change:object):StudioDoc=>({...doc,nodes:doc.nodes.map((n,i)=>i===2?{...n,...change} as ModelNode:n)});
type Call={doc:StudioDoc;revision:number;resolve(r:EvalResult):void;reject(e:Error):void};
const tick=()=>new Promise<void>(resolve=>queueMicrotask(resolve));
function harness(source=fixture().doc){
 const doc=source,next=inherit(doc);let document=doc,evaluated=doc,scope={},open={},worker=1,draft=true,marker:number|null=null,variant:string|null=null,revision=0;
 const parts:Call[]=[],full:Call[]=[],commits:StudioDoc[]=[];
 const enqueue=(calls:Call[],d:StudioDoc,r:number)=>new Promise<EvalResult>((resolve,reject)=>calls.push({doc:d,revision:r,resolve,reject}));
 const apply=createHistoryFeatureApply({model:{doc,evaluated:doc,editNode:2,fresh:true,busy:false},owner:{document:()=>document,evaluated:()=>evaluated,scope:()=>scope,open:()=>open,worker:()=>worker,marker:()=>marker,variant:()=>variant},worker:{engine:{part:(d,r)=>enqueue(parts,d,r),evaluate:(d,r)=>enqueue(full,d,r)},nextRevision:()=>++revision},changes:{canChangeDocument:()=>true,commit:d=>{commits.push(d);return true;},applyRoundedInsetEdit:()=>assert.fail('inset'),stageFeatureCandidate:()=>assert.fail('pattern')}});
 const good=(c:Call)=>{const r=evaluateDoc(c.doc,c.revision);assert.ok(r.ok,r.ok?'':r.error.detail);c.resolve(r);};
 return{doc,next,parts,full,commits,good,apply:(nodes=next.nodes)=>apply(nodes,()=>draft),invalidate:{document:()=>{document={...doc};},evaluated:()=>{evaluated={...doc};},scope:()=>{scope={};},open:()=>{open={};},worker:()=>{worker++;},draft:()=>{draft=false;},marker:()=>{marker=0;},variant:()=>{variant='other';},sourceMutation:()=>{doc.nextId=(doc.nextId??0)+1;},draftMutation:()=>{const n=next.nodes[2];if(n.kind==='sheet-flange')n.length=21;}}};
}
test('native whole-parent proof and original top-edge signature approve radius-source only',()=>{
 const {doc,bodies}=fixture(),next=inherit(doc),saved=structuredClone(doc);
 assert.equal(proveFlangeRadiusSourceChange(doc,next,bodies),true);
 for(const sigs of [undefined,{}, {'n1.side1|n1.top':{...toSig(signaturesOf(bodies[0]).edges.get('n1.side1|n1.top')!),s:49}}]){const old=patch(doc,{sigs});assert.equal(proveFlangeRadiusSourceChange(old,inherit(old),bodies),false);}
 const damaged=structuredClone(bodies);damaged[0].mesh.edges.pop();assert.equal(proveFlangeRadiusSourceChange(doc,next,damaged),false);
 assert.equal(proveFlangeRadiusSourceChange(doc,next,[{...bodies[0],key:'foreign'}]),false);assert.deepEqual(doc,saved);
});
test('owned native prefix then full evaluation commits radius-source once without changing signature',async()=>{
 const h=harness(),saved=structuredClone(h.doc),pending=h.apply();assert.equal(h.parts.length,1);assert.equal(h.full.length,0);assert.deepEqual(h.parts[0].doc,prefixDoc(h.doc,2));
 h.good(h.parts[0]);await tick();assert.equal(h.full.length,1);assert.deepEqual(h.full[0].doc,h.next);
 const result=evaluateDoc(h.next,99);assert.ok(result.ok);if(result.ok){const expected=50*1.5*(100-2*3+Math.PI/2*2.25);assert.ok(Math.abs(result.bodies[0].volume!-expected)<1e-7);}
 h.good(h.full[0]);await pending;assert.deepEqual(h.commits,[h.next]);assert.deepEqual(h.doc,saved);
 assert.equal(h.commits[0].nodes[0],h.doc.nodes[0]);assert.equal(h.commits[0].nodes[1],h.doc.nodes[1]);
});
test('mixed changes refuse before native evaluation; missing original signature refuses after prefix',async()=>{
 for(const change of [{length:21},{angle:45},{measure:'inner'},{position:'material-outside'}]){const h=harness();assert.ok(await h.apply(patch(h.next,change).nodes));assert.equal(h.parts.length,0);assert.equal(h.full.length,0);assert.equal(h.commits.length,0);}
 const h=harness(patch(fixture().doc,{sigs:undefined})),pending=h.apply();h.good(h.parts[0]);assert.equal((await pending)?.title,'Flange radius source not applied');assert.equal(h.full.length,0);assert.equal(h.commits.length,0);
});
for(const stage of ['prefix','full'] as const)for(const owner of ['document','evaluated','scope','open','worker','draft','marker','variant','sourceMutation','draftMutation'] as const)test(`${stage} delayed reply cannot commit after ${owner}`,async()=>{
 const h=harness(),pending=h.apply();if(stage==='full'){h.good(h.parts[0]);await tick();assert.equal(h.full.length,1);}
 const c=stage==='prefix'?h.parts[0]:h.full[0],reply=evaluateDoc(c.doc,c.revision);assert.ok(reply.ok);h.invalidate[owner]();c.resolve(reply);await pending;
 assert.equal(h.commits.length,0);if(stage==='prefix')assert.equal(h.full.length,0);
});
for(const stage of ['prefix','full'] as const)test(`${stage} wrong revision cannot commit`,async()=>{
 const h=harness(),pending=h.apply();if(stage==='full'){h.good(h.parts[0]);await tick();}
 const c=stage==='prefix'?h.parts[0]:h.full[0];c.resolve(evaluateDoc(c.doc,c.revision+100));await pending;assert.equal(h.commits.length,0);if(stage==='prefix')assert.equal(h.full.length,0);
});
test('prefix exception and damaged full topology cannot reach full evaluation',async()=>{
 for(const damage of [false,true]){const h=harness(),pending=h.apply();if(!damage)h.parts[0].reject(Error('worker failed'));else{const c=h.parts[0],r=structuredClone(evaluateDoc(c.doc,c.revision));assert.ok(r.ok);if(r.ok)r.bodies[0].mesh.faces.pop();c.resolve(r);}assert.equal((await pending)?.title,'Flange radius source not applied');assert.equal(h.full.length,0);assert.equal(h.commits.length,0);}
});
test('full native geometry refusal preserves the accepted source and never commits',async()=>{
 const h=harness(),saved=structuredClone(h.doc),pending=h.apply();h.good(h.parts[0]);await tick();
 // Exercise coordinator error handling using a real native failure, not an invented success payload.
 // This does not claim that a radius-source-only change makes this invalid length reachable.
 const c=h.full[0],refusal=evaluateDoc(patch(c.doc,{length:-1}),c.revision);assert.equal(refusal.ok,false);
 c.resolve(refusal);assert.ok(await pending);assert.equal(h.commits.length,0);assert.deepEqual(h.doc,saved);
});

test('valid explicit flange cannot switch to oversized inherited sheet radius',async()=>{
 const original=fixture().doc;
 const source:StudioDoc={...original,nodes:original.nodes.map((n,i)=>i===1&&n.kind==='sheet-base'?{...n,bendRadius:19}:n)};
 const accepted=evaluateDoc(source,1);assert.ok(accepted.ok);
 const h=harness(source),saved=structuredClone(source),pending=h.apply();assert.equal(h.parts.length,1);h.good(h.parts[0]);await tick();assert.equal(h.full.length,1);
 const c=h.full[0],result=evaluateDoc(c.doc,c.revision);assert.equal(result.ok,false);if(!result.ok)assert.match(result.error.detail,/BEND_DOES_NOT_FIT/);c.resolve(result);assert.ok(await pending);assert.equal(h.commits.length,0);assert.deepEqual(source,saved);
});
test('inherited to own uses current parent radius and preserves effective native geometry',async()=>{
 const source=inherit(fixture().doc),target=patch(source,{bendRadius:1.5}),h=harness(source),pending=h.apply(target.nodes);
 assert.equal(h.parts.length,1);h.good(h.parts[0]);await tick();assert.equal(h.full.length,1);h.good(h.full[0]);await pending;
 assert.deepEqual(h.commits,[target]);assert.equal(Object.hasOwn(source.nodes[2],'bendRadius'),false);
 const before=evaluateDoc(source,11),after=evaluateDoc(target,12);assert.ok(before.ok&&after.ok);if(before.ok&&after.ok)assert.equal(before.bodies[0].volume,after.bodies[0].volume);
});
