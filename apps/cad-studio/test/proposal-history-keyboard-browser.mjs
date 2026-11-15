import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createFlow,sha256} from './flow-helper.mjs';
import {withMcpSession} from './mcp-browser-session.mjs';
import {box} from './drafted-extrude-variable-fillet-oracle.mjs';
const output=process.argv[2];
const pins=['apps/cad-studio/src/layout/ChatColumn.tsx','apps/cad-studio/src/App.tsx','apps/cad-studio/src/state/useProposalPreview.ts','apps/cad-studio/src/ui/ProposalBrowser.tsx','packages/barocss-cad-model/src/chat/part/proposals.ts'];
const f=await createFlow({name:'proposal-history-keyboard',envFrozen:'D1383_SOURCE_FROZEN',output,initialFiles:pins,requiredFrozen:pins,
 qualification:'Keep keyboard focus through decided proposal history opening/closing and preserve accepted geometry and Model/Drawing chat constraints.',
 limits:['One accepted native drafted-extrusion fillet proposal. Model and Drawing, desktop Chrome1024x800/1440x900. No screen-reader or Render qualification.'],
 inspectorSource:`import {readFileSync} from 'node:fs';import {partBreps} from '@barocss/cad-model/engine/evaluate';import {checkBrep,brepMassProperties} from '@barocss/cad';import {digestOf} from '@barocss/cad-model/util/digest';const doc=JSON.parse(readFileSync(process.argv[2],'utf8'));console.log(JSON.stringify(partBreps(doc).map(({key,brep})=>({key,valid:checkBrep(brep,{strict:true}).valid,volume:brepMassProperties(brep,1).volume,digest:digestOf(brep)}))));`});
const stock={...box,nodes:[box.nodes[0],{...box.nodes[1],draft:12}]},title='Fillet the front drafted rim';
const button=(name,scope=f.page)=>scope.getByRole('button',{name,exact:true});
const card=()=>f.page.getByRole('listitem',{name:'Proposal P1',exact:true});
await f.run(async()=>{
 const file=join(output,'pending-agent.bcad');await writeFile(file,JSON.stringify(stock),{flag:'wx'});
 await withMcpSession({app:f.app,output,clientName:'barocss-proposal-command-test'},file,'seed-proposal',async call=>{
  const summary=await call('query',{action:'summary'}),body=summary.bodies[0].key;
  const found=await call('query',{action:'native_joints',body}),edges=found.edges.filter(e=>e.faces.includes('n1.side0')&&e.faces.includes('n1.top'));assert.equal(edges.length,1);
  const made=await call('proposals',{action:'propose',title,ops:[{tool:'features',args:{action:'command',command:'fillet',edges:[edges[0].name],values:{radius:1.25,endRadius:2.5,stationMode:'two-interior',stationAt:25,stationRadius:3,station2At:62.5,station2Radius:1}}}]});assert.equal(made.proposal,'P1');assert.equal(made.applied,false);
 });
 const bytes=await readFile(file),pending=JSON.parse(bytes);assert.equal(pending.proposals[0].status,'open');assert.deepEqual(pending.nodes,stock.nodes);
 for(const width of [1024,1440]){
  f.phase=`${width}-accepted setup`;await f.newPage();await f.page.setViewportSize({width,height:width===1024?800:900});
  const [chooser]=await Promise.all([f.page.waitForEvent('filechooser'),button('Open').click()]);await chooser.setFiles(file);await f.same(pending);await button('Chat').first().click();await card().getByText(title,{exact:false}).waitFor();
  await f.snapshot(`${width}-before-accept`);await button('Accept',card()).click();await f.snapshot(`${width}-after-accept-click`);await f.page.waitForFunction(()=>window.__studioDoc?.proposals?.[0]?.status==='accepted',null,{timeout:30000});await f.ready();const accepted=await f.doc();assert.equal(accepted.proposals.filter(p=>p.status==='open').length,0);assert.equal(accepted.proposals.filter(p=>p.status==='accepted').length,1);
  const proof=await f.inspect(`${width}-accepted`,accepted);assert.ok(proof.every(b=>b.valid));
  await button('Close chat').click();await button('Show decided proposals').waitFor();
  const show=button('Show decided proposals');await show.focus();
  for(let i=0;i<3;i++){
   f.phase=`${width}-keyboard-cycle-${i+1}`;await f.page.keyboard.press('Enter');const hide=button('Hide decided proposals');await hide.waitFor();assert.equal(await hide.getAttribute('aria-pressed'),'true');assert.ok(await hide.evaluate(el=>el===document.activeElement));await card().getByText(/accepted by user/).waitFor();assert.equal(await f.page.getByText('The chat is closed.',{exact:true}).count(),0);assert.equal(await button('Open chat').isEnabled(),true);await f.same(accepted);await f.snapshot(`${width}-expanded-${i+1}`);
   await f.page.keyboard.press('Enter');await show.waitFor();assert.equal(await show.getAttribute('aria-pressed'),'false');assert.ok(await show.evaluate(el=>el===document.activeElement));assert.equal(await card().count(),0);await f.same(accepted);await f.snapshot(`${width}-collapsed-${i+1}`);
  }
  await f.page.keyboard.press('Enter');await button('Hide decided proposals').waitFor();await button('Open chat').click();await button('Close chat').waitFor();await f.same(accepted);await button('Close chat').click();
  await button('Drawing').click();await button('Open chat').waitFor();assert.equal(await button('Open chat').isDisabled(),true);assert.match(await button('Open chat').getAttribute('title'),/opens in Model view/);await f.same(accepted);await f.snapshot(`${width}-drawing-disabled`);
  await button('Model').click();assert.equal(await button('Open chat').isEnabled(),true);assert.equal(await f.page.getByText('The chat is closed.',{exact:true}).count(),0);await f.same(accepted);assert.deepEqual(await f.inspect(`${width}-after`,accepted),proof);assert.deepEqual(await readFile(file),bytes);
  f.report.observations.push({width,cycles:3,acceptedCount:1,openCount:0,focusedAfterEveryEnter:true,modelOpenChat:true,drawingDisabled:true,acceptedDigest:sha256(JSON.stringify(accepted)),geometry:proof});
 }
});
