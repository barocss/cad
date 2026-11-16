import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFlow } from './flow-helper.mjs';
const f = await createFlow({ name: 'browser-selection-reveal', output: process.argv[2], envFrozen: 'BROWSER_SELECTION_REVEAL_FROZEN',
  initialFiles: ['apps/cad-studio/test/browser-selection-reveal-browser.mjs','apps/cad-studio/test/fixtures/nested-mate.bcad'],
  requiredFrozen: ['apps/cad-studio/src/App.tsx','apps/cad-studio/src/ui/OutlinerInstances.tsx'],
  qualification: 'Exact placed occurrence reveal expands only its ancestors and preserves the read-only nested selection.',
  limits: ['Two desktop sizes, two same-named hosts with a shared definition and depth-three path. No new viewport picking or geometry capability.'] });
const base = JSON.parse(await readFile(new URL('./fixtures/nested-mate.bcad', import.meta.url), 'utf8'));
const empty = () => ({ format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nodes:[],outputs:{},nextId:0 });
const part = (id, doc, position=[0,0,0]) => ({ id,name:'Same',doc,position,rotation:[0,0,0] });
const leafDoc = base.instances[0].doc.instances[0].doc;
const innerDoc = { ...empty(), instances: [part('p1',leafDoc),part('p2',leafDoc,[20,0,0]),{...part('hidden',leafDoc,[40,0,0]),hidden:true}] };
const subDoc = { ...empty(), instances:[part('level',{...empty(),instances:[part('inner',innerDoc)]})] };
const seed = { ...base, instances:[...Array.from({length:24},(_,i)=>part(`f${i}`,leafDoc,[(i%6)*15,40+Math.floor(i/6)*15,0])),
  {...part('sub1',subDoc),part:{id:'shared',rev:'A'}},{...part('sub2',subDoc,[80,0,0]),part:{id:'shared',rev:'A'}}] };
const path='sub1/level/inner/p2';
const button=name=>f.page.getByRole('button',{name,exact:true});
const row=p=>f.page.locator(`button[data-browser-instance-path="${p}"]`);
const caret=p=>row(p).locator('..').locator(':scope > .ol-caret');
const reveal=()=>button('Show selection in Browser');
async function read(){return f.page.evaluate(()=>({doc:window.__studioDoc,baseSelection:window.__studioSelection,
  nested:document.querySelector('[data-testid="nested-path"]')?.textContent??null,
  card:document.querySelector('[aria-label="Nested part"]')?.textContent??null,
  eye:window.__studioEye(),screen:window.__studioScreenOf([0,0,0]),bounds:window.__studioInstanceBounds(),
  dirty:!!document.querySelector('[aria-label="Unsaved changes"]'),
  history:['Undo','Redo'].map(n=>{const b=document.querySelector(`button[aria-label="${n}"]`);return[b.disabled,b.getAttribute('data-tip')];}),
  windowScroll:[window.scrollX,window.scrollY]}));}
async function visible(p){return row(p).evaluate(el=>{let s=el.parentElement;while(s&&(!/(auto|scroll)/.test(getComputedStyle(s).overflowY)||s.scrollHeight<=s.clientHeight))s=s.parentElement;
  const a=el.getBoundingClientRect(),b=s?.getBoundingClientRect();return{focus:document.activeElement===el,visible:!!b&&a.top>=b.top&&a.bottom<=b.bottom,scroll:s?.scrollTop};});}
async function open(doc){await f.page.locator('input[aria-label="Model file"]').setInputFiles({name:'nested-reveal.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))});await f.same(doc);
  await f.page.waitForFunction(()=>window.__studioInstanceBounds?.().length===26);}
async function saveReopen(doc,label){
  const project=`Reveal ${label}`,name=`reveal-${label}.bcad`;
  await f.page.locator('.doc-tab input').fill(name.slice(0,-5));
  const panel=()=>f.page.getByRole('complementary',{name:'Versions panel',exact:true});
  const attach=async()=>{if(!(await panel().isVisible()))await button('Project and versions').click();
    await panel().getByRole('textbox',{name:'Browser project name',exact:true}).fill(project);
    await panel().getByRole('button',{name:'Project in this browser',exact:true}).click();await panel().getByLabel('Project',{exact:true}).waitFor();};
  await attach();await button('Save').click();
  await panel().getByRole('list',{name:'Project documents',exact:true}).getByText(name,{exact:true}).waitFor();
  await f.page.getByLabel('Unsaved changes',{exact:true}).waitFor({state:'hidden'});
  const saved=await f.page.evaluate(async([project,name])=>{const root=await navigator.storage.getDirectory(),dir=await(await root.getDirectoryHandle('projects')).getDirectoryHandle(project);return(await(await dir.getFileHandle(name)).getFile()).text();},[project,name]);
  assert.deepEqual(JSON.parse(saved),doc);
  await panel().getByRole('button',{name:'Close project',exact:true}).click();await panel().getByLabel('Project',{exact:true}).waitFor({state:'hidden'});
  await f.page.reload();await f.ready();await attach();await panel().getByRole('button',{name:`Open ${name}`,exact:true}).click();await f.same(doc);
  assert.equal(await f.page.locator('button[data-browser-instance-path="sub1/level"]').count(),0,'Tree request/state is not restored from the document');
  await f.snapshot(`${label}-saved-reopened`);
}
await f.run(async()=>{
 for(const width of [1024,1440]){
  await f.newPage();await f.page.setViewportSize({width,height:width===1024?800:900});await open(seed);
  await caret('sub2').click(); // unrelated expansion must survive the reveal and Browser collapse
  for(const p of ['sub1','sub1/level','sub1/level/inner'])await caret(p).click();
  await row(path).click();
  await f.page.getByRole('complementary',{name:'Nested part',exact:true}).getByText('1000 mm³',{exact:true}).waitFor();
  for(const p of ['sub1/level/inner','sub1/level','sub1'])await caret(p).click();
  assert.equal(await row(path).count(),0);
  const before=await read();await reveal().click();assert.deepEqual(await read(),before);
  assert.ok((await visible(path)).focus);assert.ok((await visible(path)).visible);
  assert.equal(await caret('sub2').getAttribute('aria-expanded'),'true');
  assert.equal(await caret('sub2/level').getAttribute('aria-expanded'),'false');
  assert.equal(await row('sub1/level/inner/hidden').count(),0);
  assert.equal(await row('sub2/level/inner/p2').count(),0);
  const top=(await visible(path)).scroll;await reveal().click();assert.equal((await visible(path)).scroll,top);assert.deepEqual(await read(),before);
  await f.snapshot(`${width}-nested-exact-path`);
  await button('Collapse the browser').click();const closed=await read();await reveal().click();assert.deepEqual(await read(),closed);assert.ok((await visible(path)).focus);
  assert.equal(await caret('sub2').getAttribute('aria-expanded'),'true');
  await reveal().focus();const keyboard=await read();await reveal().press('Enter');assert.deepEqual(await read(),keyboard);assert.ok((await visible(path)).focus);
  // Top-level host remains a top-level selection, not a leaf or another same-named occurrence.
  await row('sub2').click();const host=await read();await reveal().click();assert.deepEqual(await read(),host);assert.ok((await visible('sub2')).focus);
  assert.equal(await f.page.getByRole('complementary',{name:'Nested part',exact:true}).count(),0);
  await f.snapshot(`${width}-top-level-host`);
  // A normal edit after navigation is still the first Undo, with no reveal step in history.
  await f.page.locator('[data-browser-body-key="b1"]').dblclick();const name=f.page.getByRole('textbox',{name:'Body name',exact:true});await name.fill('Renamed after reveal');await name.press('Enter');await f.changed(seed);const edited=await f.doc();
  await f.undo();await f.same(seed);await f.redo();await f.same(edited);
  await saveReopen(edited,String(width));
  f.report.observations.push({width,exactPath:path,unrelatedOpen:'sub2',sameDefinitionHosts:['sub1','sub2'],undoRedo:true,opfsRoundtrip:true});
 }
 assert.deepEqual(f.report.downloads,[]);
});
