import assert from 'node:assert/strict';
import {createFlow} from './flow-helper.mjs';
const baseline=process.env.SHAPED_SCOPE_BASELINE==='1';
const f=await createFlow({name:'fillet-shaped-scope',output:process.argv[2],envFrozen:'SHAPED_SCOPE_FROZEN',initialFiles:['apps/cad-studio/src/ui/Hud.tsx','apps/cad-studio/test/fillet-shaped-scope-browser.mjs'],qualification:'Distinguish authored picks from unavailable exact tangent scope in shaped Fillet previews.'});
const doc={format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nodes:[{id:'n0',kind:'sketch',profile:'loop',sideTags:{outer:['e1','e2','e3','e4']},segments:[{kind:'line',start:[0,-4]},{kind:'arc',start:[20,-4],center:[20,0],direction:'ccw'},{kind:'line',start:[20,4]},{kind:'arc',start:[0,4],center:[0,0],direction:'ccw'}]},{id:'n1',kind:'extrude',sketch:0,height:6}],outputs:{b1:{node:1,side:'solid'}},nextId:2};
const button=(name,scope=f.page)=>scope.getByRole('button',{name,exact:true});
await f.run(async()=>{
 await f.newPage();await f.page.setViewportSize({width:1024,height:900});await f.page.locator('input[aria-label="Model file"]').setInputFiles({name:'shaped-scope.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))});await f.same(doc);
 await button('Top',f.page.locator('.views')).click();if(await button('Ortho').getAttribute('aria-pressed')!=='true')await button('Ortho').click();await f.page.getByTitle('Frame all (F)',{exact:true}).click();const filter=button('Selection filter');for(let i=0;i<6&&!(await filter.innerText()).includes('Edges');i++)await filter.click();await f.worldClick([10,-4,6]);await f.page.waitForFunction(()=>window.__studioSelection?.selection.edges.length===1);await f.command('Fillet');const hud=f.page.getByRole('dialog',{name:'Fillet',exact:true});await hud.getByLabel('Radius',{exact:true}).fill('1');
 const ready=()=>hud.locator('.status').filter({hasText:/^preview$/}).waitFor();await ready();const scope=hud.getByRole('group',{name:'Fillet scope',exact:true});assert.match(await scope.innerText(),/Picked native edges\s+1[\s\S]*Tangent edges added\s+3/);
 for(const shape of ['conic','g2']){
  await hud.getByLabel('Section',{exact:true}).selectOption(shape);await hud.getByLabel(shape==='conic'?'Rho':'Tension',{exact:true}).fill('0.4');await ready();await f.same(doc);
  assert.equal(await scope.count(),0);const text=await hud.innerText();f.report.observations.push({shape,text});
  if(baseline)assert.doesNotMatch(text,/Exact tangent scope unavailable/);else {assert.match(text,/Exact tangent scope unavailable/);assert.match(text,/source selection, not the complete fillet scope/);assert.match(text,/Selected source edges/);}
  await f.page.screenshot({path:f.output+'/'+shape+'-preview.png'});
  if(!baseline){const coefficient=hud.getByLabel(shape==='conic'?'Rho':'Tension',{exact:true});await coefficient.fill('0');await hud.locator('.status').filter({hasText:/^refused$/}).waitFor();assert.doesNotMatch(await hud.innerText(),/source selection, not the complete fillet scope/);await f.same(doc);await coefficient.fill('0.4');await ready();assert.match(await hud.innerText(),/Exact tangent scope unavailable/);}
 }
 await hud.getByLabel('Section',{exact:true}).selectOption('circular');await ready();assert.match(await scope.innerText(),/Tangent edges added\s+3/);assert.doesNotMatch(await hud.innerText(),/source selection, not the complete fillet scope/);await f.same(doc);
 await hud.getByLabel('Section',{exact:true}).selectOption('g2');await ready();await button('Apply',hud).click();await f.changed(doc);const applied=await f.doc();assert.equal(applied.nodes.at(-1).edges.length,1);assert.equal(applied.nodes.at(-1).section.kind,'g2');await f.undo();await f.same(doc);await f.redo();await f.same(applied);assert.equal(f.report.downloads.length,0);
});
