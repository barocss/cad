import assert from 'node:assert/strict';
import test from 'node:test';
import { starterDoc } from '../src/engine/doc';
import { drawingInputs } from '../src/chat/drawing';
import { defaultDrawing } from '../src/drawing/types';
import { forSheet, mergeSheet } from '../src/drawing/sheets';
import { issueContext, drawingIssues } from '../src/drawing/issues';
import { toleranceSuggestions, applySuggestion, acceptAll } from '../src/drawing/tolerance';
import { autoLayout } from '../src/drawing/layout';
import { checkDatumOptions } from '../src/drawing/datums';

test('a datum on another sheet is not proposed again under the same letter',()=>{
 const input=drawingInputs({...starterDoc(),drawing:{...defaultDrawing(),tolerancing:'geometric'}});
 assert.notEqual(typeof input,'string');if(typeof input==='string')return;
 const top=toleranceSuggestions(issueContext(input)).find(x=>x.change.kind==='datum'&&x.change.datum.view==='top');
 assert.ok(top);if(top.change.kind!=='datum')return;
 const held={...top.change.datum,id:'user-top-A',letter:'A'};
 assert.deepEqual(checkDatumOptions({datums:[held]}),[]);
 const whole={...input.settings,datums:[held],sheets:[{id:'S2',views:['top']}]};
 const local=forSheet(whole,0), proposed=toleranceSuggestions(issueContext({...input,settings:local}));
 const duplicate=proposed.find(x=>x.change.kind==='datum'&&x.change.datum.letter==='A');
 if(duplicate){const merged=mergeSheet(whole,0,applySuggestion(local,duplicate));console.log('DUPLICATE_DATUM',JSON.stringify({datums:merged.datums,inputProblems:checkDatumOptions({datums:merged.datums}),issues:drawingIssues(issueContext({...input,settings:forSheet(merged,0)})).filter(i=>i.code==='DATUM_TWICE')}));}
 assert.equal(duplicate,undefined,'existing drawing-wide datum A must not be suggested again');
 assert.ok(proposed.some(x=>x.change.kind==='datum'&&x.change.datum.letter==='C'));
 const all=mergeSheet(whole,0,acceptAll({...input,settings:local}).settings);
 assert.deepEqual(all.datums?.find(d=>d.id===held.id),held);
 assert.deepEqual(checkDatumOptions({datums:all.datums}),[]);
 assert.equal(drawingIssues(issueContext({...input,settings:forSheet(all,0)})).filter(i=>i.code==='DATUM_TWICE').length,0);
 assert.deepEqual(whole.datums,[held]);
 const single=toleranceSuggestions(issueContext(input));assert.ok(single.some(x=>x.change.kind==='datum'&&x.change.datum.letter==='A'));
 const targetsOnly={...input.settings,datumTargets:[{id:'t1',letter:'A',number:1,view:'top' as const,kind:'line' as const,line:{from:[10,10] as [number,number],to:[20,10] as [number,number]},place:[0,0] as [number,number]}],sheets:whole.sheets};
 assert.ok(toleranceSuggestions(issueContext({...input,settings:forSheet(targetsOnly,0)})).some(x=>x.change.kind==='datum'&&x.change.datum.letter==='A'),'target-only behavior is unchanged');
 const ambiguous={...whole,datums:[held,{...held,id:'second-A'}]};
 const result=mergeSheet(ambiguous,0,acceptAll({...input,settings:forSheet(ambiguous,0)}).settings);
 assert.deepEqual(result.datums?.slice(0,2),ambiguous.datums);

});

test('position frames can continue naming a datum feature on another sheet',()=>{
 const input=drawingInputs({...starterDoc(),drawing:{...defaultDrawing(),tolerancing:'geometric'}});
 assert.notEqual(typeof input,'string');if(typeof input==='string')return;
 const settings=autoLayout(input).settings;
 const front=toleranceSuggestions(issueContext({...input,settings})).find(x=>x.change.kind==='datum'&&x.change.datum.letter==='A');
 assert.ok(front);if(front.change.kind!=='datum')return;
 const held={...front.change.datum,id:'existing-front-A'};
 const whole={...settings,datums:[held],sheets:[{id:'S2',views:['front']}]};
 const local=forSheet(whole,0), suggestions=toleranceSuggestions(issueContext({...input,settings:local}));
 assert.ok(!suggestions.some(x=>x.change.kind==='datum'&&x.change.datum.letter==='A'));
 const frame=suggestions.find(x=>x.change.kind==='frame');assert.ok(frame);if(frame.change.kind!=='frame')return;
 assert.ok(frame.change.frame.datums.includes('A'));
 const offered=frame.change.frame;
 const result=mergeSheet(whole,0,applySuggestion(local,frame));
 assert.deepEqual(result.datums,[held]);
 assert.ok(result.frames?.some(f=>f.dim===offered.dim&&f.datums.includes('A')));
});
