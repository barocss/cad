import assert from 'node:assert/strict';
import { writeFile, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
const nativeRoot=resolve(import.meta.dirname,'../../../packages/barocss-cad');
const nativePackage=JSON.parse(await readFile(join(nativeRoot,'package.json'),'utf8'));
const nativeAliases=Object.entries(nativePackage.exports).map(([key,value])=>({find:new RegExp('^'+(key==='.'?'@barocss/cad':'@barocss/cad/'+key.slice(2))+'$'),replacement:resolve(nativeRoot,value.import)}));
const localSvg=resolve(import.meta.dirname,'../../../packages/barocss-cad-model/src/io/svg.ts');
import { createFlow } from './flow-helper.mjs';
const f=await createFlow({name:'svg-invalid-text',output:process.argv[2],envFrozen:'SVG_TEXT_FROZEN',
 initialFiles:['apps/cad-studio/test/svg-invalid-text-browser.mjs'],viteAliases:[{find:'@barocss/cad-model/io/svg',replacement:localSvg},...nativeAliases],extraFrozen:['packages/barocss-cad-model/src/io/svg.ts'],
 qualification:'Actual Drawing title admission, XML-invalid SVG refusal and valid Unicode recovery before file delivery.',
 limits:['Blob bytes are captured before browser download. Physical downloaded-file acceptance is NOT_RUN. No PDF or general SVG import claim.']});
const doc={format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nodes:[{id:'n0',kind:'sketch',profile:'rectangle',min:[0,0],max:[32,24]},{id:'n1',kind:'extrude',sketch:0,height:8}],outputs:{b1:{node:1,side:'solid'}},nextId:2,drawing:{sheet:'A3',projection:'third',hidden:false,scale:1,scope:{kind:'part'},title:'SVG text check',views:['front','top'],dimensions:[]}};
const button=name=>f.page.getByRole('button',{name,exact:true});
await f.run(async()=>{
 await f.newPage();await f.page.locator('input[aria-label="Model file"]').setInputFiles({name:'svg-text.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))});await f.page.waitForFunction(()=>window.__studioDoc?.drawing?.title==='SVG text check');await f.ready();assert.deepEqual(await f.doc(),doc);await button('Drawing').click();await f.page.locator('svg[aria-label="Drawing sheet"] g.view').first().waitFor();
 await f.page.evaluate(()=>{const create=URL.createObjectURL,click=HTMLAnchorElement.prototype.click,blobs=new Map();window.__svgCaptures=[];URL.createObjectURL=function(blob){const url=create.call(this,blob);blobs.set(url,blob);return url;};HTMLAnchorElement.prototype.click=function(){const blob=blobs.get(this.href);if(!blob||!this.download.endsWith('.svg'))return click.call(this);window.__svgCaptures.push(blob.text());};});
 const title=f.page.getByLabel('Drawing title',{exact:true});
 for(const bad of ['A\u0001B','A\uFFFEB']){
  const before=await f.doc();await title.fill(bad);await title.blur();await f.changed(before);const invalid=await f.doc();assert.equal(invalid.drawing.title,bad);
  const count=await f.page.evaluate(()=>window.__svgCaptures.length);await button('Export SVG').click();await f.page.getByText('SVG not written',{exact:true}).waitFor();await f.same(invalid);assert.equal(await f.page.evaluate(()=>window.__svgCaptures.length),count);assert.equal(await f.page.getByRole('group',{name:'Confirm drawing export'}).count(),0);
  await f.snapshot(bad.includes('\u0001')?'control-refused':'noncharacter-refused');
  const good='한글 Ø ± & < > " 😀';await title.fill(good);await title.blur();await f.changed(invalid);const repaired=await f.doc();await button('Export SVG').click();await f.page.waitForFunction(n=>window.__svgCaptures.length===n+1,count);const svg=await f.page.evaluate(()=>window.__svgCaptures.at(-1));
  const parsed=await f.page.evaluate(svg=>{const xml=new DOMParser().parseFromString(svg,'image/svg+xml');return{errors:xml.querySelectorAll('parsererror').length,title:xml.querySelector('title')?.textContent,width:xml.documentElement.getAttribute('width'),height:xml.documentElement.getAttribute('height'),viewBox:xml.documentElement.getAttribute('viewBox'),lines:xml.querySelectorAll('line,path,polyline').length};},svg);
  assert.equal(parsed.errors,0);assert.equal(parsed.title,good);assert.equal(parsed.width,'420mm');assert.equal(parsed.height,'297mm');assert.equal(parsed.viewBox,'0 0 420 297');assert.ok(parsed.lines>0);await f.same(repaired);await writeFile(join(f.output,`valid-${count}.svg`),svg);
  await f.undo();await f.same(invalid);await f.redo();await f.same(repaired);f.report.observations.push({badCodepoint:bad.codePointAt(1),refused:true,sourceUnchanged:true,recovery:parsed,firstUndoRedo:true});
 }
 await f.snapshot('unicode-recovered');assert.deepEqual(f.report.downloads,[]);
});
