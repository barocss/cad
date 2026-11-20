import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
const f=await createFlow({name:'step-clear-view',envFrozen:'STEP_CLEAR_VIEW_FROZEN',output:process.argv[2],qualification:'Clear a saved assembly-step camera without moving the current camera or changing geometry; history, native persistence and camera ownership on document replacement.',initialFiles:['apps/cad-studio/test/step-clear-view-browser.mjs','apps/cad-studio/src/App.tsx','apps/cad-studio/src/app/useAssemblyStepReview.ts','apps/cad-studio/src/ui/AssemblyStepsPanel.tsx','apps/cad-studio/test/fixtures/assembly-steps.bcad'],limits:['Two top-level steps, stored camera and explicit clear/recapture. Not playback, nested steps or general camera precision certification.']});
const panel=()=>f.page.getByRole('complementary',{name:'Assembly steps panel',exact:true});
const button=name=>panel().getByRole('button',{name,exact:true});
const camera=()=>f.page.evaluate(()=>window.__studioCamera());
const settle=()=>f.page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
const original=JSON.parse(await readFile(join(import.meta.dirname,'fixtures/assembly-steps.bcad'),'utf8'));
original.assemblySteps=[{id:'step1',name:'Blocks',add:['b1','b2'],view:{eye:[100,-100,100],target:[50,30,0],up:[0,0,1]}},{id:'step2',name:'Finish',add:['post','cap']}];
const fixture=join(f.output,'saved-step-view.bcad');await writeFile(fixture,JSON.stringify(original));
function sourceUnchanged(d){assert.deepEqual(d.instances,original.instances);assert.deepEqual(d.nodes,original.nodes);assert.deepEqual(d.mates,original.mates);}
async function checkDocumentCamera() {
  const stepDoc = (name, eye, target) => ({
    ...original,
    assemblySteps: [{ id: 'place', name, add: ['b1', 'b2'], view: { eye, target, up: [0, 0, 1] } }],
  });
  const left = stepDoc('Setup A', [135, 125, 130], [50, 30, 10]);
  const right = stepDoc('Setup B', [-50, 65, 150], [35, 20, 5]);
  async function open(doc) {
    const [chooser] = await Promise.all([
      f.page.waitForEvent('filechooser'),
      f.page.getByRole('button', { name: 'Open', exact: true }).click(),
    ]);
    await chooser.setFiles({ name: doc.assemblySteps[0].name + '.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) });
    await f.same(doc);
  }
  async function check(label, doc) {
    const step = doc.assemblySteps[0];
    assert.equal(await panel().getByLabel('Step name', { exact: true }).inputValue(), step.name);
    const { eye, target } = (await f.snapshot(label, () => ({
      view: { eye: window.__studioEye(), target: window.__studioCamera().target },
    }))).view;
    const residual = Math.max(...eye.map((v, i) => Math.abs(v - step.view.eye[i])),
      ...target.map((v, i) => Math.abs(v - step.view.target[i])));
    f.report.observations.push({ label, id: step.id, eye, target, residual });
    assert.ok(residual < 0.001, label + ' saved view error in mm: ' + residual);
    assert.deepEqual(await f.doc(), doc);
  }
  await f.newPage();
  await open(left);
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.command('Assembly steps');
  await panel().waitFor();
  await check('03-first-document', left);
  await open(right);
  await check('04-same-step-new-document', right);
  await f.undo();
  await f.same(left);
  await check('05-document-undo', left);
  await f.redo();
  await f.same(right);
  await check('06-document-redo', right);

  await f.page.locator('.views').getByRole('button', { name: 'Top', exact: true }).click();
  await settle();
  const manual = await camera();
  const name = panel().getByLabel('Step name', { exact: true });
  await name.fill('Renamed setup');
  await name.press('Enter');
  await f.changed(right);
  await settle();
  assert.deepEqual(await camera(), manual, 'Editing a step name keeps the manual camera');
}

await f.run(async()=>{
 await f.newPage();await f.openFile(fixture,2);await f.command('Assembly steps');await panel().waitFor();await settle();const before=await f.doc(),recommended=await camera();assert.equal(await button('Reset view').isEnabled(),true);
 await f.page.locator('.views').getByRole('button',{name:'Top',exact:true}).click();await settle();const userView=await camera();assert.notDeepEqual(userView,recommended);
 await button('Clear saved step view').click();await f.changed(before);const cleared=await f.doc();assert.equal(cleared.assemblySteps[0].view,undefined);assert.equal(await button('Reset view').isDisabled(),true);assert.equal(await button('Clear saved step view').isDisabled(),true);assert.deepEqual(await camera(),userView);sourceUnchanged(cleared);
 await button('Next step').click();await button('Previous step').click();await settle();assert.deepEqual(await camera(),userView);assert.deepEqual(await f.doc(),cleared);
 await f.undo();await f.same(before);assert.equal(await button('Reset view').isEnabled(),true);await button('Reset view').click();await settle();assert.deepEqual(await camera(),recommended);await f.redo();await f.same(cleared);assert.equal(await button('Reset view').isDisabled(),true);
 const saved=await f.save('cleared-step-view');await f.freshOpen(saved.file,saved.doc,'01-fresh-open');const freshCamera=await camera();await f.command('Assembly steps');await panel().waitFor();await settle();assert.deepEqual(await camera(),freshCamera);assert.equal(await button('Reset view').isDisabled(),true);await f.snapshot('02-cleared-view-reopened');sourceUnchanged(await f.doc());
 await button('Capture view').click();await f.changed(cleared);const recaptured=await f.doc();assert.ok(recaptured.assemblySteps[0].view);assert.equal(await button('Reset view').isEnabled(),true);assert.equal(await button('Clear saved step view').isEnabled(),true);sourceUnchanged(recaptured);
 f.report.observations.push({recommended,userView,afterClear:userView,afterFreshOpen:freshCamera,clearOnlyStepView:true,undoRedo:true,saveFreshOpen:true,recapture:true});
 await checkDocumentCamera();
});
