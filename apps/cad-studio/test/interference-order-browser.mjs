import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
const files=['apps/cad-studio/src/ui/MeasurementInspector.tsx','apps/cad-studio/test/interference-order-browser.mjs'];
const f=await createFlow({name:'interference-order',output:process.argv[2],envFrozen:'INTERFERENCE_ORDER_FROZEN',initialFiles:files,requiredFrozen:files,
 qualification:'Actual native three-box Interference ordering, keyboard pair activation, and new-report reset.',
 limits:['Finite unequal volumes only in actual Chrome. Ties, nonfinite values and failure rows belong to controlled tests. Late delivery is harness controlled; volumes are real Worker results.']});
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
function observeWorker() {
 const NativeWorker=window.Worker; let armed=false; const held=[];
 window.__orderProbes={requests:[],arm:()=>{armed=true;},held:()=>held.length,release:()=>held.shift()()};
 window.Worker=class extends NativeWorker {
  probes=new Map();
  postMessage(request,options){window.__orderProbes.requests.push({type:request.type,id:request.id});if(request.type==='volumes'){this.probes.set(request.id,armed);armed=false;}return super.postMessage(request,options);}
  get onmessage(){return super.onmessage;}
  set onmessage(listener){super.onmessage=listener?event=>{const hold=this.probes.get(event.data?.id);this.probes.delete(event.data?.id);if(hold&&event.data?.volumes){held.push(()=>listener.call(this,event));return;}listener.call(this,event);}:null;}
 };
}
await f.run(async()=>{
 const newContext=f.browser.newContext.bind(f.browser);
 f.browser.newContext=async options=>{const ctx=await newContext(options);await ctx.addInitScript(observeWorker);return ctx;};
for(const width of [1024,1440]){
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
 }
 // Duplicate labels, a retained late real reply, and fresh native Save/Open.
 await f.newPage();await f.page.setViewportSize({width:1024,height:900});
 const duplicate={...doc,bodies:{b1:{name:'Same'},b3:{name:'Same'},b5:{name:'Same'}}};
 await f.openFile({name:'duplicate-boxes.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(duplicate))},6);
 const counts=()=>f.page.evaluate(()=>window.__orderProbes.requests);
 await run();await order().selectOption('largest');
 const pairNames=['Same (b3) ∩ Same (b5)','Same (b1) ∩ Same (b3)','Same (b1) ∩ Same (b5)'];
 const duplicateRows=await rows().allTextContents();pairNames.forEach((name,i)=>assert.ok(duplicateRows[i].includes(name)));
 await rows().nth(0).focus();await f.page.keyboard.press('Enter');
 await f.page.waitForFunction(()=>JSON.stringify(window.__studioSelection.selection.bodies)==='[1,2]');
 const selected=await selection(),before=await counts();
 for(const mode of ['smallest','original','largest']){await order().selectOption(mode);await f.page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));assert.deepEqual(await counts(),before);assert.deepEqual(await selection(),selected);await f.same(duplicate);}
 await panel().getByRole('button',{name:'Close interference',exact:true}).click();
 await f.page.evaluate(()=>window.__orderProbes.arm());await f.page.evaluate(()=>document.activeElement?.blur());await f.command('Interference');
 await f.page.waitForFunction(()=>window.__orderProbes.held()===1);assert.equal(await order().count(),0);
 await panel().getByRole('button',{name:'Close interference',exact:true}).click();
 await f.page.locator('.outliner .ol-row button.ol').filter({hasText:/^Same$/}).nth(0).click();await run();
 assert.equal(await order().inputValue(),'original');await order().selectOption('smallest');
 const completed=await rows().allTextContents(),currentRequests=await counts();
 await f.page.evaluate(()=>window.__orderProbes.release());await f.page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
 assert.equal(await order().inputValue(),'smallest');assert.deepEqual(await rows().allTextContents(),completed);assert.deepEqual(await counts(),currentRequests);await f.same(duplicate);
 await f.snapshot('duplicate-sorted-after-late-reply');
 f.report.observations.push({scope:'duplicate-and-late',duplicateRows,requestsBeforeSort:before.length,requestsAfterLateRelease:currentRequests.length,completed});
 const saved=await f.save('sorted-duplicate-native');assert.deepEqual(saved.doc,duplicate);
 await f.freshOpen(saved.file,duplicate,'fresh-saved-duplicate');await run();assert.equal(await order().inputValue(),'original');
 const reopened=await rows().allTextContents();assert.ok(reopened[0].includes('Same (b1) ∩ Same (b3)'));assert.ok(reopened[1].includes('Same (b1) ∩ Same (b5)'));assert.ok(reopened[2].includes('Same (b3) ∩ Same (b5)'));await f.same(duplicate);
 assert.equal(f.report.downloads.length,1);
});
