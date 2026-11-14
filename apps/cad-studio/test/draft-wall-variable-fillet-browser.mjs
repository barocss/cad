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
  'packages/barocss-cad/src/blend/edge-finish.ts', 'packages/barocss-cad-model/src/chat/part/features.ts',
  'packages/barocss-cad/src/part/part-face-finish.ts', 'packages/barocss-cad-model/src/engine/rematch.ts',
  'packages/barocss-cad-model/src/engine/mesh.ts', 'packages/barocss-cad-model/src/engine/evaluate.ts',
];
const f = await createFlow({
  name: 'draft-wall-variable-fillet', envFrozen: 'D1270_SOURCE_FROZEN', output, initialFiles: pins, requiredFrozen: pins,
  qualification: 'Create a four-radius fillet between a drafted wall and a cap, edit Draft, and reopen in Studio.',
  limits: ['One front Draft wall, +Z pull and base neutral plane; circular section between two nonorthogonal planes.'],
  inspectorSource: `
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep, evaluateSurface, faceGeometry, surfaceD1Evaluator } from '@barocss/cad';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
import { digestOf } from '@barocss/cad-model/util/digest';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const [{key,brep}] = partBreps(doc), feature = doc.nodes.at(-1);
const check = checkBrep(brep,{strict:true});
const face = brep.faces.map(f => [f.name, faceGeometry(f)]);
if (feature.kind !== 'fillet') {
  const edges = brep.edges.map(e => ({name:e.name,degree:e.curve.degree,points:e.curve.controlPoints}));
  console.log(JSON.stringify({key,check,edges,face,volume:brepMassProperties(brep,1).volume}));
} else {
  const surfaces = brep.faces.filter(f => f.name?.startsWith(feature.id+'.face')).map(f => f.surface);
  const stations = [0, ...feature.radii.slice(1, -1).map(p => p.fraction), 1];
  const samples = stations.flatMap((t, i) => i === 0 ? [t] : [(t + stations[i-1])/2, t]).map(t => {
    const x = (1-t) * 40;
    const sections = surfaces.flatMap(surface => {
      assert.equal(surface.kind,'surface');
      if (surface.kind !== 'surface') return [];
      const u0=surface.knotsU[surface.degreeU], u1=surface.knotsU[surface.controlPoints.length];
      const v0=surface.knotsV[surface.degreeV], v1=surface.knotsV[surface.controlPoints[0].length], um=(u0+u1)/2;
      const a=evaluateSurface(surface,um,v0)[0], b=evaluateSurface(surface,um,v1)[0];
      if (x < Math.min(a,b)-1e-9 || x > Math.max(a,b)+1e-9) return [];
      let lo=v0, hi=v1;
      for (let i=0; i<60; i++) {
        const mid=(lo+hi)/2;
        if ((evaluateSurface(surface,um,mid)[0]<x)===(a<b)) lo=mid;
        else hi=mid;
      }
      const v=(lo+hi)/2, d1=surfaceD1Evaluator(surface);
      return [[0,.25,.5,.75,1].map(fraction => {
        const u=u0+fraction*(u1-u0), {point,du,dv}=d1(u,v);
        const c=du.map((_,i)=>du[(i+1)%3]*dv[(i+2)%3]-du[(i+2)%3]*dv[(i+1)%3]);
        const n=Math.hypot(...c);
        assert.ok(n>0);
        return {point,normal:c.map(z=>z/n)};
      })];
    });
    assert.ok(sections.length, 'Missing native section at X='+x);
    return {t,x,sections};
  });
  console.log(JSON.stringify({key,check,face,sha:digestOf(brep),volume:brepMassProperties(brep,1).volume,samples}));
}
`,
  oracleSource: `
import json, math, sys
from fractions import Fraction as F
data=json.load(sys.stdin)
alpha=math.radians(data['angle'])
tangent=math.tan(alpha)
y0=10*tangent
s,c=math.sin(alpha),math.cos(alpha)
nwall=(0,-c,s)
ncap=(0,0,1)
stock,actual=data['stock'],data['actual']
for part in (stock,actual):
    assert part['check']['valid'] and part['check']['counts']['bodies']==part['check']['counts']['shells']==1,part['check']
def dot(a,b):
    return sum(x*y for x,y in zip(a,b))
for part in (stock,actual):
    for normal,offset in ((nwall,0),(ncap,10)):
        matches=[g for _,g in part['face'] if g['kind']=='plane' and math.dist(g['n'],normal)<1e-10]
        assert len(matches)==1 and abs(dot(matches[0]['o'],normal)-offset)<1e-10,(normal,matches)
edge,=[e for e in stock['edges'] if e['name']==data['edge']]
assert edge['degree']==1 and len(edge['points'])==2
for got,want in zip(sorted(edge['points']),[(0,y0,10),(40,y0,10)]):
    assert math.dist(got,want)<1e-10
stations=[F(0),F(1,4),F(5,8),F(1)]
polys=[[F(5,4),F(7,4),F(7,4),-F(7,4)],[F(3),F(0),-F(6),F(4)],[F(1),F(0),F(3),-F(3,2)]]
integral=sum(40*(b-a)*sum(v*w/F(i+j+1) for i,v in enumerate(p) for j,w in enumerate(p))
             for a,b,p in zip(stations,stations[1:],polys))
assert integral==F(27731,168)
turn=math.pi/2-alpha
removed=(math.tan(turn/2)-turn/2)*float(integral)
unfilleted=40*(30*10-tangent*10**2/2)
expected=unfilleted-removed
assert abs(stock['volume']-unfilleted)<1e-7
assert abs(actual['volume']-expected)<1e-7,(actual['volume'],expected)
assert abs(data['studioVolume']-expected)<1e-7
assert abs((unfilleted-actual['volume'])/removed-1)<1e-9
max_contact=max_arc=max_normal=0
samples=[float(v) for v in (F(0),F(1,8),F(1,4),F(7,16),F(5,8),F(13,16),F(1))]
assert [entry['t'] for entry in actual['samples']]==samples
for entry in actual['samples']:
    t=entry['t']
    j=next(i for i,r in enumerate(stations[1:]) if t<=float(r))
    u=(F(t)-stations[j])/(stations[j+1]-stations[j])
    radius=float(sum(v*u**i for i,v in enumerate(polys[j])))
    x=40*(1-t)
    center=(x,y0+radius*math.tan(turn/2),10-radius)
    target_wall=[a+radius*b for a,b in zip(center,nwall)]
    target_cap=[a+radius*b for a,b in zip(center,ncap)]
    middle=(0,-math.sin(turn/2),math.cos(turn/2))
    target_mid=[a+radius*b for a,b in zip(center,middle)]
    for section in entry['sections']:
        assert len(section)==5
        if math.dist(section[0]['point'],target_wall)>math.dist(section[-1]['point'],target_wall):
            section.reverse()
        max_contact=max(max_contact,math.dist(section[0]['point'],target_wall),math.dist(section[-1]['point'],target_cap))
        max_arc=max(max_arc,math.dist(section[2]['point'],target_mid))
        max_normal=max(max_normal,1-abs(dot(section[0]['normal'],nwall)),1-abs(dot(section[-1]['normal'],ncap)))
        for row in section:
            q=row['point']
            max_arc=max(max_arc,abs(q[0]-x),abs(math.dist(q,center)-radius))
assert max_contact<1e-6 and max_arc<1e-6 and max_normal<1e-10,(max_contact,max_arc,max_normal)
print(json.dumps(dict(status='PASS',angleDegrees=data['angle'],interiorAngleDegrees=90+data['angle'],
    volumeMM3=expected,removedMM3=removed,nativeVolumeMM3=actual['volume'],studioVolumeMM3=data['studioVolume'],
    maximumContactResidualMM=max_contact,maximumArcResidualMM=max_arc,maximumNormalDotError=max_normal,
    samples=len(samples),radiusSquaredIntegralMM3=str(integral))))
`,
});
const box = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {},
  nodes: [
    { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [40, 30] },
    { id: 'n1', kind: 'extrude', sketch: 0, height: 10 },
  ],
  outputs: { b1: { node: 1, side: 'solid' } }, nextId: 2,
};
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const field = (name, scope) => scope.getByLabel(name, { exact: true });
const status = (scope, label) => scope.locator('.status').filter({ hasText: new RegExp('^'+label+'$') }).waitFor();
async function measure(doc, label, angle, edge) {
  const stockDoc = { ...doc, nodes: doc.nodes.slice(0, 3), outputs: { b2: { node: 2, side: 'solid' } } };
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
  f.phase = 'Draft the front wall of the rectangular stock in Studio';
  await f.newPage();
  const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await chooser.setFiles({ name: 'draft-wall-fillet-stock.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(box)) });
  await f.same(box);
  await button('Front',f.page.locator('.views')).click();
  if (await button('Ortho').getAttribute('aria-pressed')!=='true') await button('Ortho').click();
  await f.page.getByTitle('Frame all (F)',{exact:true}).click();
  await filterTo('Faces');
  await pick([20,0,5]);
  await f.page.waitForFunction(()=>window.__studioSelection?.selection.faces.length===1);
  await f.command('Draft');
  const draft = f.page.getByRole('dialog',{name:'Draft',exact:true});
  await field('Angle',draft).fill('8');
  await status(draft,'preview');
  await button('Apply',draft).click();
  await f.changed(box);
  const drafted=await f.doc();
  const d=drafted.nodes[2];
  assert.equal(d.kind,'draft');
  assert.deepEqual(d.faces,['n1.side0']);
  assert.equal(d.angle,8);

  f.phase = 'Pick the exact top rim and apply four radius controls';
  await button('Top',f.page.locator('.views')).click();
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
  const first=await f.doc(), feature=first.nodes[3];
  assert.equal(feature.kind,'fillet');
  const [edge]=feature.edges;
  assert.equal(feature.edges.length,1);
  assert.deepEqual(edge.split('|').sort(),[d.id+'.draft.bottom','n1.top'].sort());
  assert.deepEqual(feature.radii.map(p=>p.radius),[1.25,3,1,2.5]);
  assert.deepEqual(feature.radii.slice(1,-1).map(p=>p.fraction),[.25,.625]);
  assert.deepEqual(feature.radii.map(p=>p.at[0]),[40,30,15,0]);
  await measure(first,'angle-8',8,edge);
  await button('Iso',f.page.locator('.views')).click();
  await f.snapshot('fillet-angle-8');

  f.phase = 'Edit the upstream Draft angle with the fillet retained';
  await f.openFeatureEditor(2,'upstream Draft wall');
  await button('Edit draft',f.editor()).click();
  const edit=f.page.getByRole('dialog',{name:'Edit Draft',exact:true});
  await field('Angle',edit).fill('12');
  await status(edit,'preview');
  await f.same(first);
  await button('Apply',edit).click();
  await f.changed(first);
  const next=await f.doc();
  assert.equal(next.nodes[2].angle,12);
  assert.equal(next.nodes[3].id,feature.id);
  assert.deepEqual(next.nodes[3].radii,feature.radii);
  assert.deepEqual(next.nodes[3].edges,feature.edges);
  const native=await measure(next,'angle-12',12,edge);
  await f.snapshot('fillet-angle-12');
  await f.undo();
  await f.same(first);
  await f.redo();
  await f.same(next);
  const saved=await f.save('draft-wall-variable-fillet');
  await f.freshOpen(saved.file,next,'fresh-open');
  assert.equal(await measure(await f.doc(),'reopened',12,edge),native);
});
