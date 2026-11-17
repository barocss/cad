import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultDrawing, type DrawingDatum } from '@barocss/cad-model/drawing/types';
import { forSheet, mergeSheet } from '@barocss/cad-model/drawing/sheets';
import { checkDatumOptions } from '@barocss/cad-model/drawing/datums';
import { nextFaceDatumIdentity } from '../src/ui/drawing/datumIdentity';
const datum=(id: string, letter: string, view: DrawingDatum['view']='top'): DrawingDatum => ({id,letter,view,face:{face:'exact-face',near:[0,0,0]},place:[0,0]});
test('a later sheet allocates against the whole drawing and preserves the first datum after merge',()=>{
 const a=datum('datum-A','A'),whole={...defaultDrawing(),datums:[a],sheets:[{id:'S2',views:['right']}]};
 const local=forSheet(whole,1);assert.equal(local.datums,undefined);
 const identity=nextFaceDatumIdentity(whole.datums);assert.deepEqual(identity,{id:'datum-B',letter:'B'});
 const b={...datum(identity!.id,identity!.letter,'right')};
 const merged=mergeSheet(whole,1,{...local,datums:[b]});assert.deepEqual(merged.datums,[a,b]);assert.deepEqual(checkDatumOptions({datums:merged.datums}),[]);
 assert.deepEqual(forSheet(merged,0).datums,[a]);assert.deepEqual(forSheet(merged,1).datums,[b]);
});
test('arbitrary IDs and unresolved references reserve their identity even on other sheets',()=>{
 const rows=[datum('datum-B','A'),datum('datum-B-2','C')];
 assert.deepEqual(nextFaceDatumIdentity(rows),{id:'datum-B-3',letter:'B'});assert.deepEqual(nextFaceDatumIdentity([]),{id:'datum-A',letter:'A'});
});
test('all allowed letters exhausted disables creation, without reusing held IDs or unsupported I O Q',()=>{
 const rows=[...'ABCDEFGHJKLMNPRSTUVWXYZ'].map(l=>datum(`datum-${l}`,l));assert.equal(nextFaceDatumIdentity(rows),null);
 assert.equal(nextFaceDatumIdentity(Array.from({length:200},(_,k)=>datum(`held-${k}`,'A'))),null);
});
