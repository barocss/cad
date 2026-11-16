import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createFlow} from './flow-helper.mjs';
import {clickModelCommand} from './model-rail-helper.mjs';
const pins=['packages/barocss-cad/src/part/part-transform.ts','packages/barocss-cad/src/brep/brep-check-geometry.ts','apps/cad-studio/src/ui/Hud.tsx','apps/cad-studio/src/ui/NodeEditor.tsx'];
const f=await createFlow({name:'scale-admission',output:process.argv[2],envFrozen:'D1337_SOURCE_FROZEN',initialFiles:pins,requiredFrozen:pins,qualification:'Scale refuses empty or planar-sliver results before document adoption and preserves valid small geometry.',limits:['Desktop WebGPU Box fixture at two viewport widths. Broad curved import, manufacturing tolerances and assistive technology are not browser-qualified.'],inspectorSource:`
import {readFileSync} from 'node:fs';
import {partSnapshot} from '@barocss/cad-model/engine/part';
import {checkBrep,massPropertiesOf} from '@barocss/cad';
const doc=JSON.parse(readFileSync(process.argv[2],'utf8'));
console.log(JSON.stringify(partSnapshot(doc).outputs.map(o=>({bodies:o.brep.bodies.length,faces:o.brep.faces.length,vertices:o.brep.vertices.map(v=>v.point),valid:checkBrep(o.brep,{strict:true}).valid,volume:massPropertiesOf(o).volume}))));
`});
const button=(name,scope=f.page)=>scope.getByRole('button',{name,exact:true});
const hud=()=>f.page.getByRole('dialog',{name:'Scale',exact:true});
const factor=(scope=hud())=>scope.getByLabel('Factor',{exact:true});
const settled=()=>f.page.waitForFunction(()=>document.querySelector('.hud .status')?.textContent?.trim()==='preview',null,{timeout:60000});
await f.run(async()=>{
 const seed=JSON.parse(await readFile(resolve(f.app,'test/fixtures/bracket.bcad'),'utf8')); seed.nodes[0].min=[10,20];seed.nodes[0].max=[22,28];seed.nodes[1].from=30;
 const file=join(process.argv[2],'box.bcad');await writeFile(file,JSON.stringify(seed));
 for(const width of [1024,1440]){
  await f.newPage();await f.openFile(file,2);await f.page.setViewportSize({width,height:900});const base=await f.doc();
  await f.page.getByRole('complementary',{name:'Browser',exact:true}).locator('.ol:not(.ol-step)').first().click();await clickModelCommand(f.page,'Modify','Scale');await hud().waitFor();
  for(const [i,label] of ['Pivot X','Pivot Y','Pivot Z'].entries())await hud().getByLabel(label,{exact:true}).fill(String([4,-6,10][i]));
  for(const value of ['0','-1','1001']){
   await factor().fill(value);await hud().getByText('Unitless factor · greater than 0 and at most 1000',{exact:true}).waitFor();await hud().locator('.status.error').waitFor();
   assert.equal(await factor().evaluate(e=>e.validity.valid),false);assert.equal(await button('Apply',hud()).isEnabled(),false);assert.doesNotMatch(await hud().innerText(),/Enter a valid Factor|Undo/);await f.same(base);
  }
  for(const value of ['0.000000005','0.00000001','0.00000002']){
   await factor().fill(value);await hud().getByText(/Increase.*Factor|increase.*factor/).first().waitFor();assert.equal(await button('Apply',hud()).isEnabled(),false);await f.same(base);await f.snapshot(`${width}-refused-${value}`);
  }
  await factor().fill('0.005');await settled();assert.equal(await factor().evaluate(e=>e.validity.valid),true);await button('Apply',hud()).click();await hud().waitFor({state:'hidden'});await f.changed(base);const good=await f.doc();const [native]=await f.inspect(`${width}-native-small`,good);assert.equal(native.valid,true);assert.equal(native.bodies,1);assert.equal(native.faces,6);assert.equal(native.vertices.length,8);assert.ok(native.vertices.flat().every(Number.isFinite));assert.ok(Math.abs(native.volume-.000072)<1e-12);
  await f.undo();await f.same(base);await f.redo();await f.same(good);
  await f.openFeatureEditor(2);
  for(const value of ['0','-1','1001']){await factor(f.editor()).fill(value);assert.equal(await factor(f.editor()).evaluate(e=>e.validity.valid),false);assert.equal(await button('Apply',f.editor()).isDisabled(),true);await f.same(good);}
  await factor(f.editor()).fill('0.005');assert.equal(await factor(f.editor()).evaluate(e=>e.validity.valid),true);await button('Apply',f.editor()).click();await f.editor().waitFor({state:'hidden'});await f.same(good);
  await f.openFeatureEditor(2);await factor(f.editor()).fill('0.00000002');await button('Apply',f.editor()).click();await f.editor().getByText(/Increase.*Factor|increase.*factor/).first().waitFor();await f.same(good);await f.snapshot(`${width}-history-refused`);await f.closeEditor();
  const saved=await f.save(`${width}-valid-small`);await f.freshOpen(saved.file,good,`${width}-valid-reopened`);
  await f.page.setViewportSize({width,height:900});
  await f.openFile(file,2);await f.page.getByRole('button',{name:'Top',exact:true}).click();
  await f.page.getByRole('complementary',{name:'Browser',exact:true}).locator('.ol:not(.ol-step)').first().click();await clickModelCommand(f.page,'Modify','Scale');await factor().fill('0.1');await settled();
  const cube=f.page.locator('[data-gizmo="scaleX"]');await cube.waitFor();const r=await cube.boundingBox();assert.ok(r);
  const origin=await f.page.evaluate(()=>window.__studioScreenOf([16,24,33]));const start=[r.x+r.width/2,r.y+r.height/2],end=[origin[0]-(start[0]-origin[0])*.4,origin[1]-(start[1]-origin[1])*.4];
  await f.page.keyboard.down('Shift');await f.page.mouse.move(...start);await f.page.mouse.down();await f.page.mouse.move(...end,{steps:12});
  await f.page.waitForFunction(()=>Number(document.querySelector('input[aria-label="Factor"]')?.value)>0&&Number(document.querySelector('input[aria-label="Factor"]')?.value)<.1);
  assert.match(await f.page.locator('svg').allTextContents().then(x=>x.join(' ')),/relative ×/);
  await f.page.mouse.up();await f.page.keyboard.up('Shift');await settled();const dragged=Number(await factor().inputValue());assert.equal(dragged,.001);await f.same(base);
  await factor().fill('0.1');await settled();await button('Apply',hud()).click();await f.changed(base);const dragApplied=await f.doc();const [dragNative]=await f.inspect(width+'-drag-recovered',dragApplied);assert.ok(Math.abs(dragNative.volume-.576)<1e-9);await f.undo();await f.same(base);await f.redo();await f.same(dragApplied);
  await f.openFile(saved.file,good.nodes.length);await f.same(good);
  const bad=structuredClone(good);bad.nodes.at(-1).factor=5e-9;const badFile=join(process.argv[2],`${width}-legacy-empty.bcad`);await writeFile(badFile,JSON.stringify(bad));
  await f.page.setInputFiles('input[aria-label="Model file"]',badFile);await f.page.getByText(/Increase.*Factor|increase.*factor/).first().waitFor();assert.deepEqual(await f.doc(),bad);const failed=await f.snapshot(`${width}-legacy-open-refused`);assert.equal(failed.bodies.fresh,false);await f.page.getByText('Previous result · model evaluation failed',{exact:true}).waitFor();
  await f.page.locator('.history .hs[data-node-index="2"]').click();await f.editor().waitFor();await factor(f.editor()).fill('0.005');await f.applyEditor(bad,`${width}-legacy-repaired`);await f.same(good);await f.ready();
  f.report.observations??=[];f.report.observations.push({width,refused:[5e-9,1e-8,2e-8],validFactor:.005,native,historyPreserved:true,legacyOpenMarkedStale:true,legacyHistoryRecovery:true,undoRedo:true});
 }
});
