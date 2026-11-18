import assert from 'node:assert/strict';
import {createFlow} from './flow-helper.mjs';
const chamfer=process.argv.includes('--chamfer');


const f=await createFlow({name:'parameter-height-finish-owner',output:process.argv[2],envFrozen:'PARAMETER_HEIGHT_FINISH_OWNER_SOURCE_FROZEN',initialFiles:['apps/cad-studio/test/parameter-height-finish-owner-browser.mjs','apps/cad-studio/src/state/rectangleFinishResize.ts','apps/cad-studio/src/state/parameterHeightFinish.ts','apps/cad-studio/src/state/historyFeatureApply.ts','apps/cad-studio/src/App.tsx','apps/cad-studio/src/ui/ParametersPanel.tsx'],qualification:'Hold the actual second Height parent reply, switch to New part, then deliver all real Worker messages in original FIFO order.',limits:['Controlled actual Worker delivery, not natural latency. No payload modification. New part ownership only; Open and newer Parameters requests are NOT_RUN.'],inspectorSource:`
import {readFileSync} from 'node:fs';
import {partBreps} from '@barocss/cad-model/engine/evaluate';
import {brepMassProperties,checkBrep,evaluateSurface} from '@barocss/cad';
const doc=JSON.parse(readFileSync(process.argv[2],'utf8')), [{key,brep}]=partBreps(doc);
const midpoints=doc.nodes[2].kind==='chamfer'?[]:brep.faces.filter(f=>f.name?.startsWith('n2.face')).map(f=>{const s=f.surface;if(s.kind!=='surface')throw Error('Expected native surface');return evaluateSurface(s,(s.knotsU[s.degreeU]+s.knotsU[s.controlPoints.length])/2,(s.knotsV[s.degreeV]+s.knotsV[s.controlPoints[0].length])/2);});
console.log(JSON.stringify({key,midpoints,volume:brepMassProperties(brep,1).volume,check:checkBrep(brep,{strict:true}),vertices:brep.vertices.map(v=>v.point)}));
`,oracleSource:`
import json,sys,math
d=json.load(sys.stdin);n=d['native'];w=d['width'];h=d['height'];depth=d['depth'];c=2
expected=w*depth*h-w*c*c*(.5 if d['chamfer'] else 1-math.pi/4)
assert n['check']['valid'],n['check']['issues']
assert abs(n['volume']-expected)<1e-7,(n['volume'],expected)
assert abs(d['workerVolume']-expected)<1e-7
for x in [0,w]:
 for p in [(x,0,h-c),(x,c,h)]:
  assert any(math.dist(p,q)<1e-9 for q in n['vertices']),p
 assert not any(math.dist((x,0,h),q)<1e-9 for q in n['vertices'])
q=c*(1-1/math.sqrt(2))
if not d['chamfer']: assert any(math.dist((w/2,q,h-q),p)<1e-7 for p in n['midpoints']),n['midpoints']
print(json.dumps({'status':'PASS','expectedVolume':expected,'nativeVolume':n['volume'],'workerVolume':d['workerVolume']}))
`});
const edge='n1.side0|n1.top';
const source={format:'barocss-cad-model',schema:3,units:'mm',parameters:{H:10},nodes:[{id:'n0',kind:'sketch',profile:'rectangle',min:[0,0],max:[40,30]},{id:'n1',kind:'extrude',sketch:0,height:{parameter:'H'}},{id:'n2',kind:chamfer?'chamfer':'fillet',parent:{node:1,side:'solid'},edges:[edge],...(chamfer?{distance:2}:{radius:2}),sigs:{[edge]:{k:'line',p:[20,0,10],d:[1,0,0],s:40}}}],outputs:{b2:{node:2,side:'solid'}},nextId:3};
const button=(name)=>f.page.getByRole('button',{name,exact:true});
async function open(doc,held=false){await f.page.locator('input[aria-label="Model file"]').setInputFiles({name:'rectangle-constant-fillet.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))});await f.page.waitForFunction(({d,held})=>held?['fillet','chamfer'].includes(window.__studioDoc?.nodes?.[2]?.kind)&&!!window.__studioDoc.nodes[2].held:JSON.stringify(window.__studioDoc)===JSON.stringify(d),{d:doc,held},{timeout:30000});await f.ready();}
async function verify(doc,label,height){const native=await f.inspect(label,doc),[body]=(await f.bodies()).bodies;assert.equal(native.key,body.key);await f.runOracle({native,width:40,depth:30,height,chamfer,workerVolume:body.volume},label);}



function installFifoDelay(){
 const proto=Worker.prototype,post=proto.postMessage,descriptor=Object.getOwnPropertyDescriptor(proto,'onmessage');
 const requests=new WeakMap();let armed=false,refs=0,target=null,held=null,queue=[],blockingWorker=null;
 proto.postMessage=function(request,...rest){
  let map=requests.get(this);if(!map){map=new Map();requests.set(this,map);}map.set(request.id,{id:request.id,type:request.type,slot:request.slot,revision:request.revision});
  if(armed&&request.type==='part'&&request.slot==='refs'&&++refs===2){target={worker:this,id:request.id};armed=false;}
  return Reflect.apply(post,this,[request,...rest]);
 };
 Object.defineProperty(proto,'onmessage',{configurable:true,get:descriptor.get,set(callback){descriptor.set.call(this,callback&&function(event){
  // Retain the exact Worker identity so all following real messages stay FIFO.
  // eslint-disable-next-line @typescript-eslint/no-this-alias
  if(target?.worker===this&&target.id===event.data?.id&&event.data.result){held={...requests.get(this).get(event.data.id),ok:event.data.result.ok,refsSeen:refs};blockingWorker=this;target=null;}
  if(blockingWorker===this){queue.push({callback,worker:this,event});return;}
  callback.call(this,event);
 });}});
 window.__heightOwnerDelay={arm(){if(blockingWorker||queue.length||armed)throw Error('Delay already active');armed=true;refs=0;held=null;},read(){return {held,queued:queue.length};},release(){if(!blockingWorker||!held)throw Error('No actual reply held');const pending=queue;queue=[];blockingWorker=null;for(const item of pending)item.callback.call(item.worker,item.event);return pending.length;}};
}
await f.run(async()=>{
 const create=f.browser.newContext.bind(f.browser);f.browser.newContext=async options=>{const context=await create(options);await context.addInitScript(installFifoDelay);return context;};
 await f.newPage();await open(source);await verify(source,'01-original-H10-native',10);
 // Successful actual edit control, then return to the accepted H10 owner.
 await f.setParameter('H',14,'02-normal-H14');const h14=await f.doc();assert.equal(h14.parameters.H,14);await verify(h14,'03-normal-H14-native',14);
 await f.undo();await f.same(source);await verify(source,'04-control-undo-H10',10);
 await f.dismissToasts();const panel=await f.openParameters();const field=panel.getByLabel('Value of H',{exact:true});assert.equal(Number(await field.inputValue()),10);
 await f.page.evaluate(()=>window.__heightOwnerDelay.arm());await field.fill('30');await field.press('Enter');
 await f.page.waitForFunction(()=>!!window.__heightOwnerDelay.read().held,null,{timeout:60000});
 const delay=await f.page.evaluate(()=>window.__heightOwnerDelay.read());assert.equal(delay.held.type,'part');assert.equal(delay.held.slot,'refs');assert.equal(delay.held.refsSeen,2);assert.equal(delay.held.ok,true);
 assert.deepEqual(await f.doc(),source);await f.snapshot('05-H30-second-parent-held');
 // No f.same/ready while a genuine worker reply is queued.
 await button('New part').click();
 const discard=f.page.getByRole('dialog',{name:'Discard feature changes?',exact:true});
 if(await discard.isVisible()){await discard.getByRole('button',{name:'Discard changes',exact:true}).click();}
 await f.page.waitForFunction(()=>window.__studioDoc?.nodes?.length===0,null,{timeout:15000});
 const empty=await f.doc();assert.deepEqual(empty.nodes,[]);assert.deepEqual(empty.outputs,{});
 const switched=await f.snapshot('06-new-part-before-release');
 const delivered=await f.page.evaluate(()=>window.__heightOwnerDelay.release());assert.ok(delivered>=1);
 await f.ready();await f.same(empty);const settled=await f.snapshot('07-new-part-after-release');assert.deepEqual(settled.history,switched.history);assert.equal((await f.bodies()).bodies.length,0);
 // Drain continuation microtasks/frames, then prove that old H30 never commits.
 await f.page.waitForTimeout(300);await f.same(empty);assert.equal((await f.bodies()).bodies.length,0);
 await f.undo();await f.same(source);await verify(source,'08-undo-new-restores-H10-native',10);
 await f.redo();await f.same(empty);assert.equal((await f.bodies()).bodies.length,0);
 await f.undo();await f.same(source);const saved=await f.save('height-owner-original-H10');await f.freshOpen(saved.file,saved.doc,'09-H10-reopened');await f.same(source);await verify(source,'10-reopened-original-native',10);
 await f.openFeatureEditor(1);assert.equal(await f.editor().getByLabel('Distance parameter',{exact:true}).inputValue(),'H');assert.equal(Number(await f.editor().getByLabel('Distance',{exact:true}).inputValue()),10);await f.snapshot('11-original-binding-retained');await f.closeEditor();
 f.report.observations.push({label:'actual-second-prefix-New-owner',delay,delivered,fifoAllSameWorkerMessages:true,payloadModified:false,originalH10Restored:true,lateH30Installed:false,openRace:'NOT_RUN',newerParameterRace:'NOT_RUN'});
});
