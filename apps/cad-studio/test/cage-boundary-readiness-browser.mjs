import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
const pins=['packages/barocss-cad-model/src/subd/cageEdit.ts','apps/cad-studio/src/subd/useCageEditor.ts','apps/cad-studio/src/ui/CagePanel.tsx','apps/cad-studio/src/viewport/Viewport.tsx','apps/cad-studio/src/viewport/viewportPointerInput.ts'];
const f=await createFlow({name:'cage-boundary-readiness',output:process.argv[2],envFrozen:'D1323_SOURCE_FROZEN',initialFiles:pins,requiredFrozen:pins,
  qualification:'Fill/Bridge expose actionable selection conditions at existing tool help and retain valid results.',
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
    await f.freshOpen(baseline.file,base,`base-${width}`);await f.page.setViewportSize({width,height:900});await command('edit cage');await panel().waitFor();await look('Top');if(await button('Ortho').getAttribute('aria-pressed')!=='true')await button('Ortho').click();await button('Box',panel()).click();
    const blocked=async(label,tag)=>{
      const b=button(label,panel()),before=await state();assert.equal(await b.getAttribute('aria-disabled'),'true');assert.ok((await b.getAttribute('data-tip-off'))?.length);
      await b.hover();await f.page.locator('.tooltip').waitFor();assert.ok((await f.page.locator('.tooltip').textContent()).includes(await b.getAttribute('data-tip-off')));await f.snapshot(`${width}-${tag}-${label}`);
      await b.click({force:true});assert.deepEqual(await state(),before);await b.press('Enter');assert.deepEqual(await state(),before);await f.same(base);
    };
    await pick('Edge',[3.75,0],16);await blocked('Fill','closed-edge');await blocked('Bridge','closed-edge');
    // Keyboard focus on the blocked action still exposes the existing tooltip.
    await button('Ring',panel()).press('Tab');assert.equal(await button('Bridge',panel()).evaluate(el=>el===document.activeElement),true);await f.page.locator('.tooltip').waitFor();assert.ok(await button('Bridge',panel()).getAttribute('aria-describedby'));
    await pick('Face',[3.75,2.5],16);const top=await state(),face=top.cage.faces[top.sel.faces[0]],edge=[face[0],face[1]],mid=[0,1,2].map(k=>(top.cage.positions[3*edge[0]+k]+top.cage.positions[3*edge[1]+k])/2);
    await button('Delete',panel()).click();await f.page.waitForFunction(()=>window.__studioCage().cage.faces.length===95);
    await pick('Edge',mid.slice(0,2),mid[2]);await blocked('Fill','partial-hole');await button('Loop',panel()).click();assert.equal((await state()).sel.edges.length,4);assert.equal(await button('Fill',panel()).getAttribute('aria-disabled'),'false');await blocked('Bridge','one-hole');
    await button('Fill',panel()).click();await f.page.waitForFunction(()=>window.__studioCage().cage.faces.length===96);await button('Undo cage step',panel()).click();await f.page.waitForFunction(()=>window.__studioCage().cage.faces.length===95);
    // A second actual deletion creates the pair of complete boundaries for Bridge.
    await look('Bottom');await pick('Face',[3.75,2.5],0);await button('Delete',panel()).click();await f.page.waitForFunction(()=>window.__studioCage().cage.faces.length===94);
    const hole=await state();const boundary=[];const counts=new Map();for(const face of hole.cage.faces)for(let i=0;i<face.length;i++){const a=face[i],b=face[(i+1)%face.length],key=[a,b].sort((x,y)=>x-y).join(':');const item=counts.get(key);if(item)item.count++;else counts.set(key,{a,b,count:1});}for(const e of counts.values())if(e.count===1)boundary.push(e);assert.equal(boundary.length,8);
    for(const [i,z] of [0,16].entries()){
      await look(z===0?'Bottom':'Top');if(i===0){await button('Vertex',panel()).click();await button('Edge',panel()).click();}
      const e=boundary.find(e=>hole.cage.positions[3*e.a+2]===z&&hole.cage.positions[3*e.b+2]===z);assert.ok(e);const point=[0,1,2].map(k=>(hole.cage.positions[3*e.a+k]+hole.cage.positions[3*e.b+k])/2),px=await f.page.evaluate(p=>window.__studioScreenOf(p),point);
      if(i)await f.page.keyboard.down('Shift');await f.page.mouse.dblclick(px[0],px[1]);if(i)await f.page.keyboard.up('Shift');await f.page.waitForTimeout(150);
    }
    assert.equal((await state()).sel.edges.length,8);assert.equal(await button('Bridge',panel()).getAttribute('aria-disabled'),'false');await f.snapshot(`${width}-two-boundaries-ready`);await button('Bridge',panel()).click();await f.page.waitForFunction(()=>window.__studioCage().cage.faces.length===98);const bridged=(await state()).cage;assert.match(await panel().getByLabel('Cage checks').textContent(),/0 open edges/);
    await button('Undo cage step',panel()).click();assert.deepEqual((await state()).cage,hole.cage);await button('Redo cage step',panel()).click();assert.deepEqual((await state()).cage,bridged);await f.same(base);
    if(width===1024){await button('Cancel cage edit',panel()).click();await f.same(base);}else{await button('Done editing cage',panel()).click();await f.changed(base);const accepted=await f.doc();await f.undo();await f.same(base);await f.redo();await f.same(accepted);const saved=await f.save('bridged-box');await f.freshOpen(saved.file,accepted,'bridged-box-reopened');}
  }
});
