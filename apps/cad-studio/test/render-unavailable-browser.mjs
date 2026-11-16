import assert from 'node:assert/strict';
import {join} from 'node:path';
import {createFlow} from './flow-helper.mjs';
const pins=['apps/cad-studio/src/ui/RenderPanel.tsx'];
const f=await createFlow({name:'render-unavailable',output:process.argv[2],envFrozen:'RENDER_UNAVAILABLE_FROZEN',initialFiles:pins,requiredFrozen:pins,qualification:'WebGL2 render limitations have one keyboard-reachable explanation while editable focus settings survive Save/Open.',limits:['Forced WebGL2, not a failed WebGPU adapter; desktop only.']});
const panel=()=>f.page.getByRole('complementary',{name:'Render',exact:true});
const mode=name=>f.page.getByRole('group',{name:'Mode',exact:true}).getByRole('button',{name,exact:true});
async function gl(){await f.newPage();await f.page.goto(f.server.resolvedUrls.local[0]+'?renderer=webgl2');await f.page.waitForSelector('.viewport[data-renderer="webgl2"]');await f.ready();}
await f.run(async()=>{for(const width of [1024,1440]){
 await gl();await f.page.setViewportSize({width,height:900});await f.openFile(join(f.app,'test/fixtures/bracket.bcad'),2);await mode('Render').click();
 await panel().getByLabel('Render method',{exact:true}).selectOption('path-tracing');
 const reason=panel().getByRole('status').filter({hasText:'Rendering, image export and picking focus need WebGPU.'});
 await reason.focus();assert.equal(await reason.evaluate(e=>e===document.activeElement),true);
 assert.equal((await panel().innerText()).match(/WebGPU/g)?.length,1);
 for(const name of ['Start path tracing','Export image']){const b=panel().getByRole('button',{name,exact:true});assert.equal(await b.isDisabled(),true);assert.equal(await b.getAttribute('aria-describedby'),await reason.getAttribute('id'));}
 assert.equal(await panel().getByLabel('Path trace samples',{exact:true}).count(),0);
 assert.doesNotMatch(await panel().innerText(),/A frozen still|still includes surfaces/);await f.snapshot('blocked-'+width);
 await panel().getByRole('tab',{name:'Scene',exact:true}).click();await panel().getByLabel('Focus distance',{exact:true}).fill('72');await panel().getByLabel('Blur radius',{exact:true}).fill('6');
 const pick=panel().getByRole('button',{name:'Pick focus on part',exact:true});assert.equal(await pick.isDisabled(),true);assert.equal(await pick.getAttribute('aria-describedby'),await reason.getAttribute('id'));
 assert.match(await panel().innerText(),/Focus and blur values can still be edited and saved/);assert.equal((await panel().innerText()).match(/WebGPU/g)?.length,1);
 const accepted=await f.doc();assert.deepEqual(accepted.render.environment.post.depthOfField,{focus:72,blur:6});
 const saved=await f.save('webgl-settings-'+width);await gl();await f.openFile(saved.file,2);assert.deepEqual((await f.doc()).render.environment.post.depthOfField,{focus:72,blur:6});
 await mode('Model').click();const at=await f.page.evaluate(()=>window.__studioScreenOf([15,6,6]));await f.page.mouse.click(...at);await f.page.waitForFunction(()=>window.__studioSelection.selection.faces.length>0);
 f.report.observations.push({width,renderer:'webgl2',singleReason:true,savedFocus:72,savedBlur:6,modelFaceSelectable:true});
}
 // Enabled focus pick advertises the actual next interaction and can be canceled without editing.
 await f.newPage();await f.openFile(join(f.app,'test/fixtures/bracket.bcad'),2);await mode('Render').click();await panel().getByRole('tab',{name:'Scene',exact:true}).click();const before=await f.doc();await panel().getByRole('button',{name:'Pick focus on part',exact:true}).click();await panel().getByText('Click a surface to set focus. A background click cancels.',{exact:true}).waitFor();await panel().getByRole('button',{name:'Cancel focus pick',exact:true}).click();await f.same(before);
});
