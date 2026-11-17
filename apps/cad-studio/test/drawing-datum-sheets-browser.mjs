import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
const base=JSON.parse(await readFile(new URL('./fixtures/assembly-steps.bcad',import.meta.url),'utf8'));
delete base.instances;delete base.assemblySteps;
base.drawing={sheet:'A4',projection:'third',scale:1,hidden:false,title:'Multi-sheet datum identity',views:['front','top','right'],dimensions:[],sheets:[{id:'S2',name:'Side detail',views:['right']}]};
const f=await createFlow({name:'drawing-datum-sheets',envFrozen:'DRAWING_DATUM_SHEETS_FROZEN',output:process.argv[2],qualification:'Author face datums on two drawing sheets without reusing another sheet’s datum identity; preserve original anchors and native/SVG output.',initialFiles:['apps/cad-studio/test/drawing-datum-sheets-browser.mjs','apps/cad-studio/src/ui/drawing/DatumsEditor.tsx','apps/cad-studio/src/ui/DrawingWorkspace.tsx'],limits:['Synthetic rectangular plate and top/right datum annotations only; no new GD&T solver, standards certification or PDF qualification.']});
const button=name=>f.page.getByRole('button',{name,exact:true});
const input=name=>f.page.getByLabel(name,{exact:true});
async function drawing(){await button('Drawing').click();await f.page.locator('svg[aria-label="Drawing sheet"] g.view').first().waitFor();}
async function editor(){const d=f.page.locator('details[aria-label="Datum features"]');if((await d.getAttribute('open'))===null)await d.locator('summary').click();}
async function choose(view){await editor();await input('Datum annotation view').selectOption(view);const options=await input('Datum face').locator('option').evaluateAll(xs=>xs.map(x=>x.value).filter(Boolean));assert.ok(options.length);await input('Datum face').selectOption(options[0]);}
await f.run(async()=>{
 await f.newPage();await f.page.locator('input[aria-label="Model file"]').setInputFiles({name:'datum-sheets.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(base))});await f.page.waitForFunction(()=>window.__studioDoc?.drawing?.title==='Multi-sheet datum identity');await f.ready();await drawing();await choose('top');const before=await f.doc();await button('Add face datum').click();await f.changed(before);const first=await f.doc();assert.equal(first.drawing.datums.length,1);assert.equal(first.drawing.datums[0].letter,'A');
 await f.page.getByRole('tab',{name:'Side detail',exact:true}).click();await choose('right');await f.snapshot('01-second-sheet-offer');await button('Add face datum').click();
 // Record either a refused commit or duplicate accepted identity before asserting distinct datum ownership.
 await f.page.waitForFunction(()=>window.__studioDoc?.drawing?.datums?.length===2||document.body.innerText.includes('Drawing unchanged'));
 const second=await f.doc();f.report.observations.push({first:first.drawing.datums,afterSecond:second.drawing.datums,bodyNotice:await f.page.getByText('Drawing unchanged',{exact:true}).count()});await f.snapshot('02-second-sheet-result');assert.equal(second.drawing.datums.length,2,'a second-sheet datum must not collide with the first-sheet datum');assert.deepEqual(second.drawing.datums[0],first.drawing.datums[0]);assert.equal(second.drawing.datums[1].letter,'B');assert.notEqual(second.drawing.datums[0].id,second.drawing.datums[1].id);assert.equal(second.drawing.datums[1].view,'right');assert.deepEqual(second.nodes,first.nodes);
 await f.undo();await f.same(first);await f.redo();await f.same(second);await editor();await button('Remove datum B').waitFor();
 const [download]=await Promise.all([f.page.waitForEvent('download'),button('Export SVG').click()]);const file=join(f.output,'second-sheet.svg');await download.saveAs(file);const svg=await readFile(file,'utf8');assert.ok(svg.includes('>B</text>'),'actual SVG contains datum B');
 await button('Clear datum features').click();await f.changed(second);const cleared=await f.doc();assert.deepEqual(cleared.drawing.datums,first.drawing.datums,'clear only removes this sheet’s datum');await f.undo();await f.same(second);
 await button('Model').click();const saved=await f.save('datum-sheets');await f.freshOpen(saved.file,saved.doc,'03-native-open');await drawing();await editor();await button('Remove datum A').waitFor();assert.equal(await button('Remove datum B').count(),0);await f.page.getByRole('tab',{name:'Side detail',exact:true}).click();await editor();await button('Remove datum B').waitFor();assert.equal(await button('Remove datum A').count(),0);assert.deepEqual((await f.doc()).drawing.datums,second.drawing.datums);await f.snapshot('04-reopened');f.report.observations.push({undoRedo:true,clearIsSheetLocal:true,nativeSaveOpen:true,actualSvgDatumB:true});
});
