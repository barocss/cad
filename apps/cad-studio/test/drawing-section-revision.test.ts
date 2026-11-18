import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyDoc,withNode,type StudioDoc} from '@barocss/cad-model/engine/doc';
import {evaluateDoc} from '@barocss/cad-model/engine/evaluate';
import {drawingRevisionPrint} from '../src/ui/drawing/revisionPrint';
const fixture=(width:number):StudioDoc=>({...withNode(emptyDoc(),{kind:'frame',points:[[0,0,0],[0,0,100]],segments:[[0,1]],section:{kind:'library',id:'R'}}),frames:{version:1,sections:[{id:'R',name:'Tube',section:{kind:'rect-tube',width,height:40,wall:3,outerRadius:0}}]}});
test('effective Library section edits invalidate a standalone drawing issue',()=>{
 const a=fixture(40),b=fixture(80),before=structuredClone(a),ea=evaluateDoc(a,1),eb=evaluateDoc(b,1);assert.ok(ea.ok&&eb.ok);
 assert.deepEqual(a.nodes,b.nodes);assert.notEqual(ea.bodies[0].volume,eb.bodies[0].volume);
 console.log(JSON.stringify({volumes:[ea.bodies[0].volume,eb.bodies[0].volume],stamps:[drawingRevisionPrint(a),drawingRevisionPrint(b)]}));
 assert.deepEqual(a,before);assert.notEqual(drawingRevisionPrint(a),drawingRevisionPrint(b));
});

test('unused Library rows and row labels are not drawing geometry dependencies',()=>{
 const a=fixture(40),b=structuredClone(a);b.frames!.sections![0].name='Renamed';b.frames!.sections![0].source='Updated citation';b.frames!.sections!.push({id:'unused',section:{kind:'rect-tube',width:90,height:30,wall:2,outerRadius:0}});
 assert.equal(drawingRevisionPrint(a),drawingRevisionPrint(b));
});

test('referenced member override section geometry is tracked',()=>{
 const a=fixture(40),frame=a.nodes[0];assert.ok(frame.kind==='frame');frame.overrides=[{member:0,section:{kind:'library',id:'O'}}];a.frames!.sections!.push({id:'O',section:{kind:'rect-tube',width:20,height:20,wall:2,outerRadius:0}});
 const b=structuredClone(a);const row=b.frames!.sections![1].section;assert.ok(row.kind==='rect-tube');row.width=30;assert.notEqual(drawingRevisionPrint(a),drawingRevisionPrint(b));
});

test('ordinary legacy issues remain compatible; old row-backed stamps are not silently restamped', async()=>{
 const {modelPrint,defaultDrawing}=await import('@barocss/cad-model/drawing/types');
 const {encodeStudioFile,readStudioFile}=await import('@barocss/cad-model/engine/container');
 const doc=fixture(40),legacy=modelPrint(doc.nodes),stamped={...doc,drawing:{...defaultDrawing(),revision:'A',revisedModel:legacy}};
 const before=structuredClone(stamped),current=drawingRevisionPrint(stamped);assert.notEqual(current,legacy);assert.deepEqual(stamped,before);
 const opened=await readStudioFile(encodeStudioFile(stamped));assert.ok('doc' in opened);assert.equal(opened.doc.drawing!.revisedModel,legacy);assert.equal(drawingRevisionPrint(opened.doc),current);
 const inline=structuredClone(doc),n=inline.nodes[0];assert.ok(n.kind==='frame');n.section={kind:'rect-tube',width:40,height:40,wall:3,outerRadius:0};assert.equal(drawingRevisionPrint(inline),modelPrint(inline.nodes));
 const suppressed=structuredClone(doc);suppressed.nodes[0].suppressed=true;assert.equal(drawingRevisionPrint(suppressed),modelPrint(suppressed.nodes));
});

test('frame-member row dependencies are stable across dictionary property order',()=>{
 const a=fixture(40);a.nodes=[{kind:'frame-member',section:{kind:'library',id:'R'},start:[0,0,0],end:[0,0,100],up:[0,1,0]}];
 const b=structuredClone(a);b.frames!.sections![0].section={outerRadius:0,wall:3,height:40,width:40,kind:'rect-tube'};
 assert.equal(drawingRevisionPrint(a),drawingRevisionPrint(b));
 b.frames!.sections![0].section={kind:'rect-tube',width:50,height:40,wall:3,outerRadius:0};assert.notEqual(drawingRevisionPrint(a),drawingRevisionPrint(b));
});
