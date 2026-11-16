import assert from 'node:assert/strict';
import {createFlow} from './flow-helper.mjs';
const repro=process.argv.includes('--repro');
const f=await createFlow({name:'keepout-current-document',output:process.argv[2],envFrozen:'KEEPOUT_CURRENT_FROZEN',initialFiles:['apps/cad-studio/src/state/useModelChecks.ts','apps/cad-studio/test/keepout-current-document-browser.mjs'],qualification:'An old clear keep-out verdict is not displayed for a replacement intersecting document.'});
const base={format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nodes:[{kind:'sketch',profile:'rectangle',min:[0,0],max:[20,20],id:'n0'},{kind:'extrude',sketch:0,height:10,id:'n1'}],outputs:{b1:{node:1,side:'solid'}},nextId:2,references:{version:1,references:[],datums:[],keepouts:[{id:'K1',name:'Plug space',clearance:0,frame:{origin:[30,10,0],normal:[0,0,1],xAxis:[1,0,0]},shape:{kind:'box',size:[10,10,10]}}]}};
const overlap={...base,nodes:[{...base.nodes[0],max:[40,20]},base.nodes[1]]};
const open=doc=>f.page.locator('input[aria-label="Model file"]').setInputFiles({name:'keepout.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))});
await f.run(async()=>{
 await f.newPage();await open(base);await f.same(base);await f.page.locator('[aria-label="Keep-out K1"].pass').waitFor();await f.snapshot('01-clear');
 await f.page.evaluate(()=>{window.__keepoutFrames=[];window.__keepoutStop=false;const sample=()=>{const row=document.querySelector('[aria-label="Keep-out K1"]');window.__keepoutFrames.push({width:window.__studioDoc?.nodes?.[0]?.max?.[0],status:row?.className,text:row?.textContent});if(!window.__keepoutStop)requestAnimationFrame(sample);};sample();});
 await open(overlap);await f.same(overlap);await f.page.locator('[aria-label="Keep-out K1"].fail').waitFor();
 const frames=await f.page.evaluate(()=>{window.__keepoutStop=true;return window.__keepoutFrames;});
 const stale=frames.filter(x=>x.width===40&&/\bpass\b/.test(x.status));f.report.observations.push({sampleCount:frames.length,staleClearFrames:stale.length,frames});
 assert.equal(stale.length>0,repro);await f.snapshot('02-current-overlap');
 await f.page.evaluate(()=>{window.__keepoutFrames=[];window.__keepoutStop=false;const sample=()=>{const row=document.querySelector('[aria-label="Keep-out K1"]');window.__keepoutFrames.push({width:window.__studioDoc?.nodes?.[0]?.max?.[0],status:row?.className});if(!window.__keepoutStop)requestAnimationFrame(sample);};sample();});
 await open(base);await f.same(base);await f.page.locator('[aria-label="Keep-out K1"].pass').waitFor();
 const back=await f.page.evaluate(()=>{window.__keepoutStop=true;return window.__keepoutFrames;});const staleFail=back.filter(x=>x.width===20&&/\bfail\b/.test(x.status));f.report.observations.push({staleFailFrames:staleFail.length,frames:back});assert.equal(staleFail.length>0,repro);
 assert.deepEqual(f.report.downloads,[]);
});
