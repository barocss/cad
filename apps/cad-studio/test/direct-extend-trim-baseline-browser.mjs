// #29 feature baseline: engine refusal exists, but Extend lacks trim preflight.
import assert from 'node:assert/strict';
import { readFile, statfs } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { createFlow, sha256 } from './flow-helper.mjs';
const repo=resolve(import.meta.dirname,'../../..'),output=process.argv[2];
assert.ok(output&&isAbsolute(output)&&relative(repo,resolve(output)).startsWith('../'));
const fixture='apps/cad-studio/handover/notes/trimmed-surface-region-2026-10-30/studio/run-01/outside-hole.bcad';
const bytes=await readFile(resolve(repo,fixture)),original=JSON.parse(bytes),id='obj_3',name='D341 · panel · region 1';
const target=d=>d.direct.objects.find(o=>o.id===id);
assert.ok(Array.isArray(target(original)?.trims)&&target(original).trims.length>0);
const refusal='This operation does not preserve surface trims (Extend surface). Use Untrim first only if you want to remove the trims.';
const pins=[fixture,'apps/cad-studio/test/direct-extend-trim-baseline-browser.mjs','apps/cad-studio/src/ui/DirectPanel.tsx','apps/cad-studio/src/App.tsx','packages/barocss-cad-model/src/engine/direct.ts'];
const f=await createFlow({name:'direct-extend-trim-baseline',output,envFrozen:'DIRECT_EXTEND_TRIM_BASELINE_FROZEN',initialFiles:pins,requiredFrozen:pins,
 qualification:'Observe enabled trimmed Extend followed by existing safe refusal, then separately explicit Untrim and successful Extend. No data-loss claim.',
 limits:['Synthetic D341 outside-hole affine surface only; nonempty valid trims, not malformed native data.', 'Feature preflight baseline, not an engine safety defect. No independent extended-surface geometry or tolerance certification.', 'History checks cover visible rows and Undo/Redo availability. No Save/fresh Open, renderer race or arbitrary curved-surface qualification.']});
const panel=()=>f.page.getByRole('complementary',{name:'Direct geometry',exact:true});
const extend=()=>panel().getByRole('button',{name:'Extend the surface',exact:true});
async function select(){const row=f.page.locator('.outliner .ol.direct').and(f.page.getByTitle(name,{exact:true}));assert.equal(await row.count(),1);if(!(await row.getAttribute('class')).split(' ').includes('sel'))await row.click();await panel().waitFor();}
async function invariant(){return f.page.evaluate(()=>({doc:JSON.parse(JSON.stringify(window.__studioDoc)),dirty:!!document.querySelector('[aria-label="Unsaved changes"]'),history:[...document.querySelectorAll('.history .hs')].map(x=>x.getAttribute('aria-label')),undo:['Undo','Redo'].map(n=>{const b=document.querySelector(`button[aria-label="${n}"]`);return{disabled:b?.disabled,tip:b?.getAttribute('data-tip')};})}));}
await f.run(async()=>{
 const fs=await statfs(output);assert.ok(fs.bavail*fs.bsize>=2*1024**3);await f.newPage();
 await f.openFile({name:'synthetic-outside-hole.bcad',mimeType:'application/json',buffer:bytes},original.nodes.length);await f.same(original);await select();
 const before=await invariant();await panel().getByLabel('Extend by',{exact:true}).fill('5');
 assert.equal(await extend().isEnabled(),true);assert.equal(await extend().getAttribute('aria-describedby'),null);
 assert.equal(await panel().getByRole('note',{name:/Extend/i}).count(),0);
 await extend().scrollIntoViewIfNeeded();await f.snapshot('01-trimmed-extend-enabled');
 f.phase='existing engine refusal preserves whole document';await extend().click();
 await f.page.getByRole('alert').filter({hasText:refusal}).waitFor();
 assert.ok((await f.page.getByRole('alert').filter({hasText:refusal}).innerText()).includes(refusal));
 await f.same(original);assert.deepEqual(await invariant(),before);await f.snapshot('02-safe-trim-refusal');
 f.phase='separate explicit Untrim positive control';
 await panel().getByRole('button',{name:'Untrim',exact:true}).click();await f.changed(original);
 const untrimmed=await f.doc(),expected=structuredClone(original);delete target(expected).trims;
 assert.deepEqual(untrimmed,expected);assert.deepEqual(untrimmed.direct.sources,original.direct.sources);
 await select();await panel().getByLabel('Extend by',{exact:true}).fill('5');assert.equal(await extend().isEnabled(),true);
 await extend().click();await f.changed(untrimmed);const extended=await f.doc();
 assert.equal(extended.direct.objects.length,untrimmed.direct.objects.length+1);
 for(const [key,value]of Object.entries(original.direct.sources))assert.equal(extended.direct.sources[key],value);
 assert.deepEqual(extended.nodes,original.nodes);assert.deepEqual(extended.outputs,original.outputs);
 // Extend hides only the selected source; Untrim was a separate explicit edit.
 for(const object of untrimmed.direct.objects){const after=extended.direct.objects.find(o=>o.id===object.id);assert.deepEqual(after,object.id===id?{...object,hidden:true}:object);}
 assert.equal(extended.direct.objects.at(-1).trims,undefined);await f.snapshot('03-explicit-untrim-then-extend');
 await f.undo();await f.same(untrimmed);await f.undo();await f.same(original);
 await f.redo();await f.same(untrimmed);await f.redo();await f.same(extended);
 await f.undo();await f.same(untrimmed);await f.undo();await f.same(original);
 await select();await f.snapshot('04-original-trim-restored');
 f.report.observations.push({fixtureSha256:sha256(bytes),validTrimLoopCount:target(original).trims.length,
  trimmedExtendEnabled:true,extendPreflightNoteAbsent:true,existingRefusal:refusal,
  refusalWholeDocumentDirtyHistoryUnchanged:true,explicitUntrimOnlyRemovedTargetTrims:true,
  untrimmedExtendCreatedOneObject:true,sourceStringsPreserved:true,sourceHiddenByExtend:true,
  undoRedoAndFinalOriginalRestored:true,independentGeometry:'NOT_RUN',nativeSaveFreshOpen:'NOT_RUN'});
 assert.equal(f.report.downloads.length,0);const end=await statfs(output);assert.ok(end.bavail*end.bsize>=2*1024**3);
});
