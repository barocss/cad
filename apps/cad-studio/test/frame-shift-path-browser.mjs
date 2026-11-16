import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const flow = await createFlow({
  name: 'frame-shift-path', output: process.argv[2], envFrozen: 'FRAME_SHIFT_PATH_FROZEN',
  qualification: 'Actual Shift picking beneath the idle Box width handle supplies both edges to Frame.',
  initialFiles: ['apps/cad-studio/src/viewport/viewportPointerInput.ts', 'apps/cad-studio/src/viewport/useCommandGizmos.ts',
    'apps/cad-studio/src/viewport/gizmo.ts', 'packages/barocss-cad-model/src/app/commands.ts'],
});
const model = { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nodes: [
  { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [20, 20] },
  { id: 'n1', kind: 'extrude', height: 10, sketch: 0, made: { command: 'box', values: { w: 20, d: 20, h: 10, x: 0, y: 0, z: 0 } } },
], outputs: { b1: { node: 1, side: 'solid' } }, nextId: 2 };
const button = name => flow.page.getByRole('button', { name, exact: true });
const selection = () => flow.page.evaluate(() => window.__studioSelection);
const settle = () => flow.page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
const pixel = point => flow.page.evaluate(point => window.__studioScreenOf(point), point);
async function view(name) {
  await button(name).click();
  await settle();
}
async function filter(text) {
  const toggle = button('Selection filter');
  for (let attempt = 0; attempt < 4; attempt++) {
    if ((await toggle.innerText()).includes(text)) return;
    await toggle.click();
  }
  assert.fail(text);
}
async function click(point, shift = false) {
  const at = await pixel(point);
  assert.ok(await flow.page.evaluate(at => document.elementFromPoint(...at)?.matches('canvas.vp-canvas'), at));
  if (shift) await flow.page.keyboard.down('Shift');
  try { await flow.page.mouse.click(...at); }
  finally { if (shift) await flow.page.keyboard.up('Shift'); }
  await settle();
}
await flow.run(async () => {
  await flow.newPage();
  await flow.page.locator('input[aria-label="Model file"]').setInputFiles({name:'frame-layout.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(model))});
  await flow.same(model);
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await flow.page.getByTitle('Frame all (F)', { exact: true }).click();
  await view('Top'); await filter('Edges');
  await click([10,0,10]);
  const first=(await selection()).selection.edges;
  assert.equal(first.length,1);
  await flow.page.locator('.gizmo-handle[data-handle="w"]').waitFor();
  await click([20,10,10],true);
  assert.equal((await selection()).active,null);
  const both=(await selection()).selection.edges;
  assert.equal(both.length,2); assert.deepEqual(both[0],first[0]);
  await flow.same(model); await flow.snapshot('01-shift-picked-two-edges');
  await click([20,10,10],true); assert.deepEqual((await selection()).selection.edges,first);
  await click([20,10,10],true); assert.deepEqual((await selection()).selection.edges,both);
  await flow.command('Frame');
  const hud=flow.page.locator('.hud');
  assert.equal(await hud.getByLabel('Skeleton',{exact:true}).inputValue(),'edges');
  await hud.getByLabel('Section',{exact:true}).selectOption('rect-tube');
  await hud.getByLabel('Width',{exact:true}).fill('4'); await hud.getByLabel('Height',{exact:true}).fill('4');
  await hud.getByLabel('Wall',{exact:true}).fill('1'); await hud.getByLabel('Outer corner radius (estimate)',{exact:true}).fill('0');
  await flow.page.waitForFunction(()=>[...document.querySelectorAll('.hud button')].some(b=>b.textContent.trim()==='Apply'&&!b.disabled),null,{timeout:30000});
  await hud.getByRole('button',{name:'Apply',exact:true}).click(); await flow.changed(model); await hud.waitFor({state:'hidden'});
  const made=await flow.doc(), frame=made.nodes.at(-1);
  assert.equal(frame.kind,'frame'); assert.equal(frame.segments.length,2); assert.equal(frame.points.length,3);
  assert.deepEqual(frame.points.map(p=>p.join(',')).sort(),['0,0,10','20,0,10','20,20,10'].sort());
  assert.deepEqual(made.nodes.slice(0,2),model.nodes);
  assert.equal((await flow.bodies()).bodies.length,3);
  await flow.snapshot('02-frame-from-shift-path');
  await flow.undo(); await flow.same(model); await flow.redo(); await flow.same(made);
  assert.deepEqual(flow.report.downloads,[]);
});
