import assert from 'node:assert/strict';
import {createFlow} from './flow-helper.mjs';
const f=await createFlow({name:'tolerance-datum-letter',output:process.argv[2],envFrozen:'TOLERANCE_DATUM_LETTER_FROZEN',initialFiles:['packages/barocss-cad-model/src/drawing/tolerance.ts','apps/cad-studio/test/tolerance-datum-letter-browser.mjs'],qualification:'Existing other-sheet datum letters are not proposed a second time.',limits:['Datum feature letters only; no cleanup of saved ambiguous data.'],inspectorSource:`
import {starterDoc} from '@barocss/cad-model/engine/doc';import {drawingInputs} from '@barocss/cad-model/chat/drawing';import {defaultDrawing,readDrawing} from '@barocss/cad-model/drawing/types';import {issueContext} from '@barocss/cad-model/drawing/issues';import {toleranceSuggestions} from '@barocss/cad-model/drawing/tolerance';
const doc=starterDoc(),input=drawingInputs({...doc,drawing:{...defaultDrawing(),tolerancing:'geometric'}});if(typeof input==='string')throw Error(input);const top=toleranceSuggestions(issueContext(input)).find(x=>x.change.kind==='datum'&&x.change.datum.view==='top');console.log(JSON.stringify({...doc,drawing:readDrawing({...input.settings,title:'Datum letter',datums:[{...top.change.datum,id:'user-top-A',letter:'A'}],sheets:[{id:'S2',name:'Top sheet',views:['top']}]})}));
`});
const button=name=>f.page.getByRole('button',{name,exact:true});
await f.run(async()=>{
 const fixture=await f.inspect('fixture',{});await f.newPage();await f.page.getByLabel('Model file',{exact:true}).setInputFiles({name:'datums.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});await f.page.waitForFunction(()=>window.__studioDoc?.drawing?.title==='Datum letter');await f.ready();assert.deepEqual(await f.doc(),fixture);await button('Drawing').click();await f.page.locator('svg[aria-label="Drawing sheet"] g.view').first().waitFor();
 const before=await f.doc(), duplicate=f.page.getByRole('button',{name:/^Accept: Datum A:/});
 const duplicateCount=await duplicate.count();f.report.observations.push({duplicateCount});
 if(duplicateCount){await duplicate.click();await f.changed(before);f.report.observations.push({after:(await f.doc()).drawing.datums});await f.snapshot('duplicate');}
 assert.equal(duplicateCount,0,'do not offer a second definition of datum A');
 await f.snapshot('no-duplicate');
 const other=f.page.getByRole('button',{name:/^Accept: Datum C:/});await other.click();await f.changed(before);const accepted=await f.doc();assert.deepEqual(accepted.drawing.datums.find(d=>d.id==='user-top-A'),before.drawing.datums[0]);assert.equal(new Set(accepted.drawing.datums.map(d=>d.letter)).size,accepted.drawing.datums.length);await f.undo();await f.same(before);await f.redo();await f.same(accepted);
 const saved=await f.save('datums-saved');await f.freshOpen(saved.file,saved.doc,'reopened');await button('Drawing').click();await f.page.locator('svg[aria-label="Drawing sheet"] g.view').first().waitFor();await f.snapshot('final');await f.page.getByRole('tab',{name:'Top sheet',exact:true}).click();await f.page.locator('svg[aria-label="Drawing sheet"] g.view').first().waitFor();await f.snapshot('original');assert.equal(await f.page.getByRole('button',{name:/^Accept: Datum A:/}).count(),0);
});
