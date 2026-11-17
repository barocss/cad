import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
const baseline = process.argv.includes('--baseline');
const f = await createFlow({ name: 'circular-z-axis-history', output: process.argv[2], envFrozen: 'CIRCULAR_Z_AXIS_FROZEN',
 initialFiles: ['apps/cad-studio/test/circular-z-axis-history-browser.mjs','packages/barocss-cad-model/src/app/editFields.ts'],
 qualification: baseline ? 'Actual History has Count but no Z axis location fields before change.' : 'Explicit Z circular History pivot edits, exact quarter-turn corners, Cancel/Undo/Redo and actual Save/fresh Open.',
 limits: ['Z One body only; no span or axis-direction editing, no broad topology or noncardinal precision claim.'],
 inspectorSource: `import {readFileSync} from 'node:fs';import {partBreps} from '@barocss/cad-model/engine/evaluate';
const doc=JSON.parse(readFileSync(process.argv[2],'utf8'));
console.log(JSON.stringify(partBreps(doc).map(({key,brep})=>({key,points:brep.vertices.map(v=>v.point)}))));
`,
 oracleSource: `import json,sys,itertools
d=json.load(sys.stdin);px,py=d['pivot'];expected=set()
for x,y,z in itertools.product([10,14],[20,26],[0,8]):
 for k in range(4):
  u,v=x-px,y-py
  for _ in range(k):u,v=-v,u
  expected.add((u+px,v+py,z))
assert len(d['native'])==1 and d['native'][0]['key']=='b2'
actual=d['native'][0]['points']; assert len(actual)==len(expected)==32
remaining=list(expected); residual=0
for p in actual:
 matches=[q for q in remaining if max(abs(a-b) for a,b in zip(p,q))<=1e-9]
 assert len(matches)==1,(p,matches)
 q=matches[0];residual=max(residual,max(abs(a-b) for a,b in zip(p,q)));remaining.remove(q)
assert not remaining
print(json.dumps({'status':'PASS','uniqueCorners':len(actual),'pivot':d['pivot'],'maxCoordinateResidualMM':residual}))
` });
const doc={format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nodes:[
 {kind:'sketch',id:'n0',profile:'rectangle',min:[10,20],max:[14,26]},
 {kind:'extrude',id:'n1',sketch:0,height:8},
 {kind:'circular-pattern',id:'n2',parent:{node:1,side:'solid'},axis:'z',angle:90,count:4,span:360}],
 outputs:{b2:{node:2,side:'solid'}},nextId:3};
const field=n=>f.editor().getByLabel(n,{exact:true});
const b=n=>f.editor().getByRole('button',{name:n,exact:true});
async function physical(label,expected,pivot){await f.same(expected);const native=await f.inspect(label,expected);await f.runOracle({native,pivot},label);}
await f.run(async()=>{
 await f.newPage();await f.openFile({name:'z-axis-history.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))},3);await f.same(doc);await f.openFeatureEditor(2);
 await field('Count').waitFor();
 if(baseline){assert.equal(await field('Axis at X').count(),0);assert.equal(await field('Axis at Y').count(),0);await f.same(doc);await f.snapshot('01-count-only-before');return;}
 assert.equal(await field('Axis at X').inputValue(),'0');assert.equal(await field('Axis at Y').inputValue(),'0');
 await field('Axis at X').fill('3');await b('Close editor').click();await f.same(doc);
 await f.openFeatureEditor(2);await field('Axis at X').fill('');assert.equal(await b('Apply').isDisabled(),true);await f.same(doc);await f.snapshot('01-invalid-axis-retained');
 await field('Axis at X').fill('2');await field('Axis at Y').fill('-3');
 const {doc:next}=await f.applyEditor(doc,'02-axis-edited');
 assert.deepEqual(next,{...doc,nodes:[...doc.nodes.slice(0,2),{...doc.nodes[2],pivot:[2,-3,0]}]});await physical('edited',next,[2,-3]);
 await f.undo();await f.same(doc);await f.redo();await f.same(next);
 const saved=await f.save('z-axis-edited');await f.freshOpen(saved.file,next,'03-fresh-open');await physical('reopened',next,[2,-3]);
 await f.openFeatureEditor(2);assert.equal(await field('Axis at X').inputValue(),'2');assert.equal(await field('Axis at Y').inputValue(),'-3');await f.snapshot('04-fresh-axis-fields');await b('Close editor').click();await f.same(next);
});
