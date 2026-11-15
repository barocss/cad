import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
const pins=['packages/barocss-cad-model/src/subd/cageEdit.ts','apps/cad-studio/src/subd/useCageEditor.ts','apps/cad-studio/src/ui/CagePanel.tsx','apps/cad-studio/src/viewport/Viewport.tsx','apps/cad-studio/src/viewport/viewportPointerInput.ts'];
const f=await createFlow({name:'cage-depth-picking',output:process.argv[2],envFrozen:'D1321_SOURCE_FROZEN',initialFiles:pins,requiredFrozen:pins,
  qualification:'Top/Bottom front/back cage selection agrees with Crease across Box/Smooth and1024/1440 widths.',
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
const verticesOf=s=>s.sel.vertices.length?s.sel.vertices:s.sel.edges.length?s.sel.edges[0]:s.cage.faces[s.sel.faces[0]];
await f.run(async()=>{
  await f.newPage();await button('New part').click();await f.page.waitForFunction(()=>window.__studioDoc.nodes.length===0);await f.ready();
  await command('subd box');const hud=f.page.getByRole('dialog',{name:'SubD box',exact:true});
  for(const [name,value] of [['Width X',30],['Depth Y',20],['Height Z',16],['Quads along a side',4],['Centre X',0],['Centre Y',0],['At Z',0]])await hud.getByLabel(name,{exact:true}).fill(String(value));
  await hud.locator('.status.ok').waitFor();await button('Apply',hud).click();await f.page.waitForFunction(()=>window.__studioDoc.nodes.some(n=>n.kind==='subd'));await f.ready();const base=await f.doc();const baseline=await f.save('box-baseline');
  for(const width of [1024,1440]){
    await f.freshOpen(baseline.file,base,`base-${width}`);await f.page.setViewportSize({width,height:900});await command('edit cage');await panel().waitFor();
    for(const view of ['Top','Bottom'])for(const display of ['Box','Smooth']){
      await look(view);if(await button('Ortho').getAttribute('aria-pressed')!=='true')await button('Ortho').click();await button(display,panel()).click();
      const front=view==='Top'?16:0;
      for(const depth of ['Front','Back']){
        const before=await state();await button(`${depth} candidate`,panel()).click();assert.deepEqual((await state()).sel,before.sel);assert.equal((await state()).undo,0);
        const expected=depth==='Front'?front:16-front;
        for(const [mode,xy] of [['Edge',[3.75,0]],['Vertex',[0,0]],['Face',[3.75,2.5]]]){
          await pick(mode,xy,front);const selected=await state(),vertices=verticesOf(selected);assert.ok(vertices?.length,`${width}/${view}/${display}/${depth}/${mode}`);
          for(const v of vertices)assert.equal(selected.cage.positions[3*v+2],expected,`${width}/${view}/${display}/${depth}/${mode}`);
          assert.equal(selected.undo,0);assert.match(await panel().getByLabel('Picked cage centre').textContent(),new RegExp(`, ${expected}\\) mm`));
          if(mode==='Edge'){
            const beforeCage=structuredClone(selected.cage),edge=selected.sel.edges[0];await button('Crease',panel()).click();await f.page.waitForFunction(()=>window.__studioCage().undo===1);
            const changed=await state();assert.ok(changed.cage.creases.some(pair=>pair.includes(edge[0])&&pair.includes(edge[1])));assert.equal(changed.cage.creases.length,(beforeCage.creases?.length??0)+1);
            await button('Undo cage step',panel()).click();assert.deepEqual((await state()).cage,beforeCage);
          }
          await f.same(base);
        }
      }
      await panel().getByLabel('Picked cage centre').scrollIntoViewIfNeeded();await f.snapshot(`${width}-${view}-${display}`);
    }
    await button('Cancel cage edit',panel()).click();await f.same(base);
  }
  // Commit one front top crease and verify its exact cage survives native Save/Open.
  await command('edit cage');await panel().waitFor();await look('Top');await button('Box',panel()).click();await button('Front candidate',panel()).click();await pick('Edge',[3.75,0],16);await button('Crease',panel()).click();await f.page.waitForFunction(()=>window.__studioCage().undo===1);const editedCage=(await state()).cage;
  await button('Done editing cage',panel()).click();await f.changed(base);const accepted=await f.doc();assert.deepEqual(accepted.nodes.find(n=>n.kind==='subd').cage,editedCage);
  await f.undo();await f.same(base);await f.redo();await f.same(accepted);const saved=await f.save('creased-box');await f.freshOpen(saved.file,saved.doc,'creased-box-reopened');
});
