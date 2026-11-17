// #217: actual Add drawing, BLOCK ignored flags and explicit external-reference refusal.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow, sha256 } from './flow-helper.mjs';
const f = await createFlow({name:'dxf-block-reference',output:process.argv[2],envFrozen:'DXF_BLOCK_REFERENCE_FROZEN',initialFiles:['apps/cad-studio/test/dxf-block-reference-browser.mjs'],qualification:'Local BLOCK flags32/64 retain included geometry; external BLOCK evidence refuses the whole Add drawing without changing the accepted part.',limits:['Synthetic ASCII DXF only; browser request surveillance does not prove OS-wide filesystem access absence. External strings are never opened by the harness. No external asset retrieval, Save/Open suite or manufacturing approval.'],inspectorSource:`
import { readDxfSketch } from '@barocss/cad-model/sketch/dxfRead';
import { runDraftTool } from '@barocss/cad-model/chat/drafts';
const {text,name,host}=JSON.parse(process.argv[3]);
let sketch,error;try{sketch=readDxfSketch(text);}catch(e){error=e.message;}
const result=runDraftTool(host,'import_drawing',{dxf:text,name});
console.log(JSON.stringify({sketch,error,toolError:result.error,nodes:'doc' in result?result.doc.nodes:undefined,underlays:'doc' in result?result.doc.underlays:undefined}));
`});
const button=name=>f.page.getByRole('button',{name,exact:true});
const blank={format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nodes:[],outputs:{},nextId:0};
const corners=[[1,2],[11,2],[11,7],[1,7]];
function drawing(flags=0,path='',external=false){
  const name=external?'External':'Local';
  const lines=external?[]:corners.flatMap(([x,y],i)=>{const[a,b]=corners[(i+1)%4];return[0,'LINE',8,'0',10,x,20,y,11,a,21,b];});
  return [0,'SECTION',2,'HEADER',9,'$INSUNITS',70,4,0,'ENDSEC',0,'SECTION',2,'BLOCKS',0,'BLOCK',8,'0',2,name,70,flags,10,1,20,2,...(path?[1,path]:[]),...lines,0,'ENDBLK',0,'ENDSEC',0,'SECTION',2,'ENTITIES',...(external?[0,'CIRCLE',8,'0',10,0,20,0,40,2]:[]),0,'INSERT',8,'0',2,name,10,100,20,50,41,2,42,2,0,'ENDSEC',0,'EOF',''].join('\n');
}
async function add(name,text){const file=join(f.output,name+'.dxf');await writeFile(file,text);await f.page.getByLabel('Add drawing',{exact:true}).setInputFiles(file);}
async function state(){return f.page.evaluate(()=>({doc:structuredClone(window.__studioDoc),fileName:document.querySelector('.doc-tab input')?.value,dirty:!!document.querySelector('[aria-label="Unsaved changes"]'),selection:structuredClone(window.__studioSelection),history:['Undo','Redo'].map(name=>{const e=document.querySelector(`button[aria-label="${name}"]`);return[e?.disabled,e?.getAttribute('data-tip')];})}));}
await f.run(async()=>{
  const origin=new URL(f.server.resolvedUrls.local[0]).origin, requests=[], externalAttempts=[];
  const newContext=f.browser.newContext.bind(f.browser);
  f.browser.newContext=async options=>{const context=await newContext({...options,acceptDownloads:false,serviceWorkers:'block'});context.on('request',r=>requests.push(r.url()));await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.hostname==='fonts.googleapis.com')return route.fulfill({contentType:'text/css',body:''});if(url.origin!==origin){externalAttempts.push(url.href);return route.abort();}return route.continue();});return context;};
  await f.newPage();const[chooser]=await Promise.all([f.page.waitForEvent('filechooser'),button('Open').click()]);await chooser.setFiles({name:'accepted-block-host.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(blank))});await f.ready();
  const control=await f.inspect('control',{}, {text:drawing(),name:'control',host:await f.doc()});assert.equal(control.error,undefined);assert.equal(control.toolError,undefined);assert.equal(control.sketch.regions.length,0);assert.deepEqual(control.sketch.underlay.polylines,[[[100,50],[120,50]],[[120,50],[120,60]],[[120,60],[100,60]],[[100,60],[100,50]]]);
  await add('accepted-control',drawing());await f.waitToast(/Drawing added as an underlay/);await f.page.waitForFunction(()=>window.__studioDoc.underlays?.length===1);await f.ready();await f.dismissToasts();const accepted=await state();assert.ok(accepted.dirty);assert.equal(accepted.history[0][0],false);
  const cases=[['direct',4,'','external reference'],['overlay',8,'','xref overlay'],['dependent',16,'','externally dependent'],['url-path',0,'https://cad-xref.invalid/synthetic-private.dxf','xref path present'],['unc-path',0,'\\\\cad-xref.invalid\\synthetic\\part.dxf','xref path present']];
  for(const[name,flags,path,why]of cases){f.phase='Refuse '+name;const text=drawing(flags,path,true),result=await f.inspect(name,{}, {text,name,host:accepted.doc});assert.match(result.error,/^\[DXF_UNSUPPORTED\]/);assert.equal(result.toolError,result.error);assert.equal(result.nodes,undefined);assert.ok(result.error.includes(why));if(path)assert.ok(!result.error.includes(path));await add(name,text);const toast=await f.waitToast(/Could not read this drawing/);assert.ok(toast.includes(why));assert.match(toast,/external content was not loaded/);assert.deepEqual(await state(),accepted);if(name==='url-path')await f.snapshot('01-external-path-refused-current-part-kept');f.report.observations.push({name,sha256:sha256(text),error:result.error,preserved:['Doc','fileName','dirty','Undo/Redo','selection']});await f.dismissToasts();}
  for(const flags of [32,64]){f.phase='Accept ignored BLOCK flag '+flags;const text=drawing(flags),host=await f.doc(),name='local-'+flags,result=await f.inspect(name,{}, {text,name,host});assert.equal(result.error,undefined);assert.equal(result.toolError,undefined);assert.deepEqual(result.sketch,control.sketch);await add(name,text);await f.waitToast(/Drawing added as an underlay/);await f.page.waitForFunction(n=>window.__studioDoc.underlays?.length>n,host.underlays.length);await f.ready();assert.deepEqual((await f.doc()).nodes,result.nodes);assert.deepEqual((await f.doc()).underlays.map(u=>u.polylines),result.underlays.map(u=>u.polylines));assert.deepEqual((await f.doc()).nodes.slice(0,host.nodes.length),host.nodes);f.report.observations.push({flags,sha256:sha256(text),independentExpected:{underlayPolylines:[[[100,50],[120,50]],[[120,50],[120,60]],[[120,60],[100,60]],[[100,60],[100,50]]],profileRegions:0},sameReadGeometryAsFlag0:true});await f.dismissToasts();}
  await button('Top').click();await f.frame([[100,50],[120,60]]);await f.snapshot('02-local-32-64-geometry-accepted');
  const referenced=requests.filter(url=>url.includes('cad-xref.invalid')||url.includes('synthetic-private.dxf'));assert.deepEqual(referenced,[]);assert.deepEqual(externalAttempts,[]);f.report.observations.push({network:{requests,externalAttempts,referenced},qualification:'Playwright browser requests and routes only; font CSS served locally. No OS-wide filesystem audit.'});
});
