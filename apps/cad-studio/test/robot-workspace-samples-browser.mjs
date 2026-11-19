import assert from 'node:assert/strict';
import {readFile,writeFile,statfs} from 'node:fs/promises';
import {resolve,isAbsolute,relative,join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createFlow,sha256} from './flow-helper.mjs';
const repo=resolve(import.meta.dirname,'../../..'),output=process.argv[2];
assert.ok(output&&isAbsolute(output)&&relative(repo,output).startsWith('../'));
const expected=process.env.WORKSPACE_SAMPLES_HEAD;assert.ok(expected,'pin reviewed HEAD');
assert.equal(execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim(),expected);
const contactOnly=process.argv.includes('--contact-only');
const fixture=`packages/barocss-cad/conformance/rm/${contactOnly?'ccd-post':'chain-2r'}/case.json`;
const pins=[fixture,'apps/cad-studio/test/robot-workspace-samples-browser.mjs','apps/cad-studio/src/robot/RobotWorkspacePanel.tsx','packages/barocss-cad-model/src/robot/workspace.ts','apps/cad-studio/src/robot/RobotInspector.tsx'];
const f=await createFlow({name:'robot-workspace-samples',output,envFrozen:'WORKSPACE_SAMPLES_FROZEN',initialFiles:pins,requiredFrozen:pins,
 qualification:'#69 sample admission refuses invalid UI inputs without replacing an accepted map; real JSON downloads account for requested integer poses.',
 limits:['Existing synthetic chain-2r or --contact-only ccd-post with pre-solved placements; maps only100,128,200; h10.','Default chain-2r may exclude zero. --contact-only checks ccd-post positive exclusion and real files, not dynamics.','No Physics/Motion activation, large sample execution or collision/accuracy certification.']});
const input=JSON.parse(await readFile(resolve(repo,fixture),'utf8')).input.document;
input.instances[0].position=[10,10,10];input.instances[1].position=[50,10,15];
const button=name=>f.page.getByRole('button',{name,exact:true});
async function reserve(label){const s=await statfs(output),available=s.bavail*s.bsize;f.report.observations.push({label,availableBytes:available});await f.persist();assert.ok(available>=2*1024**3,'2 GiB reserve reached; stop before next map');}
const bodyValues=state=>state.bodies.map(({key,volume,centroid})=>({key,volume,centroid}));
async function stable(before){await f.same(input);const after=await f.snapshot(before.label+'-preserved');assert.deepEqual(after.doc.instances,before.doc.instances);assert.deepEqual(bodyValues(after.bodies),bodyValues(before.bodies));assert.deepEqual(after.history,before.history);assert.equal(await f.page.getByLabel('Unsaved changes',{exact:true}).count(),0);}
async function downloaded(label){
 const pending=f.page.waitForEvent('download');await button('Download workspace').click();const d=await pending;
 const file=join(f.output,label+'-download.json');await d.saveAs(file);assert.equal(await d.failure(),null);const bytes=await readFile(file),map=JSON.parse(bytes);
 f.report.files.push({file,sha256:sha256(bytes),bytes:bytes.length,name:d.suggestedFilename(),boundary:'actual public JSON download; no interception'});return {map,bytes,file};
}
function accounting(map,n){
 assert.equal(map.samples,n);assert.equal(map.h,10);assert.ok(Number.isInteger(map.excluded)&&map.excluded>=0&&map.excluded<=n);
 for(const v of map.voxels){assert.ok(Number.isInteger(v.count)&&v.count>0);assert.equal(v.c.length,3);assert.ok(v.c.every(Number.isFinite));assert.ok(Number.isFinite(v.w));}
 const sum=map.voxels.reduce((s,v)=>s+v.count,0);assert.equal(sum+map.excluded,n);return sum;
}
await f.run(async()=>{
 await reserve('before-browser');await f.newPage();
 const path=join(f.output,'workspace-source-solved.bcad');await writeFile(path,JSON.stringify(input));f.report.files.push({file:path,sha256:sha256(await readFile(path)),source:fixture,adjustment:'two already-solved instance placements only'});
 await f.openFile(path,input.nodes.length);await f.same(input);await f.page.getByLabel('Workspace samples',{exact:true}).waitFor();
 const samples=f.page.getByLabel('Workspace samples',{exact:true}),summary=f.page.getByRole('status',{name:'Workspace summary',exact:true});
 assert.equal(await samples.getAttribute('step'),'1');assert.equal(await samples.getAttribute('min'),'100');assert.equal(await samples.getAttribute('max'),'200000');
 await f.page.getByLabel('Workspace voxel',{exact:true}).fill('10');await f.page.getByLabel('Workspace contact-free',{exact:true}).uncheck();

 if(contactOnly){
  const baseline=await f.snapshot('contact-source');await samples.fill('128');
  for(const free of [false,true]){
   await reserve('contact-'+free);
   await f.page.getByLabel('Workspace contact-free',{exact:true}).setChecked(free);
   await button('Map workspace').click();
   await f.page.waitForFunction(free=>{const text=document.querySelector('[aria-label="Workspace summary"]')?.textContent??'';return text.includes('Workspace of 128 poses')&&text.includes('in self-contact left out')===free;},free);
   const label=free?'contact-on':'contact-off',result=await downloaded(label),sum=accounting(result.map,128);
   if(free)assert.ok(result.map.excluded>0,'ccd-post must exercise positive exclusion');
   else {assert.equal(result.map.excluded,0);assert.equal(sum,128);}
   const text=await summary.innerText();
   if(free)assert.ok(text.includes('('+result.map.excluded+' in self-contact left out)'));
   await f.snapshot(label+'-snapshot');
   assert.deepEqual(await readFile(result.file),result.bytes);
   const disk=JSON.parse(execFileSync('python3',['-I','-c',
    'import json,sys; m=json.load(open(sys.argv[1])); n=m["samples"]; e=m["excluded"]; c=sum(v["count"] for v in m["voxels"]); assert type(n) is int and n==128; assert type(e) is int and 0<=e<=n; assert all(type(v["count"]) is int and v["count"]>0 for v in m["voxels"]); assert c+e==n; print(json.dumps({"samples":n,"excluded":e,"voxelCountSum":c,"occupiedVoxels":len(m["voxels"])}))',result.file],{encoding:'utf8'}));
   assert.equal(disk.excluded,result.map.excluded);assert.equal(disk.voxelCountSum,sum);
   f.report.observations.push({contactFree:free,...disk,summary:text,file:result.file,sha256:sha256(result.bytes)});
   await stable(baseline);
   if(free){const repeat=await downloaded('contact-on-repeat');assert.deepEqual(repeat.bytes,result.bytes);}
  }
  await button('Hide workspace').click();await summary.waitFor({state:'hidden'});
  await f.page.waitForFunction(()=>document.querySelector('.viewport')?.dataset.renderer==='webgpu'?(window.__studioOverlayLines?.().cloud??0)===0:!document.querySelector('[aria-label="Workspace map"]'));
  await stable(baseline);assert.equal(f.report.downloads.length,3);await reserve('contact-finished');return;
 }
 const baseline=await f.snapshot('01-opened');await samples.fill('100');await button('Map workspace').click();await summary.waitFor();
 const accepted=await downloaded('02-valid100');accounting(accepted.map,100);assert.equal(accepted.map.excluded,0);
 const acceptedText=await summary.innerText();await f.snapshot('02-valid100');
 for(const [label,value] of [['below','6'],['fractional','100.5'],['blank',''],['above','200001']]){
  await reserve('invalid-'+label);await samples.fill(value);
  assert.equal(await button('Map workspace').isDisabled(),true);assert.equal(await samples.getAttribute('aria-invalid'),'true');
  const id=await samples.getAttribute('aria-describedby');assert.ok(id);
  const error=await samples.evaluate(el=>{const e=document.getElementById(el.getAttribute('aria-describedby'));return e&&{role:e.getAttribute('role'),text:e.textContent};});
  assert.equal(error?.role,'status');assert.match(error.text,/whole number from 100 to 200000/);
  assert.equal(await summary.innerText(),acceptedText);const retained=await downloaded('03-'+label+'-retained');assert.deepEqual(retained.bytes,accepted.bytes);assert.deepEqual(retained.map,accepted.map);
  await f.same(input);assert.deepEqual(bodyValues(await f.bodies()),bodyValues(baseline.bodies));await f.snapshot('03-'+label);
 }
 for(const [n,free] of [[128,false],[200,true]]){
  await reserve('before-valid'+n);await samples.fill(String(n));await f.page.getByLabel('Workspace contact-free',{exact:true}).setChecked(free);
  assert.equal(await samples.getAttribute('aria-invalid'),'false');assert.equal(await samples.getAttribute('aria-describedby'),null);assert.equal(await button('Map workspace').isDisabled(),false);
  await button('Map workspace').click();await f.page.waitForFunction(n=>document.querySelector('[aria-label="Workspace summary"]')?.textContent.includes('Workspace of '+n+' poses'),n);
  const result=await downloaded('04-valid'+n);const sum=accounting(result.map,n);if(!free)assert.equal(result.map.excluded,0);
  f.report.observations.push({requested:n,contactFree:free,excluded:result.map.excluded,voxelCountSum:sum,contactPositiveClaim:false});
  await f.same(input);assert.deepEqual(bodyValues(await f.bodies()),bodyValues(baseline.bodies));await f.snapshot('04-valid'+n);
 }
 await button('Hide workspace').click();await summary.waitFor({state:'hidden'});
 await f.page.waitForFunction(()=>document.querySelector('.viewport')?.dataset.renderer==='webgpu'?(window.__studioOverlayLines?.().cloud??0)===0:!document.querySelector('[aria-label="Workspace map"]'));
 await stable(baseline);await reserve('finished');assert.equal(f.report.downloads.length,7);
});
