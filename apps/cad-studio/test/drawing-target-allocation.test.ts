import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultDrawing } from '@barocss/cad-model/drawing/types';
import { forSheet, mergeSheet } from '@barocss/cad-model/drawing/sheets';
import { datumTargetConflicts, type DrawingDatumTarget } from '@barocss/cad-model/drawing/datumTargets';
import { nextDatumTargetIdentity } from '../src/ui/drawing/datumTargetIdentity';
const target=(id:string,number:number,letter='A'): DrawingDatumTarget => ({id,letter,number,view:'front',place:[0,0],kind:'area',area:{shape:'circle',at:[10,3],d:2}});
test('target ID and letter-number reservation spans every sheet, not just visible rows',()=>{
 const a=target('target-1',1),whole={...defaultDrawing(),datumTargets:[a],sheets:[{id:'S2',views:['right']}]};const local=forSheet(whole,1);assert.equal(local.datumTargets,undefined);
 const identity=nextDatumTargetIdentity(whole.datumTargets);assert.deepEqual(identity,{id:'target-2',letter:'A',number:2});const b={...target(identity!.id,identity!.number),view:'right' as const};
 const merged=mergeSheet(whole,1,{...local,datumTargets:[b]});assert.deepEqual(merged.datumTargets,[a,b]);assert.equal(datumTargetConflicts(merged.datumTargets!).size,0);assert.deepEqual(forSheet(merged,0).datumTargets,[a]);
});
test('IDs and labels are independent; legacy targets and arbitrary letter IDs stay reserved',()=>{
 const rows=[target('target-1',2),target('target-3',1,'B'),target('target-2',150)];assert.deepEqual(nextDatumTargetIdentity(rows),{id:'target-4',letter:'A',number:1});assert.deepEqual(nextDatumTargetIdentity(),{id:'target-1',letter:'A',number:1});
});
test('all A1–A99 numbers or 200 rows refuse new allocation, and a free number is reused without changing old rows',()=>{
 const full=Array.from({length:99},(_,k)=>target(`target-${k+1}`,k+1));assert.equal(nextDatumTargetIdentity(full),null);const before=JSON.stringify(full);assert.deepEqual(nextDatumTargetIdentity(full.filter(t=>t.number!==50)),{id:'target-50',letter:'A',number:50});assert.equal(JSON.stringify(full),before);
 assert.equal(nextDatumTargetIdentity(Array.from({length:200},(_,k)=>target(`legacy-${k}`,k+100))),null);
});
