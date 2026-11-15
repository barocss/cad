import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const pins=['apps/cad-studio/test/flow-helper.mjs','apps/cad-studio/src/ui/NodeEditor.tsx',
  'packages/barocss-cad-model/src/app/editFields.ts','packages/barocss-cad-model/src/engine/part.ts',
  'packages/barocss-cad/src/part/part-finish.ts'];
const f=await createFlow({
  name:'fillet-section-binding',envFrozen:'D1409_SOURCE_FROZEN',output:process.argv[2],initialFiles:pins,requiredFrozen:pins,
  qualification:'Hide unsupported Rho/Tension parameter controls while retaining numeric0.7 and native-equivalent Radius binding.',
  limits:['Binding-only partial #122; range feedback remains separate #121. One straight convex R4 box rim, Conic and G2. No general continuity qualification.'],
  inspectorSource:`
import {readFileSync} from 'node:fs';
import {checkBrep,brepMassProperties,evaluateSurface} from '@barocss/cad';
import {partBreps} from '@barocss/cad-model/engine/evaluate';
import {digestOf} from '@barocss/cad-model/util/digest';
const doc=JSON.parse(readFileSync(process.argv[2],'utf8')),[{key,brep}]=partBreps(doc),feature=doc.nodes[2];
const numeric={...doc,nodes:doc.nodes.map((n,i)=>i===2?{...n,radius:typeof n.radius==='number'?n.radius:doc.parameters[n.radius.parameter]}:n)};
const sections=brep.faces.filter(face=>/^n2\\.face(?:#\\d+)?$/.test(face.name??'')).map(face=>{
  const surface=face.surface;if(surface.kind!=='surface')throw Error('Expected native section support');
  const v=surface.knotsV,mid=(v[surface.degreeV]+v[surface.controlPoints[0].length])/2;
  return {name:face.name,points:[0,.25,.5,.75,1].map(t=>evaluateSurface(surface,t,mid))};
});
console.log(JSON.stringify({key,sha:digestOf(brep),numericSha:digestOf(partBreps(numeric)[0].brep),section:feature.section,
  check:checkBrep(brep,{strict:true}),volume:brepMassProperties(brep,1).volume,sections}));
`,
  oracleSource:`
import json,math,sys
from fractions import Fraction as F
from math import comb
d=json.load(sys.stdin);n=d['native'];kind=d['kind'];r=4;q=F(7,10)
assert n['check']['valid'],n['check']
assert n['sha']==n['numericSha'],'Radius binding changed native geometry'
assert n['section']==({'kind':'conic','rho':.7} if kind=='conic' else {'kind':'g2','tension':.7})
if kind=='g2':
    poles=[(0,r),(0,(1-q)*r),(0,0),((1-q)*r,0),(r,0)]
    def point(t):
        b=[comb(4,i)*t**i*(1-t)**(4-i) for i in range(5)]
        return [sum(a*float(p[k]) for a,p in zip(b,poles)) for k in range(2)]
    removed=F(0)
    for i,(x,y) in enumerate(poles):
        for j,(p,s) in enumerate(poles[:-1]):
            vx,vy=poles[j+1][0]-p,poles[j+1][1]-s
            removed+=2*(y*vx-x*vy)*F(comb(4,i)*comb(3,j),8*comb(7,i+j))
else:
    weight=float(q/(1-q));poles=[(0,r),(0,0),(r,0)];weights=[1,weight,1]
    def value(t):
        b=[(1-t)**2,2*t*(1-t),t*t];db=[-2*(1-t),2-4*t,2*t]
        w=sum(a*b for a,b in zip(b,weights));dw=sum(a*b for a,b in zip(db,weights))
        top=[sum(a*b*p[k] for a,b,p in zip(b,weights,poles)) for k in range(2)]
        derivative=[sum(a*b*p[k] for a,b,p in zip(db,weights,poles)) for k in range(2)]
        return [v/w for v in top],[(v*w-u*dw)/(w*w) for v,u in zip(derivative,top)]
    def point(t):return value(t)[0]
    def area(t):
        (x,y),(dx,dy)=value(t)
        return (y*dx-x*dy)/2
    def integrate(count):return (area(0)+area(1)+sum((4 if i%2 else 2)*area(i/count) for i in range(1,count)))/(3*count)
    removed=integrate(8192);assert abs(removed-integrate(4096))<1e-9
assert n['sections'],'No native fillet sections'
want=[[p[0],10-p[1]] for p in map(point,[0,.25,.5,.75,1])]
gap=0
for section in n['sections']:
    yz=[p[1:] for p in section['points']]
    gap=max(gap,min(max(math.dist(p,q) for p,q in zip(yz,order)) for order in [want,want[::-1]]))
assert gap<1e-7,gap
expected=12000-40*float(removed)
assert abs(n['volume']-expected)<5e-6,(n['volume'],expected)
assert abs(d['workerVolume']-expected)<5e-6,(d['workerVolume'],expected)
print(json.dumps({'status':'PASS','kind':kind,'setting':.7,'expectedVolumeMM3':expected,'nativeVolumeMM3':n['volume'],'workerVolumeMM3':d['workerVolume'],'maximumSectionResidualMM':gap,'radiusBindingEqualsNumericNative':True,'areaOracle':'exact quartic Bernstein integral' if kind=='g2' else 'independent rational-conic numerical integral'}))
`,
});
const seed=kind=>({format:'barocss-cad-model',schema:3,units:'mm',parameters:{shapeSetting:.7,filletRadius:4},nodes:[
  {id:'n0',kind:'sketch',profile:'rectangle',min:[0,0],max:[40,30]}, {id:'n1',kind:'extrude',sketch:0,height:10},
  {id:'n2',kind:'fillet',parent:{node:1,side:'solid'},edges:['n1.side0|n1.top'],radius:4,section:kind==='conic'?{kind,rho:.4}:{kind,tension:.4}},
],outputs:{b2:{node:2,side:'solid'}},nextId:3});
const button=(name,scope=f.page)=>scope.getByRole('button',{name,exact:true});
const field=name=>f.editor().getByLabel(name,{exact:true});
async function checkEditor(shape,bound){
  assert.equal(await field(shape+' parameter').count(),0,'Unsupported section parameter selector is not offered');
  assert.equal(await field(shape).inputValue(),'0.7');assert.equal(await field(shape).isDisabled(),false);
  assert.equal(await field('Radius parameter').inputValue(),bound?'filletRadius':'');
  assert.equal(await field('Radius').isDisabled(),bound);assert.equal(await field('Radius').inputValue(),'4');
}
async function measure(doc,label,kind){
  const native=await f.inspect(label,doc),bodies=(await f.bodies()).bodies;assert.equal(bodies.length,1);assert.equal(bodies[0].key,native.key);
  await f.runOracle({native,kind,workerVolume:bodies[0].volume},label);
  f.report.observations.push({label,sha:native.sha,volume:native.volume});return native.sha;
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
  for(const size of [{width:1024,height:800},{width:1440,height:900}])for(const kind of ['conic','g2']){
    const label=size.width+'-'+kind,source=seed(kind),shape=kind==='conic'?'Rho':'Tension';
    f.phase=label+' Open section fillet';await f.newPage();await f.page.setViewportSize(size);
    const [chooser]=await Promise.all([f.page.waitForEvent('filechooser'),button('Open').click()]);
    await chooser.setFiles({name:label+'-section-source.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(source))});await f.same(source);
    await f.openFeatureEditor(2,'numeric '+shape);assert.equal(await field(shape+' parameter').count(),0);assert.equal(await field(shape).inputValue(),'0.4');
    await field(shape).fill('0.7');await f.applyEditor(source,label+'-numeric-setting');
    const numeric=await f.doc();assert.deepEqual(numeric.nodes[2].section,kind==='conic'?{kind,rho:.7}:{kind,tension:.7});
    assert.deepEqual(numeric.parameters,source.parameters);assert.deepEqual(numeric.nodes.slice(0,2),source.nodes.slice(0,2));
    const native=await measure(numeric,label+'-numeric-setting',kind);
    await f.undo();await f.same(source);await f.redo();await f.same(numeric);
    await f.openFeatureEditor(2,'working Radius binding');await checkEditor(shape,false);await f.snapshot(label+'-section-binding-hidden');
    await field('Radius parameter').selectOption('filletRadius');assert.equal(await field('Radius').isDisabled(),true);await f.same(numeric);
    await f.applyEditor(numeric,label+'-radius-bound');const bound=await f.doc();
    assert.deepEqual(bound.nodes[2],{...numeric.nodes[2],radius:{parameter:'filletRadius'}});assert.deepEqual(bound.parameters,source.parameters);
    assert.equal(await measure(bound,label+'-radius-bound',kind),native);
    await f.undo();await f.same(numeric);await f.openFeatureEditor(2,'undo Radius binding');await checkEditor(shape,false);await f.closeEditor();
    await f.redo();await f.same(bound);await f.openFeatureEditor(2,'redo Radius binding');await checkEditor(shape,true);await f.closeEditor();
    const saved=await f.save(label+'-section-binding');await f.newPage();await f.page.setViewportSize(size);await f.openFile(saved.file,3);await f.same(bound);
    assert.equal(await measure(await f.doc(),label+'-reopened',kind),native);await f.openFeatureEditor(2,'reopened '+shape);await checkEditor(shape,true);await f.snapshot(label+'-reopened');await f.closeEditor();
    f.report.observations.push({...size,kind,sectionBindingAbsent:true,numericPointSevenApplied:true,radiusBindingNativeEquivalent:true,undoRedoSaveOpen:true});
  }
});
