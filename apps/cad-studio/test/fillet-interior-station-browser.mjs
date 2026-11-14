import assert from 'node:assert/strict';
import { relative, resolve } from 'node:path';
import { createFlow } from './flow-helper.mjs';

const output = process.argv[2];
assert.ok(output && relative(resolve(import.meta.dirname, '../../..'), resolve(output)).startsWith('../'));
const pins = [
  'apps/cad-studio/test/flow-helper.mjs', 'apps/cad-studio/src/ui/Hud.tsx', 'apps/cad-studio/src/ui/NodeEditor.tsx',
  'apps/cad-studio/src/app/filletFamily.ts', 'packages/barocss-cad-model/src/app/commands.ts',
  'packages/barocss-cad-model/src/app/editFields.ts', 'packages/barocss-cad-model/src/engine/part.ts',
  'packages/barocss-cad/src/part/part-finish.ts', 'packages/barocss-cad/src/blend/rolling-ball.ts',
];
const f = await createFlow({
  name: 'fillet-interior-station', envFrozen: 'D1266_SOURCE_FROZEN', output, initialFiles: pins, requiredFrozen: pins,
  qualification: 'Create, edit, move and reopen a fillet with a radius control inside one straight edge.',
  limits: ['Circular sections on one convex right-angle box edge.'],
  inspectorSource: `
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep, evaluateSurface } from '@barocss/cad';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
import { digestOf } from '@barocss/cad-model/util/digest';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const [{key,brep}] = partBreps(doc), feature=doc.nodes.at(-1).id;
const surfaces = brep.faces.filter(face => face.name?.startsWith(feature+'.face')).map(face => face.surface);
const bounds=brep.vertices.map(v=>v.point[0]), length=Math.max(...bounds)-Math.min(...bounds);
const samples = [0,.125,.25,.5,.625,.875,1].map(t=>{
  const x=t*length;
  const candidates=surfaces.flatMap(surface=>{
    assert.equal(surface.kind,'surface');
    if(surface.kind!=='surface') return [];
    const u0=surface.knotsU[surface.degreeU],u1=surface.knotsU[surface.controlPoints.length];
    const v0=surface.knotsV[surface.degreeV],v1=surface.knotsV[surface.controlPoints[0].length],uMid=(u0+u1)/2;
    const a=evaluateSurface(surface,uMid,v0)[0], b=evaluateSurface(surface,uMid,v1)[0];
    if (x<Math.min(a,b)-1e-9 || x>Math.max(a,b)+1e-9) return [];
    let lo=v0,hi=v1;
    for (let i=0;i<60;i++) {
      const mid=(lo+hi)/2;
      if ((evaluateSurface(surface,uMid,mid)[0]<x)===(a<b)) lo=mid;
      else hi=mid;
    }
    return [[u0,uMid,u1].map(u=>evaluateSurface(surface,u,(lo+hi)/2))];
  });
  assert.ok(candidates.length>0, 'Missing native section at X='+x);
  return {t,x,sections:candidates};
});
console.log(JSON.stringify({key,check:checkBrep(brep,{strict:true}),sha:digestOf(brep),volume:brepMassProperties(brep,1).volume,samples}));
`,
  oracleSource: `
import json,math,sys
from fractions import Fraction as F
d=json.load(sys.stdin)
n=d['native']
assert n['check']['valid'],n['check']['issues']
assert n['check']['counts']['bodies']==1 and n['check']['counts']['shells']==1
length,height,edited = d['length'],d['height'],d['edited']
# Exact cubics in local span t. The input knots are 0, L/4, L.
# The 2 mm station has span tangents (1,5/6) and (5/2,2).
# The 2.5 mm station has span tangents (3/2,1) and (3,3/2).
left,right,integral = ([F(1),F(3,2),F(1,2),-F(1,2)],[F(5,2),F(3),-F(3),F(3,2)],F(761,2)) if edited else ([F(1),F(1),F(1,6),-F(1,6)],[F(2),F(5,2),-F(1),F(1,2)],F(8393,27))
def radius(t):
    p,s=(left,t*4) if t<=.25 else (right,(t-.25)/.75)
    return sum(float(c)*s**k for k,c in enumerate(p))
removed=(1-math.pi/4)*float(integral)*length/40
expected=length*30*height-removed
assert abs(n['volume']-expected)<=1e-7,(n['volume'],expected)
assert abs(d['workerVolume']-expected)<=1e-7,(d['workerVolume'],expected)
gap=0
for entry in n['samples']:
    r=radius(entry['t'])
    x=entry['t']*length
    diag=r*(1-1/math.sqrt(2))
    want=[(x,r,height),(x,diag,height-diag),(x,0,height-r)]
    for section in entry['sections']:
        a=min(max(math.dist(x,y) for x,y in zip(order,want)) for order in (section,list(reversed(section))))
        gap=max(gap,a)
assert gap<=1e-6,gap
print(json.dumps({'status':'PASS','volumeMM3':expected,'removedMM3':removed,
'workerVolumeMM3':d['workerVolume'],'nativeVolumeMM3':n['volume'],'maximumSectionResidualMM':gap,'axialSamples':len(n['samples'])}))
`,
});
const box = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: { width: 40, height: 10 },
  nodes: [
    { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [{ parameter: 'width' }, 30] },
    { id: 'n1', kind: 'extrude', sketch: 0, height: { parameter: 'height' } },
  ],
  outputs: { b1: { node: 1, side: 'solid' } }, nextId: 2,
};
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const field = (name, scope) => scope.getByLabel(name, { exact: true });
const status = (scope, label) => scope.locator('.status').filter({ hasText: new RegExp('^'+label+'$') }).waitFor();
async function measure(doc, label, length, height, edited) {
  const native = await f.inspect(label, doc);
  const worker = (await f.bodies()).bodies;
  assert.equal(worker.length, 1);
  assert.equal(worker[0].key, native.key);
  await f.runOracle({ native, length, height, edited, workerVolume: worker[0].volume }, label);
  f.report.observations.push({ label, sha: native.sha });
  return native.sha;
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
  f.phase = 'Open parametric box and select the front top edge';
  await f.newPage();
  const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await chooser.setFiles({ name: 'fillet-station-source.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(box)) });
  await f.same(box);
  await button('Top', f.page.locator('.views')).click();
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  const filter = button('Selection filter');
  for (let i=0;i<6 && !(await filter.innerText()).includes('Edges');i++) await filter.click();
  assert.match(await filter.innerText(), /Edges/);
  await f.page.evaluate(() => new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
  const pixel=await f.page.evaluate(p=>{
    const point=window.__studioScreenOf(p);
    return point && document.elementFromPoint(...point)?.matches('canvas.vp-canvas') ? point : null;
  },[20,0,10]);
  assert.ok(pixel);
  await f.page.mouse.click(...pixel);
  await f.page.waitForFunction(()=>window.__studioSelection?.selection.edges.length===1);
  await f.command('Fillet');
  const hud=f.page.getByRole('dialog',{name:'Fillet',exact:true});
  await field('Fillet radius mode',hud).selectOption('varying');
  await field('Radius',hud).fill('1');
  await field('End radius (0: same)',hud).fill('4');
  await field('Radius controls',hud).selectOption('interior');
  await field('Interior radius',hud).fill('2');
  await field('Interior position (%)',hud).fill('0');
  await status(hud,'refused');
  assert.match(await hud.locator('.hud-error').innerText(),/interior position/i);
  assert.ok(await button('Apply',hud).isDisabled());
  await f.same(box);
  await f.snapshot('endpoint-refused');

  f.phase = 'Apply the radius at 25 percent';
  await field('Interior position (%)',hud).fill('25');
  await status(hud,'preview');
  await button('Apply',hud).click();
  await f.changed(box);
  const first=await f.doc(), feature=first.nodes[2];
  assert.deepEqual(feature.edges,['n1.side0|n1.top']);
  assert.equal(feature.radii[1].fraction,.25);
  assert.deepEqual(feature.radii.map(p=>p.radius),[1,2,4]);
  await measure(first,'first',40,10,false);
  await button('Iso', f.page.locator('.views')).click();
  await f.snapshot('interior-applied');

  await f.openFeatureEditor(2,'fillet interior radius');
  assert.equal(await field('Interior position (%)',f.editor()).inputValue(),'25');
  assert.equal(await field('Interior radius',f.editor()).inputValue(),'2');
  await field('Interior radius',f.editor()).fill('2.5');
  await f.applyEditor(first,'radius-edited');
  const edited=await f.doc();
  assert.equal(edited.nodes[2].id,feature.id);
  assert.equal(edited.nodes[2].radii[1].radius,2.5);
  await measure(edited,'edited',40,10,true);
  await f.undo();
  await f.same(first);
  await f.redo();
  await f.same(edited);
  await f.setParameter('width',60,'edge-length-60');
  await f.setParameter('height',12,'edge-height-12');
  const moved=await f.doc();
  assert.deepEqual(moved.nodes[2].radii,edited.nodes[2].radii);
  const shape=await measure(moved,'moved',60,12,true);
  const saved=await f.save('fillet-interior-station');
  await f.freshOpen(saved.file,moved,'fresh-open');
  assert.equal(await measure(await f.doc(),'reopened',60,12,true),shape);
});
