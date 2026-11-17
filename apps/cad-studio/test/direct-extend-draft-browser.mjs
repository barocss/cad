import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFlow } from './flow-helper.mjs';
const baseline=process.argv.includes('--baseline');
const fixture='handover/notes/untrimmed-extend-2026-10-30/studio/run-02/01-native-doc.bcad';
const seed=JSON.parse(await readFile(fixture,'utf8'));
const pins=['apps/cad-studio/src/ui/DirectPanel.tsx','apps/cad-studio/test/direct-extend-draft-browser.mjs','apps/cad-studio/'+fixture];
const f=await createFlow({name:'direct-extend-draft',output:process.argv[2],envFrozen:'EXTEND_DRAFT_FROZEN',initialFiles:pins,requiredFrozen:pins,qualification:baseline?'Diagnostic: blank Extend input executes retained 5':'Finite-positive Extend draft and exact source owner reset',limits:['Original D347 affine panel only. Endpoint source check, not a new native/refit tolerance qualification.'],oracleSource:String.raw`import json,re,sys,math
d=json.load(sys.stdin);m=re.search(r'control-points\s*:\s*(\[.*?\])\s*;',d['source'],re.S);assert m
p=json.loads(m.group(1));reach=d['reach'];expected=[[16+.6*reach,1+.8*reach,13],[16+.6*reach,1+.8*reach,21]]
for got,want in zip([p[-1][0],p[-1][-1]],expected):assert math.dist(got,want)<1e-7,(got,want)
print(json.dumps({'status':'PASS','reach':reach,'endpointOracle':expected,'budgetMM':1e-7}))`});
const panel=()=>f.page.getByRole('complementary',{name:'Direct geometry'}),field=()=>panel().getByLabel('Extend by',{exact:true}),start=()=>panel().getByRole('button',{name:'Extend the surface',exact:true});
async function select(name='d347 · panel'){const row=f.page.locator('.outliner .ol.direct').and(f.page.getByTitle(name,{exact:true}));if(!(await row.getAttribute('class')).split(' ').includes('sel'))await row.click();await panel().waitFor();}
await f.run(async()=>{
 await f.newPage();const [chooser]=await Promise.all([f.page.waitForEvent('filechooser'),f.page.getByRole('button',{name:'Open',exact:true}).click()]);await chooser.setFiles({name:'d347-panel.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(seed))});await f.same(seed);await select();await field().fill('');await field().press('Tab');await start().scrollIntoViewIfNeeded();
 if(baseline){assert.equal(await field().inputValue(),'');assert.equal(await start().isEnabled(),true);await f.snapshot('01-blank-enabled');await start().click();await f.changed(seed);const changed=await f.doc(),object=changed.direct.objects.at(-1);assert.equal(changed.direct.objects.length,seed.direct.objects.length+1);await f.runOracle({source:changed.direct.sources[object.source],reach:5},'02-retained-five');await f.snapshot('02-blank-created');f.report.observations.push({baselineDefect:true,blankExecutedRetainedFive:true});return;}
 for(const invalid of ['', '0','-1']){await field().fill(invalid);await field().press('Tab');assert.equal(await start().isDisabled(),true);assert.equal(await field().getAttribute('aria-invalid'),'true');await f.same(seed);}await field().fill('');await f.snapshot('01-blank-blocked');
 await field().fill('2.5');assert.equal(await start().isEnabled(),true);await start().click();await f.changed(seed);const changed=await f.doc(),object=changed.direct.objects.at(-1);for(const [key,value]of Object.entries(seed.direct.sources))assert.equal(changed.direct.sources[key],value);assert.deepEqual(changed.nodes,seed.nodes);assert.deepEqual(changed.outputs,seed.outputs);await f.runOracle({source:changed.direct.sources[object.source],reach:2.5},'02-exact-distance');assert.equal(await field().inputValue(),'5');await f.snapshot('02-valid-created');
 // Extend deliberately hides its original. Show is a separate public history edit.
 assert.equal(changed.direct.objects[0].hidden,true);
 await f.page.locator('.outliner .ol.direct.hidden-obj').filter({hasText:'d347 · panel'}).click();
 await f.changed(changed);const shown=await f.doc();
 const expectedShown=structuredClone(changed);expectedShown.direct.objects[0].hidden=false;
 assert.deepEqual(shown,expectedShown);
 await select(object.name);await field().fill('9');await select();assert.equal(await field().inputValue(),'5');await f.same(shown);
 await field().fill('7');await f.undo();await f.same(changed);await f.undo();await f.same(seed);await select();assert.equal(await field().inputValue(),'5');
 await f.redo();await f.same(changed);await select(object.name);assert.equal(await field().inputValue(),'5');await f.snapshot('03-owner-reset');f.report.observations.push({blankZeroNegativeBlocked:true,validDistance:2.5,selectionAndUndoRedoReset:true,originalSourcesExact:true});
});
