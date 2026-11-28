import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {resolve,isAbsolute,relative,join} from 'node:path';
import {createFlow,sha256} from './flow-helper.mjs';
import {clickModelCommand} from './model-rail-helper.mjs';
const repo=resolve(import.meta.dirname,'../../..'),output=process.argv[2];
assert.ok(output&&isAbsolute(output)&&relative(repo,output).startsWith('../'),'artifacts must be outside the repository');
const fixture='packages/barocss-cad-model/test/fixtures/block-cm.stl';
const fixtureBytes=await readFile(resolve(repo,fixture));
const stlSources=process.argv.includes('--stl-sources');
const pins=[fixture,'apps/cad-studio/test/model-rail-helper.mjs','apps/cad-studio/test/mesh-circle-browser.mjs','apps/cad-studio/src/App.tsx','apps/cad-studio/src/app/useStudioMeasurementReadouts.tsx',
 'apps/cad-studio/src/app/useMeshCircleMeasurement.ts','apps/cad-studio/src/ui/MeshCircleInspector.tsx','apps/cad-studio/src/ui/MeasurementInspector.tsx',
 'apps/cad-studio/src/viewport/vertexPick.ts','apps/cad-studio/src/viewport/useViewportPicking.ts',
 'packages/barocss-cad-model/src/engine/mesh.ts','packages/barocss-cad-model/src/app/meshCircle.ts',
 ...(stlSources ? ['apps/cad-studio/src/files/stlCornerProvenance.ts', 'apps/cad-studio/src/files/meshImportController.ts'] : [])];
const f=await createFlow({name:'mesh-circle',output,envFrozen:'MESH_CIRCLE_FROZEN',initialFiles:pins,requiredFrozen:pins,
 qualification:stlSources ? '#273 STL file corner occurrences of three selected evaluated welded endpoints.'
   : '#273 limited evaluated welded mesh vertex reference circle through actual pointer input.',
 limits:[stlSources ? 'One current clean STL import. Source-corner labels are absent after reopening the native snapshot.'
   : 'Evaluated endpoints alone do not qualify original-file provenance. Issue #273 remains partial.','One synthetic block-cm STL imported as cm; front orthographic visible corners. No arbitrary mesh/ring circularity claim.','No section/placed/preview UI coverage, numeric edge-case matrix or delayed callback race injection in this actual flow.','Read-only screen projection hook positions real pointer clicks; no state injection. UI values checked at displayed precision, not a numerical accuracy guarantee.','History comparison covers displayed feature rows, not internal Undo stack entries.','Raw product math is separately invoked with the actual displayed integer input coordinates; it is not a read of hidden UI calculation state.'],
 snapshotExtra:()=>({measurement:document.querySelector('aside[aria-label="Measurement"]')?.textContent??null}),
 inspectorSource:`
import {readFileSync} from 'node:fs';
import {meshCircle} from '@barocss/cad-model/app/meshCircle';
import {meshInMM,readMeshFile} from '@barocss/cad-model/engine/meshImport';
import {diagnoseMesh} from '@barocss/cad';
const points=JSON.parse(readFileSync(process.argv[2],'utf8'));
if(points.stl){
 const mesh=meshInMM(readMeshFile('alias.stl',Buffer.from(points.stl,'base64')),'mm');
 console.log(JSON.stringify(diagnoseMesh(mesh.positions,mesh.indices)));
}else console.log(JSON.stringify(meshCircle(points)));
`,
 oracleSource:String.raw`
import json,sys,math
q=json.load(sys.stdin)
# Right triangle corners on the front rectangle. Hypotenuse midpoint is circumcenter.
# Existing quantityText uses fmt's final two decimal display; this is not calculation tolerance.
assert q['raw']['ok'] is True
assert all(abs(x-y)<1e-10 for x,y in zip(q['raw']['center'],[20,0,5]))
assert abs(q['raw']['radius']-math.sqrt(425))<1e-10
assert abs(q['raw']['diameter']-2*math.sqrt(425))<1e-10
expected={'Reference center (mm)':[20,0,5], 'Reference radius (mm)':[math.sqrt(425)], 'Reference diameter (mm)':[2*math.sqrt(425)]}
for label,values in expected.items():
 actual=[float(x.strip()) for x in q['values'][label].split(',')]
 assert len(actual)==len(values) and all(math.isfinite(x) and abs(x-y)<=.00501 for x,y in zip(actual,values)),(label,actual,values)
n=[float(x.strip()) for x in q['values']['Reference plane normal'].split(',')]
assert len(n)==3 and abs(n[0])<.00501 and abs(abs(n[1])-1)<.00501 and abs(n[2])<.00501
assert q['values']['Reference radius (mm)']=='20.62'
assert q['values']['Reference diameter (mm)']=='41.23'
assert len(q['points'])==3
for line,p in zip(q['points'],[[0,0,10],[40,0,10],[40,0,0]]):
 xyz=[float(x.strip()) for x in line.rsplit(':',1)[1].removesuffix(' mm').split(',')]
 assert xyz==p,(xyz,p)
print(json.dumps({'status':'PASS','center':[20,0,5],'radius':math.sqrt(425),'diameter':2*math.sqrt(425),'basis':'independent right-triangle arithmetic against actual displayed evaluated welded vertices'}))
`});
const button=(name,scope=f.page)=>scope.getByRole('button',{name,exact:true});
const panel=()=>f.page.getByRole('complementary',{name:'Measurement',exact:true});
const points=[[0,0,10],[40,0,10],[40,0,0]],inside=[20,0,5];
async function openMesh(unit,file=resolve(repo,fixture)){
 await f.page.getByLabel('Model file',{exact:true}).setInputFiles(file);
 const dialog=f.page.getByRole('dialog',{name:'Mesh units',exact:true});await dialog.waitFor();
 await dialog.getByLabel('Mesh unit',{exact:true}).selectOption(unit);await button('Open',dialog).click();
 await dialog.waitFor({state:'hidden'});await f.page.waitForFunction(()=>window.__studioDoc?.nodes?.length===1&&window.__studioDoc.nodes[0].kind==='mesh');await f.ready();
}
async function begin(){
 if(!await panel().isVisible())await clickModelCommand(f.page,'Inspect','Measure');
 await button('Reference circle (mesh)',panel()).click();
 await panel().getByText('REFERENCE CIRCLE (MESH)',{exact:true}).waitFor();
 assert.match(await panel().innerText(),/Not original file vertex indices/);
}
async function view(){
 await button('Front',f.page.locator('.views')).click();
 const ortho=button('Ortho',f.page.locator('.views'));if(await ortho.getAttribute('aria-pressed')!=='true')await ortho.click();
 await f.page.getByTitle('Frame all (F)',{exact:true}).click();
}
async function pick(point,count,interior=inside){
 const [corner,center]=await f.page.evaluate(ps=>ps.map(p=>window.__studioScreenOf(p)),[point,interior]);
 assert.equal(corner?.length,2);assert.equal(center?.length,2);
 const delta=center.map((x,k)=>x-corner[k]),length=Math.hypot(...delta);assert.ok(length>0);
 const pixel=corner.map((x,k)=>x+3*delta[k]/length);
 assert.ok(await f.page.evaluate(([x,y])=>!!document.elementFromPoint(x,y)?.closest('canvas.vp-canvas'),pixel));
 await f.page.mouse.click(...pixel);
 await f.page.waitForFunction(n=>document.querySelectorAll('aside[aria-label="Measurement"] ol li').length===n,count);
}
async function read(){return panel().evaluate(el=>({points:[...el.querySelectorAll('ol li')].map(e=>e.textContent),values:Object.fromEntries([...el.querySelectorAll('dt')].map(e=>[e.textContent,e.nextElementSibling?.textContent]))}));}
async function checkCircle(label){
 const shown=await read();
 const xyz=shown.points.map(line=>line.split(':').at(-1).replace(' mm','').split(',').map(Number));
 const raw=await f.inspect(label+'-helper-raw',xyz);
 await f.runOracle({...shown,raw},label);
}
const stlLabels=()=>panel().locator('[aria-label="STL file corner occurrences"]');
async function checkStlCorners(unit) {
 const fileCornerCount=fixtureBytes.readUInt32LE(80)*3;
 assert.equal(fixtureBytes.length,84+50*fileCornerCount/3);
 const selected=points.map(point=>point.map(value=>value*unit/10));
 const expected=selected.map(at=>{
  const list=[];
  for(let i=0;i<fileCornerCount;i++){
   const facet=Math.floor(i/3),corner=i%3;
   const addr=84+facet*50+12+corner*12;
   if(at.every((value,k)=>value===fixtureBytes.readFloatLE(addr+k*4)*unit))list.push(i+1);
  }
  assert.ok(list.length>1 && list.length<=6);
  return list;
 });
 const observed=(await stlLabels().allTextContents()).map(text=>text.trim());
 assert.deepEqual(observed,expected.map(list=>`· STL corners ${list.join(', ')} (${list.length})`));
 f.report.observations.push({label:'file corner occurrences',unitScale:unit,selected,expected});
}
async function empty(){assert.equal(await panel().locator('ol li').count(),0);assert.equal(await panel().locator('dl').count(),0);}
await f.run(async()=>{
 f.report.files.push({fixture,sha256:sha256(fixtureBytes),provenance:'repository synthetic STL'});
 await f.newPage();await openMesh('cm');const original=await f.doc();await view();
 await begin();await empty();const before=await f.snapshot('01-ready');
 for(let i=0;i<3;i++)await pick(points[i],i+1);
 await panel().locator('dl').waitFor();await checkCircle('02-three-points');await f.same(original);
 if(stlSources) await checkStlCorners(10);
 const measured=await f.snapshot('02-measured');assert.deepEqual(measured.selection,before.selection);assert.deepEqual(measured.history,before.history);
 // Camera-only change must preserve the captured coordinates and displayed result.
 const captured=await read(),camera=await f.page.evaluate(()=>window.__studioCamera());
 await button('Iso',f.page.locator('.views')).click();
 await f.page.waitForFunction(old=>{const next=window.__studioCamera();return next.yaw!==old.yaw||next.pitch!==old.pitch;},camera);
 await f.snapshot('02-camera-changed');assert.deepEqual(await read(),captured);await view();
 await button('Reset reference circle',panel()).click();await empty();await f.same(original);
 await pick(points[0],1);await button('Two-target measurement',panel()).click();
 await button('Reference circle (mesh)',panel()).waitFor();await begin();await empty();
 await button('Done measuring',panel()).click();await panel().waitFor({state:'hidden'});await f.same(original);
 const pendingSave=f.page.waitForEvent('download');await button('Save').click();const downloaded=await pendingSave;
 const saved={file:join(f.output,'unmodified-import.bcad')};await downloaded.saveAs(saved.file);assert.equal(await downloaded.failure(),null);
 const savedBytes=await readFile(saved.file);assert.ok(savedBytes.length>0);f.report.files.push({file:saved.file,sha256:sha256(savedBytes),bytes:savedBytes.length,boundary:'actual native Save bytes; container-aware public fresh Open below verifies document equality, not JSON.parse'});await f.same(original);
 await begin();await pick(points[0],1);await f.snapshot('03-partial-before-source-change');
 await openMesh('mm');await f.changed(original);
 // Open may close Measure or retain an empty mode; neither may retain prior A/B/C.
 if(await panel().isVisible()){
  assert.equal(await panel().locator('ol li').count(),0);assert.equal(await panel().locator('dl').count(),0);
  await button('Done measuring',panel()).click();
 }
 await f.snapshot('04-source-change-cleared');
 if(stlSources){
  await view();await begin();
  for(let i=0;i<3;i++)await pick(points[i].map(value=>value/10),i+1,inside.map(value=>value/10));
  await checkStlCorners(1);await f.snapshot('04-millimetres-same-file-occurrences');
  await button('Done measuring',panel()).click();
  // Perturb the final occurrence of one corner by 2e-6 mm. Import retains it, then the native weld joins it again.
  const aliases=Buffer.from(fixtureBytes);
  let occurrence=-1;
  for(let facet=0;facet<aliases.readUInt32LE(80);facet++)for(let corner=0;corner<3;corner++){
   const address=84+50*facet+12+corner*12;
   if([0,0,1].every((value,axis)=>value===aliases.readFloatLE(address+axis*4)))occurrence=address;
  }
  assert.ok(occurrence>=0);
  aliases.writeFloatLE(0.000002,occurrence);
  const diagnosis=await f.inspect('source-reweld', {stl:aliases.toString('base64')});
  assert.deepEqual([diagnosis.closed,diagnosis.pieces,diagnosis.welded],[true,1,1]);
  const aliasFile=join(f.output,'secondary-weld.stl');
  await writeFile(aliasFile,aliases);
  await openMesh('mm',aliasFile);await view();await begin();
  for(let i=0;i<3;i++)await pick(points[i].map(value=>value/10),i+1,inside.map(value=>value/10));
  await panel().locator('dl').waitFor();assert.equal(await stlLabels().count(),0);
  await f.snapshot('04-native-reweld-omits-unproved-occurrences');
  await button('Done measuring',panel()).click();
  await f.openFile(saved.file,original.nodes.length);await f.same(original);await view();await begin();
  await pick(points[0],1);assert.equal(await stlLabels().count(),0);
  await f.snapshot('04-native-reopen-has-no-source-occurrences');
 }
 await f.freshOpen(saved.file,original,'05-fresh-open');await view();await begin();await empty();
 for(let i=0;i<3;i++)await pick(points[i],i+1);await panel().locator('dl').waitFor();await checkCircle('06-reopened-measure');await f.same(original);
 if(stlSources)assert.equal(await stlLabels().count(),0);
 await panel().focus();await f.page.keyboard.press('Escape');await panel().waitFor({state:'hidden'});await f.same(original);await f.snapshot('07-escape-cleared');
 f.report.observations.push({evaluatedWeldedOnly:true,actualPointerPicks:true,referenceNotCircularity:true,resetBackDoneEscape:true,sourceChangeCleared:true,saveFreshOpenOriginalUnchanged:true});
});
