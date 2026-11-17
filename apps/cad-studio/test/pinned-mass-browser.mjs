import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
const pins=['apps/cad-studio/src/App.tsx','apps/cad-studio/src/viewport/Viewport.tsx','apps/cad-studio/src/app/pinnedMass.ts','apps/cad-studio/src/state/usePinnedMass.ts','apps/cad-studio/src/ui/PinnedMassControls.tsx','apps/cad-studio/test/pinned-mass-browser.mjs'];
const f=await createFlow({name:'pinned-mass',output:process.argv[2],envFrozen:'PINNED_MASS_FROZEN',initialFiles:pins,requiredFrozen:pins,
 qualification:'Two native ordinary cubes: explicit session COM, all-member hidden retention and accepted material updates.',
 limits:['Candidate failure, delayed mass delivery, project/worker reset and manufacturing previews are not exercised here. No dynamics or safety approval.'],
 snapshotExtra:()=>({massPanel:document.querySelector('[aria-label="Pinned centre of mass"]')?.textContent,marker:document.querySelector('[aria-label="Pinned centre of mass marker"]')?.getAttribute('data-position'),bodies:window.__studioBodies?.(),selection:window.__studioSelection})});
const doc={format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nodes:[{kind:'sketch',id:'n0',profile:'rectangle',min:[0,0],max:[10,10]},{kind:'extrude',id:'n1',sketch:0,height:10},{kind:'sketch',id:'n2',profile:'rectangle',min:[30,0],max:[40,10]},{kind:'extrude',id:'n3',sketch:2,height:10}],outputs:{b1:{node:1,side:'solid'},b3:{node:3,side:'solid'}},nextId:4,bodies:{b1:{name:'Cube A',material:'al6061'},b3:{name:'Cube B',material:'steel'}}};
const button=name=>f.page.getByRole('button',{name,exact:true});
const row=key=>f.page.locator(`[data-browser-body-key="${key}"]`);
const panel=()=>f.page.getByRole('complementary',{name:'Pinned centre of mass',exact:true});
const marker=()=>f.page.locator('[aria-label="Pinned centre of mass marker"]');
async function open(){await f.openFile({name:'two-cube-com.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))},4);await f.same(doc);}
async function invariant(){return f.page.evaluate(()=>({doc:window.__studioDoc,selection:window.__studioSelection,dirty:!!document.querySelector('[aria-label="Unsaved changes"]'),undo:['Undo','Redo'].map(n=>{const b=document.querySelector(`button[aria-label="${n}"]`);return [b?.disabled,b?.getAttribute('data-tip')];})}));}
async function com(x,mass){await f.page.waitForFunction(x=>{const p=document.querySelector('[aria-label="Pinned centre of mass marker"]')?.getAttribute('data-position')?.split(',').map(Number);return p&&Math.abs(p[0]-x)<1e-9;},x);const actual=(await marker().getAttribute('data-position')).split(',').map(Number);assert.ok(Math.abs(actual[0]-x)<1e-9);assert.ok(Math.abs(actual[1]-5)<1e-9);assert.ok(Math.abs(actual[2]-5)<1e-9);assert.ok(Math.abs(Number.parseFloat(await panel().locator('.kv b').first().innerText())-mass)<1e-9);return actual;}
async function selectBoth(){await row('b1').click();await row('b3').click({modifiers:['Shift']});await f.page.waitForFunction(()=>window.__studioSelection.selection.bodies.length===2);}
await f.run(async()=>{
 await f.newPage();await open();await selectBoth();await button('Pin selected bodies’ COM').waitFor();await f.page.waitForFunction(()=>![...document.querySelectorAll('button')].find(b=>b.textContent==='Pin selected bodies’ COM')?.disabled);
 const before=await invariant();await button('Pin selected bodies’ COM').click();await com(5765/211,10.55);assert.deepEqual(await invariant(),before,'Pin is display only');
 const native=await f.page.evaluate(()=>window.__studioBodies());assert.equal(native.fresh,true);for(const b of native.bodies){assert.ok(Math.abs(b.volume-1000)<1e-8);assert.equal(b.massRef,null);}assert.equal((await panel().innerText()).match(/closed-form;/g)?.length,2);await f.snapshot('01-two-cube-native-com');
 await f.page.keyboard.press('Escape');await f.page.waitForFunction(()=>window.__studioSelection.selection.bodies.length===0);await com(5765/211,10.55);assert.deepEqual(await f.doc(),doc);
 await row('b3').locator('xpath=..').getByRole('button',{name:'Hide body',exact:true}).click();await f.ready();await com(5765/211,10.55);assert.match(await panel().innerText(),/hidden, still included/);await f.snapshot('02-hidden-member-included');
 await button('Undo').click();await f.same(doc);await row('b3').click();await f.page.getByLabel('Material',{exact:true}).selectOption('al6061');await f.ready();await com(20,5.4);const changed=await f.doc();assert.equal(changed.bodies.b3.material,'al6061');assert.deepEqual(changed.nodes,doc.nodes);await f.snapshot('03-accepted-material-update');
 await button('Undo').click();await f.same(doc);await com(5765/211,10.55);await button('Redo').click();await f.same(changed);await com(20,5.4);
 const beforeClear=await invariant();await button('Clear COM marker').click();assert.equal(await marker().count(),0);assert.deepEqual(await invariant(),beforeClear);
 await selectBoth();await button('Pin selected bodies’ COM').click();await com(20,5.4);await open();assert.equal(await marker().count(),0);assert.equal(await button('Clear COM marker').count(),0);
 await selectBoth();await button('Pin selected bodies’ COM').click();await com(5765/211,10.55);await button('New part').click();await f.page.waitForFunction(()=>window.__studioDoc.nodes.length===0);assert.equal(await marker().count(),0);assert.equal(await button('Clear COM marker').count(),0);await f.snapshot('04-new-clears-session');
 f.report.observations.push({native,analytic:{volumes:[1000,1000],densities:[2.7,7.85],masses:[2.7,7.85],total:10.55,centroid:[5765/211,5,5],equalDensity:{mass:5.4,centroid:[20,5,5]}},scope:'Actual public Pin/Escape/Hide/Material/Undo/Redo/Clear/Open/New; no injected product state or new native evaluator.'});
});
