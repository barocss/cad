import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
const f = await createFlow({ name: 'body-selection-query-identity', output: process.argv[2], envFrozen: 'BODY_QUERY_IDENTITY_FROZEN', initialFiles: ['apps/cad-studio/test/body-selection-query-identity-browser.mjs'], qualification: 'Current property selection across material changes, body deletion and delayed real evaluation replies.', limits: ['Desktop WebGPU. Real reply payloads are not modified; all replies from the held Worker are released FIFO to preserve mesh delta protocol.', 'No artificial same-Worker reverse delivery, real IME or browser crash injection.'] });
const manifest = [
  { key: 'b1', name: 'Plate', material: 'steel' },
  { key: 'b3', name: 'Plate', material: 'steel' },
  { key: 'b5', name: 'Plate', material: 'abs' },
  { key: 'b7', name: 'Bolt', material: 'steel' },
  { key: 'b9', name: 'Plate', material: 'steel', hidden: true },
  { key: 'b11', name: '[Plate]' },
];
const base = { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nodes: [], outputs: {}, nextId: 12, bodies: {} };
for (const [i, body] of manifest.entries()) {
  const x = i * 14, sketch = i * 2;
  base.nodes.push({ kind: 'sketch', id: `n${sketch}`, profile: 'rectangle', min: [x, 0], max: [x + 10, 8] },
    { kind: 'extrude', id: `n${sketch + 1}`, sketch, height: 6 });
  base.outputs[body.key] = { node: sketch + 1, side: 'solid' };
  base.bodies[body.key] = { name: body.name, ...(body.material ? { material: body.material } : {}), ...(body.hidden ? { hidden: true } : {}) };
}
function holdEvaluation() {
  const proto=Worker.prototype,post=proto.postMessage,descriptor=Object.getOwnPropertyDescriptor(proto,'onmessage');
  let armed=false,target=null,held=null; const callbacks=[];
  proto.postMessage=function(request,...args){if(armed && request?.type==='evaluate'){armed=false;target={worker:this,id:request.id,revision:request.revision};}return post.call(this,request,...args);};
  Object.defineProperty(proto,'onmessage',{configurable:true,get:descriptor.get,set(cb){descriptor.set.call(this,cb&&function(event){
    if(target?.worker===this){
      if(event.data?.id===target.id && event.data.result) held={id:target.id,revision:target.revision,ok:event.data.result.ok};
      if(held){callbacks.push(()=>cb.call(this,event));return;}
    }
    cb.call(this,event);
  });}});
  window.__queryHold={arm(){assertIdle();armed=true;},read:()=>({held,queued:callbacks.length}),async release(){
    if(!held)throw Error('No real evaluation reply held');
    while(callbacks.length){callbacks.shift()();await new Promise(resolve=>setTimeout(resolve,0));}
    target=null;held=null;
  }};
  function assertIdle(){if(armed||target)throw Error('Already holding an evaluation');}
}
const button=name=>f.page.getByRole('button',{name,exact:true});
const row=key=>f.page.locator(`[data-browser-body-key="${key}"]`);
const name=()=>f.page.getByLabel('Body name contains',{exact:true});
const apply=()=>button('Select matches');
const status=()=>f.page.getByRole('status',{name:'Body query results',exact:true});
async function open(doc,label){await f.page.setInputFiles('input[aria-label="Model file"]',{name:`${label}.bcad`,mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))});await f.same(doc);}
async function query(){if(!await name().isVisible())await f.page.getByText('Select bodies by properties',{exact:true}).click();await name().fill('plate');await f.page.getByLabel('Body material',{exact:true}).selectOption('id:steel');}
async function selected(keys){await f.page.waitForFunction(keys=>{const s=window.__studioSelection.selection,b=window.__studioBodies().bodies;return JSON.stringify((s.bodies??[]).map(i=>b[i]?.key))===JSON.stringify(keys);},keys);}
async function snapshotState(){return f.page.evaluate(()=>({doc:window.__studioDoc,selection:window.__studioSelection,bodies:window.__studioBodies(),dirty:!!document.querySelector('[aria-label="Unsaved changes"]')}));}
async function stale(){assert.equal(await apply().isDisabled(),true);assert.match(await status().innerText(),/Refresh matches/);}
async function refreshSelect(keys){const before=await snapshotState();await button('Refresh matches').click();assert.deepEqual(await snapshotState(),before);await apply().click();await selected(keys);}
await f.run(async()=>{
 await f.newPage();await f.page.addInitScript(holdEvaluation);await f.page.reload();await f.ready();await open(base,'query-identity');await query();
 // Synthetic composing keys test event isolation, not an operating-system IME implementation.
 const composingBefore=await snapshotState();
 const composing=await name().evaluate(input=>{
   let bubbled=0;const listener=()=>bubbled++;window.addEventListener('keydown',listener);
   input.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:'가'}));
   for(const key of ['Enter','Escape','Delete','a','z'])input.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true,isComposing:true,ctrlKey:key==='a'||key==='z'}));
   input.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'가'}));
   window.removeEventListener('keydown',listener);return {bubbled,value:input.value};
 });
 assert.deepEqual(composing,{bubbled:0,value:'plate'});assert.deepEqual(await snapshotState(),composingBefore);
 f.report.observations.push({syntheticComposingKeysIsolated:true,realOSIME:'NOT_RUN'});

 await row('b1').click();await f.page.getByLabel('Material',{exact:true}).selectOption('abs');await f.ready();
 assert.equal((await f.doc()).bodies.b1.material,'abs');await stale();await refreshSelect(['b3']);await f.snapshot('01-material-source-refresh');
 await f.undo();await f.same(base);await stale();await refreshSelect(['b1','b3']);
 // Deleting a preceding body shifts original indices. The old query must not silently retarget.
 await row('b1').click();await row('b1').press('Delete');await f.changed(base);
 assert.equal(await row('b1').count(),0);await stale();await refreshSelect(['b3']);
 await f.snapshot('02-delete-index-shift');await f.undo();await f.same(base);await stale();await refreshSelect(['b1','b3']);
 await f.redo();await f.ready();await stale();await refreshSelect(['b3']);await f.undo();await f.same(base);
 // A real nudge evaluation is held with all later same-Worker messages FIFO.
 await query();await row('b7').click();await f.page.evaluate(()=>window.__queryHold.arm());await row('b7').press('ArrowRight');
 await f.page.waitForFunction(()=>window.__queryHold.read().held);const busyDoc=await f.doc();assert.notDeepEqual(busyDoc,base);
 assert.equal(await apply().isDisabled(),true);assert.equal(await name().isDisabled(),true);assert.match(await status().innerText(),/current model result/);
 const pending=await snapshotState();await apply().evaluate(el=>el.click());assert.deepEqual(await snapshotState(),pending);await f.snapshot('03-real-evaluation-held');
 await f.page.evaluate(()=>window.__queryHold.release());await f.ready();await stale();await refreshSelect(['b1','b3']);await f.same(busyDoc);
 // A New document overtakes another real held reply. Old reply cannot restore its selection/query.
 await row('b1').click();await f.page.evaluate(()=>window.__queryHold.arm());await row('b1').press('ArrowRight');await f.page.waitForFunction(()=>window.__queryHold.read().held);
 await button('New part').click();await f.page.waitForFunction(()=>window.__studioDoc.nodes.length===0);
 if(!await name().isVisible())await f.page.getByText('Select bodies by properties',{exact:true}).click();
 assert.equal(await name().inputValue(),'');assert.equal(await apply().isDisabled(),true);
 await f.page.evaluate(()=>window.__queryHold.release());await f.ready();assert.equal((await f.doc()).nodes.length,0);await selected([]);assert.equal(await name().inputValue(),'');assert.equal(await apply().isDisabled(),true);await f.snapshot('04-new-overtakes-old-reply');
 // Native evaluation failure, not a fabricated error. Existing last-good bodies cannot be selected.
 await open(base,'before-failure');await query();await apply().click();await selected(['b1','b3']);
 const failed=structuredClone(base);failed.nodes[1].height=0;
 await f.page.setInputFiles('input[aria-label="Model file"]',{name:'zero-height-native-failure.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(failed))});
 await f.page.waitForFunction(()=>window.__studioFresh===false && !!document.querySelector('.toast'));
 if(!await name().isVisible())await f.page.getByText('Select bodies by properties',{exact:true}).click();
 assert.equal(await apply().isDisabled(),true);assert.match(await status().innerText(),/current model result/);
 const refusal=await snapshotState();await apply().evaluate(el=>el.click());assert.deepEqual(await snapshotState(),refusal);await f.snapshot('05-native-failure-disabled');
 await open(base,'recovered');await query();await apply().click();await selected(['b1','b3']);await f.same(base);await f.snapshot('06-recovered-explicit-selection');
 f.report.observations.push({materialRefresh:true,deleteShiftUndoRedo:true,realEvaluationHold:true,FIFO:true,newOvertakesLateReply:true,nativeFailureDisabled:true});
});
