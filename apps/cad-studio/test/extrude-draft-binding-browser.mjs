import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const pins = [
  'apps/cad-studio/src/App.tsx',
  'apps/cad-studio/src/ui/NodeEditor.tsx',
  'packages/barocss-cad-model/src/app/commands.ts',
  'packages/barocss-cad-model/src/app/editFields.ts',
  'packages/barocss-cad-model/src/engine/part.ts',
  'packages/barocss-cad/src/features/drafted-extrusion.ts',
  'packages/barocss-cad/src/features/drafted-half-disk.ts',
  'packages/barocss-cad/src/part/part-profile-solid.ts',
];
const f = await createFlow({
  name: 'extrude-draft-binding', output: process.argv[2], envFrozen: 'D1408_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Keep numeric Draft editable without unsupported parameter binding; retain Distance binding with strict native equality, Undo/Redo and Save/Open.',
  limits: ['One prepared XY sketch, one radius-10 semicircle and its diameter, positive distance and inward Draft.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { checkBrep, curveDomain, evaluateCurve, evaluateSurface, faceGeometry, massPropertiesOf, surfaceDomain } from '@barocss/cad';
import { digestOf } from '@barocss/cad-model/util/digest';
import { partSnapshot } from '@barocss/cad-model/engine/part';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const { outputs } = partSnapshot(doc);
const body = outputs[0], brep = body.brep, mass = massPropertiesOf(body);
const seams = brep.edges.filter(e => e.curve.degree === 2).map(edge => {
  const curve = edge.curve, [a,b] = curveDomain(curve);
  return { name: edge.name, points: Array.from({ length: 9 }, (_, i) => evaluateCurve(curve, a + i / 8 * (b - a))) };
}).filter(edge => Math.abs(edge.points.at(-1)[2] - edge.points[0][2]) > 1);
const curvedSupports = brep.faces.filter(face => faceGeometry(face).kind !== 'plane').map(face => {
  const surface = face.surface, { u, v } = surfaceDomain(surface);
  return [0.2, 0.5, 0.8].flatMap(a => [0.2, 0.5, 0.8].map(b =>
    evaluateSurface(surface, u[0] + a * (u[1] - u[0]), v[0] + b * (v[1] - v[0]))));
});
const feature=doc.nodes[1], numeric={...doc,nodes:doc.nodes.map((node,index)=>index===1?{...node,height:typeof feature.height==='number'?feature.height:doc.parameters[feature.height.parameter]}:node)};
console.log(JSON.stringify({ sha:digestOf(brep),numericSha:digestOf(partSnapshot(numeric).outputs[0].brep), outputs: outputs.length, check: checkBrep(brep, { strict: true }), seams,
  kinds: brep.faces.map(face => faceGeometry(face).kind), curvedSupports, mass }));
`,
  oracleSource: `
import json,math,sys
d=json.load(sys.stdin);n=d['native'];height=d['height'];slope=math.tan(d['draft']*math.pi/180)
assert n['outputs']==1 and n['check']['valid'],n['check']
assert n['check']['counts']=={'bodies':1,'shells':1,'faces':5,'loops':5,'coedges':18,'edges':9,'vertices':6}
assert n['check']['topology'][0]['genus']==0
assert n['sha']==n['numericSha'],'Binding differs from explicit numeric height'
assert n['kinds'].count('plane')==3 and len(n['curvedSupports'])==2
def area(z):
    offset=z*slope;radius=10-offset
    return radius*radius*math.acos(offset/radius)-offset*math.sqrt(radius*radius-offset*offset)
def integral(count):
    step=height/count
    return step/3*(area(0)+area(height)+sum((4 if i%2 else 2)*area(i*step) for i in range(1,count)))
volume=integral(4096);assert abs(volume-integral(2048))<1e-9
assert abs(n['mass']['volume']-volume)<1e-7,(n['mass']['volume'],volume)
assert abs(d['workerVolume']-volume)<1e-7,(d['workerVolume'],volume)
assert len(n['seams'])==2
maximum=0
for support in n['curvedSupports']:
    for x,y,z in support:maximum=max(maximum,abs(math.hypot(x,y)-(10-z*slope)))
for seam in n['seams']:
    points=seam['points']
    assert all(any(abs(p[2]-z)<1e-7 for p in points) for z in [0,height])
    for x,y,z in points:maximum=max(maximum,abs(y-z*slope),abs(math.hypot(x,y)-(10-z*slope)))
assert maximum<1e-7,maximum
print(json.dumps({'status':'PASS','heightMM':height,'draftDegrees':d['draft'],'independentVolumeMM3':volume,'nativeVolumeMM3':n['mass']['volume'],'workerVolumeMM3':d['workerVolume'],'maximumSupportResidualMM':maximum,'boundEqualsNumericNative':True}))
`,
});

const seed={format:'barocss-cad-model',schema:3,units:'mm',parameters:{Angle:35,Height:6},nodes:[
  {id:'n0',kind:'sketch',profile:'loop',segments:[{kind:'line',start:[-10,0]},{kind:'arc',start:[10,0],center:[0,0],direction:'ccw'}]},
  {id:'n1',kind:'extrude',sketch:0,height:10,draft:10},
],outputs:{b1:{node:1,side:'solid'}},nextId:2};
const button=(name,scope=f.page)=>scope.getByRole('button',{name,exact:true});
const field=name=>f.editor().getByLabel(name,{exact:true});
async function checkEditor(bound){
  assert.equal(await field('Draft parameter').count(),0,'unsupported Draft parameter selector is not offered');
  assert.equal(await field('Draft').inputValue(),'14');assert.equal(await field('Draft').isDisabled(),false);
  assert.equal(await field('Distance parameter').inputValue(),bound?'Height':'');
  assert.equal(await field('Distance').isDisabled(),bound);
  assert.equal(await field('Distance').inputValue(),bound?'6':'10');
}
async function measure(doc,label,height){
  const native=await f.inspect(label,doc),bodies=(await f.bodies()).bodies;assert.equal(bodies.length,1);
  await f.runOracle({native,height,draft:14,workerVolume:bodies[0].volume},label);
  f.report.observations.push({label,height,sha:native.sha,volume:native.mass.volume});return native.sha;
}
await f.run(async()=>{
  const origin=new URL(f.server.resolvedUrls.local[0]).origin,newContext=f.browser.newContext.bind(f.browser);
  f.browser.newContext=async options=>{
    const context=await newContext({...options,serviceWorkers:'block'});
    await context.route('**/*',route=>{
      const url=new URL(route.request().url());
      if(url.hostname==='fonts.googleapis.com')return route.fulfill({contentType:'text/css',body:''});
      return ['http:','https:'].includes(url.protocol)&&url.origin!==origin?route.abort():route.continue();
    });return context;
  };
  for(const size of [{width:1024,height:800},{width:1440,height:900}]){
    const label=String(size.width);f.phase=label+' Open drafted half-disk';
    await f.newPage();await f.page.setViewportSize(size);
    const [chooser]=await Promise.all([f.page.waitForEvent('filechooser'),button('Open').click()]);
    await chooser.setFiles({name:label+'-draft-source.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(seed))});await f.same(seed);
    await f.openFeatureEditor(1,'numeric Draft remains editable');
    assert.equal(await field('Draft parameter').count(),0);assert.equal(await field('Draft').inputValue(),'10');
    await field('Draft').fill('14');await f.applyEditor(seed,label+'-numeric-draft14');
    const numeric=await f.doc();assert.deepEqual(numeric.nodes[1],{...seed.nodes[1],draft:14});assert.deepEqual(numeric.parameters,seed.parameters);
    await measure(numeric,label+'-numeric-draft14',10);
    await f.openFeatureEditor(1,'Distance parameter control');await checkEditor(false);await f.snapshot(label+'-draft-affordance-hidden');
    await field('Distance parameter').selectOption('Height');
    assert.equal(await field('Distance').inputValue(),'6');assert.equal(await field('Draft').inputValue(),'14');await f.same(numeric);
    await f.applyEditor(numeric,label+'-height-bound');
    const bound=await f.doc();assert.deepEqual(bound.nodes[1],{...numeric.nodes[1],height:{parameter:'Height'}});
    assert.deepEqual(bound.nodes[0],seed.nodes[0]);assert.deepEqual(bound.parameters,seed.parameters);
    const shape=await measure(bound,label+'-height-bound',6);
    await f.undo();await f.same(numeric);await f.openFeatureEditor(1,'undo Distance binding');await checkEditor(false);await f.closeEditor();
    await f.redo();await f.same(bound);await f.openFeatureEditor(1,'redo Distance binding');await checkEditor(true);await f.closeEditor();
    const saved=await f.save(label+'-extrude-draft-binding');
    await f.newPage();await f.page.setViewportSize(size);await f.openFile(saved.file,2);await f.same(bound);
    assert.equal(await measure(await f.doc(),label+'-reopened',6),shape);
    await f.openFeatureEditor(1,'reopened Distance binding');await checkEditor(true);await f.snapshot(label+'-reopened');await f.closeEditor();
    f.report.observations.push({...size,draftBindingAbsent:true,numericDraft14Applied:true,distanceBindingNativeEquivalent:true,undoRedoSaveOpen:true});
  }
});
