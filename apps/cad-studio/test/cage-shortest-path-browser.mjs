import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
const pins=['packages/barocss-cad-model/src/subd/cageEdit.ts','apps/cad-studio/src/ui/CagePanel.tsx','apps/cad-studio/src/subd/useCageEditor.ts'];
const f=await createFlow({name:'cage-shortest-path',output:process.argv[2],envFrozen:'CAGE_PATH_SOURCE_FROZEN',initialFiles:pins,requiredFrozen:pins,
 qualification:'Minimum edge-count path from two vertex picks; deterministic ties, selection-only history, crease and native persistence.',
 limits:['One regular closed box in actual Studio; disconnected/pole/invalid cases are pure tests. No length-weighted or crease-barrier mode.']});
const button=(name,scope=f.page)=>scope.getByRole('button',{name,exact:true});
const panel=()=>f.page.getByRole('complementary',{name:'Cage editor',exact:true});
const command=async(text)=>{await f.page.getByText('barocss',{exact:true}).click();await f.command(text);};
const state=()=>f.page.evaluate(()=>window.__studioCage());
const pick=async(mode,p)=>{
 await button(mode==='Vertex'?'Edge':'Vertex',panel()).click(); await button(mode,panel()).click();
 const point=await f.page.evaluate(p=>window.__studioScreenOf(p),p);assert.ok(point);await f.page.mouse.click(...point);await f.page.waitForTimeout(120);
};
const done=async()=>{await f.page.waitForFunction(()=>document.querySelector('[aria-label="Done editing cage"]')?.getAttribute('aria-disabled')==='false');await button('Done editing cage',panel()).click();await panel().waitFor({state:'detached'});await f.ready();};
await f.run(async()=>{
 await f.newPage();await f.page.setViewportSize({width:1440,height:1000});await button('New part').click();await f.page.waitForFunction(()=>window.__studioDoc.nodes.length===0);await f.ready();
 await command('subd box');const hud=f.page.getByRole('dialog',{name:'SubD box',exact:true});
 for(const [name,value] of [['Width X',30],['Depth Y',20],['Height Z',16],['Quads along a side',4],['Centre X',0],['Centre Y',0],['At Z',0]])await hud.getByLabel(name,{exact:true}).fill(String(value));
 await hud.locator('.status.ok').waitFor();await button('Apply',hud).click();await f.page.waitForFunction(()=>window.__studioDoc.nodes.some(n=>n.kind==='subd'));await f.ready();const base=await f.doc();
 const begin=async()=>{await command('edit cage');await panel().waitFor();await button('View cube directions').click();await f.page.getByRole('menuitem',{name:'Top',exact:true}).click();if(await button('Ortho').getAttribute('aria-pressed')!=='true')await button('Ortho').click();await button('Box',panel()).click();};
 const choose=async(reverse=false)=>{
  await button('Vertex',panel()).click();const points=[[-7.5,-5,16],[7.5,5,16]];if(reverse)points.reverse();
  for(let i=0;i<2;i++){const point=await f.page.evaluate(p=>window.__studioScreenOf(p),points[i]);assert.ok(point);if(i)await f.page.keyboard.down('Shift');await f.page.mouse.click(...point);if(i)await f.page.keyboard.up('Shift');}
  const seed=await state();assert.equal(seed.sel.vertices.length,2);return seed;
 };
 const expected=(seed)=>{
  const ids=[...seed.sel.vertices].sort((a,b)=>a-b),pos=v=>seed.cage.positions.slice(v*3,v*3+3),a=pos(ids[0]),b=pos(ids[1]);
  const dx=(b[0]-a[0])/2,dy=(b[1]-a[1])/2,paths=[];
  for(const moves of ['xxyy','xyxy','xyyx','yxxy','yxyx','yyxx']) {
   const point=[...a],path=[ids[0]];
   for(const move of moves){point[move==='x'?0:1]+=move==='x'?dx:dy;let id=-1;for(let v=0;v<seed.cage.positions.length/3;v++)if(pos(v).every((x,k)=>Math.abs(x-point[k])<1e-9)){id=v;break;}assert.ok(id>=0);path.push(id);}
   paths.push(path);
  }
  paths.sort((a,b)=>{for(let i=0;i<a.length;i++)if(a[i]!==b[i])return a[i]-b[i];return 0;});
  return paths[0].slice(1).map((v,i)=>[paths[0][i],v]);
 };
 await begin();assert.equal(await button('Shortest path',panel()).getAttribute('aria-disabled'),'true');
 const first=await choose();await button('Shortest path',panel()).click();const path=await state();assert.deepEqual(path.sel.edges,expected(first));assert.equal(path.mode,'edge');assert.equal(path.undo,0);assert.deepEqual(path.cage,first.cage);await f.same(base);
 await button('Cancel cage edit',panel()).click();await panel().waitFor({state:'detached'});await f.same(base);
 await begin();const reverse=await choose(true);await button('Shortest path',panel()).click();assert.deepEqual((await state()).sel.edges,path.sel.edges);assert.deepEqual((await state()).sel.edges,expected(reverse));
 await button('Crease',panel()).click();const sharp=await state();assert.equal(sharp.undo,1);assert.equal(sharp.creases,4);
 await button('Undo cage step',panel()).click();assert.deepEqual((await state()).cage,path.cage);assert.deepEqual((await state()).sel,path.sel);
 await button('Redo cage step',panel()).click();assert.deepEqual((await state()).cage,sharp.cage);await f.snapshot('shortest-path-creased');
 await done();const accepted=await f.doc();assert.deepEqual(accepted.nodes.find(n=>n.kind==='subd').cage,sharp.cage);
 await f.undo();await f.same(base);await f.redo();await f.same(accepted);const saved=await f.save('shortest-path-crease');await f.freshOpen(saved.file,accepted,'fresh-open');
});
