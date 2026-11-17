import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFlow } from './flow-helper.mjs';
const {input:{document:model}}=JSON.parse(await readFile(new URL('../../../packages/barocss-cad/conformance/r14/starter-plate/case.json',import.meta.url),'utf8'));
const section={id:'A',view:'front',at:10,removed:{scale:1.25,at:[280,85]}};
let base={...model,drawing:{scope:{kind:'part'},sheet:'A3',projection:'third',scale:2,hidden:false,title:'Custom removed section scale',views:['front','top'],sections:[section],dimensions:[]}};
const f=await createFlow({name:'section-custom-scale',output:process.argv[2],envFrozen:'SECTION_CUSTOM_SCALE_FROZEN',initialFiles:['apps/cad-studio/test/section-custom-scale-browser.mjs','apps/cad-studio/src/ui/drawing/SectionKind.tsx'],qualification:'Native removed-section custom scale displayed faithfully rather than silently showing sheet inheritance; standard edit, history and native save/reopen.',limits:['One removed front section, custom 1.25 scale. No arbitrary scale authoring, PDF or physical exports.']});
const button=name=>f.page.getByRole('button',{name,exact:true});
const select=()=>f.page.getByLabel('Section A scale',{exact:true});
async function drawing(){await button('Drawing').click();await f.page.locator('svg[aria-label="Drawing sheet"] g.view').first().waitFor();}
async function check(scale){assert.equal(await select().inputValue(),String(scale));await f.page.waitForFunction(s=>window.__studioDrawing?.()?.apartSections?.find(x=>x.id==='A')?.scale===s,scale);const d=await f.page.evaluate(()=>window.__studioDrawing().apartSections.find(x=>x.id==='A'));assert.ok(Math.abs(d.box[2]-d.box[0]-64*scale)<1e-6);assert.ok(Math.abs(d.box[3]-d.box[1]-8*scale)<1e-6);f.report.observations.push({scale,box:d.box});}
await f.run(async()=>{
 await f.newPage();await f.page.locator('input[aria-label="Model file"]').setInputFiles({name:'custom-scale.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(base))});await f.page.waitForFunction(()=>window.__studioDoc?.drawing?.title==='Custom removed section scale');await f.ready();await drawing();assert.deepEqual(await f.doc(),base);base=await f.doc();await f.snapshot('00-initial-readback');await check(1.25);await f.snapshot('01-custom-scale');
 await select().selectOption('2');await f.changed(base);const edited=await f.doc();assert.deepEqual(edited.drawing.sections,[{...section,removed:{...section.removed,scale:2}}]);assert.deepEqual(edited.nodes,base.nodes);await check(2);await f.undo();await f.same(base);await check(1.25);await f.redo();await f.same(edited);await check(2);await f.undo();await f.same(base);
 await button('Model').click();const saved=await f.save('custom-section-scale');await f.freshOpen(saved.file,saved.doc,'02-native-open');await drawing();await check(1.25);await f.snapshot('03-reopened-custom-scale');
 await select().selectOption('sheet');await f.changed(base);const automatic=await f.doc();const {scale,...rest}=section.removed;assert.deepEqual(automatic.drawing.sections,[{...section,removed:rest}]);assert.equal(await select().inputValue(),'sheet');assert.deepEqual(automatic.nodes,base.nodes);
});
