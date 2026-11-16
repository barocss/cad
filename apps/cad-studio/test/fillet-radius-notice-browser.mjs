import assert from 'node:assert/strict';
import {createFlow} from './flow-helper.mjs';
const pins=['apps/cad-studio/src/ui/Hud.tsx','apps/cad-studio/src/app/filletRadiusNotice.ts'];
const f=await createFlow({name:'fillet-radius-notice',output:process.argv[2],envFrozen:'FILLET_RADIUS_NOTICE_FROZEN',initialFiles:pins,requiredFrozen:pins,qualification:'Single constant Fillet radius and invalid-field guidance occur once without losing tangent scope.',limits:['Stadium/slot extrusion at two desktop widths; no independent edge-radius groups.'],inspectorSource:`import {readFileSync} from 'node:fs';import {partBreps} from '@barocss/cad-model/engine/evaluate';import {checkBrep} from '@barocss/cad';const doc=JSON.parse(readFileSync(process.argv[2],'utf8'));console.log(JSON.stringify(partBreps(doc).map(b=>checkBrep(b.brep,{strict:true}))));`});
const seed={format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nodes:[{id:'n0',kind:'sketch',profile:'loop',segments:[{kind:'line',start:[0,-4]},{kind:'arc',start:[20,-4],center:[20,0],direction:'ccw'},{kind:'line',start:[20,4]},{kind:'arc',start:[0,4],center:[0,0],direction:'ccw'}]},{id:'n1',kind:'extrude',sketch:0,height:6}],outputs:{b1:{node:1,side:'solid'}},nextId:2};
const button=(name,s=f.page)=>s.getByRole('button',{name,exact:true});
await f.run(async()=>{for(const width of [1024,1440]){
 await f.newPage();await f.page.setViewportSize({width,height:width===1024?800:900});
 const [chooser]=await Promise.all([f.page.waitForEvent('filechooser'),button('Open').click()]);await chooser.setFiles({name:'slot.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(seed))});await f.same(seed);
 await button('Top',f.page.locator('.views')).click();if(await button('Ortho').getAttribute('aria-pressed')!=='true')await button('Ortho').click();await f.page.getByTitle('Frame all (F)',{exact:true}).click();
 const filter=button('Selection filter');for(let i=0;i<6&&!(await filter.innerText()).includes('Edges');i++)await filter.click();await f.page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 const p=await f.page.evaluate(()=>window.__studioScreenOf([10,-4,6]));await f.page.mouse.click(...p);await f.page.waitForFunction(()=>window.__studioSelection.selection.edges.length===1);await f.page.evaluate(()=>document.activeElement?.blur());await f.command('Fillet');
 const hud=f.page.getByRole('dialog',{name:'Fillet',exact:true}),radius=hud.getByLabel('Radius',{exact:true});
 await radius.fill('1.5');await hud.locator('.status.ok').waitFor();const scope=hud.getByRole('group',{name:'Fillet scope'});
 assert.match(await scope.innerText(),/Picked native edges\s+1/);assert.match(await scope.innerText(),/Tangent edges added\s+3/);assert.doesNotMatch(await scope.innerText(),/Radius/);assert.doesNotMatch(await hud.innerText(),/Greater than 0 mm/);assert.equal(await radius.getAttribute('aria-describedby'),null);await f.snapshot(`${width}-normal`);
 for(const v of ['0','-1']){
  await radius.fill(v);await hud.locator('.status').filter({hasText:/^refused$/}).waitFor();assert.equal(await radius.getAttribute('aria-invalid'),'true');assert.equal(await radius.evaluate(el=>el.checkValidity()),false);assert.equal(await button('Apply',hud).isEnabled(),false);
  const text=await hud.innerText();assert.equal((text.match(/Greater than 0 mm/g)||[]).length,1);assert.doesNotMatch(text,/Enter a valid Radius/);const id=await radius.getAttribute('aria-describedby');assert.match(await f.page.locator('#'+id).innerText(),/Greater than 0 mm/);await radius.press('Enter');await f.same(seed);
 }
 await f.snapshot(`${width}-invalid`);await radius.fill('100');await hud.locator('.status').filter({hasText:/^refused$/}).waitFor();assert.notEqual(await radius.getAttribute('aria-invalid'),'true');await hud.getByText('Kernel detail',{exact:true}).waitFor();await f.same(seed);
 await radius.fill('1.5');await hud.locator('.status.ok').waitFor();await button('Cancel',hud).click();await f.same(seed);
 f.report.observations.push({width,constant:1.5,picked:1,added:3,invalid:['0','-1'],geometryErrorPreserved:true});
}});
