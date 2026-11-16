import assert from 'node:assert/strict';
import {createFlow} from './flow-helper.mjs';
const pins=['apps/cad-studio/src/app/featureNumberInput.ts','apps/cad-studio/src/ui/Hud.tsx','apps/cad-studio/src/ui/NodeEditor.tsx','packages/barocss-cad-model/src/app/commands.ts'];
const f=await createFlow({name:'chamfer-distance-boundary',output:process.argv[2],envFrozen:'CHAMFER_DISTANCE_FROZEN',initialFiles:pins,requiredFrozen:pins,
 qualification:'Chamfer creation and History use positive distance bounds on a detached rounded inset.',limits:['Generated equivalent rounded inset fixture; desktop 1024/1440. No other chamfer topology claim.'],
 inspectorSource:`
import {readFileSync} from 'node:fs';
import {checkBrep,massPropertiesOf} from '@barocss/cad';
import {partSnapshot} from '@barocss/cad-model/engine/part';
import {emptyDoc} from '@barocss/cad-model/engine/doc';
import {detachRoundedInsetRecipe} from '@barocss/cad-model/sketch/internal/roundedInsetRecipe';
if(process.argv[3]==='"fixture"'){
 const points=[[2,0],[18,0],[20,2],[20,8],[18,10],[2,10],[0,8],[0,2]],centers=[[18,2],[18,8],[2,8],[2,2]],outer=points.map((_,i)=>'e'+(i+1));
 const segments=points.map((start,i)=>i%2===0?{kind:'line',start}:{kind:'arc',start,center:centers[(i-1)/2],direction:'ccw'});
 const doc={...emptyDoc(),nextId:20,nodes:[{kind:'sketch',id:'n7',profile:'loop',segments,sideTags:{outer}},{kind:'rounded-rectangle-inset',id:'n11',version:1,sourceSketch:0,sourceFeature:'n7',insetMM:1,sideMap:Object.fromEntries(outer.map((id,i)=>[id,'e'+(i+9)]))},{kind:'extrude',id:'n19',sketch:1,height:10}],outputs:{b19:{node:2,side:'solid'}}};
 console.log(JSON.stringify(detachRoundedInsetRecipe(doc,1)));
}else{const doc=JSON.parse(readFileSync(process.argv[2],'utf8')), {outputs:[body]}=partSnapshot(doc);console.log(JSON.stringify({valid:checkBrep(body.brep,{strict:true}).valid,volume:massPropertiesOf(body).volume}));}
`});
const button=(name,scope=f.page)=>scope.getByRole('button',{name,exact:true});
const status=(hud,text)=>hud.locator('.status').filter({hasText:new RegExp('^'+text+'$')}).waitFor();
async function invalid(panel,doc,creation){
 const input=panel.getByLabel('Distance',{exact:true});
 for(const v of ['0','-0.1']){
  await input.fill(v);if(creation)await status(panel,'refused');
  assert.equal(await input.getAttribute('aria-invalid'),'true');assert.equal(await input.evaluate(el=>el.checkValidity()),false);
  assert.equal(await button('Apply',panel).isEnabled(),false);
  const ids=(await input.getAttribute('aria-describedby')).split(' ');assert.match(await f.page.locator('#'+ids[0]).innerText(),/Greater than 0 mm/);
  await input.press('Enter');await f.same(doc);
 }
}
await f.run(async()=>{
 const source=await f.inspect('fixture',{},'fixture');
 for(const width of [1024,1440]){
  await f.newPage();await f.page.setViewportSize({width,height:900});
  const [chooser]=await Promise.all([f.page.waitForEvent('filechooser'),button('Open').click()]);await chooser.setFiles({name:'rounded-inset.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(source))});await f.same(source);
  await button('Top',f.page.locator('.views')).click();if(await button('Ortho').getAttribute('aria-pressed')!=='true')await button('Ortho').click();await f.page.getByTitle('Frame all (F)',{exact:true}).click();
  const filter=button('Selection filter');for(let i=0;i<6&&!(await filter.innerText()).includes('Edges');i++)await filter.click();
  for(const [i,point] of [[10,1,10],[18+Math.SQRT1_2,2-Math.SQRT1_2,10]].entries()){
   const p=await f.page.evaluate(p=>window.__studioScreenOf(p),point);if(i)await f.page.keyboard.down('Shift');await f.page.mouse.click(...p);if(i)await f.page.keyboard.up('Shift');await f.page.waitForFunction(n=>window.__studioSelection.selection.edges.length===n,i+1);
  }
  await f.page.waitForFunction(()=>window.__studioSelection.selection.edges.length===2);await f.page.evaluate(()=>document.activeElement?.blur());await f.command('Chamfer');
  const hud=f.page.getByRole('dialog',{name:'Chamfer',exact:true}),distance=hud.getByLabel('Distance',{exact:true});
  await invalid(hud,source,true);await f.snapshot(`${width}-creation-invalid`);
  await distance.fill('100');await status(hud,'refused');assert.notEqual(await distance.getAttribute('aria-invalid'),'true');assert.equal(await button('Apply',hud).isEnabled(),false);await hud.getByText('Kernel detail',{exact:true}).waitFor();await f.same(source);
  await distance.fill('0.05');await status(hud,'preview');assert.equal(await distance.evaluate(el=>el.checkValidity()),true);
  await button('Apply',hud).click();await f.changed(source);const created=await f.doc(),index=created.nodes.length-1;
  assert.equal(created.nodes[index].distance,.05);assert.equal(created.nodes[index].edges.length,2);
  const native=await f.inspect(`${width}-created`,created);assert.ok(native.valid);assert.ok(Math.abs(native.volume-534.1847926772)<1e-6,JSON.stringify(native));
  await f.openFeatureEditor(index);await invalid(f.editor(),created,false);await f.snapshot(`${width}-history-invalid`);
  await button('Reset',f.editor()).click();assert.equal(await f.editor().getByLabel('Distance',{exact:true}).inputValue(),'0.05');
  await f.editor().getByLabel('Distance',{exact:true}).fill('0.1');const {doc:edited}=await f.applyEditor(created,'positive-edit');
  await f.openFeatureEditor(index);await f.editor().getByLabel('Distance',{exact:true}).fill('0.05');const {doc:small}=await f.applyEditor(edited,'small-positive-edit');
  assert.deepEqual(small,created);await f.undo();await f.same(edited);await f.redo();await f.same(small);
  const saved=await f.save(`${width}-chamfer`);await f.freshOpen(saved.file,small,`${width}-reopened`);await f.page.setViewportSize({width,height:900});
  await f.openFeatureEditor(index);await invalid(f.editor(),small,false);await button('Reset',f.editor()).click();await f.closeEditor();await f.same(small);
  f.report.observations.push({width,native,edges:created.nodes[index].edges});
 }
});
