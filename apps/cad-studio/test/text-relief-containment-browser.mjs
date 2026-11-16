import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createFlow } from './flow-helper.mjs';
const baseline=process.argv.includes('--baseline');
const f=await createFlow({name:'text-relief-containment',output:process.argv[2],envFrozen:'TEXT_RELIEF_CONTAINMENT_FROZEN',initialFiles:['packages/barocss-cad-model/src/engine/errors.ts','apps/cad-studio/test/text-relief-containment-browser.mjs'],qualification:'Native Text relief containment refusal is visible before opening kernel detail; actual recovery preserves accepted source.',limits:['One local ABeeZee glyph on a flat box; no font download, new native admission, manufacturing or export qualification.']});
const doc={format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nodes:[{id:'n0',kind:'sketch',profile:'rectangle',min:[0,0],max:[40,30]},{id:'n1',kind:'extrude',sketch:0,height:10}],outputs:{b1:{node:1,side:'solid'}},nextId:2};
const hud=()=>f.page.locator('.hud');const field=name=>hud().getByLabel(name,{exact:true});
const button=(name,scope=f.page)=>scope.getByRole('button',{name,exact:true});
const status=text=>hud().locator('.status').filter({hasText:new RegExp('^'+text+'$')}).waitFor();
await f.run(async()=>{for(const width of baseline?[1024]:[1024,1440]){
 await f.newPage();await f.page.setViewportSize({width,height:900});await f.openFile({name:'text-relief-base.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))},2);
 await button('Top',f.page.locator('.views')).click();if(await button('Ortho').getAttribute('aria-pressed')!=='true')await button('Ortho').click();await f.page.getByTitle('Frame all (F)',{exact:true}).click();
 const filter=button('Selection filter');for(let i=0;i<6&&!(await filter.innerText()).includes('Faces');i++)await filter.click();
 await f.worldClick([20,15,10]);await f.page.waitForFunction(()=>window.__studioSelection.selection.faces.length===1);
 await f.command('Text relief');await hud().waitFor();await field('Text').fill('A');await field('Em size').fill('10');await field('Depth').fill('2');await field('Curve tolerance').fill('0.002');
 await field('Baseline X').fill('5');await field('Baseline Y').fill('5');await field('Font file').setInputFiles(fileURLToPath(new URL('./fixtures/fonts/abeezee/ABeeZee-Regular.ttf',import.meta.url)));await status('preview');await f.same(doc);
 await field('Baseline X').fill('-100');await field('Baseline Y').fill('-100');await field('Baseline Y').blur();await status('refused');
 const visible=await hud().innerText();const title=baseline?'The kernel could not build this':'Text relief extends outside the selected face';
 await hud().getByText(title,{exact:true}).waitFor();if(!baseline){await hud().getByText("Adjust Baseline X and Baseline Y, or reduce Em size, so every text stroke stays inside the selected face's remaining material.",{exact:true}).waitFor();}
 assert.equal(await button('Apply',hud()).isDisabled(),true);await f.same(doc);await f.snapshot(`refused-${width}`);
 const details=hud().locator('details').filter({hasText:'Kernel detail'});assert.equal(await details.getAttribute('open'),null);
 await details.locator('summary').click();const detail=await details.innerText();assert.match(detail,/leaves the selected cap or target material/);f.report.observations.push({width,title,visible,detail});
 await field('Baseline X').fill('5');await field('Baseline Y').fill('5');await field('Baseline Y').blur();await status('preview');await f.same(doc);await f.snapshot(`recovered-${width}`);
 await button('Apply',hud()).click();await f.changed(doc);const applied=await f.doc();assert.equal(applied.nodes[2].kind,'text-relief');assert.deepEqual(applied.nodes[2].at,[5,5]);assert.deepEqual(applied.nodes[2].faces,['n1.top']);
 await f.undo();await f.same(doc);await f.redo();await f.same(applied);
 await f.page.locator('.history .hs[data-node-index="2"]').click();await hud().waitFor();await status('preview');await field('Baseline X').fill('-100');await field('Baseline X').blur();await status('refused');await button('Cancel',hud()).click();await f.same(applied);
}assert.equal(f.report.downloads.length,0);});
