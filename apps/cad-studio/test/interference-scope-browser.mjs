import assert from 'node:assert/strict';
import {createFlow} from './flow-helper.mjs';
const files=['apps/cad-studio/src/app/checkInterference.ts','apps/cad-studio/src/state/useInterferenceCheck.ts','apps/cad-studio/src/ui/MeasurementInspector.tsx','apps/cad-studio/test/interference-scope-browser.mjs'];
const f=await createFlow({name:'interference-scope',output:process.argv[2],envFrozen:'INTERFERENCE_SCOPE_FROZEN',initialFiles:files,requiredFrozen:files,qualification:'Interference identifies its actual base-body scope including hidden bodies.',limits:['Three native boxes; Chrome WebGPU.']});
const doc={format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nodes:[],outputs:{},nextId:6,bodies:{b1:{name:'A'},b3:{name:'B',hidden:true},b5:{name:'C'}}};
for(const [i,x] of [0,5,30].entries()){const n=2*i;doc.nodes.push({id:'n'+n,kind:'sketch',profile:'rectangle',min:[x,0],max:[x+10,10]},{id:'n'+(n+1),kind:'extrude',sketch:n,height:10});doc.outputs['b'+(n+1)]={node:n+1,side:'solid'};}
const panel=()=>f.page.getByRole('complementary',{name:'Interference',exact:true});
const scope=()=>f.page.getByLabel('Interference check scope',{exact:true});
const pick=async(name,add=false)=>f.page.locator('.outliner .ol-row button.ol').filter({hasText:new RegExp('^'+name+'$')}).click({modifiers:add?['Shift']:[]});
const run=async()=>{await f.page.evaluate(()=>document.activeElement?.blur());await f.command('Interference');await scope().waitFor();};
await f.run(async()=>{for(const width of [1024,1440]){
 await f.newPage();await f.page.setViewportSize({width,height:900});await f.page.setInputFiles('input[aria-label="Model file"]',{name:'scope.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))});await f.same(doc);
 await pick('C');await run();assert.match(await scope().innerText(),/All base bodies · 3 bodies · 3 pairs/);assert.match(await scope().innerText(),/B · hidden \(included\)/);await panel().getByRole('button',{name:/A ∩ B/}).waitFor();
 await pick('A');await pick('C',true);assert.match(await scope().innerText(),/All base bodies/);assert.match(await scope().innerText(),/Changing selection does not rerun/);await f.snapshot('old-scope-'+width);
 await f.page.getByRole('button',{name:'Close interference',exact:true}).click();await run();assert.match(await scope().innerText(),/Selected base bodies · 2 bodies · 1 pair/);assert.equal(await scope().locator('li').count(),2);assert.doesNotMatch(await scope().innerText(),/hidden/);await panel().getByText('No bodies overlap.',{exact:true}).waitFor();await f.same(doc);await f.snapshot('selected-scope-'+width);
}});
