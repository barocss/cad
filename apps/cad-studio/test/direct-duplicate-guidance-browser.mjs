import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { createFlow } from './flow-helper.mjs';
const baseline = process.argv.includes('--baseline');
const seed = { format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nodes:[],outputs:{},nextId:0,direct:{sources:{line:'@model test { version:0; length-unit:mm; @curve #line { type:nurbs; degree:1; knots:[0,0,1,1]; control-points:[[0,0,0],[12,6,0]]; weights:[1,1]; } }'},objects:[{id:'line1',name:'Original curve',source:'line',geometry:'line'}]}};
const pins=['apps/cad-studio/src/ui/DirectPanel.tsx','apps/cad-studio/test/direct-duplicate-guidance-browser.mjs'];
const f=await createFlow({name:'direct-duplicate-guidance',output:process.argv[2],envFrozen:'DIRECT_DUPLICATE_FROZEN',initialFiles:pins,requiredFrozen:pins,qualification:baseline?'Diagnostic: Duplicate has no pre-action relationship explanation':'Explicit independent-copy guidance and existing nonlinked edits',limits:['Synthetic single degree1 curve. No linked-copy feature, trimmed duplication or native geometry evaluator qualification.'],oracleSource:String.raw`import json,sys,re
d=json.load(sys.stdin)
for item in d['items']:
 p=json.loads(re.search(r'control-points\s*:\s*(\[.*?\])\s*;',item['source'],re.S).group(1));assert p==item['expected'],(p,item)
print(json.dumps({'status':'PASS','objects':len(d['items']),'points':[x['expected'] for x in d['items']]}))`});
const panel=()=>f.page.getByRole('complementary',{name:'Direct geometry'});
async function select(name){await f.page.locator('.outliner .ol.direct').and(f.page.getByTitle(name,{exact:true})).click();}
async function verify(doc,expected,label){await f.runOracle({items:doc.direct.objects.map((o,i)=>({source:doc.direct.sources[o.source],expected:expected[i]}))},label);}
await f.run(async()=>{
 const create=f.browser.newContext.bind(f.browser);f.browser.newContext=async options=>{const c=await create({...options,acceptDownloads:false});await c.addInitScript(()=>{const urls=new Map(),create=URL.createObjectURL,click=HTMLAnchorElement.prototype.click;window.__duplicateSaves=[];URL.createObjectURL=function(b){const u=create.call(this,b);urls.set(u,b);return u;};HTMLAnchorElement.prototype.click=function(){const b=urls.get(this.href);if(!b||!this.download.endsWith('.bcad'))return click.call(this);window.__duplicateSaves.push(b.text());};});return c;};
 await f.newPage();const [chooser]=await Promise.all([f.page.waitForEvent('filechooser'),f.page.getByRole('button',{name:'Open',exact:true}).click()]);await chooser.setFiles({name:'duplicate-control.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(seed))});await f.same(seed);await select('Original curve');
 const button=panel().getByRole('button',{name:'Duplicate',exact:true});await button.scrollIntoViewIfNeeded();
 if(baseline){assert.equal(await button.getAttribute('aria-describedby'),null);await f.snapshot('01-no-guidance');f.report.observations.push({label:'baseline',relationshipGuidance:false});return;}
 const note=panel().getByRole('note',{name:'Duplicate relationship'});assert.match(await note.innerText(),/independent copies in the same position/);assert.match(await note.innerText(),/does not update the original/);
 assert.equal(await button.evaluate(e=>document.getElementById(e.getAttribute('aria-describedby'))?.textContent),await note.innerText());await f.snapshot('01-before-duplicate');
 await button.click();await f.changed(seed);const duplicated=await f.doc();assert.equal(duplicated.direct.objects.length,2);const copy=duplicated.direct.objects[1];assert.notEqual(copy.id,'line1');assert.deepEqual(duplicated.direct.objects[0],seed.direct.objects[0]);assert.equal(await panel().getByLabel('Object name',{exact:true}).inputValue(),copy.name);
 await verify(duplicated,[[[0,0,0],[12,6,0]],[[0,0,0],[12,6,0]]],'02-same-position');
 await panel().getByLabel('Control point',{exact:true}).selectOption('1');await panel().getByLabel('X',{exact:true}).fill('18');await panel().getByLabel('X',{exact:true}).press('Enter');await f.changed(duplicated);const copyEdited=await f.doc();assert.deepEqual(copyEdited.direct.objects[0],seed.direct.objects[0]);assert.equal(copyEdited.direct.sources.line,seed.direct.sources.line);
 await verify(copyEdited,[[[0,0,0],[12,6,0]],[[0,0,0],[18,6,0]]],'03-copy-independent');
 await select('Original curve');await panel().getByLabel('Control point',{exact:true}).selectOption('1');await panel().getByLabel('Y',{exact:true}).fill('9');await panel().getByLabel('Y',{exact:true}).press('Enter');await f.changed(copyEdited);const both=await f.doc();assert.deepEqual(both.direct.objects[1],copyEdited.direct.objects[1]);assert.equal(both.direct.sources[both.direct.objects[1].source],copyEdited.direct.sources[copyEdited.direct.objects[1].source]);
 await verify(both,[[[0,0,0],[12,9,0]],[[0,0,0],[18,6,0]]],'04-original-independent');await panel().getByLabel('Weight',{exact:true}).scrollIntoViewIfNeeded();await f.snapshot('04-independent-edits');
 await f.undo();await f.same(copyEdited);await f.undo();await f.same(duplicated);await f.undo();await f.same(seed);await f.redo();await f.same(duplicated);await f.redo();await f.same(copyEdited);await f.redo();await f.same(both);
 await f.page.getByRole('button',{name:'Save',exact:true}).click();await f.page.waitForFunction(()=>window.__duplicateSaves.length===1);const bytes=await f.page.evaluate(()=>window.__duplicateSaves[0]);assert.deepEqual(JSON.parse(bytes),both);const path=process.argv[2]+'/duplicates.bcad';await writeFile(path,bytes);await f.freshOpen(path,both,'05-fresh-open');await verify(await f.doc(),[[[0,0,0],[12,9,0]],[[0,0,0],[18,6,0]]],'05-reopened');
 f.report.observations.push({label:'independent copies',samePosition:true,newCopySelected:true,copyEditOriginalPreserved:true,originalEditCopyPreserved:true,undoRedo:true,nativeSaveFreshOpen:true});
});
