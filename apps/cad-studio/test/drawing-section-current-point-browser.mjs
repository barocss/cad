import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createFlow } from './flow-helper.mjs';
const baseline=process.argv.includes('--baseline');
const root=resolve(import.meta.dirname,'../../..');
const native=resolve(root,'packages/barocss-cad');
const exports=JSON.parse(await readFile(resolve(native,'package.json'),'utf8')).exports;
const nativeAliases=Object.entries(exports).map(([key,value])=>({find:new RegExp('^'+(key==='.'?'@barocss/cad':'@barocss/cad/'+key.slice(2))+'$'),replacement:resolve(native,value.import)}));
const base={"format":"barocss-cad-model","schema":3,"units":"mm","parameters":{},"nodes":[{"kind":"sketch","profile":"rectangle","min":[0,0],"max":[60,40],"id":"n0"},{"kind":"extrude","sketch":0,"height":10,"id":"n1"},{"kind":"hole","parent":{"node":1,"side":"solid"},"center":[15,10],"radius":3,"id":"n2"}],"outputs":{"b2":{"node":2,"side":"solid"}},"nextId":3,"drawing":{"sheet":"A3","projection":"third","hidden":true,"dimensions":[{"id":"wall","view":"section:A","kind":"linear","a":{"edge":"n2.side0|section_b2.cut.side0#1","at":"end","near":[12,10,0]},"b":{"edge":"n2.side0|section_b2.cut.side0#1","at":"end","near":[12,10,10]},"orient":"vertical","place":[5,5]}],"sections":[{"id":"A","view":"front","at":10}]}};
const f=await createFlow({name:'drawing-section-current-point',output:process.argv[2],envFrozen:'SECTION_POINT_FROZEN',initialFiles:['apps/cad-studio/test/drawing-section-current-point-browser.mjs'],extraFrozen:['packages/barocss-cad-model/src/drawing/issues.ts'],viteAliases:baseline?undefined:[{find:'@barocss/cad-model/drawing/issues',replacement:resolve(root,'packages/barocss-cad-model/src/drawing/issues.ts')},...nativeAliases],qualification:'Section hidden-line diagnosis follows current resolved endpoints after a Hole size edit.',limits:['One native-generated section and one Hole diameter edit; no output export, downloads, schema or native-folder flow.']});
const button=name=>f.page.getByRole('button',{name,exact:true});
const hidden=()=>f.page.locator('.dw-issue[title="DIM_ON_HIDDEN"]');
async function drawing(){await button('Drawing').click();await f.page.locator('svg[aria-label="Drawing sheet"] g.view').first().waitFor();await f.page.waitForFunction(()=>!!window.__studioDrawing?.()?.sections?.length,null,{timeout:30000});}
async function check(label,expectedHidden){await drawing();await f.page.waitForFunction(()=>window.__studioDrawing?.()?.dimensions?.some(d=>d.value>0),null,{timeout:30000});assert.equal(await hidden().count(),expectedHidden);f.report.observations.push({label,drawing:await f.page.evaluate(()=>window.__studioDrawing())});await f.snapshot(label);}
await f.run(async()=>{
 await f.newPage();await f.page.locator('input[aria-label="Model file"]').setInputFiles({name:'section-current-point.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(base))});await f.page.waitForFunction(()=>window.__studioDoc?.drawing?.dimensions?.[0]?.id==='wall',null,{timeout:30000});await f.ready();assert.deepEqual(await f.doc(),base);const original=await f.doc();await check('01-before',0);
 await button('Model').click();await f.openFeatureEditor(2,'source Hole');await f.editor().getByLabel('Diameter',{exact:true}).fill('8');await f.applyEditor(original,'02-hole-edited');const edited=await f.doc();assert.equal(edited.nodes[2].radius,4);await check('03-after',baseline?1:0);if(baseline)return;
 await f.undo();await f.same(original);await check('04-undo',0);await f.redo();await f.same(edited);await check('05-redo',0);
 await button('Model').click();await button('New part').click();await f.ready();await f.page.locator('input[aria-label="Model file"]').setInputFiles({name:'section-edited.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(edited))});await f.page.waitForFunction(()=>window.__studioDoc?.nodes?.[2]?.radius===4,null,{timeout:30000});await f.ready();assert.deepEqual(await f.doc(),edited);await check('06-reopened',0);assert.deepEqual(f.report.downloads,[]);
});
