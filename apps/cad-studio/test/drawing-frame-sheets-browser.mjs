import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createFlow} from './flow-helper.mjs';
const base=JSON.parse(await readFile(new URL('./fixtures/bracket.bcad',import.meta.url),'utf8'));
base.drawing={sheet:'A4',projection:'third',scale:2,hidden:false,title:'Multi-sheet frame identity',views:['front','top','right'],dimensions:[],sheets:[{id:'S2',name:'Side targets',views:['right'],scale:2}]};
const f=await createFlow({name:'drawing-frame-sheets',envFrozen:'DRAWING_FRAME_SHEETS_FROZEN',output:process.argv[2],qualification:'Standalone frame IDs remain unique across sheets without losing either authored annotation.',initialFiles:['apps/cad-studio/test/drawing-frame-sheets-browser.mjs','apps/cad-studio/src/ui/DrawingWorkspace.tsx'],limits:['Synthetic plate, standalone frames only; no GD&T solver or PDF/DXF qualification.']});
const button=name=>f.page.getByRole('button',{name,exact:true});const rows=d=>d.drawing?.frames??[];
async function drawing(){await button('Drawing').click();await f.page.locator('svg[aria-label="Drawing sheet"] g.view').first().waitFor();}
async function click(view,p){const q=await f.page.evaluate(([v,p])=>window.__studioDrawingAt(v,...p),[view,p]);assert.ok(q);await f.page.mouse.click(q.x,q.y);}
async function tab(name){await f.page.getByRole('tab',{name,exact:true}).click();await f.page.locator('svg[aria-label="Drawing sheet"] g.view').first().waitFor();}
async function frame(view,place){await f.page.getByLabel('Standalone frame view',{exact:true}).selectOption(view);await button('Add standalone frame').click();await click(view,place);await f.page.waitForTimeout(250);return f.doc();}
async function svg(label){const [d]=await Promise.all([f.page.waitForEvent('download'),button('Export SVG').click()]);const file=join(f.output,label+'.svg');await d.saveAs(file);assert.ok((await readFile(file,'utf8')).includes('>Ø0.1</text>'));}
await f.run(async()=>{
 await f.newPage();await f.page.locator('input[aria-label="Model file"]').setInputFiles({name:'frame-sheets.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(base))});await f.page.waitForFunction(()=>window.__studioDoc?.drawing?.title==='Multi-sheet frame identity');await f.ready();await drawing();
 const first=await frame('front',[-10,10]);assert.equal(rows(first).length,1);assert.equal(rows(first)[0].id,'frame-1');await tab('Side targets');const second=await frame('right',[-10,10]);f.report.observations.push({first:rows(first),afterSecond:rows(second)});await f.snapshot('01-second-sheet');assert.equal(rows(second).length,2,'second-sheet frame must not disappear due to reused ID');assert.equal(rows(second)[1].id,'frame-2');assert.deepEqual(rows(second)[0],rows(first)[0]);assert.deepEqual(second.nodes,first.nodes);
 await f.undo();await f.same(first);await f.redo();await f.same(second);await svg('side');await tab('Sheet 1');await svg('front');
 await button('Model').click();const saved=await f.save('frame-sheets');await f.freshOpen(saved.file,saved.doc,'02-native-open');await drawing();await tab('Side targets');assert.deepEqual(rows(await f.doc()),rows(second));await svg('reopened-side');await f.snapshot('03-reopened');
 await button('Remove standalone frame 1').click();const confirmation=f.page.getByRole('group',{name:'Confirm drawing control removal'});await confirmation.waitFor();await f.same(second);await confirmation.getByRole('button',{name:'Remove annotation and controls',exact:true}).click();await f.changed(second);assert.deepEqual(rows(await f.doc()),rows(first));await f.undo();await f.same(second);f.report.observations.push({nativeOpen:true,actualSvgFrames:true,undoRedo:true,localRemovalKeepsOtherFrame:true});
});
