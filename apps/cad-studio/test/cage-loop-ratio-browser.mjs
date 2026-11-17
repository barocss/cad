import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
const pins=['packages/barocss-cad-model/src/subd/cageEdit.ts','apps/cad-studio/src/ui/CagePanel.tsx','apps/cad-studio/src/subd/useCageEditor.ts','apps/cad-studio/src/subd/cageLoopDraft.ts'];
const f=await createFlow({name:'cage-loop-ratio',output:process.argv[2],envFrozen:'CAGE_LOOP_SOURCE_FROZEN',initialFiles:pins,requiredFrozen:pins,
 qualification:'Loop ratio preview replaces topology from one baseline; Apply owns one step, Cancel preserves source, native reopen preserves accepted cage.',
 limits:['One closed quad box in actual Studio. Existing edge-loop slide is not implemented; no B-rep or smooth dimensional claim.']});
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
 await begin();await pick('Edge',[3.75,0,16]);const seed=await state();
 const start=async()=>{await button('Insert loop',panel()).click();await f.page.getByRole('group',{name:'Insert loop preview',exact:true}).waitFor();};
 const ratio=()=>f.page.getByLabel('Loop ratio',{exact:true});
 const check=async(t)=>{
  await ratio().fill(String(t));const out=await state();
  assert.equal(out.undo,seed.undo+1);assert.ok(out.cage.positions.length>seed.cage.positions.length);
  const [a,b]=seed.sel.edges[0];const expected=[0,1,2].map(i=>seed.cage.positions[a*3+i]+t*(seed.cage.positions[b*3+i]-seed.cage.positions[a*3+i]));
  const newPositions=out.cage.positions.slice(seed.cage.positions.length);assert.ok(newPositions.some((_,i)=>i%3===0&&expected.every((v,j)=>Math.abs(newPositions[i+j]-v)<1e-9)));
  assert.equal(await button('Done editing cage',panel()).getAttribute('aria-disabled'),'true');await f.same(base);return out;
 };
 await start();await ratio().focus();await f.page.keyboard.press('Meta+a');assert.equal(await ratio().evaluate(el=>document.activeElement===el),true);const quarter=await check(.25);const half=await check(.5);const three=await check(.75);
 assert.equal(quarter.cage.positions.length,half.cage.positions.length);assert.equal(half.cage.positions.length,three.cage.positions.length);
 for(const invalid of ['','0','1','-0.1','1.1']) {await ratio().fill(invalid);assert.deepEqual((await state()).cage,seed.cage);assert.ok(await button('Apply loop',panel()).isDisabled());}
 await check(.25);await ratio().press('Escape');assert.deepEqual((await state()).cage,seed.cage);assert.deepEqual((await state()).sel,seed.sel);assert.equal((await state()).undo,0);
 await start();await check(.75);await button('Cancel loop preview',panel()).click();assert.deepEqual((await state()).cage,seed.cage);
 await start();const applied=await check(.25);await button('Apply loop',panel()).waitFor();await f.page.waitForFunction(()=>!document.querySelector('button')?false:[...document.querySelectorAll('button')].some(b=>b.textContent==='Apply loop'&&!b.disabled));
 await f.snapshot('ratio-quarter-preview');await button('Apply loop',panel()).click();assert.equal((await state()).undo,1);
 await button('Undo cage step',panel()).click();assert.deepEqual((await state()).cage,seed.cage);assert.deepEqual((await state()).sel,seed.sel);
 await start();await check(.75);await button('Cancel loop preview',panel()).click();assert.equal(await button('Redo cage step',panel()).isDisabled(),false);
 await button('Redo cage step',panel()).click();assert.deepEqual((await state()).cage,applied.cage);
 await done();const accepted=await f.doc();assert.deepEqual(accepted.nodes.find(n=>n.kind==='subd').cage,applied.cage);
 await f.undo();await f.same(base);await f.redo();await f.same(accepted);const saved=await f.save('ratio-quarter');await f.freshOpen(saved.file,accepted,'fresh-open');
 await begin();await pick('Edge',[3.75,0,16]);await start();await ratio().fill('.75');await button('Cancel cage edit',panel()).click();await panel().waitFor({state:'detached'});await f.ready();await f.same(accepted);
});
