import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
const pins=['packages/barocss-cad-model/src/app/editFields.ts','apps/cad-studio/test/full-round-history-browser.mjs'];
const f=await createFlow({name:'full-round-history',output:process.argv[2],envFrozen:'FULL_ROUND_HISTORY_FROZEN',initialFiles:pins,requiredFrozen:pins,qualification:'Full round Along history edits change actual volume and survive Undo/Redo and reopen.',limits:['30×12×20 box top; Chrome WebGPU.']});
const source={format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nextId:3,nodes:[{id:'n0',kind:'sketch',profile:'rectangle',min:[0,0],max:[30,12]},{id:'n1',kind:'extrude',sketch:0,height:20},{id:'n2',kind:'full-round',parent:{node:1,side:'solid'},faces:['n1.top']}],outputs:{b2:{node:2,side:'solid'}}};
async function volume(along){ const b=(await f.bodies()).bodies; assert.equal(b.length,1); const [l,w]=along==='y'?[12,30]:[30,12]; assert.ok(Math.abs(b[0].volume-(7200-l*w*w*(4-Math.PI)/8))<1e-6); }
await f.run(async()=>{
 for(const width of [1024,1440]){
  await f.newPage();await f.page.setViewportSize({width,height:900});
  await f.page.setInputFiles('input[aria-label="Model file"]',{name:'full-round.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(source))});await f.ready();await f.same(source);await volume('x');
  await f.openFeatureEditor(2);const along=f.editor().getByLabel('Along',{exact:true});assert.equal(await along.inputValue(),'auto');
  await along.selectOption('y');await f.same(source);const changed=await f.applyEditor(source,'along-y-'+width);assert.equal(changed.doc.nodes[2].along,'y');await volume('y');await f.snapshot('y-'+width);
  await f.undo();await f.same(source);await volume('x');await f.redo();await f.same(changed.doc);await volume('y');
  const saved=await f.save('full-round-'+width);await f.freshOpen(saved.file,changed.doc,'reopened-'+width);await volume('y');
  await f.openFeatureEditor(2);await f.editor().getByLabel('Along',{exact:true}).selectOption('auto');await f.applyEditor(changed.doc,'auto-'+width);await f.same(source);await volume('x');
 }
});
