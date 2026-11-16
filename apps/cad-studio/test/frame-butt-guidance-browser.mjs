import assert from 'node:assert/strict';
import {createFlow} from './flow-helper.mjs';
const f=await createFlow({name:'frame-butt-guidance',output:process.argv[2],envFrozen:'FRAME_BUTT_FROZEN',initialFiles:['apps/cad-studio/test/frame-butt-guidance-browser.mjs'],qualification:'Round tube T Butt refusal identifies the connection and offers Cope without changing geometry on refusal.',limits:['Straight round-tube T only; no new kernel capability or manufacturing claim. No physical downloads.']});
const source={format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nodes:[],outputs:{},nextId:0};
const hud=()=>f.page.locator('.hud'),field=name=>hud().getByLabel(name,{exact:true});
async function ready(){await f.page.waitForFunction(()=>[...document.querySelectorAll('.hud button')].some(b=>b.textContent.trim()==='Apply'&&!b.disabled),null,{timeout:30000});}
await f.run(async()=>{
 await f.newPage();await f.page.locator('input[aria-label="Model file"]').setInputFiles({name:'frame-butt.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(source))});await f.same(source);await f.command('Frame');await hud().waitFor();
 await field('Skeleton').selectOption('tee');await field('Section').selectOption('round-tube');await field('Width (X)').fill('120');await field('Depth (Y)').fill('80');await field('Diameter').fill('20');await field('Wall').fill('2');
 await f.page.waitForFunction(()=>document.querySelector('.hud .status')?.textContent?.includes('refused'),null,{timeout:30000});assert.equal(await hud().getByRole('button',{name:'Apply',exact:true}).isDisabled(),true);await f.same(source);
 const notice=hud().locator('.hud-error');assert.match(await notice.innerText(),/Cope/i);assert.match(await notice.innerText(),/member|point/i);await f.snapshot('01-butt-guidance');
 await field('T-joints').selectOption('cope');await ready();await hud().getByRole('button',{name:'Apply',exact:true}).click();await f.changed(source);await hud().waitFor({state:'hidden'});const made=await f.doc();assert.equal(made.nodes[0].corners.tee,'cope');assert.equal((await f.bodies()).bodies.length,2);await f.snapshot('02-cope-recovery');
 await f.openFeatureEditor(0);await f.editor().getByLabel('T-joints',{exact:true}).selectOption('butt');await f.editor().getByRole('button',{name:'Apply',exact:true}).click();await f.editor().locator('.hud-error').waitFor();assert.match(await f.editor().locator('.hud-error').innerText(),/Cope/i);await f.same(made);await f.snapshot('03-history-guidance');await f.closeEditor();await f.same(made);
 await f.undo();await f.same(source);await f.redo();await f.same(made);await f.page.getByRole('button',{name:'New part',exact:true}).click();await f.ready();await f.page.locator('input[aria-label="Model file"]').setInputFiles({name:'frame-cope.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(made))});await f.same(made);assert.equal((await f.bodies()).bodies.length,2);assert.deepEqual(f.report.downloads,[]);
});
