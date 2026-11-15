// D1342: isolated stored recovery fixtures, never browser model-state injection.
import assert from 'node:assert/strict';
import {createFlow,sha256} from './flow-helper.mjs';
const pins=['apps/cad-studio/src/storage/useProject.ts','apps/cad-studio/src/storage/VersionsPanel.tsx','apps/cad-studio/src/files/documentFile.ts','apps/cad-studio/src/App.tsx'];
const seed={format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nodes:[{kind:'sketch',id:'n0',profile:'rectangle',min:[0,0],max:[20,10]},{kind:'extrude',id:'n1',sketch:0,height:12,draft:15},{kind:'offset-face',id:'n2',parent:{node:1,side:'solid'},faces:['n1.top'],distance:3},{kind:'offset-face',id:'n3',parent:{node:2,side:'solid'},faces:['n1.top'],distance:2}],outputs:{b3:{node:3,side:'solid'}},nextId:4};
const f=await createFlow({name:'project-merge-admission',output:process.argv[2],envFrozen:'D1342_SOURCE_FROZEN',initialFiles:pins,requiredFrozen:pins,qualification:'Merged geometry admission precedes snapshot and head writes.',limits:['Injected isolated stored recovery fixtures do not establish that ordinary editing can generate invalid snapshots. Stale async ownership is separately tested at hook level.'],inspectorSource:`
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateDoc} from '@barocss/cad-model/engine/evaluate';
import {offsetFaceCommand} from '@barocss/cad-model/app/profileCommands';
import {makeVersions,makeVersion,makeBranch,applyBranch} from '@barocss/cad-model/versions/log';
import {applyMerge} from '@barocss/cad-model/versions/merge';
import {encodeStudioFile,encodeStudioSnapshot} from '@barocss/cad-model/engine/container';
const seed=JSON.parse(readFileSync(process.argv[2],'utf8'));
let base={...seed,nodes:seed.nodes.slice(0,2),outputs:{b1:{node:1,side:'solid'}},nextId:2};
for(const d of [2,2]){const result=evaluateDoc(base,0);assert.ok(result.ok);const face=result.bodies[0].mesh.faces.findIndex(f=>f.name==='n1.top');assert.ok(face>=0);base=offsetFaceCommand.build({doc:base,bodies:result.bodies,selection:{faces:[{body:0,face}],edges:[],bodies:[]}}, {d});}
const common=base;
base=structuredClone(common);base.nodes[2].distance=4;
const invalid=structuredClone(common);invalid.nodes[3].distance=4;
const other=structuredClone(common);other.nodes[3].distance=2.5;
const conflict=structuredClone(common);conflict.nodes[2].distance=1;conflict.nodes[3].distance=4;
for(const doc of [common,base,invalid,other,conflict])assert.equal(evaluateDoc(doc,0).ok,true);
let log=makeVersions(common,{at:'2026-11-15T00:00:00Z',name:'Baseline'});
for(const name of ['second-offset','safe-offset','conflicting-offset'])log=makeBranch(log,name);
log=makeVersion(log,base,{at:'2026-11-15T00:01:00Z',name:'Main first4'}).log;
let working=base;let i=2;
for(const [name,doc]of [['second-offset',invalid],['safe-offset',other],['conflicting-offset',conflict]]){log=applyBranch(log,name,working).log;log=makeVersion(log,doc,{at:'2026-11-15T00:0'+String(i++)+':00Z',name}).log;working=doc;}
log=applyBranch(log,'main',working).log;
const bad=applyMerge(log,{from:'second-offset',working:base,at:'2026-11-15T00:06:00Z'});assert.ok(!('conflicts'in bad));assert.equal(evaluateDoc(bad.doc,0).ok,false);
const good=applyMerge(log,{from:'safe-offset',working:base,at:'2026-11-15T00:07:00Z'});assert.ok(!('conflicts'in good));const restored=good.doc,repaired=evaluateDoc(restored,0);assert.ok(repaired.ok);
const rejected=applyMerge(log,{from:'conflicting-offset',working:base,at:'2026-11-15T00:08:00Z'});assert.ok('conflicts'in rejected);
const {snapshots,...index}=log;
const files={'valid-offset.bcad':Array.from(encodeStudioFile(base)),'.barocss/versions/valid-offset.bcad.json':Array.from(new TextEncoder().encode(JSON.stringify(index)))};
for(const [key,doc]of Object.entries(snapshots))files['.barocss/snapshots/'+key+'.bcad']=Array.from(encodeStudioSnapshot(doc,key));
console.log(JSON.stringify({files,base,invalid,restored,volume:evaluateDoc(base,0).bodies[0].volume,restoredVolume:repaired.bodies[0].volume,conflicts:rejected.conflicts}));
`});
const button=(name,scope=f.page)=>scope.getByRole('button',{name,exact:true});
await f.run(async()=>{
 const fixtures=await f.inspect('merge-fixtures',seed),base=fixtures.base;
 const slope=Math.tan(15*Math.PI/180),volume=z=>200*z-30*slope*z*z+4/3*slope*slope*z*z*z;
 assert.ok(Math.abs(fixtures.volume-volume(18))<1e-7);assert.ok(Math.abs(fixtures.restoredVolume-volume(18.5))<1e-7);
 for(const width of [1024,1440]){
  await f.newPage();await f.page.setViewportSize({width,height:900});const page=f.page,project=`D1342 merge ${width}`,files=fixtures.files;
  await page.evaluate(async({project,files})=>{let root=await(await navigator.storage.getDirectory()).getDirectoryHandle('projects',{create:true});root=await root.getDirectoryHandle(project,{create:true});for(const[path,bytes]of Object.entries(files)){let dir=root;const names=path.split('/');for(const name of names.slice(0,-1))dir=await dir.getDirectoryHandle(name,{create:true});const w=await(await dir.getFileHandle(names.at(-1),{create:true})).createWritable();await w.write(new Uint8Array(bytes));await w.close();}},{project,files});
  const panel=()=>page.getByRole('complementary',{name:'Versions panel',exact:true});
  const attach=async()=>{if(!await panel().isVisible())await button('Project and versions').click();await panel().getByLabel('Browser project name',{exact:true}).fill(project);await button('Project in this browser',panel()).click();await button('Open valid-offset.bcad',panel()).click();await f.same(base);};
  const readFiles=()=>page.evaluate(async project=>{let root=await(await navigator.storage.getDirectory()).getDirectoryHandle('projects');root=await root.getDirectoryHandle(project);const result={};async function read(dir,prefix=''){for await(const[name,handle]of dir.entries()){const path=prefix+name;if(handle.kind==='directory')await read(handle,path+'/');else result[path]=Array.from(new Uint8Array(await(await handle.getFile()).arrayBuffer()));}}await read(root);return result;},project);
  await attach();const before=await readFiles(),undo=await button('Undo').isEnabled(),redo=await button('Redo').isEnabled();
  const merge=async name=>{await panel().getByLabel('Merge from',{exact:true}).selectOption(name);await button('Merge',panel()).click();};
  await merge('second-offset');await f.waitToast(/Could not merge.*second-offset.*Offset face:.*n3/);await f.same(base);assert.equal(await panel().getByLabel('Branch',{exact:true}).inputValue(),'main');assert.equal(await button('Undo').isEnabled(),undo);assert.equal(await button('Redo').isEnabled(),redo);assert.deepEqual(await readFiles(),before);await f.snapshot(`${width}-merge-refused`);
  await f.dismissToasts();await merge('conflicting-offset');const conflicts=panel().getByLabel('Merge conflicts',{exact:true});await conflicts.waitFor();assert.deepEqual(await readFiles(),before);const radios=conflicts.getByRole('radio',{name:/ ours$/});assert.ok(await radios.count());for(const radio of await radios.all())await radio.check();await button('Merge with these answers',conflicts).click();await f.waitToast(/Could not merge.*conflicting-offset.*Offset face:.*n3/);await f.same(base);assert.deepEqual(await readFiles(),before);await f.snapshot(`${width}-resolved-merge-refused`);
  await button('Close project',panel()).click();await page.reload();await f.ready();await attach();assert.deepEqual(await readFiles(),before);await f.snapshot(`${width}-reopened-original-head`);
  await merge('safe-offset');await f.same(fixtures.restored);assert.ok(Math.abs((await f.bodies()).bodies[0].volume-volume(18.5))<1e-7);const after=await readFiles();for(const[path,bytes]of Object.entries(before))if(!path.includes('/versions/'))assert.deepEqual(after[path],bytes);const oldLog=JSON.parse(Buffer.from(before['.barocss/versions/valid-offset.bcad.json']).toString()),newLog=JSON.parse(Buffer.from(after['.barocss/versions/valid-offset.bcad.json']).toString());assert.equal(newLog.versions.length,oldLog.versions.length+1);assert.equal(Object.keys(after).length,Object.keys(before).length+1);assert.notEqual(newLog.branches.find(b=>b.name==='main').head,oldLog.branches.find(b=>b.name==='main').head);await f.snapshot(`${width}-valid-merge`);
  await button('Undo').click();await f.same(base);await button('Redo').click();await f.same(fixtures.restored);
  f.report.observations.push({width,invalidMergeRefused:true,resolvedConflictRefused:true,allBytesPreservedOnRefusal:true,reopenedOriginalHead:true,validMergeVolume:fixtures.restoredVolume,newSnapshots:1,newVersions:1,undoRedo:true,sourceBytesHash:sha256(JSON.stringify(files))});
 }
});
