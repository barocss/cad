import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createFlow } from './flow-helper.mjs';
const pins=['apps/cad-studio/src/ui/DrawingWorkspace.tsx','apps/cad-studio/src/ui/drawing/drawingDeletePolicy.ts','apps/cad-studio/test/fixtures/bracket.bcad'];
const f=await createFlow({name:'drawing-pending-delete',output:process.argv[2],envFrozen:'D1335_SOURCE_FROZEN',initialFiles:pins,requiredFrozen:pins,qualification:'Delete/Backspace cannot delete prior annotations during live placement; actual completion and explicit Select deletion remain undoable.',limits:['One bracket front view, datum line/linear dimension/leader note at two desktop widths; other transient states pure-tested, AT NOT_RUN.']});
const button=(name,scope=f.page)=>scope.getByRole('button',{name,exact:true});
const tools=()=>f.page.getByRole('navigation',{name:'Drawing tools',exact:true});
const hint=()=>f.page.locator('.dw-hint');
const click=async(u,v)=>{const p=await f.page.evaluate(([u,v])=>window.__studioDrawingAt('front',u,v),[u,v]);assert.ok(p);assert.ok(await f.page.evaluate(p=>!!document.elementFromPoint(p.x,p.y)?.closest('svg[aria-label="Drawing sheet"]'),p));await f.page.mouse.click(p.x,p.y);await f.page.waitForTimeout(80);};
await f.run(async()=>{
 const source=JSON.parse(await readFile(resolve(f.app,'test/fixtures/bracket.bcad'),'utf8'));
 const end=x=>({edge:'n1.side0|n1.top',at:'end',near:[x,0,6]});
 source.drawing={sheet:'A3',projection:'third',hidden:true,scale:2,views:['front','top','right'],dimensions:[{id:'width',kind:'linear',view:'front',a:end(0),b:end(30),orient:'horizontal',place:[15,13]}],notes:[{id:'keep-note',text:'KEEP NOTE',at:[80,75],leader:{view:'front',at:[15,3]}}],datumTargets:[{id:'keep-target',kind:'area',letter:'A',number:3,view:'front',area:{shape:'circle',at:[15,3],d:4},place:[-10,10]}]};
 const file=join(process.argv[2],'pending-delete.bcad');await writeFile(file,JSON.stringify(source));
 for(const width of [1024,1440])for(const key of ['Delete','Backspace'])for(const kind of ['target','linear','note']){
  f.phase=`${width}-${key}-${kind}`;await f.newPage();await f.openFile(file,2);await f.page.setViewportSize({width,height:900});await f.page.locator('.mode').getByRole('button',{name:'Drawing',exact:true}).click();await f.page.waitForFunction(()=>!!window.__studioDrawing?.());const base=await f.doc();
  const targets=f.page.locator('details[aria-label="Datum targets"]');
  const selectOld=async()=>{await button('Select',tools()).click();if(kind==='target'){if(!await targets.evaluate(e=>e.open))await targets.locator('summary').click();await targets.getByRole('button',{name:/^Target A3 ·/}).click();}else if(kind==='linear')await f.page.locator('.dw-annotation-select').filter({hasText:'KEEP NOTE'}).click();else await f.page.locator('.dw-annotation-select').filter({hasText:'horizontal · front'}).click();};
  await selectOld();assert.match(await hint().innerText(),/Del.*remove/);
  if(kind==='target'){await targets.getByLabel('Datum target kind',{exact:true}).selectOption('line');await button('Add datum target',targets).click();await click(0,6);}else if(kind==='linear'){await button('Linear dimension',tools()).click();await click(0,6);await click(30,6);}else{await button('Note',tools()).click();await click(20,3);}
  const pending=await hint().innerText();assert.doesNotMatch(pending,/Del.*remove/);assert.match(pending,kind==='target'?/other end/:kind==='linear'?/dimension goes/:/note.*text goes/);
  await f.page.keyboard.press(key);await f.same(base);assert.equal(await hint().innerText(),pending);await f.snapshot(`${width}-${key}-${kind}-protected`);
  if(kind==='target'){await click(30,6);await click(40,14);}else if(kind==='linear')await click(15,17);else await click(40,14);
  await f.changed(base);const completed=await f.doc();assert.equal(completed.drawing.datumTargets.length,kind==='target'?2:1);assert.equal(completed.drawing.dimensions.length,kind==='linear'?2:1);assert.equal(completed.drawing.notes.length,kind==='note'?2:1);
  // Leave any focused Note editor before exercising document Undo.
  await button('Select',tools()).click();await f.undo();await f.same(base);await selectOld();assert.match(await hint().innerText(),/Del.*remove/);await f.page.keyboard.press(key);await f.changed(base);const removed=await f.doc();assert.equal(kind==='target'?(removed.drawing.datumTargets??[]).length:kind==='linear'?(removed.drawing.notes??[]).length:removed.drawing.dimensions.length,0);await f.undo();await f.same(base);
  const saved=await f.save(`${width}-${key}-${kind}`);await f.freshOpen(saved.file,base,`${width}-${key}-${kind}-reopened`);f.report.observations??=[];f.report.observations.push({width,key,kind,draftPreserved:true,completion:true,explicitDeleteUndo:true});
 }
});
