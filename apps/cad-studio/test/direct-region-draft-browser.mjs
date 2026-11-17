import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFlow } from './flow-helper.mjs';
const baseline=process.argv.includes('--baseline');
const fixture='handover/notes/untrimmed-extend-2026-10-30/studio/run-02/01-native-doc.bcad';
const seed=JSON.parse(await readFile(fixture,'utf8'));
const pins=['apps/cad-studio/src/ui/DirectPanel.tsx','apps/cad-studio/test/direct-region-draft-browser.mjs','apps/cad-studio/'+fixture];
const f=await createFlow({name:'direct-region-draft',output:process.argv[2],envFrozen:'REGION_DRAFT_FROZEN',initialFiles:pins,requiredFrozen:pins,qualification:baseline?'Diagnostic: blank u to executes retained 4':'Region raw draft finite admission and owner reset',limits:['Existing D347 affine surface. Source corners only; no new region/native support qualification.'],oracleSource:String.raw`import json,re,sys,math
d=json.load(sys.stdin);m=re.search(r'control-points\s*:\s*(\[.*?\])\s*;',d['source'],re.S);assert m
p=json.loads(m.group(1));got=[p[0][0],p[0][-1],p[-1][0],p[-1][-1]];want=[[7,-11,13],[7,-11,21],[13,-3,13],[13,-3,21]]
for a,b in zip(got,want):assert math.dist(a,b)<1e-7,(a,b)
print(json.dumps({'status':'PASS','requestedU':[2,4],'requestedV':[-1,3],'corners':got,'expected':want,'budgetMM':1e-7}))`});
await f.run(async()=>{
 await f.newPage();const [chooser]=await Promise.all([f.page.waitForEvent('filechooser'),f.page.getByRole('button',{name:'Open',exact:true}).click()]);await chooser.setFiles({name:'d347-region.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(seed))});await f.same(seed);
 await f.page.locator('.outliner .ol.direct').and(f.page.getByTitle('d347 · panel',{exact:true})).click();
 const panel=f.page.getByRole('complementary',{name:'Direct geometry'}),input=panel.getByLabel('u to',{exact:true}),button=panel.getByRole('button',{name:'Extract region',exact:true});
 await input.fill('4');await input.press('Tab');await input.fill('');await input.press('Tab');await button.scrollIntoViewIfNeeded();assert.equal(await input.inputValue(),'');assert.equal(await button.isEnabled(),baseline);await f.same(seed);await f.snapshot(baseline?'01-blank-enabled':'01-blank-blocked');
 if(!baseline){assert.equal(await input.getAttribute('aria-invalid'),'true');await input.fill('4');assert.equal(await button.isEnabled(),true);}
 await button.click();await f.changed(seed);const doc=await f.doc(),made=doc.direct.objects.at(-1);assert.equal(doc.direct.objects.length,2);for(const [k,v]of Object.entries(seed.direct.sources))assert.equal(doc.direct.sources[k],v);assert.deepEqual(doc.nodes,seed.nodes);assert.deepEqual(doc.outputs,seed.outputs);await f.runOracle({source:doc.direct.sources[made.source]},'02-retained-four');await f.snapshot('02-blank-created');if(baseline){f.report.observations.push({baselineDefect:true,visibleBlankExecutedRetainedUTo:4,originalSourcesNodesOutputsUnchanged:true});return;}
 assert.equal(await input.inputValue(),'4');await input.fill('');await f.undo();await f.same(seed);
 await f.page.locator('.outliner .ol.direct').and(f.page.getByTitle('d347 · panel',{exact:true})).click();assert.equal(await input.inputValue(),'5');
 await f.redo();await f.same(doc);await f.page.locator('.outliner .ol.direct').and(f.page.getByTitle(made.name,{exact:true})).click();assert.equal(await input.inputValue(),'4');await f.snapshot('03-owner-reset');
 f.report.observations.push({blankBlocked:true,explicitUTo:4,originalSourcesNodesOutputsUnchanged:true,undoRedoExact:true,ownerResetUsesCurrentDomain:true});
});
