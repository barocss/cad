import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createFlow,sha256} from './flow-helper.mjs';
const output=process.argv[2];
const pins=['apps/cad-studio/src/layout/ChatColumn.tsx','apps/cad-studio/src/App.tsx','apps/cad-studio/src/state/useProposalPreview.ts','apps/cad-studio/src/ui/ProposalBrowser.tsx','packages/barocss-cad-model/src/chat/part/proposals.ts'];
const f=await createFlow({name:'proposal-partial-history',envFrozen:'D1385_SOURCE_FROZEN',output,initialFiles:pins,requiredFrozen:pins,
 qualification:'Truthful decided partial proposal scope after actual rebase, exclusion and Accept, preserving native geometry and Undo/Redo/Save/Open.',
 limits:['One authored legacy open proposal fixture, never a synthesized accepted decision. Desktop Chrome1024x800/1440x900; no other exclusion combination or screen-reader qualification.'],
 inspectorSource:`import {readFileSync} from 'node:fs';import {partBreps} from '@barocss/cad-model/engine/evaluate';import {checkBrep,brepMassProperties} from '@barocss/cad';import {digestOf} from '@barocss/cad-model/util/digest';const doc=JSON.parse(readFileSync(process.argv[2],'utf8'));console.log(JSON.stringify(partBreps(doc).map(({key,brep})=>({key,valid:checkBrep(brep,{strict:true}).valid,volume:brepMassProperties(brep,1).volume,digest:digestOf(brep)}))));`});
const title='A Ø4 hole and a block';
const stock={format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nextId:2,outputs:{b1:{node:1,side:'solid'}},nodes:[{id:'n0',kind:'sketch',profile:'rectangle',min:[0,0],max:[40,20]},{id:'n1',kind:'extrude',sketch:0,height:8}],proposals:[{id:'P1',title,status:'open',by:{agent:'chat'},at:'2026-10-18T00:00:00Z',base:'0',ops:[{tool:'features',args:{action:'command',command:'hole',faces:['n1.top'],values:{d:4,x:30,y:10}}},{tool:'features',args:{action:'add',features:[{kind:'sketch',profile:'rectangle',min:[50,0],max:[60,10]},{kind:'extrude',sketch:3,height:5}]}}],risk:{level:'low',features_touched:1,references_broken:0,hard_requirements_changed:[],approval:[]},summary:'3 added'}]};
const button=(name,scope=f.page)=>scope.getByRole('button',{name,exact:true});
const card=()=>f.page.getByRole('listitem',{name:'Proposal P1',exact:true});
async function decided(){
 if(!await card().count()) await button('Show decided proposals').click();
 const text=await card().innerText();assert.match(text,/accepted by user/i);assert.match(text,/Original proposal/i);assert.match(text,/3 added/);assert.match(text,/accepted the proposal except n4/i);assert.equal((text.match(/rebas(?:e|ed)/gi)||[]).length,1);return text;
}
await f.run(async()=>{
 const file=join(output,'legacy-partial.bcad');await writeFile(file,JSON.stringify(stock),{flag:'wx'});const bytes=await readFile(file);
 for(const width of [1024,1440]){
  f.phase=`${width}-legacy proposal`;await f.newPage();await f.page.setViewportSize({width,height:width===1024?800:900});await f.openFile(file,2);await f.same(stock);await button('Chat').first().click();await card().getByText(title,{exact:false}).waitFor();await button('Rebase & preview',card()).click();await f.page.getByRole('group',{name:'P1 features',exact:true}).waitFor({timeout:30000});await button('Hide',card()).waitFor();const rebased=await f.doc();assert.equal(rebased.proposals[0].status,'open');assert.deepEqual(rebased.nodes,stock.nodes);
  const parts=f.page.getByRole('group',{name:'P1 features',exact:true});const extrude=parts.locator('.proposal-part').filter({hasText:/Extrude/});assert.equal(await extrude.count(),1);assert.equal((await extrude.locator('.mono').innerText()).trim(),'n4');await extrude.getByRole('checkbox').click();await button('Accept 1 of 2',card()).waitFor({timeout:30000});await f.page.waitForFunction(()=>document.querySelector('input[aria-label="Keep n4"]')?.checked===false,null,{timeout:30000});await f.ready();await f.same(rebased);await f.snapshot(`${width}-partial-preview`);
  f.phase=`${width}-partial accept`;await button('Accept 1 of 2',card()).click();await f.snapshot(`${width}-accept-click`);await f.page.waitForFunction(()=>window.__studioDoc?.proposals?.[0]?.status==='accepted',null,{timeout:30000});await f.ready();const accepted=await f.doc();assert.deepEqual(accepted.proposals[0].decided.left_out,['n4']);assert.equal(accepted.nodes.some(n=>n.id==='n4'),false);assert.equal(accepted.nodes.filter(n=>n.kind==='hole').length,1);assert.equal(accepted.nodes.filter(n=>n.kind==='extrude').length,1);const text=await decided();await f.snapshot(`${width}-decided`);
  const proof=await f.inspect(`${width}-accepted`,accepted);assert.equal(proof.length,1);assert.ok(proof[0].valid);assert.ok(Math.abs(proof[0].volume-(6400-32*Math.PI))<1e-6);
  await f.undo();await f.same(rebased);assert.equal((await f.doc()).proposals[0].status,'open');await f.redo();await f.same(accepted);assert.equal(await decided(),text);assert.deepEqual(await f.inspect(`${width}-redo`,accepted),proof);
  await button('Hide decided proposals').click();await button('Close chat').click();await f.same(accepted);const saved=await f.save(`${width}-partial`);await f.newPage();await f.page.setViewportSize({width,height:width===1024?800:900});await f.openFile(saved.file,saved.doc.nodes.length);await f.same(saved.doc);await button('Chat').first().click();assert.equal(await decided(),text);await f.snapshot(`${width}-fresh-open`);assert.deepEqual(await f.inspect(`${width}-reopened`,saved.doc),proof);assert.deepEqual(await readFile(file),bytes);
  f.report.observations.push({width,card:text,leftOut:accepted.proposals[0].decided.left_out,nativeVolume:proof[0].volume,expectedVolume:6400-32*Math.PI,acceptedDigest:sha256(JSON.stringify(accepted)),undoRedoSaveOpen:true});
 }
});
