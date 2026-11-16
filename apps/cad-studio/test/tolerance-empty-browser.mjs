import assert from 'node:assert/strict';
import {join} from 'node:path';
import {createFlow} from './flow-helper.mjs';
const pins=['apps/cad-studio/src/ui/drawing/ToleranceEditor.tsx','apps/cad-studio/test/tolerance-empty-browser.mjs'];
const f=await createFlow({name:'tolerance-empty',output:process.argv[2],envFrozen:'TOLERANCE_EMPTY_FROZEN',initialFiles:pins,requiredFrozen:pins,qualification:'Empty deviations never become zero; explicit zero and mm input units remain usable in inch sheets.',limits:['Linear dimension, Chrome WebGPU. No PDF or fit-table qualification.']});
await f.run(async()=>{
 for(const width of [1024,1440]){
  await f.newPage();await f.page.setViewportSize({width,height:1000});await f.openFile(join(f.repo,'apps/cad-studio/test/fixtures/bracket.bcad'),2);
  await f.page.click('.mode button:text-is("Drawing")');await f.page.locator('svg[aria-label="Drawing sheet"]').waitFor();await f.page.getByRole('button',{name:'Auto-dimension',exact:true}).click();
  await f.page.waitForFunction(()=>window.__studioDrawing?.().dimensions.length===3);
  const index=await f.page.evaluate(()=>window.__studioDrawing().dimensions.findIndex(d=>Math.abs(d.value-30)<1e-9));assert.ok(index>=0);
  await f.page.locator('.dw-dims .dw-dim').nth(index).click();await f.page.getByLabel('Tolerance',{exact:true}).selectOption('deviation');
  const lower=f.page.getByLabel('Tolerance Lower',{exact:true});await lower.fill('-0.254');await lower.press('Enter');const initial=await f.doc();
  await f.page.getByLabel('Drawing units',{exact:true}).selectOption('inch');const inch=await f.doc();
  assert.match(await lower.getAttribute('aria-description'),/millimetres.*inches/);assert.match(await lower.locator('..').innerText(),/Lower \(mm\)/);
  await lower.fill('');await lower.press('Enter');await f.same(inch);assert.equal(await lower.inputValue(),'-0.254');await f.page.getByText('Enter a tolerance value. An empty field is not zero; enter 0 explicitly when intended.',{exact:true}).waitFor();await f.snapshot('blank-rejected-'+width);
  await lower.fill('0');await lower.press('Enter');await f.page.waitForFunction(()=>window.__studioDoc.drawing.dimensions.some(d=>d.tol?.kind==='deviation'&&d.tol.lower===0));const zero=await f.doc();assert.notDeepEqual(zero,inch);
  await f.undo();await f.same(inch);await f.redo();await f.same(zero);const saved=await f.save('zero-'+width);await f.freshOpen(saved.file,zero,'reopened-'+width);assert.equal(initial.drawing.units??'mm','mm');
 }
});
