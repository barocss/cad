import assert from 'node:assert/strict';
import {createFlow} from './flow-helper.mjs';
const diagnostic=process.argv.includes('--baseline'), chamfer=process.argv.includes('--chamfer');
const f=await createFlow({name:'rectangle-bound-finish-resize',output:process.argv[2],envFrozen:'RECTANGLE_BOUND_FINISH_SOURCE_FROZEN',initialFiles:['apps/cad-studio/test/rectangle-bound-finish-resize-browser.mjs','apps/cad-studio/src/state/rectangleFinishResize.ts','apps/cad-studio/src/state/historyFeatureApply.ts'],qualification:diagnostic?'Observe parameter-bound terminal finish Width40 to60, including Save and fresh Open without presuming held or success.':'Preserve a constant parameter-bound terminal finish across rectangle width edit and reopen.',limits:['One terminal constant Fillet or Chamfer bound to R=2; explicit literal rectangle and no varying radii. No assertion of broad parameter or shape support.'],inspectorSource:`
import {readFileSync} from 'node:fs';
import {partBreps} from '@barocss/cad-model/engine/evaluate';
import {brepMassProperties,checkBrep,evaluateSurface} from '@barocss/cad';
const doc=JSON.parse(readFileSync(process.argv[2],'utf8')), [{key,brep}]=partBreps(doc);
const midpoints=doc.nodes[2].kind==='chamfer'?[]:brep.faces.filter(f=>f.name?.startsWith('n2.face')).map(f=>{const s=f.surface;if(s.kind!=='surface')throw Error('Expected native surface');return evaluateSurface(s,(s.knotsU[s.degreeU]+s.knotsU[s.controlPoints.length])/2,(s.knotsV[s.degreeV]+s.knotsV[s.controlPoints[0].length])/2);});
console.log(JSON.stringify({key,midpoints,volume:brepMassProperties(brep,1).volume,check:checkBrep(brep,{strict:true}),vertices:brep.vertices.map(v=>v.point)}));
`,oracleSource:`
import json,sys,math
d=json.load(sys.stdin);n=d['native'];w=d['width'];h=d['height'];depth=d['depth'];c=d['radius']
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
const source={format:'barocss-cad-model',schema:3,units:'mm',parameters:{R:2},nodes:[{id:'n0',kind:'sketch',profile:'rectangle',min:[0,0],max:[40,30]},{id:'n1',kind:'extrude',sketch:0,height:10},{id:'n2',kind:chamfer?'chamfer':'fillet',parent:{node:1,side:'solid'},edges:[edge],...(chamfer?{distance:{parameter:'R'}}:{radius:{parameter:'R'}}),sigs:{[edge]:{k:'line',p:[20,0,10],d:[1,0,0],s:40}}}],outputs:{b2:{node:2,side:'solid'}},nextId:3};
const button=(name)=>f.page.getByRole('button',{name,exact:true});
async function open(doc,held=false){await f.page.locator('input[aria-label="Model file"]').setInputFiles({name:'rectangle-constant-fillet.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))});await f.page.waitForFunction(({d,held})=>held?['fillet','chamfer'].includes(window.__studioDoc?.nodes?.[2]?.kind)&&!!window.__studioDoc.nodes[2].held:JSON.stringify(window.__studioDoc)===JSON.stringify(d),{d:doc,held},{timeout:30000});await f.ready();}
async function verify(doc,label,width,depth=30,radius=2){const native=await f.inspect(label,doc),[body]=(await f.bodies()).bodies;assert.equal(native.key,body.key);await f.runOracle({native,width,depth,radius,height:10,chamfer,workerVolume:body.volume},label);}
const boundKey=chamfer?'distance':'radius';
function binding(doc,radius=2){assert.deepEqual(doc.parameters,{R:radius});assert.deepEqual(doc.nodes[2][boundKey],{parameter:'R'});assert.deepEqual(doc.nodes[2].edges,[edge]);}
const expected=(width,depth=30,radius=2)=>({...source,parameters:{R:radius},nodes:source.nodes.map((n,i)=>i===0?{...n,max:[width,depth]}:i===2?{...n,sigs:{[edge]:{k:'line',p:[width/2,0,10],d:[1,0,0],s:width}}}:n)});
await f.run(async()=>{
 await f.newPage();await open(source);binding(await f.doc());await verify(source,'01-original',40);await f.openFeatureEditor(1);
 assert.equal(await f.editor().getByLabel('Width',{exact:true}).inputValue(),'40');await f.editor().getByLabel('Width',{exact:true}).fill('60');
 await f.editor().getByRole('button',{name:'Apply',exact:true}).click();
 await f.page.waitForFunction(()=>window.__studioDoc?.nodes?.[0]?.max?.[0]===60||!!document.querySelector('.node-editor .hud-error'));
 const applied=await f.doc();const accepted=applied.nodes[0].max[0]===60;
 if(!accepted){const refusal=await f.snapshot('02-width60-refused');assert.deepEqual(applied,source);await verify(source,'refused-native40',40);f.report.observations.push({label:'width-result',accepted:false,error:refusal.editor,documentPreserved:true});await f.persist();assert.ok(diagnostic,'Fixed width edit must accept the supported bound finish');return;}
 await f.closeEditor();await f.ready();binding(applied);await verify(applied,'02-accepted-native60',60);await f.snapshot('02-width60-accepted');
 f.report.observations.push({label:'width-result',accepted:true,savedSig:applied.nodes[2].sigs,signatureRefreshed:JSON.stringify(applied.nodes[2].sigs)===JSON.stringify(expected(60).nodes[2].sigs)});
 if(!diagnostic)assert.deepEqual(applied,expected(60));
 await f.undo();await f.same(source);await verify(source,'undo-native40',40);await f.redo();await f.same(applied);await verify(applied,'redo-native60',60);
 const saved=await f.save('bound-finish-width60');await f.newPage();await f.page.locator('input[aria-label="Model file"]').setInputFiles(saved.file);
 // Observe loader normalization rather than waiting for a predetermined held state.
 await f.page.waitForFunction(()=>window.__studioDoc?.nodes?.length===3&&window.__studioDoc.nodes[0]?.max?.[0]===60);await f.ready();
 const reopened=await f.doc(),state=await f.snapshot('03-fresh-open-observed');
 const held=!!reopened.nodes[2].held,references=await f.page.getByRole('region',{name:'References',exact:true}).count();
 f.report.observations.push({label:'fresh-open-result',held,references,wholeDocumentEqual:JSON.stringify(reopened)===JSON.stringify(applied),finish:reopened.nodes[2],bodyKeys:state.bodies.bodies.map(b=>b.key),volumes:state.bodies.bodies.map(b=>b.volume),notices:state.notices});await f.persist();
 binding(reopened);
 if(!diagnostic){assert.deepEqual(reopened,expected(60));assert.equal(held,false);assert.equal(references,0);await verify(reopened,'reopened-native60',60);}
 else if(!held&&references===0){await verify(reopened,'baseline-reopened-native60',60);}
 await button('Iso').click();await f.page.getByTitle('Frame all (F)',{exact:true}).click();await f.snapshot('04-reopened-iso');
 if(!diagnostic){
   await f.setParameter('R',3,'05-parameter-R3');const larger=await f.doc();assert.deepEqual(larger,expected(60,30,3));binding(larger,3);await verify(larger,'R3-native',60,30,3);
   await f.undo();await f.same(reopened);await verify(reopened,'R3-undo-native',60);await f.redo();await f.same(larger);await verify(larger,'R3-redo-native',60,30,3);
   await f.openFeatureEditor(1);await f.editor().getByLabel('Depth',{exact:true}).fill('36');const deep=(await f.applyEditor(larger,'06-depth36')).doc;assert.deepEqual(deep,expected(60,36,3));binding(deep,3);await verify(deep,'depth36-native',60,36,3);
   const finalSave=await f.save('bound-R3-depth36');await f.freshOpen(finalSave.file,finalSave.doc,'07-R3-depth36-reopened');assert.deepEqual(await f.doc(),expected(60,36,3));binding(await f.doc(),3);assert.equal(await f.page.getByRole('region',{name:'References',exact:true}).count(),0);await verify(await f.doc(),'R3-depth36-fresh-native',60,36,3);
   const before=await f.snapshot('08-before-invalid');await f.openFeatureEditor(1);await f.editor().getByLabel('Depth',{exact:true}).fill('1');await f.editor().getByRole('button',{name:'Apply',exact:true}).click();await f.editor().locator('.hud-error').first().waitFor();await f.same(deep);const refused=await f.snapshot('09-depth1-refused');assert.deepEqual(refused.history,before.history);binding(refused.doc,3);await verify(refused.doc,'invalid-preserved-native',60,36,3);
   await f.editor().getByLabel('Depth',{exact:true}).fill('38');await f.editor().locator('.hud-error').waitFor({state:'hidden'});assert.equal(await f.editor().getByRole('button',{name:'Apply',exact:true}).isEnabled(),true);await f.closeEditor();await f.same(deep);await verify(deep,'cancel-recovered-native',60,36,3);await button('Iso').click();await f.page.getByTitle('Frame all (F)',{exact:true}).click();await f.snapshot('10-final-R3-iso');
 }

});
