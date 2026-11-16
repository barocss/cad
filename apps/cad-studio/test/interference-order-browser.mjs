import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
const files=['apps/cad-studio/src/ui/MeasurementInspector.tsx','apps/cad-studio/test/interference-order-browser.mjs'];
const f=await createFlow({name:'interference-order',output:process.argv[2],envFrozen:'INTERFERENCE_ORDER_FROZEN',initialFiles:files,requiredFrozen:files,
 qualification:'Actual native three-box Interference ordering, keyboard pair activation, and new-report reset.',
 limits:['Finite unequal volumes only in actual Chrome. Ties, nonfinite values, failure rows and delayed requests belong to controlled tests, not this browser claim.']});
const doc={format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nodes:[],outputs:{},nextId:6,bodies:{b1:{name:'A'},b3:{name:'B'},b5:{name:'C'}}};
for(const [i,x] of [0,6,9].entries()){
 const n=2*i;doc.nodes.push({id:'n'+n,kind:'sketch',profile:'rectangle',min:[x,0],max:[x+10,10]},{id:'n'+(n+1),kind:'extrude',sketch:n,height:10});doc.outputs['b'+(n+1)]={node:n+1,side:'solid'};
}
const panel=()=>f.page.getByRole('complementary',{name:'Interference',exact:true});
const order=()=>panel().getByLabel('Interference order',{exact:true});
const rows=()=>panel().getByRole('button').filter({hasText:'∩'});
const selection=()=>f.page.evaluate(()=>window.__studioSelection.selection);
const pickA=()=>f.page.locator('.outliner .ol-row button.ol').filter({hasText:/^A$/}).click();
const open=async()=>{await f.page.setInputFiles('input[aria-label="Model file"]',{name:'interference-order.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))});await f.same(doc);};
const run=async()=>{await f.page.evaluate(()=>document.activeElement?.blur());await f.command('Interference');await order().waitFor();await rows().nth(2).waitFor();};
const expected={original:[['A','B',400],['A','C',100],['B','C',700]],largest:[['B','C',700],['A','B',400],['A','C',100]],smallest:[['A','C',100],['A','B',400],['B','C',700]]};
async function verify(mode){
 assert.equal(await order().inputValue(),mode);const text=await rows().allTextContents();assert.equal(text.length,3);
 for(let i=0;i<3;i++){const [a,b,v]=expected[mode][i];assert.ok(text[i].includes(`${a} ∩ ${b}`),JSON.stringify(text));assert.match(text[i],new RegExp(`\\b${v} mm³`));}
 await f.same(doc);return text;
}
await f.run(async()=>{for(const width of [1024,1440]){
 await f.newPage();await f.page.setViewportSize({width,height:900});await open();await pickA();await run();
 const before=await selection();await verify('original');
 for(const mode of ['largest','smallest','original','largest']){await order().selectOption(mode);const text=await verify(mode);assert.deepEqual(await selection(),before);f.report.observations.push({width,mode,rows:text});}
 // Enter must activate the same keyed B/C pair after moving its row.
 await rows().nth(0).focus();await f.page.keyboard.press('Enter');
 await f.page.waitForFunction(()=>JSON.stringify(window.__studioSelection.selection.bodies)==='[1,2]');
 const selected=await selection();await order().selectOption('smallest');await verify('smallest');assert.deepEqual(await selection(),selected);
 await f.snapshot(`sorted-${width}`);
 await panel().getByRole('button',{name:'Close interference',exact:true}).click();await pickA();await run();await verify('original');
 await order().selectOption('largest');await verify('largest');
 await open();await pickA();await run();await verify('original');await f.same(doc);
 await f.snapshot(`new-report-${width}`);
}assert.equal(f.report.downloads.length,0);});
