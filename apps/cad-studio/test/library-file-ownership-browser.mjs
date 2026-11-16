// #255. Browser UI/registry only; no native inspector or external sharing.
import assert from 'node:assert/strict';
import { createFlow, sha256 } from './flow-helper.mjs';
const [output,mode]=process.argv.slice(2);assert.ok(['--expect=repro','--expect=fixed'].includes(mode));
const repro=mode==='--expect=repro',id='ownership-spacers',key='barocss-cad-user-libraries';
const manifest=name=>({format:'barocss-cad-library',version:1,id,name,libraryVersion:'1.0.0',units:'mm',license:'CC0-1.0',parts:[{id:'spacer',name:'Spacer',parameters:{},recipe:[{id:'s',kind:'sketch',profile:'circle',center:[0,0],radius:5},{id:'blank',kind:'extrude',sketch:'s',height:8}],outputs:['blank']}]});
const B=manifest('Delayed library B'),C=manifest('Latest library C');
const payload=(name,json)=>({name,mimeType:'application/json',buffer:Buffer.from(JSON.stringify(json))});
const pins=['apps/cad-studio/test/library-file-ownership-browser.mjs','apps/cad-studio/src/ui/LibraryPanel.tsx'];
const f=await createFlow({name:'library-file-ownership',output,envFrozen:'LIBRARY_FILE_OWNERSHIP_FROZEN',initialFiles:pins,requiredFrozen:pins,qualification:repro?'Expected reproduction of stale local library reads':'Latest selection and mounted panel own local library reads',limits:['No insert/place, native subprocess, external sharing or download. Local registry inferred through rendered rows and persisted user-library bytes.']});
const button=name=>f.page.getByRole('button',{name,exact:true});
const upload=(name,json)=>f.page.getByLabel('Library file',{exact:true}).setInputFiles(payload(name,json));
const stored=()=>f.page.evaluate(key=>JSON.parse(localStorage.getItem(key)??'[]'),key);
const show=name=>f.page.getByLabel('Library '+id,{exact:true}).getByText(name,{exact:true}).waitFor();
async function release(){await f.page.evaluate(()=>window.__libraryRead.release());await f.page.waitForFunction(()=>window.__libraryRead.completed===1);await f.page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
await f.run(async()=>{
 const origin=new URL(f.server.resolvedUrls.local[0]).origin,newContext=f.browser.newContext.bind(f.browser);
 f.browser.newContext=async options=>{const c=await newContext({...options,acceptDownloads:false,serviceWorkers:'block'});await c.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname==='fonts.googleapis.com')return route.fulfill({contentType:'text/css',body:''});if(u.origin!==origin)return route.abort();if(u.pathname==='/api/chat/libraries')return route.fulfill({json:{libraries:[]}});return route.continue();});await c.addInitScript(()=>{const original=File.prototype.text;window.__libraryRead={pending:0,completed:0,release:null};File.prototype.text=async function(...args){const text=await original.apply(this,args);if(this.name!=='delayed-B.json')return text;window.__libraryRead.pending++;return new Promise(resolve=>{window.__libraryRead.release=()=>{window.__libraryRead.completed++;resolve(text);};});};});return c;};
 f.report.fixtureHashes={B:sha256(JSON.stringify(B)),C:sha256(JSON.stringify(C))};
 for(const scenario of ['newer-file','close']){
  f.phase=scenario;await f.newPage();const before=await f.snapshot(scenario+'-before');await button('Library').click();
  await upload('delayed-B.json',B);await f.page.waitForFunction(()=>window.__libraryRead.pending===1);
  if(scenario==='newer-file'){await upload('current-C.json',C);await show(C.name);assert.deepEqual(await stored(),[{library:C,authoredBy:'person',confirmed:true}]);await f.page.getByLabel('Library '+id,{exact:true}).scrollIntoViewIfNeeded();await f.snapshot('newer-file-C-before-release');}
  else{await button('Close library').click();assert.equal(await f.page.getByLabel('Library panel',{exact:true}).count(),0);assert.deepEqual(await stored(),[]);}
  await release();
  const expected=repro?B:scenario==='newer-file'?C:null;
  assert.deepEqual(await stored(),expected?[{library:expected,authoredBy:'person',confirmed:true}]:[]);
  if(scenario==='close')await button('Library').click();
  if(expected)await show(expected.name);else assert.equal(await f.page.getByLabel('Library '+id,{exact:true}).count(),0);
  if(expected)await f.page.getByLabel('Library '+id,{exact:true}).scrollIntoViewIfNeeded();
  const after=await f.snapshot(scenario+'-after-release');assert.deepEqual(after.doc,before.doc);assert.deepEqual(after.history,before.history);assert.deepEqual(after.selection,before.selection);
  f.report.observations.push({scenario,expectedMode:mode,stored:await stored(),docUnchanged:true,historyUnchanged:true});
 }
 if(!repro)for(const scenario of ['accepted-open','failed-open']){
  f.phase=scenario;await f.newPage();await button('Library').click();const initial=await f.doc();await upload('delayed-B.json',B);await f.page.waitForFunction(()=>window.__libraryRead.pending===1);
  let expectedDoc=initial;
  if(scenario==='accepted-open'){
   expectedDoc={...initial,libraries:[{library:C,authoredBy:'person',confirmed:true}]};
   await f.openFile(payload('embedded-C.bcad',expectedDoc),expectedDoc.nodes.length);await f.same(expectedDoc);
   if(!await f.page.getByLabel('Library panel',{exact:true}).count())await button('Library').click();
   await show(C.name);assert.deepEqual(await stored(),[{library:C,authoredBy:'person',confirmed:true}]);
  }else{
   await f.page.setInputFiles('input[aria-label="Model file"]',{name:'invalid.bcad',mimeType:'application/json',buffer:Buffer.from('{')});
   await f.waitToast(/Could not open this file/);assert.deepEqual(await f.doc(),initial);
  }
  const before=await f.snapshot(scenario+'-before-release');await release();
  const expected=scenario==='accepted-open'?C:B;await show(expected.name);assert.deepEqual(await stored(),[{library:expected,authoredBy:'person',confirmed:true}]);
  assert.deepEqual(await f.doc(),expectedDoc);await f.page.getByLabel('Library '+id,{exact:true}).scrollIntoViewIfNeeded();const after=await f.snapshot(scenario+'-after-release');assert.deepEqual(after.history,before.history);assert.deepEqual(after.selection,before.selection);
  // A current explicit file selection still works after either transition.
  await upload('fresh-B.json',B);await show(B.name);assert.deepEqual(await stored(),[{library:B,authoredBy:'person',confirmed:true}]);assert.deepEqual(await f.doc(),expectedDoc);
  f.report.observations.push({scenario,acceptedDocumentUnchanged:true,currentReadAccepted:scenario==='failed-open',freshSelectionAccepted:true});
 }
 assert.deepEqual(f.report.downloads,[]);
});
