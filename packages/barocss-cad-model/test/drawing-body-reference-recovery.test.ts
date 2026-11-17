import test from 'node:test';
import assert from 'node:assert/strict';
import { rectanglePart, withNode, type StudioDoc } from '../src/engine/doc';
import { withIds } from '../src/engine/ids';
import { evaluatePart, type BodyResult } from '../src/engine/evaluate';
import { readDrawing } from '../src/drawing/types';
import { candidatesFor, confirmReference, verifyReferences } from '../src/engine/references';
const evaluate = async (doc: StudioDoc) => evaluatePart(doc, 1);
function fixture(): StudioDoc {
 let doc = withIds(rectanglePart(40,12,6));
 doc = withNode(doc,{kind:'sketch',profile:'rectangle',min:[-5,-4],max:[35,-2]});
 doc = withNode(doc,{kind:'extrude',sketch:2,height:12,from:-3});
 return {...doc,drawing:readDrawing({scope:{kind:'part',body:{key:'b1',feature:'n1',kind:'extrude'}},dimensions:[{id:'d1',view:'top',kind:'linear',auto:true,orient:'vertical',place:[-10,6],a:{edge:'n1.bottom|n1.side0',at:'end',near:[0,0,0],sig:{k:'line',p:[15,0,0],d:[1,0,0],s:30}},b:{edge:'n1.bottom|n1.side2',at:'end',near:[0,12,0],sig:{k:'line',p:[15,12,0],d:[-1,0,0],s:30}}}]})};
}
test('selected-body drawing excludes another output from verification, alternatives and explicit confirmation',async()=>{
 const doc=fixture(),snapshot=JSON.stringify(doc), result=await evaluate(doc);assert.ok(result.ok);
 const whole={...doc,drawing:{...doc.drawing!,scope:{kind:'part' as const}}};
 const control=await verifyReferences(whole,result.bodies,evaluate);
 assert.ok(control.problems.some(p=>p.candidates.some(n=>n.startsWith('n3.'))),'reproduces excluded body candidates without scope');
 const verified=await verifyReferences(doc,result.bodies,evaluate);
 assert.equal(verified.problems.length,2);assert.equal(verified.changes.length,0);
 for(const p of verified.problems){assert.ok(p.candidates.includes(p.name));assert.ok(p.candidates.every(n=>n.startsWith('n1.')));assert.ok((await candidatesFor(doc,p.index,result.bodies,evaluate)).every(n=>n.startsWith('n1.')));}
 assert.equal(await confirmReference(doc,0,result.bodies,evaluate,'n3.bottom|n3.side2'),doc);
 let repaired=doc;
 for(const p of verified.problems) repaired=await confirmReference(repaired,p.index,result.bodies,evaluate,p.name);
 assert.deepEqual(repaired.nodes,doc.nodes);assert.deepEqual(repaired.outputs,doc.outputs);
 assert.deepEqual((await verifyReferences(JSON.parse(JSON.stringify(repaired)),result.bodies,evaluate)).problems,[]);
 assert.equal(JSON.stringify(doc),snapshot);
});
test('missing or suppressed selected body refuses confirmation and offers no fallback',async()=>{
 const doc=fixture(),result=await evaluate(doc);assert.ok(result.ok);
 for(const broken of [doc,{...doc,nodes:doc.nodes.map(n=>n.id==='n1'?{...n,suppressed:true as const}:n)}]){
 const bodies: BodyResult[]=broken===doc?result.bodies.filter(b=>b.key!=='b1'):result.bodies;
 const v=await verifyReferences(broken,bodies,evaluate);assert.equal(v.problems.length,2);assert.ok(v.problems.every(p=>p.candidates.length===0));
 assert.equal(await confirmReference(broken,0,bodies,evaluate,'n1.bottom|n1.side0'),broken);
 }
});
