import assert from 'node:assert/strict';
import {createFlow} from './flow-helper.mjs';
const baseline=process.env.FILLET_SELECTION_BASELINE==='1';
const f=await createFlow({name:'fillet-interior-selection',output:process.argv[2],envFrozen:'FILLET_SELECTION_FROZEN',initialFiles:['apps/cad-studio/src/state/commandBuildFailure.ts','apps/cad-studio/test/fillet-interior-selection-browser.mjs'],qualification:'Interior Fillet multi-edge refusal points to the existing picked-edge removal, preserving radii and accepted document.'});
const doc={format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nodes:[{id:'n0',kind:'sketch',profile:'rectangle',min:[0,0],max:[40,30]},{id:'n1',kind:'extrude',sketch:0,height:10}],outputs:{b1:{node:1,side:'solid'}},nextId:2};
const button=(name,scope=f.page)=>scope.getByRole('button',{name,exact:true});
await f.run(async()=>{
 await f.newPage();await f.page.setViewportSize({width:1024,height:900});await f.page.locator('input[aria-label="Model file"]').setInputFiles({name:'selection.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))});await f.same(doc);
 await button('Top',f.page.locator('.views')).click();if(await button('Ortho').getAttribute('aria-pressed')!=='true')await button('Ortho').click();await f.page.getByTitle('Frame all (F)',{exact:true}).click();
 const filter=button('Selection filter');for(let i=0;i<6&&!(await filter.innerText()).includes('Edges');i++)await filter.click();
 await f.worldClick([20,0,10]);await f.page.waitForFunction(()=>window.__studioSelection?.selection.edges.length===1);
 await f.command('Fillet');const hud=f.page.getByRole('dialog',{name:'Fillet',exact:true});
 await hud.getByLabel('Fillet radius mode',{exact:true}).selectOption('varying');await hud.getByLabel(/^(?:Start radius|Radius)$/).fill('1.25');await hud.getByLabel('End radius (0: same)',{exact:true}).fill('2.5');await hud.getByLabel('Radius controls',{exact:true}).selectOption('two-interior');
 for(const [name,value] of [['Interior 1 radius','3'],['Interior 1 position (%)','25'],['Interior 2 radius','1'],['Interior 2 position (%)','62.5']])await hud.getByLabel(name,{exact:true}).fill(value);
 await f.page.waitForFunction(()=>document.querySelector('.hud .status')?.textContent==='preview');
 const pixel=await f.screenOf([40,15,10]);await f.page.keyboard.down('Shift');await f.page.mouse.click(...pixel);await f.page.keyboard.up('Shift');
 await hud.getByText(baseline?'An interior radius needs one original straight edge.':'2 edges are picked',{exact:false}).first().waitFor();
 await f.page.waitForTimeout(250);await f.same(doc);assert.equal(await button('Apply',hud).isDisabled(),true);
 const text=await hud.innerText();f.report.observations.push({refusal:text});if(!baseline){assert.match(text,/2 edges are picked/);assert.match(text,/open Edit picked edges/i);}
 await f.page.screenshot({path:f.output+'/01-refusal.png'});
 await hud.getByText('Edit picked edges',{exact:true}).click();await hud.getByRole('button',{name:/^Remove .*side1.*top|^Remove .*top.*side1/}).click();
 await f.page.waitForFunction(()=>document.querySelector('.hud .status')?.textContent==='preview');
 for(const [name,value] of [['Interior 1 radius','3'],['Interior 1 position (%)','25'],['Interior 2 radius','1'],['Interior 2 position (%)','62.5'],['End radius (0: same)','2.5']])assert.equal(await hud.getByLabel(name,{exact:true}).inputValue(),value);assert.equal(await hud.getByLabel(/^(?:Start radius|Radius)$/).inputValue(),'1.25');await f.same(doc);
 await button('Apply',hud).click();await f.changed(doc);const applied=await f.doc();assert.equal(applied.nodes.at(-1).kind,'fillet');assert.equal(applied.nodes.at(-1).edges.length,1);assert.equal(applied.nodes.at(-1).radii.length,4);
 await f.undo();await f.same(doc);await f.redo();await f.same(applied);await f.page.locator('input[aria-label="Model file"]').setInputFiles({name:'selection-reopen.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(applied))});await f.same(applied);await f.page.screenshot({path:f.output+'/02-recovered.png'});
 assert.equal(f.report.downloads.length,0);
});
