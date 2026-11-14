import assert from 'node:assert/strict';
import { relative, resolve } from 'node:path';
import { createFlow } from './flow-helper.mjs';

const output = process.argv[2];
const baseline = process.argv[3] === '--baseline';
assert.ok(output && relative(resolve(import.meta.dirname, '../../..'), resolve(output)).startsWith('../'));
const pins = [
  'apps/cad-studio/test/drafted-extrude-variable-fillet-browser.mjs',
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
  inspectorSource: `
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep, curveDomain, evaluateCurve, evaluateSurface, faceGeometry, surfaceD1Evaluator } from '@barocss/cad';
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
  const blends = new Set(brep.faces.filter(f => f.name?.startsWith(feature.id+'.face')).map(f => f.id));
  const surfaces = brep.faces.filter(f => blends.has(f.id)).map(f => f.surface);
  const vertices = Object.fromEntries(brep.vertices.map(vertex => [vertex.id,vertex.point]));
  const faceOfLoop = new Map(brep.loops.map(loop => [loop.id,loop.face]));
  const uses = new Map();
  for (const coedge of brep.coedges) {
    const owners=uses.get(coedge.edge) ?? [];
    owners.push(faceOfLoop.get(coedge.loop));
    uses.set(coedge.edge,owners);
  }
  const trims = [0,1].map(side => {
    const plane = brep.faces.filter(f => {
      const g = faceGeometry(f);
      return g.kind === 'plane' && g.n[0] * (side ? 1 : -1) > .95;
    });
    assert.equal(plane.length,1);
    return brep.edges.filter(e => uses.get(e.id)?.includes(plane[0].id) && uses.get(e.id).some(id=>blends.has(id)))
      .map(({curve,vertices,id}) => {
        assert.equal(uses.get(id).length,2);
        const [start,end]=curveDomain(curve);
        return { vertices, points: Array.from({length:9},(_,i)=>evaluateCurve(curve,start+(end-start)*i/8)) };
      });
  });
  const k=Math.tan(doc.nodes[1].draft*Math.PI/180), e=10*k;
  const stations = [0, ...feature.radii.slice(1, -1).map(p => p.fraction), 1];
  const samples = stations.flatMap((t, i) => i === 0 ? [t] : [(t + stations[i-1])/2, t]).map(t => {
    const x = e + (40-2*e)*t;
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
  console.log(JSON.stringify({key,check,face,sha:digestOf(brep),volume:brepMassProperties(brep,1).volume,samples,trims,vertices}));
}
`,
  oracleSource: `
import json, math, sys
from collections import Counter
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
    for normal,offset in ((nwall,0),(ncap,10),((0,0,-1),0),((-c,0,s),0),((c,0,s),40*c),((0,c,s),30*c)):
        matches=[g for _,g in part['face'] if g['kind']=='plane' and math.dist(g['n'],normal)<1e-10]
        assert len(matches)==1 and abs(dot(matches[0]['o'],normal)-offset)<1e-10,(normal,matches)
edge,=[e for e in stock['edges'] if e['name']==data['edge']]
assert edge['degree']==1 and len(edge['points'])==2
length=40-2*y0
for got,want in zip(sorted(edge['points']),[(y0,y0,10),(40-y0,y0,10)]):
    assert math.dist(got,want)<1e-10
stations=[F(0),F(1,4),F(5,8),F(1)]
polys=[[F(5,4),F(7,4),F(7,4),-F(7,4)],[F(3),F(0),-F(6),F(4)],[F(1),F(0),F(3),-F(3,2)]]
integral=sum(40*(b-a)*sum(v*w/F(i+j+1) for i,v in enumerate(p) for j,w in enumerate(p))
             for a,b,p in zip(stations,stations[1:],polys))
assert integral==F(27731,168)
turn=math.pi/2-alpha
q=math.tan(turn/2)
outer=((1.25,-1.75/(.25*length)),(2.5,1.5/(.375*length)))
def end_section(theta,r0,k):
    h=1-math.cos(theta)
    return tangent*h*r0/(1-tangent*h*k)
def end_slice(theta,r0,k):
    o=end_section(theta,r0,k)
    return (q-math.sin(theta)+tangent*(1-math.cos(theta)))*math.sin(theta)*(r0*r0*o+r0*k*o*o+k*k*o**3/3)
def simpson(f,n):
    return (f(0)+f(turn)+4*sum(f(turn*i/n) for i in range(1,n,2))+2*sum(f(turn*i/n) for i in range(2,n,2)))*turn/(3*n)
end_removed=[]
for r0,k in outer:
    fine=simpson(lambda th:end_slice(th,r0,k),2048)
    assert abs(fine-simpson(lambda th:end_slice(th,r0,k),1024))<1e-11
    end_removed.append(fine)
removed=(q-turn/2)*float(integral)*length/40+sum(end_removed)
unfilleted=40*30*10-70*tangent*100+4*tangent*tangent*1000/3
expected=unfilleted-removed
assert abs(stock['volume']-unfilleted)<1e-7
assert abs(actual['volume']-expected)<1e-7,(actual['volume'],expected)
assert abs(data['studioVolume']-expected)<1e-7
max_trim=0
for side,(r0,k),chains in zip((0,1),outer,actual['trims']):
    assert chains,'Missing connection between fillet and inclined end'
    points=[p for chain in chains for p in chain['points']]
    degree=Counter(v for chain in chains for v in chain['vertices'])
    tips=[actual['vertices'][v] for v,n in degree.items() if n==1]
    assert len(tips)==2 and max(degree.values())<=2
    seen={chains[0]['vertices'][0]}
    for _ in chains:
        for chain in chains:
            if seen.intersection(chain['vertices']): seen.update(chain['vertices'])
    assert seen==set(degree)
    cap=(40-y0 if side else y0,y0+q*r0,10)
    theta=turn
    u=end_section(theta,r0,k)
    r=r0+k*u
    wall=(40-y0+u if side else y0-u,y0+q*r-r*math.sin(theta),10-r+r*math.cos(theta))
    assert min(math.dist(p,cap) for p in points)<1e-6
    assert min(math.dist(p,wall) for p in points)<1e-6
    assert min(math.dist(p,cap) for p in tips)<1e-6
    assert min(math.dist(p,wall) for p in tips)<1e-6
    for x,y,z in points:
        u=x-(40-y0) if side else y0-x
        r=r0+k*u
        dy=y-(y0+q*r)
        dz=z-(10-r)
        theta=math.atan2(-dy,dz)
        assert -1e-6<=theta<=turn+1e-6
        max_trim=max(max_trim,abs(u-end_section(theta,r0,k)),abs(math.hypot(dy,dz)-r),abs(u-tangent*(10-z)))
assert max_trim<1e-6,max_trim
max_contact=max_arc=max_normal=0
samples=[float(v) for v in (F(0),F(1,8),F(1,4),F(7,16),F(5,8),F(13,16),F(1))]
assert [entry['t'] for entry in actual['samples']]==samples
for entry in actual['samples']:
    t=entry['t']
    j=next(i for i,r in enumerate(stations[1:]) if t<=float(r))
    u=(F(t)-stations[j])/(stations[j+1]-stations[j])
    radius=float(sum(v*u**i for i,v in enumerate(polys[j])))
    x=y0+length*t
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
    samples=len(samples),radiusSquaredIntegralAt40MM3=str(integral),endRemovedMM3=end_removed,maximumTrimResidualMM=max_trim)))
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
});
