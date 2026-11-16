import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
const pins=['apps/cad-studio/src/ui/RenderPanel.tsx','apps/cad-studio/src/ui/renderRangeHint.ts'];
const f=await createFlow({name:'render-range-help',output:process.argv[2],envFrozen:'RENDER_RANGE_FROZEN',initialFiles:pins,requiredFrozen:pins,qualification:'Point and Spot range cutoff help is correct on hover/focus while settings retain history and file roundtrip.',limits:['Desktop WebGPU settings; no photometric pixel or actual path-trace execution claim. Renderer code unchanged.']});
const button=name=>f.page.getByRole('button',{name,exact:true});
const panel=()=>f.page.getByRole('complementary',{name:'Render',exact:true});
async function lights(){await f.page.getByRole('group',{name:'Mode',exact:true}).getByRole('button',{name:'Render',exact:true}).click();await panel().getByRole('tab',{name:'Lights',exact:true}).click();}
async function help(control,text){await control.evaluate(el=>el.blur());await f.page.mouse.move(400,100);await control.hover();await f.page.locator('.tooltip').getByText(text,{exact:true}).waitFor();await f.page.mouse.move(400,100);await f.page.keyboard.press('Tab');await control.focus();const id=await control.getAttribute('aria-describedby');assert.ok(id);assert.ok((await f.page.locator(`[id="${id}"]`).innerText()).includes(text));}
await f.run(async()=>{for(const width of [1024,1440]){
 await f.newPage();await f.page.setViewportSize({width,height:900});await lights();await button('Add point').click();await button('Add spot').click();
 for(const index of [0,1]){
  const range=panel().getByRole('slider',{name:'Range',exact:true}).nth(index);
  assert.equal(await range.getAttribute('aria-valuetext'),'0 mm');
  await help(range,'0 mm disables the distance cutoff, not distance attenuation. Positive values set the distance where light fades to zero.');await f.snapshot(`zero-${width}-${index}`);
  await range.press('Home');for(let i=0;i<17;i++)await range.press('ArrowRight');
  await f.page.waitForFunction(([i])=>window.__studioDoc.render.lights[i+2].range===85,[index]);
  assert.equal(await range.getAttribute('aria-valuetext'),'85 mm');
  await help(range,'0 mm disables the distance cutoff, not distance attenuation. Positive values set the distance where light fades to zero.');
  assert.equal(await panel().getByText('Fades out over 85 mm',{exact:true}).count(),0);
  const accepted=await f.doc();await f.undo();await f.page.waitForFunction(([i])=>window.__studioDoc.render.lights[i+2].range===80,[index]);await f.redo();await f.same(accepted);
 }
 const accepted=await f.doc(),saved=await f.save('range-'+width);await f.newPage();await f.openFile(saved.file,accepted.nodes.length);assert.deepEqual(await f.doc(),accepted);await lights();
 for(const range of await panel().getByRole('slider',{name:'Range',exact:true}).all())assert.equal(await range.getAttribute('aria-valuetext'),'85 mm');
 const first=panel().getByRole('slider',{name:'Range',exact:true}).first();await first.press('Home');await help(first,'0 mm disables the distance cutoff, not distance attenuation. Positive values set the distance where light fades to zero.');await f.snapshot('reopened-zero-'+width);
}});
