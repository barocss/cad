import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createFlow,sha256} from './flow-helper.mjs';
import {withMcpSession} from './mcp-browser-session.mjs';
import {box} from './drafted-extrude-variable-fillet-oracle.mjs';
const output=process.argv[2];
const pins=['apps/cad-studio/src/layout/ChatColumn.tsx','apps/cad-studio/src/App.tsx','apps/cad-studio/src/state/useProposalPreview.ts','apps/cad-studio/src/ui/ProposalBrowser.tsx','packages/barocss-cad-model/src/chat/part/proposals.ts'];
const f=await createFlow({name:'proposal-preview-labels',envFrozen:'D1384_SOURCE_FROZEN',output,initialFiles:pins,requiredFrozen:pins,
 qualification:'Clarify proposal preview current state, next toggle action and volume delta while preserving preview/Hide and accepted Undo/Redo geometry.',
 limits:['One native drafted-extrusion varying-fillet proposal at1024x800/1440x900. Original volume analytic frustum integral; accepted native volume compared with the independently established issue159 fixture value, not a new independent fillet integration. No screen-reader qualification.'],
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
  f.phase=`${width}-pending setup`;await f.newPage();await f.page.setViewportSize({width,height:width===1024?800:900});
  const [chooser]=await Promise.all([f.page.waitForEvent('filechooser'),button('Open').click()]);await chooser.setFiles(file);await f.same(pending);await button('Chat').first().click();await card().getByText(title,{exact:false}).waitFor();
  const originalProof=await f.inspect(`${width}-original`,pending),t=Math.tan(12*Math.PI/180),originalVolume=40*30*10-(40+30)*t*100+4*t*t*1000/3;
  assert.equal(originalProof.length,1);assert.ok(originalProof[0].valid);assert.ok(Math.abs(originalProof[0].volume-originalVolume)<1e-6);
  const shown=()=>f.page.evaluate(()=>window.__studioSection?.().shownVolume),baseMesh=await shown();
  await button('Preview',card()).click();await button('Hide',card()).waitFor();
  const status=card().locator('.proposal-dv'),delta=card().getByLabel('Volume change');await delta.getByText('−19.13 mm³ (−0.18%)',{exact:true}).waitFor();
  const afterText=await status.innerText();assert.match(afterText,/^after\s*·\s*Volume change/);assert.equal((afterText.match(/\bafter\b/g)||[]).length,1);
  const toggle=button('Show before',card());assert.equal((await toggle.innerText()).trim(),'Show before');const candidateMesh=await shown();assert.ok(baseMesh-candidateMesh>18&&baseMesh-candidateMesh<20);await f.same(pending);await f.snapshot(`${width}-after-preview`);
  await toggle.click();const beforeToggle=button('Show after',card());await beforeToggle.waitFor();assert.equal((await beforeToggle.innerText()).trim(),'Show after');const beforeText=await status.innerText();assert.match(beforeText,/^before\s*·\s*Volume change/);assert.equal((beforeText.match(/\bbefore\b/g)||[]).length,1);assert.equal(beforeText.replace(/^before/,'after'),afterText);assert.equal(await shown(),baseMesh);await f.same(pending);await f.snapshot(`${width}-before-preview`);
  await beforeToggle.focus();await f.page.keyboard.press('Enter');await button('Show before',card()).waitFor();assert.equal(await shown(),candidateMesh);assert.equal(await status.innerText(),afterText);await f.same(pending);
  await button('Hide',card()).click();await button('Preview',card()).waitFor();assert.equal(await shown(),baseMesh);await f.same(pending);assert.deepEqual(await readFile(file),bytes);await f.snapshot(`${width}-hidden`);
  f.phase=`${width}-accept and history`;await button('Preview',card()).click();await button('Hide',card()).waitFor();await delta.getByText('−19.13 mm³ (−0.18%)',{exact:true}).waitFor();await f.snapshot(`${width}-before-accept`);await button('Accept',card()).click();await f.snapshot(`${width}-after-accept-click`);await f.page.waitForFunction(()=>window.__studioDoc?.proposals?.[0]?.status==='accepted',null,{timeout:30000});await f.ready();
  const accepted=await f.doc(),proof=await f.inspect(`${width}-accepted`,accepted);assert.equal(proof.length,1);assert.ok(proof[0].valid);assert.ok(Math.abs(proof[0].volume-10553.214670399802)<1e-6);assert.ok(Math.abs((proof[0].volume-originalVolume)-(-19.1297889))<1e-4);assert.equal(await shown(),candidateMesh);await f.snapshot(`${width}-accepted`);
  await f.undo();await f.same(pending);assert.equal(await shown(),baseMesh);assert.deepEqual(await f.inspect(`${width}-undo`,pending),originalProof);await f.redo();await f.same(accepted);assert.equal(await shown(),candidateMesh);assert.deepEqual(await f.inspect(`${width}-redo`,accepted),proof);assert.deepEqual(await readFile(file),bytes);await f.snapshot(`${width}-redo`);
  f.report.observations.push({width,afterText,beforeText,baseMesh,candidateMesh,originalVolume,acceptedVolume:proof[0].volume,acceptedDigest:sha256(JSON.stringify(accepted)),previewHideDocPreserved:true,undoRedoNativeUnchanged:true});
 }
});
