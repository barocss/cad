import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFlow } from './flow-helper.mjs';
const f=await createFlow({name:'browser-reveal-transitions',output:process.argv[2],envFrozen:'BROWSER_REVEAL_TRANSITIONS_FROZEN',
 initialFiles:['apps/cad-studio/test/browser-reveal-transitions-browser.mjs','apps/cad-studio/test/fixtures/nested-mate.bcad'],
 requiredFrozen:['apps/cad-studio/src/App.tsx','apps/cad-studio/src/app/useBodyBrowserReveal.ts'],
 qualification:'Same-task real UI transitions retire pending Browser reveal before layout-effect focus.',
 limits:['Desktop actual Studio. Events are dispatched in one task to exercise React batching; no production delay seam or synthetic Worker result.']});
const seed=JSON.parse(await readFile(new URL('./fixtures/nested-mate.bcad',import.meta.url),'utf8'));
function instrument(){
 const focus=HTMLElement.prototype.focus;
 window.__revealFocus=[];window.__revealFocusEvents=[];window.__revealFocusEvents=[];
 document.addEventListener('focusin',event=>{const key=event.target.getAttribute?.('data-browser-instance-path')??event.target.getAttribute?.('data-browser-body-key');if(key)window.__revealFocusEvents.push(key);});
 HTMLElement.prototype.focus=function(...args){const key=this.getAttribute('data-browser-instance-path')??this.getAttribute('data-browser-body-key');if(key)window.__revealFocus.push({key,rev:window.__studioDoc?.instances?.[0]?.part?.rev});return focus.apply(this,args);};
 const proto=Worker.prototype,post=proto.postMessage,desc=Object.getOwnPropertyDescriptor(proto,'onmessage');let armed=false,target,deliver;
 proto.postMessage=function(req,...args){if(armed&&req?.type==='placed'){armed=false;target={worker:this,id:req.id};}return post.call(this,req,...args);};
 Object.defineProperty(proto,'onmessage',{configurable:true,get:desc.get,set(cb){desc.set.call(this,cb&&function(event){if(target?.worker===this&&target.id===event.data?.id){deliver=()=>cb.call(this,event);return;}cb.call(this,event);});}});
 window.__revealHeld={arm(){armed=true;},held(){return !!deliver;},release(){target=null;deliver();deliver=null;}};
}
const button=name=>f.page.getByRole('button',{name,exact:true});
const row=path=>f.page.locator(`button[data-browser-instance-path="${path}"]`);
async function start(doc=seed){await f.newPage();await f.page.addInitScript(instrument);await f.page.reload();await f.ready();await f.page.setViewportSize({width:1440,height:900});
 await f.page.locator('input[aria-label="Model file"]').setInputFiles({name:'reveal-transitions.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))});await f.same(doc);
 await f.page.waitForFunction(()=>window.__studioInstanceBounds?.().length===2);
}
async function nested(){await button('Show the parts of Sub').click();await row('sub1/p2').click();await f.page.getByRole('complementary',{name:'Nested part',exact:true}).getByText('1000 mm³',{exact:true}).waitFor();await button('Hide the parts of Sub').click();}
async function noFocus(label){await f.page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));assert.deepEqual(await f.page.evaluate(()=>window.__revealFocus),[],label);assert.deepEqual(await f.page.evaluate(()=>window.__revealFocusEvents),[],label);f.report.observations.push({label,focusAttempts:[],focusEvents:[]});await f.snapshot(label);}
await f.run(async()=>{
 for(const action of ['selection','escape','new','open','undo','redo']){
  await start();let edited;
  if(action==='undo'||action==='redo'){
   await f.page.locator('[data-browser-body-key="b1"]').dblclick();const field=f.page.getByRole('textbox',{name:'Body name',exact:true});await field.fill('Boundary edit');await field.press('Enter');await f.changed(seed);edited=await f.doc();
   if(action==='redo'){await f.undo();await f.same(seed);}
  }
  await nested();
  const replacement=structuredClone(seed);replacement.instances[0].name='Replacement';
  const dispatched=await f.page.evaluate(({action,replacement})=>{
   window.__revealFocus=[];window.__revealFocusEvents=[];
   document.querySelector('button[aria-label="Show selection in Browser"]').click();
   const afterFirst=[...window.__revealFocus];
   if(action==='selection')document.querySelector('button[data-browser-instance-path="pin"]').click();
   if(action==='escape')window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
   if(action==='undo'||action==='redo')document.querySelector(`button[aria-label="${action==='undo'?'Undo':'Redo'}"]`).click();
   if(action==='new')document.querySelector('button[aria-label="New part"]').click();
   if(action==='open'){
    const input=document.querySelector('input[aria-label="Model file"]'),transfer=new DataTransfer();
    transfer.items.add(new File([JSON.stringify(replacement)],'same-id-replacement.bcad',{type:'application/json'}));input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));
   }
   return {action,afterFirst};
  },{action,replacement});
  assert.deepEqual(dispatched.afterFirst,[],'The first event must leave a pending request, not an already completed reveal');f.report.observations.push(dispatched);
  if(action==='new')await f.page.waitForFunction(()=>!window.__studioDoc.instances?.length);
  else if(action==='open')await f.same(replacement);
  else await f.same(action==='redo'?edited:seed);
  await noFocus(`same-task-${action}`);
  if(action==='selection')assert.equal(await row('pin').evaluate(el=>el.classList.contains('sel')),true);
  assert.equal(await f.page.getByRole('status',{name:'Find selection in Browser',exact:true}).count(),0,'Canceled reveal has no stale success/refusal feedback');
 }
 // An accepted linked revision reuses the host ID, while a real Worker reply is delayed.
 const newDefinition=structuredClone(seed.instances[0].doc);
 newDefinition.instances[1].doc.nodes[1].height=12;
 await start();await row('sub1').click();
 await f.page.locator('input[aria-label="New revision file"]').setInputFiles({name:'Sub-B.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(newDefinition))});
 await button('Accept Rev B').waitFor();
 const revisionDispatch=await f.page.evaluate(()=>{
  window.__revealFocus=[];window.__revealFocusEvents=[];window.__revealHeld.arm();
  document.querySelector('button[aria-label="Show selection in Browser"]').click();
  const afterFirst=[...window.__revealFocus];
  [...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Accept Rev B').click();
  return {action:'linked-revision',afterFirst};
 });
 assert.deepEqual(revisionDispatch.afterFirst,[]);f.report.observations.push(revisionDispatch);
 await f.page.waitForFunction(()=>window.__revealHeld.held());
 const accepted=await f.doc();assert.equal(accepted.instances[0].part.rev,'B');
 await noFocus('same-task-linked-revision');
 await button('Show selection in Browser').click();
 await f.page.getByRole('status',{name:'Find selection in Browser',exact:true}).filter({hasText:/current revision/}).waitFor();
 assert.deepEqual(await f.page.evaluate(()=>window.__revealFocus),[]);
 assert.deepEqual(await f.doc(),accepted);
 await f.page.evaluate(()=>window.__revealHeld.release());
 await button('Show the parts of Sub').click();await row('sub1/p2').click();
 await f.page.getByRole('complementary',{name:'Nested part',exact:true}).getByText('1200 mm³',{exact:true}).waitFor();
 await f.page.evaluate(()=>{window.__revealFocus=[];window.__revealFocusEvents=[];window.__revealFocusEvents=[];});
 await button('Show selection in Browser').click();
 await row('sub1/p2').evaluate(el=>{if(document.activeElement!==el)throw new Error('Current revision row was not focused');});
 assert.deepEqual(await f.page.evaluate(()=>window.__revealFocus),[{key:'sub1/p2',rev:'B'}]);
 await f.same(accepted);await f.snapshot('linked-revision-explicit-retry');
 assert.deepEqual(f.report.downloads,[]);
});
