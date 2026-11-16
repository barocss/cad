import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
const f=await createFlow({name:'fastener-hole-movement',output:process.argv[2],envFrozen:'FASTENER_MOVEMENT_FROZEN',initialFiles:['apps/cad-studio/test/fastener-hole-movement-browser.mjs'],qualification:'Hole movement does not imply a Fastener association; saved-hole guidance and explicit reposition preserve ownership.',limits:['Cosmetic fastener group only; no automatic following or physical downloads.'],inspectorSource:`
import { commands } from '@barocss/cad-model/app/commands';
import {readFileSync} from 'node:fs';
import { rectanglePart } from '@barocss/cad-model/engine/doc';
const doc={...rectanglePart(64,32,8),fastenerSizes:{version:1,rows:JSON.parse(readFileSync('../../packages/barocss-cad-model/samples/rows/fastener-sizes.json','utf8')).rows}};
doc.nodes.push({id:'n2',kind:'hole',parent:{node:1,side:'solid'},center:[32,16],radius:3.3});doc.outputs={b2:{node:2,side:'solid'}};doc.nextId=3;
const ctx={doc,bodies:[],selection:{faces:[],edges:[],bodies:[]}},cmd=commands.find(c=>c.id==='fastener');
console.log(JSON.stringify(cmd.build(ctx,{...cmd.defaults(ctx),kind:'hex-bolt',size:'M6',length:'20',joint:'nut',model:'cosmetic',x:32,y:16,z:8,grip:8,holeD:6.6,holeDepth:8,through:'1'})));
`});
const hud=()=>f.page.locator('.hud');
const field=name=>hud().getByLabel(name,{exact:true});
async function open(doc){await f.page.locator('input[aria-label="Model file"]').setInputFiles({name:'fastener-history.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))});await f.same(doc);}
async function edit(doc){await f.openFeatureEditor(doc.nodes.length-1);await f.editor().getByRole('button',{name:'Edit Fastener',exact:true}).click();await hud().waitFor();await f.page.waitForFunction(()=>[...document.querySelectorAll('.hud button')].some(b=>b.textContent.trim()==='Apply'&&!b.disabled),null,{timeout:30000});}
await f.run(async()=>{
 const original=await f.inspect('fixture',{});await f.newPage();await open(original);
 await f.openFeatureEditor(2);await f.editor().getByLabel('Centre X',{exact:true}).fill('44');
 const source=(await f.applyEditor(original,'01-hole-moved-fastener-fixed')).doc;
 assert.equal(source.nodes[2].center[0],44);assert.equal(Number(source.nodes.at(-1).made.values.x),32);
 assert.deepEqual(source.nodes.slice(3),original.nodes.slice(3),'moving a hole must not guess which fastener to move');
 await edit(source);await hud().getByText('Saved hole',{exact:true}).waitFor();assert.match(await hud().innerText(),/not linked/i);assert.match(await hud().innerText(),/Axis at X/i);assert.equal(await field('Axis at X').inputValue(),'32');await f.snapshot('02-explicit-reposition-guidance');
 await field('Axis at X').fill('44');await f.page.waitForFunction(()=>[...document.querySelectorAll('.hud button')].some(b=>b.textContent.trim()==='Apply'&&!b.disabled),null,{timeout:30000});assert.equal(await hud().getByText('Saved hole',{exact:true}).count(),0);
 await hud().getByRole('button',{name:'Apply',exact:true}).click();await f.changed(source);await hud().waitFor({state:'hidden'});const moved=await f.doc();assert.equal(Number(moved.nodes.at(-1).made.values.x),44);assert.equal(Number(moved.nodes.at(-1).made.values.holeD),0);assert.deepEqual(moved.nodes.slice(0,3),source.nodes.slice(0,3));await f.snapshot('03-explicitly-repositioned');
 await f.undo();await f.same(source);await f.redo();await f.same(moved);await f.page.getByRole('button',{name:'New part',exact:true}).click();await f.ready();await open(moved);await edit(moved);assert.equal(await field('Axis at X').inputValue(),'44');assert.equal(await hud().getByText('Saved hole',{exact:true}).count(),0);await hud().getByRole('button',{name:'Cancel',exact:true}).click();await f.same(moved);assert.deepEqual(f.report.downloads,[]);
});
