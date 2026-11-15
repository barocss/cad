import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
const pins=['packages/barocss-cad-model/src/subd/cageEdit.ts','apps/cad-studio/src/subd/useCageEditor.ts','apps/cad-studio/src/ui/CagePanel.tsx','apps/cad-studio/src/viewport/Viewport.tsx','apps/cad-studio/src/viewport/viewportPointerInput.ts'];
const f=await createFlow({name:'cage-active-controls',output:process.argv[2],envFrozen:'D1325_SOURCE_FROZEN',initialFiles:pins,requiredFrozen:pins,
  qualification:'Pick and Show active buttons remain visible without pointer/focus, with distinct keyboard focus and no geometry/history changes.',
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
  const styles=locator=>locator.evaluateAll(elements=>elements.map(el=>{const s=getComputedStyle(el);return {text:el.textContent,pressed:el.getAttribute('aria-pressed'),bg:s.backgroundColor,color:s.color,outline:s.outlineStyle,outlineWidth:s.outlineWidth,focus:el.matches(':focus-visible')};}));
  for(const width of [1024,1440]){
    await f.freshOpen(baseline.file,base,`base-${width}`);await f.page.setViewportSize({width,height:900});await command('edit cage');await panel().waitFor();const initial=await state();
    for(const mode of ['Vertex','Edge','Face'])for(const display of ['Box','Smooth']){
      await button(mode,panel()).click();await button(display,panel()).click();await f.page.getByText('barocss',{exact:true}).click();await f.page.mouse.move(400,700);
      const current=await state();assert.equal(current.mode,mode.toLowerCase());assert.equal(current.undo,0);assert.deepEqual(current.cage,initial.cage);await f.same(base);
      for(const [group,active] of [['Pick',mode],['Show',display]]){
        const rows=await styles(panel().getByRole('group',{name:group,exact:true}).getByRole('button'));const selected=rows.filter(r=>r.pressed==='true');assert.equal(selected.length,1);assert.equal(selected[0].text,active);assert.equal(selected[0].focus,false);assert.ok(rows.filter(r=>r.pressed!=='true').every(r=>r.bg!==selected[0].bg&&r.color!==selected[0].color));
        f.report.observations.push({width,mode,display,group,styles:rows});
      }
      await f.snapshot(`${width}-${mode}-${display}-unfocused`);
    }
    await button('Vertex',panel()).click();await button('Vertex',panel()).press('Tab');const focusRows=await styles(panel().getByRole('group',{name:'Pick',exact:true}).getByRole('button'));const focused=focusRows.find(r=>r.focus);assert.equal(focused?.text,'Edge');assert.equal(focused.pressed,'false');assert.equal(focused.outline,'solid');assert.ok(parseFloat(focused.outlineWidth)>=2);assert.equal(focusRows.find(r=>r.text==='Vertex').pressed,'true');assert.notEqual(focused.bg,focusRows.find(r=>r.text==='Vertex').bg);await f.snapshot(`${width}-keyboard-focus-separate`);
    assert.equal((await state()).undo,0);assert.deepEqual((await state()).cage,initial.cage);await button('Cancel cage edit',panel()).click();await f.same(base);
  }
  const saved=await f.save('unchanged-box');await f.freshOpen(saved.file,base,'unchanged-box-reopened');
});
