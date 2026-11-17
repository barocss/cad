import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyDoc,withNode,type StudioDoc} from '../src/engine/doc';
import {evaluateDoc} from '../src/engine/evaluate';
import {addInstancePattern} from '../src/assembly/patterns';
import {checkPartEdit} from '../src/frames/skeleton';
import {dispatchTool} from '../src/chat/tools';
import {editDefinition,offerRevision,acceptRevision,dismissRevision} from '../src/assembly/definitions';
const plate=(circle=false)=>withNode(withNode(emptyDoc(),circle?{kind:'sketch',profile:'circle',center:[0,0],radius:50}:{kind:'sketch',profile:'rectangle',min:[0,0],max:[300,200]}),{kind:'extrude',sketch:0,height:10});
const start=async()=>{const part=plate();const r=await dispatchTool({doc:{...emptyDoc(),instances:[{id:'p1',name:'Plate',doc:part,position:[0,0,100],rotation:[0,0,0],part:{id:'part1',rev:'A'}}]},bodies:[]},'add_features',{features:[{kind:'frame',follows:{part:'p1',sketch:'n0'},section:{kind:'rect-tube',width:40,height:40,wall:3,outerRadius:0},corners:{default:'mitre'}}]},async d=>evaluateDoc(d,1));assert.ok(!r.isError,r.content);return r.state.doc;};
test('followed definition edit refuses a replacement that breaks its existing base frame',async()=>{const doc=await start(),before=JSON.stringify(doc),replacement=plate(true);assert.ok((await evaluateDoc(replacement,1)).ok);const result=editDefinition(doc,'p1',replacement);assert.equal(JSON.stringify(doc),before);assert.ok('error' in result,'followed sketch cannot become a circle');});
test('waiting revision cannot replace a sketch followed by a base frame',async()=>{const doc=await start(),offered=offerRevision(doc,'part1',plate(true),'round.bcad');if('error' in offered)throw Error(offered.error);const before=JSON.stringify(offered.doc);let accepted:StudioDoc|undefined;assert.throws(()=>{accepted=acceptRevision(offered.doc,'part1');},/follow|sketch/);assert.equal(JSON.stringify(offered.doc),before);assert.equal(accepted,undefined);});

test('all sharers and unshared seed copies preserve their followed sketch',async()=>{
  const root=await start(),first=root.instances![0];
  for(const shared of [true,false]){
    const seed={...first,...(!shared?{part:undefined}:{})};
    let doc:StudioDoc={...root,instances:[seed,{...seed,id:'p2',name:'Other',position:[500,0,100] as [number,number,number]}]};
    doc=addInstancePattern(doc,{kind:'linear',seed:'p2',count:2,dir:[1,0,0],spacing:400}).doc;
    doc={...doc,nodes:doc.nodes.map(n=>n.kind==='frame'?{...n,follows:{part:'pat1-1',sketch:'n0'}}:n)};
    const before=JSON.stringify(doc),replacement=plate(true);
    const result=editDefinition(doc,shared?'p1':'p2',replacement);
    assert.ok('error' in result,'a follower on a different sharer or generated copy is protected');
    assert.equal(JSON.stringify(doc),before);
    if(shared){const offered=offerRevision(doc,'part1',replacement,'circle.bcad');assert.ok('doc' in offered);if('doc' in offered){assert.throws(()=>acceptRevision(offered.doc,'part1'),/follow|sketch/);assert.equal(JSON.stringify(doc),before);}}
    const fromCopy=editDefinition(doc,'pat1-1',replacement);assert.ok('error' in fromCopy);
  }
});
test('normal widening remains live, pending can be dismissed, and a broken existing reference can recover',async()=>{
  const doc=await start(),wide=plate();wide.nodes[0]={...wide.nodes[0],max:[400,200]} as typeof wide.nodes[0];
  const offered=offerRevision(doc,'part1',plate(true),'round.bcad');assert.ok('doc' in offered);if(!('doc' in offered))return;
  assert.deepEqual(dismissRevision(offered.doc,'part1').instances,doc.instances);
  const nextOffer=offerRevision(offered.doc,'part1',wide,'wide.bcad');assert.ok('doc' in nextOffer);if(!('doc' in nextOffer))return;
  const accepted=acceptRevision(nextOffer.doc,'part1');assert.ok((await evaluateDoc(accepted,1)).ok);assert.equal(accepted.pendingParts,undefined);
  const edited=editDefinition(offered.doc,'p1',wide);assert.ok('doc' in edited);if(!('doc' in edited))return;
  assert.ok((await evaluateDoc(edited.doc,1)).ok);assert.equal(edited.doc.pendingParts,undefined);
  const unrelated={...doc,nodes:[]};assert.ok('doc' in editDefinition(unrelated,'p1',plate(true)));
  const broken={...doc,instances:doc.instances!.map(i=>({...i,doc:plate(true)}))};assert.equal(checkPartEdit(broken,'p1',wide).length,0);
  const recovery=editDefinition(broken,'p1',wide);assert.ok('doc' in recovery);if('doc' in recovery)assert.ok((await evaluateDoc(recovery.doc,1)).ok);
});
test('a triangle cannot silently reduce four frame members, and rejected pending stays intact',async()=>{
  const doc=await start(),triangle=plate();triangle.nodes[0]={kind:'sketch',id:'n0',profile:'polygon',points:[[0,0],[300,0],[0,200]]};
  assert.ok((await evaluateDoc(triangle,1)).ok);
  const result=editDefinition(doc,'p1',triangle);assert.ok('error' in result);if('error' in result)assert.match(result.error,/4 → 3/);
  const offered=offerRevision(doc,'part1',triangle,'triangle.bcad');assert.ok('doc' in offered);if(!('doc' in offered))return;
  const before=JSON.stringify(offered.doc);assert.throws(()=>acceptRevision(offered.doc,'part1'),/4 → 3/);assert.equal(JSON.stringify(offered.doc),before);
  const detached={...offered.doc,nodes:[]};assert.doesNotThrow(()=>acceptRevision(detached,'part1'));
});
