import assert from 'node:assert/strict';
import { relative, resolve } from 'node:path';
import { createFlow } from './flow-helper.mjs';

const output=process.argv[2];
assert.ok(output&&relative(resolve(import.meta.dirname,'../../..'),resolve(output)).startsWith('../'));
const pins=['apps/cad-studio/test/fillet-section-identity-browser.mjs','apps/cad-studio/test/flow-helper.mjs',
  'apps/cad-studio/src/ui/FilletTypeFields.tsx','apps/cad-studio/src/ui/NodeEditor.tsx','apps/cad-studio/src/ui/Hud.tsx',
  'apps/cad-studio/src/app/filletFamily.ts','packages/barocss-cad-model/src/app/editFields.ts',
  'packages/barocss-cad-model/src/engine/part.ts','packages/barocss-cad/src/part/part-finish.ts',
  'packages/barocss-cad/src/blend/rolling-ball.ts','packages/barocss-cad/src/blend/edge-finish.ts'];
const f=await createFlow({name:'fillet-section-identity',envFrozen:'D1411_SOURCE_FROZEN',output,initialFiles:pins,requiredFrozen:pins,
  qualification:'Read-only History type, radius mode and section identities retain coefficient editing and native geometry.',
  limits:['One straight convex edge of a 40×30×10 mm Box; constant R4 Conic/G2 and varying G2 R1→R2 at 25%→R4. No general continuity or assistive technology qualification.','Numerical geometry PASS does not qualify rendering color. Root must review captured desktop screenshots separately.'],
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
    return [[0,.25,.5,.75,1].map(t=>evaluateSurface(surface,u0+(u1-u0)*t,(lo+hi)/2))];
  });
  assert.ok(candidates.length>0, 'Missing native section at X='+x);
  return {t,x,sections:candidates};
});
console.log(JSON.stringify({key,check:checkBrep(brep,{strict:true}),sha:digestOf(brep),volume:brepMassProperties(brep,1).volume,section:doc.nodes[2].section,samples}));
`,
  oracleSource:`
import json,math,sys
from fractions import Fraction as F
from math import comb
d=json.load(sys.stdin);n=d['native'];kind=d['kind'];q=F(str(d['coefficient']));r=1
assert n['check']['valid'],n['check']
assert n['check']['counts']['bodies']==1 and n['check']['counts']['shells']==1
assert n['section']==({'kind':'conic','rho':float(q)} if kind=='conic' else {'kind':'g2','tension':float(q)})
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
# Existing one-interior Hermite law, independently integrated in local span coordinates.
# Start R1, knot t=1/4 R2, end R4. No geometry reconstruction is used.
left=[F(1),F(1),F(1,6),-F(1,6)]
right=[F(2),F(5,2),-F(1),F(1,2)]
integral=sum(length*sum(a*b/F(i+j+1) for i,a in enumerate(poly) for j,b in enumerate(poly)) for length,poly in [(F(10),left),(F(30),right)]) if d['varying'] else F(640)
if d['varying']:
    assert kind=='g2' and integral==F(8393,27)
    assert removed=={F(1,2):F(1,10),F(7,10):F(103,1750)}[q]
    exact_volume=F(12000)-removed*integral
    assert exact_volume=={F(1,2):F(3231607,270),F(7,10):F(80876503,6750)}[q]
def radius(t):
    if not d['varying']:return 4
    poly,u=(left,t*4) if t<=.25 else (right,(t-.25)/.75)
    return sum(float(c)*u**i for i,c in enumerate(poly))
assert [s['t'] for s in n['samples']]==[0,.125,.25,.375,.5,.625,.75,1]
gap=0
for sample in n['samples']:
    x=sample['t']*40;scale=radius(sample['t'])
    want=[(x,scale*p[0],10-scale*p[1]) for p in map(point,[0,.25,.5,.75,1])]
    assert sample['sections'],'No native section at '+str(x)
    for section in sample['sections']:
        assert len(section)==5
        gap=max(gap,min(max(math.dist(p,q) for p,q in zip(section,order)) for order in [want,want[::-1]]))
assert gap<1e-7,gap
expected=12000-float(removed)*float(integral)
assert abs(n['volume']-expected)<5e-6,(n['volume'],expected)
assert abs(d['workerVolume']-expected)<5e-6,(d['workerVolume'],expected)
if d['varying']:
    observed={.5:11968.914814815,.7:11981.704148148}[float(q)]
    assert abs(expected-observed)<5e-7,(expected,observed)
print(json.dumps({'status':'PASS','kind':kind,'coefficient':float(q),'varying':d['varying'],'expectedVolumeMM3':expected,'nativeVolumeMM3':n['volume'],'workerVolumeMM3':d['workerVolume'],'maximumSectionResidualMM':gap,'axialSamples':8,'radiusSquaredIntegralMM3':str(integral),'unitRemovedArea':str(removed),'volumeToleranceMM3':5e-6,'sectionToleranceMM':1e-7,'areaOracle':'exact quartic Bernstein integral' if kind=='g2' else 'independent rational-conic numerical integral'}))

`,
});
const button=(name,scope=f.page)=>scope.getByRole('button',{name,exact:true});
const field=(name,scope=f.editor())=>scope.getByLabel(name,{exact:true});
const status=(scope,text)=>scope.locator('.status').filter({hasText:new RegExp('^'+text+'$')}).waitFor();
const box={format:'barocss-cad-model',schema:3,units:'mm',parameters:{shapeSetting:.7},nodes:[
  {id:'n0',kind:'sketch',profile:'rectangle',min:[0,0],max:[40,30]},{id:'n1',kind:'extrude',sketch:0,height:10}],outputs:{b1:{node:1,side:'solid'}},nextId:2};
function seed(kind,varying){
  const coefficient=varying ? .5 : .4;
  const node={id:'n2',kind:'fillet',parent:{node:1,side:'solid'},edges:['n1.side0|n1.top'],radius:varying?1:4,section:kind==='conic'?{kind,rho:coefficient}:{kind,tension:coefficient}};
  if(varying)node.radii=[{at:[0,0,10],radius:1,atEnd:true},{at:[10,0,10],radius:2,fraction:.25},{at:[40,0,10],radius:4,atEnd:true}];
  return {...structuredClone(box),nodes:[...structuredClone(box.nodes),node],outputs:{b2:{node:2,side:'solid'}},nextId:3};
}
async function openSource(doc,label){
  const [chooser]=await Promise.all([f.page.waitForEvent('filechooser'),button('Open').click()]);
  await chooser.setFiles({name:label+'.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))});await f.same(doc);
}
async function identities(kind,varying){
  for(const [name,label,value] of [['Fillet type','Type','Edge'],['Fillet radius mode','Radius mode',varying?'Varying':'Constant'],['Fillet section','Section',kind==='conic'?'Conic':'Curvature (G2)']]){
    const group=f.editor().getByRole('group',{name,exact:true});assert.equal(await group.count(),1);
    assert.equal(await group.getByText(label,{exact:true}).count(),1);assert.equal(await group.getByText(value,{exact:true}).count(),1);
    assert.equal(await group.locator('select,input,button,textarea').count(),0,'Fixed History identity must not offer an interactive control');
  }
  for(const name of ['Fillet type','Fillet radius mode','Section'])assert.equal(await f.editor().locator('select[aria-label="'+name+'"]').count(),0);
}
async function measure(doc,label,kind,varying,coefficient){
  const native=await f.inspect(label,doc),bodies=(await f.bodies()).bodies;assert.equal(bodies.length,1);assert.equal(bodies[0].key,native.key);
  await f.runOracle({native,kind,varying,coefficient,workerVolume:bodies[0].volume},label);
  f.report.observations.push({label,sha:native.sha,volume:native.volume});return native.sha;
}
async function pickEdge(){
  await button('Top',f.page.locator('.views')).click();if(await button('Ortho').getAttribute('aria-pressed')!=='true')await button('Ortho').click();
  await f.page.getByTitle('Frame all (F)',{exact:true}).click();const filter=button('Selection filter');
  for(let i=0;i<6&&!(await filter.innerText()).includes('Edges');i++)await filter.click();assert.match(await filter.innerText(),/Edges/);
  const pixel=await f.page.evaluate(async()=>{let previous=null,stable=0;for(let frame=0;frame<360;frame++){
    await new Promise(done=>requestAnimationFrame(done));const point=window.__studioScreenOf([20,0,10]);const hit=point&&document.elementFromPoint(...point)?.matches('canvas.vp-canvas');
    stable=hit&&previous&&Math.hypot(point[0]-previous[0],point[1]-previous[1])<.01?stable+1:0;if(stable>=5)return point;previous=hit?point:null;}return null;});
  assert.ok(pixel,'Public edge point must settle on canvas for five frames');await f.page.mouse.click(...pixel);await f.page.waitForFunction(()=>window.__studioSelection?.selection.edges.length===1);
}
await f.run(async()=>{
  const origin=new URL(f.server.resolvedUrls.local[0]).origin,newContext=f.browser.newContext.bind(f.browser);
  f.browser.newContext=async options=>{const context=await newContext({...options,serviceWorkers:'block'});await context.route('**/*',route=>{
    const url=new URL(route.request().url());if(url.hostname==='fonts.googleapis.com')return route.fulfill({contentType:'text/css',body:''});return ['http:','https:'].includes(url.protocol)&&url.origin!==origin?route.abort():route.continue();});return context;};
  for(const size of [{width:1024,height:800},{width:1440,height:900}]){
    f.phase=size.width+' editable HUD controls';await f.newPage();await f.page.setViewportSize(size);await openSource(box,size.width+'-box');await pickEdge();await f.command('Fillet');
    const hud=f.page.getByRole('dialog',{name:'Fillet',exact:true});
    for(const name of ['Fillet type','Fillet radius mode','Section']){const control=field(name,hud);assert.equal(await control.evaluate(e=>e.tagName),'SELECT');assert.equal(await control.isEnabled(),true);}
    await field('Fillet type',hud).selectOption('edge');await field('Fillet radius mode',hud).selectOption('varying');assert.equal(await field('Fillet radius mode',hud).inputValue(),'varying');
    await field('Fillet radius mode',hud).selectOption('constant');await field('Radius',hud).fill('4');
    for(const [kind,name] of [['conic','Rho'],['g2','Tension']]){await field('Section',hud).selectOption(kind);await field(name,hud).fill('.7');await status(hud,'preview');assert.equal(await field('Section',hud).inputValue(),kind);assert.equal(await field(name,hud).isEnabled(),true);await f.same(box);}
    await f.snapshot(size.width+'-hud-editable');await button('Cancel',hud).click();await f.same(box);
    for(const [kind,varying] of [['conic',false],['g2',false],['g2',true]]){
      const label=size.width+'-'+kind+(varying?'-varying':'-constant'),source=seed(kind,varying),shape=kind==='conic'?'Rho':'Tension',initial=varying ? .5 : .4;
      f.phase=label+' History source';await f.newPage();await f.page.setViewportSize(size);await openSource(source,label);
      const initialSHA=await measure(source,label+'-initial',kind,varying,initial);
      await f.openFeatureEditor(2,label+' identity');await identities(kind,varying);assert.equal(await field(shape).inputValue(),String(initial));assert.equal(await field(shape+' parameter').count(),0);await f.snapshot(label+'-history-identity');
      await field(shape).fill('.7');await identities(kind,varying);await f.same(source);await f.applyEditor(source,label+'-edited');
      const edited=await f.doc();assert.deepEqual(edited,{...source,nodes:source.nodes.map((node,index)=>index===2?{...node,section:kind==='conic'?{kind,rho:.7}:{kind,tension:.7}}:node)},'Only the coefficient changes; feature ID, edges, stations and radii remain');
      const editedSHA=await measure(edited,label+'-edited',kind,varying,.7);assert.notEqual(editedSHA,initialSHA);
      await f.undo();await f.same(source);assert.equal(await measure(await f.doc(),label+'-undo',kind,varying,initial),initialSHA);
      await f.openFeatureEditor(2,label+' undo identity');await identities(kind,varying);assert.equal(await field(shape).inputValue(),String(initial));await f.closeEditor();
      await f.redo();await f.same(edited);assert.equal(await measure(await f.doc(),label+'-redo',kind,varying,.7),editedSHA);
      await f.openFeatureEditor(2,label+' redo identity');await identities(kind,varying);assert.equal(await field(shape).inputValue(),'0.7');await f.closeEditor();
      const saved=await f.save(label);await f.newPage();await f.page.setViewportSize(size);await f.openFile(saved.file,3);await f.same(edited);assert.equal(await measure(await f.doc(),label+'-fresh-open',kind,varying,.7),editedSHA);
      await f.openFeatureEditor(2,label+' reopened identity');await identities(kind,varying);assert.equal(await field(shape).inputValue(),'0.7');await f.snapshot(label+'-reopened');await f.closeEditor();
      f.report.observations.push({...size,kind,varying,historyReadOnlyIdentity:true,noDisabledIdentitySelects:true,coefficientOnlyEdit:true,undoRedoSaveFreshOpen:true});
    }
  }
});
