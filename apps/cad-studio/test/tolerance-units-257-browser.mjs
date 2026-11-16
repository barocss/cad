import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createFlow,sha256 } from './flow-helper.mjs';
const pins=['apps/cad-studio/test/tolerance-units-257-browser.mjs','apps/cad-studio/src/ui/drawing/ToleranceEditor.tsx'];
const f=await createFlow({name:'tolerance-units-257',output:process.argv[2],envFrozen:'TOLERANCE_257_FROZEN',initialFiles:pins,requiredFrozen:pins,
 qualification:'Existing tolerance input labels identify raw mm/degrees independently from inch drawing presentation; actual OPFS saved document feeds independent SVG/DXF readers.',
 limits:['Linear, angle and fit actual UI; diameter/radius/PCD use shared component contract, not native browser fixtures. PDF HOLD. Export writer memory only, no export/download UI.'],
 inspectorSource:`import {drawingInputs} from '@barocss/cad-model/chat/drawing';import {issueContext} from '@barocss/cad-model/drawing/issues';import {sheetSvg} from '@barocss/cad-model/io/svg';import {sheetDxf} from '@barocss/cad-model/io/dxf';const {doc}=JSON.parse(process.argv[3]);const saved=JSON.stringify(doc),input=drawingInputs(doc);if(typeof input==='string')throw Error(input);const c=issueContext(input);const result={doc,svg:sheetSvg(c.sheet,doc.drawing.title ?? 'tolerance-units'),dxf:sheetDxf(c.sheet,c.layout).text};if(JSON.stringify(doc)!==saved)throw Error('mutated');console.log(JSON.stringify(result));`,
 oracleSource:`import sys,json,re,xml.etree.ElementTree as ET
from decimal import Decimal as D
q=json.load(sys.stdin);dim={d['id']:d for d in q['doc']['drawing']['dimensions']};assert dim['L']['tol']==q['expected']
root=ET.fromstring(q['svg']);ns={'s':'http://www.w3.org/2000/svg'}
g=root.find(".//s:g[@data-dim='L']",ns);assert g is not None
texts=[''.join(t.itertext()) for t in g.findall('.//s:text',ns)];joined=' '.join(texts)
# Unit arithmetic is independent of the formatter; check printed endpoints through decimal tokens.
nums=[D(x) for x in re.findall(r'[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)',joined)]
assert D('1') in nums,(joined,nums)
if q['expected']['kind']=='symmetric':assert D('.010') in nums and '±' in joined,(joined,nums)
else:assert D('.010') in nums and D('-.005') in nums,(joined,nums)
assert D('0.254')/D('25.4')==D('.010') and D('-0.127')/D('25.4')==D('-.005')
lines=q['dxf'].splitlines();assert len(lines)%2==0
pairs=[(int(lines[i]),lines[i+1]) for i in range(0,len(lines),2)]
def decode(s):return re.sub(re.escape(chr(92)+'U+')+r'([0-9a-fA-F]{4})',lambda m:chr(int(m[1],16)),s)
dxftexts=[decode(v) for k,v in pairs if k==1]
dxftexts=[t.replace('%%p','±').replace('%%d','°').replace('%%c','Ø') for t in dxftexts]
for t in texts:assert t in dxftexts,(t,dxftexts)
print(json.dumps({'status':'PASS','rawTolerance':dim['L']['tol'],'svgTexts':texts,'dxfTextsMatched':True,'inputUnit':'mm'}))`,
 snapshotExtra:()=>({drawing:window.__studioDrawing?.(),dirty:!!document.querySelector('[aria-label="Unsaved changes"]')})});
const point=x=>({edge:'n1.side0|n1.top',at:'end',near:[x,0,10]});
const base={format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nodes:[{id:'n0',kind:'sketch',profile:'rectangle',min:[0,0],max:[25.4,12]},{id:'n1',kind:'extrude',sketch:0,height:10}],outputs:{b1:{node:1,side:'solid'}},nextId:2};
const doc={...base,drawing:{sheet:'A3',projection:'third',hidden:true,scale:2,views:['front','top','right'],units:'inch',dimensions:[
 {id:'L',kind:'linear',view:'front',a:point(0),b:point(25.4),orient:'horizontal',place:[12.7,18]},
 {id:'A',kind:'angle',view:'front',a:{edge:'n1.side0|n1.top',near:[0,0,10]},b:{edge:'n1.side0|n1.side1',near:[25.4,0,10]},place:[35,18],tol:{kind:'symmetric',value:.5}},
 {id:'F',kind:'linear',view:'front',a:point(0),b:point(25.4),orient:'horizontal',place:[12.7,25],tol:{kind:'fit',code:'h6'}}]}};
const button=n=>f.page.getByRole('button',{name:n,exact:true});
const field=n=>f.page.getByLabel('Tolerance '+n,{exact:true});
const ready=()=>f.page.waitForFunction(()=>window.__studioDrawing?.()&&document.querySelector('svg[aria-label="Drawing sheet"]'));
async function choose(i){await f.page.locator('.dw-dims .dw-dim .dw-annotation-select').nth(i).click();}
async function edit(name,key,value){await field(name).fill(String(value));await field(name).press('Enter');await f.page.waitForFunction(([key,value])=>window.__studioDoc.drawing.dimensions[0].tol?.[key]===value,[key,value]);await ready();}
async function label(name,unit){assert.equal(await field(name).locator('..').locator('span').first().innerText(),name+' ('+unit+')');assert.match(await field(name).getAttribute('aria-description'),unit==='mm'?/millimetres/:/degrees/);}
const versions=()=>f.page.getByRole('complementary',{name:'Versions panel',exact:true});
const project='Tolerance units 257',file='tolerance-units.bcad';
async function attach(){if(!await versions().isVisible())await button('Project and versions').click();await versions().getByRole('textbox',{name:'Browser project name',exact:true}).fill(project);await versions().getByRole('button',{name:'Project in this browser',exact:true}).click();await versions().getByLabel('Project',{exact:true}).waitFor();}
await f.run(async()=>{
 const makeContext=f.browser.newContext.bind(f.browser);f.browser.newContext=async options=>{const c=await makeContext(options);await c.addInitScript(file=>{window.__tolWrites=0;const create=FileSystemFileHandle.prototype.createWritable;FileSystemFileHandle.prototype.createWritable=async function(...args){const stream=await create.apply(this,args);if(this.name===file){const close=stream.close.bind(stream);stream.close=async(...args)=>{const r=await close(...args);window.__tolWrites++;return r;};}return stream;};},file);return c;};
 await f.newPage();await f.openFile({name:file,mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))},2);assert.deepEqual((await f.doc()).nodes,base.nodes);await button('Drawing').click();await ready();await choose(0);await f.page.getByLabel('Tolerance',{exact:true}).selectOption('symmetric');await label('±','mm');await edit('±','value',.254);
 const symmetric=await f.doc();await field('±').focus();await field('±').press('Enter');assert.deepEqual(await f.doc(),symmetric);await f.snapshot('01-symmetric-mm-inch');
 await writeFile(process.argv[2]+'/symmetric-accepted.json',JSON.stringify(symmetric));
 await edit('±','value',.010);assert.equal((await f.doc()).drawing.dimensions[0].tol.value,.010);await f.undo();await f.same(symmetric);await choose(0);await label('±','mm');
 await f.page.getByLabel('Tolerance',{exact:true}).selectOption('deviation');await label('Upper','mm');await label('Lower','mm');await edit('Upper','upper',.254);await edit('Lower','lower',-.127);const deviation=await f.doc();
 await choose(1);await label('±','°');assert.equal(await field('±').inputValue(),'0.5');await choose(2);assert.equal(await field('Fit').locator('..').locator('span').first().innerText(),'Fit');assert.equal(await field('Fit').getAttribute('aria-description'),null);assert.equal(await field('Fit').inputValue(),'h6');await field('Fit').fill('H7');await field('Fit').press('Enter');await f.page.waitForFunction(()=>window.__studioDoc.drawing.dimensions[2].tol.code==='H7');await f.undo();await f.same(deviation);await f.redo();await f.page.waitForFunction(()=>window.__studioDoc.drawing.dimensions[2].tol.code==='H7');
 const beforeUnits=await f.doc();for(const units of ['mm','inch']){await f.page.getByLabel('Drawing units',{exact:true}).selectOption(units);await f.page.waitForFunction(u=>window.__studioDoc.drawing.units===(u==='mm'?undefined:u),units);await choose(0);await label('Upper','mm');assert.deepEqual((await f.doc()).drawing.dimensions,beforeUnits.drawing.dimensions);}
 await f.page.getByLabel('Dual units',{exact:true}).check();await f.page.waitForFunction(()=>window.__studioDoc.drawing.dual===true);await choose(1);await label('±','°');await f.page.getByLabel('Dual units',{exact:true}).uncheck();await f.page.waitForFunction(()=>!window.__studioDoc.drawing.dual);await choose(0);await label('Lower','mm');await f.snapshot('02-deviation-angle-fit-units');
 const final=await f.doc();assert.deepEqual(final.nodes,base.nodes);assert.deepEqual(final.outputs,base.outputs);for(let i=0;i<3;i++){const {tol:_a,...a}=final.drawing.dimensions[i],{tol:_b,...b}=doc.drawing.dimensions[i];void _a;void _b;assert.deepEqual(a,b);}
 await button('Model').click();await attach();const writes=await f.page.evaluate(()=>window.__tolWrites);await button('Save').click();await f.page.waitForFunction(n=>window.__tolWrites>n,writes);
 const bytes=await f.page.evaluate(async([project,file])=>{const root=await navigator.storage.getDirectory(),p=await(await root.getDirectoryHandle('projects')).getDirectoryHandle(project);return(await(await p.getFileHandle(file)).getFile()).text();},[project,file]);assert.deepEqual(JSON.parse(bytes),final);f.report.files.push({name:file,sha256:sha256(bytes),bytes:Buffer.byteLength(bytes)});
 await writeFile(process.argv[2]+'/saved-accepted.json',bytes);
 await versions().getByRole('button',{name:'Close project',exact:true}).click();await f.page.reload();await f.ready();await attach();await versions().getByRole('button',{name:'Open '+file,exact:true}).click();await f.same(final);await button('Drawing').click();await ready();await choose(0);await label('Upper','mm');assert.equal(await field('Upper').inputValue(),'0.254');await choose(1);await label('±','°');await choose(2);assert.equal(await field('Fit').inputValue(),'H7');await f.snapshot('03-reopened-raw-labels');assert.deepEqual(f.report.downloads,[]);
});
