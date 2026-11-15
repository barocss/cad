// D1340: isolated stored recovery fixtures, never browser model-state injection.
import assert from 'node:assert/strict';
import {createFlow,sha256} from './flow-helper.mjs';
const pins=['apps/cad-studio/src/storage/useProject.ts','apps/cad-studio/src/storage/VersionsPanel.tsx','apps/cad-studio/src/files/documentFile.ts','apps/cad-studio/src/App.tsx'];
const seed={format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nodes:[{kind:'sketch',id:'n0',profile:'rectangle',min:[0,0],max:[20,10]},{kind:'extrude',id:'n1',sketch:0,height:12,draft:15},{kind:'offset-face',id:'n2',parent:{node:1,side:'solid'},faces:['n1.top'],distance:3},{kind:'offset-face',id:'n3',parent:{node:2,side:'solid'},faces:['n1.top'],distance:2}],outputs:{b3:{node:3,side:'solid'}},nextId:4};
const f=await createFlow({name:'project-restore-admission',output:process.argv[2],envFrozen:'D1340_SOURCE_FROZEN',initialFiles:pins,requiredFrozen:pins,qualification:'Autosave and named-version native Offset admission preserves accepted document and stored recovery data.',limits:['Injected isolated stored recovery fixtures do not establish that ordinary editing can generate invalid snapshots. Stale async ownership is separately tested at hook level.'],inspectorSource:`
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateDoc} from '@barocss/cad-model/engine/evaluate';
import {offsetFaceCommand} from '@barocss/cad-model/app/profileCommands';
import {makeVersions,makeVersion} from '@barocss/cad-model/versions/log';
import {encodeStudioFile,encodeStudioSnapshot} from '@barocss/cad-model/engine/container';
const seed=JSON.parse(readFileSync(process.argv[2],'utf8'));
let base={...seed,nodes:seed.nodes.slice(0,2),outputs:{b1:{node:1,side:'solid'}},nextId:2};
for(const d of [3,2]){const result=evaluateDoc(base,0);assert.ok(result.ok);const face=result.bodies[0].mesh.faces.findIndex(f=>f.name==='n1.top');assert.ok(face>=0);base=offsetFaceCommand.build({doc:base,bodies:result.bodies,selection:{faces:[{body:0,face}],edges:[],bodies:[]}}, {d});}
const invalid=structuredClone(base);invalid.nodes[2].distance=5;
const restored=structuredClone(base);restored.nodes[2].distance=2;
const good=evaluateDoc(base,0),bad=evaluateDoc(invalid,0),repaired=evaluateDoc(restored,0);
assert.equal(good.ok,true,JSON.stringify(good));assert.equal(bad.ok,false);assert.equal(repaired.ok,true);
let log=makeVersions(invalid,{at:'2026-11-15T00:00:00Z',name:'Invalid Offset test'});
log=makeVersion(log,restored,{at:'2026-11-15T00:01:00Z',name:'Valid Offset test'}).log;
const {snapshots,...index}=log;
const files={'valid-offset.bcad':Array.from(encodeStudioFile(base)),'.barocss/autosave/valid-offset.bcad':Array.from(encodeStudioFile(invalid)),'.barocss/versions/valid-offset.bcad.json':Array.from(new TextEncoder().encode(JSON.stringify(index)))};
for(const [key,doc]of Object.entries(snapshots))files['.barocss/snapshots/'+key+'.bcad']=Array.from(encodeStudioSnapshot(doc,key));
console.log(JSON.stringify({files,base,invalid,restored,volume:good.bodies[0].volume,restoredVolume:repaired.bodies[0].volume,error:bad.error}));
`});
const button=(name,scope=f.page)=>scope.getByRole('button',{name,exact:true});
await f.run(async()=>{
 const fixtures=await f.inspect('recovery-fixtures',seed),base=fixtures.base;
 const slope=Math.tan(15*Math.PI/180), volume=z=>200*z-30*slope*z*z+4/3*slope*slope*z*z*z;
 assert.ok(Math.abs(fixtures.volume-volume(17))<1e-7);assert.ok(Math.abs(fixtures.restoredVolume-volume(16))<1e-7);
 for(const width of [1024,1440]){
  await f.newPage();await f.page.setViewportSize({width,height:900});const page=f.page,project=`D1340 recovery ${width}`;
  const files=fixtures.files;
  await page.evaluate(async({project,files})=>{
   let root=await navigator.storage.getDirectory();root=await root.getDirectoryHandle('projects',{create:true});root=await root.getDirectoryHandle(project,{create:true});
   for(const[path,bytes]of Object.entries(files)){let dir=root;const names=path.split('/');for(const name of names.slice(0,-1))dir=await dir.getDirectoryHandle(name,{create:true});const stream=await(await dir.getFileHandle(names.at(-1),{create:true})).createWritable();await stream.write(new Uint8Array(bytes));await stream.close();}
  },{project,files});
  const readFiles=()=>page.evaluate(async project=>{let root=await(await navigator.storage.getDirectory()).getDirectoryHandle('projects');root=await root.getDirectoryHandle(project);const result={};async function read(dir,prefix=''){for await(const[name,handle]of dir.entries()){const path=prefix+name;if(handle.kind==='directory')await read(handle,path+'/');else result[path]=Array.from(new Uint8Array(await(await handle.getFile()).arrayBuffer()));}}await read(root);return result;},project);
  await button('Project and versions').click();const panel=page.getByRole('complementary',{name:'Versions panel',exact:true});await panel.getByLabel('Browser project name',{exact:true}).fill(project);await button('Project in this browser',panel).click();await button('Open valid-offset.bcad',panel).click();await f.same(base);
  const offer=panel.getByLabel('Autosaved work',{exact:true});await offer.waitFor();
  const prior=await readFiles(),before=await f.snapshot(`${width}-before-restore`),undo=await button('Undo').isEnabled(),redo=await button('Redo').isEnabled();
  await button('Restore autosaved work',offer).click();await f.waitToast(/Could not restore autosaved work.*valid-offset.bcad.*Offset face:/);await f.same(base);await offer.waitFor();assert.equal(await button('Undo').isEnabled(),undo);assert.equal(await button('Redo').isEnabled(),redo);assert.deepEqual(await readFiles(),prior);await f.snapshot(`${width}-autosave-refused`);
  await f.dismissToasts();await button('Restore Invalid Offset test',panel).click();await f.waitToast(/Could not restore version.*Invalid Offset test.*valid-offset.bcad.*Offset face:/);await f.same(base);assert.deepEqual(await readFiles(),prior);await f.snapshot(`${width}-named-refused`);
  await f.dismissToasts();await button('Restore Valid Offset test',panel).click();await f.same(fixtures.restored);await page.getByLabel('Unsaved changes',{exact:true}).waitFor();assert.deepEqual(await readFiles(),prior);assert.ok(Math.abs((await f.bodies()).bodies[0].volume-volume(16))<1e-7);await f.snapshot(`${width}-valid-named-restored`);
  await button('Undo').click();await f.same(base);await button('Redo').click();await f.same(fixtures.restored);assert.deepEqual(await readFiles(),prior);
  // A separate clean browser context proves a valid autosave restoration, without overwriting a refused copy.
  await f.newPage();await f.page.setViewportSize({width,height:900});const validProject=`D1340 valid autosave ${width}`;
  await f.page.evaluate(async({project,doc,base})=>{let root=await(await navigator.storage.getDirectory()).getDirectoryHandle('projects',{create:true});root=await root.getDirectoryHandle(project,{create:true});const saved=await(await root.getFileHandle('valid-offset.bcad',{create:true})).createWritable();await saved.write(JSON.stringify(base));await saved.close();let auto=await(await root.getDirectoryHandle('.barocss',{create:true})).getDirectoryHandle('autosave',{create:true});const w=await(await auto.getFileHandle('valid-offset.bcad',{create:true})).createWritable();await w.write(JSON.stringify(doc));await w.close();},{project:validProject,doc:fixtures.restored,base});
  await button('Project and versions').click();const p=f.page.getByRole('complementary',{name:'Versions panel',exact:true});await p.getByLabel('Browser project name',{exact:true}).fill(validProject);await button('Project in this browser',p).click();await button('Open valid-offset.bcad',p).click();await f.same(base);await button('Restore autosaved work',p).click();await f.same(fixtures.restored);await f.page.getByLabel('Unsaved changes',{exact:true}).waitFor();await f.snapshot(`${width}-valid-autosave-restored`);
  f.report.observations.push({width,volume:fixtures.volume,restoredVolume:fixtures.restoredVolume,storedFilesPreserved:Object.keys(prior).length,autosaveRejected:true,namedRejected:true,validNamedUndoRedo:true,validAutosave:true,sourceBytesHash:sha256(JSON.stringify(files)),beforeNodes:before.doc.nodes.length});
 }
});
