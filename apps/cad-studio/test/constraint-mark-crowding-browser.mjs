import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
const f=await createFlow({name:'constraint-mark-crowding',output:process.argv[2],envFrozen:'CONSTRAINT_CROWDING_FROZEN',initialFiles:['apps/cad-studio/test/constraint-mark-crowding-browser.mjs'],qualification:'Dense constraint symbols give explicit recoverable feedback without dropping symbols or changing the sketch.',limits:['One 20-point fixed polygon at two desktop sizes. No new solver, placement offsets, schema or export.'],
 inspectorSource:`import assert from 'node:assert/strict';import {emptyDoc,withNode} from '@barocss/cad-model/engine/doc';import{profileOf}from'@barocss/cad-model/sketch/loops';import{solveShape,type Polygon}from'@barocss/cad-model/sketch/rules';
 const points=Array.from({length:20},(_,i)=>[50+30*Math.cos(i*Math.PI/10),50+30*Math.sin(i*Math.PI/10)] as [number,number]);const shape:Polygon={kind:'polygon',closed:true,points,rules:points.slice(1).map((at,k)=>({kind:'fix',point:k+1,at:[...at]}))};assert.ok(solveShape(shape).ok);const p=profileOf([shape]);assert.ok('node'in p);console.log(JSON.stringify(withNode(emptyDoc(),p.node)));`});
const button=name=>f.page.getByRole('button',{name,exact:true});
const marks=()=>f.page.locator('.vp-overlay .cons-glyph');
const notice=()=>f.page.getByRole('status',{name:'Constraint symbol crowding',exact:true});
async function zoom(delta){const before=await f.page.evaluate(()=>window.__studioCamera().distance),b=await f.page.locator('canvas.vp-canvas').boundingBox();await f.page.mouse.move(b.x+150,b.y+b.height*.7);await f.page.mouse.wheel(0,delta);await f.page.waitForFunction(n=>window.__studioCamera().distance!==n,before);await f.page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));}

await f.run(async()=>{
 const doc=await f.inspect('fixture',{});
 for(const width of [1024,1440]){
  await f.newPage();await f.page.setViewportSize({width,height:900});await f.page.locator('input[aria-label="Model file"]').setInputFiles({name:'crowding.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))});await f.same(doc);
  await f.page.getByRole('group',{name:'History',exact:true}).getByRole('button',{name:'Sketch · outline',exact:true}).click();await f.editor().getByRole('button',{name:'Edit sketch',exact:true}).click();await f.sketchPanel().waitFor();await marks().last().waitFor();assert.equal(await marks().count(),19);
  const titles=await marks().locator('title').allTextContents(),solver=await f.sketchPanel().locator('.solver').textContent(),dirty=await f.page.getByLabel('Unsaved changes',{exact:true}).count();
  await zoom(4000);await notice().waitFor();assert.match(await notice().innerText(),/Constraints list.*All symbols are retained/);assert.deepEqual(await marks().locator('title').allTextContents(),titles);await f.same(doc);assert.equal(await f.page.getByLabel('Unsaved changes',{exact:true}).count(),dirty);assert.equal(await f.sketchPanel().locator('.solver').textContent(),solver);
  await button('Remove Fixed point 2').waitFor();await f.snapshot(`dense-${width}`);
  await button('Toggle light or dark theme').click();await notice().waitFor();await f.snapshot(`dense-light-${width}`);await button('Toggle light or dark theme').click();
  await button('Normal and fit sketch').click();assert.deepEqual(await marks().locator('title').allTextContents(),titles);await f.same(doc);
  // Fitting is not a promise of enough space. Use the existing list, then Cancel the draft edits.
  for(let point=2;point<=18;point++)await button('Remove Fixed point '+point).click();
  await notice().waitFor({state:'hidden'});assert.equal(await marks().count(),2);await f.same(doc);await f.snapshot(`list-recovered-${width}`);
  await f.page.setViewportSize({width:width===1024?1440:1024,height:900});await f.same(doc);assert.equal(await marks().count(),2);
  await f.page.evaluate(()=>document.activeElement?.blur());await f.page.keyboard.press('Escape');await f.sketchPanel().waitFor({state:'hidden'});await notice().waitFor({state:'hidden'});await f.same(doc);f.report.observations.push({width,symbols:titles.length,denseNotice:true,constraintListRecovery:true,theme:true,cancel:true,unchanged:true});
 }
 assert.deepEqual(f.report.downloads,[]);
});
