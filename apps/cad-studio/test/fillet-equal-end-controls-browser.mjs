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
  name: 'fillet-equal-end-controls', envFrozen: 'D1405_SOURCE_FROZEN', output, initialFiles: pins, requiredFrozen: pins,
  qualification: 'Choose an interior radius directly with zero/same endpoints, edit it and reopen it; keep Constant and curved-edge controls hidden.',
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
# Equal endpoints, zero slope at the interior maximum and endpoint secant slopes.
left,right = ([F(1),F(3,2),F(3,2),-F(3,2)],[F(5,2),F(0),-F(3),F(3,2)]) if edited else ([F(1),F(1),F(1),-F(1)],[F(2),F(0),-F(2),F(1)])
def square_integral(p):
    return sum(a*b/F(i+j+1) for i,a in enumerate(p) for j,b in enumerate(p))
integral=10*square_integral(left)+30*square_integral(right)
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
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {},
  nodes: [
    { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [40, 30] },
    { id: 'n1', kind: 'extrude', sketch: 0, height: 10 },
  ], outputs: { b1: { node: 1, side: 'solid' } }, nextId: 2,
};
const holed = { ...box, nodes: [...box.nodes, { id: 'n2', kind: 'hole', parent: { node: 1, side: 'solid' }, center: [20,15], radius: 4 }], outputs: { b2: { node: 2, side: 'solid' } }, nextId: 3 };
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const field = (name, scope) => scope.getByLabel(name, { exact: true });
const status = (scope, label) => scope.locator('.status').filter({ hasText: new RegExp('^'+label+'$') }).waitFor();
async function open(doc, label) {
  const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await chooser.setFiles({ name: label+'.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) });
  await f.same(doc);
}
async function select(point) {
  await button('Top', f.page.locator('.views')).click();
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  const filter=button('Selection filter');
  for (let i=0;i<6 && !(await filter.innerText()).includes('Edges');i++) await filter.click();
  assert.match(await filter.innerText(), /Edges/);
  const pixel=await f.page.evaluate(async p=>{
    const deadline=performance.now()+5000; let previous=null, stable=0;
    while(performance.now()<deadline) {
      await new Promise(done=>requestAnimationFrame(done));
      const at=window.__studioScreenOf(p);
      stable=at&&previous&&Math.hypot(at[0]-previous[0],at[1]-previous[1])<.01 ? stable+1 : 0;
      previous=at;
      if(stable>=5) return document.elementFromPoint(...at)?.matches('canvas.vp-canvas') ? at : null;
    }
    throw new Error('Camera projection did not settle');
  },point);
  assert.ok(pixel);
  await f.page.mouse.click(...pixel);
  await f.page.waitForFunction(()=>window.__studioSelection?.selection.edges.length===1);
}
async function measure(doc, label, edited) {
  const native=await f.inspect(label,doc), worker=(await f.bodies()).bodies;
  assert.equal(worker.length,1); assert.equal(worker[0].key,native.key);
  await f.runOracle({ native, length:40, height:10, edited, workerVolume:worker[0].volume },label);
  f.report.observations.push({ label, sha:native.sha });
  return native.sha;
}
await f.run(async () => {
  const origin=new URL(f.server.resolvedUrls.local[0]).origin;
  const newContext=f.browser.newContext.bind(f.browser);
  f.browser.newContext=async options=>{
    const context=await newContext({...options,serviceWorkers:'block'});
    await context.route('**/*',route=>{
      const url=new URL(route.request().url());
      if(url.hostname==='fonts.googleapis.com') return route.fulfill({contentType:'text/css',body:''});
      return ['http:','https:'].includes(url.protocol)&&url.origin!==origin ? route.abort() : route.continue();
    });
    return context;
  };
  for (const width of [1024,1440]) {
    const size={width,height:900}, label=String(width);
    f.phase=label+' select a supported straight rim';
    await f.newPage(); await f.page.setViewportSize(size); await open(box,label+'-source'); await select([20,0,10]);
    await f.command('Fillet');
    const hud=f.page.getByRole('dialog',{name:'Fillet',exact:true});
    assert.equal(await field('Radius controls',hud).count(),0,'Constant hides station controls');
    await field('Fillet radius mode',hud).selectOption('varying');
    await field('Radius',hud).fill('1');
    await field('End radius (0: same)',hud).fill('0');
    assert.equal(await field('End radius (0: same)',hud).inputValue(),'0');
    await field('Radius controls',hud).waitFor();
    assert.equal(await field('Radius controls',hud).inputValue(),'ends');
    await f.snapshot(label+'-equal-ends-controls');
    // Never enter a temporary nonzero end radius to reveal this choice.
    await field('Radius controls',hud).selectOption('interior');
    await field('Interior position (%)',hud).fill('25');
    await field('Interior radius',hud).fill('2');
    assert.equal(await field('End radius (0: same)',hud).inputValue(),'0');
    await status(hud,'preview'); await f.same(box); await f.snapshot(label+'-equal-ends-preview');
    await button('Apply',hud).click(); await f.changed(box);
    const first=await f.doc(), feature=first.nodes[2];
    assert.deepEqual(feature.edges,['n1.side0|n1.top']); assert.equal(feature.radii[1].fraction,.25);
    assert.deepEqual(feature.radii.map(p=>p.radius),[1,2,1]);
    await measure(first,label+'-applied',false);
    await button('Iso',f.page.locator('.views')).click(); await f.snapshot(label+'-applied');
    await f.openFeatureEditor(2,'equal-end interior radius');
    assert.equal(await field('Interior position (%)',f.editor()).inputValue(),'25');
    assert.equal(await field('Interior radius',f.editor()).inputValue(),'2');
    await field('Interior radius',f.editor()).fill('2.5'); await f.applyEditor(first,label+'-edited');
    const edited=await f.doc(); assert.equal(edited.nodes[2].id,feature.id);
    assert.deepEqual(edited.nodes[2].radii.map(p=>p.radius),[1,2.5,1]);
    const shape=await measure(edited,label+'-edited',true);
    await f.undo(); await f.same(first); await f.redo(); await f.same(edited);
    const saved=await f.save(label+'-equal-end-controls');
    // Keep the same declared desktop width on fresh Open, unlike helper defaults.
    await f.newPage(); await f.page.setViewportSize(size); await f.openFile(saved.file,edited.nodes.length); await f.same(edited);
    assert.equal(await measure(await f.doc(),label+'-reopened',true),shape); await f.snapshot(label+'-reopened');
    f.phase=label+' curved edge remains unsupported for interior controls';
    await open(holed,label+'-curved-source'); await select([24,15,10]); await f.command('Fillet');
    const curved=f.page.getByRole('dialog',{name:'Fillet',exact:true});
    await field('Fillet radius mode',curved).selectOption('varying');
    await field('End radius (0: same)',curved).fill('0');
    assert.equal(await field('End radius (0: same)',curved).inputValue(),'0');
    assert.equal(await field('Radius controls',curved).count(),0);
    await f.snapshot(label+'-curved-controls-hidden'); await button('Cancel',curved).click(); await f.same(holed);
    f.report.observations.push({width,constantControlsHidden:true,directZeroEndInterior:true,curvedControlsHidden:true,historyUndoRedoSaveOpen:true});
  }
});
