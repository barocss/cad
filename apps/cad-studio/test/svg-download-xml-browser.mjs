import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createFlow } from './flow-helper.mjs';
const nativeRoot=resolve(import.meta.dirname,'../../../packages/barocss-cad');
const nativePackage=JSON.parse(await readFile(join(nativeRoot,'package.json'),'utf8'));
const nativeAliases=Object.entries(nativePackage.exports).map(([key,value])=>({find:new RegExp('^'+(key==='.'?'@barocss/cad':'@barocss/cad/'+key.slice(2))+'$'),replacement:resolve(nativeRoot,value.import)}));
const localSvg=resolve(import.meta.dirname,'../../../packages/barocss-cad-model/src/io/svg.ts');
const f=await createFlow({name:'svg-download-xml',output:process.argv[2],envFrozen:'SVG_DOWNLOAD_FROZEN',
 initialFiles:['apps/cad-studio/test/svg-download-xml-browser.mjs'],viteAliases:[{find:'@barocss/cad-model/io/svg',replacement:localSvg},...nativeAliases],extraFrozen:['packages/barocss-cad-model/src/io/svg.ts'],
 qualification:'Real temporary browser SVG download, fresh independent Python XML file read and fresh browser file open after invalid title refusal.',
 limits:['Single current A3 sheet only; no generic SVG import, PDF/golden repair, native-folder use or multi-file delivery qualification. Existing writer tests cover additional invalid codepoints.']});
const doc={format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nodes:[{id:'n0',kind:'sketch',profile:'rectangle',min:[0,0],max:[32,24]},{id:'n1',kind:'extrude',sketch:0,height:8}],outputs:{b1:{node:1,side:'solid'}},nextId:2,drawing:{sheet:'A3',projection:'third',hidden:false,scale:1,scope:{kind:'part'},title:'SVG text check',views:['front','top'],dimensions:[]}};
const good='한글 Ø ± & < > " 😀';
const button=name=>f.page.getByRole('button',{name,exact:true});
const state=()=>f.page.evaluate(()=>({doc:window.__studioDoc,selection:window.__studioSelection,dirty:!!document.querySelector('[aria-label="Unsaved changes"]'),undo:['Undo','Redo'].map(n=>{const b=document.querySelector(`button[aria-label="${n}"]`);if(!b)throw Error(n+' absent');return{disabled:b.disabled,tip:b.getAttribute('data-tip')};})}));
const oracle=String.raw`import json,sys,xml.etree.ElementTree as E
p,title=sys.argv[1:];root=E.parse(p).getroot();ns={'s':'http://www.w3.org/2000/svg'}
assert root.tag=='{http://www.w3.org/2000/svg}svg'
assert root.find('s:title',ns).text==title
assert root.attrib['width']=='420mm' and root.attrib['height']=='297mm'
assert root.attrib['viewBox']=='0 0 420 297'
views={}
for name,height in [('front',8),('top',24)]:
 groups=[g for g in root.findall('.//s:g',ns) if g.attrib.get('class')=='view' and g.attrib.get('data-view')==name]
 assert len(groups)==1,(name,len(groups))
 lines=groups[0].findall('.//s:line',ns)
 pts=[(float(l.attrib[x]),float(l.attrib[y])) for l in lines for x,y in [('x1','y1'),('x2','y2')]]
 assert pts,name
 width=max(p[0] for p in pts)-min(p[0] for p in pts);h=max(p[1] for p in pts)-min(p[1] for p in pts)
 assert abs(width-32)<1e-8 and abs(h-height)<1e-8,(name,width,h)
 views[name]={'lineCount':len(lines),'width':width,'height':h}
print(json.dumps({'title':title,'width':root.attrib['width'],'height':root.attrib['height'],'viewBox':root.attrib['viewBox'],'views':views},ensure_ascii=False))
`;
await f.run(async()=>{
 await f.newPage();await f.openFile({name:'svg-download-fixture.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))},2);assert.deepEqual(await f.doc(),doc);await button('Drawing').click();await f.page.locator('svg[aria-label="Drawing sheet"] g.view').first().waitFor();
 const title=f.page.getByLabel('Drawing title',{exact:true});await title.fill('A\u0001B');await title.blur();await f.page.waitForFunction(()=>window.__studioDoc.drawing.title==='A\u0001B');
 const before=await state();f.phase='invalid control refused before download';await button('Export SVG').click();await f.page.getByText('SVG not written',{exact:true}).waitFor();assert.deepEqual(await state(),before);assert.equal(f.report.downloads.length,0);assert.equal(await f.page.getByRole('group',{name:'Confirm drawing export'}).count(),0);await f.snapshot('01-invalid-no-download');await button('Dismiss').click();
 await title.fill(good);await title.blur();await f.page.waitForFunction(t=>window.__studioDoc.drawing.title===t,good);const repaired=await state();
 f.phase='real SVG download after explicit repair';const [download]=await Promise.all([f.page.waitForEvent('download'),button('Export SVG').click()]);assert.match(download.suggestedFilename(),/\.svg$/);const file=join(f.output,'downloaded-unicode.svg');await download.saveAs(file);assert.equal(await download.failure(),null);const bytes=await readFile(file);assert.ok(bytes.length>0);assert.deepEqual(await state(),repaired);assert.equal(f.report.downloads.length,1);
 const parser=join(f.output,'fresh-xml-check.py');await writeFile(parser,oracle);const result=spawnSync('python3',[parser,file,good],{encoding:'utf8'});await writeFile(join(f.output,'xml-parser.stdout.txt'),result.stdout??'');await writeFile(join(f.output,'xml-parser.stderr.txt'),result.stderr??'');assert.equal(result.status,0,result.stderr);const parsed=JSON.parse(result.stdout);
 await f.snapshot('02-repaired-real-download');
 const context=await f.browser.newContext();try{const page=await context.newPage();await page.goto(pathToFileURL(file).href);const opened=await page.evaluate(()=>({errors:document.querySelectorAll('parsererror').length,title:document.querySelector('svg > title')?.textContent,width:document.querySelector('svg')?.getAttribute('width'),height:document.querySelector('svg')?.getAttribute('height')}));assert.deepEqual(opened,{errors:0,title:good,width:'420mm',height:'297mm'});await writeFile(join(f.output,'fresh-browser-xml.json'),JSON.stringify(opened,null,2));f.report.observations.push({freshBrowserFileOpen:opened});}finally{await context.close();f.report.cleanup.push('XML_FILE_CONTEXT_CLOSED');}
 assert.deepEqual(await state(),repaired);f.report.files.push({label:'actual browser downloaded SVG',path:file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});f.report.observations.push({independentFileParser:parsed,invalidDownloadCount:0,validDownloadCount:1,sourceAlias:localSvg,rawFileBytesReadAfterSaveAs:true});
});
