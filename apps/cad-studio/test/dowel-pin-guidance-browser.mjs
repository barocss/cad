import assert from 'node:assert/strict';
import {createFlow} from './flow-helper.mjs';
const f=await createFlow({name:'dowel-pin-guidance',output:process.argv[2],envFrozen:'DOWEL_PIN_FROZEN',initialFiles:['packages/barocss-cad-model/src/app/shaftCommands.ts','packages/barocss-cad-model/src/engine/bodyNotes.ts','apps/cad-studio/test/dowel-pin-guidance-browser.mjs'],qualification:'Dowel pin default length and flat-end warning match actual geometry.'});
const base={format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nodes:[{id:'n0',kind:'shaft',generator:'shaft@0',center:[0,0],steps:[{diameter:20,length:60}],holes:[{diameter:4,at:30}]}],outputs:{b0:{node:0,side:'solid'}},nextId:1};
const open=doc=>f.page.locator('input[aria-label="Model file"]').setInputFiles({name:'pin.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))});
await f.run(async()=>{
 await f.newPage();
 for(const length of [0,24]){
  await open(base);await f.same(base);await f.page.locator('.outliner .ol-row > button.ol').first().click();await f.page.evaluate(()=>document.activeElement?.blur());await f.command('Dowel pin');
  const hud=f.page.locator('.hud');await hud.getByLabel('Length (0: shaft step diameter)',{exact:true}).fill(String(length));
  await f.page.waitForFunction(()=>[...document.querySelectorAll('.hud button')].some(b=>b.textContent.trim()==='Apply'&&!b.disabled),null,{timeout:30000});
  await hud.getByRole('button',{name:'Apply',exact:true}).click();await f.changed(base);await hud.waitFor({state:'hidden'});
  const made=await f.doc();assert.equal(made.nodes.at(-1).length,length||undefined);
  const bodies=(await f.bodies()).bodies;assert.equal(bodies.length,2);assert.ok(bodies.some(b=>Math.abs(b.volume-Math.PI*4*(length||20))<1e-7));
  await f.page.locator('.outliner .ol-row > button.ol').last().click();await f.page.getByText('Flat ends are not trimmed to the curved shaft surface. Check pin protrusion before use.',{exact:true}).waitFor();await f.snapshot(`pin-length-${length}`);
  if(length===0){
   await f.openFeatureEditor(1);const editor=f.editor();assert.equal(await editor.getByLabel('Length (0: shaft step diameter)',{exact:true}).inputValue(),'0');
   await editor.getByLabel('Length (0: shaft step diameter)',{exact:true}).fill('24');const changed=await f.applyEditor(made,'history-length-24');const longer=changed.doc;assert.equal(longer.nodes[1].length,24);assert.equal(longer.nodes[1].shaft,0);assert.equal(longer.nodes[1].hole,1);assert.ok((await f.bodies()).bodies.some(b=>Math.abs(b.volume-Math.PI*4*24)<1e-7));await f.closeEditor();
   await f.undo();await f.same(made);await f.redo();await f.same(longer);
   await f.openFeatureEditor(1);await f.editor().getByLabel("Ø (0: the hole's)",{exact:true}).fill('5');await f.editor().getByRole('button',{name:'Apply',exact:true}).click();await f.editor().locator('.hud-error').waitFor();await f.same(longer);await f.snapshot('history-pin-fit-refusal');await f.closeEditor();
   await f.openFeatureEditor(1);await f.editor().getByLabel('Length (0: shaft step diameter)',{exact:true}).fill('0');const reset=await f.applyEditor(longer,'history-length-default');assert.equal(reset.doc.nodes[1].length,undefined);await f.closeEditor();await f.same(made);
  }
  if(length!==0){await f.undo();await f.same(base);await f.redo();await f.same(made);}
  await open(made);await f.same(made);await f.page.locator('.outliner .ol-row > button.ol').last().click();await f.page.getByText('Flat ends are not trimmed to the curved shaft surface. Check pin protrusion before use.',{exact:true}).waitFor();
 }
 assert.deepEqual(f.report.downloads,[]);
});
