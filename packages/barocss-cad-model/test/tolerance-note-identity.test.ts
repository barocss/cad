import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultDrawing,readDrawing} from '../src/drawing/types';
import {forSheet,mergeSheet} from '../src/drawing/sheets';
import {applySuggestion,type ToleranceSuggestion} from '../src/drawing/tolerance';
test('general tolerance note does not reuse another sheet note identity',()=>{
 const whole={...defaultDrawing(),sheets:[{id:'S2',name:'Top sheet',views:['top' as const]}],notes:[{id:'n1',text:'KEEP ORIGINAL',at:[20,20] as [number,number]}]},before=structuredClone(whole);
 const suggestion:ToleranceSuggestion={id:'general-note',kind:'general-note',message:'General tolerance',basis:'test',estimate:true,change:{kind:'note',text:'GENERAL TOLERANCES',at:[20,20]}};
 const local=forSheet(whole,1),next=mergeSheet(whole,1,applySuggestion(local,suggestion));
 const subsequent=mergeSheet(next,0,forSheet(next,0)); console.log(JSON.stringify({notes:next.notes,read:readDrawing(next),afterFirstSheetEdit:subsequent.notes}));
 assert.deepEqual(subsequent.notes,next.notes);assert.deepEqual(whole,before);assert.deepEqual(next.notes![0],whole.notes[0]);assert.equal(new Set(next.notes!.map(n=>n.id)).size,2);assert.equal(next.notes![1].sheet,'S2');
});

test('local and other-sheet IDs are reserved while ordinary deletion and single-sheet notes stay local',()=>{
 const whole={...defaultDrawing(),sheets:[{id:'S2',name:'Top sheet',views:['top' as const]}],notes:[{id:'n1',text:'Original',at:[20,20] as [number,number]},{id:'n2',text:'Local',at:[30,30] as [number,number],sheet:'S2'}]};
 const suggestion:ToleranceSuggestion={id:'general-note',kind:'general-note',message:'General',basis:'test',estimate:true,change:{kind:'note',text:'General',at:[40,40]}};
 const accepted=mergeSheet(whole,1,applySuggestion(forSheet(whole,1),suggestion));
 assert.deepEqual(accepted.notes!.slice(0,2),whole.notes);assert.equal(accepted.notes![2].id,'n3');assert.equal(accepted.notes![2].sheet,'S2');assert.equal(accepted.sheetContext,undefined);
 const local=forSheet(accepted,1),deleted=mergeSheet(accepted,1,{...local,notes:local.notes!.filter(n=>n.id!=='n3')});assert.deepEqual(deleted.notes,whole.notes);
 const single=applySuggestion({...defaultDrawing(),notes:[whole.notes[0]]},suggestion);assert.equal(single.notes![1].id,'n2');assert.equal(single.notes![1].sheet,undefined);
});
