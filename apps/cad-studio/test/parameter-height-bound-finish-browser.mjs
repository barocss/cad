import assert from 'node:assert/strict';
import {createFlow} from './flow-helper.mjs';
const chamfer=process.argv.includes('--chamfer');
const baseline=process.argv.includes('--baseline');
const finishParameter=chamfer?'C':'R';

const f=await createFlow({name:'parameter-height-bound-finish',output:process.argv[2],envFrozen:'PARAMETER_HEIGHT_BOUND_FINISH_SOURCE_FROZEN',initialFiles:['apps/cad-studio/test/parameter-height-bound-finish-browser.mjs','apps/cad-studio/src/state/rectangleFinishResize.ts','apps/cad-studio/src/state/parameterHeightFinish.ts','apps/cad-studio/src/state/historyFeatureApply.ts','apps/cad-studio/src/App.tsx','apps/cad-studio/src/ui/ParametersPanel.tsx'],qualification:'Observe Parameters H10 to30 with both Extrude Height and a constant terminal finishing size bound; R/C remains2. Acceptance is not presumed.',limits:['Single terminal constant circular Fillet radius bound to R2 or equal Chamfer distance bound to C2; only H changes.'],inspectorSource:`
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
const source={format:'barocss-cad-model',schema:3,units:'mm',parameters:{H:10,[finishParameter]:2},nodes:[{id:'n0',kind:'sketch',profile:'rectangle',min:[0,0],max:[40,30]},{id:'n1',kind:'extrude',sketch:0,height:{parameter:'H'}},{id:'n2',kind:chamfer?'chamfer':'fillet',parent:{node:1,side:'solid'},edges:[edge],...(chamfer?{distance:{parameter:finishParameter}}:{radius:{parameter:finishParameter}}),sigs:{[edge]:{k:'line',p:[20,0,10],d:[1,0,0],s:40}}}],outputs:{b2:{node:2,side:'solid'}},nextId:3};
const button=(name)=>f.page.getByRole('button',{name,exact:true});
async function open(doc,held=false){await f.page.locator('input[aria-label="Model file"]').setInputFiles({name:'rectangle-constant-fillet.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))});await f.page.waitForFunction(({d,held})=>held?['fillet','chamfer'].includes(window.__studioDoc?.nodes?.[2]?.kind)&&!!window.__studioDoc.nodes[2].held:JSON.stringify(window.__studioDoc)===JSON.stringify(d),{d:doc,held},{timeout:30000});await f.ready();}
async function verify(doc,label,height){const native=await f.inspect(label,doc),[body]=(await f.bodies()).bodies;assert.equal(native.key,body.key);await f.runOracle({native,width:40,depth:30,height,chamfer,workerVolume:body.volume},label);}


const expectedHeight=height=>({...source,parameters:{H:height,[finishParameter]:2},nodes:source.nodes.map((n,i)=>i===2?{...n,sigs:{[edge]:{k:'line',p:[20,0,height],d:[1,0,0],s:40}}}:n)});
async function fixed(){
  let current=source;
  for(const height of [30,14,40]){
    const previous=current;
    await f.setParameter('H',height,`fixed-H${height}-accepted`);
    current=await f.doc();assert.deepEqual(current,expectedHeight(height));
    await verify(current,`fixed-H${height}-native`,height);
    await f.undo();await f.same(previous);
    await verify(previous,`fixed-H${height}-undo-native`,previous.parameters.H);
    await f.redo();await f.same(current);
    await verify(current,`fixed-H${height}-redo-native`,height);
  }
  await f.dismissToasts();
  const before=await f.snapshot('fixed-before-H1');
  const panel=await f.openParameters(),field=panel.getByLabel('Value of H',{exact:true});
  assert.equal(Number(await field.inputValue()),40);
  await field.fill('1');await field.press('Enter');
  // Do not assume a specific kernel error code; require an actual refusal
  // notification, then exact accepted document/history and independent geometry.
  await f.page.waitForFunction(()=>document.querySelectorAll('.toast').length>0,null,{timeout:60000});
  await f.same(current);
  const refused=await f.snapshot('fixed-H1-refused');
  assert.deepEqual(refused.history,before.history);
  assert.deepEqual(await f.doc(),expectedHeight(40));
  await verify(current,'fixed-H1-preserves-H40-native',40);
  f.report.observations.push({label:'fixed-invalid-H1',notices:refused.notices,storedH:(await f.doc()).parameters.H,panelValue:await field.inputValue()});
  await f.dismissToasts();
  // Recover once in the same real Parameters panel; no synthetic document reset.
  await field.fill('30');await field.press('Enter');
  await f.page.waitForFunction(()=>window.__studioDoc?.parameters?.H===30,null,{timeout:60000});
  await f.ready();await f.closeParameters(panel);
  const recovered=await f.doc();assert.deepEqual(recovered,expectedHeight(30));
  assert.deepEqual(recovered.nodes[1].height,{parameter:'H'});
  assert.deepEqual(recovered.nodes[2][chamfer?'distance':'radius'],{parameter:finishParameter});
  assert.equal(recovered.parameters[finishParameter],2);
  await verify(recovered,'fixed-recovered-H30-native',30);
  // Undo must return to H40, not to a rejected H1 candidate.
  await f.undo();await f.same(current);await verify(current,'fixed-recovery-undo-H40',40);
  await f.redo();await f.same(recovered);
  const saved=await f.save('parameter-height-fixed-H30');
  await f.freshOpen(saved.file,saved.doc,'fixed-H30-reopened');
  await f.same(recovered);assert.deepEqual(await f.doc(),expectedHeight(30));
  await verify(recovered,'fixed-reopened-H30-native',30);
  await f.openFeatureEditor(1);
  assert.equal(await f.editor().getByLabel('Distance parameter',{exact:true}).inputValue(),'H');
  assert.equal(Number(await f.editor().getByLabel('Distance',{exact:true}).inputValue()),30);
  assert.equal(await f.editor().getByLabel('Distance',{exact:true}).isDisabled(),true);
  await f.snapshot('fixed-reopened-height-binding');await f.closeEditor();
  assert.deepEqual((await f.doc()).nodes[2][chamfer?'distance':'radius'],{parameter:finishParameter});
  const reopened=await f.openParameters();
  assert.equal(Number(await reopened.getByLabel('Value of H',{exact:true}).inputValue()),30);
  assert.equal(Number(await reopened.getByLabel(`Value of ${finishParameter}`,{exact:true}).inputValue()),2);
  await f.snapshot('fixed-reopened-parameters');await f.closeParameters(reopened);
  await button('Iso').click();await f.page.getByTitle('Frame all (F)',{exact:true}).click();
  await f.snapshot('fixed-final');
}

await f.run(async()=>{
  await f.newPage(); await open(source); await verify(source,'01-original-H10',10);
  if(!baseline){await fixed();return;}
  const before=await f.snapshot('02-before-parameter-edit');
  const undoBefore=await button('Undo').isEnabled();
  await f.dismissToasts();
  const panel=await f.openParameters();
  const value=panel.getByLabel('Value of H',{exact:true});
  assert.equal(Number(await value.inputValue()),10);
  await value.fill('30'); await f.snapshot('03-H30-uncommitted');
  assert.deepEqual(await f.doc(),source);
  await value.press('Enter');
  // Parameters commits on Enter/blur and reports asynchronous failures as toasts,
  // not History editor .hud-error. Wait for either outcome without forcing it.
  await f.page.waitForFunction(original=>JSON.stringify(window.__studioDoc)!==original||document.querySelectorAll('.toast').length>0,JSON.stringify(source),{timeout:60000});
  await f.ready();
  const outcome=await f.snapshot('04-H30-result');
  const current=await f.doc();
  const accepted=JSON.stringify(current)!==JSON.stringify(source);
  f.report.observations.push({label:'parameter-height-outcome',accepted,attempted:30,
    storedH:current.parameters?.H,panelValue:await value.inputValue(),notices:outcome.notices,
    originalSignature:source.nodes[2].sigs,resultSignature:current.nodes[2]?.sigs,
    undoBefore,undoAfter:await button('Undo').isEnabled()});
  if(!accepted){
    assert.deepEqual(current,source); assert.deepEqual(outcome.history,before.history);
    assert.equal(await button('Undo').isEnabled(),undoBefore,'Refusal must not append an Undo step');
    await verify(source,'05-refused-original-native',10);
    await f.closeParameters(panel); await f.same(source);
  }else{
    assert.deepEqual(current.parameters,{H:30,[finishParameter]:2});
    assert.deepEqual(current.nodes[1].height,{parameter:'H'});
    assert.deepEqual(current.nodes.slice(0,2),source.nodes.slice(0,2));
    const finish={...current.nodes[2]},originalFinish={...source.nodes[2]};
    delete finish.sigs;delete originalFinish.sigs;
    assert.deepEqual(finish,originalFinish);
    assert.deepEqual(current.outputs,source.outputs);assert.equal(current.nextId,source.nextId);
    await f.closeParameters(panel);await verify(current,'05-accepted-H30-native',30);
    await f.undo();await f.same(source);await verify(source,'06-undo-H10-native',10);
    await f.redo();await f.same(current);await verify(current,'07-redo-H30-native',30);
  }
  const stable=await f.doc(),height=accepted?30:10;
  assert.equal(stable.parameters[finishParameter],2);
  assert.deepEqual(stable.nodes[2][chamfer?'distance':'radius'],{parameter:finishParameter});
  // Closing the panel after a settled result is dismissal, not a rollback of
  // uncommitted input: Parameters intentionally commits on blur.
  const saved=await f.save('parameter-height-observed-'+(accepted?'accepted':'refused'));
  await f.freshOpen(saved.file,saved.doc,'08-observed-reopened');
  await f.same(stable);await verify(stable,'09-reopened-native',height);
  await f.openFeatureEditor(1);
  assert.equal(await f.editor().getByLabel('Distance parameter',{exact:true}).inputValue(),'H');
  assert.equal(Number(await f.editor().getByLabel('Distance',{exact:true}).inputValue()),height);
  await f.snapshot('10-reopened-bound-height');await f.closeEditor();
  const reopenedPanel=await f.openParameters();
  assert.equal(Number(await reopenedPanel.getByLabel('Value of H',{exact:true}).inputValue()),height);
  await f.snapshot('11-reopened-parameters');await f.closeParameters(reopenedPanel);
  await button('Iso').click();await f.page.getByTitle('Frame all (F)',{exact:true}).click();
  await f.snapshot('12-final');
});
