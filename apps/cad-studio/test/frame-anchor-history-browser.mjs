import assert from 'node:assert/strict';
import {createFlow} from './flow-helper.mjs';
const f=await createFlow({name:'frame-anchor-history',output:process.argv[2],envFrozen:'FRAME_ANCHOR_FROZEN',initialFiles:['apps/cad-studio/test/frame-anchor-history-browser.mjs'],qualification:'Frame and member History anchors match creation and retain geometry through Undo/Redo and reopen.',limits:['Straight rectangular-tube fixtures, no section catalogue replacement or manufacturing qualification. No physical downloads.'],inspectorSource:`
import {readFileSync} from 'node:fs';import {evaluateDoc} from '@barocss/cad-model/engine/evaluate';
const r=evaluateDoc(JSON.parse(readFileSync(process.argv[2],'utf8')),0);if(!r.ok)throw Error(JSON.stringify(r));console.log(JSON.stringify(r.bodies.map(b=>({volume:b.volume,bounds:b.mesh.bounds}))));
`,oracleSource:`
import json,sys
p=json.load(sys.stdin); b=p['b']; anchored=p['anchor']=='bottom-left'
lo=[0,0,0] if anchored else [-10,-5,0]; hi=[20,10,100] if anchored else [10,5,100]
for got,want in zip(b['bounds']['min'],lo): assert abs(got-want)<1e-6,(got,want)
for got,want in zip(b['bounds']['max'],hi): assert abs(got-want)<1e-6,(got,want)
assert abs(b['volume']-(20*10-16*6)*100)<1e-6,b
print(json.dumps({'status':'PASS','anchor':p['anchor'],'volume':b['volume']}))
`});
const section={kind:'rect-tube',width:20,height:10,wall:2,outerRadius:0};
const doc=node=>({format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nodes:[{...node,id:'n0',section,up:[0,1,0]}],outputs:{b0:{node:0,side:'solid'}},nextId:1});
async function open(d){await f.page.locator('input[aria-label="Model file"]').setInputFiles({name:'frame-anchor.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(d))});await f.same(d);}
async function check(d,anchor,label){const bs=await f.inspect(label,d);assert.equal(bs.length,1);await f.runOracle({b:bs[0],anchor},label);assert.ok(Math.abs((await f.bodies()).bodies[0].volume-bs[0].volume)<1e-6);}
await f.run(async()=>{
 await f.newPage();
 for(const [kind,node,label] of [['member',{kind:'frame-member',start:[0,0,0],end:[0,0,100]},'Line through'],['frame',{kind:'frame',points:[[0,0,0],[0,0,100]],segments:[[0,1]],corners:{default:'none',multi:'none',tee:'none'}},'Lines through']]){
  const source=doc(node);await open(source);await check(source,'centroid',`${kind}-01-centroid`);await f.openFeatureEditor(0);const field=f.editor().getByLabel(label,{exact:true});assert.equal(await field.inputValue(),'centroid');assert.equal(await field.locator('option').count(),11);await field.selectOption('bottom-left');await f.closeEditor();await f.same(source);
  await f.openFeatureEditor(0);await f.editor().getByLabel(label,{exact:true}).selectOption('bottom-left');const changed=(await f.applyEditor(source,`${kind}-02-bottom-left`)).doc;assert.equal(changed.nodes[0].anchor,'bottom-left');await check(changed,'bottom-left',`${kind}-03-bounds`);
  await f.undo();await f.same(source);await f.redo();await f.same(changed);await f.page.getByRole('button',{name:'New part',exact:true}).click();await f.ready();await open(changed);await f.openFeatureEditor(0);assert.equal(await f.editor().getByLabel(label,{exact:true}).inputValue(),'bottom-left');await f.snapshot(`${kind}-04-reopened`);await f.editor().getByLabel(label,{exact:true}).selectOption('centroid');const restored=(await f.applyEditor(changed,`${kind}-05-centroid`)).doc;assert.equal(Object.hasOwn(restored.nodes[0],'anchor'),false);await check(restored,'centroid',`${kind}-06-restored`);
 }
 assert.deepEqual(f.report.downloads,[]);
});
