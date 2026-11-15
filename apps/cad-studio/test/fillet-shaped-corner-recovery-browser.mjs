import assert from 'node:assert/strict';
import { relative, resolve } from 'node:path';
import { createFlow } from './flow-helper.mjs';

const output=process.argv[2];
assert.ok(output&&relative(resolve(import.meta.dirname,'../../..'),resolve(output)).startsWith('../'));
const pins=['apps/cad-studio/test/fillet-shaped-corner-recovery-browser.mjs','apps/cad-studio/test/flow-helper.mjs',
  'apps/cad-studio/src/app/failedFeature.ts','apps/cad-studio/src/ui/Hud.tsx','apps/cad-studio/src/ui/FeatureFailureNotice.tsx',
  'apps/cad-studio/src/state/useCommandPreview.ts','apps/cad-studio/src/ui/FilletTypeFields.tsx','apps/cad-studio/src/app/filletFamily.ts',
  'packages/barocss-cad-model/src/app/commands.ts','packages/barocss-cad-model/src/engine/part.ts',
  'packages/barocss-cad/src/part/part-finish.ts','packages/barocss-cad/src/blend/rolling-ball.ts','packages/barocss-cad/src/brep/brep-tessellate.ts'];
const f=await createFlow({name:'fillet-shaped-corner-recovery',envFrozen:'D1414_SOURCE_FROZEN',output,initialFiles:pins,requiredFrozen:pins,
  qualification:'Explain actual shaped-section corner refusals locally and recover by explicitly choosing Circular on the same boss-foot edges.',
  limits:['One centered 20×12×15 mm boss on a 60×60×10 mm plate, R1 on its four foot edges only. No general corner, tangent-chain or continuity qualification.','Numeric geometry PASS is separate from rendering color and assistive technology. Root must review desktop screenshots.','Surface samples are only native tessellated trimmed blend-face vertices, not triangle barycenters or mesh volume. Tessellation failure is a test failure.'],
  inspectorSource:`
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {partBreps} from '@barocss/cad-model/engine/evaluate';
import {digestOf} from '@barocss/cad-model/util/digest';
import {checkBrep,brepMassProperties,tessellateBrep} from '@barocss/cad';
const doc=JSON.parse(readFileSync(process.argv[2],'utf8')),[{key,brep}]=partBreps(doc),feature=doc.nodes.at(-1);
const mesh=tessellateBrep(brep,{segmentsPerQuarter:32});
assert.ok(mesh.positions instanceof Float64Array,'Native sample precision must be Float64');
const blendIds=new Set(brep.faces.filter(face=>face.name?.startsWith(feature.id+'.face')).map(face=>face.id));
assert.ok(blendIds.size>0,'Missing native blend faces');
const faces=mesh.faces.filter(face=>blendIds.has(face.faceId)).map(face=>{
  const points=[];
  for(let i=face.vertexOffset;i<face.vertexOffset+face.vertexCount;i++)points.push(Array.from(mesh.positions.slice(3*i,3*i+3)));
  assert.ok(points.length>0);assert.ok(points.every(point=>point.every(Number.isFinite)));
  return {id:face.faceId,kind:face.kind,points};
});
assert.equal(new Set(faces.map(face=>face.id)).size,blendIds.size,'Every blend face must be tessellated');
console.log(JSON.stringify({key,sha:digestOf(brep),check:checkBrep(brep,{strict:true}),volume:brepMassProperties(brep,1).volume,faces}));
`,
  oracleSource:`
import json,math,sys
d=json.load(sys.stdin);n=d['native']
assert n['check']['valid'],n['check']
assert n['check']['counts']['bodies']==1 and n['check']['counts']['shells']==1
# At z=10+u, the added rounded-rectangle offset is d=1-sqrt(1-(1-u)^2).
# Integrating added area 64*d+pi*d^2 over 0<=u<=1 gives this exact expression.
expected=39600+64*(1-math.pi/4)+math.pi*(5/3-math.pi/2)
assert abs(expected-39614.035703098)<5e-10
assert abs(n['volume']-expected)<=5e-6,(n['volume'],expected)
assert abs(d['workerVolume']-expected)<=5e-6,(d['workerVolume'],expected)
regions={name:0 for name in ['side-x+','side-x-','side-y+','side-y-','corner++','corner+-','corner-+','corner--']}
bands=[0,0,0];region_bands={name:[0,0,0] for name in regions};gap=0;total=0
assert n['faces']
for face in n['faces']:
    assert face['points']
    for x,y,z in face['points']:
        assert all(math.isfinite(v) for v in [x,y,z])
        dx=max(abs(x)-10,0);dy=max(abs(y)-6,0);offset=math.hypot(dx,dy)
        assert 10-2e-6<=z<=11+2e-6 and -2e-6<=offset<=1+2e-6,(x,y,z,offset)
        residual=abs(math.hypot(offset-1,z-11)-1);gap=max(gap,residual);total+=1
        assert residual<=2e-6,(x,y,z,residual)
        u=z-10
        if not (.05<u<.95 and 1e-7<offset<1-1e-7):continue
        if dx>1e-7 and dy>1e-7:region='corner'+('+' if x>0 else '-')+('+' if y>0 else '-')
        elif dx>1e-7:region='side-x'+('+' if x>0 else '-')
        elif dy>1e-7:region='side-y'+('+' if y>0 else '-')
        else:continue
        band=0 if u<.35 else 1 if u<.7 else 2
        regions[region]+=1;bands[band]+=1;region_bands[region][band]+=1
assert all(count>0 for count in regions.values()),regions
assert all(count>0 for count in bands),bands
print(json.dumps({'status':'PASS','expectedVolumeMM3':expected,'nativeVolumeMM3':n['volume'],'workerVolumeMM3':d['workerVolume'],'volumeToleranceMM3':5e-6,'maximumImplicitResidualMM':gap,'sampleToleranceMM':2e-6,'nativeTrimmedVertexCount':total,'interiorRegions':regions,'interiorZBands':bands,'regionZBands':region_bands,'oracle':'independent rounded-offset area integral and implicit circular boss-foot surface'}))
`,
});
const seed={format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nextId:5,outputs:{b4:{node:4,side:'solid'}},nodes:[
  {id:'n0',kind:'sketch',profile:'rectangle',min:[-30,-30],max:[30,30]},{id:'n1',kind:'extrude',sketch:0,height:10},
  {id:'n2',kind:'sketch',profile:'rectangle',min:[-10,-6],max:[10,6]},{id:'n3',kind:'extrude',sketch:2,height:15,from:10},
  {id:'n4',kind:'union',left:{node:1,side:'solid'},right:{node:3,side:'solid'}}]};
const button=(name,scope=f.page)=>scope.getByRole('button',{name,exact:true});
const hud=()=>f.page.getByRole('dialog',{name:'Fillet',exact:true});
const field=name=>hud().getByLabel(name,{exact:true});
const status=text=>hud().locator('.status').filter({hasText:new RegExp('^'+text+'$')}).waitFor({timeout:60000});
const recoveryId='hud-fillet-section-recovery';
const title='This section cannot turn this corner',hint='Try Circular with the same picked edges.';
// Observe actual request nodes and original replies; optionally delay only delivery
// to the app. No worker result or native geometry is replaced or synthesized.
function observePreview(){
  const proto=Worker.prototype,post=proto.postMessage,handler=Object.getOwnPropertyDescriptor(proto,'onmessage');
  const tables=new WeakMap(),requests=new WeakMap(),records=[];
  let armed=false,target=null,pending=null,deliver=null;
  proto.postMessage=function(request,...rest){
    let table=tables.get(this);if(!table){table=new Map();tables.set(this,table);}
    if(request.doc?.added)for(const [id,node] of request.doc.added)table.set(id,structuredClone(node));
    if(request.type==='preview'){
      let work=requests.get(this);if(!work){work=new Map();requests.set(this,work);}
      const nodes=request.doc?.ids?.map(id=>table.get(id));
      const row={id:request.id,revision:request.revision,feature:structuredClone(nodes?.at(-1))};work.set(request.id,row);
      if(armed){armed=false;target={worker:this,id:request.id};}
    }
    return Reflect.apply(post,this,[request,...rest]);
  };
  Object.defineProperty(proto,'onmessage',{configurable:true,get:handler.get,set(callback){
    handler.set.call(this,callback&&function(event){
      const request=requests.get(this)?.get(event.data?.id);
      if(request&&event.data.result){
        const row={...request,ok:event.data.result.ok,error:structuredClone(event.data.result.error)};records.push(row);
        if(target?.worker===this&&target.id===event.data.id){pending=row;deliver=()=>callback.call(this,event);target=null;return;}
      }
      callback.call(this,event);
    });
  }});
  window.__d1414={records,arm(){armed=true;target=null;pending=null;deliver=null;},read:()=>pending,release(){if(!deliver)throw Error('No actual reply is held');const reply=deliver;deliver=null;reply();}};
}
async function frames(){await f.page.evaluate(async()=>{for(let i=0;i<5;i++)await new Promise(done=>requestAnimationFrame(done));});}
async function pick(point,shift){
  const pixel=await f.page.evaluate(async point=>{let previous=null,stable=0;for(let frame=0;frame<360;frame++){
    await new Promise(done=>requestAnimationFrame(done));const p=window.__studioScreenOf(point),hit=p&&document.elementFromPoint(...p)?.matches('canvas.vp-canvas');
    stable=hit&&previous&&Math.hypot(p[0]-previous[0],p[1]-previous[1])<.01?stable+1:0;if(stable>=5)return p;previous=hit?p:null;}return null;},point);
  assert.ok(pixel,'Picked foot-edge point must settle on canvas for five frames');if(shift)await f.page.keyboard.down('Shift');
  try{await f.page.mouse.click(...pixel);}finally{if(shift)await f.page.keyboard.up('Shift');}
}
async function setup(size,label){
  await f.newPage();await f.page.setViewportSize(size);const [chooser]=await Promise.all([f.page.waitForEvent('filechooser'),button('Open').click()]);
  await chooser.setFiles({name:label+'.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(seed))});await f.same(seed);
  await button('Iso',f.page.locator('.views')).click();if(await button('Ortho').getAttribute('aria-pressed')!=='true')await button('Ortho').click();
  const display=f.page.getByLabel('CAD display mode',{exact:true});if(!(await display.isVisible()))await button('Display and previews').click();await display.selectOption({label:'Wireframe'});assert.equal(await display.getAttribute('data-display-mode-supported'),'true');await button('Display and previews').click();
  await f.page.getByTitle('Frame all (F)',{exact:true}).click();const filter=button('Selection filter');for(let i=0;i<6&&!(await filter.innerText()).includes('Edges');i++)await filter.click();assert.match(await filter.innerText(),/Edges/);
  for(const [i,point] of [[0,[0,-6,10]],[1,[10,0,10]],[2,[0,6,10]],[3,[-10,0,10]]]){await pick(point,i>0);await f.page.waitForFunction(count=>window.__studioSelection?.selection.edges.length===count,i+1);}
  const selection=await f.page.evaluate(()=>window.__studioSelection.selection);await f.command('Fillet');await field('Radius').fill('1');await field('Section').selectOption('circular');await status('preview');return selection;
}
async function unchanged(selection){await f.same(seed);assert.deepEqual(await f.page.evaluate(()=>window.__studioSelection.selection),selection);assert.equal(await field('Radius').inputValue(),'1');}
async function refused(kind,selection,label){
  await field('Section').selectOption(kind);await field(kind==='conic'?'Rho':'Tension').fill('.5');await status('refused');await unchanged(selection);
  assert.equal(await field('Section').inputValue(),kind,'No automatic section switch');assert.equal(await field('Section').getAttribute('aria-invalid'),'true');assert.equal(await field('Section').getAttribute('aria-describedby'),recoveryId);
  const notice=hud().locator('#'+recoveryId);assert.equal(await notice.count(),1);assert.equal(await hud().locator('.hud-error[role="status"]').count(),1);
  assert.equal(await notice.getByText(title,{exact:true}).count(),1);assert.equal(await notice.getByText(hint,{exact:true}).count(),1);
  const raw=await f.page.evaluate(kind=>window.__d1414.records.filter(row=>row.feature?.section?.kind===kind&&row.error).at(-1),kind);
  assert.ok(raw);assert.equal(raw.error.code,'CAPABILITY');assert.equal(raw.error.feature,'n5');assert.equal(raw.feature.id,'n5');assert.equal(raw.feature.radius,1);assert.equal(raw.feature.edges.length,4);
  assert.match(raw.error.detail,new RegExp('^edge .+: a '+(kind==='conic'?'conic':'G2')+' fillet where the ball rolls round an edge at a corner is not supported yet$'));
  const edge=raw.error.detail.slice(5,raw.error.detail.indexOf(': a '));assert.ok(raw.feature.edges.includes(edge));
  await notice.getByText('Kernel detail',{exact:true}).click();assert.equal(await notice.locator('code').innerText(),raw.error.detail);assert.ok(await button('Apply',hud()).isDisabled());await field('Radius').press('Enter');await unchanged(selection);
  f.report.observations.push({label,actualWorkerRefusal:raw,localSectionNotice:true,unchangedSelection:selection});await f.snapshot(label);
}
async function circular(selection){await field('Section').selectOption('circular');await status('preview');assert.equal(await hud().locator('#'+recoveryId).count(),0);assert.equal(await field('Section').getAttribute('aria-invalid'),null);assert.equal(await field('Section').getAttribute('aria-describedby'),null);await unchanged(selection);}
async function measure(doc,label){await f.ready();const native=await f.inspect(label,doc),bodies=(await f.bodies()).bodies;assert.equal(bodies.length,1);assert.equal(bodies[0].key,native.key);await f.runOracle({native,workerVolume:bodies[0].volume},label);f.report.observations.push({label,sha:native.sha,volume:native.volume});return native.sha;}
await f.run(async()=>{
  const origin=new URL(f.server.resolvedUrls.local[0]).origin,newContext=f.browser.newContext.bind(f.browser);
  f.browser.newContext=async options=>{const context=await newContext({...options,serviceWorkers:'block'});await context.addInitScript(observePreview);await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.hostname==='fonts.googleapis.com')return route.fulfill({contentType:'text/css',body:''});return ['http:','https:'].includes(url.protocol)&&url.origin!==origin?route.abort():route.continue();});return context;};
  for(const size of [{width:1024,height:800},{width:1440,height:900}]){
    const label=String(size.width),selection=await setup(size,label);await refused('conic',selection,label+'-conic-refusal');await refused('g2',selection,label+'-g2-refusal');await circular(selection);
    f.phase=label+' actual delayed shaped refusal after section switch';await f.page.evaluate(()=>window.__d1414.arm());await field('Section').selectOption('conic');await f.page.waitForFunction(()=>window.__d1414.read()?.error);const switchReply=await f.page.evaluate(()=>window.__d1414.read());assert.equal(switchReply.error.code,'CAPABILITY');await field('Section').selectOption('circular');await unchanged(selection);assert.equal(await field('Section').inputValue(),'circular');await f.page.evaluate(()=>window.__d1414.release());await frames();await status('preview');await unchanged(selection);assert.equal(await hud().locator('#'+recoveryId).count(),0);assert.equal(await field('Section').getAttribute('aria-invalid'),null);
    f.phase=label+' actual delayed shaped refusal after Cancel';await f.page.evaluate(()=>window.__d1414.arm());await field('Section').selectOption('g2');await f.page.waitForFunction(()=>window.__d1414.read()?.error);const cancelReply=await f.page.evaluate(()=>window.__d1414.read());assert.equal(cancelReply.error.code,'CAPABILITY');await button('Cancel',hud()).click();await f.page.evaluate(()=>window.__d1414.release());await frames();assert.equal(await hud().count(),0);assert.equal(await f.page.locator('#'+recoveryId).count(),0);await f.same(seed);assert.deepEqual(await f.page.evaluate(()=>window.__studioSelection.selection),selection);
    await f.command('Fillet');await field('Radius').fill('1');await circular(selection);await f.snapshot(label+'-circular-recovered');
    const original=await f.page.evaluate(()=>window.__d1414.records.find(row=>row.feature?.section?.kind==='conic'&&row.error).feature);
    await button('Apply',hud()).click();await f.changed(seed);const applied=await f.doc();const {section: ignoredSection,...withoutSection}=original;assert.ok(ignoredSection);const {sigs,...committed}=applied.nodes[5];assert.deepEqual(applied.nodes.slice(0,5),seed.nodes);assert.deepEqual(committed,withoutSection,'Circular keeps feature, parent, picked edges and R1; Apply adds reference signatures');
    assert.deepEqual(Object.keys(sigs).sort(),original.edges.slice().sort());
    const signatureSites=[[0,-6,10],[10,0,10],[0,6,10],[-10,0,10]];
    for(let i=0;i<4;i++){const sig=sigs['n1.top|n3.side'+i];assert.equal(sig.k,'line');assert.deepEqual(sig.p,signatureSites[i]);assert.equal(sig.s,i%2?12:20);assert.equal(Math.abs(sig.d[i%2]),1);assert.equal(sig.d[1-i%2],0);assert.equal(sig.d[2],0);}assert.deepEqual(applied.parameters,seed.parameters);assert.equal(applied.nextId,6);assert.deepEqual(applied.outputs,{b5:{node:5,side:'solid'}});
    const expectedNames=Array.from({length:4},(_,i)=>['n1.top','n3.side'+i].sort().join('|')).sort();assert.deepEqual(applied.nodes[5].edges.map(name=>name.split('|').sort().join('|')).sort(),expectedNames);
    const sha=await measure(applied,label+'-circular-applied');await f.undo();await f.same(seed);await f.redo();await f.same(applied);assert.equal(await measure(applied,label+'-circular-redo'),sha);
    const saved=await f.save(label+'-corner-recovery');await f.newPage();await f.page.setViewportSize(size);await f.openFile(saved.file,6);await f.same(applied);assert.equal(await measure(applied,label+'-fresh-open'),sha);await f.snapshot(label+'-fresh-open');
    f.report.observations.push({...size,actualConicG2Refusals:true,explicitCircularRecovery:true,lateReplySectionSwitchSafe:true,lateReplyCancelSafe:true,undoRedoSaveFreshOpen:true});
  }
});
