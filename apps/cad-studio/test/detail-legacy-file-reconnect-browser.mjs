import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFlow, sha256 } from './flow-helper.mjs';
const bytes=await readFile(process.argv[3]);assert.equal(sha256(bytes),'bc1dd3656b39d2a25b5984452cec15b2e8fa96fa60b307bdb20e9e6f4b53fec0');const base=JSON.parse(bytes);
const f=await createFlow({name:'detail-legacy-file-reconnect',output:process.argv[2],envFrozen:'LEGACY_DETAIL_FROZEN',initialFiles:['apps/cad-studio/test/detail-legacy-file-reconnect-browser.mjs'],qualification:'The historical 06-lost-diameter.bcad is retained and explicitly reconnected to visible clipped ink.',limits:['One byte-pinned historical desktop file, SVG/DXF captured in memory before browser delivery; no physical download or PDF.'],oracleSource:`import json,math,re,sys,xml.etree.ElementTree as E
p=json.load(sys.stdin);root=E.fromstring(p['svg']);ns={'s':'http://www.w3.org/2000/svg'}
g=root.find(".//s:g[@class='dimension'][@data-dim='d1']",ns);assert g is not None
assert any('Ø8' in (t.text or '') for t in g.findall('s:text',ns))
a=g.find("s:path[@fill='#000']",ns);x,y=map(float,re.match(r'M([-0-9.]+) ([-0-9.]+)',a.get('d')).groups())
assert abs(x-307.5)<1e-4 and abs(abs(y-85)-5*math.sqrt(15)/2)<1e-4
assert abs(math.hypot(x-290,y-85)-20)<1e-4 and abs(math.hypot(x-310,y-85)-10)<1e-4
assert root.find(".//s:g[@class='dimension'][@data-dim='top-diameter']",ns) is not None
lines=p['dxf'].splitlines();pairs=list(zip(map(int,lines[::2]),[s.strip() for s in lines[1::2]],strict=True));starts=[i for i,(k,v) in enumerate(pairs) if k==0];dims=[dict(pairs[i+1:j]) for i,j in zip(starts,starts[1:]) if pairs[i]==(0,'DIMENSION')]
assert len(dims)==2
selected=[d for d in dims if 15 in d and abs(float(d[15])-x)<1e-4 and abs(297-float(d[25])-y)<1e-4];assert len(selected)==1
assert abs(float(selected[0][42])-8)<1e-8
assert abs(math.hypot(float(selected[0][10])-x,297-float(selected[0][20])-y)-40)<2e-4
print(json.dumps({'status':'PASS','tip':[x,y],'cropRadius':10,'sourceRadius':20,'diameter':8,'topControlRetained':True}))
`});
const start=f.start;f.start=async()=>{await start();const newContext=f.browser.newContext.bind(f.browser);f.browser.newContext=async options=>{const c=await newContext({...options,acceptDownloads:false});await c.addInitScript(()=>{const blobs=new Map(),create=URL.createObjectURL,click=HTMLAnchorElement.prototype.click;URL.createObjectURL=function(b){const u=create.call(this,b);blobs.set(u,b);return u;};HTMLAnchorElement.prototype.click=function(){const b=blobs.get(this.href);if(b&&/\.(svg|dxf)$/.test(this.download)){window.__legacyExport=b.text();blobs.delete(this.href);return;}return click.call(this);};});return c;};};
const button=(name,scope=f.page)=>scope.getByRole('button',{name,exact:true});const preview=()=>f.page.getByRole('group',{name:'Confirm diameter reattachment',exact:true});
async function open(doc){await f.page.locator('input[aria-label="Model file"]').setInputFiles({name:'historical-lost-diameter.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))});await f.page.waitForFunction(()=>window.__studioDoc?.drawing?.dimensions?.some(d=>d.id==='d1'),null,{timeout:30000});await f.ready();assert.deepEqual(await f.doc(),doc);await button('Drawing').click();await f.page.waitForFunction(()=>window.__studioDrawing?.()?.details?.some(d=>d.id==='B'),null,{timeout:30000});}
async function exportText(command){await f.page.evaluate(()=>{window.__legacyExport=null;});await button(command).click();await f.page.waitForFunction(()=>!!window.__legacyExport,null,{timeout:30000});return f.page.evaluate(()=>window.__legacyExport);}
await f.run(async()=>{await f.newPage();await open(base);const original=await f.doc();await f.page.waitForFunction(()=>window.__studioDrawing?.()?.dimensions?.some(d=>d.id==='d1'&&d.lost),null,{timeout:30000});assert.equal(original.drawing.dimensions.find(d=>d.id==='d1').edge,'n1.bottom|n2.side0#2');await f.snapshot('01-historical-original');
 await button('Reattach diameter d1').click();const p=await f.page.evaluate(()=>window.__studioDrawingAt('detail:B',35.6842,14.4423));await f.page.mouse.click(p.x,p.y);await preview().waitFor();await f.same(original);await button('Reattach',preview()).click();await f.changed(original);const repaired=await f.doc(),old=original.drawing.dimensions.find(d=>d.id==='d1'),next=repaired.drawing.dimensions.find(d=>d.id==='d1');assert.match(next.edge,/^n1\.top\|n2\.side0#/);assert.deepEqual(next,{...old,edge:next.edge,near:next.near});assert.deepEqual(repaired,{...original,drawing:{...original.drawing,dimensions:original.drawing.dimensions.map(d=>d.id==='d1'?next:d)}});await f.snapshot('02-historical-reconnected');await f.undo();await f.same(original);await f.redo();await f.same(repaired);
 await button('New part').click();await f.ready();await open(repaired);await f.page.waitForFunction(()=>Math.abs(window.__studioDrawing?.()?.dimensions?.find(d=>d.id==='d1')?.value-8)<1e-8,null,{timeout:30000});await f.snapshot('03-historical-reopened');const svg=await exportText('Export SVG'),dxf=await exportText('Export DXF');await f.runOracle({svg,dxf},'historical-reconnected-outputs');f.report.files.push({label:'historical original',sha256:sha256(bytes)},{label:'reconnected SVG',sha256:sha256(svg)},{label:'reconnected DXF',sha256:sha256(dxf)});assert.deepEqual(f.report.downloads,[]);
});
