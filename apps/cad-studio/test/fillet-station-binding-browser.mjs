import assert from 'node:assert/strict';
import { relative, resolve } from 'node:path';
import { createFlow } from './flow-helper.mjs';

const output = process.argv[2];
assert.ok(output && relative(resolve(import.meta.dirname, '../../..'), resolve(output)).startsWith('../'));
const pins = [
  'apps/cad-studio/test/flow-helper.mjs', 'apps/cad-studio/src/ui/Hud.tsx', 'apps/cad-studio/src/ui/NodeEditor.tsx',
  'apps/cad-studio/src/app/filletFamily.ts', 'packages/barocss-cad-model/src/app/commands.ts',
  'packages/barocss-cad-model/src/app/editFields.ts', 'apps/cad-studio/src/app/filletInteriorInput.ts', 'packages/barocss-cad-model/src/engine/part.ts',
  'packages/barocss-cad/src/part/part-finish.ts', 'packages/barocss-cad/src/blend/rolling-ball.ts',
];
const f = await createFlow({
  name: 'fillet-station-binding', envFrozen: 'D1407_SOURCE_FROZEN', output, initialFiles: pins, requiredFrozen: pins,
  qualification: 'Hide unsupported percent parameter selectors, directly apply 40 percent, and retain native-equivalent interior radius binding through Undo/Redo and native Save/Open.',
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
const samples = [0,.125,.25,.4,.625,.875,1].map(t=>{
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
length,height,_ = d['length'],d['height'],d['edited']
# Exact cubics in local span t. The input knots are 0, 0.4 L, L.
# Knots at 0, 16, 40 mm; endpoint secants 1/16 and 1/12, interior mean 7/96.
left,right = [F(1),F(1),-F(1,6),F(1,6)],[F(2),F(7,4),F(1,2),-F(1,4)]
def square_integral(p):
    return sum(a*b/F(i+j+1) for i,a in enumerate(p) for j,b in enumerate(p))
integral=16*square_integral(left)+24*square_integral(right)
def radius(t):
    p,s=(left,t/.4) if t<=.4 else (right,(t-.4)/.6)
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


const seed={format:'barocss-cad-model',schema:3,units:'mm',parameters:{stationPercent:40,middleRadius:2},nodes:[
  {id:'n0',kind:'sketch',profile:'rectangle',min:[0,0],max:[40,30]},
  {id:'n1',kind:'extrude',sketch:0,height:10},
  {id:'n2',kind:'fillet',parent:{node:1,side:'solid'},edges:['n1.side0|n1.top'],radius:1,radii:[
    {at:[0,0,10],radius:1,atEnd:true},{at:[10,0,10],fraction:.25,radius:2},{at:[40,0,10],radius:4,atEnd:true},
  ]}],outputs:{b2:{node:2,side:'solid'}},nextId:3};
const button=(name,scope=f.page)=>scope.getByRole('button',{name,exact:true});
const field=(name,scope=f.editor())=>scope.getByLabel(name,{exact:true});
async function measure(doc,label){
  const native=await f.inspect(label,doc), bodies=(await f.bodies()).bodies;
  assert.equal(bodies.length,1);assert.equal(bodies[0].key,native.key);
  await f.runOracle({native,length:40,height:10,edited:false,workerVolume:bodies[0].volume},label);
  f.report.observations.push({label,sha:native.sha,volume:native.volume});return native.sha;
}
async function checkEditor(percent,bound){
  assert.equal(await field('Interior position (%)').inputValue(),String(percent));
  assert.equal(await field('Interior position (%) parameter').count(),0,'unsupported percent binding is not offered');
  assert.equal(await field('Interior radius parameter').count(),1,'working radius binding remains');
  assert.equal(await field('Interior radius parameter').inputValue(),bound?'middleRadius':'');
  assert.equal(await field('Interior radius').isDisabled(),bound);
  assert.equal(await field('Interior radius').inputValue(),'2');
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
  for(const width of [1024,1440]){
    const size={width,height:900},label=String(width);
    f.phase=label+' open varying fillet with available parameters';
    await f.newPage();await f.page.setViewportSize(size);
    const [chooser]=await Promise.all([f.page.waitForEvent('filechooser'),button('Open').click()]);
    await chooser.setFiles({name:label+'-station-binding.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(seed))});
    await f.same(seed);await f.openFeatureEditor(2,'unbound interior position');await checkEditor(25,false);
    assert.equal(await field('End radius parameter').count(),1);
    await f.snapshot(label+'-unsupported-percent-binding-hidden');
    f.phase=label+' direct numeric 40 percent';
    await field('Interior position (%)').fill('40');await f.applyEditor(seed,label+'-numeric-forty');
    const numeric=await f.doc();assert.equal(numeric.nodes[2].radii[1].fraction,.4);
    assert.deepEqual(numeric.parameters,seed.parameters);assert.deepEqual(numeric.nodes.slice(0,2),seed.nodes.slice(0,2));
    const shape=await measure(numeric,label+'-numeric-forty');
    await f.openFeatureEditor(2,'bind working interior radius');await checkEditor(40,false);
    await field('Interior radius parameter').selectOption('middleRadius');
    assert.equal(await field('Interior radius').isDisabled(),true);await f.same(numeric);
    await f.applyEditor(numeric,label+'-radius-bound');
    const bound=await f.doc();assert.deepEqual(bound.nodes[2].radii[1].radius,{parameter:'middleRadius'});
    assert.equal(bound.nodes[2].radii[1].fraction,.4);assert.deepEqual(bound.parameters,seed.parameters);
    assert.equal(await measure(bound,label+'-radius-bound'),shape,'binding numeric2 preserves native B-rep');
    await f.undo();await f.same(numeric);await f.openFeatureEditor(2,'undo binding');await checkEditor(40,false);await f.closeEditor();
    await f.redo();await f.same(bound);await f.openFeatureEditor(2,'redo binding');await checkEditor(40,true);await f.closeEditor();
    const saved=await f.save(label+'-station-radius-binding');
    await f.newPage();await f.page.setViewportSize(size);await f.openFile(saved.file,3);await f.same(bound);
    assert.equal(await measure(await f.doc(),label+'-reopened'),shape);await f.openFeatureEditor(2,'reopened radius binding');await checkEditor(40,true);
    await f.snapshot(label+'-reopened');await f.closeEditor();
    f.report.observations.push({width,percentBindingAbsent:true,numericFortyApplied:true,radiusBindingNativeEquivalent:true,undoRedoSaveOpen:true});
  }
});
