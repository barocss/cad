import assert from 'node:assert/strict';
import { relative, resolve } from 'node:path';
import { createFlow } from './flow-helper.mjs';

const output = process.argv[2];
assert.ok(output && relative(resolve(import.meta.dirname, '../../..'), resolve(output)).startsWith('../'));
const pins = ['apps/cad-studio/src/App.tsx', 'apps/cad-studio/src/app/filletInteriorInput.ts', 'apps/cad-studio/src/state/useCommandPreview.ts',
  'apps/cad-studio/test/flow-helper.mjs', 'apps/cad-studio/src/ui/Hud.tsx', 'apps/cad-studio/src/ui/NodeEditor.tsx',
  'apps/cad-studio/src/app/filletFamily.ts', 'packages/barocss-cad-model/src/app/commands.ts',
  'packages/barocss-cad-model/src/app/editFields.ts', 'packages/barocss-cad-model/src/engine/part.ts',
  'packages/barocss-cad/src/part/part-finish.ts', 'packages/barocss-cad/src/blend/rolling-ball.ts',
  'packages/barocss-cad/src/blend/edge-finish.ts', 'packages/barocss-cad-model/src/chat/part/features.ts',
  'apps/cad-studio/test/fillet-continuity-mcp.mjs', 'apps/cad-studio/scripts/cad-mcp.mjs',
  'apps/cad-studio/server/cadDoc.ts', 'apps/cad-studio/server/cadMcp.ts',
];
const f = await createFlow({
  name: 'fillet-interior-input', envFrozen: 'D1406_SOURCE_FROZEN', output, initialFiles: pins, requiredFrozen: pins,
  qualification: 'Create, edit, move and reopen a fillet with a peak and a trough inside one straight edge.',
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
const stations = [0, ...doc.nodes.at(-1).radii.slice(1, -1).map(p => p.fraction), 1];
const samples = stations.flatMap((t, i) => i === 0 ? [t] : [(t + stations[i-1])/2, t]).map(t=>{
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
# Independent signed sections. Both interior slopes vanish at the peak and trough.
stations=[F(0),F(1,4),F(7,10) if edited else F(5,8),F(1)]
left=[F(5,4),F(7,4),F(7,4),-F(7,4)]
middle=[F(3),F(0),-F(9,2),F(3)] if edited else [F(3),F(0),-F(6),F(4)]
right=[F(3,2),F(0),F(2),-F(1)] if edited else [F(1),F(0),F(3),-F(3,2)]
polynomials=[left,middle,right]
integral=sum((b-a)*40*sum(c*g/F(i+j+1) for i,c in enumerate(p) for j,g in enumerate(p))
             for a,b,p in zip(stations,stations[1:],polynomials))
assert integral == (F(32939,168) if edited else F(27731,168))
def radius(t):
    j=next(i for i,r in enumerate(stations[1:]) if t<=float(r))
    u=(t-float(stations[j]))/float(stations[j+1]-stations[j])
    return sum(float(c)*u**k for k,c in enumerate(polynomials[j]))
expected_stations = [float(stations[0])]
for lo,hi in zip(stations,stations[1:]):
    expected_stations += [float((lo+hi)/2),float(hi)]
assert len(n['samples']) == 7
assert all(abs(a['t']-b)<1e-12 for a,b in zip(n['samples'],expected_stations))
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
'workerVolumeMM3':d['workerVolume'],'nativeVolumeMM3':n['volume'],'maximumSectionResidualMM':gap,'axialSamples':len(n['samples']),
'radiusSquaredIntegralAt40MM3':str(integral),'controlXMM':[float(u)*length for u in stations]}))
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
function holdPreview() {
  const proto = Worker.prototype, post = proto.postMessage, handler = Object.getOwnPropertyDescriptor(proto, 'onmessage');
  let armed = false, target, pending, deliver;
  proto.postMessage = function (request, ...rest) {
    if (armed && request.type === 'preview') {
      armed = false;
      target = { worker: this, id: request.id, revision: request.revision };
    }
    return Reflect.apply(post, this, [request, ...rest]);
  };
  Object.defineProperty(proto, 'onmessage', {
    configurable: true, get: handler.get,
    set(callback) {
      handler.set.call(this, callback && function (event) {
        if (target?.worker === this && target.id === event.data?.id && event.data.result) {
          pending = { id: target.id, revision: target.revision, ok: event.data.result.ok };
          deliver = () => callback.call(this, event);
          target = null;
          return;
        }
        callback.call(this, event);
      });
    },
  });
  window.__d1406Hold = { arm() { armed = true; pending = null; deliver = null; }, read: () => pending, release() { deliver(); deliver = null; } };
}

await f.run(async () => {
  const origin = new URL(f.server.resolvedUrls.local[0]).origin;
  const newContext = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async options => {
    const context = await newContext({ ...options, serviceWorkers: 'block' });
    await context.addInitScript(holdPreview);
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      return ['http:', 'https:'].includes(url.protocol) && url.origin !== origin ? route.abort() : route.continue();
    });
    return context;
  };

  for (const width of [1024,1440]) {
    f.phase = `${width}: source and public edge pick`;
    await f.newPage(); await f.page.setViewportSize({width,height:width===1024?800:900});
    const [chooser]=await Promise.all([f.page.waitForEvent('filechooser'),button('Open').click()]);
    await chooser.setFiles({name:'interior-input.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(box))});
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
  await field('Radius',hud).fill('1.25');
  await field('End radius (0: same)',hud).fill('2.5');
  await field('Radius controls',hud).selectOption('two-interior');
  const setHud = (name, value) => field(name,hud).fill(value);
  await setHud('Interior 1 radius','3');
  await setHud('Interior 1 position (%)','25');
  await setHud('Interior 2 radius','1');
  await setHud('Interior 2 position (%)','62.5');

    await status(hud,'preview');
    const unchanged=()=>f.same(box);
    async function invalid(scope,name,key,value) {
      const input=field(name,scope); await input.fill(value);
      await f.page.waitForFunction(({label,id})=>{const input=document.querySelector(`[aria-label="${label}"]`);return input?.getAttribute('aria-invalid')==='true'&&document.getElementById(id)?.textContent;},{label:name,id:`${scope===hud?'hud':'history'}-fillet-interior-${key}`});
      assert.ok(await input.evaluate(element=>!element.validity.valid&&element.validity.customError));
      assert.ok(await button('Apply',scope).isDisabled());
      await input.press('Enter');
      const linked=await input.getAttribute('aria-describedby'); assert.ok(linked.includes(`fillet-interior-${key}`));
      assert.equal(await scope.locator(`[id="${scope===hud?'hud':'history'}-fillet-interior-${key}"]`).count(),1);
    }
    for(const value of ['0','100','0.0000001','']) {
      await invalid(hud,'Interior 1 position (%)','stationAt',value); await unchanged();
      if(value==='0') await f.snapshot(`${width}-range-error`);
      await setHud('Interior 1 position (%)','25'); await status(hud,'preview');
      assert.ok(await field('Interior 1 position (%)',hud).evaluate(element=>element.validity.valid&&!element.validity.customError));
    }
    for(const value of ['25','10','25.000000099999998']) {
      await invalid(hud,'Interior 2 position (%)','station2At',value); await unchanged();
      if(value==='25') await f.snapshot(`${width}-order-error`);
      await setHud('Interior 2 position (%)','62.5'); await status(hud,'preview');
      assert.ok(await field('Interior 2 position (%)',hud).evaluate(element=>element.validity.valid&&!element.validity.customError));
    }
    await f.snapshot(`${width}-local-errors-corrected`);
    f.phase=`${width}: editing invalid cancels a previously queued valid Apply`;
    await f.page.evaluate(()=>window.__d1406Hold.arm());
    await setHud('Interior 2 radius','1.1');
    await f.page.waitForFunction(()=>window.__d1406Hold.read());
    await field('Interior 2 radius',hud).press('Enter'); // Valid busy preview queues Apply.
    await setHud('Interior 2 position (%)','25'); // No Enter: editing alone must retire that queue.
    await f.page.waitForFunction(()=>document.querySelector('[id="hud-fillet-interior-station2At"]'));
    assert.ok(await button('Apply',hud).isDisabled());
    await setHud('Interior 2 position (%)','62.5');
    await f.page.evaluate(()=>window.__d1406Hold.release());
    await status(hud,'preview'); await unchanged();
    await setHud('Interior 2 radius','1'); await status(hud,'preview'); await unchanged();
    f.report.observations.push({label:`${width}-invalid-edit-retires-valid-queued-Apply`,result:'Correction/reply release does not implicitly commit'});
    f.phase=`${width}: delayed real preview, invalid Enter must not queue`;
    await f.page.evaluate(()=>window.__d1406Hold.arm());
    await setHud('Interior 2 radius','1.1');
    await f.page.waitForFunction(()=>window.__d1406Hold.read());
    await invalid(hud,'Interior 2 position (%)','station2At','25');
    await setHud('Interior 2 position (%)','62.5');
    await f.page.evaluate(()=>window.__d1406Hold.release());
    await status(hud,'preview'); await unchanged();
    await setHud('Interior 2 radius','1'); await status(hud,'preview'); await unchanged();
    f.report.observations.push({label:`${width}-pending-invalid-Enter`,result:'No implicit commit after correction and real reply release'});
    f.phase=`${width}: native geometry refusal stays separate from numeric feedback`;
    await setHud('Interior 1 radius','100'); await status(hud,'refused');
    assert.ok(await button('Apply',hud).isDisabled());
    assert.equal(await hud.locator('[id^="hud-fillet-interior-"]').count(),0);
    assert.ok(await hud.locator('.hud-error').count()); await unchanged();
    await setHud('Interior 1 radius','3'); await status(hud,'preview');
    f.phase=`${width}: hidden controls and cancellation`;
    await invalid(hud,'Interior 2 position (%)','station2At','25');
    await field('Radius controls',hud).selectOption('interior'); await status(hud,'preview');
    assert.equal(await field('Interior 2 position (%)',hud).count(),0);
    await field('Radius controls',hud).selectOption('ends'); await status(hud,'preview');
    await field('Fillet radius mode',hud).selectOption('constant'); await status(hud,'preview');
    await button('Cancel',hud).click(); await unchanged();
    await f.command('Fillet');
    await field('Fillet radius mode',hud).selectOption('varying');
    await field('Radius controls',hud).selectOption('two-interior');
    for(const [label,value] of [['Radius','1.25'],['End radius (0: same)','2.5'],['Interior 1 position (%)','25'],['Interior 1 radius','3'],['Interior 2 position (%)','62.5'],['Interior 2 radius','1']]) await setHud(label,value);
    await status(hud,'preview'); await button('Apply',hud).click(); await f.changed(box);
    const first=await f.doc(); await measure(first,`${width}-first`,40,10,false);
    const savedFirst=await f.save(`interior-first-${width}`);
    f.phase=`${width}: History local guards and Reset`;
    await f.openFeatureEditor(2,'interior input');
    for(const [label,key,value] of [['Interior 1 position (%)','stationAt','0'],['Interior 1 position (%)','stationAt','100'],['Interior 1 position (%)','stationAt',''],['Interior 2 position (%)','station2At','25']]) {
      await invalid(f.editor(),label,key,value); await f.same(first);
      await button('Reset',f.editor()).click();
      assert.equal(await field('Interior 1 position (%)',f.editor()).inputValue(),'25');
      assert.equal(await field('Interior 2 position (%)',f.editor()).inputValue(),'62.5');
    }
    await invalid(f.editor(),'Interior 1 position (%)','stationAt','0');
    await f.page.getByRole('button',{name:'Close editor',exact:true}).click();
    await f.openFeatureEditor(1,'owner change');
    assert.equal(await f.editor().locator('[id^="history-fillet-interior-"]').count(),0);
    await f.page.getByRole('button',{name:'Close editor',exact:true}).click();
    await f.openFeatureEditor(2,'reopen clean');
    assert.equal(await field('Interior 1 position (%)',f.editor()).inputValue(),'25');
    await invalid(f.editor(),'Interior 2 position (%)','station2At','0');
    // Same-count, identical JSON cannot witness an asynchronous native Open.
    // Wait for its public draft guard and explicitly discard before checking ownership.
    const [sameChooser]=await Promise.all([f.page.waitForEvent('filechooser'),button('Open').click()]);
    await sameChooser.setFiles(savedFirst.file);
    const discard=f.page.getByRole('dialog',{name:'Discard feature changes?',exact:true});
    await discard.waitFor(); await f.same(first);
    assert.equal(await field('Interior 2 position (%)',f.editor()).inputValue(),'0');
    await button('Discard changes',discard).click(); await discard.waitFor({state:'hidden'});
    await f.editor().waitFor({state:'hidden'}); await f.same(first);
    await f.openFeatureEditor(2,'same-ID document Open owns clean fields');
    assert.equal(await field('Interior 2 position (%)',f.editor()).inputValue(),'62.5');
    assert.equal(await f.editor().locator('[id^="history-fillet-interior-"]').count(),0);
    await field('Interior 2 position (%)',f.editor()).fill('70');
    await field('Interior 2 radius',f.editor()).fill('1.5');
    await f.applyEditor(first,`${width}-valid-fix`);
    const edited=await f.doc(); await measure(edited,`${width}-edited`,40,10,true);
    await f.undo(); await f.same(first); await f.redo(); await f.same(edited);
    const saved=await f.save(`fillet-interior-${width}`);
    await f.newPage(); await f.page.setViewportSize({width,height:width===1024?800:900});
    await f.openFile(saved.file,edited.nodes.length); await f.same(edited);
    await measure(await f.doc(),`${width}-saved-reopened`,40,10,true);
    await f.snapshot(`${width}-saved-reopened`);
  }
});
