import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const f = await createFlow({ name: 'constraint-mark-acceptance', output: process.argv[2], envFrozen: 'CONSTRAINT_ACCEPTANCE_FROZEN',
  initialFiles: ['apps/cad-studio/test/constraint-mark-acceptance-browser.mjs'],
  qualification: 'Actual desktop high-DPI constraint-family display, draft/history ownership and browser-project roundtrip.',
  limits: ['Two authored planar sketches. Device scale factor 2 is emulated, not physical monitor certification. No physical downloads or native-folder path.'],
  inspectorSource: `import assert from 'node:assert/strict';
import {emptyDoc,withNode} from '@barocss/cad-model/engine/doc';
import {profileOf} from '@barocss/cad-model/sketch/loops';
import {solveShape,applyConstraint,redundancy,type Polygon} from '@barocss/cad-model/sketch/rules';
const square:Polygon={kind:'polygon',closed:true,points:[[0,0],[30,0],[30,30],[0,30]],hv:{h:[],v:[]},rules:[
 {kind:'parallel',a:0,b:2},{kind:'perpendicular',a:0,b:1},{kind:'equal',a:0,b:1},{kind:'fix',point:1,at:[30,0]}]};
assert.equal(redundancy(solveShape(square)),0);
const sector:Polygon={kind:'polygon',closed:true,points:[[0,0],[30,0],[0,30]],bulges:[0,Math.tan(Math.PI/8),0]};
const coincident=applyConstraint(sector,[{kind:'point',i:0},{kind:'edge',i:1}],'coincident');assert.ok('shape'in coincident,JSON.stringify(coincident));
const docs=[square,coincident.shape].map(shape=>{assert.ok(solveShape(shape).ok,JSON.stringify(solveShape(shape)));const p=profileOf([shape]);assert.ok('node'in p);return withNode(emptyDoc(),p.node);});
console.log(JSON.stringify(docs));` });
const button = name => f.page.getByRole('button', { name, exact: true });
const marks = () => f.page.locator('.vp-overlay .cons-glyph');
const titles = () => marks().locator('title').allTextContents();
const expected = ['Parallel edges 1 and 3', 'Parallel edges 1 and 3', 'Perpendicular edges 1 and 2', 'Perpendicular edges 1 and 2', 'Equal edges 1 and 2', 'Equal edges 1 and 2', 'Point 2 fixed'];
const settle = () => f.page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
async function open(doc) { await f.page.locator('input[aria-label="Model file"]').setInputFiles({ name: 'constraint-types.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) }); await f.same(doc); }
async function edit() { await f.page.getByRole('group', { name: 'History', exact: true }).getByRole('button', { name: /^Sketch ·/ }).click(); await f.editor().getByRole('button', { name: 'Edit sketch', exact: true }).click(); await f.sketchPanel().waitFor(); await marks().last().waitFor(); }
async function cancel() { await f.page.evaluate(() => document.activeElement?.blur()); await f.page.keyboard.press('Escape'); await f.sketchPanel().waitFor({ state: 'hidden' }); assert.equal(await marks().count(), 0); }
async function check(label, wanted, doc) {
  f.phase = label; await settle(); assert.deepEqual(await titles(), wanted); await f.same(doc);
  const boxes = await marks().locator('.cons-chip').evaluateAll(nodes => nodes.map(n => { const r=n.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height}; }));
  if (!(await f.page.getByRole('status', { name: 'Constraint symbol crowding', exact: true }).count())) {
    for(let a=0;a<boxes.length;a++)for(let b=a+1;b<boxes.length;b++){
      const p=boxes[a],q=boxes[b];assert.equal(Math.max(0,Math.min(p.x+p.w,q.x+q.w)-Math.max(p.x,q.x))*Math.max(0,Math.min(p.y+p.h,q.y+q.h)-Math.max(p.y,q.y)),0);
    }
  }
  await f.snapshot(label); f.report.observations.push({ label, glyphs:wanted, boxes, devicePixelRatio:await f.page.evaluate(()=>devicePixelRatio) });
}
async function roundtrip(doc) {
 const project='Constraint acceptance',name='constraint-types.bcad';await f.page.locator('.doc-tab input').fill(name.slice(0,-5));
 const versions=()=>f.page.getByRole('complementary',{name:'Versions panel',exact:true});
 const attach=async()=>{if(!(await versions().isVisible()))await button('Project and versions').click();await versions().getByRole('textbox',{name:'Browser project name',exact:true}).fill(project);await versions().getByRole('button',{name:'Project in this browser',exact:true}).click();await versions().getByLabel('Project',{exact:true}).waitFor();};
 await attach();await button('Save').click();await versions().getByRole('list',{name:'Project documents',exact:true}).getByText(name,{exact:true}).waitFor();await f.page.getByLabel('Unsaved changes',{exact:true}).waitFor({state:'hidden'});
 const saved=await f.page.evaluate(async([project,name])=>{const root=await navigator.storage.getDirectory(),dir=await(await root.getDirectoryHandle('projects')).getDirectoryHandle(project);return(await(await dir.getFileHandle(name)).getFile()).text();},[project,name]);assert.deepEqual(JSON.parse(saved),doc);
 await versions().getByRole('button',{name:'Close project',exact:true}).click();await versions().getByLabel('Project',{exact:true}).waitFor({state:'hidden'});await f.page.reload();await f.ready();await attach();await versions().getByRole('button',{name:`Open ${name}`,exact:true}).click();await f.same(doc);await button('Project and versions').click();
}
await f.run(async()=>{
 const [square,sector]=await f.inspect('fixtures',{});await f.newPage({deviceScaleFactor:2});await f.page.setViewportSize({width:1280,height:900});await open(square);await edit();
 const solver=await f.sketchPanel().locator('.solver').textContent();assert.doesNotMatch(await f.sketchPanel().innerText(),/Over-defined/);await check('01-types-dpr2',expected,square);
 const camera=await f.page.evaluate(()=>window.__studioCamera()),box=await f.page.locator('canvas.vp-canvas').boundingBox();
 await f.page.mouse.move(box.x+150,box.y+box.height*.7);await f.page.mouse.wheel(0,450);await f.page.waitForFunction(d=>window.__studioCamera().distance!==d,camera.distance);await check('02-zoom',expected,square);
 await f.page.mouse.down({button:'middle'});await f.page.mouse.move(box.x+180,box.y+box.height*.7+25,{steps:5});await f.page.mouse.up({button:'middle'});await f.page.setViewportSize({width:1024,height:800});await check('03-pan-resize',expected,square);assert.equal(await f.sketchPanel().locator('.solver').textContent(),solver);assert.equal(await f.page.getByLabel('Unsaved changes',{exact:true}).count(),0);
 await button('Normal and fit sketch').click();const remove=f.sketchPanel().getByRole('button',{name:/^Remove Equal /});await remove.click();assert.equal(await marks().count(),5);await f.page.evaluate(()=>document.activeElement?.blur());await f.page.keyboard.press('Meta+z');await check('04-draft-undo',expected,square);await f.page.keyboard.press('Meta+Shift+z');assert.equal(await marks().count(),5);await cancel();await f.same(square);
 await edit();await check('05-cancel-restored',expected,square);await f.sketchPanel().getByRole('button',{name:/^Remove Equal /}).click();await f.page.locator('.topbar button.finish').click();await f.sketchPanel().waitFor({state:'hidden'});await f.changed(square);const edited=await f.doc();assert.equal(edited.nodes[0].outline.rules.length,3);await f.undo();await f.same(square);await edit();await check('06-document-undo',expected,square);await cancel();await f.redo();await f.same(edited);
 await roundtrip(edited);await edit();await check('07-opfs-reopened',expected.filter(t=>!t.startsWith('Equal')),edited);await cancel();
 await open(sector);await edit();await check('08-new-owner-coincident',['Point 1 on the centre of arc 2'],sector);await cancel();await button('New part').click();await f.ready();assert.equal(await marks().count(),0);assert.equal(await f.page.getByRole('status',{name:'Constraint symbol crowding',exact:true}).count(),0);
 assert.deepEqual(f.report.downloads,[]);
});
