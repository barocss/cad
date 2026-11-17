import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
const {input:{document:model}}=JSON.parse(await readFile(new URL('../../../packages/barocss-cad/conformance/r14/starter-plate/case.json',import.meta.url),'utf8'));
const section={id:'A',view:'front',at:10,removed:{scale:.75,at:[280,85]}};
let base={...model,drawing:{scope:{kind:'part'},sheet:'A3',projection:'third',scale:1.23456789,hidden:false,title:'Exact scale labels',views:['front','top'],sections:[section],dimensions:[]}};
const f=await createFlow({name:'drawing-scale-label',output:process.argv[2],envFrozen:'DRAWING_SCALE_LABEL_FROZEN',initialFiles:['apps/cad-studio/test/drawing-scale-label-browser.mjs','packages/barocss-cad-model/src/drawing/views.ts'],qualification:'Exact sheet and removed-section scale labels in the rendered drawing and downloaded SVG, unchanged geometry and native persistence.',limits:['One sheet at 1.23456789 and removed section at 0.75, actual SVG, native save/open. No PDF/DXF or physical-print qualification.']});
const button=name=>f.page.getByRole('button',{name,exact:true});
const select=()=>f.page.getByLabel('Section A scale',{exact:true});
async function drawing(){await button('Drawing').click();await f.page.locator('svg[aria-label="Drawing sheet"] g.view').first().waitFor();}
async function check(scale){assert.equal(await select().inputValue(),String(scale));await f.page.waitForFunction(s=>window.__studioDrawing?.()?.apartSections?.find(x=>x.id==='A')?.scale===s,scale);const d=await f.page.evaluate(()=>window.__studioDrawing().apartSections.find(x=>x.id==='A'));assert.ok(Math.abs(d.box[2]-d.box[0]-64*scale)<1e-6);assert.ok(Math.abs(d.box[3]-d.box[1]-8*scale)<1e-6);f.report.observations.push({scale,box:d.box});}
async function labels(name) {
 const text=await f.page.locator('svg[aria-label="Drawing sheet"]').textContent();
 assert.ok(text.includes('1.23456789:1'),text);assert.ok(text.includes('SECTION A–A (0.75:1)'),text);
 const [d]=await Promise.all([f.page.waitForEvent('download'),button('Export SVG').click()]);const path=join(f.output,name+'.svg');await d.saveAs(path);const svg=await readFile(path,'utf8');
 assert.ok(svg.includes('>1.23456789:1</text>'));assert.ok(svg.includes('SECTION A–A (0.75:1)'));f.report.observations.push({actualSvg:name,scaleLabels:['1.23456789:1','0.75:1']});
}
await f.run(async()=>{
 await f.newPage();await f.page.locator('input[aria-label="Model file"]').setInputFiles({name:'custom-scale.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(base))});await f.page.waitForFunction(()=>window.__studioDoc?.drawing?.title==='Exact scale labels');await f.ready();await drawing();assert.deepEqual(await f.doc(),base);base=await f.doc();await f.snapshot('00-initial-readback');await check(.75);await labels('initial');await f.snapshot('01-custom-scale');
 await select().selectOption('2');await f.changed(base);const edited=await f.doc();assert.deepEqual(edited.drawing.sections,[{...section,removed:{...section.removed,scale:2}}]);assert.deepEqual(edited.nodes,base.nodes);await check(2);await f.undo();await f.same(base);await check(.75);await f.redo();await f.same(edited);await check(2);await f.undo();await f.same(base);
 await button('Model').click();const saved=await f.save('custom-section-scale');await f.freshOpen(saved.file,saved.doc,'02-native-open');await drawing();await check(.75);await f.snapshot('03-reopened-custom-scale');await labels('reopened');
 await select().selectOption('sheet');await f.changed(base);const automatic=await f.doc();const {scale,...rest}=section.removed;assert.deepEqual(automatic.drawing.sections,[{...section,removed:rest}]);assert.equal(await select().inputValue(),'sheet');assert.deepEqual(automatic.nodes,base.nodes);
});
