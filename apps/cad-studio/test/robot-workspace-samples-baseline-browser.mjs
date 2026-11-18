import assert from 'node:assert/strict';
import {readFile,writeFile,statfs} from 'node:fs/promises';
import {resolve,isAbsolute,relative,join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createFlow,sha256} from './flow-helper.mjs';
const repo=resolve(import.meta.dirname,'../../..'),output=process.argv[2];
assert.ok(output&&isAbsolute(output)&&relative(repo,output).startsWith('../'));
const expected=process.env.WORKSPACE_BASELINE_HEAD;assert.ok(expected,'pin reviewed HEAD');
assert.equal(execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim(),expected);
const fixture='packages/barocss-cad/conformance/rm/chain-2r/case.json';
const pins=[fixture,'apps/cad-studio/test/robot-workspace-samples-baseline-browser.mjs','apps/cad-studio/test/scripts/run-workspace-samples-baseline.sh','apps/cad-studio/src/robot/RobotWorkspacePanel.tsx','packages/barocss-cad-model/src/robot/workspace.ts','apps/cad-studio/src/robot/RobotInspector.tsx'];
const f=await createFlow({name:'robot-workspace-samples-baseline',output,envFrozen:'WORKSPACE_SAMPLES_BASELINE_FROZEN',initialFiles:pins,requiredFrozen:pins,
 qualification:'Exploratory #69 actual UI sample admission and downloaded workspace accounting; baseline mismatch hypothesis, not a fixed acceptance test.',
 limits:['Synthetic chain-2r with pre-solved placements. Three maps only: N6,100.5,100; h10 contact-free false.','No Physics/Motion, large sample stress, accuracy/collision certification or product modifications.','PASS means the specified baseline observations were reproduced, not that fractional sample reporting is correct.']});
const input=JSON.parse(await readFile(resolve(repo,fixture),'utf8')).input.document;
input.instances[0].position=[10,10,10];input.instances[1].position=[50,10,15];
const button=name=>f.page.getByRole('button',{name,exact:true});
async function reserve(label){const s=await statfs(output),available=s.bavail*s.bsize;f.report.observations.push({label,availableBytes:available});await f.persist();assert.ok(available>=2*1024**3,'2 GiB reserve reached; stop before next map');}
const bodyValues=state=>state.bodies.map(({key,volume,centroid})=>({key,volume,centroid}));
async function stable(before){await f.same(input);const after=await f.snapshot(before.label+'-preserved');assert.deepEqual(after.doc.instances,before.doc.instances);assert.deepEqual(bodyValues(after.bodies),bodyValues(before.bodies));assert.deepEqual(after.history,before.history);assert.equal(await f.page.getByLabel('Unsaved changes',{exact:true}).count(),0);}
await f.run(async()=>{
 await reserve('before-browser');await f.newPage();
 const path=join(f.output,'chain-2r-solved.bcad');await writeFile(path,JSON.stringify(input));f.report.files.push({file:path,sha256:sha256(await readFile(path)),source:fixture,adjustment:'two already-solved instance placements only'});
 await f.openFile(path,input.nodes.length);await f.same(input);await f.page.getByLabel('Workspace samples',{exact:true}).waitFor();
 const samples=f.page.getByLabel('Workspace samples',{exact:true});
 const constraints={min:await samples.getAttribute('min'),max:await samples.getAttribute('max'),step:await samples.getAttribute('step')};
 assert.deepEqual(constraints,{min:'100',max:'200000',step:'1000'});f.report.observations.push({label:'existing UI attributes',constraints});
 await f.page.getByLabel('Workspace voxel',{exact:true}).fill('10');await f.page.getByLabel('Workspace contact-free',{exact:true}).uncheck();
 const baseline=await f.snapshot('01-opened');const maps=[];
 for(const n of [6,100.5,100]){
  await reserve('before-N'+n);await samples.fill(String(n));assert.equal(await button('Map workspace').isDisabled(),false);
  await button('Map workspace').click();const summary=f.page.getByRole('status',{name:'Workspace summary',exact:true});await summary.waitFor();
  assert.match(await summary.innerText(),new RegExp('Workspace of '+String(n).replace('.','\\.')+' poses'));
  const pending=f.page.waitForEvent('download');await button('Download workspace').click();const d=await pending;
  const file=join(f.output,'workspace-N'+n+'.json');await d.saveAs(file);assert.equal(await d.failure(),null);const bytes=await readFile(file),map=JSON.parse(bytes);
  assert.equal(map.samples,n);assert.equal(map.h,10);assert.equal(map.excluded,0);assert.ok(map.voxels.length>0);
  for(const v of map.voxels){assert.ok(Number.isInteger(v.count)&&v.count>0);assert.equal(v.c.length,3);assert.ok(v.c.every(Number.isFinite));assert.ok(Number.isFinite(v.w));}
  const count=map.voxels.reduce((sum,v)=>sum+v.count,0);assert.equal(count,Math.floor(n));
  f.report.files.push({file,sha256:sha256(bytes),bytes:bytes.length,name:d.suggestedFilename(),boundary:'actual public JSON download; no blob interception'});
  f.report.observations.push({requested:n,reported:map.samples,voxelCountSum:count,excluded:map.excluded,accounted:count+map.excluded,reportMatchesAccounting:map.samples===count+map.excluded});maps.push(map);
  await f.same(input);assert.deepEqual(bodyValues(await f.bodies()),bodyValues(baseline.bodies));await f.snapshot('02-N'+n);await button('Hide workspace').click();await summary.waitFor({state:'hidden'});
  await f.page.waitForFunction(()=>document.querySelector('.viewport')?.dataset.renderer==='webgpu'?(window.__studioOverlayLines?.().cloud??0)===0:!document.querySelector('[aria-label="Workspace map"]'));await reserve('after-N'+n);
 }
 const {samples:fractional,...fractionalMap}=maps[1],{samples:integer,...integerMap}=maps[2];assert.equal(fractional,100.5);assert.equal(integer,100);assert.deepEqual(fractionalMap,integerMap);
 await stable(baseline);await reserve('finished');assert.equal(f.report.downloads.length,3);
});
