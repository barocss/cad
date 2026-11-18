import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyDoc,withNode,type StudioDoc} from '@barocss/cad-model/engine/doc';
import {beadsOf} from '@barocss/cad-model/engine/part';
import {evaluateDoc} from '@barocss/cad-model/engine/evaluate';
import {dispatchTool} from '@barocss/cad-model/chat/tools';
import {weldList} from '@barocss/cad-model/frames/welds';
import {drawingRevisionPrint} from '../src/ui/drawing/revisionPrint';
const frame=()=>withNode(emptyDoc(),{kind:'frame',points:[[0,0,0],[0,0,800],[500,0,400],[0,0,400]],segments:[[0,1],[2,3]],section:{kind:'rect-tube',width:80,height:80,wall:4,outerRadius:0},overrides:[{member:1,section:{kind:'rect-tube',width:40,height:40,wall:3,outerRadius:0}}],corners:{tee:'butt'}});
test('public weld size edit invalidates issued standalone drawing',async()=>{
 const part=frame();
 const evaluate=async(d:typeof part)=>evaluateDoc(d,1),ev=await evaluate(part);assert.ok(ev.ok);const joint=weldList(part,ev.bodies).joints.find(j=>j.kind==='butt')!;assert.ok(joint);
 const small=await dispatchTool({doc:part,bodies:ev.bodies},'set_welds',{welds:[{joint:joint.id,size:2}]},evaluate);assert.ok(!small.isError,small.content);
 const before=structuredClone(small.state.doc),large=await dispatchTool(small.state,'set_welds',{welds:[{joint:joint.id,size:3}]},evaluate);assert.ok(!large.isError,large.content);
 assert.deepEqual(small.state.doc,before);assert.deepEqual(small.state.doc.nodes,large.state.doc.nodes);
 const volumes=[small,large].map(r=>r.state.bodies.find(b=>b.element?.kind==='weld-bead')!.volume);
 console.log(JSON.stringify({volumes,stamps:[drawingRevisionPrint(small.state.doc),drawingRevisionPrint(large.state.doc)]}));assert.notEqual(volumes[0],volumes[1]);
 const annotated=await dispatchTool(small.state,'set_welds',{welds:[{joint:joint.id,size:2,notes:'Inspect seam',allRound:true}]},evaluate);assert.ok(!annotated.isError);
 assert.equal(annotated.state.bodies.find(b=>b.element?.kind==='weld-bead')!.volume,volumes[0]);
 assert.equal(drawingRevisionPrint(annotated.state.doc),drawingRevisionPrint(small.state.doc));
 assert.notEqual(drawingRevisionPrint(small.state.doc),drawingRevisionPrint(large.state.doc));
});


test('inactive and non-bead records retain ordinary legacy stamps', async()=>{
 const {modelPrint}=await import('@barocss/cad-model/drawing/types');
 for(const mode of ['suppressed','orphan','no-size','butt','suppressed-plate'] as const){
  let doc:StudioDoc=frame();doc.frames={version:1,welds:[{joint:'b0_part1.end',size:2}]};
  if(mode==='suppressed')doc.nodes[0].suppressed=true;
  if(mode==='orphan')doc.frames.welds![0].joint='missing.end';
  if(mode==='no-size')delete doc.frames.welds![0].size;
  if(mode==='butt')doc.frames.welds![0].kind='butt';
  if(mode==='suppressed-plate'){doc=withNode(doc,{kind:'end-cap',frame:0,member:0,end:'start',fit:'inset',thickness:4,suppressed:true});doc.frames!.welds=[{joint:'b1.seam',kind:'fillet',size:2}];assert.equal(beadsOf(doc).length,1,'plate reference is reachable before explicit suppression filtering');}
  const before=structuredClone(doc);assert.equal(drawingRevisionPrint(doc),modelPrint(doc.nodes),mode);assert.deepEqual(doc,before);
 }
});

test('old weld-backed stamps remain stored until explicit reissue and are stable through native roundtrip',async()=>{
 const {modelPrint,defaultDrawing}=await import('@barocss/cad-model/drawing/types');
 const {encodeStudioFile,readStudioFile}=await import('@barocss/cad-model/engine/container');
 const doc:StudioDoc={...frame(),frames:{version:1,welds:[{joint:'b0_part1.end',size:2}]}};
 const legacy=modelPrint(doc.nodes);doc.drawing={...defaultDrawing(),revision:'A',revisedModel:legacy};
 const before=structuredClone(doc),stamp=drawingRevisionPrint(doc);assert.notEqual(stamp,legacy);assert.deepEqual(doc,before);
 const opened=await readStudioFile(encodeStudioFile(doc));assert.ok('doc'in opened);assert.equal(opened.doc.drawing!.revisedModel,legacy);assert.equal(drawingRevisionPrint(opened.doc),stamp);
 const e=evaluateDoc(doc,1);assert.ok(e.ok);assert.equal(drawingRevisionPrint(doc),stamp,'evaluation caches cannot change the stamp');
});
