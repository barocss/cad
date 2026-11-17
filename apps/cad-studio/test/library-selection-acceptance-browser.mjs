// #255 narrow selection boundary; no native subprocess, Save/Open qualification or export.
import assert from 'node:assert/strict';
import { createFlow,sha256 } from './flow-helper.mjs';
const id='selection-spacer',key='barocss-cad-user-libraries';
const manifest=(name,version,h)=>({format:'barocss-cad-library',version:1,id,name,libraryVersion:version,units:'mm',license:'CC0-1.0',parts:[{id:'spacer',name:'Spacer',parameters:{h:{value:h,unit:'mm',source:'Owned fixture'}},variants:[{id:'standard',name:'Standard',values:{}}],recipe:[{id:'s',kind:'sketch',profile:'circle',center:[0,0],radius:5},{id:'blank',kind:'extrude',sketch:'s',height:{expr:'h'}}],outputs:['blank']}]});
const A=manifest('Embedded agent A','1.0.0',8),B=manifest('Local selected B','2.0.0',12);
const original={format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nodes:[],outputs:{},nextId:0,libraries:[{library:A,authoredBy:'agent',confirmed:false}]};
const payload=(name,value)=>({name,mimeType:'application/json',buffer:Buffer.from(JSON.stringify(value))});
const pins=['apps/cad-studio/test/library-selection-acceptance-browser.mjs','apps/cad-studio/src/ui/LibraryPanel.tsx'];
const f=await createFlow({name:'library-selection-acceptance',output:process.argv[2],envFrozen:'LIBRARY_SELECTION_FROZEN',initialFiles:pins,requiredFrozen:pins,qualification:'Explicit local-library selection, embedded metadata preservation and refusal immutability',limits:['No native subprocess or independent geometry oracle. No Save/export, external requests or sharing. Stale captured-entry refusal is covered separately by helper unit tests.']});
const button=name=>f.page.getByRole('button',{name,exact:true});
const row=()=>f.page.getByLabel('Library '+id,{exact:true});
const store=()=>f.page.evaluate(key=>JSON.parse(localStorage.getItem(key)??'[]'),key);
const upload=file=>f.page.getByLabel('Library file',{exact:true}).setInputFiles(file);
await f.run(async()=>{
 const origin=new URL(f.server.resolvedUrls.local[0]).origin,newContext=f.browser.newContext.bind(f.browser);
 f.browser.newContext=async options=>{const c=await newContext({...options,acceptDownloads:false,serviceWorkers:'block'});await c.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname==='fonts.googleapis.com')return route.fulfill({contentType:'text/css',body:''});if(u.origin!==origin)return route.abort();if(u.pathname==='/api/chat/libraries')return route.fulfill({json:{libraries:[]}});return route.continue();});return c;};
 f.report.fixtureHashes={A:sha256(JSON.stringify(A)),B:sha256(JSON.stringify(B))};
 for(const action of ['Insert','Place']){
  f.phase=action;await f.newPage();await f.openFile(payload('embedded-A.bcad',original),0);await f.same(original);await button('Library').click();await row().getByText(A.name,{exact:true}).waitFor();await row().getByText('Written by an agent: not confirmed',{exact:true}).waitFor();
  await upload(payload('local-B.json',B));await row().getByText(B.name,{exact:true}).waitFor();const baseline=await f.doc();assert.deepEqual(baseline,original);const stored=await store();assert.deepEqual(stored,[{library:B,authoredBy:'person',confirmed:true}]);
  await row().getByRole('button',{name:action+' spacer',exact:true}).click();await f.changed(baseline);const after=await f.doc();assert.deepEqual(after.libraries,original.libraries);
  const nodes=action==='Insert'?after.nodes:after.instances[0].doc.nodes;assert.equal(nodes.length,1);assert.equal(action==='Insert'?(after.instances?.length??0):after.nodes.length,0);
  const made=nodes[0];assert.equal(made.kind,'library');assert.deepEqual([made.library.library,made.library.part,made.library.variant,made.library.version,made.library.values.h],[id,'spacer','standard','2.0.0',12]);assert.equal(made.features.find(n=>n.kind==='extrude').height,12);
  assert.deepEqual(await store(),stored);await row().scrollIntoViewIfNeeded();await f.snapshot(action.toLowerCase()+'-accepted');await button('Undo').click();await f.same(baseline);await button('Redo').click();await f.same(after);assert.deepEqual(await store(),stored);
  f.report.observations.push({action,source:'B',version:'2.0.0',height:12,embeddedAgentAMetadataPreserved:true,firstUndoRedo:true});
 }
 f.phase='file refusals';await f.newPage();await f.openFile(payload('embedded-A.bcad',original),0);await f.same(original);await button('Library').click();await upload(payload('local-B.json',B));await row().getByText(B.name,{exact:true}).waitFor();
 const built=f.page.getByLabel('BUILT-IN libraries',{exact:true}),builtText=await built.innerText();const builtinId=(await built.locator('[aria-label^="Library "]').first().getAttribute('aria-label')).slice('Library '.length);
 for(const [label,file]of [['malformed',{name:'malformed.json',mimeType:'application/json',buffer:Buffer.from('{')}],['builtin-id',payload('builtin-id.json',{...B,id:builtinId})]]){
  const before=await f.snapshot(label+'-before'),stored=await store();await upload(file);const notice=await f.waitToast(label==='builtin-id'?/built-in library: give yours another id/:/Expected property name|Unexpected end|JSON/);assert.match(notice,/Could not add the library/);assert.deepEqual(await store(),stored);await row().getByText(B.name,{exact:true}).waitFor();assert.equal(await built.innerText(),builtText);await row().scrollIntoViewIfNeeded();const after=await f.snapshot(label+'-refused');for(const field of ['doc','history','selection'])assert.deepEqual(after[field],before[field]);f.report.observations.push({label,registryRowsUnchanged:true,storeUnchanged:true,docHistorySelectionUnchanged:true});
 }
 assert.deepEqual(f.report.downloads,[]);
});
