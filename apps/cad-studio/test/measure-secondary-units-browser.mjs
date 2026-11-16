import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
import { clickModelCommand } from './model-rail-helper.mjs';
const key='studio.measure-secondary-units';
const pins=['apps/cad-studio/test/measure-secondary-units-browser.mjs','apps/cad-studio/src/ui/MeasurementInspector.tsx','apps/cad-studio/src/App.tsx'];
const f=await createFlow({name:'measure-secondary-units',output:process.argv[2],envFrozen:'MEASURE_SECONDARY_UNITS_FROZEN',initialFiles:pins,requiredFrozen:pins,
 qualification:'Actual Model Measure displays one inch and one square inch without changing mm geometry; only preference survives local lifecycle.',
 limits:['One native 25.4 mm cube, planar faces, desktop WebGPU. Radius/axes/tiny invalid formatting use focused tests, not this browser run.'],
 inspectorSource:`import assert from 'node:assert/strict';
import {evaluateDoc} from '@barocss/cad-model/engine/evaluate';
import {measureItem,measureBetween} from '@barocss/cad-model/app/measure';
const {doc}=JSON.parse(process.argv[3]);const r=evaluateDoc(doc,1);assert.ok(r.ok);const mesh=r.bodies[0].mesh;
const top=mesh.faces.findIndex(f=>f.name==='n1.top'),bottom=mesh.faces.findIndex(f=>f.name==='n1.bottom');assert.ok(top>=0&&bottom>=0);
const a={body:0,face:top},b={body:0,face:bottom};console.log(JSON.stringify({top,bottom,faces:mesh.faces.map(f=>({name:f.name,index:f.index})),topItem:measureItem(mesh,a),bottomItem:measureItem(mesh,b),between:measureBetween(mesh,a,mesh,b),volume:r.bodies[0].volume}));`,
 snapshotExtra:()=>({measurement:document.querySelector('[aria-label="Measurement"]')?.textContent,dirty:!!document.querySelector('[aria-label="Unsaved changes"]'),overlay:window.__studioOverlayTexts?.()['measure:label']??[]})});
const doc={format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nodes:[{kind:'sketch',profile:'rectangle',min:[0,0],max:[25.4,25.4],id:'n0'},{kind:'extrude',sketch:0,height:25.4,id:'n1'}],outputs:{b1:{node:1,side:'solid'}},nextId:2};
const button=name=>f.page.getByRole('button',{name,exact:true});
const panel=()=>f.page.getByRole('complementary',{name:'Measurement',exact:true});
const select=()=>panel().getByLabel('Measure secondary units',{exact:true});
const metric=label=>panel().locator('.kv').filter({hasText:new RegExp('^'+label+'\\b')}).locator('b');
const settle=()=>f.page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
const state=()=>f.page.evaluate(()=>({doc:window.__studioDoc,selection:window.__studioSelection,dirty:!!document.querySelector('[aria-label="Unsaved changes"]'),history:[...document.querySelectorAll('.history .hs')].map(e=>e.getAttribute('aria-label')),undo:['Undo','Redo'].map(n=>{const b=document.querySelector(`button[aria-label="${n}"]`);return b?{disabled:b.disabled,tip:b.getAttribute('data-tip')}:null;}),overlay:window.__studioOverlayTexts?.()['measure:label']??[]}));
async function open(value=doc){await f.openFile({name:'measure-inch-cube.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(value))},value.nodes.length);assert.deepEqual(await f.doc(),value);}
async function enter(expected){await clickModelCommand(f.page,'Inspect','Measure');await panel().waitFor();assert.equal(await select().inputValue(),expected);assert.equal(await panel().locator('.measure-item').count(),0);assert.equal(await metric('Distance').count(),0);}
async function close(){await button('Done measuring').click();await panel().waitFor({state:'hidden'});}
async function cap(side,z){await button('View cube directions').click();await f.page.getByRole('menuitem',{name:side,exact:true}).click();await f.page.getByTitle('Frame all (F)',{exact:true}).click();await settle();const at=await f.page.evaluate(p=>window.__studioScreenOf(p),[12.7,12.7,z]);assert.ok(await f.page.evaluate(([x,y])=>!!document.elementFromPoint(x,y)?.closest('canvas.vp-canvas'),at));await f.page.mouse.click(...at);}
async function measure(){await cap('Top',25.4);await panel().locator('.measure-item').first().waitFor();await cap('Bottom',0);await panel().getByText('BETWEEN',{exact:true}).waitFor();}
async function change(value){const before=await state();await select().selectOption(value);await settle();assert.deepEqual(await state(),before,'preference must not alter source/result overlay/selection/history/dirty');}
await f.run(async()=>{
 await f.newPage();await open();await enter('none');await measure();
 const raw=await f.inspect('native-cube',{}, {doc});assert.ok(Math.abs(raw.between.distance-25.4)<1e-8);assert.ok(Math.abs(raw.topItem.area-645.16)<1e-5);assert.ok(Math.abs(raw.bottomItem.area-645.16)<1e-5);
 assert.equal(await metric('Distance').innerText(),'25.4 mm');assert.deepEqual(await metric('Area').allInnerTexts(),['645.16 mm²','645.16 mm²']);
 await change('inch');assert.match(await metric('Distance').innerText(),/25\.4 mm.*1 in/);for(const text of await metric('Area').allInnerTexts())assert.match(text,/645\.16 mm².*1 in²/);assert.equal(await metric('Angle').innerText(),'0°');
 await f.snapshot('01-inch-distance-area');assert.equal(await f.page.evaluate(k=>localStorage.getItem(k),key),'inch');
 await select().focus();await f.page.keyboard.press('Escape');await panel().waitFor({state:'hidden'});await enter('inch');await close();await f.page.reload();await f.ready();await open();await enter('inch');await f.snapshot('02-reload-preference-no-picks');await close();
 await button('New part').click();await f.page.waitForFunction(()=>window.__studioDoc.nodes.length===0);await open();await enter('inch');await measure();await change('none');assert.equal(await metric('Distance').innerText(),'25.4 mm');await close();await f.page.reload();await f.ready();await open();await enter('none');await f.snapshot('03-none-persisted');await close();
 // This intercepts storage writes only; application UI and measurement remain real.
 await f.page.addInitScript(k=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(name,value){if(name===k)throw new DOMException('Blocked for preference acceptance','QuotaExceededError');return original.call(this,name,value);};},key);
 await f.page.reload();await f.ready();await open();await enter('none');await change('inch');await panel().getByRole('status',{name:'Measure unit preference',exact:true}).waitFor();await measure();assert.match(await metric('Distance').innerText(),/1 in/);await f.snapshot('04-storage-refusal-session');await close();await enter('inch');await close();
 await f.page.reload();await f.ready();await open();await enter('none');assert.equal(await f.page.evaluate(k=>localStorage.getItem(k),key),'none');await f.snapshot('05-refused-write-not-restored');await close();assert.deepEqual(await f.doc(),doc);
 f.report.observations.push({sourceFaceNames:['n1.top','n1.bottom'],raw,independentLengthInches:25.4/25.4,independentAreaSquareInches:645.16/(25.4*25.4),storageFailure:'session inch retained on reentry; reload restores saved none'});
});
