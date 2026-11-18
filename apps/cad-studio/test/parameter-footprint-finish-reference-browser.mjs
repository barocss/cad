import assert from 'node:assert/strict';
import {createFlow} from './flow-helper.mjs';
const chamfer=process.argv.includes('--chamfer');
const depthMode=process.argv.includes('--depth');
assert.ok(process.argv.includes('--baseline'),'Baseline observation only.');
const param=depthMode?'D':'W',initial=depthMode?30:40,target=depthMode?60:80;

const f=await createFlow({name:'parameter-footprint-finish-reference',output:process.argv[2],envFrozen:'PARAMETER_FOOTPRINT_FINISH_REFERENCE_SOURCE_FROZEN',initialFiles:['apps/cad-studio/test/parameter-footprint-finish-reference-browser.mjs','apps/cad-studio/src/state/rectangleFinishResize.ts','apps/cad-studio/src/state/parameterHeightFinish.ts','apps/cad-studio/src/state/historyFeatureApply.ts','apps/cad-studio/src/App.tsx','apps/cad-studio/src/ui/ParametersPanel.tsx'],qualification:'Observe Parameters W40 to80 or D30 to60 with a bound rectangular footprint and numeric terminal finish; acceptance is not presumed.',limits:['Single terminal numeric constant circular Fillet R2 or Chamfer D2 on one original rectangular prism edge.'],inspectorSource:`
import {readFileSync} from 'node:fs';
import {partBreps,evaluatePart} from '@barocss/cad-model/engine/evaluate';
import {brepMassProperties,checkBrep,evaluateSurface} from '@barocss/cad';
import {signaturesOf} from '@barocss/cad-model/engine/rematch';
import {toSig} from '@barocss/cad-model/engine/references';
const doc=JSON.parse(readFileSync(process.argv[2],'utf8'));
if(doc.nodes.length===2){
 const result=evaluatePart(doc,1);if(!result.ok)throw Error(JSON.stringify(result.error));
 const body=result.bodies[0],y=Object.hasOwn(doc.parameters,'D')?30:0;
 const edges=body.mesh.edges.filter(e=>e.straight&&e.a[1]===y&&e.b[1]===y&&e.a[2]===10&&e.b[2]===10&&Math.abs(e.a[0]-e.b[0])===40);
 if(edges.length!==1||edges[0].names.length!==1)throw Error('Expected one independently located top edge');
 const name=edges[0].names[0],sig=signaturesOf(body).edges.get(name);
 console.log(JSON.stringify({name,sig:toSig(sig),a:edges[0].a,b:edges[0].b}));process.exit(0);
}
const [{key,brep}]=partBreps(doc);
const midpoints=doc.nodes[2].kind==='chamfer'?[]:brep.faces.filter(f=>f.name?.startsWith('n2.face')).map(f=>{const s=f.surface;if(s.kind!=='surface')throw Error('Expected native surface');return evaluateSurface(s,(s.knotsU[s.degreeU]+s.knotsU[s.controlPoints.length])/2,(s.knotsV[s.degreeV]+s.knotsV[s.controlPoints[0].length])/2);});
console.log(JSON.stringify({key,midpoints,volume:brepMassProperties(brep,1).volume,check:checkBrep(brep,{strict:true}),vertices:brep.vertices.map(v=>v.point)}));
`,oracleSource:`
import json,sys,math
d=json.load(sys.stdin);n=d['native'];w=d['width'];h=d['height'];depth=d['depth'];c=2
expected=w*depth*h-w*c*c*(.5 if d['chamfer'] else 1-math.pi/4)
assert n['check']['valid'],n['check']['issues']
assert abs(n['volume']-expected)<1e-7,(n['volume'],expected)
assert abs(d['workerVolume']-expected)<1e-7
y=depth if d['back'] else 0
yin=depth-c if d['back'] else c
for x in [0,w]:
 for p in [(x,y,h-c),(x,yin,h)]:
  assert any(math.dist(p,q)<1e-9 for q in n['vertices']),p
 assert not any(math.dist((x,y,h),q)<1e-9 for q in n['vertices'])
q=c*(1-1/math.sqrt(2))
if not d['chamfer']: assert any(math.dist((w/2,depth-q if d['back'] else q,h-q),p)<1e-7 for p in n['midpoints']),n['midpoints']
print(json.dumps({'status':'PASS','expectedVolume':expected,'nativeVolume':n['volume'],'workerVolume':d['workerVolume']}))
`});

const seed={format:'barocss-cad-model',schema:3,units:'mm',parameters:{[param]:initial},nodes:[
 {id:'n0',kind:'sketch',profile:'rectangle',min:[0,0],max:depthMode?[40,{parameter:param}]:[{parameter:param},30]},
 {id:'n1',kind:'extrude',sketch:0,height:10}],outputs:{b1:{node:1,side:'solid'}},nextId:2};
const button=name=>f.page.getByRole('button',{name,exact:true});
async function verify(doc,label,value){
 const native=await f.inspect(label,doc),[body]=(await f.bodies()).bodies;
 assert.equal(native.key,body.key);
 await f.runOracle({native,width:depthMode?40:value,depth:depthMode?value:30,height:10,chamfer,back:depthMode,workerVolume:body.volume},label);
}
await f.run(async()=>{
 await f.newPage();
 const capture=await f.inspect('00-source-edge-native',seed);
 assert.deepEqual(capture.sig.p,[20,depthMode?30:0,10]);assert.equal(capture.sig.s,40);
 const source={...seed,nodes:[...seed.nodes,{id:'n2',kind:chamfer?'chamfer':'fillet',parent:{node:1,side:'solid'},edges:[capture.name],...(chamfer?{distance:2}:{radius:2}),sigs:{[capture.name]:capture.sig}}],outputs:{b2:{node:2,side:'solid'}},nextId:3};
 await f.page.locator('input[aria-label="Model file"]').setInputFiles({name:'parameter-footprint.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(source))});
 await f.page.waitForFunction(d=>JSON.stringify(window.__studioDoc)===JSON.stringify(d),source,{timeout:30000});
 await f.ready();await verify(source,'01-original-native',initial);
 const before=await f.snapshot('02-before-parameter-edit'),undoBefore=await button('Undo').isEnabled();
 await f.dismissToasts();
 const panel=await f.openParameters(),field=panel.getByLabel(`Value of ${param}`,{exact:true});
 assert.equal(Number(await field.inputValue()),initial);await field.fill(String(target));
 assert.deepEqual(await f.doc(),source);await field.press('Enter');
 await f.page.waitForFunction(d=>JSON.stringify(window.__studioDoc)!==d||document.querySelectorAll('.toast').length>0,JSON.stringify(source),{timeout:60000});
 await f.ready();const result=await f.snapshot('03-parameter-result'),current=await f.doc();
 const accepted=JSON.stringify(current)!==JSON.stringify(source);
 f.report.observations.push({label:'baseline-footprint-outcome',param,initial,target,accepted,panelValue:await field.inputValue(),notices:result.notices,sourceEdge:capture,originalSignature:source.nodes[2].sigs,resultSignature:current.nodes[2]?.sigs});
 if(!accepted){
  assert.deepEqual(current,source);assert.deepEqual(result.history,before.history);
  assert.equal(await button('Undo').isEnabled(),undoBefore);
  await verify(source,'04-refusal-native',initial);await f.closeParameters(panel);await f.same(source);
 }else{
  assert.equal(current.parameters[param],target);
  const withoutSigs=d=>({...d,nodes:d.nodes.map((n,i)=>{if(i!==2)return n;const copy={...n};delete copy.sigs;return copy;})});
  assert.deepEqual(withoutSigs(current),withoutSigs({...source,parameters:{[param]:target}}));
  await f.closeParameters(panel);await verify(current,'04-accepted-native',target);
  await f.undo();await f.same(source);await verify(source,'05-undo-native',initial);
  await f.redo();await f.same(current);await verify(current,'06-redo-native',target);
 }
 const stable=await f.doc(),value=accepted?target:initial;
 const saved=await f.save('parameter-footprint-'+param+'-'+(accepted?'accepted':'refused'));
 await f.freshOpen(saved.file,saved.doc,'07-reopened');await f.same(stable);await verify(stable,'08-reopened-native',value);
 const reopened=await f.openParameters();assert.equal(Number(await reopened.getByLabel(`Value of ${param}`,{exact:true}).inputValue()),value);
 assert.deepEqual((await f.doc()).nodes[0].max,source.nodes[0].max);
 await f.snapshot('09-reopened-binding');await f.closeParameters(reopened);
 await button('Iso').click();await f.page.getByTitle('Frame all (F)',{exact:true}).click();await f.snapshot('10-final');
});
