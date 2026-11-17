import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultDrawing, readDrawing } from '@barocss/cad-model/drawing/types';
import { forSheet, mergeSheet } from '@barocss/cad-model/drawing/sheets';
import { checkDrawingFrames, type DrawingFrame } from '@barocss/cad-model/drawing/controls';
import { nextStandaloneFrameId } from '../src/ui/drawing/frameIdentity';
const frame=(id:string):Extract<DrawingFrame, { place: readonly number[] }>=>({id,view:'front',place:[0,0],characteristic:'position',value:.1,datums:[]});
test('standalone frames on separate sheets survive canonical reading with unique IDs',()=>{
 const a=frame('frame-1'),whole={...defaultDrawing(),frames:[a],sheets:[{id:'S2',views:['right']}]},local=forSheet(whole,1);
 const id=nextStandaloneFrameId(whole.frames);assert.equal(id,'frame-2');const b={...frame(id!),view:'right' as const};
 const merged=mergeSheet(whole,1,{...local,frames:[b]});assert.deepEqual(checkDrawingFrames({frames:merged.frames},whole.frames),[]);assert.deepEqual(readDrawing(merged).frames,[a,b]);assert.deepEqual(forSheet(merged,0).frames,[a]);
 const duplicate=mergeSheet(whole,1,{...local,frames:[{...b,id:a.id}]});assert.ok(checkDrawingFrames({frames:duplicate.frames},whole.frames).length);
});
test('attached and standalone frames reserve IDs independently of frame count',()=>{
 const attached:DrawingFrame={id:'frame-2',dim:'d1',characteristic:'flatness',value:.2,datums:[]};const all=[frame('frame-1'),attached,frame('frame-4')],before=JSON.stringify(all);assert.equal(nextStandaloneFrameId(all),'frame-3');assert.equal(JSON.stringify(all),before);assert.equal(nextStandaloneFrameId(),'frame-1');
});
test('200 global frames refuse new allocation, while holes are reused below the bound',()=>{
 const all=Array.from({length:200},(_,i)=>frame(`frame-${i+1}`));assert.equal(nextStandaloneFrameId(all),null);assert.equal(nextStandaloneFrameId(all.filter(f=>f.id!=='frame-50')),'frame-50');
});
