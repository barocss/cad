import assert from 'node:assert/strict';
import { relative, resolve } from 'node:path';
import { createFlow } from './flow-helper.mjs';

const output=process.argv[2];
assert.ok(output&&relative(resolve(import.meta.dirname,'../../..'),resolve(output)).startsWith('../'));
const pins=['apps/cad-studio/test/fillet-equal-positive-mode-browser.mjs','apps/cad-studio/test/flow-helper.mjs',
  'packages/barocss-cad-model/src/app/commands.ts','apps/cad-studio/src/ui/Hud.tsx','apps/cad-studio/src/ui/NodeEditor.tsx',
  'apps/cad-studio/src/ui/FilletTypeFields.tsx','apps/cad-studio/src/app/filletFamily.ts',
  'packages/barocss-cad-model/src/app/editFields.ts','packages/barocss-cad-model/src/engine/part.ts',
  'packages/barocss-cad/src/part/part-finish.ts','packages/barocss-cad/src/blend/rolling-ball.ts'];
const f=await createFlow({name:'fillet-equal-positive-mode',envFrozen:'D1412_SOURCE_FROZEN',output,initialFiles:pins,requiredFrozen:pins,
  qualification:'Equal positive endpoint radii keep the Varying History mode and both endpoint editors across creation, editing and file roundtrip.',
  limits:['One original straight convex edge of a 30×12×20 mm Box only. No closed-chain or broader geometry qualification.','End0 is set before selecting the explicit Constant HUD mode and remains the separate scalar Constant control. Scalar and equal-varying native topology and SHA are not required to match.','Numerical geometry PASS does not qualify rendering color or assistive technology. Root must review desktop screenshots separately.'],
  inspectorSource:`
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep, evaluateSurface } from '@barocss/cad';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
import { digestOf } from '@barocss/cad-model/util/digest';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const [{key,brep}] = partBreps(doc), feature=doc.nodes.at(-1).id;
const surfaces = brep.faces.filter(face => face.name?.startsWith(feature+'.face')).map(face => face.surface);
const bounds=brep.vertices.map(v=>v.point[0]), length=Math.max(...bounds)-Math.min(...bounds);
const samples = [0,.125,.25,.375,.5,.625,.75,1].map(t=>{
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
console.log(JSON.stringify({key,check:checkBrep(brep,{strict:true}),sha:digestOf(brep),volume:brepMassProperties(brep,1).volume,feature:doc.nodes[2],faceCount:brep.faces.length,samples}));
`,
  oracleSource:`
import json,math,sys
from fractions import Fraction as F
d=json.load(sys.stdin);n=d['native'];feature=n['feature']
assert n['check']['valid'],n['check']
assert n['check']['counts']['bodies']==1 and n['check']['counts']['shells']==1
assert feature['kind']=='fillet' and feature['radius']==1
assert feature.get('section') is None or feature['section']=={'kind':'circular'}
if d['varying']:
    ends=feature['radii'];assert len(ends)==2 and all(p.get('atEnd') is True for p in ends)
    a,b=[F(str(p['radius'])) for p in ends];start,end=[p['at'][0] for p in ends]
    assert sorted([start,end])==[0,30] and all(p['at'][1:]==[0,20] for p in ends)
    assert a==1 and b==F(str(d['endRadius']))
else:
    assert 'radii' not in feature
    a=b=F(1);start,end=0,30
# Independent linear endpoint radius law and exact integral; no product imports.
integral=30*(a*a+a*b+b*b)/3
assert integral==(F(30) if a==b else F(130))
def radius(x):return float(a)+(float(b)-float(a))*(x-start)/(end-start)
expected=7200-(1-math.pi/4)*float(integral)
assert abs(expected-(7193.561944901923 if a==b else 7172.101761241668))<1e-10
assert abs(n['volume']-expected)<=1e-7,(n['volume'],expected)
assert abs(d['workerVolume']-expected)<=1e-7,(d['workerVolume'],expected)
assert [s['t'] for s in n['samples']]==[0,.125,.25,.375,.5,.625,.75,1]
gap=0
for sample in n['samples']:
    x=sample['t']*30;r=radius(x);diag=r*(1-1/math.sqrt(2))
    want=[(x,r,20),(x,diag,20-diag),(x,0,20-r)]
    assert sample['sections'],'Missing native section'
    for section in sample['sections']:
        assert len(section)==3
        gap=max(gap,min(max(math.dist(p,q) for p,q in zip(section,order)) for order in [want,want[::-1]]))
assert gap<=1e-6,gap
print(json.dumps({'status':'PASS','varying':d['varying'],'startRadiusMM':float(a),'endRadiusMM':float(b),'radiusSquaredIntegralMM3':str(integral),'expectedVolumeMM3':expected,'nativeVolumeMM3':n['volume'],'workerVolumeMM3':d['workerVolume'],'maximumSectionResidualMM':gap,'axialSamples':8,'volumeToleranceMM3':1e-7,'sectionToleranceMM':1e-6,'nativeFaceCount':n['faceCount'],'areaOracle':'independent circular area and linear endpoint radius-squared integral'}))
`,
});
const box={format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nodes:[
  {id:'n0',kind:'sketch',profile:'rectangle',min:[0,0],max:[30,12]},{id:'n1',kind:'extrude',sketch:0,height:20}],outputs:{b1:{node:1,side:'solid'}},nextId:2};
const button=(name,scope=f.page)=>scope.getByRole('button',{name,exact:true});
const field=(name,scope=f.editor())=>scope.getByLabel(name,{exact:true});
const status=(scope,text)=>scope.locator('.status').filter({hasText:new RegExp('^'+text+'$')}).waitFor();
async function pickEdge(){
  await button('Top',f.page.locator('.views')).click();if(await button('Ortho').getAttribute('aria-pressed')!=='true')await button('Ortho').click();
  await f.page.getByTitle('Frame all (F)',{exact:true}).click();const filter=button('Selection filter');
  for(let i=0;i<6&&!(await filter.innerText()).includes('Edges');i++)await filter.click();assert.match(await filter.innerText(),/Edges/);
  const pixel=await f.page.evaluate(async()=>{let previous=null,stable=0;for(let frame=0;frame<360;frame++){
    await new Promise(done=>requestAnimationFrame(done));const point=window.__studioScreenOf([15,0,20]);const hit=point&&document.elementFromPoint(...point)?.matches('canvas.vp-canvas');
    stable=hit&&previous&&Math.hypot(point[0]-previous[0],point[1]-previous[1])<.01?stable+1:0;if(stable>=5)return point;previous=hit?point:null;}return null;});
  assert.ok(pixel,'Public edge point must settle on canvas for five frames');await f.page.mouse.click(...pixel);await f.page.waitForFunction(()=>window.__studioSelection?.selection.edges.length===1);
}
async function create(size,endRadius,label){
  f.phase=label+' public HUD creation';await f.newPage();await f.page.setViewportSize(size);
  const [chooser]=await Promise.all([f.page.waitForEvent('filechooser'),button('Open').click()]);
  await chooser.setFiles({name:label+'.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(box))});await f.same(box);await pickEdge();await f.command('Fillet');
  const hud=f.page.getByRole('dialog',{name:'Fillet',exact:true});await field('Fillet radius mode',hud).selectOption('varying');await field('Radius',hud).fill('1');await field('End radius (0: same)',hud).fill(String(endRadius));
  if(await field('Radius controls',hud).count())await field('Radius controls',hud).selectOption('ends');
  if(endRadius===0)await field('Fillet radius mode',hud).selectOption('constant');
  assert.equal(await field('Fillet radius mode',hud).inputValue(),endRadius===0?'constant':'varying');await status(hud,'preview');await f.same(box);await f.snapshot(label+'-hud');await button('Apply',hud).click();await f.changed(box);
  const doc=await f.doc();assert.equal(doc.nodes.length,3);assert.deepEqual(doc.nodes.slice(0,2),box.nodes);assert.deepEqual(doc.parameters,box.parameters);
  const feature=doc.nodes[2];assert.equal(feature.kind,'fillet');assert.equal(feature.id,'n2');assert.deepEqual(feature.parent,{node:1,side:'solid'});assert.deepEqual(feature.edges,['n1.side0|n1.top']);assert.equal(feature.radius,1);
  if(endRadius>0){assert.equal(feature.radii.length,2);assert.deepEqual(feature.radii.map(p=>p.radius),[1,endRadius]);assert.ok(feature.radii.every(p=>p.atEnd===true));assert.deepEqual(feature.radii.map(p=>p.at[0]).sort((a,b)=>a-b),[0,30]);assert.ok(feature.radii.every(p=>JSON.stringify(p.at.slice(1))==='[0,20]'));}
  else assert.equal(Object.hasOwn(feature,'radii'),false);
  return doc;
}
async function identities(varying,endRadius){
  for(const [name,label,value] of [['Fillet type','Type','Edge'],['Fillet radius mode','Radius mode',varying?'Varying':'Constant'],['Fillet section','Section','Circular']]){
    const group=f.editor().getByRole('group',{name,exact:true});assert.equal(await group.count(),1);assert.equal(await group.getByText(label,{exact:true}).count(),1);assert.equal(await group.getByText(value,{exact:true}).count(),1);assert.equal(await group.locator('select,input,button,textarea').count(),0);
  }
  if(varying){assert.equal(await field('Start radius').inputValue(),'1');assert.equal(await field('End radius').inputValue(),String(endRadius));assert.equal(await field('Start radius').isEnabled(),true);assert.equal(await field('End radius').isEnabled(),true);assert.equal(await field('Radius').count(),0);}
  else{assert.equal(await field('Radius').inputValue(),'1');assert.equal(await field('Radius').isEnabled(),true);assert.equal(await field('Start radius').count(),0);assert.equal(await field('End radius').count(),0);}
}
function endEdit(doc,endRadius){return {...doc,nodes:doc.nodes.map((node,index)=>index===2?{...node,radii:node.radii.map((point,i)=>i===node.radii.length-1?{...point,radius:endRadius}:point)}:node)};}
async function editEnd(before,endRadius,label){await f.openFeatureEditor(2,label);await identities(true,before.nodes[2].radii.at(-1).radius);await field('End radius').fill(String(endRadius));await f.same(before);await f.applyEditor(before,label);const edited=await f.doc();assert.deepEqual(edited,endEdit(before,endRadius),'Only the authored end radius changes: parent, edges, endpoints, feature ID and all other payload stay fixed');await f.openFeatureEditor(2,label+' reopen');await identities(true,endRadius);await f.snapshot(label+'-history');await f.closeEditor();return edited;}
async function measure(doc,label,varying,endRadius){await f.ready();const native=await f.inspect(label,doc),bodies=(await f.bodies()).bodies;assert.equal(bodies.length,1);assert.equal(bodies[0].key,native.key);await f.runOracle({native,workerVolume:bodies[0].volume,varying,endRadius},label);f.report.observations.push({label,sha:native.sha,faceCount:native.faceCount,volume:native.volume});return native.sha;}
async function roundtrip(size,equal,linear,label){
  const linearSHA=await measure(linear,label+'-linear',true,3);
  await f.undo();await f.same(equal);const equalSHA=await measure(equal,label+'-undo-equal',true,1);await f.openFeatureEditor(2,label+' undo');await identities(true,1);await f.closeEditor();
  await f.redo();await f.same(linear);assert.equal(await measure(linear,label+'-redo-linear',true,3),linearSHA);await f.openFeatureEditor(2,label+' redo');await identities(true,3);await f.closeEditor();
  // Reopen both authored states in fresh contexts; neither relies on native topology
  // equality with the separate scalar Constant path.
  const savedLinear=await f.save(label+'-linear');await f.undo();await f.same(equal);const savedEqual=await f.save(label+'-equal');
  for(const [saved,doc,endRadius,sha] of [[savedEqual,equal,1,equalSHA],[savedLinear,linear,3,linearSHA]]){
    await f.newPage();await f.page.setViewportSize(size);await f.openFile(saved.file,3);await f.same(doc);assert.equal(await measure(doc,label+'-fresh-'+endRadius,true,endRadius),sha);await f.openFeatureEditor(2,label+' fresh '+endRadius);await identities(true,endRadius);await f.snapshot(label+'-fresh-'+endRadius);await f.closeEditor();
  }
  return equalSHA;
}
await f.run(async()=>{
  const origin=new URL(f.server.resolvedUrls.local[0]).origin,newContext=f.browser.newContext.bind(f.browser);
  f.browser.newContext=async options=>{const context=await newContext({...options,serviceWorkers:'block'});await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.hostname==='fonts.googleapis.com')return route.fulfill({contentType:'text/css',body:''});return ['http:','https:'].includes(url.protocol)&&url.origin!==origin?route.abort():route.continue();});return context;};
  for(const size of [{width:1024,height:800},{width:1440,height:900}]){
    const direct=await create(size,1,size.width+'-direct-equal');await f.openFeatureEditor(2,'direct equal');await identities(true,1);await f.snapshot(size.width+'-direct-equal-history');await f.closeEditor();
    await measure(direct,size.width+'-direct-equal-initial',true,1);const directLinear=await editEnd(direct,3,size.width+'-direct-end3');const directSHA=await roundtrip(size,direct,directLinear,size.width+'-direct');
    const originalLinear=await create(size,3,size.width+'-linear-first');await measure(originalLinear,size.width+'-linear-first-initial',true,3);
    const historyEqual=await editEnd(originalLinear,1,size.width+'-history-equal');assert.deepEqual(historyEqual,direct,'Both varying paths retain identical authored endpoint payloads');assert.equal(await measure(historyEqual,size.width+'-history-equal',true,1),directSHA,'Identical varying payloads retain native equality; this does not compare scalar geometry');
    const historyLinear=await editEnd(historyEqual,3,size.width+'-history-end3');assert.deepEqual(historyLinear,originalLinear);await roundtrip(size,historyEqual,historyLinear,size.width+'-history');
    const scalar=await create(size,0,size.width+'-zero-scalar');await measure(scalar,size.width+'-zero-scalar',false,1);await f.openFeatureEditor(2,'End0 scalar');await identities(false,1);await f.snapshot(size.width+'-zero-scalar-history');await f.closeEditor();
    const savedScalar=await f.save(size.width+'-zero-scalar');await f.newPage();await f.page.setViewportSize(size);await f.openFile(savedScalar.file,3);await f.same(scalar);await measure(scalar,size.width+'-zero-scalar-fresh',false,1);await f.openFeatureEditor(2,'End0 scalar fresh');await identities(false,1);await f.closeEditor();
    f.report.observations.push({...size,directEqualAndHistoryEqualPayloadMatch:true,positiveEqualVarying:true,end3Editable:true,undoRedoSaveFreshOpen:true,endZeroScalarConstant:true,scalarNativeEqualityNotRequired:true});
  }
});
