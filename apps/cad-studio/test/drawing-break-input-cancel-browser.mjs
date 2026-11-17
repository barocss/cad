import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
const {input:{document:model}}=JSON.parse(await readFile(new URL('../../../packages/barocss-cad/conformance/r14/starter-plate/case.json',import.meta.url),'utf8'));
const base={...model,drawing:{scope:{kind:'part'},sheet:'A3',projection:'third',scale:1,hidden:false,title:'Break input cancellation',views:['front','top'],breaks:[{axis:'x',from:16,to:32},{axis:'x',from:44,to:52}],dimensions:[]}};
const f=await createFlow({name:'drawing-break-input-cancel',envFrozen:'DRAWING_BREAK_INPUT_CANCEL_FROZEN',output:process.argv[2],qualification:'Escape discards pending drawing break coordinates, with explicit Enter/blur, rejection, history, native reopen and SVG checked.',initialFiles:['apps/cad-studio/test/drawing-break-input-cancel-browser.mjs','apps/cad-studio/src/ui/drawing/BreaksList.tsx'],limits:['Synthetic plate and two X-axis breaks only. No PDF/DXF, dimension precision or standards certification.']});
const button=name=>f.page.getByRole('button',{name,exact:true});
const input=name=>f.page.getByLabel(name,{exact:true});
async function drawing(){await button('Drawing').click();await f.page.locator('svg[aria-label="Drawing sheet"] g.view').first().waitFor();}
await f.run(async()=>{
 await f.newPage();await f.page.locator('input[aria-label="Model file"]').setInputFiles({name:'break-input.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(base))});await f.page.waitForFunction(()=>window.__studioDoc?.drawing?.title==='Break input cancellation');await f.ready();await drawing();const before=await f.doc();
 let count=0;
 for(const [name,value] of [['Break 1 from','18'],['Break 1 to','34'],['Break 2 from','42'],['Break 2 to','54'],['Break 1 from',''],['Break 2 to','']]){
  const control=input(name),original=await control.inputValue();await control.fill(value);await f.same(before);await control.press('Escape');
  if(count===0)await f.snapshot('01-after-escape');
  const afterEscape=await control.inputValue();if(afterEscape!==original){await control.press('Tab');await f.changed(before);f.report.observations.push({baselineEscapeKeptDraft:afterEscape,subsequentBlurBreaks:(await f.doc()).drawing.breaks});await f.snapshot('baseline-blur-after-escape');}assert.equal(afterEscape,original,`${name}: Escape restores accepted coordinate`);assert.equal(await control.evaluate(x=>x===document.activeElement),true);await control.press('Tab');await f.same(before);count++;
 }
 // Enter still commits, and cancellation has not added history entries.
 await input('Break 1 from').fill('18');await input('Break 1 from').press('Enter');await f.changed(before);const moved=await f.doc();assert.deepEqual(moved.drawing.breaks,[{axis:'x',from:18,to:32},{axis:'x',from:44,to:52}]);await f.undo();await f.same(before);await f.redo();await f.same(moved);
 // An invalid reversed or overlapping interval is rejected without changing the file.
 for(const [name,value] of [['Break 1 from','40'],['Break 1 to','45']]){await input(name).fill(value);await input(name).press('Enter');await f.same(moved);assert.equal(await input(name).inputValue(),name.endsWith('from')?'18':'32');}
 await input('Break 2 to').fill('54');await input('Break 2 to').press('Tab');await f.changed(moved);const accepted=await f.doc();assert.deepEqual(accepted.drawing.breaks,[{axis:'x',from:18,to:32},{axis:'x',from:44,to:54}]);assert.deepEqual(accepted.nodes,before.nodes);
 await f.page.waitForFunction(()=>{const b=window.__studioDrawing?.()?.boxes?.front;return b&&Math.abs(b[2]-b[0]-52)<1e-8;});
 const geometry=await f.page.evaluate(()=>window.__studioDrawing());for(const view of ['front','top'])assert.ok(Math.abs(geometry.boxes[view][2]-geometry.boxes[view][0]-52)<1e-8);f.report.observations.push({paperWidth:52,oracle:'64 - (32 - 18) - (54 - 44) + 2 * 6',breaks:geometry.breaks});
 const [download]=await Promise.all([f.page.waitForEvent('download'),button('Export SVG').click()]);const svgFile=join(f.output,'break-input.svg');await download.saveAs(svgFile);const svg=await readFile(svgFile,'utf8');assert.ok(svg.includes('<svg'));assert.ok(svg.includes('Break input cancellation'));
 await button('Model').click();const saved=await f.save('break-input-cancel');await f.freshOpen(saved.file,saved.doc,'02-native-open');await drawing();assert.deepEqual(await f.doc(),accepted);assert.equal(await input('Break 1 from').inputValue(),'18');assert.equal(await input('Break 2 to').inputValue(),'54');await f.snapshot('03-reopened');f.report.observations.push({cancelledInputs:count,enterFrom:18,blurTo:54,rejectedReversedAndOverlapping:true,undoRedo:true,nativeSaveOpen:true,svgDownloaded:true});
});
