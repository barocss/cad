import assert from 'node:assert/strict';
import { relative, resolve } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { box, inspectorSource, oracleSource } from './drafted-extrude-variable-fillet-oracle.mjs';

const output = process.argv[2];
const baseline = process.argv[3] === '--baseline';
assert.ok(output && relative(resolve(import.meta.dirname, '../../..'), resolve(output)).startsWith('../'));
const pins = [
  'apps/cad-studio/test/drafted-extrude-variable-fillet-browser.mjs',
  'apps/cad-studio/test/drafted-extrude-variable-fillet-oracle.mjs',
  'apps/cad-studio/test/flow-helper.mjs', 'apps/cad-studio/src/ui/Hud.tsx', 'apps/cad-studio/src/ui/NodeEditor.tsx',
  'apps/cad-studio/src/app/filletFamily.ts', 'packages/barocss-cad-model/src/app/commands.ts',
  'packages/barocss-cad-model/src/app/editFields.ts', 'packages/barocss-cad-model/src/engine/part.ts',
  'packages/barocss-cad/src/part/part-finish.ts', 'packages/barocss-cad/src/blend/rolling-ball.ts',
  'packages/barocss-cad/src/blend/edge-finish.ts', 'packages/barocss-cad-model/src/chat/part/features.ts',
  'packages/barocss-cad/src/part/part-face-finish.ts', 'packages/barocss-cad-model/src/engine/rematch.ts',
  'packages/barocss-cad-model/src/engine/mesh.ts', 'packages/barocss-cad-model/src/engine/evaluate.ts',
  'packages/barocss-cad/src/features/drafted-extrusion.ts', 'packages/barocss-cad/src/brep/analytic-boolean.ts',
];
const f = await createFlow({
  name: 'drafted-extrude-variable-fillet', envFrozen: 'D1271_SOURCE_FROZEN', output, initialFiles: pins, requiredFrozen: pins,
  qualification: 'Create a four-radius fillet on a tapered rectangular Extrude with two inclined ends, edit Draft, and reopen in Studio.',
  limits: ['Four-wall positive Draft Extrude on a 40 × 30 × 10 mm rectangle; circular fillet on the front top rim.'],
  inspectorSource, oracleSource,
});
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const field = (name, scope) => scope.getByLabel(name, { exact: true });
const status = (scope, label) => scope.locator('.status').filter({ hasText: new RegExp('^'+label+'$') }).waitFor();
async function measure(doc, label, angle, edge) {
  const stockDoc = { ...doc, nodes: doc.nodes.slice(0, 2), outputs: { b1: { node: 1, side: 'solid' } } };
  const stock = await f.inspect(label+'-stock', stockDoc);
  const actual = await f.inspect(label+'-fillet', doc);
  const [worker] = (await f.bodies()).bodies;
  assert.equal(worker.key, actual.key);
  await f.runOracle({ stock, actual, angle, edge, studioVolume: worker.volume }, label);
  f.report.observations.push({ label, sha: actual.sha });
  return actual.sha;
}
async function pick(point) {
  await f.page.evaluate(() => new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
  const pixel=await f.page.evaluate(p=>{
    const q=window.__studioScreenOf(p);
    return q && document.elementFromPoint(...q)?.matches('canvas.vp-canvas') ? q : null;
  },point);
  assert.ok(pixel);
  await f.page.mouse.click(...pixel);
}
async function filterTo(name) {
  const filter=button('Selection filter');
  for (let i=0;i<6 && !(await filter.innerText()).includes(name);i++) await filter.click();
  assert.match(await filter.innerText(),new RegExp(name));
}
await f.run(async () => {
  const origin = new URL(f.server.resolvedUrls.local[0]).origin;
  const newContext = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async options => {
    const context = await newContext({ ...options, serviceWorkers: 'block' });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      return ['http:', 'https:'].includes(url.protocol) && url.origin !== origin ? route.abort() : route.continue();
    });
    return context;
  };
  f.phase = 'Open the rectangle and author four-wall Draft Extrude in Studio';
  await f.newPage();
  const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await chooser.setFiles({ name: 'draft-extrude-fillet-stock.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(box)) });
  await f.same(box);
  await f.openFeatureEditor(1,'four-wall Draft Extrude');
  await field('Draft',f.editor()).fill('8');
  await f.applyEditor(box,'extrude-angle-8');
  const drafted=await f.doc();
  assert.deepEqual(drafted.nodes[1],{...box.nodes[1],draft:8});

  f.phase = 'Pick the exact top rim and apply four radius controls';
  await button('Top',f.page.locator('.views')).click();
  if (await button('Ortho').getAttribute('aria-pressed')!=='true') await button('Ortho').click();
  await f.page.getByTitle('Frame all (F)',{exact:true}).click();
  await filterTo('Edges');
  await pick([20,10*Math.tan(8*Math.PI/180),10]);
  await f.page.waitForFunction(()=>window.__studioSelection?.selection.edges.length===1);
  await f.command('Fillet');
  const hud=f.page.getByRole('dialog',{name:'Fillet',exact:true});
  await field('Fillet radius mode',hud).selectOption('varying');
  await field('Radius controls',hud).selectOption('two-interior');
  for(const [name,value] of [['Radius','1.25'],['End radius (0: same)','2.5'],['Interior 1 position (%)','25'],
    ['Interior 1 radius','3'],['Interior 2 position (%)','62.5'],['Interior 2 radius','1']])
    await field(name,hud).fill(value);
  await status(hud,'preview');
  await f.same(drafted);
  await f.snapshot('drafted-fillet-preview');
  await button('Apply',hud).click();
  await f.changed(drafted);
  const first=await f.doc(), feature=first.nodes[2];
  assert.equal(feature.kind,'fillet');
  const [edge]=feature.edges;
  assert.equal(feature.edges.length,1);
  assert.equal(edge,'n1.side0|n1.top');
  assert.deepEqual(feature.radii.map(p=>p.radius),[1.25,3,1,2.5]);
  assert.deepEqual(feature.radii.slice(1,-1).map(p=>p.fraction),[.25,.625]);
  const e=10*Math.tan(8*Math.PI/180), l=40-2*e;
  assert.ok(feature.radii.every((p,i)=>Math.abs(p.at[0]-(e+l*[0,.25,.625,1][i]))<1e-12));
  await measure(first,'angle-8',8,edge);
  await button('Iso',f.page.locator('.views')).click();
  await f.snapshot('fillet-angle-8');

  f.phase = 'Edit the upstream Draft angle with the fillet retained';
  await f.openFeatureEditor(1,'upstream Draft Extrude');
  await field('Draft',f.editor()).fill('12');
  if (baseline) {
    await button('Apply',f.editor()).click();
    await f.editor().getByText(/Failed feature.*Fillet/).waitFor();
    await f.editor().getByText(/analytic Boolean: the result is not a manifold solid/).waitFor({ state: 'attached' });
    await f.same(first);
    await f.snapshot('angle-12-refused');
    return;
  }
  await f.applyEditor(first,'upstream-extrude-angle-12');
  const next=await f.doc();
  assert.equal(next.nodes[1].draft,12);
  assert.equal(next.nodes[2].id,feature.id);
  assert.deepEqual(next.nodes[2].radii,feature.radii);
  assert.deepEqual(next.nodes[2].edges,feature.edges);
  const native=await measure(next,'angle-12',12,edge);
  await f.snapshot('fillet-angle-12');
  await f.undo();
  await f.same(first);
  await f.redo();
  await f.same(next);
  const saved=await f.save('drafted-extrude-variable-fillet');
  await f.freshOpen(saved.file,next,'fresh-open');
  assert.equal(await measure(await f.doc(),'reopened',12,edge),native);
  for (const [width, height] of [[1024, 800], [1440, 900]]) {
    await f.page.setViewportSize({ width, height });
    await f.openFeatureEditor(2, 'varying fillet contact recovery');
    await field('Interior 1 radius', f.editor()).fill('14');
    await button('Apply', f.editor()).click();
    await f.editor().getByText(/failure does not identify a single radius/).waitFor();
    assert.equal(await f.editor().getByText(/failure does not identify a single radius/).count(), 1);
    assert.equal(await f.editor().getByText(/round that edge first/).count(), 0);
    await f.same(next);
    await f.snapshot(`${width}-contact-refused`);
    await button('Reset', f.editor()).click();
    assert.equal(await field('Interior 1 radius', f.editor()).inputValue(), '3');
    assert.equal(await f.editor().getByText(/failure does not identify a single radius/).count(), 0);
    await field('Interior 1 radius', f.editor()).fill('14');
    await button('Apply', f.editor()).click();
    await f.editor().getByText(/failure does not identify a single radius/).waitFor();
    await field('Interior 1 radius', f.editor()).fill('8');
    assert.equal(await f.editor().getByText(/failure does not identify a single radius/).count(), 0);
    await f.applyEditor(next, `${width}-contact-recovered`);
    const recovered = await f.doc();
    assert.deepEqual(recovered.nodes[2].radii, next.nodes[2].radii.map((p, i) => i === 1 ? { ...p, radius: 8 } : p));
    const checked = await f.inspect(`${width}-recovered-native`, recovered);
    assert.equal(checked.check.valid, true); assert.equal(checked.check.counts.bodies, 1);
    await f.undo(); await f.same(next); await f.redo(); await f.same(recovered);
    await f.undo(); await f.same(next);
  }

});
