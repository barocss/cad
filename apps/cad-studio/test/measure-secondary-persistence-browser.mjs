import assert from 'node:assert/strict';
import { createFlow, sha256 } from './flow-helper.mjs';
import { clickModelCommand } from './model-rail-helper.mjs';
const pins=['apps/cad-studio/test/measure-secondary-persistence-browser.mjs','apps/cad-studio/src/ui/MeasurementInspector.tsx','packages/barocss-cad-model/src/engine/evaluate.ts'];
const f=await createFlow({name:'measure-secondary-persistence',output:process.argv[2],envFrozen:'MEASURE_PERSISTENCE_FROZEN',initialFiles:pins,requiredFrozen:pins,
 qualification:'Actual OPFS Save bytes and fresh Open remain unchanged by Measure secondary preference; deterministic native STL consumer bytes compared in memory.',
 limits:['No actual export click or download. One 25.4 mm cube, native STL only; other export formats not certified.'],
 inspectorSource:`import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {evaluateDoc,stlFor} from '@barocss/cad-model/engine/evaluate';import {measureItem,measureBetween} from '@barocss/cad-model/app/measure';
const {doc}=JSON.parse(process.argv[3]);const r=evaluateDoc(doc,1);assert.ok(r.ok);const m=r.bodies[0].mesh;const top=m.faces.findIndex(f=>f.name==='n1.top'),bottom=m.faces.findIndex(f=>f.name==='n1.bottom');assert.ok(top>=0&&bottom>=0);const a={body:0,face:top},b={body:0,face:bottom};const bytes=stlFor(doc,'b1');assert.ok(bytes?.length);console.log(JSON.stringify({volume:r.bodies[0].volume,area:measureItem(m,a).area,between:measureBetween(m,a,m,b),stl:{bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}}));`,
 snapshotExtra:()=>({measurement:document.querySelector('[aria-label="Measurement"]')?.textContent??null,dirty:!!document.querySelector('[aria-label="Unsaved changes"]')})});
const doc={format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nodes:[{kind:'sketch',profile:'rectangle',min:[0,0],max:[25.4,25.4],id:'n0'},{kind:'extrude',sketch:0,height:25.4,id:'n1'}],outputs:{b1:{node:1,side:'solid'}},nextId:2};
const project='Measure secondary acceptance',file='inch-cube.bcad';
const button=name=>f.page.getByRole('button',{name,exact:true});
const versions=()=>f.page.getByRole('complementary',{name:'Versions panel',exact:true});
const panel=()=>f.page.getByRole('complementary',{name:'Measurement',exact:true});
const choice=()=>panel().getByLabel('Measure secondary units',{exact:true});
async function attach(){if(!await versions().isVisible())await button('Project and versions').click();await versions().getByRole('textbox',{name:'Browser project name',exact:true}).fill(project);await versions().getByRole('button',{name:'Project in this browser',exact:true}).click();await versions().getByLabel('Project',{exact:true}).waitFor();}
async function bytes(){return f.page.evaluate(async([name,file])=>{const root=await navigator.storage.getDirectory();const dir=await(await root.getDirectoryHandle('projects')).getDirectoryHandle(name);return(await(await dir.getFileHandle(file)).getFile()).text();},[project,file]);}
async function save(){const writes=await f.page.evaluate(()=>window.__measureFileWrites.completed);await button('Save').click();await f.page.waitForFunction(n=>window.__measureFileWrites.completed>n,writes);await versions().getByRole('list',{name:'Project documents',exact:true}).getByText(file,{exact:true}).waitFor();await f.page.waitForFunction(()=>!document.querySelector('[aria-label="Unsaved changes"]'));return bytes();}
async function enter(value){await f.page.evaluate(()=>document.activeElement?.blur());await clickModelCommand(f.page,'Inspect','Measure');await panel().waitFor();assert.equal(await choice().inputValue(),value);assert.equal(await panel().locator('.measure-item').count(),0);assert.equal(await panel().getByText('BETWEEN',{exact:true}).count(),0);}
async function close(){await button('Done measuring').click();await panel().waitFor({state:'hidden'});}
const invariant=()=>f.page.evaluate(()=>({doc:window.__studioDoc,dirty:!!document.querySelector('[aria-label="Unsaved changes"]'),selection:window.__studioSelection,history:[...document.querySelectorAll('.history .hs')].map(e=>e.getAttribute('aria-label'))}));
async function toggle(value){const before=await invariant();await choice().selectOption(value);await f.page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));assert.deepEqual(await invariant(),before);}
await f.run(async()=>{
 const newContext=f.browser.newContext.bind(f.browser);
 f.browser.newContext=async options=>{const context=await newContext(options);await context.addInitScript(file=>{
  window.__measureFileWrites={completed:0};const original=FileSystemFileHandle.prototype.createWritable;
  FileSystemFileHandle.prototype.createWritable=async function(...args){
   const stream=await original.apply(this,args);if(this.name!==file)return stream;
   const close=stream.close.bind(stream);stream.close=async(...closeArgs)=>{const result=await close(...closeArgs);window.__measureFileWrites.completed++;return result;};return stream;
  };
 },file);return context;};
 await f.newPage();await f.openFile({name:file,mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))},2);assert.deepEqual(await f.doc(),doc);await attach();const baseline=await save();assert.deepEqual(JSON.parse(baseline),doc);
 const original=await f.inspect('baseline-native-export',{}, {doc});assert.equal(original.area,645.16);assert.equal(original.between.distance,25.4);assert.ok(Math.abs(original.volume-16387.064)<1e-8);
 await enter('none');await toggle('inch');await close();const inch=await save();assert.equal(inch,baseline);await f.snapshot('01-inch-saved-bytes-unchanged');
 await enter('inch');await toggle('none');await close();assert.equal(await save(),baseline);
 await enter('none');await toggle('inch');await close();assert.equal(await save(),baseline);
 const after=await f.inspect('after-preference-native-export',{}, {doc:await f.doc()});assert.deepEqual(after,original);
 await versions().getByRole('button',{name:'Close project',exact:true}).click();await versions().getByLabel('Project',{exact:true}).waitFor({state:'hidden'});await f.page.reload();await f.ready();await attach();await versions().getByRole('button',{name:'Open '+file,exact:true}).click();await f.same(doc);assert.equal(await bytes(),baseline);await enter('inch');await f.snapshot('02-fresh-opfs-open-inch-empty');await close();
 const reopened=await f.inspect('reopened-native-export',{}, {doc:await f.doc()});assert.deepEqual(reopened,original);
 await enter('inch');await toggle('none');await close();assert.equal(await save(),baseline);await f.page.reload();await f.ready();if(!await versions().isVisible())await button('Project and versions').click();if(!await versions().getByLabel('Project',{exact:true}).isVisible())await attach();await versions().getByRole('button',{name:'Open '+file,exact:true}).click();await f.same(doc);await enter('none');await f.snapshot('03-none-restored-no-result');await close();
 f.report.files.push({name:file,sha256:sha256(baseline),bytes:Buffer.byteLength(baseline),method:'actual OPFS raw text after each named file writable.close completion; four preference Saves exact equal'});f.report.observations.push({original,after,reopened,independentInches:25.4/25.4,independentSquareInches:645.16/(25.4**2),exportBoundary:'stlFor in-memory bytes only; no export UI/download'});assert.deepEqual(f.report.downloads,[]);
});
