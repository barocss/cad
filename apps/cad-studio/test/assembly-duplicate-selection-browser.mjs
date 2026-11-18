import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createFlow} from './flow-helper.mjs';
import {clickModelCommand} from './model-rail-helper.mjs';
const base=JSON.parse(await readFile(new URL('./fixtures/assembly-steps.bcad',import.meta.url),'utf8'));
base.instances.find(i=>i.id==='b2').rotation=[0,0,90];
const f=await createFlow({name:'assembly-duplicate-selection',envFrozen:'ASSEMBLY_DUPLICATE_SELECTION_FROZEN',output:process.argv[2],qualification:'Atomic free-group duplicate preserves originals and copies effective geometry at a common offset.',initialFiles:['apps/cad-studio/test/assembly-duplicate-selection-browser.mjs','apps/cad-studio/src/App.tsx','apps/cad-studio/src/ui/SelectedInstancesPanel.tsx','apps/cad-studio/src/assembly/duplicateSelection.ts'],limits:['Synthetic ordinary static group only; no mates, nested copies or Motion expansion.'],inspectorSource:`import {readFileSync} from 'node:fs';import {Assembly} from '@barocss/cad-model/api/assembly';const doc=JSON.parse(readFileSync(process.argv[2],'utf8'));console.log(JSON.stringify(await new Assembly('Group',doc).bom()));`});
const row=id=>f.page.locator(`[data-browser-instance-path="${id}"]`);
const panel=()=>f.page.getByRole('complementary',{name:'Selected placed parts',exact:true});
const field=k=>panel().getByRole('textbox',{name:`Selected copies offset ${k}`,exact:true});
const apply=()=>panel().getByRole('button',{name:'Duplicate selected parts',exact:true});
async function select(a='b1',b='b2'){await row(a).click();await row(b).click({modifiers:['Meta']});await panel().waitFor();await f.page.waitForFunction(()=>!document.querySelector('[aria-label="Selected copies offset X"]')?.disabled);}
await f.run(async()=>{
  await f.newPage();await f.page.getByLabel('Model file',{exact:true}).setInputFiles({name:'duplicate-group.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(base))});await f.page.waitForFunction(()=>window.__studioDoc?.instances?.length===4);await f.ready();await select();
  const before=await f.doc(),bounds=await f.page.evaluate(()=>window.__studioInstanceBounds()),bomBefore=await f.inspect('before-bom',before);
  await field('X').fill('');assert.equal(await apply().isEnabled(),false);await field('X').fill('Infinity');assert.equal(await apply().isEnabled(),false);await f.same(before);
  await field('X').fill('80');await field('Y').fill('0');await field('Z').fill('5');await f.snapshot('copy-draft');await apply().click();await f.changed(before);await f.ready();
  const next=await f.doc(),copies=next.instances.filter(i=>!before.instances.some(o=>o.id===i.id));assert.equal(copies.length,2);assert.deepEqual(next.instances.slice(0,before.instances.length),before.instances);
  for(const [k,copy] of copies.entries()){const old=before.instances.find(i=>i.id===['b1','b2'][k]);assert.deepEqual(copy.position,old.position.map((v,j)=>v+[80,0,5][j]));assert.deepEqual(copy.rotation,old.rotation);assert.deepEqual(copy.doc,old.doc);assert.deepEqual(copy.part,old.part);assert.deepEqual(copy.looks,old.looks);}
  assert.deepEqual({...next,instances:before.instances},before);
  const expected=copies.map((c,k)=>{const old=bounds.find(b=>b.id===['b1','b2'][k]);return {id:c.id,min:old.min.map((v,j)=>v+[80,0,5][j]),max:old.max.map((v,j)=>v+[80,0,5][j])};});
  await f.page.waitForFunction(expected=>{const b=window.__studioInstanceBounds?.();return b&&expected.every(x=>{const now=b.find(n=>n.id===x.id);return now&&['min','max'].every(key=>x[key].every((v,k)=>Math.abs(v-now[key][k])<1e-6));});},expected);
  for(const copy of copies)assert.ok((await row(copy.id).getAttribute('class')).includes('sel'));
  await f.page.getByTitle('Frame all (F)',{exact:true}).click();await f.snapshot('duplicated');await f.undo();await f.same(before);await f.redo();await f.same(next);await f.ready();
  const bomAfter=await f.inspect('after-bom',next);assert.equal(bomAfter.bom.totalQty,bomBefore.bom.totalQty+2);f.report.observations.push({bomBefore,bomAfter,expected,actual:await f.page.evaluate(()=>window.__studioInstanceBounds())});
  await clickModelCommand(f.page,'Inspect','BOM');await f.page.locator('[aria-label="BOM lines"] tr[aria-label^="BOM line"]').first().waitFor();await f.snapshot('bom');await f.page.getByRole('button',{name:'Close BOM',exact:true}).click();
  const saved=await f.save('duplicated');await f.freshOpen(saved.file,saved.doc,'reopened');assert.deepEqual((await f.inspect('reopened-bom',await f.doc())).bom,bomAfter.bom);
  await select();await field('X').fill('99');await field('X').press('Escape');assert.equal(await field('X').inputValue(),'20');await field('X').fill('99');await select('b1','cap');assert.equal(await field('X').inputValue(),'20');
  await row('b1').click();await f.page.getByRole('complementary',{name:'Instance',exact:true}).getByRole('button',{name:'Fix in place',exact:true}).click();await f.changed(saved.doc);await select();const fixed=await f.doc();await apply().click();await f.page.getByText('Selected parts not duplicated',{exact:true}).waitFor();await f.same(fixed);await f.snapshot('fixed-refusal');
});
