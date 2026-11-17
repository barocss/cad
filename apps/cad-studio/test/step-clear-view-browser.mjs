import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
const f=await createFlow({name:'step-clear-view',envFrozen:'STEP_CLEAR_VIEW_FROZEN',output:process.argv[2],qualification:'Clear a saved assembly-step camera without moving the current camera or changing geometry; history and native persistence.',initialFiles:['apps/cad-studio/test/step-clear-view-browser.mjs','apps/cad-studio/src/App.tsx','apps/cad-studio/src/ui/AssemblyStepsPanel.tsx','apps/cad-studio/test/fixtures/assembly-steps.bcad'],limits:['Two top-level steps, stored camera and explicit clear/recapture. Not playback, nested steps or general camera precision certification.']});
const panel=()=>f.page.getByRole('complementary',{name:'Assembly steps panel',exact:true});
const button=name=>panel().getByRole('button',{name,exact:true});
const camera=()=>f.page.evaluate(()=>window.__studioCamera());
const settle=()=>f.page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
const original=JSON.parse(await readFile(join(import.meta.dirname,'fixtures/assembly-steps.bcad'),'utf8'));
original.assemblySteps=[{id:'step1',name:'Blocks',add:['b1','b2'],view:{eye:[100,-100,100],target:[50,30,0],up:[0,0,1]}},{id:'step2',name:'Finish',add:['post','cap']}];
const fixture=join(f.output,'saved-step-view.bcad');await writeFile(fixture,JSON.stringify(original));
function sourceUnchanged(d){assert.deepEqual(d.instances,original.instances);assert.deepEqual(d.nodes,original.nodes);assert.deepEqual(d.mates,original.mates);}
await f.run(async()=>{
 await f.newPage();await f.openFile(fixture,2);await f.command('Assembly steps');await panel().waitFor();await settle();const before=await f.doc(),recommended=await camera();assert.equal(await button('Reset view').isEnabled(),true);
 await f.page.locator('.views').getByRole('button',{name:'Top',exact:true}).click();await settle();const userView=await camera();assert.notDeepEqual(userView,recommended);
 await button('Clear saved step view').click();await f.changed(before);const cleared=await f.doc();assert.equal(cleared.assemblySteps[0].view,undefined);assert.equal(await button('Reset view').isDisabled(),true);assert.equal(await button('Clear saved step view').isDisabled(),true);assert.deepEqual(await camera(),userView);sourceUnchanged(cleared);
 await button('Next step').click();await button('Previous step').click();await settle();assert.deepEqual(await camera(),userView);assert.deepEqual(await f.doc(),cleared);
 await f.undo();await f.same(before);assert.equal(await button('Reset view').isEnabled(),true);await button('Reset view').click();await settle();assert.deepEqual(await camera(),recommended);await f.redo();await f.same(cleared);assert.equal(await button('Reset view').isDisabled(),true);
 const saved=await f.save('cleared-step-view');await f.freshOpen(saved.file,saved.doc,'01-fresh-open');const freshCamera=await camera();await f.command('Assembly steps');await panel().waitFor();await settle();assert.deepEqual(await camera(),freshCamera);assert.equal(await button('Reset view').isDisabled(),true);await f.snapshot('02-cleared-view-reopened');sourceUnchanged(await f.doc());
 await button('Capture view').click();await f.changed(cleared);const recaptured=await f.doc();assert.ok(recaptured.assemblySteps[0].view);assert.equal(await button('Reset view').isEnabled(),true);assert.equal(await button('Clear saved step view').isEnabled(),true);sourceUnchanged(recaptured);
 f.report.observations.push({recommended,userView,afterClear:userView,afterFreshOpen:freshCamera,clearOnlyStepView:true,undoRedo:true,saveFreshOpen:true,recapture:true});
});
