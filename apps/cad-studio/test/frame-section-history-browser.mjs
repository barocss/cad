import assert from 'node:assert/strict';
import {createFlow} from './flow-helper.mjs';
const f=await createFlow({name:'frame-section-history',output:process.argv[2],envFrozen:'FRAME_SECTION_FROZEN',initialFiles:['apps/cad-studio/test/frame-section-history-browser.mjs'],qualification:'Library-based Frame and member History replace only their section row and retain Cancel/Undo/reopen.',limits:['Two local test section rows and straight members; no catalogue import or manufacturing qualification. No physical downloads.'],inspectorSource:`
import {readFileSync} from 'node:fs';import {evaluateDoc} from '@barocss/cad-model/engine/evaluate';const r=evaluateDoc(JSON.parse(readFileSync(process.argv[2],'utf8')),0);if(!r.ok)throw Error(JSON.stringify(r));console.log(JSON.stringify(r.bodies.map(b=>({volume:b.volume,bounds:b.mesh.bounds,notes:b.notes}))));
`,oracleSource:`
import json,sys
p=json.load(sys.stdin); b=p['b']; w=p['width']
for got,want in zip(b['bounds']['min'],[0,0,0]):assert abs(got-want)<1e-6,(got,want)
for got,want in zip(b['bounds']['max'],[w,10,100]):assert abs(got-want)<1e-6,(got,want)
assert abs(b['volume']-(w*10-(w-4)*6)*100)<1e-6,b
print(json.dumps({'status':'PASS','width':w,'volume':b['volume']}))
`});
const rows=[20,30].map(w=>({id:`R${w}`,name:`Test RHS ${w}`,section:{kind:'rect-tube',width:w,height:10,wall:2,outerRadius:0},source:'local test fixture'}));
const doc=node=>({format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nodes:[{...node,id:'n0',section:{kind:'library',id:'R20'},anchor:'bottom-left',up:[0,1,0]}],frames:{version:1,sections:rows},outputs:{b0:{node:0,side:'solid'}},nextId:1});
async function open(d){await f.page.locator('input[aria-label="Model file"]').setInputFiles({name:'frame-section.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(d))});await f.same(d);}
async function check(d,width,label){const bs=await f.inspect(label,d);assert.equal(bs.length,1);await f.runOracle({b:bs[0],width},label);assert.ok(Math.abs((await f.bodies()).bodies[0].volume-bs[0].volume)<1e-6);}
await f.run(async()=>{
 await f.newPage();
 for(const [kind,node] of [['member',{kind:'frame-member',start:[0,0,0],end:[0,0,100]}],['frame',{kind:'frame',points:[[0,0,0],[0,0,100]],segments:[[0,1]],corners:{default:'none',multi:'none',tee:'none'}}]]){
  const source=doc(node);await open(source);await check(source,20,`${kind}-01-R20`);await f.openFeatureEditor(0);const field=f.editor().getByLabel('Section row',{exact:true});assert.equal(await field.inputValue(),'R20');assert.equal(await f.editor().getByLabel('id',{exact:true}).count(),0);await field.selectOption('R30');await f.closeEditor();await f.same(source);
  await f.openFeatureEditor(0);await f.editor().getByLabel('Section row',{exact:true}).selectOption('R30');const changed=(await f.applyEditor(source,`${kind}-02-R30`)).doc;assert.deepEqual(changed.nodes[0],{...source.nodes[0],section:{kind:'library',id:'R30'}});assert.deepEqual(changed.frames,source.frames);await check(changed,30,`${kind}-03-bounds`);
  await f.undo();await f.same(source);await f.redo();await f.same(changed);await f.page.getByRole('button',{name:'New part',exact:true}).click();await f.ready();await open(changed);await f.openFeatureEditor(0);assert.equal(await f.editor().getByLabel('Section row',{exact:true}).inputValue(),'R30');await f.snapshot(`${kind}-04-reopened`);await f.editor().getByLabel('Section row',{exact:true}).selectOption('R20');const restored=(await f.applyEditor(changed,`${kind}-05-R20`)).doc;assert.equal(restored.nodes[0].section.id,'R20');await check(restored,20,`${kind}-06-restored`);
 }
 assert.deepEqual(f.report.downloads,[]);
});
