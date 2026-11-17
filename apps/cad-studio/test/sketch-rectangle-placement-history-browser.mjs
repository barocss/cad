import assert from 'node:assert/strict';
import {createFlow} from './flow-helper.mjs';
const baseline=process.argv.includes('--baseline');
const pins=['apps/cad-studio/test/sketch-rectangle-placement-history-browser.mjs','apps/cad-studio/src/App.tsx','apps/cad-studio/src/sketch/draftHistory.ts','apps/cad-studio/src/viewport/studioSketchViewportActions.ts','apps/cad-studio/src/viewport/viewportPointerInput.ts','apps/cad-studio/src/app/sketchControls.ts'];
const f=await createFlow({name:'sketch-rectangle-placement-history',output:process.argv[2],envFrozen:'SKETCH_RECTANGLE_PLACEMENT_SOURCE_FROZEN',initialFiles:pins,requiredFrozen:pins,qualification:'Actual two-click Rectangle placement is one reversible sketch draft operation.',limits:['Axis-aligned rectangles; Clear reservation recovery is proven by restoring and finishing the original tagged source. No new curve placement history qualification.'],inspectorSource:`
import {readFileSync} from 'node:fs';import {partBreps} from '@barocss/cad-model/engine/evaluate';import {brepMassProperties,checkBrep} from '@barocss/cad';
console.log(JSON.stringify(partBreps(JSON.parse(readFileSync(process.argv[2],'utf8'))).map(({key,brep})=>({key,volume:brepMassProperties(brep,1).volume,check:checkBrep(brep,{strict:true}),vertices:brep.vertices.map(v=>v.point)}))));
`});
const source={format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nodes:[{id:'n0',kind:'sketch',profile:'rectangle',min:[0,0],max:[40,30],sideTags:{outer:['e1','e2','e3','e4']}},{id:'n1',kind:'extrude',sketch:0,height:10}],outputs:{b1:{node:1,side:'solid'}},nextId:2};
const button=name=>f.page.getByRole('button',{name,exact:true});
const shapes=()=>f.page.locator('.vp-overlay .sk-shape').evaluateAll(es=>es.map(e=>{const r=e.getBBox();return {x:r.x,y:r.y,width:r.width,height:r.height,construction:e.classList.contains('construction')};}));
async function checkShapes(n){const rows=await shapes();assert.equal(rows.length,n);assert.ok(rows.every(r=>r.width>0&&r.height>0),'no zero-size placement preview survives');return rows;}
async function rectangle(a,b){await f.tool('Rectangle','r');await f.worldClick(a);await f.worldClick(b);}
async function escape(){await f.page.locator('.topbar button.finish').focus();await f.page.keyboard.press('Escape');await f.sketchPanel().waitFor({state:'hidden'});}
async function open(doc){await f.page.locator('input[aria-label="Model file"]').setInputFiles({name:'rectangle-placement.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))});await f.same(doc);await f.ready();}
async function edit(){await f.openFeatureEditor(1);await f.editor().getByRole('button',{name:'Edit sketch',exact:true}).click();await f.sketchPanel().waitFor();await f.frame([[0,0],[40,30]]);}
async function physical(doc,label){const [native]=await f.inspect(label,doc);assert.ok(native.check.valid);assert.ok(Math.abs(native.volume-600)<1e-8);for(const x of [0,20])for(const y of [0,10])for(const z of [0,3])assert.ok(native.vertices.some(p=>Math.hypot(p[0]-x,p[1]-y,p[2]-z)<1e-9));return native;}
await f.run(async()=>{
 await f.newPage();await open(source);await edit();const original=await checkShapes(1);await button('Clear profile').click();await checkShapes(0);await rectangle([0,0],[20,10]);await checkShapes(1);await f.same(source);
 const enabled=await button('Undo').isEnabled();f.report.observations.push({label:'clear-rectangle-undo',undoEnabled:enabled});await f.snapshot('01-clear-rectangle');
 if(baseline){assert.equal(enabled,false,'baseline Rectangle placement drops Clear draft Undo');return;}
 assert.equal(enabled,true);await button('Undo').click();await checkShapes(0);await f.same(source);await button('Undo').click();assert.deepEqual(await checkShapes(1),original);await f.same(source);await f.snapshot('02-clear-original-restored');
 // Finish the restored original proves its authored side identity reservation survived.
 const restored=(await f.finishSketch('03-restored-finished')).doc;assert.deepEqual(restored.nodes[0].sideTags,source.nodes[0].sideTags);assert.deepEqual(restored.nodes[1],source.nodes[1]);
 await open(source);await edit();await button('Clear profile').click();await rectangle([0,0],[20,10]);await escape();await f.same(source);
 // New empty draft, repeated placement and construction are independent atomic entries.
 await button('New part').click();await f.page.waitForFunction(()=>window.__studioDoc?.nodes.length===0);await f.ready();const empty=await f.doc();await f.page.locator('.mode').getByRole('button',{name:'Sketch',exact:true}).click();await f.sketchPanel().waitFor();await f.frame([[0,0],[60,30]]);
 // A tool change invalidates an unfinished first-corner transaction.
 await f.tool('Rectangle','r');await f.worldClick([25,20]);await f.tool('Circle','c');await f.tool('Rectangle','r');await checkShapes(0);
 await rectangle([0,0],[20,10]);const first=await checkShapes(1);await button('Undo').click();await checkShapes(0);await button('Redo').click();assert.deepEqual(await checkShapes(1),first);
 // Degenerate two-click placements remain visible draft states, never accepted geometry.
 for(const [label,a,b] of [['same-point',[30,20],[30,20]],['zero-width',[30,15],[30,25]],['zero-height',[30,15],[40,15]]]){
  await f.worldClick(a);await f.worldClick(b);const invalid=await shapes();assert.equal(invalid.length,2);assert.ok(invalid.some(r=>r.width<1e-3||r.height<1e-3),'zero model dimension may project to a subpixel SVG span');const zeroField=label==='zero-height'?'Height':'Width';assert.equal(Number(await f.sketchPanel().locator('label').filter({hasText:new RegExp('^'+zeroField)}).locator('input').inputValue()),0);await f.same(empty);
  if(process.argv.includes('--degenerate-baseline')){assert.equal(await button('Undo').isEnabled(),false);f.report.observations.push({label:'degenerate-'+label,undoEnabled:false});await f.snapshot('degenerate-baseline');return;}
  assert.equal(await button('Undo').isEnabled(),true);if(label==='same-point')await f.snapshot('degenerate-undoable');await button('Undo').click();assert.deepEqual(await checkShapes(1),first);await button('Redo').click();assert.deepEqual(await shapes(),invalid);
  await f.worldClick([40,20]);await f.worldClick([50,25]);await checkShapes(2);await button('Undo').click();assert.deepEqual(await shapes(),invalid);await button('Undo').click();assert.deepEqual(await checkShapes(1),first);
  f.report.observations.push({label:'degenerate-'+label,undoRedo:true,documentUnchanged:true});
 }
 await f.tool('Rectangle','r');await f.worldClick([30,0]);const pending=await shapes();assert.equal(await button('Undo').isEnabled(),false);await f.page.locator('.topbar button.finish').focus();await f.page.keyboard.press('Meta+z');assert.deepEqual(await shapes(),pending,'pending placement Cmd-Z cannot consume the previous complete rectangle');await f.page.keyboard.press('Meta+Shift+z');assert.deepEqual(await shapes(),pending,'pending placement redo is a no-op');await f.same(empty);await f.worldClick([50,10]);await checkShapes(2);await button('Undo').click();assert.deepEqual(await checkShapes(1),first);await button('Undo').click();await checkShapes(0);await button('Redo').click();assert.deepEqual(await checkShapes(1),first);await button('Redo').click();await checkShapes(2);await button('Undo').click();await checkShapes(1);
 await button('Construction').click();await rectangle([30,15],[50,25]);const constructed=await checkShapes(2);assert.equal(constructed.filter(r=>r.construction).length,1);await button('Undo').click();assert.deepEqual(await checkShapes(1),first);await button('Redo').click();assert.equal((await checkShapes(2)).filter(r=>r.construction).length,1);await button('Undo').click();await checkShapes(1);await button('Construction').click();
 await f.tool('Select','s');await checkShapes(1);await f.same(empty);await f.snapshot('04-atomic-placement-and-tool-switch');await escape();await f.same(empty);
 // Independent accepted placement, actual extrusion and physical save/reopen.
 await f.page.locator('.mode').getByRole('button',{name:'Sketch',exact:true}).click();await f.sketchPanel().waitFor();await f.frame([[0,0],[30,20]]);await rectangle([0,0],[20,10]);const finished=(await f.finishSketch('05-new-rectangle-finished')).doc;assert.equal(finished.nodes[0].profile,'rectangle');assert.deepEqual([finished.nodes[0].min,finished.nodes[0].max],[[0,0],[20,10]]);
 await f.openExtrudeHud();const solid=(await f.applyExtrude({distance:3,previous:finished,label:'06-extruded'})).doc;const native=await physical(solid,'07-native');await f.undo();await f.same(finished);await f.redo();await f.same(solid);assert.deepEqual(await physical(solid,'08-redo-native'),native);
 const saved=await f.save('rectangle-placement');await f.freshOpen(saved.file,saved.doc,'09-reopened');await f.same(solid);assert.deepEqual(await physical(solid,'10-reopened-native'),native);await button('Iso').click();await f.page.getByTitle('Frame all (F)',{exact:true}).click();await f.snapshot('11-final-iso');
});
