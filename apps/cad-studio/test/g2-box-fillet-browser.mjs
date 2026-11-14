import assert from 'node:assert/strict';
import { relative, resolve } from 'node:path';
import { createFlow } from './flow-helper.mjs';

const output = process.argv[2];
assert.ok(output && relative(resolve(import.meta.dirname, '../../..'), resolve(output)).startsWith('../'));
const baseline = process.argv.includes('--baseline');
const pins = ['apps/cad-studio/test/flow-helper.mjs', 'apps/cad-studio/src/ui/EdgeContinuity.tsx',
  'apps/cad-studio/src/ui/NodeEditor.tsx', 'packages/barocss-cad/src/brep/box-fillet-bindings.ts'];
const f = await createFlow({
  name: 'g2-box-fillet', envFrozen: 'D1263_SOURCE_FROZEN', output, initialFiles: pins, requiredFrozen: pins,
  qualification: 'Compare the editable box curvature fillet with the circular control through native Studio inspection.',
  limits: ['One convex R2 edge on a 30 × 12 × 20 mm box. G2 tensions 0.5 and 0.7.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { checkBrep, brepMassProperties, evaluateSurface, measureBrepEdgeContinuity } from '@barocss/cad';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
import { readEdgeContinuity } from '@barocss/cad-model/engine/edgeContinuity';
import { digestOf } from '@barocss/cad-model/util/digest';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const [{ key, brep }] = partBreps(doc);
const before = digestOf(brep);
const listed = readEdgeContinuity(doc, key, {kind:'list'});
if (!('edges' in listed)) throw new Error(JSON.stringify(listed));
const joints = listed.edges.filter(row => row.faces.some(name => /^n2\\.face(?:#\\d+)?$/.test(name))).map(row => {
  const edge = brep.edges.find(edge => edge.id === row.id)!;
  const bindings = brep.coedges.filter(use => use.edge === row.id && use.pcurve).length;
  const points = edge.vertices.map(id => brep.vertices.find(v => v.id === id)!.point);
  return { ...row, points, bindings, read: measureBrepEdgeContinuity(brep, edge.id, {curvature:true}) };
});
const sections = brep.faces.filter(face => /^n2\\.face(?:#\\d+)?$/.test(face.name ?? '')).map(face => {
  if (face.surface.kind !== 'surface') throw new Error('Expected native support');
  const surface = face.surface, u = surface.knotsU, v = surface.knotsV;
  const mid = (v[surface.degreeV] + v[surface.controlPoints[0].length])/2;
  const section = [0, 0.25, 0.5, 0.75, 1].map(t => evaluateSurface(surface,t,mid));
  return {name: face.name, section};
});
if (before !== digestOf(brep)) throw new Error('Native inspection changed the part');
console.log(JSON.stringify({shapeSHA256:before, check:checkBrep(brep,{strict:true}), volume:brepMassProperties(brep,1).volume, joints, sections}));
`,
  oracleSource: `
import json, sys, math
from fractions import Fraction as F
from math import comb
d=json.load(sys.stdin)
native=d['native']
assert native['check']['valid']
r, length = 2, 30
tension=d['tension']
gap = 1/r
removed = r*r*(1-math.pi/4)
if tension is not None:
    gap=0
    q=F(str(tension))
    poles=[(0,r),(0,(1-q)*r),(0,0),((1-q)*r,0),(r,0)]
    removed=F(0)
    for i,(x,y) in enumerate(poles):
        for j,(p,s) in enumerate(poles[:-1]):
            vx,vy=poles[j+1][0]-p,poles[j+1][1]-s
            removed+=2*(y*vx-x*vy)*F(comb(4,i)*comb(3,j),8*comb(7,i+j))
    for p0,p1,p2 in [(poles[0],poles[1],poles[2]),(poles[4],poles[3],poles[2])]:
        v=[4*(b-a) for a,b in zip(p0,p1)]
        acc=[12*(c-2*b+a) for a,b,c in zip(p0,p1,p2)]
        assert math.hypot(*v)>0 and v[0]*acc[1]-v[1]*acc[0]==0
    for support in native['sections']:
        expect=[]
        for t in [0,.25,.5,.75,1]:
            b=[comb(4,i)*t**i*(1-t)**(4-i) for i in range(5)]
            expect.append([sum(coef*float(p[0]) for coef,p in zip(b,poles)),20-sum(coef*float(p[1]) for coef,p in zip(b,poles))])
        yz=[p[1:] for p in support['section']]
        err=min(max(math.dist(p,q) for p,q in zip(yz,ex)) for ex in [expect,expect[::-1]])
        assert err<=1e-8,(support['name'],err)
known={'n1.side0':(0,18),'n1.top':(2,20)}
joined={}
for row in native['joints']:
    other=next((name for name in row['faces'] if name in known),None)
    if not other:
        continue
    y,z=known[other]
    assert all(math.dist(p[1:],(y,z))<=1e-8 for p in row['points'])
    measured=row['read']
    assert measured['status']=='measured' and measured['sampleCount']==8, row
    assert measured['maximumAngleDegrees']<=1e-7
    k=measured['curvature']
    assert k['status']=='measured' and k['unit']=='1/mm'
    values=[-gap if name['name'].startswith('n2.face') else 0 for name in measured['faces']]
    assert len(k['samples'])==8
    for sample in k['samples']:
        assert abs(sample['first']-values[0])<=1e-9 and abs(sample['second']-values[1])<=1e-9
        assert abs(sample['difference']-gap)<=1e-9
    assert abs(k['maximumDifference']-gap)<=1e-9
    assert row['bindings']==0
    assert abs(d['studio'][row['id']]['gap']-gap)<=1e-9
    assert abs(d['studio'][row['id']]['maximumAngle'])<=1e-7
    joined.setdefault(other,[]).append((row['id'],sorted(p[0] for p in row['points']),k['maximumDifference'],row['bindings']))
assert set(joined)==set(known)
for group in joined.values():
    spans=sorted(entry[1] for entry in group)
    assert len(spans)==(1 if tension is None else 3)
    assert all(hi > lo for lo,hi in spans)
    assert abs(spans[0][0])<=1e-8 and abs(spans[-1][1]-30)<=1e-8
    assert all(abs(a[1]-b[0])<=1e-8 for a,b in zip(spans,spans[1:]))
expected=length*(12*20-float(removed))
volume_limit = 1e-7 if tension is None else 5e-6
assert abs(native['volume']-expected)<=volume_limit and abs(d['studioVolume']-expected)<=volume_limit
print(json.dumps({'status':'PASS','tension':tension,'expectedVolumeMM3':expected,'nativeVolumeMM3':native['volume'],
    'studioVolumeMM3':d['studioVolume'],'expectedDifferencePerMM':gap,'joins':joined}))
`,
});
const box = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {},
  nodes: [{id:'n0',kind:'sketch',profile:'rectangle',min:[0,0],max:[30,12]}, {id:'n1',kind:'extrude',sketch:0,height:20}],
  outputs: {b1:{node:1,side:'solid'}}, nextId: 2,
};
const button = (name, within = f.page) => within.getByRole('button', {name, exact:true});
const panel = () => f.page.getByRole('region', {name:'Edge continuity', exact:true});
const result = () => panel().getByRole('status', {name:'Edge continuity result', exact:true});
const gapValue = () => result().locator('[data-continuity-curvature]');
const angleValue = () => result().locator('[data-continuity-angle]');
async function pick(point, view, filter) {
  await button(view, f.page.locator('.views')).click();
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await f.page.getByTitle('Frame all (F)', {exact:true}).click();
  const trigger=button('Selection filter');
  for(let i=0;i<6 && !(await trigger.innerText()).includes(filter);i++) await trigger.click();
  assert.ok((await trigger.innerText()).includes(filter));
  await f.page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
  const pixel=await f.page.evaluate(p => window.__studioScreenOf(p),point);
  assert.ok(pixel && await f.page.evaluate(p => document.elementFromPoint(...p)?.matches('canvas.vp-canvas'),pixel));
  await f.page.mouse.click(...pixel);
}
async function createFillet(tension) {
  await pick([15,0,20],'Top','Edges');
  await f.page.waitForFunction(() => window.__studioSelection?.selection.edges.length === 1);
  await f.command('Fillet');
  const hud=f.page.getByRole('dialog',{name:'Fillet',exact:true});
  await hud.getByLabel('Radius',{exact:true}).fill('2');
  if(tension!==null) {
    await hud.getByLabel('Section',{exact:true}).selectOption('g2');
    assert.equal(Number(await hud.getByLabel('Tension',{exact:true}).inputValue()),tension);
  }
  await f.page.waitForFunction(() => document.querySelector('.hud .status')?.textContent.trim()==='preview');
  await button('Apply',hud).click();
  await f.changed(box);
  const doc=await f.doc(),node=doc.nodes.at(-1);
  assert.equal(node.kind,'fillet');
  assert.equal(node.radius,2);
  assert.deepEqual(node.edges,['n1.side0|n1.top']);
  assert.deepEqual(node.section,tension===null ? undefined : {kind:'g2',tension});
  return doc;
}
async function inspect(doc,tension,label) {
  f.phase='Inspect '+label;
  const native=await f.inspect('native-'+label,doc);
  assert.ok(native.check.valid, JSON.stringify(native.check.issues));
  const counts = tension === null ? [7, 15, 10] : [9, 21, 14];
  assert.deepEqual([native.check.counts.faces, native.check.counts.edges, native.check.counts.vertices], counts);
  if (tension === 0.5) assert.equal(native.shapeSHA256, 'fe8f2a2e26f6ca19a8b3d069c6a1a6fadd951257fc98b379253857a5954b64d7');
  const joins=native.joints.filter(row=>row.faces.includes('n1.side0')||row.faces.includes('n1.top'));
  assert.equal(joins.length,tension===null?2:6);
  await pick([15,6,20],'Iso','Bodies');
  await button('Inspect native joints',panel()).click();
  const edges=panel().getByRole('combobox',{name:'Native shared edge',exact:true});
  await edges.waitFor();
  const studio={};
  for (const row of native.joints) {
    await edges.selectOption(row.id);
    assert.equal(await gapValue().count(),0);
    await button('Measure continuity',panel()).click();
    if (!joins.includes(row) || (baseline && tension!==null)) {
      assert.equal(row.read.reason,'missing-pcurve');
      await result().getByText(/no native parameter curve/i).waitFor();
      assert.equal(await gapValue().count(),0);
      if (joins.includes(row)) await f.snapshot(label+'-'+row.id);
      continue;
    }
    await gapValue().waitFor();
    assert.match(await result().innerText(),/Native samples\s+8/);
    studio[row.id]={
      gap: Number((await gapValue().textContent()).replace(' mm⁻¹','')),
      maximumAngle: Number((await angleValue().textContent()).replace('°','').split('–')[1]),
    };
    await f.snapshot(label+'-'+row.id);
  }
  await f.same(doc);
  if (!baseline || tension===null) await f.runOracle({native,studio,studioVolume:(await f.bodies()).bodies[0].volume,tension},label);
  f.report.observations.push({label,tension,studio,nativeShapeSHA256:native.shapeSHA256,documentRetained:true,
    measurementRefusals: native.joints.filter(row => row.read.status === 'unsupported').map(row => row.id),
  });
  return native.shapeSHA256;
}
await f.run(async () => {
  const origin=new URL(f.server.resolvedUrls.local[0]).origin;
  const newContext=f.browser.newContext.bind(f.browser);
  f.browser.newContext=async options=>{
    const context=await newContext({...options,serviceWorkers:'block'});
    await context.route('**/*',route=>{
      const url=new URL(route.request().url());
      if(url.hostname==='fonts.googleapis.com') return route.fulfill({contentType:'text/css',body:''});
      return ['http:','https:'].includes(url.protocol)&&url.origin!==origin ? route.abort():route.continue();
    });
    return context;
  };
  f.phase='Open box and author circular R2';
  await f.newPage();
  const [open]=await Promise.all([f.page.waitForEvent('filechooser'),button('Open').click()]);
  await open.setFiles({name:'g2-box.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(box))});
  await f.same(box);
  assert.equal(await inspect(await createFillet(null),null,'circular'),'12ff52104e6d5ff5b4235b3e5a267aaf168a563285aed2b132137e9d9030fc2f');
  await f.undo();
  await f.same(box);
  f.phase='Author G2 with the same radius and parent edge';
  const initial=await createFillet(0.5);
  const initialDigest=await inspect(initial,0.5,'g2-default');
  if (baseline) return;
  f.phase='Edit G2 tension through History';
  await f.openFeatureEditor(2,'G2 fillet');
  const tension=f.editor().getByLabel('Tension',{exact:true});
  assert.equal(Number(await tension.inputValue()),0.5);
  await tension.fill('0.7');
  await button('Apply',f.editor()).click();
  await f.changed(initial);
  const edited=await f.doc();
  assert.deepEqual(edited.nodes[2],{...initial.nodes[2],section:{kind:'g2',tension:0.7}});
  assert.deepEqual(edited.nodes.slice(0,2),box.nodes);
  await f.closeEditor();
  const editedDigest=await inspect(edited,0.7,'g2-edited');
  assert.notEqual(editedDigest,initialDigest);
  await f.undo();
  await f.same(initial);
  assert.equal(await gapValue().count(),0);
  await f.redo();
  await f.same(edited);
  assert.equal(await gapValue().count(),0);
  const saved=await f.save('g2-edited');
  await f.freshOpen(saved.file,edited,'g2-reopened');
  assert.equal(await inspect(await f.doc(),0.7,'g2-reopened-measure'),editedDigest);
});
