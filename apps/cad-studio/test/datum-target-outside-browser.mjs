import assert from 'node:assert/strict';
import {join} from 'node:path';
import {createFlow} from './flow-helper.mjs';
const pins=['apps/cad-studio/src/ui/DrawingWorkspace.tsx','apps/cad-studio/src/ui/drawing/IssuesList.tsx','apps/cad-studio/src/ui/drawing/DatumTargetsEditor.tsx'];
const f=await createFlow({name:'datum-target-outside',output:process.argv[2],envFrozen:'DATUM_OUTSIDE_FROZEN',initialFiles:pins,requiredFrozen:pins,qualification:'Outside datum warning identifies and focuses its target and describes supported geometry recovery.',limits:['Bracket Front circle, rectangle and line. Desktop keyboard, no screen reader or PDF/DXF claim.']});
const sheet='svg[aria-label="Drawing sheet"]',box=()=>f.page.getByLabel('Datum targets',{exact:true}), warning=()=>f.page.locator('[title="DATUM_TARGET_OUTSIDE"]');
const targets=d=>d.drawing?.datumTargets??[];
async function enter(){if(!await f.page.locator(sheet).count())await f.page.click('.mode button:text-is("Drawing")');await f.page.waitForFunction(()=>!!window.__studioDrawing?.()&&!!document.querySelector('svg[aria-label="Drawing sheet"]'));}
async function click(p){const at=await f.page.evaluate(p=>window.__studioDrawingAt('front',...p),p);assert.ok(at);await f.page.mouse.click(at.x,at.y);await f.page.waitForTimeout(200);}
async function selectWarning(key){await f.page.locator(sheet).focus();await f.page.keyboard.press('Escape');await f.page.evaluate(()=>{document.querySelector('details[aria-label="Datum targets"]').open=false;});const row=warning().first();assert.match(await row.innerText(),/Remove it, then Add/);assert.match(await row.innerText(),/Move symbol changes only the symbol/);if(key){await row.focus();await f.page.keyboard.press(key);}else await row.click();await f.page.waitForFunction(()=>document.activeElement?.getAttribute('data-target-id')!==null&&document.activeElement?.getAttribute('aria-pressed')==='true');assert.equal(await box().evaluate(e=>e.open),true);assert.equal(await f.page.getByLabel('Selected datum target',{exact:true}).count(),1);}
await f.run(async()=>{for(const width of [1024,1440]){
 await f.newPage();await f.page.setViewportSize({width,height:900});await f.openFile(join(f.app,'test/fixtures/bracket.bcad'),2);await enter();
 for(const [kind,shape,key] of [['area','rect',null],['area','circle','Enter'],['line',null,'Space']]){
  const before=await f.doc();await box().getByLabel('Datum target kind',{exact:true}).selectOption(kind);
  if(shape){await box().getByLabel('Datum target area shape',{exact:true}).selectOption(shape);if(shape==='rect'){await box().getByLabel('Datum target area width',{exact:true}).fill('6');await box().getByLabel('Datum target area height',{exact:true}).fill('4');}else await box().getByLabel('Datum target area diameter',{exact:true}).fill('4');}
  await box().getByRole('button',{name:'Add datum target',exact:true}).click();await click([30,0]);if(kind==='line')await click([35,3]);await click([-10,10]);await f.changed(before);const bad=await f.doc();assert.equal(targets(bad).length,1);await warning().waitFor();
  await selectWarning(key);await f.same(bad);await f.snapshot(width+'-'+(shape??kind)+'-selected');
  await box().getByRole('button',{name:'Move symbol',exact:true}).click();await click([40,14]);await f.changed(bad);const moved=await f.doc();assert.deepEqual(targets(moved)[0].area,targets(bad)[0].area);assert.deepEqual(targets(moved)[0].line,targets(bad)[0].line);await warning().waitFor();
  await f.undo();await f.same(bad);await f.redo();await f.same(moved);
  const saved=await f.save(width+'-'+(shape??kind)+'-outside');await f.freshOpen(saved.file,moved,width+'-reopened');await f.page.setViewportSize({width,height:900});await enter();await selectWarning('Enter');
  await box().getByRole('button',{name:'Remove target A1',exact:true}).click();await f.changed(moved);const removed=await f.doc();assert.equal(targets(removed).length,0);
  await f.undo();await f.same(moved);await warning().waitFor();await f.redo();await f.same(removed);
  await box().getByLabel('Datum target kind',{exact:true}).selectOption(kind);
  if(shape){await box().getByLabel('Datum target area shape',{exact:true}).selectOption(shape);if(shape==='rect'){await box().getByLabel('Datum target area width',{exact:true}).fill('6');await box().getByLabel('Datum target area height',{exact:true}).fill('4');}else await box().getByLabel('Datum target area diameter',{exact:true}).fill('4');}
  await box().getByRole('button',{name:'Add datum target',exact:true}).click();await click([25,3]);if(kind==='line')await click([20,3]);await click([-10,10]);await f.changed(removed);const fixed=await f.doc();assert.equal(targets(fixed).length,1);assert.equal(await warning().count(),0);
  await box().getByRole('button',{name:'Remove target A1',exact:true}).click();await f.changed(fixed);
  f.report.observations.push({width,kind,shape,key,selectionAndFocus:true,moveSymbolPreservesGeometry:true,recreatedInside:true});
 }
}});
