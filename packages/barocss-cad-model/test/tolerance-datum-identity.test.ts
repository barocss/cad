import assert from 'node:assert/strict';
import test from 'node:test';
import { starterDoc } from '../src/engine/doc';
import { drawingInputs } from '../src/chat/drawing';
import { forSheet, mergeSheet } from '../src/drawing/sheets';
import { defaultDrawing, type DrawingDatum } from '../src/drawing/types';
import { issueContext } from '../src/drawing/issues';
import { toleranceSuggestions, applySuggestion, acceptAll } from '../src/drawing/tolerance';
import { checkDatumOptions } from '../src/drawing/datums';
import { encodeStudioFile, readStudioFile } from '../src/engine/container';
test('geometric datum suggestions do not duplicate an authored datum identity',async()=>{
 const base={...starterDoc(),drawing:{...defaultDrawing(),tolerancing:'geometric' as const}};
 const input=drawingInputs(base);assert.notEqual(typeof input,'string');if(typeof input==='string')return;
 const original=toleranceSuggestions(issueContext(input)).find(s=>s.kind==='datum'&&s.change.kind==='datum'&&s.change.datum.letter==='A');assert.ok(original);if(original.change.kind!=='datum')return;
 const held={...original.change.datum,letter:'Z'};
 const doc={...base,drawing:{...base.drawing,datums:[held]}};assert.deepEqual(checkDatumOptions({datums:[held]}),[]);
 const saved=await readStudioFile(encodeStudioFile(doc));assert.ok('doc' in saved);
 const nextInput=drawingInputs(saved.doc);assert.notEqual(typeof nextInput,'string');if(typeof nextInput==='string')return;
 const suggestion=toleranceSuggestions(issueContext(nextInput)).find(s=>s.kind==='datum'&&s.change.kind==='datum'&&s.change.datum.letter==='A');assert.ok(suggestion);
 const result=applySuggestion(nextInput.settings,suggestion);
 console.log('DATUM IDS',JSON.stringify(result.datums));
 assert.deepEqual(result.datums?.find(d=>d.letter==='Z'),held);
 assert.deepEqual(checkDatumOptions({datums:result.datums}),[],'accepting a suggestion must preserve unique authored datum IDs');
 const all=acceptAll(nextInput);assert.deepEqual(all.settings.datums?.find(d=>d.letter==='Z'),held);assert.deepEqual(checkDatumOptions({datums:all.settings.datums}),[]);
 const readAgain=await readStudioFile(encodeStudioFile({...doc,drawing:all.settings}));assert.ok('doc' in readAgain);assert.deepEqual(readAgain.doc.drawing?.datums,all.settings.datums);
});

test('new datum IDs reserve other sheets and do not change existing saved duplicates',()=>{
 const doc={...starterDoc(),drawing:{...defaultDrawing(),tolerancing:'geometric' as const}};
 const input=drawingInputs(doc);assert.notEqual(typeof input,'string');if(typeof input==='string')return;
 const proposal=toleranceSuggestions(issueContext(input)).find(s=>s.change.kind==='datum'&&s.change.datum.letter==='A')!;assert.equal(proposal.change.kind,'datum');if(proposal.change.kind!=='datum')return;
 for(const other of [false,true]){
  const held: DrawingDatum={...proposal.change.datum,letter:'Z',...(other?{view:'top' as const}:{})};
  const whole={...input.settings,datums:[held],sheets:[{id:'S2',name:'Top',views:['top']}]};
  const local=forSheet(whole,0),ctx=issueContext({...input,settings:local});
  const next=toleranceSuggestions(ctx).find(s=>s.change.kind==='datum'&&s.change.datum.letter==='A')!;assert.ok(next);if(next.change.kind!=='datum')return;
  assert.equal(next.change.datum.id,'datum-A-2');
  const merged=mergeSheet(whole,0,applySuggestion(local,next));assert.deepEqual(merged.datums?.find(d=>d.letter==='Z'),held);assert.deepEqual(checkDatumOptions({datums:merged.datums}),[]);assert.equal(merged.sheetContext,undefined);
 }
 const duplicate={...proposal.change.datum,letter:'Z'}, settings={...input.settings,datums:[duplicate,{...duplicate,letter:'Y'}]};
 const next=toleranceSuggestions(issueContext({...input,settings})).find(s=>s.change.kind==='datum'&&s.change.datum.letter==='A')!;
 const result=applySuggestion(settings,next);assert.deepEqual(result.datums?.slice(0,2),settings.datums);
});
