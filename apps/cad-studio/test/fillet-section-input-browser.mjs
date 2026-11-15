import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const pins=['apps/cad-studio/test/fillet-section-input-browser.mjs','apps/cad-studio/src/App.tsx','apps/cad-studio/src/app/featureNumberInput.ts','apps/cad-studio/src/state/useCommandPreview.ts','apps/cad-studio/src/ui/Hud.tsx','packages/barocss-cad-model/src/app/commands.ts','apps/cad-studio/test/flow-helper.mjs','apps/cad-studio/src/ui/NodeEditor.tsx',
  'packages/barocss-cad-model/src/app/editFields.ts','packages/barocss-cad-model/src/engine/part.ts',
  'packages/barocss-cad/src/part/part-finish.ts'];
const f=await createFlow({
  name:'fillet-section-input',envFrozen:'D1410_SOURCE_FROZEN',output:process.argv[2],initialFiles:pins,requiredFrozen:pins,
  qualification:'Align creation and History section shape admission with the native open unit interval; retain numeric section and Radius binding geometry.',
  limits:['Range feedback #121 and numeric-only binding #122. Browser number inputs sanitize some strings; partial/nonfinite raw drafts are covered only by controlled tests. One straight convex R4 box rim, Conic and G2. No general continuity qualification.'],
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
  window.__d1410Hold = { arm() { armed = true; pending = null; deliver = null; }, read: () => pending, release() { deliver(); deliver = null; } };
}

const help='Unitless section shape · greater than 0 and less than 1';
const source={format:'barocss-cad-model',schema:3,units:'mm',parameters:{shapeSetting:.7,filletRadius:4},nodes:[
  {id:'n0',kind:'sketch',profile:'rectangle',min:[0,0],max:[40,30]},{id:'n1',kind:'extrude',sketch:0,height:10}],outputs:{b1:{node:1,side:'solid'}},nextId:2};
const button=(name,scope=f.page)=>scope.getByRole('button',{name,exact:true});
const field=(name,scope=f.editor())=>scope.getByLabel(name,{exact:true});
const status=(scope,text)=>scope.locator('.status').filter({hasText:new RegExp('^'+text+'$')}).waitFor();
async function measure(doc,label,kind){
  const native=await f.inspect(label,doc),bodies=(await f.bodies()).bodies;assert.equal(bodies.length,1);assert.equal(bodies[0].key,native.key);
  await f.runOracle({native,kind,workerVolume:bodies[0].volume},label);f.report.observations.push({label,sha:native.sha,volume:native.volume});return native.sha;
}
async function checkRange(scope,label,key,invalid){
  const input=field(label,scope),id=(await scope.getAttribute('class')).includes('node-editor')?'history-range-'+key:'hud-number-range-'+key;
  // Select through the actual association, rather than infer assistive technology output.
  const described=await input.getAttribute('aria-describedby'); assert.ok(described?.split(' ').includes(id));
  assert.equal(await scope.locator('[id="'+id+'"]').count(),1);
  assert.equal(await scope.locator('[id="'+id+'"]').innerText(),help);
  assert.equal(await scope.getByText(help,{exact:true}).count(),1);
  const validity=await input.evaluate(e=>({valid:e.validity.valid,custom:e.validity.customError,min:e.min,max:e.max,step:e.step}));
  assert.deepEqual(validity,{valid:!invalid,custom:invalid,min:'0',max:'1',step:'any'});
  assert.equal(await input.getAttribute('aria-invalid'),invalid?'true':null);
  assert.equal(await scope.locator('[id="'+id+'"]').getAttribute('role'),invalid?'status':null);
  assert.equal(await input.locator('..').locator('em').count(),0,'Section shape is not a ratio multiplier');
}
async function invalid(scope,label,key,value,before){
  await field(label,scope).fill(value);
  await f.page.waitForFunction(label=>document.querySelector('[aria-label="'+label+'"]')?.getAttribute('aria-invalid')==='true',label);
  await checkRange(scope,label,key,true); assert.ok(await button('Apply',scope).isDisabled());
  await field(label,scope).press('Enter'); await f.same(before);
}
async function pickEdge(){
  await button('Top',f.page.locator('.views')).click();
  if(await button('Ortho').getAttribute('aria-pressed')!=='true')await button('Ortho').click();
  await f.page.getByTitle('Frame all (F)',{exact:true}).click();const filter=button('Selection filter');
  for(let i=0;i<6&&!(await filter.innerText()).includes('Edges');i++)await filter.click();
  assert.match(await filter.innerText(),/Edges/);
  const pixel=await f.page.evaluate(async()=>{
    let previous=null,stable=0;
    for(let frame=0;frame<360;frame++){
      await new Promise(done=>requestAnimationFrame(done));
      const point=window.__studioScreenOf([20,0,10]);
      const hit=point&&document.elementFromPoint(...point)?.matches('canvas.vp-canvas');
      stable=hit&&previous&&Math.hypot(point[0]-previous[0],point[1]-previous[1])<.01?stable+1:0;
      if(stable>=5)return point;
      previous=hit?point:null;
    }
    return null;
  });assert.ok(pixel,'Public edge point must settle for five consecutive animation frames on canvas');
  await f.page.mouse.click(...pixel);await f.page.waitForFunction(()=>window.__studioSelection?.selection.edges.length===1);
}
await f.run(async()=>{
  const origin=new URL(f.server.resolvedUrls.local[0]).origin,newContext=f.browser.newContext.bind(f.browser);
  f.browser.newContext=async options=>{const context=await newContext({...options,serviceWorkers:'block'});await context.addInitScript(holdPreview);
    await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.hostname==='fonts.googleapis.com')return route.fulfill({contentType:'text/css',body:''});return ['http:','https:'].includes(url.protocol)&&url.origin!==origin?route.abort():route.continue();});return context;};
  for(const size of [{width:1024,height:800},{width:1440,height:900}])for(const kind of ['conic','g2']){
    const label=size.width+'-'+kind,key=kind==='conic'?'rho':'tension',shape=kind==='conic'?'Rho':'Tension';
    f.phase=label+' public creation';await f.newPage();await f.page.setViewportSize(size);
    const [chooser]=await Promise.all([f.page.waitForEvent('filechooser'),button('Open').click()]);
    await chooser.setFiles({name:label+'.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(source))});await f.same(source);
    await pickEdge();const picked=await f.page.evaluate(()=>window.__studioSelection.selection);await f.command('Fillet');const hud=f.page.getByRole('dialog',{name:'Fillet',exact:true});
    await field('Radius',hud).fill('4');await field('Section',hud).selectOption(kind);
    for(const value of ['0.005','0.995','0.65']){await field(shape,hud).fill(value);await status(hud,'preview');await checkRange(hud,shape,key,false);await f.same(source);}
    for(const value of ['0','1','','-0.1','1.1']){await invalid(hud,shape,key,value,source);if(value==='0')await f.snapshot(label+'-hud-range');await field(shape,hud).fill('.7');await status(hud,'preview');await f.same(source);}
    assert.deepEqual(await f.page.evaluate(()=>window.__studioSelection.selection),picked,'Invalid numeric editing retains selection');
    for(const queued of [false,true]){
      f.phase=label+(queued?' valid busy Enter then invalid edit':' invalid Enter then correction');
      await f.page.evaluate(()=>window.__d1410Hold.arm());await field(shape,hud).fill('.65');
      await f.page.waitForFunction(()=>window.__d1410Hold.read());
      if(queued)await field(shape,hud).press('Enter');
      await field(shape,hud).fill('0');await checkRange(hud,shape,key,true);
      if(!queued)await field(shape,hud).press('Enter');
      await field(shape,hud).fill('.7');await f.page.evaluate(()=>window.__d1410Hold.release());await status(hud,'preview');await f.same(source);
    }
    await field('Radius',hud).fill('100');await status(hud,'refused');assert.ok(await hud.locator('.hud-error').count());assert.equal(await field(shape,hud).getAttribute('aria-invalid'),null);await f.same(source);await field('Radius',hud).fill('4');await status(hud,'preview');
    // Invalid hidden section state must not gate another section or a circular one.
    await field(shape,hud).fill('0');await field('Section',hud).selectOption(kind==='conic'?'g2':'conic');await status(hud,'preview');assert.equal(await field(shape,hud).count(),0);
    await field('Section',hud).selectOption('circular');await status(hud,'preview');await button('Cancel',hud).click();await f.same(source);
    await f.command('Fillet');await field('Radius',hud).fill('4');await field('Section',hud).selectOption(kind);await field(shape,hud).fill('.995');await status(hud,'preview');
    const selectedBefore=await f.page.evaluate(()=>window.__studioSelection.selection);await button('Apply',hud).click();await f.changed(source);
    const first=await f.doc();assert.deepEqual(first.nodes[2].section,kind==='conic'?{kind,rho:.995}:{kind,tension:.995});assert.deepEqual(first.parameters,source.parameters);
    await f.openFeatureEditor(2,'section range');
    for(const value of ['0','1','','-.1','1.1']){await invalid(f.editor(),shape,key,value,first);if(value==='1')await f.snapshot(label+'-history-range');await button('Reset',f.editor()).click();assert.equal(await field(shape).inputValue(),'0.995');}
    await checkRange(f.editor(),shape,key,false);assert.equal(await field(shape).inputValue(),'0.995');assert.equal(await button('Apply',f.editor()).isDisabled(),true,'Reset leaves a valid unchanged section without a pending edit');await f.same(first);
    for(const value of ['0.005','0.65']){await field(shape).fill(value);await checkRange(f.editor(),shape,key,false);assert.equal(await button('Apply',f.editor()).isDisabled(),false);await f.same(first);}
    await f.applyEditor(first,label+'-history-065');const corrected=await f.doc();assert.deepEqual(corrected.nodes[2].section,kind==='conic'?{kind,rho:.65}:{kind,tension:.65});const ownerSave=await f.save(label+'-owner');
    await f.openFeatureEditor(2,'shape owner');await invalid(f.editor(),shape,key,'0',corrected);await f.closeEditor();await f.openFeatureEditor(1,'feature owner');assert.equal(await field(shape).count(),0);await f.closeEditor();await f.openFeatureEditor(2,'clean owner');assert.equal(await field(shape).inputValue(),'0.65');
    await invalid(f.editor(),shape,key,'0',corrected);
    const [sameChooser]=await Promise.all([f.page.waitForEvent('filechooser'),button('Open').click()]);await sameChooser.setFiles(ownerSave.file);
    const discard=f.page.getByRole('dialog',{name:'Discard feature changes?',exact:true});await discard.waitFor();await button('Discard changes',discard).click();await f.editor().waitFor({state:'hidden'});await f.same(corrected);
    await f.openFeatureEditor(2,'document owner');assert.equal(await field(shape).inputValue(),'0.65');await field(shape).fill('.7');assert.equal(await field(shape+' parameter').count(),0);await f.applyEditor(corrected,label+'-numeric07');
    const numeric=await f.doc(),native=await measure(numeric,label+'-numeric07',kind);
    await f.openFeatureEditor(2,'Radius binding');assert.equal(await field(shape+' parameter').count(),0);await field('Radius parameter').selectOption('filletRadius');await f.applyEditor(numeric,label+'-bound');const bound=await f.doc();
    assert.deepEqual(bound.nodes[2],{...numeric.nodes[2],radius:{parameter:'filletRadius'}});assert.equal(await measure(bound,label+'-bound',kind),native);
    await f.undo();await f.same(numeric);await f.redo();await f.same(bound);
    const saved=await f.save(label+'-section');await f.newPage();await f.page.setViewportSize(size);await f.openFile(saved.file,3);await f.same(bound);assert.equal(await measure(await f.doc(),label+'-fresh-reopened',kind),native);
    await f.openFeatureEditor(2,'saved controls');assert.equal(await field(shape).inputValue(),'0.7');assert.equal(await field(shape+' parameter').count(),0);assert.equal(await field('Radius parameter').inputValue(),'filletRadius');assert.equal(await field('Radius').isDisabled(),true);await f.snapshot(label+'-reopened');await f.closeEditor();
    f.report.observations.push({...size,kind,selectedBefore,localRange:true,invalidApplyEnterBlocked:true,queueCorrectionNoCommit:true,resetOwnership:true,sectionBindingAbsent:true,radiusBindingNativeEquivalent:true,undoRedoSaveFreshOpen:true});
  }
});
