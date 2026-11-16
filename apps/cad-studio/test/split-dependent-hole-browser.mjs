import assert from 'node:assert/strict';
import {createFlow} from './flow-helper.mjs';
const f=await createFlow({name:'split-dependent-hole',output:process.argv[2],envFrozen:'SPLIT_HOLE_FROZEN',initialFiles:['apps/cad-studio/test/split-dependent-hole-browser.mjs','apps/cad-studio/src/app/failedFeature.ts','apps/cad-studio/src/state/historyFeatureApply.ts'],qualification:'Split History keeps a downstream Hole refusal and offers recovery in the active Split editor.'});
const doc={format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nodes:[{kind:'sketch',id:'n0',profile:'rectangle',min:[0,0],max:[40,30]},{kind:'extrude',id:'n1',sketch:0,height:10},{kind:'split',id:'n2',parent:{node:1,side:'solid'},axis:'x',normal:[2,2,0],at:70},{kind:'hole',id:'n3',parent:{node:2,side:'negative'},axis:'z',side:'max',center:[10,10],radius:2,depth:4}],outputs:{b2_positive:{node:2,side:'positive'},b3:{node:3,side:'solid'}},nextId:4};
const button=(name,scope=f.page)=>scope.getByRole('button',{name,exact:true});
await f.run(async()=>{
 await f.newPage();await f.page.locator('input[aria-label="Model file"]').setInputFiles({name:'split-hole.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))});await f.same(doc);
 await f.openFeatureEditor(2);await f.editor().getByLabel('At',{exact:true}).fill('40');const accepted=(await f.applyEditor(doc,'half-hole-accepted')).doc;
 const bodies=(await f.bodies()).bodies;assert.ok(Math.abs(bodies.find(b=>b.key==='b3').volume-(2000-8*Math.PI))<1e-6);
 await f.openFeatureEditor(2);await f.editor().getByLabel('At',{exact:true}).fill('30');await button('Apply',f.editor()).click();await f.editor().getByText(/Restore the previous Split At or Normal/).waitFor();await f.same(accepted);assert.match(await f.editor().innerText(),/Hole.*n3/);assert.match(await f.editor().innerText(),/hole misses the body/i);await f.snapshot('split-dependent-hole-refusal');
 await button('Reset',f.editor()).click();assert.equal(await f.editor().getByLabel('At',{exact:true}).inputValue(),'40');assert.equal(await f.editor().getByText(/Restore the previous Split At or Normal/).count(),0);await f.closeEditor();await f.undo();await f.same(doc);await f.redo();await f.same(accepted);assert.deepEqual(f.report.downloads,[]);
});
