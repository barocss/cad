import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
const baseline = process.argv.includes('--baseline');
const f = await createFlow({ name: 'sketch-coordinate-feedback', output: process.argv[2], envFrozen: 'SKETCH_COORDINATE_FEEDBACK_FROZEN', initialFiles: ['apps/cad-studio/test/sketch-coordinate-feedback-browser.mjs'], requiredFrozen: ['apps/cad-studio/src/App.tsx', 'apps/cad-studio/src/ui/SketchPanel.tsx'], qualification: 'Width-locked rectangle rejects Point 3 X51 while Y35 is accepted; report the settled coordinate without inventing conflict attribution.', limits: ['One straight rectangle; no mobility direction or solver expansion.'] });
const points = [[10,14],[50,14],[50,34],[10,34]];
const source = { format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nodes:[{kind:'sketch',profile:'polygon',points,outline:{points,bulges:[0,0,0,0],hv:{h:[0,2],v:[1,3]},lengths:{0:40}},sideTags:{outer:['e1','e2','e3','e4']},id:'n0'},{kind:'extrude',sketch:0,height:2,id:'n1'}],outputs:{b1:{node:1,side:'solid'}},nextId:2};
const field = axis => f.sketchPanel().getByLabel('Point 3 '+axis,{exact:true});
const notice = () => f.sketchPanel().getByRole('status',{name:'Coordinate input result',exact:true});
const button = name => f.page.getByRole('button',{name,exact:true});
await f.run(async()=>{
 await f.newPage(); await f.page.setViewportSize({width:1440,height:900});
 await f.openFile({name:'width-locked-coordinate.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(source))},2); await f.same(source);
 await f.openFeatureEditor(1); await f.editor().getByRole('button',{name:'Edit sketch',exact:true}).click(); await f.sketchPanel().waitFor();
 assert.equal(Number(await field('X').inputValue()),50);
 await field('X').fill('51'); await f.page.locator('.topbar button.finish').focus();
 assert.equal(Number(await field('X').inputValue()),50); await f.same(source);
 if (baseline) { assert.equal(await notice().count(),0); assert.equal(await f.sketchAlert(),null); }
 else { await notice().waitFor(); assert.match(await notice().textContent(),/Point 3 X.*50.*51/); }
 await f.snapshot('01-blocked-X');
 await field('Y').fill('35'); await f.page.locator('.topbar button.finish').focus();
 assert.equal(Number(await field('Y').inputValue()),35); assert.equal(await notice().count(),0); await f.same(source); await f.snapshot('02-accepted-Y');
 await field('X').fill('51'); await f.page.locator('.topbar button.finish').focus();
 if (!baseline) await notice().waitFor();
 await button('Undo').click(); assert.equal(await notice().count(),0); f.report.observations.push({ label: 'existing-undo-Y', y: Number(await field('Y').inputValue()) }); await f.same(source);
 await button('Redo').click(); assert.equal(await notice().count(),0); assert.equal(Number(await field('Y').inputValue()),35);
 const current=(await f.finishSketch('03-finished')).doc;
 assert.deepEqual(current.nodes[1],source.nodes[1]); assert.deepEqual(current.nodes[0].sideTags,source.nodes[0].sideTags); assert.deepEqual(current.nodes[0].outline.lengths,{0:40});
 await f.undo(); await f.same(source); await f.redo(); await f.same(current);
 if (!baseline) {
  await f.openFeatureEditor(1); await f.editor().getByRole('button',{name:'Edit sketch',exact:true}).click(); await f.sketchPanel().waitFor();
  await field('X').fill('51'); await f.page.locator('.topbar button.finish').focus(); await notice().waitFor();
  await f.page.evaluate(()=>document.activeElement?.blur()); await f.page.keyboard.press('Escape'); await f.sketchPanel().waitFor({state:'hidden'}); await f.same(current);
  await f.openFeatureEditor(1); await f.editor().getByRole('button',{name:'Edit sketch',exact:true}).click(); await f.sketchPanel().waitFor();
  assert.equal(await notice().count(),0); await f.snapshot('04-cancel-reopen-clean');
  await f.page.evaluate(()=>document.activeElement?.blur()); await f.page.keyboard.press('Escape'); await f.sketchPanel().waitFor({state:'hidden'}); await f.same(current);
 }
 f.report.observations.push({baseline,requestedX:51,settledX:50,acceptedY:35});
});
