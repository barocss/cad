import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
const baseline=process.argv.includes('--baseline');
const f=await createFlow({name:'fillet-start-handle-label',output:process.argv[2],envFrozen:'FILLET_START_LABEL_FROZEN',initialFiles:['apps/cad-studio/test/fillet-start-handle-label-browser.mjs'],qualification:baseline?'Observe varying Fillet HUD/handle label mismatch through actual pointer drag':'Varying Fillet start handle label and value ownership',limits:['Single straight front-top edge only; no new geometry/topology qualification.']});
const source={format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nodes:[{id:'n0',kind:'sketch',profile:'rectangle',min:[0,0],max:[30,12]},{id:'n1',kind:'extrude',sketch:0,height:20}],outputs:{b1:{node:1,side:'solid'}},nextId:2};
const button=(name,scope=f.page)=>scope.getByRole('button',{name,exact:true});
const hud=()=>f.page.getByRole('dialog',{name:'Fillet',exact:true});
const field=name=>hud().getByLabel(name,{exact:true});
const preview=()=>f.page.waitForFunction(()=>document.querySelector('.hud .status')?.textContent?.trim()==='preview',null,{timeout:30000});
async function drag(){
 const g=f.page.locator('g.gizmo-handle[data-handle="radius"]');await g.waitFor();
 const at=await g.evaluate(n=>{const p=n.querySelector('polygon').getBoundingClientRect(),c=n.querySelector('circle').getBoundingClientRect();return {head:[p.x+p.width/2,p.y+p.height/2],root:[c.x+c.width/2,c.y+c.height/2]};});
 const d=at.head.map((v,i)=>v-at.root[i]),len=Math.hypot(...d);assert.ok(len>0);
 await f.page.mouse.move(...at.head);await f.page.mouse.down();await f.page.mouse.move(at.head[0]+d[0]/len*8,at.head[1]+d[1]/len*8,{steps:4});await f.page.mouse.up();await preview();await f.page.locator('.handle-value').waitFor();
}
await f.run(async()=>{
 await f.newPage();await f.openFile({name:'start-handle-box.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(source))},2);await f.same(source);
 await button('Top',f.page.locator('.views')).click();if(await button('Ortho').getAttribute('aria-pressed')!=='true')await button('Ortho').click();await f.page.getByTitle('Frame all (F)',{exact:true}).click();
 const filter=button('Selection filter');for(let i=0;i<6&&!(await filter.innerText()).includes('Edges');i++)await filter.click();await f.page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));const p=await f.page.evaluate(()=>window.__studioScreenOf([15,0,20]));await f.page.mouse.click(...p);await f.page.waitForFunction(()=>window.__studioSelection?.selection.edges.length===1);
 const picked=await f.page.evaluate(()=>window.__studioSelection.selection.edges);
 await f.command('Fillet');await field('Fillet radius mode').selectOption('varying');await field('Start radius').fill('1');await field('End radius (0: same)').fill('3');await preview();await drag();
 const handle=f.page.locator('.handle-value'),input=handle.locator('input');
 assert.equal(await input.getAttribute('aria-label'),baseline?'Radius':'Start radius');assert.equal(await handle.getAttribute('aria-label'),baseline?'Radius value':'Start radius value');assert.equal(await input.inputValue(),await field('Start radius').inputValue());assert.equal(await field('End radius (0: same)').inputValue(),'3');assert.deepEqual(await f.page.evaluate(()=>window.__studioSelection.selection.edges),picked);await f.same(source);
 f.report.observations.push({baseline,hudLabel:'Start radius',handleLabel:await input.getAttribute('aria-label'),start:await field('Start radius').inputValue(),end:'3',sourceExact:true});await f.snapshot('01-varying-handle-label');
 if(!baseline){
  await input.fill('2');await field('End radius (0: same)').click();await preview();assert.equal(await field('Start radius').inputValue(),'2');assert.equal(await field('End radius (0: same)').inputValue(),'3');await f.same(source);
  await drag();const dragged=Number(await field('Start radius').inputValue());assert.ok(Number.isFinite(dragged)&&dragged!==2);assert.equal(Number(await input.inputValue()),dragged);assert.equal(await field('End radius (0: same)').inputValue(),'3');assert.deepEqual(await f.page.evaluate(()=>window.__studioSelection.selection.edges),picked);await f.same(source);
  await field('Fillet radius mode').selectOption('constant');await preview();await drag();assert.equal(await input.getAttribute('aria-label'),'Radius');assert.equal(await handle.getAttribute('aria-label'),'Radius value');assert.equal(await field('End radius (0: same)').count(),0);await f.same(source);await f.snapshot('02-constant-radius');
  await field('Fillet radius mode').selectOption('varying');await preview();assert.equal(await field('End radius (0: same)').inputValue(),'3');await drag();assert.equal(await input.getAttribute('aria-label'),'Start radius');
 }
 await button('Cancel',hud()).click();await hud().waitFor({state:'hidden'});await f.same(source);assert.equal(await handle.count(),0);
 if(!baseline){
  await f.command('Fillet');await field('Fillet radius mode').selectOption('varying');await field('Start radius').fill('1');await field('End radius (0: same)').fill('3');await preview();await drag();
  await handle.locator('input').fill('2');await field('End radius (0: same)').click();await preview();await f.same(source);await f.snapshot('03-start-two-before-apply');
  await button('Apply',hud()).click();await hud().waitFor({state:'hidden'});await f.changed(source);const applied=await f.doc(),node=applied.nodes.at(-1);assert.equal(node.kind,'fillet');assert.deepEqual(node.radii.map(r=>r.radius),[2,3]);assert.deepEqual(node.edges,['n1.side0|n1.top']);assert.deepEqual(applied.nodes.slice(0,2),source.nodes);assert.deepEqual(applied.parameters,source.parameters);await f.undo();await f.same(source);await f.redo();await f.same(applied);await f.snapshot('04-applied-redo');
  f.report.observations.push({handleTypedStart:2,endPreserved:3,constantLabel:'Radius',cancelExact:true,applyUndoRedo:true});
 }
});
