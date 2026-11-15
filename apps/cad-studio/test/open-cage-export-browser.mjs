import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
const pins=['packages/barocss-cad-model/src/engine/evaluate.ts','packages/barocss-cad-model/src/engine/bodyTopology.ts','apps/cad-studio/src/App.tsx','apps/cad-studio/src/files/ModelExportDialogs.tsx','apps/cad-studio/src/files/useModelExports.ts','packages/barocss-cad-model/src/subd/cageEdit.ts','apps/cad-studio/src/subd/useCageEditor.ts','apps/cad-studio/src/ui/CagePanel.tsx','apps/cad-studio/src/viewport/Viewport.tsx','apps/cad-studio/src/viewport/viewportPointerInput.ts'];
const f=await createFlow({name:'open-cage-export',output:process.argv[2],envFrozen:'D1331_SOURCE_FROZEN',initialFiles:pins,requiredFrozen:pins,
  qualification:'Open SubD status and native boundary disclosure precede STL download; closed/open exported meshes retain boundary distinction.',
  limits:['One public30×20×16 SubD box with4quads per side; general cage families and AT NOT_RUN.']});
const button=(name,scope=f.page)=>scope.getByRole('button',{name,exact:true});
const panel=()=>f.page.getByRole('complementary',{name:'Cage editor',exact:true});
const command=async(text)=>{await f.page.getByText('barocss',{exact:true}).click();await f.command(text);};
const state=()=>f.page.evaluate(()=>window.__studioCage());
const look=async(name)=>{await button('View cube directions').click();await f.page.getByRole('menuitem',{name,exact:true}).click();await f.page.waitForTimeout(250);};
const pick=async(mode,xy,z)=>{
  await button(mode==='Vertex'?'Edge':'Vertex',panel()).click();await button(mode,panel()).click();
  const point=await f.page.evaluate(p=>window.__studioScreenOf(p),[...xy,z]);assert.ok(point);await f.page.mouse.click(point[0],point[1]);await f.page.waitForTimeout(120);
};
await f.run(async()=>{
  await f.newPage();await button('New part').click();await f.page.waitForFunction(()=>window.__studioDoc.nodes.length===0);await f.ready();
  await command('subd box');const hud=f.page.getByRole('dialog',{name:'SubD box',exact:true});
  for(const [name,value] of [['Width X',30],['Depth Y',20],['Height Z',16],['Quads along a side',4],['Centre X',0],['Centre Y',0],['At Z',0]])await hud.getByLabel(name,{exact:true}).fill(String(value));
  await hud.locator('.status.ok').waitFor();await button('Apply',hud).click();await f.page.waitForFunction(()=>window.__studioDoc.nodes.some(n=>n.kind==='subd'));await f.ready();const base=await f.doc();const baseline=await f.save('box-baseline');
  const tool=async(name)=>{if(await button(name).count())await button(name).click();else{await button('More tools').click();await f.page.getByRole('menuitem',{name,exact:true}).click();}};
  const closedStep=async()=>{await tool('Export STEP');const region=f.page.getByRole('region',{name:'STEP export',exact:true});await region.getByRole('button',{name:'Export',exact:true}).waitFor();await f.page.waitForFunction(()=>document.querySelector('[aria-label="STEP export"] button.primary')?.disabled===false);const pending=f.page.waitForEvent('download',{predicate:d=>/\.st(ep|p)$/i.test(d.suggestedFilename())});await region.getByRole('button',{name:'Export',exact:true}).click();const dl=await pending,text=await readFile(await dl.path(),'utf8');assert.match(text,/ISO-10303-21/);assert.match(text,/MANIFOLD_SOLID_BREP/);if(await region.isVisible())await region.getByRole('button',{name:'Close STEP export',exact:true}).click();};
  const open3mf=async()=>{const pending=f.page.waitForEvent('download',{predicate:d=>d.suggestedFilename().endsWith('.3mf')});await tool('Export 3MF');const dl=await pending;assert.ok((await readFile(await dl.path())).length>100);await f.page.getByText(/edges are not closed: the slicer may repair it/).waitFor();};
  const exportMesh=async(quality,open)=>{
    await button('Export STL').click();const dialog=f.page.getByRole('dialog',{name:'STL export',exact:true});await dialog.waitFor();await dialog.getByLabel('STL export quality').selectOption(quality);
    const hint=await dialog.getByLabel('STL target boundaries').innerText();assert.match(hint,/Root bodies/);assert.match(hint,open?/Open surface/:/Solid/);assert.match(hint,/native boundary edges/);if(open)assert.match(hint,/open STL mesh boundaries/);
    await f.snapshot(`stl-${quality}-${open?'open':'closed'}-${f.page.viewportSize().width}`);
    const pending=f.page.waitForEvent('download',{predicate:d=>d.suggestedFilename().endsWith('.stl')});await dialog.getByRole('button',{name:'Export',exact:true}).click();const dl=await pending,bytes=await readFile(await dl.path());const count=bytes.readUInt32LE(80),edges=new Map();assert.equal(bytes.length,84+50*count);
    for(let t=0;t<count;t++){const points=[];for(let v=0;v<3;v++)points.push([0,1,2].map(a=>bytes.readFloatLE(84+t*50+12+v*12+a*4)).join(','));for(let i=0;i<3;i++){const key=[points[i],points[(i+1)%3]].sort().join('|');edges.set(key,(edges.get(key)||0)+1);}}
    const boundary=[...edges.values()].filter(n=>n===1).length;assert.ok(open?boundary>0:boundary===0);f.report.observations??=[];f.report.observations.push({quality,open,triangles:count,boundary,width:f.page.viewportSize().width});await dialog.waitFor({state:'hidden'});
  };
  for(const width of [1024,1440]){
    await f.newPage();await f.openFile(baseline.file,base.nodes.length);await f.same(base);await f.page.setViewportSize({width,height:900});assert.match(await f.page.locator('.corner-left').innerText(),/1 solid/);await exportMesh('16',false);await closedStep();
    await command('edit cage');await panel().waitFor();await look('Top');if(await button('Ortho').getAttribute('aria-pressed')!=='true')await button('Ortho').click();await button('Box',panel()).click();await pick('Face',[3.75,2.5],16);await button('Delete',panel()).click();await f.page.waitForFunction(()=>document.querySelector('[aria-label="Done editing cage"]')?.getAttribute('aria-disabled')==='false');await button('Done editing cage',panel()).click();await f.changed(base);const opened=await f.doc();assert.match(await f.page.locator('.corner-left').innerText(),/1 open surface/);
    await f.page.locator('.ol-row > button.ol').first().click();await f.page.getByLabel('Body topology',{exact:true}).getByText('Open surface',{exact:true}).waitFor();await exportMesh('automatic',true);await exportMesh('16',true);await open3mf();await f.same(opened);const saved=await f.save(`open-${width}`);await f.freshOpen(saved.file,opened,`open-${width}-reopened`);assert.match(await f.page.locator('.corner-left').innerText(),/1 open surface/);
  }
});
