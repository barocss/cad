import assert from 'node:assert/strict';
import {createFlow} from './flow-helper.mjs';
import {clickModelCommand} from './model-rail-helper.mjs';
const baseline=process.argv.includes('--baseline');
const pins=['apps/cad-studio/test/shell-face-kind-browser.mjs','apps/cad-studio/src/ui/Hud.tsx','apps/cad-studio/src/ui/FeatureFailureNotice.tsx','packages/barocss-cad-model/src/engine/errors.ts','packages/barocss-cad/src/blend/general-shell.ts'];
const f=await createFlow({name:'shell-face-kind',output:process.argv[2],envFrozen:'SHELL_FACE_KIND_SOURCE_FROZEN',initialFiles:pins,requiredFrozen:pins,
 qualification:'G2 face-kind Shell refusal names the unsupported face without blaming Wall; original accepted source survives Cancel.',
 limits:['One authored 40×30×20 R4 G2 tension .5 source, Wall2; closed/top/bottom. Conic rho.5 closed/bottom controls use the existing independent bounded oracle. No general Shell or G2 offset admission.'],
 inspectorSource:`
import {readFileSync} from 'node:fs';
import {partBreps} from '@barocss/cad-model/engine/evaluate';
import {digestOf} from '@barocss/cad-model/util/digest';
import {checkBrep,brepMassProperties} from '@barocss/cad';
const doc=JSON.parse(readFileSync(process.argv[2],'utf8'));
console.log(JSON.stringify(partBreps(doc).map(({key,brep})=>({key,sha:digestOf(brep),check:checkBrep(brep,{strict:true}),volume:brepMassProperties(brep,1).volume,shells:brep.shells.map(s=>({closed:s.closed}))}))));
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
const title='Shell does not support this face';
const source=kind=>({format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nextId:3,outputs:{b2:{node:2,side:'solid'}},nodes:[
 {id:'n0',kind:'sketch',profile:'rectangle',min:[0,0],max:[40,30]},
 {id:'n1',kind:'extrude',sketch:0,height:20},
 {id:'n2',kind:'fillet',parent:{node:1,side:'solid'},edges:['n1.side0|n1.top'],radius:4,section:kind==='g2'?{kind:'g2',tension:.5}:{kind:'conic',rho:.5}}]});
const button=(name,scope=f.page)=>scope.getByRole('button',{name,exact:true});
const hud=()=>f.page.getByRole('dialog',{name:'Shell',exact:true});
const status=text=>hud().locator('.status').filter({hasText:new RegExp('^'+text+'$')}).waitFor({timeout:60000});
function observePreview(){
 const proto=Worker.prototype,post=proto.postMessage,handler=Object.getOwnPropertyDescriptor(proto,'onmessage');
 const tables=new WeakMap(),requests=new WeakMap();window.__shellFaceKind=[];
 proto.postMessage=function(request,...rest){let table=tables.get(this);if(!table){table=new Map();tables.set(this,table);}if(request.doc?.added)for(const [id,node]of request.doc.added)table.set(id,structuredClone(node));
 if(request.type==='preview'){let work=requests.get(this);if(!work){work=new Map();requests.set(this,work);}const nodes=request.doc?.ids?.map(id=>table.get(id));work.set(request.id,{id:request.id,revision:request.revision,feature:structuredClone(nodes?.at(-1))});}return Reflect.apply(post,this,[request,...rest]);};
 Object.defineProperty(proto,'onmessage',{configurable:true,get:handler.get,set(callback){handler.set.call(this,callback&&function(event){const request=requests.get(this)?.get(event.data?.id);if(request&&event.data.result)window.__shellFaceKind.push({...request,ok:event.data.result.ok,error:structuredClone(event.data.result.error)});callback.call(this,event);});}});
}
async function openSource(doc,label){await f.newPage();const [chooser]=await Promise.all([f.page.waitForEvent('filechooser'),button('Open').click()]);await chooser.setFiles({name:label+'.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))});await f.same(doc);}
async function filter(name){const control=button('Selection filter');for(let i=0;i<6&&!(await control.innerText()).includes(name);i++)await control.click();assert.ok((await control.innerText()).includes(name));}
async function selectOpening(mode){
 if(mode==='closed'){await filter('Bodies');const body=f.page.getByRole('complementary',{name:'Browser',exact:true}).locator('.ol-row > button.ol[title="Double-click to rename"]');assert.equal(await body.count(),1);await body.click();await f.page.waitForFunction(()=>window.__studioSelection.selection.bodies.length===1&&window.__studioSelection.selection.faces.length===0);}
 else{await filter('Faces');const name=mode==='top'?'Top':'Bottom',direct=button(name,f.page.locator('.views'));
 if(await direct.count())await direct.click();else{await button('View cube directions',f.page.getByRole('group',{name:'View cube',exact:true})).click();await f.page.getByRole('menuitem',{name,exact:true}).click();}
 if(await button('Ortho').getAttribute('aria-pressed')!=='true')await button('Ortho').click();await f.page.getByTitle('Frame all (F)',{exact:true}).click();
 const pixel=await f.page.evaluate(async point=>{let prev=null,stable=0;for(let i=0;i<360;i++){await new Promise(done=>requestAnimationFrame(done));const p=window.__studioScreenOf(point),hit=p&&document.elementFromPoint(...p)?.matches('canvas.vp-canvas');stable=hit&&prev&&Math.hypot(p[0]-prev[0],p[1]-prev[1])<.01?stable+1:0;if(stable>=5)return p;prev=hit?p:null;}return null;},mode==='top'?[20,15,20]:[10,15,0]);assert.ok(pixel);await f.page.mouse.click(...pixel);await f.page.waitForFunction(()=>window.__studioSelection.selection.faces.length===1);}
 return f.page.evaluate(()=>window.__studioSelection.selection);
}
async function sourceNative(doc,label){const native=await f.inspect(label,doc);assert.equal(native.length,1);assert.ok(native[0].check.valid);return native;}
async function checkRefusal(mode){
 const doc=source('g2');await openSource(doc,'g2-'+mode);const before=await sourceNative(doc,'g2-'+mode+'-before');
 const picks=await selectOpening(mode);await clickModelCommand(f.page,'Modify','Shell');const wall=hud().getByLabel('Wall',{exact:true});await wall.fill('2');await status('refused');
 const notice=hud().locator('.hud-error[role="status"]');assert.equal(await notice.count(),1);
 const raw=await f.page.evaluate(()=>window.__shellFaceKind.filter(r=>r.error?.code==='SHELL_FACE_KIND').at(-1));assert.ok(raw);assert.equal(raw.feature.kind,'shell');assert.equal(raw.feature.thickness,2);assert.deepEqual(raw.feature.open,mode==='closed'?[]:[mode==='top'?'n1.top':'n1.bottom']);assert.match(raw.error.detail,/n2\.face#1/);
 const details=notice.locator('details');assert.equal(await details.getAttribute('open'),null);
 const copy=(await notice.locator(':scope > div').evaluateAll(nodes=>nodes.slice(0,2).map(n=>n.textContent))).join(' ');
 if(baseline){assert.doesNotMatch(copy,/Shell does not support this face/);}
 else{assert.equal(await notice.getByText(title,{exact:true}).count(),1);assert.ok(copy.includes('Shell cannot offset face n2.face#1 in this configuration. This is not a Wall thickness error. Cancel Shell, then try another source or Shell before the finishing feature; check the new preview.'),copy);assert.doesNotMatch(copy,/wall is too thick|enter.*wall.*less than/i);}
 assert.equal(await wall.inputValue(),'2');assert.equal(await wall.getAttribute('aria-invalid'),null);assert.ok(await button('Apply',hud()).isDisabled());
 await details.getByText('Kernel detail',{exact:true}).click();assert.equal(await notice.locator('code').innerText(),raw.error.detail);await details.getByText('Kernel detail',{exact:true}).click();
 await wall.press('Enter');await f.same(doc);assert.deepEqual(await f.page.evaluate(()=>window.__studioSelection.selection),picks);await f.snapshot('g2-'+mode+'-refused');
 await button('Cancel',hud()).click();await hud().waitFor({state:'hidden'});await f.same(doc);assert.deepEqual(await sourceNative(doc,'g2-'+mode+'-after'),before);await f.snapshot('g2-'+mode+'-cancelled');
 f.report.observations.push({mode,baseline,defaultCopy:copy,raw,unchangedNative:true,wallNotInvalid:true});
}
async function conicControl(mode){
 const doc=source('conic');await openSource(doc,'conic-'+mode);await selectOpening(mode);await clickModelCommand(f.page,'Modify','Shell');await hud().getByLabel('Wall',{exact:true}).fill('2');await status('preview');assert.equal(await hud().getByText(title,{exact:true}).count(),0);await button('Apply',hud()).click();await f.changed(doc);
 const accepted=await f.doc();assert.equal(accepted.nodes[3].kind,'shell');assert.equal(accepted.nodes[3].thickness,2);assert.deepEqual(accepted.nodes[3].open,mode==='closed'?[]:['n1.bottom']);
 const native=await sourceNative(accepted,'conic-'+mode+'-native'),bodies=(await f.bodies()).bodies;assert.equal(bodies.length,1);await f.runOracle({native:native[0],workerVolume:bodies[0].volume,mode:mode==='closed'?'closed':'open',wall:2},'conic-'+mode+'-oracle');await f.snapshot('conic-'+mode+'-accepted');
}
await f.run(async()=>{
 const newContext=f.browser.newContext.bind(f.browser);f.browser.newContext=async options=>{const context=await newContext(options);await context.addInitScript(observePreview);return context;};
 for(const mode of ['closed','top','bottom']){f.phase='G2 '+mode+' unsupported face';await checkRefusal(mode);}
 if(!baseline)for(const mode of ['closed','bottom']){f.phase='Conic '+mode+' supported control';await conicControl(mode);}
});
