import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
const baseline=process.argv.includes('--baseline');
const f=await createFlow({name:'direct-crossings-input',envFrozen:'DIRECT_CROSSINGS_INPUT_FROZEN',output:process.argv[2],initialFiles:['apps/cad-studio/test/direct-crossings-input-browser.mjs','apps/cad-studio/src/ui/DirectPanel.tsx'],qualification:baseline?'Observe blank crossing-plane input retaining the previous result and enabled Find':'Blank crossing input admission and current-source query ownership',limits:['One authored degree1 line and literal affine crossing; no new curve-kind or native geometry qualification.']});
const seed={format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nodes:[],outputs:{},nextId:0,direct:{sources:{line:'@model test { version: 0; length-unit: mm; @curve #line { type: nurbs; degree: 1; knots: [0,0,1,1]; control-points: [[0,-7,0],[14,-7,0]]; weights: [1,1]; } }'},objects:[{id:'line1',name:'Straight crossing control',source:'line',geometry:'line'}]}};
const panel=()=>f.page.getByRole('complementary',{name:'Direct geometry'});
const at=()=>panel().getByLabel('At',{exact:true});
const find=()=>panel().getByRole('button',{name:'Find crossings',exact:true});
const rows=()=>panel().getByLabel('Crossing',{exact:true});
const selection=()=>f.page.evaluate(()=>window.__studioSelection);
async function point(expected){await rows().waitFor();assert.equal(await rows().count(),1);assert.deepEqual((await rows().locator('b').innerText()).split(',').map(Number),expected);}
await f.run(async()=>{
 await f.newPage();await f.openFile({name:'crossings-input.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(seed))},0);await f.same(seed);
 await f.page.locator('.outliner .ol.direct').filter({hasText:'Straight crossing control'}).click();const picked=await selection();
 await panel().getByLabel('Crossing plane').selectOption('x');await at().fill('7');await at().press('Tab');await find().click();await point([7,-7,0]);await f.same(seed);assert.deepEqual(await selection(),picked);
 await at().fill('');await at().press('Tab');assert.equal(await at().inputValue(),'');
 if(baseline){assert.equal(await find().isEnabled(),true);await point([7,-7,0]);await find().click();await point([7,-7,0]);}
 else{assert.equal(await find().isDisabled(),true);assert.equal(await rows().count(),0);}
 await find().scrollIntoViewIfNeeded();await f.snapshot('01-blank-at');await f.same(seed);assert.deepEqual(await selection(),picked);
 f.report.observations.push({baseline,blank:true,findEnabled:await find().isEnabled(),crossingRows:await rows().count(),docAndSelectionExact:true});
 if(!baseline){
  await at().fill('8');await at().press('Tab');assert.equal(await rows().count(),0);await find().click();await point([8,-7,0]);await f.same(seed);assert.deepEqual(await selection(),picked);await f.snapshot('02-explicit-eight');
  for(const [name,value] of [['ΔX','0'],['ΔY','0'],['ΔZ','10']]){const input=panel().getByLabel(name,{exact:true});await input.fill(value);await input.press('Tab');}
  await panel().getByRole('button',{name:'Move',exact:true}).click();await f.changed(seed);assert.equal(await rows().count(),0);await f.undo();await f.same(seed);assert.equal(await rows().count(),0);await find().click();await point([8,-7,0]);await f.same(seed);await f.snapshot('03-undo-explicit-refind');
 }
});
