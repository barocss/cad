import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
const f = await createFlow({
 name:'rack-history-module',output:process.argv[2],envFrozen:'RACK_HISTORY_FROZEN',
 initialFiles:['apps/cad-studio/test/rack-history-module-browser.mjs'],
 qualification:'Linked Rack module follows its gear; standalone Module stays editable, with Undo/Redo and reopen.',
 limits:['Straight gear/rack fixtures; no manufacturing qualification or physical download.'],
 inspectorSource:`
import {readFileSync} from 'node:fs';
import {evaluateDoc} from '@barocss/cad-model/engine/evaluate';
const doc=JSON.parse(readFileSync(process.argv[2],'utf8')),r=evaluateDoc(doc,1);
if(!r.ok)throw Error(JSON.stringify(r.error));
console.log(JSON.stringify(r.bodies.map(b=>({key:b.key,volume:b.volume,bounds:b.mesh.bounds,notes:b.notes}))));
`,
 oracleSource:`
import json,sys,math
d=json.load(sys.stdin); span=d['bounds']['max'][0]-d['bounds']['min'][0];expected=10*math.pi*d['module']
assert abs(span-expected)<1e-6,(span,expected)
print(json.dumps({'status':'PASS','nativeMeshRackLength':span,'expectedLength':expected,'expectedPitch':math.pi*d['module']}))
`,
});
const gear={id:'n0',kind:'gear',module:2,teeth:20,faceWidth:10,bore:8,center:[0,0],generator:'spur-gear@1'};
const rack={id:'n1',kind:'rack',module:2,teeth:10,faceWidth:10,height:8,origin:[0,0],mesh:{gear:0},generator:'spur-rack@1'};
const source={format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nodes:[gear,rack],outputs:{b0:{node:0,side:'solid'},b1:{node:1,side:'solid'}},nextId:2};
async function open(doc){await f.page.locator('input[aria-label="Model file"]').setInputFiles({name:'rack.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))});await f.same(doc);}
async function check(doc,index,module,label){const bs=await f.inspect(label,doc),b=bs.find(b=>b.key===`b${index}`);assert.ok(b);await f.runOracle({bounds:b.bounds,module},label);const worker=(await f.bodies()).bodies.find(x=>x.key===b.key);assert.ok(Math.abs(worker.volume-b.volume)<1e-6);}
async function absent(){assert.equal(await f.editor().getByLabel('Module',{exact:true}).count(),0);}
await f.run(async()=>{
 await f.newPage();await open(source);await check(source,1,2,'01-linked-module2');
 await f.openFeatureEditor(1);await absent();await f.snapshot('02-linked-no-module');await f.closeEditor();await f.same(source);
 await f.openFeatureEditor(0);await f.editor().getByLabel('Module',{exact:true}).fill('3');const changed=(await f.applyEditor(source,'03-parent-module3')).doc;
 assert.match(await f.page.locator('[data-browser-body-key="b1"]').innerText(),/Rack m3 × 10/);assert.equal(changed.nodes[0].module,3);assert.equal(changed.nodes[1].module,2,'stored snapshot is not rewritten');await check(changed,1,3,'04-linked-module3');
 await f.undo();await f.same(source);await f.redo();await f.same(changed);
 await f.page.getByRole('button',{name:'New part',exact:true}).click();await f.ready();await open(changed);await f.openFeatureEditor(1);await absent();assert.ok(Math.abs(Number(await f.editor().getByLabel('Root fillet',{exact:true}).inputValue())-1.14)<1e-12);await f.snapshot('05-linked-reopened');await f.closeEditor();
 const bound={...changed,parameters:{M:3},nodes:[{...changed.nodes[0],module:{parameter:'M'}},changed.nodes[1]]};
 await open(bound);assert.match(await f.page.locator('[data-browser-body-key="b1"]').innerText(),/Rack mM × 10/);await f.openFeatureEditor(1);await absent();const root=f.editor().getByLabel('Root fillet',{exact:true});assert.ok(Math.abs(Number(await root.inputValue())-1.14)<1e-12);assert.equal(await root.isEnabled(),true,'parent binding does not bind or lock the root radius');await f.snapshot('06-parent-module-bound-root-editable');await f.closeEditor();await f.same(bound);
 const own={...rack,id:'n0'};delete own.mesh;const standalone={...source,nodes:[own],outputs:{b0:{node:0,side:'solid'}},nextId:1};
 await open(standalone);await f.openFeatureEditor(0);await f.editor().getByLabel('Module',{exact:true}).fill('3');const free=(await f.applyEditor(standalone,'06-standalone-module3')).doc;assert.equal(free.nodes[0].module,3);await check(free,0,3,'07-standalone-module3');
 await f.undo();await f.same(standalone);await f.redo();await f.same(free);await f.openFeatureEditor(0);await f.editor().getByLabel('Module',{exact:true}).fill('4');await f.closeEditor();await f.same(free);assert.deepEqual(f.report.downloads,[]);
});
