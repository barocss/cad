import assert from 'node:assert/strict';
import {createFlow} from './flow-helper.mjs';
const f=await createFlow({name:'mirror-history',output:process.argv[2],envFrozen:'MIRROR_HISTORY_FROZEN',initialFiles:['apps/cad-studio/test/mirror-history-browser.mjs','apps/cad-studio/src/ui/HistoryFeatureEditor.tsx'],qualification:'Exact saved terminal Mirror groups atomically edit their fixed numeric plane.',inspectorSource:`
import {readFileSync} from 'node:fs';
import {checkBrep,massPropertiesOf} from '@barocss/cad';
import {partSnapshot} from '@barocss/cad-model/engine/part';
const doc=JSON.parse(readFileSync(process.argv[2],'utf8'));
console.log(JSON.stringify(partSnapshot(doc).outputs.map(o=>({valid:checkBrep(o.brep,{strict:true}).valid,volume:massPropertiesOf(o).volume,vertices:o.brep.vertices.map(v=>v.point)}))));
`});
const button=(name,scope=f.page)=>scope.getByRole('button',{name,exact:true}),hud=()=>f.page.locator('.hud'),field=name=>hud().getByLabel(name,{exact:true});
const ready=()=>f.page.waitForFunction(()=>[...document.querySelectorAll('.hud button')].some(b=>b.textContent.trim()==='Apply'&&!b.disabled),null,{timeout:60000});
const seed={format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nodes:[{kind:'sketch',id:'n0',profile:'rectangle',min:[0,0],max:[40,24]},{kind:'extrude',id:'n1',sketch:0,height:10}],outputs:{b1:{node:1,side:'solid'}},nextId:2};
async function open(doc){await f.page.locator('input[aria-label="Model file"]').setInputFiles({name:'mirror.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))});await f.same(doc);}
async function edit(doc,index=doc.nodes.length-1){await f.openFeatureEditor(index);await button('Edit Mirror',f.editor()).click();await hud().waitFor();await ready();}
async function apply(doc){await ready();await button('Apply',hud()).click();await hud().waitFor({state:'hidden'});await f.changed(doc);await f.ready();return f.doc();}
async function native(label,doc,axis,at){const bodies=await f.inspect(label,doc);assert.equal(bodies.length,1);const b=bodies[0];assert.equal(b.valid,true);assert.ok(Math.abs(b.volume-19200)<1e-6);const min=[0,0,0],max=[40,24,10],lo=[...min],hi=[...max];lo[axis]=Math.min(min[axis],2*at-max[axis]);hi[axis]=Math.max(max[axis],2*at-min[axis]);for(let k=0;k<3;k++){assert.ok(Math.abs(Math.min(...b.vertices.map(p=>p[k]))-lo[k])<1e-7);assert.ok(Math.abs(Math.max(...b.vertices.map(p=>p[k]))-hi[k])<1e-7);}f.report.observations.push({label,volume:b.volume,lo,hi});}
await f.run(async()=>{
 await f.newPage();await open(seed);await f.page.locator('.outliner .ol-row > button.ol').first().click();await f.page.getByText('barocss',{exact:true}).click();await f.command('Mirror');await field('Plane').selectOption('yz');await field('Plane at').fill('40');const made=await apply(seed);await native('created-yz40',made,0,40);const id=made.nodes.at(-1).id,outKey=Object.keys(made.outputs)[0];
 let previous=made;
 for(const [plane,at,axis,index] of [['xy',20,2,4],['xy',0,2,4],['xz',-10,1,2]]){
  await edit(previous,index);await field('Plane').selectOption(plane);await field('Plane at').fill(String(at));const next=await apply(previous);assert.equal(next.nodes.length,at===0?3:5);assert.equal(next.nodes.at(-1).id,id);assert.equal(Object.keys(next.outputs)[0],outKey);await native(`${plane}-${at}`,next,axis,at);await f.undo();await f.same(previous);await f.redo();await f.same(next);previous=next;
 }
 await f.snapshot('atomic-mirror-history');await open(previous);await edit(previous);assert.equal(await field('Plane at').inputValue(),'-10');await field('Plane at').fill('');await f.page.waitForFunction(()=>[...document.querySelectorAll('.hud button')].some(b=>b.textContent.trim()==='Apply'&&b.disabled));await f.same(previous);await field('Plane at').fill('-15');await ready();await button('Cancel',hud()).click();await hud().waitFor({state:'hidden'});await f.same(previous);await native('reopened-cancel',previous,1,-10);assert.deepEqual(f.report.downloads,[]);
});
