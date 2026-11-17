import assert from 'node:assert/strict';
import {createFlow} from './flow-helper.mjs';
const f=await createFlow({name:'drawing-held-frame-identity',output:process.argv[2],envFrozen:'DRAWING_HELD_FRAME_IDENTITY_FROZEN',initialFiles:['apps/cad-studio/test/drawing-held-frame-identity-browser.mjs','packages/barocss-cad-model/src/drawing/auto.ts','packages/barocss-cad-model/src/drawing/dimensions.ts','packages/barocss-cad-model/src/drawing/sheets.ts','apps/cad-studio/src/ui/DrawingWorkspace.tsx'],qualification:'New dimensions cannot acquire an existing geometric control whose saved target is missing.',limits:['Synthetic readable orphan frame on a box; no claim that normal UI deletion creates orphan data.'],inspectorSource:`import {rectanglePart} from '@barocss/cad-model/engine/doc';import {defaultDrawing} from '@barocss/cad-model/drawing/types';console.log(JSON.stringify({...rectanglePart(64,32,8),drawing:{...defaultDrawing(),title:'Held frame identity',frames:[{id:'held-control',dim:'d1',characteristic:'flatness',value:0.25,datums:[]}]}}));`});
const button=name=>f.page.getByRole('button',{name,exact:true});
async function click(view,x,y){const p=await f.page.evaluate(([v,x,y])=>window.__studioDrawingAt(v,x,y),[view,x,y]);assert.ok(p);await f.page.mouse.click(p.x,p.y);}
async function open(doc,name){await f.newPage();await f.page.locator('input[aria-label="Model file"]').setInputFiles({name,mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))});await f.page.waitForFunction(()=>window.__studioDoc?.drawing?.title==='Held frame identity');await f.ready();await button('Drawing').click();await f.page.locator('svg[aria-label="Drawing sheet"] g.view').first().waitFor();}
await f.run(async()=>{
 const fixture=await f.inspect('fixture',{});
 for(const mode of ['auto','manual','continuation']){
  const doc=structuredClone(fixture);if(mode==='continuation')doc.drawing.sheets=[{id:'S2',name:'Top sheet',views:['top']}];await open(doc,`${mode}.bcad`);const before=await f.doc();const controls=()=>f.page.locator('svg[aria-label="Drawing sheet"] g.control[data-dim="held-control"]');assert.equal(await controls().count(),0);
  if(mode==='continuation')await f.page.getByRole('tab',{name:'Top sheet',exact:true}).click();
  if(mode==='manual'){await button('Linear dimension').click();await click('front',32,8);await click('front',32,20);}else await button('Auto-dimension').click();
  await f.changed(before);const made=await f.doc();f.report.observations.push({mode,ids:made.drawing.dimensions.map(d=>d.id),controls:await controls().count()});await f.snapshot(`${mode}-created`);
  assert.ok(!made.drawing.dimensions.some(d=>d.id==='d1'),'new dimension cannot inherit held control');assert.deepEqual(made.drawing.frames,before.drawing.frames);assert.equal(await controls().count(),0);
  await f.undo();await f.same(before);await f.redo();await f.same(made);
  const [download]=await Promise.all([f.page.waitForEvent('download'),button('Export SVG').click()]);const path=f.output+'/'+mode+'.svg';await download.saveAs(path);const {readFile}=await import('node:fs/promises');const svg=await readFile(path,'utf8');assert.ok(!svg.includes('data-dim="held-control"'));f.report.observations.push({mode,svgControlAbsent:true,svgDimensionPresent:svg.includes('class="dimension"')});assert.ok(svg.includes('class="dimension"'));
  const saved=await f.save(mode+'-saved');await f.freshOpen(saved.file,saved.doc,mode+'-reopened');await button('Drawing').click();await f.page.locator('svg[aria-label="Drawing sheet"] g.view').first().waitFor();assert.equal(await controls().count(),0);await f.snapshot(mode+'-final');
 }
});
