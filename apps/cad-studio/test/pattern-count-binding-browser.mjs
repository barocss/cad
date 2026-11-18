import assert from 'node:assert/strict';
import {createFlow} from './flow-helper.mjs';
const baseline=process.argv.includes('--baseline');
const at=process.argv.indexOf('--kind'),kind=at<0?'linear':process.argv[at+1];
assert.ok(['linear','circular-x','circular-y','circular-z'].includes(kind),'--kind linear|circular-x|circular-y|circular-z');
const pins=['apps/cad-studio/test/pattern-count-binding-browser.mjs','apps/cad-studio/test/flow-helper.mjs',
 'packages/barocss-cad-model/src/app/editFields.ts','packages/barocss-cad-model/src/engine/doc.ts',
 'packages/barocss-cad-model/src/engine/part.ts','apps/cad-studio/src/ui/NodeEditor.tsx'];
const f=await createFlow({name:'pattern-count-binding-'+kind,output:process.argv[2],envFrozen:'PATTERN_COUNT_BINDING_SOURCE_FROZEN',initialFiles:pins,requiredFrozen:pins,
 qualification:baseline?'Observe numeric Count parameter offer and actual application outcome separately from supported numeric Count edits.':'Verify numeric-only Count History while retaining supported Spacing and Z pivot bindings.',
 limits:['Supported model-file Open seed, not pointer-created Pattern. One terminal result containing disjoint boxes.',
  'Circular X/Y retains authored 90 degree step, including count 3. Z uses full-turn distribution. Supported Spacing and Z pivot bindings are separate positive controls.',
  'Baseline records actual binding outcomes; fixed checks no Count binder. Disabled Apply is never force-clicked.'],
 inspectorSource:`
import {readFileSync} from 'node:fs';import {partSnapshot} from '@barocss/cad-model/engine/part';import {checkBrep,massPropertiesOf} from '@barocss/cad';
console.log(JSON.stringify(partSnapshot(JSON.parse(readFileSync(process.argv[2],'utf8'))).outputs.map(b=>({valid:checkBrep(b.brep,{strict:true}).valid,count:b.bodyCount,volume:massPropertiesOf(b).volume,centroid:massPropertiesOf(b).centroid,vertices:b.brep.vertices.map(v=>v.point)}))));
`});
const pattern=kind==='linear'?{id:'n2',kind:'linear-pattern',parent:{node:1,side:'solid'},axis:'x',spacing:30,count:3}:
 {id:'n2',kind:'circular-pattern',parent:{node:1,side:'solid'},axis:kind.at(-1),angle:kind==='circular-z'?120:90,count:3,...(kind==='circular-z'?{span:360,pivot:[0,0,0]}:{})};
const seed={format:'barocss-cad-model',schema:3,units:'mm',parameters:{countWanted:4,Spacing:35,PivotX:3},
 nodes:[{id:'n0',kind:'sketch',profile:'rectangle',min:[10,20],max:[14,26]},
 {id:'n1',kind:'extrude',sketch:0,height:8,from:30},pattern],outputs:{b2:{node:2,side:'solid'}},nextId:3};
const field=name=>f.editor().getByLabel(name,{exact:true}),button=name=>f.editor().getByRole('button',{name,exact:true});
async function open(doc,label){await f.newPage();await f.page.locator('input[aria-label="Model file"]').setInputFiles({name:label+'.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))});await f.same(doc);}
function placed(point,i,count,spacing=30,pivotX=0){const [x,y,z]=point;if(kind==='linear')return [x+spacing*i,y,z];
 if(kind==='circular-z'){const t=2*Math.PI*i/count,c=Math.cos(t),s=Math.sin(t);return [pivotX+(x-pivotX)*c-y*s,(x-pivotX)*s+y*c,z];}
 const c=[1,0,-1,0][i],s=[0,1,0,-1][i];return kind==='circular-x'?[x,c*y-s*z,s*y+c*z]:[c*x+s*z,y,-s*x+c*z];}
async function native(doc,label,count,spacing=30,pivotX=0){const rows=await f.inspect(label,doc);assert.equal(rows.length,1);const n=rows[0];assert.ok(n.valid);assert.equal(n.count,count);assert.ok(Math.abs(n.volume-192*count)<1e-7);
 const expected=[];for(let i=0;i<count;i++)for(const x of [10,14])for(const y of [20,26])for(const z of [30,38])expected.push(placed([x,y,z],i,count,spacing,pivotX));
 assert.equal(n.vertices.length,8*count);const used=new Set();for(const p of expected){const hits=n.vertices.flatMap((q,j)=>Math.hypot(...q.map((v,k)=>v-p[k]))<1e-8?[j]:[]);assert.equal(hits.length,1);assert.ok(!used.has(hits[0]));used.add(hits[0]);}assert.equal(used.size,n.vertices.length);
 const centres=Array.from({length:count},(_,i)=>placed([12,23,34],i,count,spacing,pivotX));for(let k=0;k<3;k++)assert.ok(Math.abs(n.centroid[k]-centres.reduce((s,p)=>s+p[k],0)/count)<1e-8);
 const shown=(await f.bodies()).bodies;assert.equal(shown.length,1);assert.ok(Math.abs(shown[0].volume-192*count)<1e-7);return n;}
await f.run(async()=>{
 await open(seed,'pattern-count-'+kind);const originalNative=await native(seed,'01-original-native',3);
 await f.openFeatureEditor(2);const before=await f.snapshot('02-original-count-fields');
 assert.equal(await field('Count parameter').count(),baseline?1:0);assert.equal(await field('Count').inputValue(),'3');
 if(baseline){
 await field('Count parameter').selectOption('countWanted');
 const controls={value:await field('Count').inputValue(),parameter:await field('Count parameter').inputValue(),numberDisabled:await field('Count').isDisabled(),applyEnabled:await button('Apply').isEnabled()};
 await f.snapshot('03-selected-count-parameter');f.report.observations.push({kind,label:'selected-count-parameter',...controls});await f.persist();
 if(controls.applyEnabled){await button('Apply').click();await f.page.waitForFunction(old=>JSON.stringify(window.__studioDoc)!==old||!!document.querySelector('.node-editor .hud-error')||!!document.querySelector('.toast[role="alert"]'),JSON.stringify(seed));}
 const outcome=await f.snapshot('04-binding-outcome'),accepted=JSON.stringify(outcome.doc)!==JSON.stringify(seed);
 f.report.observations.push({kind,label:'binding-outcome',accepted,...controls,notices:outcome.notices,editor:outcome.editor,storedCount:outcome.doc.nodes[2].count});await f.persist();
 if(!accepted){await f.same(seed);assert.deepEqual(outcome.history,before.history);assert.deepEqual(await native(seed,'05-refused-original-native',3),originalNative);await f.closeEditor();await f.same(seed);}
 else {await f.ready();await native(outcome.doc,'05-accepted-binding-native',4);await f.closeEditor();await open(seed,'numeric-control-original');}
 }else{await f.same(seed);assert.deepEqual(before.history,(await f.snapshot('03-fixed-no-count-binder')).history);await f.closeEditor();await f.same(seed);f.report.observations.push({kind,countParameterOffered:false});}
 await f.openFeatureEditor(2);await field('Count').fill('4');const numeric=(await f.applyEditor(seed,'06-numeric-four')).doc;
 assert.deepEqual(numeric,{...seed,nodes:seed.nodes.map((n,i)=>i===2?{...n,count:4,...(kind==='circular-z'?{angle:90}:{})}:n)});await native(numeric,'07-numeric-four-native',4);
 await f.undo();await f.same(seed);await native(seed,'08-undo-native',3);await f.redo();await f.same(numeric);await native(numeric,'09-redo-native',4);
 await f.openFeatureEditor(2);await field('Count').fill('3');await f.closeEditor();await f.same(numeric);await native(numeric,'10-cancel-native',4);
 const saved=await f.save('pattern-count-'+kind);await f.freshOpen(saved.file,saved.doc,'11-reopened');await f.same(numeric);await native(numeric,'12-reopened-native',4);
 await f.openFeatureEditor(2);assert.equal(await field('Count').inputValue(),'4');assert.equal(await field('Count parameter').count(),baseline?1:0);await f.snapshot('13-reopened-count-fields');await f.closeEditor();
 if(kind==='linear'||kind==='circular-z'){
  const label=kind==='linear'?'Spacing':'Axis at X',parameter=kind==='linear'?'Spacing':'PivotX';
  await f.openFeatureEditor(2);assert.equal(await field(label+' parameter').count(),1);
  await field(label+' parameter').selectOption(parameter);const bound=(await f.applyEditor(numeric,'14-supported-binding')).doc;
  const expected={...numeric,nodes:numeric.nodes.map((n,i)=>i!==2?n:kind==='linear'?{...n,spacing:{parameter:'Spacing'}}:{...n,pivot:[{parameter:'PivotX'},0,0]})};
  assert.deepEqual(bound,expected);await native(bound,'15-supported-binding-native',4,kind==='linear'?35:30,kind==='circular-z'?3:0);
  await f.undo();await f.same(numeric);await f.redo();await f.same(bound);
  const boundSaved=await f.save('supported-binding-'+kind);await f.freshOpen(boundSaved.file,boundSaved.doc,'16-bound-reopened');await f.same(bound);
  await native(bound,'17-bound-reopened-native',4,kind==='linear'?35:30,kind==='circular-z'?3:0);
  await f.openFeatureEditor(2);assert.equal(await field('Count parameter').count(),baseline?1:0);assert.equal(await field('Count').inputValue(),'4');assert.equal(await field(label+' parameter').inputValue(),parameter);assert.equal(Number(await field(label).inputValue()),kind==='linear'?35:3);await f.snapshot('18-bound-reopened-fields');await f.closeEditor();
 }
 f.report.observations.push({kind,numericCountFour:'PASS',undoRedoCancelSaveOpen:'PASS',supportedDimensionBinding:kind==='linear'?'Spacing PASS':kind==='circular-z'?'Axis at X PASS':'NOT_RUN: no applicable axis-position control'});
});
