import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
const {input:{document:model}}=JSON.parse(await readFile(new URL('../../../packages/barocss-cad/conformance/r14/starter-plate/case.json',import.meta.url),'utf8'));
const sections=[{id:'A',view:'front',at:10},{id:'B',view:'top',at:-4,half:{line:'vertical',at:32,cut:'after'}},{id:'C',view:'front',at:12,steps:[{past:20,at:12},{past:40,at:16}]}];
const base={...model,drawing:{scope:{kind:'part'},sheet:'A3',projection:'third',scale:1,hidden:false,title:'Section input cancellation',views:['front','top'],sections,dimensions:[]}};
const f=await createFlow({name:'drawing-section-input-cancel',envFrozen:'DRAWING_SECTION_INPUT_CANCEL_FROZEN',output:process.argv[2],qualification:'Escape cancels pending full/half/offset section coordinates before any later blur; explicit Enter and blur retain accepted cut editing.',initialFiles:['apps/cad-studio/test/drawing-section-input-cancel-browser.mjs','apps/cad-studio/src/ui/drawing/SheetSettings.tsx','apps/cad-studio/src/ui/drawing/SectionKind.tsx'],limits:['Principal full/half/offset sections on one synthetic plate. No aligned sections, assembly cut references, PDF/DXF or standards certification.']});
const button=name=>f.page.getByRole('button',{name,exact:true});
const input=name=>f.page.getByLabel(name,{exact:true});
async function drawing(){await button('Drawing').click();await f.page.locator('svg[aria-label="Drawing sheet"] g.view').first().waitFor();}
await f.run(async()=>{
 await f.newPage();await f.page.locator('input[aria-label="Model file"]').setInputFiles({name:'section-input.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(base))});await f.page.waitForFunction(()=>window.__studioDoc?.drawing?.title==='Section input cancellation');await f.ready();await drawing();const before=await f.doc();
 let count=0;
 for(const [name,value] of [['Section Y','13'],['Section B at','-5'],['Section B centreline at','24'],['Section C step 1 from','18'],['Section C step 1 depth','14'],['Section C step 2 from','42'],['Section C step 2 depth','18'],['Section Y',''],['Section B centreline at','']]){
  const control=input(name),original=await control.inputValue();await control.fill(value);await f.same(before);if(name==='Section Y')assert.equal(await input('Section A hatch').isDisabled(),true);await control.press('Escape');
  if(count===0)await f.snapshot('01-after-escape');
  const afterEscape=await control.inputValue();if(afterEscape!==original){await control.press('Tab');await f.changed(before);f.report.observations.push({baselineEscapeKeptDraft:afterEscape,subsequentBlurSections:(await f.doc()).drawing.sections});await f.snapshot('baseline-blur-after-escape');}assert.equal(afterEscape,original,`${name}: Escape restores accepted coordinate`);assert.equal(await control.evaluate(x=>x===document.activeElement),true);await control.press('Tab');await f.same(before);if(name==='Section Y')assert.equal(await input('Section A hatch').isDisabled(),false);count++;
 }
 await input('Section Y').fill('13');await input('Section Y').press('Enter');await f.changed(before);const moved=await f.doc();assert.equal(moved.drawing.sections.find(s=>s.id==='A').at,13);assert.deepEqual(moved.drawing.sections.slice(1),before.drawing.sections.slice(1));await f.undo();await f.same(before);await f.redo();await f.same(moved);
 await input('Section B centreline at').fill('28');await input('Section B centreline at').press('Tab');await f.changed(moved);const half=await f.doc();assert.equal(half.drawing.sections.find(s=>s.id==='B').half.at,28);
 await input('Section C step 1 depth').fill('14');await input('Section C step 1 depth').press('Enter');await f.changed(half);const accepted=await f.doc();assert.deepEqual(accepted.drawing.sections.find(s=>s.id==='C').steps,[{past:20,at:14},{past:40,at:16}]);assert.deepEqual(accepted.nodes,before.nodes);
 await f.page.waitForFunction(()=>window.__studioDrawing?.()?.sections?.find(s=>s.id==='A')?.at===13 && window.__studioDrawing().sections.length===3 && window.__studioDrawing().sections.every(s=>!s.error));
 const [download]=await Promise.all([f.page.waitForEvent('download'),button('Export SVG').click()]);const svgFile=join(f.output,'section-input.svg');await download.saveAs(svgFile);const svg=await readFile(svgFile,'utf8');assert.ok(svg.includes('SECTION A'));assert.ok(svg.includes('SECTION B'));assert.ok(svg.includes('SECTION C'));
 await button('Model').click();const saved=await f.save('section-input-cancel');await f.freshOpen(saved.file,saved.doc,'02-native-open');await drawing();assert.deepEqual(await f.doc(),accepted);assert.equal(await input('Section Y').inputValue(),'13');assert.equal(await input('Section B centreline at').inputValue(),'28');assert.equal(await input('Section C step 1 depth').inputValue(),'14');await f.snapshot('03-reopened');f.report.observations.push({cancelledInputs:count,enterSectionA:13,blurHalfCentreline:28,enterOffsetDepth:14,undoRedo:true,nativeSaveOpen:true,svgSectionLabels:['A','B','C']});
});
