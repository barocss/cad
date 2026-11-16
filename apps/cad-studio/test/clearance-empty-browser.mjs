import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createFlow} from './flow-helper.mjs';
const pins=['apps/cad-studio/src/viewport/ClearancePanel.tsx','apps/cad-studio/test/clearance-empty-browser.mjs'];
const f=await createFlow({name:'clearance-empty',output:process.argv[2],envFrozen:'CLEARANCE_EMPTY_FROZEN',initialFiles:pins,requiredFrozen:pins,
 qualification:'Clearance empty candidate result omits unused legend and duplicate band text while preserving overlays and help.',limits:['Two Bracket instances at 0 and 30.5 mm; empty/near only in browser. Contact/refusal presentation has synthetic unit coverage.']});
const bracket=JSON.parse(await readFile(new URL('./fixtures/bracket.bcad',import.meta.url),'utf8'));
const doc={format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nodes:[],outputs:{},nextId:0,instances:[{id:'a',name:'Bracket A',doc:bracket,position:[0,0,0],rotation:[0,0,0]},{id:'b',name:'Bracket B',doc:bracket,position:[30.5,0,0],rotation:[0,0,0]}]};
const panel=()=>f.page.getByLabel('Assembly clearance',{exact:true});
const preview=name=>f.page.getByRole('radio',{name:`Preview: ${name}`,exact:true});
async function check(near){
 const input=panel().getByLabel('Near clearance (mm)');await input.fill(String(near));await input.press('Enter');
 await f.page.waitForFunction(n=>{const d=window.__studioClearance?.();return d?.stage==='ready'&&d.near===n;},near);
 const result=await f.page.evaluate(()=>{const d=window.__studioClearance();return {pairs:d.pairs,overlays:d.overlays.length};});
 const empty=near<.5;assert.equal(result.pairs.length,empty?0:1);assert.equal(result.overlays,empty?0:2);
 assert.equal(await panel().locator('.legend-chips').count(),empty?0:1);
 if(empty){assert.match(await panel().innerText(),/No candidate pairs within the current Near band/);assert.doesNotMatch(await panel().innerText(),/0.2 mm band|near or pending/);}
 else {assert.ok(Math.abs(result.pairs[0].minGap-.5)<1e-8);assert.match(await panel().innerText(),/Bracket A.*Bracket B/s);assert.match(await panel().innerText(),/mesh gap 0.5 mm/);}
 await f.same(doc);return result;
}
await f.run(async()=>{for(const width of [1024,1440]){
 await f.newPage();await f.page.setViewportSize({width,height:width===1024?800:900});
 const [chooser]=await Promise.all([f.page.waitForEvent('filechooser'),f.page.getByRole('button',{name:'Open',exact:true}).click()]);await chooser.setFiles({name:'two-brackets.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))});await f.same(doc);
 await preview('Clearance').click();const before=await check(1);await f.snapshot(`${width}-candidate`);
 await check(.2);await panel().locator('summary').focus();await panel().locator('summary').press('Enter');
 assert.equal(await panel().locator('details').getAttribute('open'),'');assert.match(await panel().innerText(),/Gaps are measured from display meshes/);assert.doesNotMatch(await panel().innerText(),/Orange:/);await f.snapshot(`${width}-empty-details`);
 const after=await check(1);assert.deepEqual(after,before);await check(.2);await check(1);
 await preview('None').click();await panel().waitFor({state:'hidden'});await f.same(doc);
 await preview('Clearance').click();await check(.2);await f.snapshot(`${width}-repeated-empty`);
 f.report.observations.push({width,before,after});
}});
