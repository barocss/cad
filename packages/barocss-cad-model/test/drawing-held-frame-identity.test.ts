import assert from 'node:assert/strict';
import test from 'node:test';
import {starterDoc} from '../src/engine/doc';
import {defaultDrawing} from '../src/drawing/types';
import {runDrawingTool,drawingInputs} from '../src/chat/drawing';
import {issueContext} from '../src/drawing/issues';
import {modelAnnotations} from '../src/drawing/annotations3d';
import {encodeStudioFile,readStudioFile} from '../src/engine/container';
test('auto dimension cannot take an absent dimension ID held by a saved geometric control',async()=>{
 const original={...starterDoc(),drawing:{...defaultDrawing(),frames:[{id:'held-control',dim:'d1',characteristic:'flatness' as const,value:0.25,datums:[]}]}};
 const read=await readStudioFile(encodeStudioFile(original));assert.ok('doc' in read);const doc=read.doc;
 const before=drawingInputs(doc);assert.notEqual(typeof before,'string');if(typeof before==='string')return;
 const beforeCtx=issueContext(before);assert.equal(modelAnnotations({views:before.views,layout:beforeCtx.layout,settings:before.settings,sheet:beforeCtx.sheet}).items.filter(i=>i.kind==='frame').length,0);
 const r=runDrawingTool(doc,'auto_dimension',{layout:false});assert.ok(!('error' in r));if('error' in r)return;
 const after=drawingInputs(r.doc);assert.notEqual(typeof after,'string');if(typeof after==='string')return;const ctx=issueContext(after),frames=modelAnnotations({views:after.views,layout:ctx.layout,settings:after.settings,sheet:ctx.sheet}).items.filter(i=>i.kind==='frame');
 console.log('HELD FRAME',JSON.stringify({dimensions:r.doc.drawing!.dimensions.map(d=>d.id),frames:frames.map(f=>f.id)}));
 assert.ok(!r.doc.drawing!.dimensions.some(d=>d.id==='d1'),'new dimension must not inherit the saved missing control');assert.equal(frames.length,0);assert.deepEqual(r.doc.drawing!.frames,doc.drawing!.frames);
});

import {newDimensionId} from '../src/drawing/dimensions';
import {forSheet} from '../src/drawing/sheets';
import {autoDimensions} from '../src/drawing/auto';
const held={id:'held-control',dim:'d1',characteristic:'flatness' as const,value:0.25,datums:[]};
test('manual allocation reserves missing controls, preserves prior partial callers and releases explicitly removed targets',()=>{
 assert.equal(newDimensionId([]),'d1');assert.equal(newDimensionId([], [held]),'d2');
 assert.equal(newDimensionId([], [{...held,dim:undefined,view:'front',place:[0,0]}]),'d1');
 assert.equal(newDimensionId([], []),'d1');
});
test('auto allocation reserves controls on other sheets and native settings never persist sheet context',()=>{
 const doc={...starterDoc(),drawing:{...defaultDrawing(),frames:[held],sheets:[{id:'S2',name:'Top',views:['top']}]}};
 const input=drawingInputs(doc);assert.notEqual(typeof input,'string');if(typeof input==='string')return;
 const local=forSheet(input.settings,1);assert.equal(local.frames,undefined);assert.deepEqual(local.sheetContext?.heldDimensionIds,['d1']);
 const ctx=issueContext({...input,settings:local});const made=autoDimensions(input.views,ctx.layout,local,input.callout,input.elements,input.sections,input.locationOwner);
 assert.ok(made.dimensions.length>0);assert.ok(made.dimensions.every(d=>d.id!=='d1'));
 for(const layout of [false,true]){const result=runDrawingTool(doc,'auto_dimension',{layout});assert.ok(!('error' in result));if('error' in result)continue;
  assert.ok(result.doc.drawing!.dimensions.length>0);assert.ok(result.doc.drawing!.dimensions.every(d=>d.id!=='d1'));assert.deepEqual(result.doc.drawing!.frames,[held]);assert.equal(result.doc.drawing!.sheetContext,undefined);
 }
});
test('existing valid attached controls retain their dimension and original target through auto replacement',()=>{
 const first=runDrawingTool(starterDoc(),'auto_dimension',{layout:false});assert.ok(!('error' in first));if('error' in first)return;
 const dimension=first.doc.drawing!.dimensions.find(d=>d.id==='d1')!;assert.ok(dimension);
 const source={...first.doc,drawing:{...first.doc.drawing!,frames:[held]}},before=structuredClone(source);
 const result=runDrawingTool(source,'auto_dimension',{layout:false});assert.ok(!('error' in result));if('error' in result)return;
 assert.deepEqual(result.doc.drawing!.dimensions.find(d=>d.id==='d1'),dimension);assert.deepEqual(result.doc.drawing!.frames,[held]);assert.deepEqual(source,before);
 const input=drawingInputs(result.doc);assert.notEqual(typeof input,'string');if(typeof input==='string')return;const ctx=issueContext(input);
 assert.equal(modelAnnotations({views:input.views,layout:ctx.layout,settings:input.settings,sheet:ctx.sheet}).items.filter(i=>i.kind==='frame').length,1);
});
