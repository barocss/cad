import assert from 'node:assert/strict';
import {relative,resolve} from 'node:path';
import {createFlow} from './flow-helper.mjs';
const output=process.argv[2];assert.ok(output&&relative(resolve(import.meta.dirname,'../../..'),resolve(output)).startsWith('../'));
const pins=['apps/cad-studio/test/shell-shaped-fillet-opening-recovery-browser.mjs','apps/cad-studio/test/flow-helper.mjs',
  'apps/cad-studio/src/state/openingShellFailure.ts','apps/cad-studio/src/state/useCommandPreview.ts','apps/cad-studio/src/ui/Hud.tsx',
  'apps/cad-studio/src/ui/FeatureFailureNotice.tsx','apps/cad-studio/src/ui/NodeEditor.tsx','packages/barocss-cad-model/src/app/commands.ts',
  'packages/barocss-cad-model/src/engine/errors.ts','packages/barocss-cad-model/src/engine/part.ts',
  'packages/barocss-cad/src/part/part-shell.ts','packages/barocss-cad/src/blend/general-shell.ts'];
const f=await createFlow({name:'shell-shaped-fillet-opening-recovery',envFrozen:'D1415_SOURCE_FROZEN',output,initialFiles:pins,requiredFrozen:pins,
  qualification:'Explain the selected temporary Shell opening limit, then explicitly Cancel before choosing a bottom opening or a closed Shell.',
  limits:['Desktop 1024×800 and 1440×900; one synthetic 40×30×20 mm Box with one R4 Conic rho0.5 front-top edge only. No general Shell, guided geometry or legacy qualification.','The independent bounded cross-section formulas use the authored quadratic conic, not native boundary measurements. Wall1.5 and2 only, below its minimum curvature radius4/sqrt2.','Numeric geometry PASS is separate from rendering color and assistive technology. Root must review screenshots.'],
  inspectorSource:`
import {readFileSync} from 'node:fs';
import {partBreps} from '@barocss/cad-model/engine/evaluate';
import {digestOf} from '@barocss/cad-model/util/digest';
import {checkBrep,brepMassProperties} from '@barocss/cad';
const doc=JSON.parse(readFileSync(process.argv[2],'utf8'));
console.log(JSON.stringify(partBreps(doc).map(({key,brep})=>({key,sha:digestOf(brep),check:checkBrep(brep,{strict:true}),volume:brepMassProperties(brep,1).volume,shells:brep.shells.map(shell=>({closed:shell.closed})),faces:brep.faces.map(face=>({name:face.name,loops:face.loops.map(id=>brep.loops.find(loop=>loop.id===id)?.kind)}))}))));
`,
  oracleSource:`
import json,math,sys
d=json.load(sys.stdin);n=d['native'];t=d['wall'];mode=d['mode']
assert mode in ['source','open','closed']
assert n['check']['valid'],n['check']
assert n['check']['counts']['bodies']==1
assert n['check']['counts']['shells']==(2 if mode=='closed' else 1)
assert all(shell['closed'] for shell in n['shells'])
# rho=.5 means weight1, the quadratic contact arc has derivative8*(u,1-u).
# Its removed corner area is R²/6; its length is4+2*sqrt(2)*asinh(1).
# These constants are derived from the authored R4 quadratic, not a native curve.
A=600-16/6;arc=4+2*math.sqrt(2)*math.asinh(1);P=100-8+arc;stock=40*A
assert t in [0,1.5,2]
if mode=='source':
    assert t==0;expected=stock
else:
    assert t in [1.5,2] and t<4/math.sqrt(2)
    # Bounded inward-offset area: closed has three kept right-angle corners;
    # bottom opening removes the bottom contribution (length30, two corners).
    inner=A-P*t+(3+math.pi/4)*t*t if mode=='closed' else A-(P-30)*t+(1+math.pi/4)*t*t
    expected=stock-(40-2*t)*inner
assert math.isfinite(n['volume']) and math.isfinite(d['workerVolume'])
# Match the existing bounded conic-Shell native quadrature qualification: 1e-7 relative.
assert abs(n['volume']/expected-1)<1e-7,(n['volume'],expected)
assert abs(d['workerVolume']/expected-1)<1e-7,(d['workerVolume'],expected)
print(json.dumps({'status':'PASS','mode':mode,'wallMM':t,'sectionAreaMM2':A,'authoredArcLengthMM':arc,'sectionPerimeterMM':P,'stockVolumeMM3':stock,'expectedVolumeMM3':expected,'nativeVolumeMM3':n['volume'],'workerVolumeMM3':d['workerVolume'],'relativeVolumeTolerance':1e-7,'nativeShellCount':n['check']['counts']['shells'],'oracle':'independent authored quadratic area/arclength and bounded inward-offset section integral'}))
`,
});
const source={format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nextId:3,outputs:{b2:{node:2,side:'solid'}},nodes:[
  {id:'n0',kind:'sketch',profile:'rectangle',min:[0,0],max:[40,30]},{id:'n1',kind:'extrude',sketch:0,height:20},
  {id:'n2',kind:'fillet',parent:{node:1,side:'solid'},edges:['n1.side0|n1.top'],radius:4,section:{kind:'conic',rho:.5}}]};
const button=(name,scope=f.page)=>scope.getByRole('button',{name,exact:true});
const hud=()=>f.page.getByRole('dialog',{name:'Shell',exact:true});
const wall=()=>hud().getByLabel('Wall',{exact:true});
const status=text=>hud().locator('.status').filter({hasText:new RegExp('^'+text+'$')}).waitFor({timeout:60000});
const title='This opening reaches a Shell limit',hint='Cancel Shell, then select another face to open or select the body to try a closed Shell.';
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
  window.__d1415={records,arm(){armed=true;target=null;pending=null;deliver=null;},read:()=>pending,release(){if(!deliver)throw Error('No actual reply is held');const reply=deliver;deliver=null;reply();}};
}
async function frames(){await f.page.evaluate(async()=>{for(let i=0;i<5;i++)await new Promise(done=>requestAnimationFrame(done));});}
async function view(name){
  const direct=button(name,f.page.locator('.views'));
  if(await direct.count())await direct.click();
  else{await button('View cube directions',f.page.getByRole('group',{name:'View cube',exact:true})).click();await f.page.getByRole('menuitem',{name,exact:true}).click();}
  if(await button('Ortho').getAttribute('aria-pressed')!=='true')await button('Ortho').click();await f.page.getByTitle('Frame all (F)',{exact:true}).click();
}
async function filter(name){const control=button('Selection filter');for(let i=0;i<6&&!(await control.innerText()).includes(name);i++)await control.click();assert.ok((await control.innerText()).includes(name));}
async function pick(point){
  const pixel=await f.page.evaluate(async point=>{let previous=null,stable=0;for(let frame=0;frame<360;frame++){
    await new Promise(done=>requestAnimationFrame(done));const p=window.__studioScreenOf(point),hit=p&&document.elementFromPoint(...p)?.matches('canvas.vp-canvas');stable=hit&&previous&&Math.hypot(p[0]-previous[0],p[1]-previous[1])<.01?stable+1:0;if(stable>=5)return p;previous=hit?p:null;}return null;},point);
  assert.ok(pixel,'Public face point must settle on canvas for five frames');await f.page.mouse.click(...pixel);
}
const selection=()=>f.page.evaluate(()=>window.__studioSelection.selection);
async function openSource(size,label){await f.newPage();await f.page.setViewportSize(size);const [chooser]=await Promise.all([f.page.waitForEvent('filechooser'),button('Open').click()]);await chooser.setFiles({name:label+'.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(source))});await f.same(source);}
async function unchanged(picks){await f.same(source);assert.deepEqual(await selection(),picks);assert.equal(await wall().inputValue(),'2');assert.equal(await wall().getAttribute('aria-invalid'),null);}
async function refusal(picks,label){
  await status('refused');await unchanged(picks);const notice=hud().locator('.hud-error[role="status"]');assert.equal(await notice.count(),1);assert.equal(await notice.getByText(title,{exact:true}).count(),1);assert.equal(await notice.getByText(hint,{exact:true}).count(),1);
  const raw=await f.page.evaluate(()=>window.__d1415.records.filter(row=>row.error?.code==='SHELL_REGIONS_SHARP').at(-1));assert.ok(raw);assert.equal(raw.error.feature,'n3');assert.equal(raw.feature.kind,'shell');assert.equal(raw.feature.id,'n3');assert.deepEqual(raw.feature.parent,{node:2,side:'solid'});assert.deepEqual(raw.feature.open,['n1.top']);assert.equal(raw.feature.thickness,2);assert.match(raw.error.detail,/n1\.top\.ext\.side\d+/);
  const details=notice.locator('details');assert.equal(await details.getAttribute('open'),null);await details.getByText('Kernel detail',{exact:true}).click();assert.equal(await notice.locator('code').innerText(),raw.error.detail);await details.getByText('Kernel detail',{exact:true}).click();
  assert.ok(await button('Apply',hud()).isDisabled());await wall().press('Enter');await unchanged(picks);await f.snapshot(label);f.report.observations.push({label,actualWorkerRefusal:raw,originalDetailPreserved:true,cancelFirstGuidance:true,wallNotInvalid:true});
}
function withoutSigs(node){const {sigs,...rest}=node;return {sigs,rest};}
function validateSigs(doc,before,open){
  for(let i=0;i<doc.nodes.length;i++){
    const a=withoutSigs(doc.nodes[i]),b=withoutSigs(before.nodes[i]);assert.deepEqual(a.rest,b.rest,'All authored payload except newly captured reference signatures is exact');
    if(b.sigs)assert.deepEqual(a.sigs,b.sigs);
    else if(a.sigs){const names=i===2?source.nodes[2].edges:i===3?open:[];assert.deepEqual(Object.keys(a.sigs).sort(),[...names].sort());for(const sig of Object.values(a.sigs)){assert.equal(typeof sig.k,'string');assert.equal(sig.p.length,3);assert.ok(sig.p.every(Number.isFinite));assert.ok(Number.isFinite(sig.s)&&sig.s>0);if(sig.d)assert.ok(sig.d.length===3&&sig.d.every(Number.isFinite));}}
  }
  if(open.length){const sig=doc.nodes[3].sigs?.[open[0]];assert.ok(sig,'Picked opening retains its captured reference signature');assert.equal(sig.k,'plane');assert.ok(Math.abs(sig.p[2])<1e-7);assert.ok(Math.abs(sig.s-1200)<1e-7);}
}
async function applyShell(open,_label){
  const candidate=await f.page.evaluate(()=>window.__d1415.records.filter(row=>row.ok&&row.feature?.kind==='shell').at(-1)?.feature);assert.ok(candidate);assert.deepEqual(candidate,{kind:'shell',parent:{node:2,side:'solid'},thickness:2,open,id:'n3'});
  await button('Apply',hud()).click();await f.changed(source);const doc=await f.doc();validateSigs(doc,{...source,nodes:[...source.nodes,candidate]},open);assert.deepEqual(doc.parameters,source.parameters);assert.equal(doc.nextId,4);assert.deepEqual(doc.outputs,{b3:{node:3,side:'solid'}});return doc;
}
async function measure(doc,label,mode,t){await f.same(doc);const native=await f.inspect(label,doc),bodies=(await f.bodies()).bodies;assert.equal(native.length,1);assert.equal(bodies.length,1);assert.equal(bodies[0].key,native[0].key);await f.runOracle({native:native[0],workerVolume:bodies[0].volume,mode,wall:t},label);f.report.observations.push({label,sha:native[0].sha,volume:native[0].volume});return native[0].sha;}
async function roundtrip(doc,label,mode,t,size){const sha=await measure(doc,label+'-applied',mode,t);await f.undo();await f.same(source);await f.redo();await f.same(doc);assert.equal(await measure(doc,label+'-redo',mode,t),sha);const saved=await f.save(label);await f.newPage();await f.page.setViewportSize(size);await f.openFile(saved.file,4);await f.same(doc);assert.equal(await measure(doc,label+'-fresh-open',mode,t),sha);await f.snapshot(label+'-fresh-open');return saved;}
await f.run(async()=>{
  const origin=new URL(f.server.resolvedUrls.local[0]).origin,newContext=f.browser.newContext.bind(f.browser);f.browser.newContext=async options=>{const context=await newContext({...options,serviceWorkers:'block'});await context.addInitScript(observePreview);await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.hostname==='fonts.googleapis.com')return route.fulfill({contentType:'text/css',body:''});return ['http:','https:'].includes(url.protocol)&&url.origin!==origin?route.abort():route.continue();});return context;};
  for(const size of [{width:1024,height:800},{width:1440,height:900}]){
    const label=String(size.width);await openSource(size,label+'-source');await measure(source,label+'-source', 'source',0);await view('Top');await filter('Faces');await pick([20,15,20]);await f.page.waitForFunction(()=>window.__studioSelection.selection.faces.length===1);const top=await selection();await f.command('Shell');await wall().fill('2');await refusal(top,label+'-top-opening-refused');
    await view('Bottom');await pick([10,15,0]);await frames();await unchanged(top);await status('refused');assert.equal(await hud().getByText(title,{exact:true}).count(),1);await f.snapshot(label+'-active-bottom-click-keeps-top');await button('Cancel',hud()).click();await f.same(source);
    // Delay a real top-opening failure, retire its owner, then start a bottom owner.
    await f.page.evaluate(()=>window.__d1415.arm());await f.command('Shell');await f.page.waitForFunction(()=>window.__d1415.read()?.error);const held=await f.page.evaluate(()=>window.__d1415.read());assert.equal(held.error.code,'SHELL_REGIONS_SHARP');assert.deepEqual(held.feature.open,['n1.top']);await button('Cancel',hud()).click();
    await pick([10,15,0]);await f.page.waitForFunction(old=>JSON.stringify(window.__studioSelection.selection)!==old,JSON.stringify(top));const bottom=await selection();assert.equal(bottom.faces.length,1);await f.command('Shell');await wall().fill('2');await f.page.evaluate(()=>window.__d1415.release());await status('preview');await unchanged(bottom);assert.equal(await hud().getByText(title,{exact:true}).count(),0);assert.equal(await hud().locator('.hud-error[role="status"]').count(),0);await f.snapshot(label+'-cancel-bottom-new-owner');
    const opened=await applyShell(['n1.bottom'],label+'-bottom');const openedSHA=await measure(opened,label+'-bottom-applied','open',2);await f.undo();await f.same(source);await f.redo();await f.same(opened);assert.equal(await measure(opened,label+'-bottom-redo','open',2),openedSHA);const openedSave=await f.save(label+'-bottom-wall2');
    await f.openFeatureEditor(3,'bottom Shell Wall1.5');assert.equal(await f.editor().getByLabel('Wall',{exact:true}).inputValue(),'2');await f.editor().getByLabel('Wall',{exact:true}).fill('1.5');await f.applyEditor(opened,label+'-bottom-wall15');const edited=await f.doc();assert.deepEqual(edited,{...opened,nodes:opened.nodes.map((node,i)=>i===3?{...node,thickness:1.5}:node)});const editedSHA=await measure(edited,label+'-bottom-wall15','open',1.5);await f.undo();await f.same(opened);await f.redo();await f.same(edited);const editedSave=await f.save(label+'-bottom-wall15');
    for(const [saved,doc,t,sha] of [[openedSave,opened,2,openedSHA],[editedSave,edited,1.5,editedSHA]]){await f.newPage();await f.page.setViewportSize(size);await f.openFile(saved.file,4);await f.same(doc);assert.equal(await measure(doc,label+'-bottom-fresh-'+t,'open',t),sha);await f.snapshot(label+'-bottom-fresh-'+t);}
    await openSource(size,label+'-closed-source');await filter('Bodies');const body=f.page.getByRole('complementary',{name:'Browser',exact:true}).locator('.ol-row > button.ol[title="Double-click to rename"]');assert.equal(await body.count(),1);await body.click();await f.page.waitForFunction(()=>window.__studioSelection.selection.bodies.length===1&&window.__studioSelection.selection.faces.length===0);const closedPicks=await selection();await button('Modify').click();await f.page.getByRole('group',{name:'Modify',exact:true}).getByRole('button',{name:'Shell',exact:true}).click();await wall().fill('2');await status('preview');await unchanged(closedPicks);assert.equal(await hud().getByText(title,{exact:true}).count(),0);const closed=await applyShell([],label+'-closed');await roundtrip(closed,label+'-closed','closed',2,size);
    f.report.observations.push({...size,actualTemporaryOpeningRefusal:true,cancelFirstVerified:true,activeBottomClickKeepsTop:true,lateTopReplyCannotAffectNewBottomOwner:true,bottomWall2AndHistory15:true,closedShellSeparateControl:true,undoRedoSaveFreshOpen:true});
  }
});
