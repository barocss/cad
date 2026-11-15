import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
const pins=['apps/cad-studio/src/App.tsx','apps/cad-studio/src/viewport/PrintPanel.tsx','apps/cad-studio/src/viewport/printSettings.ts','apps/cad-studio/src/viewport/useWorkspacePreviews.ts','packages/barocss-cad-model/src/subd/cageEdit.ts','apps/cad-studio/src/subd/useCageEditor.ts','apps/cad-studio/src/ui/CagePanel.tsx','apps/cad-studio/src/viewport/Viewport.tsx','apps/cad-studio/src/viewport/viewportPointerInput.ts'];
const f=await createFlow({name:'open-cage-print',output:process.argv[2],envFrozen:'D1332_SOURCE_FROZEN',initialFiles:pins,requiredFrozen:pins,
  qualification:'Print open-source warning names affected body while retaining normal layers and the missing contour witness.',
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
  for(const width of [1024,1440]){
    await f.newPage();await f.openFile(baseline.file,base.nodes.length);await f.same(base);await f.page.setViewportSize({width,height:900});
    const print=()=>f.page.getByLabel('Print layers',{exact:true});
    const layers=async(open)=>{
      await f.page.getByRole('radio',{name:'Preview: Print',exact:true}).click();await print().waitFor();await print().getByLabel('Print direction').selectOption('1');await f.page.waitForFunction(()=>window.__studioPrint().stage==='ready');
      const found=[];
      for(const k of [75,100,112]){
        const slider=print().getByLabel('Print layer',{exact:true});await slider.focus();await slider.press('Home');for(let i=0;i<k;i++)await slider.press('ArrowRight');
        await f.page.waitForFunction(k=>{const p=window.__studioPrint();return p.stage==='ready'&&p.display?.layer.k===k;},k);
        const result=await f.page.evaluate(()=>{const p=window.__studioPrint();return {k:p.display.layer.k,z:p.display.layer.z,contours:p.display.layer.contours.length};});found.push(result);
        const status=await print().getByRole('status').innerText();assert.match(status,new RegExp(`${result.contours} closed contours`));assert.equal(await print().getByLabel('Print contour warning').count(),open?1:0);if(open){assert.match(status,/SubD box/);assert.match(status,/b0/);assert.match(status,/may be incomplete; open chains are omitted/);}
        await f.snapshot(`${width}-${open?'open':'closed'}-layer-${k+1}`);
      }
      assert.deepEqual(found.map(x=>x.contours),open?[1,0,1]:[1,1,1]);f.report.observations??=[];f.report.observations.push({width,open,layers:found});await f.page.getByRole('radio',{name:'Preview: None',exact:true}).click();
    };
    await layers(false);await command('edit cage');await panel().waitFor();await look('Top');if(await button('Ortho').getAttribute('aria-pressed')!=='true')await button('Ortho').click();await button('Box',panel()).click();await pick('Face',[3.75,2.5],16);await button('Delete',panel()).click();await f.page.waitForFunction(()=>document.querySelector('[aria-label="Done editing cage"]')?.getAttribute('aria-disabled')==='false');await button('Done editing cage',panel()).click();await f.ready();await layers(true);const accepted=await f.doc();const saved=await f.save(`open-print-${width}`);await f.freshOpen(saved.file,accepted,`open-print-${width}-reopened`);
  }
});
