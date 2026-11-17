import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFlow } from './flow-helper.mjs';
const {input:{document:model}}=JSON.parse(await readFile(new URL('../../../packages/barocss-cad/conformance/r14/starter-plate/case.json',import.meta.url),'utf8'));
const detail={id:'B',view:'top',center:[32,16],radius:6,scale:1.25,at:[310,85]};
let base={...model,drawing:{scope:{kind:'part'},sheet:'A3',projection:'third',scale:2,hidden:false,title:'Custom detail scale',views:['front','top'],details:[detail],dimensions:[]}};
const f=await createFlow({name:'detail-custom-scale',output:process.argv[2],envFrozen:'DETAIL_CUSTOM_SCALE_FROZEN',initialFiles:['apps/cad-studio/test/detail-custom-scale-browser.mjs','apps/cad-studio/src/ui/drawing/DetailsList.tsx'],qualification:'Native custom detail scale displayed faithfully rather than silently showing Auto; standard edit, history and native save/reopen.',limits:['One top-view detail, custom 1.25 scale. No arbitrary scale authoring, PDF or physical exports.']});
const button=name=>f.page.getByRole('button',{name,exact:true});
const select=()=>f.page.getByLabel('Detail B scale',{exact:true});
async function drawing(){await button('Drawing').click();await f.page.locator('svg[aria-label="Drawing sheet"] g.view').first().waitFor();}
async function check(scale){assert.equal(await select().inputValue(),String(scale));await f.page.waitForFunction(s=>window.__studioDrawing?.()?.details?.find(x=>x.id==='B')?.scale===s,scale);const d=await f.page.evaluate(()=>window.__studioDrawing().details.find(x=>x.id==='B'));assert.ok(Math.abs(d.box[2]-d.box[0]-12*scale)<1e-6);f.report.observations.push({scale,box:d.box});}
await f.run(async()=>{
 await f.newPage();await f.page.locator('input[aria-label="Model file"]').setInputFiles({name:'custom-scale.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(base))});await f.page.waitForFunction(()=>window.__studioDoc?.drawing?.title==='Custom detail scale');await f.ready();await drawing();assert.deepEqual(await f.doc(),base);base=await f.doc();await check(1.25);await f.snapshot('01-custom-scale');
 await select().selectOption('2');await f.changed(base);const edited=await f.doc();assert.deepEqual(edited.drawing.details,[{...detail,scale:2}]);assert.deepEqual(edited.nodes,base.nodes);await check(2);await f.undo();await f.same(base);await check(1.25);await f.redo();await f.same(edited);await check(2);await f.undo();await f.same(base);
 await button('Model').click();const saved=await f.save('custom-detail-scale');await f.freshOpen(saved.file,saved.doc,'02-native-open');await drawing();await check(1.25);await f.snapshot('03-reopened-custom-scale');
 await select().selectOption('auto');await f.changed(base);const automatic=await f.doc();const {scale,...rest}=detail;assert.deepEqual(automatic.drawing.details,[rest]);assert.equal(await select().inputValue(),'auto');assert.deepEqual(automatic.nodes,base.nodes);
});
