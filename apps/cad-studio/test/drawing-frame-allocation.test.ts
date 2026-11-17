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
test('attached controls reserve global standalone/attached IDs and retain other-sheet frames on edit', async () => {
 const { nextAttachedFrameId } = await import('../src/ui/drawing/frameIdentity');
 const original = { ...frame('control-d1'), view: 'right' as const }, whole = { ...defaultDrawing(), frames: [original], dimensions: [{ id: 'd1', view: 'top' as const, kind: 'linear' as const, orient: 'vertical' as const, a: { edge: 'a', at: 'end' as const, near: [0, 0, 0] as [number, number, number] }, b: { edge: 'b', at: 'end' as const, near: [0, 1, 0] as [number, number, number] }, place: [0, 0] as [number, number] }], sheets: [{ id: 'S2', views: ['right'] }] };
 const local = forSheet(whole, 0), id = nextAttachedFrameId('d1', whole.frames); assert.equal(id, 'control-d1-2');
 const attached: DrawingFrame = { id: id!, dim: 'd1', characteristic: 'position', value: .1, datums: [] };
 const next = mergeSheet(whole, 0, { ...local, frames: [attached] }); assert.deepEqual(checkDrawingFrames({ frames: next.frames }, whole.frames), []); assert.equal(next.frames?.length, 2); assert.deepEqual(next.frames?.find(f => f.id === original.id), original);
 const edited = mergeSheet(next, 0, { ...forSheet(next, 0), frames: [{ ...attached, value: .3 }] }); assert.deepEqual(checkDrawingFrames({ frames: edited.frames }, next.frames), []); assert.deepEqual(edited.frames?.find(f => f.id === original.id), original);
 const collision = mergeSheet(whole, 0, { ...local, frames: [{ ...attached, id: original.id }] }); assert.ok(checkDrawingFrames({ frames: collision.frames }, whole.frames).length);
 assert.equal(nextAttachedFrameId('d1', [original, attached]), 'control-d1-3');
 assert.equal(nextAttachedFrameId('d1', Array.from({length:200},(_,i)=>frame(`f${i}`))), null);
});
