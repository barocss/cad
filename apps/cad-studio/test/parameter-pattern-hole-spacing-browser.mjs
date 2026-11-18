import assert from 'node:assert/strict';
import {createFlow} from './flow-helper.mjs';
const baseline=process.argv.includes('--baseline');
const pins=['apps/cad-studio/test/parameter-pattern-hole-spacing-browser.mjs','apps/cad-studio/test/flow-helper.mjs','apps/cad-studio/src/App.tsx','apps/cad-studio/src/app/patternHoleSpacing.ts',...(!baseline?['apps/cad-studio/src/state/parameterPatternHoleSpacing.ts']:[]),'apps/cad-studio/src/ui/ParametersPanel.tsx','packages/barocss-cad-model/src/engine/part.ts','packages/barocss-cad/src/part/part-model.ts'];
const f=await createFlow({name:'parameter-pattern-hole-spacing',output:process.argv[2],envFrozen:'PARAMETER_PATTERN_HOLE_SPACING_SOURCE_FROZEN',initialFiles:pins,requiredFrozen:pins,qualification:'Observe real Parameters Spacing edit with a Hole on numbered copy 3; distinguish native unchanged bore location, correct copy-relative motion and safe refusal.',limits:['Opened four-node numeric rectangle/Extrude/Linear pattern/terminal through Hole with Spacing bound to S. Baseline records original behavior; fixed mode requires the bounded copy-relative correction.','Baseline PASS certifies observed outcome and lifecycle, not correct copy-relative motion. X axis, three disjoint copies, one complete R1 bore only.'],inspectorSource:`
import {readFileSync} from 'node:fs';
import {toPartDocument} from '@barocss/cad-model/engine/part';
import {evaluateCadPart,checkOutput,checkBrep,faceGeometry,massPropertiesOf} from '@barocss/cad';
const doc=JSON.parse(readFileSync(process.argv[2],'utf8'));
console.log(JSON.stringify(evaluateCadPart(toPartDocument(doc)).outputs.map(o=>({id:o.id,count:o.bodyCount,valid:checkOutput(o).valid,strict:checkBrep(o.brep,{strict:true}),mass:massPropertiesOf(o),walls:o.brep.faces.filter(f=>f.name?.startsWith('n3.')).map(faceGeometry),tops:o.brep.faces.filter(f=>/^n1\\.top(?:@\\d+)?$/.test(f.name??'')).map(f=>[f.name,f.loops.length]).sort(([a],[b])=>a.localeCompare(b))}))));
`});
const ref=node=>({node,side:'solid'});
const source={format:'barocss-cad-model',schema:3,units:'mm',parameters:{S:16},nodes:[{id:'n0',kind:'sketch',profile:'rectangle',min:[50,10],max:[54,16]},{id:'n1',kind:'extrude',sketch:0,height:8},{id:'n2',kind:'linear-pattern',parent:ref(1),axis:'x',spacing:{parameter:'S'},count:3},{id:'n3',kind:'hole',parent:ref(2),radius:1,center:[84,13],face:'n1.top@2'}],outputs:{b3:ref(3)},nextId:4};
const button=name=>f.page.getByRole('button',{name,exact:true});
const near=(a,b)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=1e-7,`${a} != ${b}`);
async function native(label,doc,pitch,holeX){
 const rows=await f.inspect(label,doc);assert.equal(rows.length,1);const n=rows[0];assert.equal(n.id,'n3');assert.equal(n.count,3);assert.equal(n.valid,true);assert.equal(n.strict.valid,true,JSON.stringify(n.strict));
 assert.deepEqual(n.tops,[['n1.top',1],['n1.top@1',1],['n1.top@2',2]]);assert.equal(n.walls.length,2);
 for(const wall of n.walls){assert.equal(wall.kind,'cylinder');near(wall.c[0],holeX);near(wall.c[1],13);near(wall.r,1);near(Math.abs(wall.a[2]),1);}
 const bore=8*Math.PI,volume=576-bore;near(n.mass.volume,volume);near(n.mass.centroid[0],(576*(52+pitch)-bore*holeX)/volume);near(n.mass.centroid[1],13);near(n.mass.centroid[2],4);
 f.report.observations.push({label,pitch,holeX,expectedCopyRelativeHoleX:52+2*pitch,copyRelativeError:holeX-(52+2*pitch),volume:n.mass.volume,centroid:n.mass.centroid,tops:n.tops});await f.persist();return n;
}
await f.run(async()=>{
 await f.newPage();await f.page.locator('input[aria-label="Model file"]').setInputFiles({name:'bound-pattern-hole.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(source))});await f.same(source);await native('01-original-native',source,16,84);
 const before=await f.snapshot('02-original'),undoBefore=await button('Undo').isEnabled(),panel=await f.openParameters(),value=panel.getByLabel('Value of S',{exact:true});
 assert.equal(Number(await value.inputValue()),16);await value.fill('16.25');await f.same(source);await f.snapshot('03-uncommitted');await value.press('Enter');
 await f.page.waitForFunction(original=>JSON.stringify(window.__studioDoc)!==original||document.querySelectorAll('.toast').length>0,JSON.stringify(source),{timeout:60000});await f.ready();
 const outcome=await f.snapshot('04-outcome'),current=await f.doc(),accepted=JSON.stringify(current)!==JSON.stringify(source);
 let classification='safe-refusal',pitch=16,holeX=84;
 if(!accepted){assert.deepEqual(current,source);assert.deepEqual(outcome.history,before.history);assert.equal(await button('Undo').isEnabled(),undoBefore);assert.ok(outcome.notices.length>0,'Refusal must be observable');}
 else{
  assert.equal(current.parameters.S,16.25);pitch=16.25;assert.deepEqual(current.nodes.slice(0,3),source.nodes.slice(0,3));assert.deepEqual(current.outputs,source.outputs);assert.equal(current.nextId,source.nextId);
  const hole=current.nodes[3];assert.deepEqual({...hole,center:source.nodes[3].center},source.nodes[3]);assert.equal(hole.center[1],13);holeX=hole.center[0];
  classification=Math.abs(holeX-84.5)<=1e-7?'correct-copy-relative-motion':Math.abs(holeX-84)<=1e-7?'accepted-stale-world-centre':'unexpected-centre';
  assert.notEqual(classification,'unexpected-centre','Stop on an unplanned position rather than deriving a passing oracle from arbitrary output');
 }
 f.report.observations.push({label:'parameter-spacing-result',classification,accepted,requestedS:16.25,storedS:current.parameters.S,storedHoleCenter:current.nodes[3].center,expectedRequestedHoleCenter:[84.5,13],panelValue:await value.inputValue(),notices:outcome.notices});await f.persist();await f.closeParameters(panel);await f.same(current);await native('05-observed-native',current,pitch,holeX);
 if(!baseline)assert.equal(classification,'correct-copy-relative-motion');
 if(accepted){await f.undo();await f.same(source);await native('06-undo-native',source,16,84);await f.redo();await f.same(current);await native('07-redo-native',current,pitch,holeX);}
 const saved=await f.save('parameter-pattern-hole-'+classification);await f.freshOpen(saved.file,saved.doc,'08-reopened');await f.same(current);await native('09-reopened-native',current,pitch,holeX);
 await f.openFeatureEditor(2,'Linear pattern');assert.equal(await f.editor().getByLabel('Spacing parameter',{exact:true}).inputValue(),'S');assert.equal(Number(await f.editor().getByLabel('Spacing',{exact:true}).inputValue()),pitch);await f.snapshot('10-bound-spacing');await f.closeEditor();
 const reopened=await f.openParameters();assert.equal(Number(await reopened.getByLabel('Value of S',{exact:true}).inputValue()),pitch);await f.closeParameters(reopened);await button('Iso').click();await f.page.getByTitle('Frame all (F)',{exact:true}).click();await f.snapshot('11-final');
 if(!baseline){
  const next={...current,parameters:{S:16.5},nodes:current.nodes.map((n,i)=>i===3?{...n,center:[85,13]}:n)};
  await f.setParameter('S',16.5,'12-second-edit');await f.same(next);await native('13-second-native',next,16.5,85);
  const rejectPanel=await f.openParameters(),field=rejectPanel.getByLabel('Value of S',{exact:true});
  const stable=await f.snapshot('14-before-refusal');await field.fill('4');await field.press('Enter');
  await f.page.waitForFunction(()=>document.querySelectorAll('.toast').length>0);await f.ready();
  const refused=await f.snapshot('15-overlap-refused');await f.same(next);assert.ok(refused.notices.some(n=>/gap|pattern|spacing/i.test(JSON.stringify(n))));assert.deepEqual(refused.history,stable.history);
  await f.closeParameters(rejectPanel);await native('16-refused-native',next,16.5,85);
  await f.undo();await f.same(current);await f.redo();await f.same(next);
  const again=await f.save('parameter-pattern-hole-final');await f.freshOpen(again.file,again.doc,'17-final-reopened');await native('18-final-native',next,16.5,85);
 }
});
