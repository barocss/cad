import assert from 'node:assert/strict';
import {createFlow} from './flow-helper.mjs';
const f=await createFlow({name:'mount-history',output:process.argv[2],envFrozen:'MOUNT_HISTORY_FROZEN',initialFiles:['apps/cad-studio/test/mount-history-browser.mjs'],qualification:'Terminal Mount History retains its exact group through edits, cancel, refusal and reopen.',limits:['Exact terminal group only; sample rows are QA fixtures, not manufacturing qualified. No physical downloads.'],inspectorSource:`
import {readFileSync} from 'node:fs';
import {rectanglePart} from '@barocss/cad-model/engine/doc';
import {evaluateDoc} from '@barocss/cad-model/engine/evaluate';
import {mountNodes} from '@barocss/cad-model/app/mounts';
const doc={...rectanglePart(160,100,10),mounts:{version:1,rows:JSON.parse(readFileSync('../../packages/barocss-cad-model/samples/rows/mounts.json','utf8')).rows}};
const result=evaluateDoc(doc,0);if(!result.ok)throw Error(JSON.stringify(result));
const face=result.bodies[0].mesh.faces.find(f=>f.name==='n1.top');
console.log(JSON.stringify(mountNodes({doc,bodies:result.bodies,selection:{bodies:[],edges:[],faces:[{body:0,face:face.index}]}},{row:'nema17',x:80,y:50,turn:'0',pilot:'through'})));
`});
const hud=()=>f.page.locator('.hud'),field=name=>hud().getByLabel(name,{exact:true});
async function open(doc){await f.page.locator('input[aria-label="Model file"]').setInputFiles({name:'mount-history.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))});await f.same(doc);}
async function ready(){await f.page.waitForFunction(()=>[...document.querySelectorAll('.hud button')].some(b=>b.textContent.trim()==='Apply'&&!b.disabled),null,{timeout:30000});}
async function edit(doc){await f.openFeatureEditor(doc.nodes.length-1);await f.editor().getByRole('button',{name:'Edit Mount',exact:true}).click();await hud().waitFor();await ready();}
async function cancel(){await hud().getByRole('button',{name:'Cancel',exact:true}).click();await hud().waitFor({state:'hidden'});}
await f.run(async()=>{
 const source=await f.inspect('fixture',{});await f.newPage();await open(source);await edit(source);assert.equal(await field('Mount').inputValue(),'nema17');await field('Axis coordinate 1').fill('85');await cancel();await f.same(source);
 await edit(source);await field('Axis coordinate 1').fill('999');await hud().getByText(/off the face/).first().waitFor();assert.equal(await hud().getByRole('button',{name:'Apply',exact:true}).isDisabled(),true);await f.same(source);await cancel();
 await edit(source);await field('Axis coordinate 1').fill('85');await field('Turn').selectOption('90');await field('Pilot').selectOption('recess');await ready();await f.snapshot('01-group-recess-preview');await hud().getByRole('button',{name:'Apply',exact:true}).click();await f.changed(source);await hud().waitFor({state:'hidden'});const edited=await f.doc();assert.equal(edited.nodes.length,source.nodes.length+1);assert.equal(edited.nodes.at(-1).id,source.nodes.at(-1).id);assert.deepEqual(Object.keys(edited.outputs),Object.keys(source.outputs));assert.equal(Object.values(edited.outputs)[0].node,edited.nodes.length-1);assert.deepEqual(edited.nodes.slice(0,2),source.nodes.slice(0,2));assert.deepEqual(edited.mounts,source.mounts);assert.equal(edited.nodes.at(-1).made.values.x,85);assert.equal(edited.nodes.at(-1).made.values.pilot,'recess');await f.snapshot('02-group-applied');
 await f.undo();await f.same(source);await f.redo();await f.same(edited);await f.page.getByRole('button',{name:'New part',exact:true}).click();await f.ready();await open(edited);await edit(edited);assert.equal(await field('Axis coordinate 1').inputValue(),'85');assert.equal(await field('Pilot').inputValue(),'recess');await f.snapshot('03-group-reopened');await cancel();await f.same(edited);assert.deepEqual(f.report.downloads,[]);
});
