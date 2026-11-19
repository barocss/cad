import assert from 'node:assert/strict';
import {createFlow} from './flow-helper.mjs';
import {clickModelCommand} from './model-rail-helper.mjs';
function box(parameter,height,width){return{format:'barocss-cad-model',schema:3,units:'mm',parameters:{[parameter]:height},nodes:[{id:'n0',kind:'sketch',profile:'rectangle',min:[0,0],max:[width,5]},{id:'n1',kind:'extrude',sketch:0,height:{parameter}}],outputs:{b1:{node:1,side:'solid'}},nextId:2,variability:{version:1,inputs:[{name:'size',type:'number',unit:'mm',min:1,max:100,default:height,bindings:[{to:'parameter',part:'base',parameter}]}]}};}
const a=box('HeightA',20,6),b=box('HeightB',10,10);
const f=await createFlow({name:'variant-new-boundary',output:process.argv[2],envFrozen:'CAD256_NEW_FROZEN',initialFiles:['apps/cad-studio/src/App.tsx','apps/cad-studio/src/state/useVariants.ts','apps/cad-studio/test/flow-helper.mjs','apps/cad-studio/test/model-rail-helper.mjs'],requiredFrozen:['apps/cad-studio/src/App.tsx'],qualification:'#256 A working40 -> public New part -> independent B default10 first evaluation',limits:['New boundary only. No repeat cancellation, OPFS, export, A rerun or alternative routes. External evidence driver; product unchanged.'],oracleSource:`import json,math,sys
r=json.load(sys.stdin); v,c={'A':(1200,[3,2.5,20]),'B':(500,[5,2.5,5])}[r['case']]
assert len(r['bodies'])==1
b=r['bodies'][0]
assert math.isclose(b['volume'],v,abs_tol=1e-9,rel_tol=0)
assert all(math.isclose(x,y,abs_tol=1e-9,rel_tol=0) for x,y in zip(b['centroid'],c))
print(json.dumps({'status':'PASS','volume':v,'centroid':c}))`});
const panel=()=>f.page.getByRole('complementary',{name:'Variants panel',exact:true});
async function show(){if(!await panel().isVisible())await clickModelCommand(f.page,'Inspect','Variants');await panel().waitFor();}
async function open(doc){const [chooser]=await Promise.all([f.page.waitForEvent('filechooser'),f.page.getByRole('button',{name:'Open',exact:true}).click()]);await chooser.setFiles({name:'same-name.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))});await f.same(doc);}
async function geometry(label,volume,key){await f.page.waitForFunction(v=>{const s=window.__studioBodies?.();return window.__studioFresh&&s?.fresh&&s.massReady&&s.bodies.length===1&&Math.abs(s.bodies[0].volume-v)<1e-9;},volume);const s=await f.snapshot(label);await f.runOracle({case:key,bodies:s.bodies.bodies},label);}
await f.run(async()=>{
 await f.newPage();await f.page.evaluate(()=>{const original=Worker.prototype.postMessage;window.__newRequests=[];Worker.prototype.postMessage=function(m,...args){if(m?.type==='evaluate')window.__newRequests.push({id:m.id,revision:m.revision,parameters:m.doc?.doc?.parameters??null,nodes:m.doc?.doc?.nodes?.length??null});return original.call(this,m,...args);};});
 f.phase='A owned working40';await open(a);await show();await panel().getByLabel('Value of size',{exact:true}).fill('40');await geometry('01-A-working40',1200,'A');await f.same(a);
 f.phase='public New empty no-input boundary';await f.page.getByRole('button',{name:'New part',exact:true}).click();await f.page.waitForFunction(()=>window.__studioDoc?.nodes?.length===0);await f.ready();const empty=await f.doc();assert.equal(empty.nodes.length,0);assert.equal(empty.variability,undefined);assert.ok(!('HeightA' in (empty.parameters??{})));assert.equal(await panel().getByLabel('Value of size',{exact:true}).count(),0);await f.snapshot('02-New-empty');f.report.observations.push({label:'empty-document',doc:empty});
 f.phase='public B Open first default evaluation';await f.page.evaluate(()=>window.__newRequests=[]);await open(b);await show();assert.equal(await panel().getByLabel('Value of size',{exact:true}).inputValue(),'10');await geometry('03-B-default10',500,'B');await f.same(b);const requests=await f.page.evaluate(()=>window.__newRequests);assert.ok(requests.length>0);assert.ok(requests.every(r=>r.parameters?.HeightB===10&&!('HeightA' in r.parameters)));f.report.observations.push({label:'first-and-all-B-requests',requests});assert.deepEqual(f.report.downloads,[]);await f.persist();
});
