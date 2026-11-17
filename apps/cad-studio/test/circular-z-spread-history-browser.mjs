import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
const f = await createFlow({ name: 'circular-z-spread-history', output: process.argv[2], envFrozen: 'CIRCULAR_Z_SPREAD_FROZEN',
 initialFiles: ['apps/cad-studio/test/circular-z-spread-history-browser.mjs','packages/barocss-cad-model/src/app/editFields.ts'],
 qualification: 'Authored Z spread History: signed intent, atomic step updates, refusal recovery and Save/fresh Open.',
 limits: ['No legacy intent inference, arbitrary-angle topology certification or parameter binding for span.'],
 inspectorSource: `import {readFileSync} from 'node:fs';import {partBreps} from '@barocss/cad-model/engine/evaluate';
const doc=JSON.parse(readFileSync(process.argv[2],'utf8'));
console.log(JSON.stringify(partBreps(doc).map(({key,brep})=>({key,points:brep.vertices.map(v=>v.point)}))));
`,
 oracleSource: `import json,sys,itertools
d=json.load(sys.stdin);expected=set()
for x,y,z in itertools.product([10,14],[20,26],[0,8]):
 for k in [0,d['quarter']]:
  u,v=x,y
  for _ in range(k%4):u,v=-v,u
  expected.add((u,v,z))
assert len(d['native'])==1 and d['native'][0]['key']=='b2'
actual=d['native'][0]['points']; assert len(actual)==len(expected)==16
remaining=list(expected); residual=0
for p in actual:
 matches=[q for q in remaining if max(abs(a-b) for a,b in zip(p,q))<=1e-9]
 assert len(matches)==1,(p,matches)
 q=matches[0];residual=max(residual,max(abs(a-b) for a,b in zip(p,q)));remaining.remove(q)
assert not remaining
print(json.dumps({'status':'PASS','uniqueCorners':len(actual),'quarter':d['quarter'],'maxCoordinateResidualMM':residual}))
` });
const doc={format:'barocss-cad-model',schema:3,units:'mm',parameters:{NamedSpread:180},nodes:[
 {kind:'sketch',id:'n0',profile:'rectangle',min:[10,20],max:[14,26]},
 {kind:'extrude',id:'n1',sketch:0,height:8},
 {kind:'circular-pattern',id:'n2',parent:{node:1,side:'solid'},axis:'z',angle:90,count:4,span:360}],
 outputs:{b2:{node:2,side:'solid'}},nextId:3};
const field=n=>f.editor().getByLabel(n,{exact:true});
const b=n=>f.editor().getByRole('button',{name:n,exact:true});
const expected=(span,count,angle)=>({...doc,nodes:[...doc.nodes.slice(0,2),{...doc.nodes[2],span,count,angle}]});
async function physical(label,current,quarter){await f.same(current);const native=await f.inspect(label,current);await f.runOracle({native,quarter},label);}
async function historyState(){return f.page.evaluate(()=>({doc:window.__studioDoc,dirty:!!document.querySelector('[aria-label="Unsaved changes"]'),undo:document.querySelector('[aria-label="Undo"]')?.disabled,redo:document.querySelector('[aria-label="Redo"]')?.disabled}));}
await f.run(async()=>{
 await f.newPage();await f.openFile({name:'z-spread-history.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))},3);await f.same(doc);await f.openFeatureEditor(2);
 assert.equal(await field('Spread over').inputValue(),'360');
 assert.equal(await field('Spread over parameter').count(),0);assert.equal(await field('Axis at X parameter').count(),1);
 await field('Spread over').fill('180');await b('Close editor').click();await f.same(doc);
 await f.openFeatureEditor(2);await field('Spread over').fill('');assert.equal(await b('Apply').isDisabled(),true);await f.same(doc);await f.snapshot('01-blank-spread-retained');
 await field('Spread over').fill('270');const partial=expected(270,4,90);assert.deepEqual((await f.applyEditor(doc,'02-partial-intent')).doc,partial);
 await f.openFeatureEditor(2);await field('Count').fill('2');const positive=expected(270,2,270);assert.deepEqual((await f.applyEditor(partial,'03-two-positive')).doc,positive);await physical('positive',positive,3);
 await f.openFeatureEditor(2);const before=await historyState();await field('Spread over').fill('0');await b('Apply').click();await f.editor().locator('code').filter({hasText:/angle must be a nonzero step/i}).waitFor({state:'attached'});await f.editor().getByText('Kernel detail',{exact:true}).click();await f.editor().locator('code').filter({hasText:/angle must be a nonzero step/i}).waitFor({state:'visible'});assert.deepEqual(await historyState(),before);await f.snapshot('04-zero-refused');
 await field('Spread over').fill('-270');const negative=expected(-270,2,-270);assert.deepEqual((await f.applyEditor(positive,'05-negative-recovery')).doc,negative);await physical('negative',negative,-3);
 await f.undo();await f.same(positive);await f.redo();await f.same(negative);
 const saved=await f.save('z-spread-edited');await f.freshOpen(saved.file,negative,'06-fresh-open');
 await f.openFeatureEditor(2);assert.equal(await field('Spread over').inputValue(),'-270');assert.equal(await field('Count').inputValue(),'2');assert.equal(await field('Spread over parameter').count(),0);await f.snapshot('07-fresh-spread-fields');await b('Close editor').click();await f.same(negative);
});
