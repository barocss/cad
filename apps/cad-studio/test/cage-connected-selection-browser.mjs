import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
const creaseBaseline=process.argv.includes('--crease-baseline');
const creaseFence=creaseBaseline||process.argv.includes('--crease-fence');
const pins=['packages/barocss-cad-model/src/subd/cageEdit.ts','apps/cad-studio/src/ui/CagePanel.tsx','apps/cad-studio/src/subd/useCageEditor.ts'];
if(creaseFence)pins.push('apps/cad-studio/test/cage-connected-selection-browser.mjs','apps/cad-studio/src/ui/CageTransformControls.tsx');
const f=await createFlow({name:'cage-connected-selection',output:process.argv[2],envFrozen:'CAGE_CONNECTED_SOURCE_FROZEN',initialFiles:pins,requiredFrozen:pins,
 qualification:creaseFence?'Select the upper cage region inside its explicit creases and move only that region.':'Current-mode Grow/Shrink/Linked change only selection; subsequent crease owns one cage undo step and native persistence.',
 limits:[creaseFence?'One four-quads-per-side box at 1440×1000 with 16 explicit upper perimeter creases. A fixture adds the crease data before native Open and the actual editor picks and moves the region.':'One four-quads-per-side box at 1440×1000. Disconnected and invalid topology checked separately in pure tests.'],
 inspectorSource:creaseFence?`
import { readFileSync } from 'node:fs';
import { checkBrep, brepMassProperties } from '@barocss/cad';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
import { digestOf } from '@barocss/cad-model/util/digest';
const doc=JSON.parse(readFileSync(process.argv[2],'utf8'));
const [{brep,key}]=partBreps(doc);
console.log(JSON.stringify({key,strict:checkBrep(brep,{strict:true}),volume:brepMassProperties(brep,1).volume,digest:digestOf(brep),
 kind:brep.bodies[0].kind,closed:brep.shells.length===1&&brep.shells[0].closed}));
`:undefined});
const button=(name,scope=f.page)=>scope.getByRole('button',{name,exact:true});
const panel=()=>f.page.getByRole('complementary',{name:'Cage editor',exact:true});
const command=async(text)=>{await f.page.getByText('barocss',{exact:true}).click();await f.command(text);};
const state=()=>f.page.evaluate(()=>window.__studioCage());
const pick=async(mode,p)=>{
 await button(mode==='Vertex'?'Edge':'Vertex',panel()).click(); await button(mode,panel()).click();
 const point=await f.page.evaluate(p=>window.__studioScreenOf(p),p);assert.ok(point);await f.page.mouse.click(...point);await f.page.waitForTimeout(120);
};
const done=async()=>{await f.page.waitForFunction(()=>document.querySelector('[aria-label="Done editing cage"]')?.getAttribute('aria-disabled')==='false');await button('Done editing cage',panel()).click();await panel().waitFor({state:'detached'});await f.ready();};

function fencedBox(base){
 const doc=structuredClone(base),node=doc.nodes.find(item=>item.kind==='subd');
 const {cage}=node, {positions,faces}=cage, edges=new Map();
 const vertex=id=>positions.slice(id*3,id*3+3);
 for(const face of faces){
  for(const [i,a] of face.entries()){
   const b=face[(i+1)%face.length],p=vertex(a),q=vertex(b);
   if(p[2]!==16||q[2]!==16)continue;
   const onRim=(p[0]===q[0]&&Math.abs(p[0])===15)||(p[1]===q[1]&&Math.abs(p[1])===10);
   if(onRim)edges.set([Math.min(a,b),Math.max(a,b)].join(':'),[Math.min(a,b),Math.max(a,b)]);
  }
 }
 const creases=[...edges.values()].sort(([a,b],[c,d])=>a-c||b-d);
 assert.equal(creases.length,16);
 cage.creases=creases;
 const upper=faces.flatMap((face,id)=>face.every(index=>vertex(index)[2]===16)?[id]:[]);
 assert.equal(upper.length,16);
 const moving=new Set(upper.flatMap(id=>faces[id]));
 assert.equal(moving.size,25);
 return {doc,cage,upper,moving};
}

async function fencedWorkflow(base,begin){
 f.phase='open a native box with a closed crease fence';
 const {doc,cage,upper,moving}=fencedBox(base);
 const [chooser]=await Promise.all([f.page.waitForEvent('filechooser'),button('Open').click()]);
 await chooser.setFiles({name:'creased-upper-panel.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))});
 await f.same(doc);
 const nativeFor=async(label,source)=>{
  const native=await f.inspect(label,source), [body]=(await f.bodies()).bodies;
  assert.ok(native.strict.valid,JSON.stringify(native.strict.issues));
  assert.deepEqual([native.strict.counts.bodies,native.kind,native.closed],[1,'solid',true]);
  assert.equal(body.key,native.key);assert.ok(Math.abs(body.volume-native.volume)<1e-6);
  return native;
 };
 const original=await nativeFor('crease-fence-source-native',doc);
 await begin();await pick('Face',[3.75,2.5,16]);
 const one=await state();
 assert.ok(one.sel.faces.length===1&&upper.includes(one.sel.faces[0]));
 assert.deepEqual(one.cage,cage);assert.equal(one.undo,0);
 const within=()=>button('Linked within creases',panel());
 if(creaseBaseline){
  assert.equal(await within().count(),0);
  await button('Linked',panel()).click();
  const full=await state();assert.equal(full.sel.faces.length,96);assert.deepEqual(full.cage,cage);
  await f.same(doc);await f.snapshot('crease-fence-original-linked');return;
 }
 f.phase='select the upper faces, keeping the original cage and history';
 await within().click();
 const picked=await state();assert.deepEqual(picked.sel.faces,upper);assert.deepEqual(picked.cage,cage);assert.equal(picked.undo,0);
 await f.same(doc);await f.snapshot('crease-fence-upper-faces');
 await button('Linked',panel()).click();assert.equal((await state()).sel.faces.length,96);
 await pick('Face',[3.75,2.5,16]);await within().click();assert.deepEqual((await state()).sel,picked.sel);
 f.phase='move the bounded region and verify the exact cage and native result';
 await button('Move selection',panel()).click();
 await f.page.getByLabel('Selection distance mm',{exact:true}).fill('1');
 const apply=button('Apply transform',panel());
 await apply.click();await f.same(doc);
 const moved=await state();assert.equal(moved.undo,1);assert.deepEqual(moved.sel,picked.sel);
 const expected={...cage,positions:cage.positions.map((value,i)=>i%3===2&&moving.has((i-2)/3)?value+1:value)};
 assert.deepEqual(moved.cage,expected);
 await f.snapshot('crease-fence-upper-moved');
 await button('Undo cage step',panel()).click();
 const undone=await state();assert.deepEqual(undone.cage,cage);assert.deepEqual(undone.sel,picked.sel);assert.equal(undone.undo,0);
 await button('Redo cage step',panel()).click();assert.deepEqual((await state()).cage,expected);
 await done();
 const accepted=await f.doc();
 assert.deepEqual(accepted,{...doc,nodes:doc.nodes.map(node=>node.kind==='subd'?{...node,cage:expected}:node)});
 const native=await nativeFor('crease-fence-moved-native',accepted);
 assert.ok(native.volume>original.volume);
 await f.undo();await f.same(doc);await f.redo();await f.same(accepted);
 const saved=await f.save('raised-creased-upper-panel');await f.freshOpen(saved.file,accepted,'crease-fence-reopened');
 const reopened=await nativeFor('crease-fence-reopened-native',await f.doc());
 assert.equal(reopened.digest,native.digest);
 await button('Iso').click();await f.page.getByTitle('Frame all (F)',{exact:true}).click();
 await f.snapshot('crease-fence-reopened-framed');
 f.report.observations.push({label:'crease-fence',upper,movedVertices:moving.size,protectedCreases:cage.creases.length,
  originalVolume:original.volume,movedVolume:native.volume,nativeDigest:native.digest});
}

await f.run(async()=>{
 await f.newPage();await f.page.setViewportSize({width:1440,height:1000});await button('New part').click();await f.page.waitForFunction(()=>window.__studioDoc.nodes.length===0);await f.ready();
 await command('subd box');const hud=f.page.getByRole('dialog',{name:'SubD box',exact:true});
 for(const [name,value] of [['Width X',30],['Depth Y',20],['Height Z',16],['Quads along a side',4],['Centre X',0],['Centre Y',0],['At Z',0]])await hud.getByLabel(name,{exact:true}).fill(String(value));
 await hud.locator('.status.ok').waitFor();await button('Apply',hud).click();await f.page.waitForFunction(()=>window.__studioDoc.nodes.some(n=>n.kind==='subd'));await f.ready();const base=await f.doc();
 const begin=async()=>{await command('edit cage');await panel().waitFor();await button('View cube directions').click();await f.page.getByRole('menuitem',{name:'Top',exact:true}).click();if(await button('Ortho').getAttribute('aria-pressed')!=='true')await button('Ortho').click();await button('Box',panel()).click();};
 if(creaseFence){await fencedWorkflow(base,begin);return;}
 await begin();
 for(const [mode,point,key,grownCount,total] of [['Vertex',[0,0,16],'vertices',5,98],['Edge',[3.75,0,16],'edges',7,192],['Face',[3.75,2.5,16],'faces',5,96]]) {
  await pick(mode,point);const one=await state();assert.equal(one.sel[key].length,1);
  await button('Grow',panel()).click();const grown=await state();assert.equal(grown.sel[key].length,grownCount);assert.deepEqual(grown.cage,one.cage);assert.equal(grown.undo,0);
  if(mode==='Vertex') {
   const coords=grown.sel.vertices.map(v=>grown.cage.positions.slice(3*v,3*v+3).join(',')).sort();
   assert.deepEqual(coords,['-7.5,0,16','0,-5,16','0,0,16','0,5,16','7.5,0,16'].sort());
  }
  await button('Shrink',panel()).click();assert.deepEqual((await state()).sel,one.sel);
  await button('Linked',panel()).click();const linked=await state();assert.equal(linked.sel[key].length,total);assert.deepEqual(linked.cage,one.cage);assert.equal(linked.undo,0);
  await button('Shrink',panel()).click();assert.deepEqual((await state()).sel,linked.sel);await f.same(base);
 }
 await f.snapshot('linked-faces');await button('Cancel cage edit',panel()).click();await panel().waitFor({state:'detached'});await f.same(base);
 await begin();await pick('Edge',[3.75,0,16]);await button('Grow',panel()).click();const grown=await state();
 await button('Crease',panel()).click();const creased=await state();assert.equal(creased.undo,1);assert.equal(creased.creases,7);assert.deepEqual(creased.sel,grown.sel);
 await button('Undo cage step',panel()).click();assert.deepEqual((await state()).cage,grown.cage);assert.deepEqual((await state()).sel,grown.sel);
 await button('Redo cage step',panel()).click();assert.deepEqual((await state()).cage,creased.cage);await f.snapshot('grown-edges-creased');
 await done();const accepted=await f.doc();assert.deepEqual(accepted.nodes.find(n=>n.kind==='subd').cage,creased.cage);
 await f.undo();await f.same(base);await f.redo();await f.same(accepted);const saved=await f.save('grown-crease');await f.freshOpen(saved.file,accepted,'fresh-open');
});
