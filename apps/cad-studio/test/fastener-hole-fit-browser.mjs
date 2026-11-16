import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFlow } from './flow-helper.mjs';
const f=await createFlow({name:'fastener-hole-fit',output:process.argv[2],envFrozen:'FASTENER_FIT_FROZEN',initialFiles:['apps/cad-studio/test/fastener-hole-fit-browser.mjs'],qualification:'Reject a known too-small picked hole without losing the document; preserve compatible placement and numeric repositioning.',limits:['Test-only sample rows, no manufacturing qualification or physical download.','No persistent hole association or automatic following is claimed.']});
const rows=JSON.parse(readFileSync(new URL('../../../packages/barocss-cad-model/samples/rows/fastener-sizes.json',import.meta.url),'utf8')).rows;
const source={format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nodes:[{id:'n0',kind:'sketch',profile:'rectangle',min:[0,0],max:[64,32]},{id:'n1',kind:'extrude',sketch:0,height:8},{id:'n2',kind:'hole',parent:{node:1,side:'solid'},center:[32,16],radius:3.3}],outputs:{b2:{node:2,side:'solid'}},nextId:3,fastenerSizes:{version:1,rows}};
const hud=()=>f.page.locator('.hud');const field=name=>hud().getByLabel(name,{exact:true});const button=name=>hud().getByRole('button',{name,exact:true});
async function open(doc){await f.page.locator('input[aria-label="Model file"]').setInputFiles({name:'fastener-fit.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))});await f.same(doc);}
async function readyApply(){await f.page.waitForFunction(()=>[...document.querySelectorAll('.hud button')].some(b=>b.textContent.trim()==='Apply'&&!b.disabled),null,{timeout:30000});}
async function pickHole(){
 await f.page.evaluate(()=>document.activeElement?.blur());await f.command('Fastener');await hud().waitFor();
 let fitted=false;
 for(const p of [[28.8,16,4],[35.2,16,4],[32,12.8,4],[32,19.2,4]]){
  const xy=await f.page.evaluate(p=>window.__studioScreenOf(p),p);await f.page.mouse.move(xy[0]-3,xy[1]);await f.page.mouse.move(...xy);
  try{await f.page.waitForFunction(()=>document.querySelector('.hud [aria-label="Joint"]')?.value==='nut',null,{timeout:1500});await f.page.mouse.click(...xy);fitted=true;break;}catch{}
 }
 assert.ok(fitted,'actual hole wall picked');await readyApply();assert.equal(await field('Size').inputValue(),'M6');assert.match(await hud().innerText(),/ISO 273 medium/);
}
await f.run(async()=>{
 await f.newPage();await open(source);await f.page.getByRole('button',{name:'Iso',exact:true}).click();
 await pickHole();await field('Size').selectOption('M8');
 await hud().getByText(/too small/i).first().waitFor();await f.page.waitForFunction(()=>document.querySelector('.hud .status')?.textContent?.includes('refused'),null,{timeout:30000});
 assert.equal(await button('Apply').isDisabled(),true);await f.same(source);await f.snapshot('01-M8-refused-on-6.6');
 // Re-entering the same numeric position must not silently detach the picked-hole evidence.
 await field('Axis at X').fill('32.0');await f.page.waitForFunction(()=>document.querySelector('.hud .status')?.textContent?.includes('refused'),null,{timeout:30000});assert.equal(await button('Apply').isDisabled(),true);assert.match(await hud().innerText(),/Ø6.6/);await f.same(source);
 await field('Axis at X').fill('');assert.equal(await button('Apply').isDisabled(),true);await field('Axis at X').fill('32');await f.page.waitForFunction(()=>document.querySelector('.hud .status')?.textContent?.includes('refused'),null,{timeout:30000});assert.equal(await button('Apply').isDisabled(),true);assert.match(await hud().innerText(),/Ø6.6/);await f.same(source);
 // Explicit coordinates leave the picked-hole snapshot; no old fit evidence is asserted at X44.
 await field('Axis at X').fill('44');await readyApply();assert.doesNotMatch(await hud().innerText(),/Ø6.6/);await button('Cancel').click();await hud().waitFor({state:'hidden'});await f.same(source);
 await pickHole();await button('Apply').click();await f.changed(source);await hud().waitFor({state:'hidden'});const made=await f.doc();const values=made.nodes.at(-1).made.values;assert.equal(values.size,'M6');assert.equal(Number(values.holeD),6.6);assert.equal((await f.bodies()).bodies.length,4);await f.snapshot('02-M6-compatible-applied');
 await f.undo();await f.same(source);await f.redo();await f.same(made);await f.page.getByRole('button',{name:'New part',exact:true}).click();await f.ready();await open(made);assert.equal((await f.bodies()).bodies.length,4);await f.snapshot('03-compatible-reopened');assert.deepEqual(f.report.downloads,[]);
});
