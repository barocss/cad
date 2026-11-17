import assert from 'node:assert/strict';
import {createFlow} from './flow-helper.mjs';
const diagnostic=process.argv.includes('--baseline'), chamfer=process.argv.includes('--chamfer');
const f=await createFlow({name:'rectangle-finish-height',output:process.argv[2],envFrozen:'RECTANGLE_FINISH_HEIGHT_SOURCE_FROZEN',initialFiles:['apps/cad-studio/test/rectangle-finish-height-browser.mjs','apps/cad-studio/src/state/rectangleFinishResize.ts','apps/cad-studio/src/state/historyFeatureApply.ts'],qualification:diagnostic?'Record the existing safe REFERENCE_MOVED refusal of an otherwise valid height edit.':'Preserve proven rectangle constant circular Fillet reference across height edit and reopen.',limits:['Single terminal numeric constant circular Fillet R2 or Chamfer D2 on one original rectangular prism edge.'],inspectorSource:`
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
const source={format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nodes:[{id:'n0',kind:'sketch',profile:'rectangle',min:[0,0],max:[40,30]},{id:'n1',kind:'extrude',sketch:0,height:10},{id:'n2',kind:chamfer?'chamfer':'fillet',parent:{node:1,side:'solid'},edges:[edge],...(chamfer?{distance:2}:{radius:2}),sigs:{[edge]:{k:'line',p:[20,0,10],d:[1,0,0],s:40}}}],outputs:{b2:{node:2,side:'solid'}},nextId:3};
const button=(name)=>f.page.getByRole('button',{name,exact:true});
async function open(doc,held=false){await f.page.locator('input[aria-label="Model file"]').setInputFiles({name:'rectangle-constant-fillet.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))});await f.page.waitForFunction(({d,held})=>held?['fillet','chamfer'].includes(window.__studioDoc?.nodes?.[2]?.kind)&&!!window.__studioDoc.nodes[2].held:JSON.stringify(window.__studioDoc)===JSON.stringify(d),{d:doc,held},{timeout:30000});await f.ready();}
async function verify(doc,label,height){const native=await f.inspect(label,doc),[body]=(await f.bodies()).bodies;assert.equal(native.key,body.key);await f.runOracle({native,width:40,depth:30,height,chamfer,workerVolume:body.volume},label);}
const expected=height=>({...source,nodes:source.nodes.map((n,i)=>i===1?{...n,height}:i===2?{...n,sigs:{[edge]:{k:'line',p:[20,0,height],d:[1,0,0],s:40}}}:n)});
await f.run(async()=>{
 await f.newPage();await open(source);await verify(source,'01-original',10);const original=await f.snapshot('01-before-edit');await f.openFeatureEditor(1);
 assert.equal(await f.editor().getByLabel('Distance',{exact:true}).inputValue(),'10');await f.editor().getByLabel('Distance',{exact:true}).fill('30');
 if(diagnostic){
   await f.editor().getByRole('button',{name:'Apply',exact:true}).click();await f.editor().locator('.hud-error code').filter({hasText:'REFERENCE_MOVED'}).waitFor({state:'attached'});
   const failed=await f.snapshot('02-baseline-reference-moved-refused');assert.match(failed.editor,/\[REFERENCE_MOVED\].*n1.side0\|n1.top/s);await f.same(source);assert.deepEqual(failed.history,original.history);await verify(source,'baseline-still-height10',10);
   f.report.observations.push({label:'baseline-safe-refusal',attemptedHeight:30,acceptedHeight:10,sourceUnchanged:true,geometryUnchanged:true});await f.closeEditor();await f.persist();return;
 }
 const taller=(await f.applyEditor(source,'02-height30')).doc;assert.deepEqual(taller,expected(30));await verify(taller,'02-taller-native',30);
 await f.undo();await f.same(source);await verify(source,'undo-height10',10);await f.redo();await f.same(taller);await verify(taller,'redo-height30',30);
 const saved=await f.save('height30');await f.freshOpen(saved.file,saved.doc,'03-height30-reopened');assert.equal(await f.page.getByRole('region',{name:'References',exact:true}).count(),0);await verify(taller,'reopened-height30',30);
 for(const height of [14,40]){const before=await f.doc();await f.openFeatureEditor(1);await f.editor().getByLabel('Distance',{exact:true}).fill(String(height));const after=(await f.applyEditor(before,'height-'+height)).doc;assert.deepEqual(after,expected(height));await verify(after,'native-height-'+height,height);}
 const accepted=await f.snapshot('04-height40-accepted');await f.openFeatureEditor(1);await f.editor().getByLabel('Distance',{exact:true}).fill('1');await f.editor().getByRole('button',{name:'Apply',exact:true}).click();await f.editor().locator('.hud-error').first().waitFor();await f.same(expected(40));const refused=await f.snapshot('05-height1-refused');assert.deepEqual(refused.history,accepted.history);await verify(expected(40),'invalid-preserves-height40',40);
 await f.editor().getByLabel('Distance',{exact:true}).fill('35');await f.editor().locator('.hud-error').waitFor({state:'hidden'});assert.equal(await f.editor().getByRole('button',{name:'Apply',exact:true}).isEnabled(),true);await f.closeEditor();await f.same(expected(40));await verify(expected(40),'recovery-cancel-height40',40);
 await button('Iso').click();await f.page.getByTitle('Frame all (F)',{exact:true}).click();await f.snapshot('06-height40-iso');
});
