import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createFlow} from './flow-helper.mjs';
const pins=['apps/cad-studio/src/ui/DrawingWorkspace.tsx','apps/cad-studio/src/ui/drawing/datumTargetAreaDraft.ts'];
const f=await createFlow({name:'datum-target-area-draft',output:process.argv[2],envFrozen:'DATUM_AREA_DRAFT_FROZEN',initialFiles:pins,requiredFrozen:pins,qualification:'New datum area dimensions edited after centre selection match saved document and SVG.',limits:['Bracket Front, circle and rectangle, two desktop sizes. No PDF/DXF or assistive technology claim.']});
const sheet='svg[aria-label="Drawing sheet"]',box=()=>f.page.getByLabel('Datum targets',{exact:true});
const targets=d=>d.drawing?.datumTargets??[];
async function enter(){if(!await f.page.locator(sheet).count())await f.page.click('.mode button:text-is("Drawing")');await f.page.waitForFunction(()=>!!window.__studioDrawing?.()&&!!document.querySelector('svg[aria-label="Drawing sheet"]'));}
async function click(p){const at=await f.page.evaluate(p=>window.__studioDrawingAt('front',...p),p);assert.ok(at);await f.page.mouse.click(at.x,at.y);await f.page.waitForTimeout(200);}
async function hint(){await f.page.waitForFunction(()=>/symbol/.test(document.querySelector('.dw-hint')?.textContent??''));}
async function svg(label){const [download]=await Promise.all([f.page.waitForEvent('download'),f.page.getByRole('button',{name:'Export SVG',exact:true}).click()]);const path=join(f.output,label+'.svg');await download.saveAs(path);return readFile(path,'utf8');}
await f.run(async()=>{for(const width of [1024,1440]){
 await f.newPage();await f.page.setViewportSize({width,height:900});await f.openFile(join(f.app,'test/fixtures/bracket.bcad'),2);await enter();
 await box().getByLabel('Datum target kind',{exact:true}).selectOption('area');await box().getByLabel('Datum target area shape',{exact:true}).selectOption('circle');
 const diameter=box().getByLabel('Datum target area diameter',{exact:true});await diameter.fill('4');await box().getByRole('button',{name:'Add datum target',exact:true}).click();await click([15,3]);await hint();const before=await f.doc();
 await diameter.fill('0');await click([-10,10]);await f.same(before);assert.equal(targets(await f.doc()).length,0);
 await diameter.fill('8');await hint();await click([-10,10]);await f.changed(before);const circle=await f.doc();assert.equal(targets(circle)[0].area.d,8);assert.deepEqual(targets(circle)[0].area.at,[15,3]);assert.match(await svg(`${width}-circle`),/Ø8/);await f.snapshot(`${width}-circle-8`);
 await f.undo();await f.same(before);await f.redo();await f.same(circle);
 await box().getByLabel('Datum target area shape',{exact:true}).selectOption('rect');const w=box().getByLabel('Datum target area width',{exact:true}),h=box().getByLabel('Datum target area height',{exact:true});
 await w.fill('4');await h.fill('2');await box().getByRole('button',{name:'Add datum target',exact:true}).click();await click([22,3]);await hint();await w.fill('10');await h.fill('6');await click([40,12]);await f.changed(circle);const rect=await f.doc();assert.deepEqual(targets(rect)[1].area,{shape:'rect',at:[22,3],w:10,h:6});
 const exported=await svg(`${width}-both`);assert.match(exported,/Ø8/);assert.match(exported,/10×6/);
 await f.undo();await f.same(circle);await f.redo();await f.same(rect);
 const saved=await f.save(`${width}-areas`);await f.freshOpen(saved.file,rect,`${width}-reopened`);await f.page.setViewportSize({width,height:900});await enter();const reopened=await svg(`${width}-reopened`);assert.match(reopened,/Ø8/);assert.match(reopened,/10×6/);
 // Changing the new-target draft must not resize an existing target being moved.
 await box().getByRole('button',{name:'Move symbol',exact:true}).first().click();await hint();await box().getByLabel('Datum target kind',{exact:true}).selectOption('area');await box().getByLabel('Datum target area shape',{exact:true}).selectOption('circle');await box().getByLabel('Datum target area diameter',{exact:true}).fill('12');await click([-12,12]);await f.changed(rect);const moved=await f.doc();assert.equal(targets(moved)[0].area.d,8);assert.deepEqual(targets(moved)[1],targets(rect)[1]);
 await f.undo();await f.same(rect);
 // A pending new-area edit remains cancelable without saving anything.
 await box().getByRole('button',{name:'Add datum target',exact:true}).click();await click([10,3]);await hint();await box().getByLabel('Datum target area diameter',{exact:true}).fill('9');await f.page.locator(sheet).focus();await f.page.keyboard.press('Escape');await f.same(rect);
 f.report.observations.push({width,circle:targets(rect)[0].area,rectangle:targets(rect)[1].area,savedMovePreserved:true});
}});
