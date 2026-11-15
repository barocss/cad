import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createFlow,sha256} from './flow-helper.mjs';
import {withMcpSession} from './mcp-browser-session.mjs';
import {box} from './drafted-extrude-variable-fillet-oracle.mjs';
const output=process.argv[2];
const pins=['apps/cad-studio/src/App.tsx','apps/cad-studio/src/state/useProposalPreview.ts','apps/cad-studio/src/ui/ProposalBrowser.tsx','packages/barocss-cad-model/src/chat/part/proposals.ts'];
const f=await createFlow({name:'proposal-active-command',envFrozen:'D1382_SOURCE_FROZEN',output,initialFiles:pins,requiredFrozen:pins,
 qualification:'Disable proposal Preview/Accept during a live Box draft with an actionable reason, recover after Cancel, and retain existing stale/rebase semantics after Apply.',
 limits:['One locally generated drafted-extrusion fillet proposal. Box only; Sketch and rollback not exercised. No accepting/rebasing proposal in this run.']});
const stock={...box,nodes:[box.nodes[0],{...box.nodes[1],draft:12}]},title='Fillet the front drafted rim';
const button=(name,scope=f.page)=>scope.getByRole('button',{name,exact:true});
const card=()=>f.page.getByRole('listitem',{name:'Proposal P1',exact:true});
const hud=()=>f.page.getByRole('dialog',{name:'Box',exact:true});
async function shown(){return f.page.evaluate(()=>window.__studioSection?.().shownVolume);}
async function preview(pending,label){assert.equal(await button('Preview',card()).isEnabled(),true);assert.equal(await button('Accept',card()).isEnabled(),true);const before=await shown();await button('Preview',card()).click();await button('Hide',card()).waitFor();await card().getByLabel('Volume change').getByText('−19.13 mm³ (−0.18%)',{exact:true}).waitFor();const after=await shown();assert.ok(before-after>18&&before-after<20);await f.same(pending);await f.snapshot(label);await button('Hide',card()).click();await button('Preview',card()).waitFor();assert.equal(await shown(),before);await f.same(pending);}
await f.run(async()=>{
 const file=join(output,'pending-agent.bcad');await writeFile(file,JSON.stringify(stock),{flag:'wx'});
 await withMcpSession({app:f.app,output,clientName:'barocss-proposal-command-test'},file,'seed-proposal',async call=>{
  const summary=await call('query',{action:'summary'}),body=summary.bodies[0].key;
  const found=await call('query',{action:'native_joints',body}),edges=found.edges.filter(e=>e.faces.includes('n1.side0')&&e.faces.includes('n1.top'));assert.equal(edges.length,1);
  const made=await call('proposals',{action:'propose',title,ops:[{tool:'features',args:{action:'command',command:'fillet',edges:[edges[0].name],values:{radius:1.25,endRadius:2.5,stationMode:'two-interior',stationAt:25,stationRadius:3,station2At:62.5,station2Radius:1}}}]});assert.equal(made.proposal,'P1');assert.equal(made.applied,false);
 });
 const bytes=await readFile(file),pending=JSON.parse(bytes);assert.equal(pending.proposals[0].status,'open');assert.deepEqual(pending.nodes,stock.nodes);
 for(const width of [1024,1440]){
  f.phase=`${width}-Box proposal guard`;await f.newPage();await f.page.setViewportSize({width,height:width===1024?800:900});const [chooser]=await Promise.all([f.page.waitForEvent('filechooser'),button('Open').click()]);await chooser.setFiles(file);await f.same(pending);await button('Chat').first().click();await card().getByText(title,{exact:false}).waitFor();
  await f.page.evaluate(()=>document.activeElement?.blur());await f.command('Box');await hud().waitFor();await hud().getByLabel('Width X',{exact:true}).fill('23');await hud().getByLabel('Width X',{exact:true}).press('Tab');await hud().locator('.status').filter({hasText:/^preview$/}).waitFor();
  const draft=await hud().locator('input').evaluateAll(es=>es.map(e=>({name:e.getAttribute('aria-label'),value:e.value})));await card().getByText(/apply or cancel box/i).waitFor();
  for(const name of ['Preview','Accept']){const control=button(name,card());assert.equal(await control.isDisabled(),true);await control.scrollIntoViewIfNeeded();const b=await control.boundingBox();assert.ok(b);await f.page.mouse.click(b.x+b.width/2,b.y+b.height/2);await control.focus();assert.equal(await control.evaluate(el=>el===document.activeElement),false,'native disabled button must not receive keyboard focus');}
  // Normal Tab traversal never lands on either natively disabled proposal action.
  await hud().getByLabel('Width X',{exact:true}).focus();for(let i=0;i<12;i++){await f.page.keyboard.press('Tab');assert.equal(await card().evaluate(el=>[...el.querySelectorAll('button')].some(b=>/^(Preview|Accept)$/.test(b.textContent.trim())&&b===document.activeElement)),false);}
  assert.deepEqual(await hud().locator('input').evaluateAll(es=>es.map(e=>({name:e.getAttribute('aria-label'),value:e.value}))),draft);assert.equal(await button('Hide',card()).count(),0);await f.same(pending);await f.snapshot(`${width}-blocked`);
  await button('Cancel',hud()).click();await hud().waitFor({state:'hidden'});await f.same(pending);await preview(pending,`${width}-cancel-preview`);assert.deepEqual(await readFile(file),bytes);
  await f.page.evaluate(()=>document.activeElement?.blur());await f.command('Box');await hud().locator('.status').filter({hasText:/^preview$/}).waitFor();await button('Apply',hud()).click();await f.changed(pending);const applied=await f.doc();assert.equal(applied.proposals[0].status,'open');assert.deepEqual(applied.proposals,pending.proposals);assert.ok(applied.nodes.length>pending.nodes.length);await card().getByText(/stale/).first().waitFor();assert.equal(await button('Preview',card()).isDisabled(),true);assert.equal(await button('Accept',card()).count(),0);assert.equal(await button('Rebase & preview',card()).isEnabled(),true);await f.snapshot(`${width}-applied-stale`);
  await f.undo();await f.same(pending);await preview(pending,`${width}-undo-preview`);await f.redo();await f.same(applied);await card().getByText(/stale/).first().waitFor();
  f.report.observations.push({width,draftWidth:23,disabledMouseAndTab:true,cancelPreviewDelta:true,applyStale:true,undoPreview:true,redoStale:true,proposalHash:sha256(JSON.stringify(pending.proposals))});
 }
});
