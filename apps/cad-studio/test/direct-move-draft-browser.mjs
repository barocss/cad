import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFlow } from './flow-helper.mjs';
const baseline=process.argv.includes('--baseline');
const fixture='handover/notes/untrimmed-extend-2026-10-30/studio/run-02/01-native-doc.bcad';
const seed=JSON.parse(await readFile(fixture,'utf8'));
const pins=['apps/cad-studio/src/ui/DirectPanel.tsx','apps/cad-studio/test/direct-move-draft-browser.mjs','apps/cad-studio/'+fixture];
const f=await createFlow({name:'direct-move-draft',output:process.argv[2],envFrozen:'MOVE_DRAFT_FROZEN',initialFiles:pins,requiredFrozen:pins,qualification:baseline?'Diagnostic: blank Move ΔZ executes retained 10':'Move finite raw input and exact source ownership',limits:['Existing D347 2×2 affine panel; exact source pole translation only, no new native transform qualification.'],oracleSource:String.raw`import json,re,sys
d=json.load(sys.stdin)
def poles(s,id):
 blocks=re.findall(r'@surface\s+#'+re.escape(id)+r'\s*\{([^{}]*)\}',s,re.S);assert len(blocks)==1
 m=re.search(r'control-points\s*:\s*(\[.*?\])\s*;',blocks[0],re.S);assert m;return json.loads(m.group(1))
a=poles(d['before'],d['beforeId']);b=poles(d['after'],d['afterId']);expected=[[[p[0],p[1],p[2]+d['z']] for p in row] for row in a];assert b==expected,(b,expected)
print(json.dumps({'status':'PASS','translation':[0,0,d['z']],'before':a,'after':b,'exactAllPoles':True}))`});
await f.run(async()=>{
 await f.newPage();const [chooser]=await Promise.all([f.page.waitForEvent('filechooser'),f.page.getByRole('button',{name:'Open',exact:true}).click()]);await chooser.setFiles({name:'d347-move.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(seed))});await f.same(seed);
 await f.page.locator('.outliner .ol.direct').and(f.page.getByTitle('d347 · panel',{exact:true})).click();
 const panel=f.page.getByRole('complementary',{name:'Direct geometry'}),input=panel.getByLabel('ΔZ',{exact:true}),button=panel.getByRole('button',{name:'Move',exact:true});
 assert.equal(await input.inputValue(),'10');await input.fill('');await input.press('Tab');await button.scrollIntoViewIfNeeded();assert.equal(await input.inputValue(),'');assert.equal(await button.isEnabled(),baseline);await f.same(seed);await f.snapshot(baseline?'01-blank-enabled':'01-blank-blocked');if(!baseline){assert.equal(await input.getAttribute('aria-invalid'),'true');await input.fill('2.5');assert.equal(await button.isEnabled(),true);}
 await button.click();await f.changed(seed);const doc=await f.doc(),old=seed.direct.objects[0],moved=doc.direct.objects[0];assert.equal(doc.direct.objects.length,seed.direct.objects.length);assert.equal(moved.id,old.id);assert.equal(moved.name,old.name);for(const [k,v]of Object.entries(seed.direct.sources))assert.equal(doc.direct.sources[k],v);assert.deepEqual(doc.nodes,seed.nodes);assert.deepEqual(doc.outputs,seed.outputs);await f.runOracle({before:seed.direct.sources[old.source],beforeId:old.geometry,z:baseline?10:2.5,after:doc.direct.sources[moved.source],afterId:moved.geometry},'02-retained-ten');await f.snapshot(baseline?'02-blank-moved':'02-explicit-moved');if(baseline){f.report.observations.push({baselineDefect:true,visibleBlankExecutedRetainedDeltaZ:10,originalSourcesNodesOutputsUnchanged:true});return;}
 assert.equal(await input.inputValue(),'10');await input.fill('');await f.undo();await f.same(seed);assert.equal(await input.inputValue(),'10');await f.redo();await f.same(doc);assert.equal(await input.inputValue(),'10');await f.snapshot('03-owner-reset');f.report.observations.push({blankBlocked:true,explicitDeltaZ:2.5,exactAllPoles:true,undoRedoExact:true,ownerResetToDefaults:true});
});
