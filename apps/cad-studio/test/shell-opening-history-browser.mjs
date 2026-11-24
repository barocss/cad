import assert from 'node:assert/strict';
import {createFlow} from './flow-helper.mjs';
const baseline=process.argv.includes('--baseline');
const sideBaseline = process.argv.includes('--side-baseline');
const sideModes = process.argv.includes('--sides');
const openingUnderTest = sideModes ? 'Right' : 'Top';
const ends = { Left: [0, 0, 'side3'], Right: [0, 1, 'side1'], Front: [1, 0, 'side0'],
  Back: [1, 1, 'side2'], Bottom: [2, 0, 'bottom'], Top: [2, 1, 'top'] };
const pins=['apps/cad-studio/test/shell-opening-history-browser.mjs','packages/barocss-cad-model/src/app/editFields.ts','apps/cad-studio/src/ui/NodeEditor.tsx','packages/barocss-cad-model/src/app/commands.ts'];
pins.push('apps/cad-studio/src/state/rectangleFinishResize.ts','apps/cad-studio/src/state/historyFeatureApply.ts');
if(!baseline)pins.push('apps/cad-studio/src/state/shellOpeningHistory.ts');
const f=await createFlow({name:'shell-opening-history',output:process.argv[2],envFrozen:'SHELL_OPENING_HISTORY_SOURCE_FROZEN',initialFiles:pins,requiredFrozen:pins,qualification:sideModes?'Edit the existing Shell opening between the original side faces in History.':'Edit a terminal rectangular Shell opening among Closed, Top and Bottom in History.',limits:['Three-node rectangle/extrude/Shell,40x30x20,Wall2 only; no fillets, arbitrary face replacement or general Shell admission.'],inspectorSource:`
import {readFileSync} from 'node:fs';
import {partSnapshot} from '@barocss/cad-model/engine/part';
import {checkBrep,massPropertiesOf,faceGeometry} from '@barocss/cad';
const snapshot = partSnapshot(JSON.parse(readFileSync(process.argv[2], 'utf8')));
function loopArea(brep, id, axis) {
  const loop = brep.loops.find(loop => loop.id === id);
  const points = loop.coedges.map(id => {
    const use = brep.coedges.find(coedge => coedge.id === id);
    const edge = brep.edges.find(edge => edge.id === use.edge);
    if (edge.curve.degree !== 1) throw Error('Expected straight rectangle boundary');
    return brep.vertices.find(vertex => vertex.id === edge.vertices[use.sense === 'forward' ? 0 : 1]).point
      .filter((_, i) => i !== axis);
  });
  return Math.abs(points.reduce((twice, p, i) => {
    const q = points[(i + 1) % points.length];
    return twice + p[0] * q[1] - p[1] * q[0];
  }, 0)) / 2 * (loop.kind === 'outer' ? 1 : -1);
}
console.log(JSON.stringify(snapshot.outputs.map(body => ({
  valid: checkBrep(body.brep, { strict: true }).valid, count: body.bodyCount, mass: massPropertiesOf(body),
  shells: body.brep.shells.map(shell => ({ closed: shell.closed })),
  planes: body.brep.faces.map(face => {
    const g = faceGeometry(face);
    if (g.kind !== 'plane') throw Error('Expected cardinal plane');
    const axis = g.n.findIndex(value => Math.abs(value) === 1);
    if (axis < 0) throw Error('Expected cardinal normal');
    const area = face.loops.reduce((sum, loop) => sum + loopArea(body.brep, loop, axis), 0);
    return { origin: g.o, normal: g.n, loops: face.loops.length, area };
  }),
}))));
`});
const source={format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nextId:2,nodes:[{id:'n0',kind:'sketch',profile:'rectangle',min:[0,0],max:[40,30]},{id:'n1',kind:'extrude',sketch:0,height:20}],outputs:{b1:{node:1,side:'solid'}}};
const button=(name,scope=f.page)=>scope.getByRole('button',{name,exact:true});
const opening=()=>f.editor().getByRole('combobox',{name:'Opening',exact:true});
const wall=()=>f.editor().getByLabel('Wall',{exact:true});
const near=(a,b)=>Math.abs(a-b)<1e-7;
async function verify(doc, label, mode) {
  const rows = await f.inspect(label, doc);
  assert.equal(rows.length, 1);
  const n = rows[0], end = ends[mode], extents = [40, 30, 20];
  const lo = extents.map((_, axis) => end?.[0] === axis && end[1] === 0 ? 0 : 2);
  const hi = extents.map((max, axis) => end?.[0] === axis && end[1] === 1 ? max : max - 2);
  const voidVolume = hi.reduce((volume, max, i) => volume * (max - lo[i]), 1);
  const expected = 24000 - voidVolume;
  assert.ok(n.valid && n.count === 1 && near(n.mass.volume, expected));
  assert.equal(n.shells.length, end ? 1 : 2);
  assert.ok(n.shells.every(shell => shell.closed));
  assert.ok(n.mass.centroid.every((x, i) => near(x, (24000 * extents[i] / 2 - voidVolume * (hi[i] + lo[i]) / 2) / expected)));
  const shown = (await f.bodies()).bodies;
  assert.equal(shown.length, 1);
  assert.ok(near(shown[0].volume, expected));
  const area = (extents, axis) => extents.reduce((product, span, i) => i === axis ? product : product * span, 1);
  const innerExtents = hi.map((max, i) => max - lo[i]);
  const plane = (axis, position, normal, expectedArea, capRing = false) => {
    const matches = n.planes.filter(face => near(face.origin[axis], position) && near(face.normal[axis], normal));
    assert.ok(matches.length && near(matches.reduce((sum, face) => sum + face.area, 0), expectedArea),
      JSON.stringify({ mode, axis, position, normal, expectedArea, matches }));
    if (capRing) assert.deepEqual(matches.map(face => face.loops), [2]);
  };
  for (const [i, max] of extents.entries()) {
    const lowerOpen = end?.[0] === i && end[1] === 0, upperOpen = end?.[0] === i && end[1] === 1;
    const outerArea = area(extents, i), innerArea = area(innerExtents, i);
    plane(i, 0, -1, outerArea - (lowerOpen ? innerArea : 0), lowerOpen && i === 2);
    plane(i, max, 1, outerArea - (upperOpen ? innerArea : 0), upperOpen && i === 2);
    if (!lowerOpen) plane(i, lo[i], 1, innerArea);
    if (!upperOpen) plane(i, hi[i], -1, innerArea);
  }
  return n;
}
function checkOpeningChange(old,actual,mode){const open=mode==='Closed'?[]:[`n1.${ends[mode][2]}`];const strip=doc=>({...doc,nodes:doc.nodes.map((n,i)=>{if(i!==2)return n;const next={...n};delete next.sigs;return next;})});assert.deepEqual(strip(actual),{...strip(old),nodes:strip(old).nodes.map((n,i)=>i===2?{...n,open}:n)});assert.deepEqual(Object.keys(actual.nodes[2].sigs).sort(),[...open].sort());for(const name of open){const sig=actual.nodes[2].sigs[name];assert.ok(sig&&typeof sig==='object');}if(!open.length)assert.deepEqual(actual.nodes[2].sigs,{});}
// Hold only delivery of a real matching worker MessageEvent; requests/results are never modified.
function delayActualShellReply(){
 const proto=Worker.prototype,post=proto.postMessage,handler=Object.getOwnPropertyDescriptor(proto,'onmessage'),requests=new WeakMap();let armed=null,target=null,pending=null,deliver=null;
 proto.postMessage=function(request,...rest){let map=requests.get(this);if(!map){map=new Map();requests.set(this,map);}map.set(request.id,{type:request.type,slot:request.slot,id:request.id,revision:request.revision});if(armed&&((armed==='prefix'&&request.type==='part'&&request.slot==='refs')||(armed==='full'&&request.type==='evaluate'))){target={worker:this,id:request.id};armed=null;}return Reflect.apply(post,this,[request,...rest]);};
 Object.defineProperty(proto,'onmessage',{configurable:true,get:handler.get,set(callback){handler.set.call(this,callback&&function(event){if(target?.worker===this&&target.id===event.data?.id&&event.data.result){pending={...requests.get(this).get(event.data.id),ok:event.data.result.ok};deliver=()=>callback.call(this,event);target=null;return;}callback.call(this,event);});}});
 window.__shellOpeningDelay={arm(stage){if(deliver)throw Error('Previous actual reply still held');armed=stage;target=null;pending=null;},read:()=>pending,release(){if(!deliver)throw Error('No actual worker reply held');const fn=deliver;deliver=null;fn();}};
}
async function discardFeatureTransition(){const dialog=f.page.getByRole('dialog',{name:'Discard feature changes?',exact:true});await dialog.waitFor();await button('Discard changes',dialog).click();await dialog.waitFor({state:'hidden'});}
async function delayedOwnership(closed){
 for(const stage of ['prefix','full'])for(const exit of ['cancel','document']){
  await f.page.locator('input[aria-label="Model file"]').setInputFiles({name:`delay-${stage}-${exit}.bcad`,mimeType:'application/json',buffer:Buffer.from(JSON.stringify(closed))});await f.same(closed);await f.ready();await f.openFeatureEditor(2);await opening().selectOption({label:openingUnderTest});await f.page.evaluate(stage=>window.__shellOpeningDelay.arm(stage),stage);await button('Apply',f.editor()).click();await f.page.waitForFunction(()=>!!window.__shellOpeningDelay.read());const held=await f.page.evaluate(()=>window.__shellOpeningDelay.read());assert.equal(held.ok,true);assert.equal(held.type,stage==='prefix'?'part':'evaluate');await f.same(closed);await f.snapshot(`delay-${stage}-${exit}-held`);
  let expected=closed;if(exit==='cancel')await f.closeEditor();else if(stage==='prefix'){await button('New part').click();await discardFeatureTransition();await f.page.waitForFunction(()=>window.__studioDoc.nodes.length===0);expected=await f.doc();}else{await f.page.locator('input[aria-label="Model file"]').setInputFiles({name:'new-owner-stock.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(source))});await discardFeatureTransition();await f.same(source);expected=source;}
  const before=await f.snapshot(`delay-${stage}-${exit}-invalidated`);await f.page.evaluate(()=>window.__shellOpeningDelay.release());await f.page.waitForTimeout(300);await f.page.evaluate(async()=>{for(let i=0;i<4;i++)await new Promise(requestAnimationFrame);});await f.same(expected);const after=await f.snapshot(`delay-${stage}-${exit}-released`);assert.deepEqual(after.history,before.history);if(exit==='cancel')await verify(closed,`delay-${stage}-cancel-native`,'Closed');else if(stage==='full'){const native=await f.inspect('delay-full-open-stock-native',source);assert.equal(native.length,1);assert.ok(native[0].valid&&near(native[0].mass.volume,24000));assert.equal((await f.bodies()).bodies.length,1);}else assert.equal((await f.bodies()).bodies.length,0);f.report.observations.push({label:'actual-reply-owner-invalidation',stage,exit,held,docPreserved:true,historyPreserved:true});
 }
}
await f.run(async()=>{
 const createContext=f.browser.newContext.bind(f.browser);f.browser.newContext=async options=>{const context=await createContext(options);await context.addInitScript(delayActualShellReply);return context;};
 await f.newPage();await f.page.locator('input[aria-label="Model file"]').setInputFiles({name:'shell-stock.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(source))});await f.same(source);await f.ready();const filter=button('Selection filter');for(let i=0;i<6&&!(await filter.innerText()).includes('Bodies');i++)await filter.click();assert.ok((await filter.innerText()).includes('Bodies'));const body=f.page.getByRole('complementary',{name:'Browser',exact:true}).locator('.ol-row > button.ol[title="Double-click to rename"]');assert.equal(await body.count(),1);await body.click();await f.page.waitForFunction(()=>window.__studioSelection.selection.bodies.length===1&&window.__studioSelection.selection.faces.length===0);await button('Modify').click();await button('Shell',f.page.getByRole('group',{name:'Modify',exact:true})).click();const hud=f.page.getByRole('dialog',{name:'Shell',exact:true});await hud.getByLabel('Wall',{exact:true}).fill('2');await hud.locator('.status').filter({hasText:/^preview$/}).waitFor();await button('Apply',hud).click();await f.changed(source);await hud.waitFor({state:'hidden'});await f.ready();const closed=await f.doc();assert.equal(closed.nodes.length,3);assert.equal(closed.nodes[2].kind,'shell');assert.equal(closed.nodes[2].thickness,2);assert.deepEqual(closed.nodes[2].open,[]);const native=await verify(closed,'01-created-closed','Closed');await f.openFeatureEditor(2);
 if(baseline){assert.equal(await opening().count(),0);await f.snapshot('02-baseline-no-opening');await f.closeEditor();const saved=await f.save('baseline-closed-shell');await f.freshOpen(saved.file,saved.doc,'03-baseline-reopened');await f.same(closed);assert.deepEqual(await verify(closed,'04-baseline-native','Closed'),native);return;}
 if (sideBaseline) {
   assert.deepEqual(await opening().locator('option').allTextContents(), ['Closed', 'Top', 'Bottom']);
   await f.same(closed);
   await f.snapshot('02-previous-no-side-opening');
   return;
 }
 let current=closed;for(const mode of sideModes ? ['Right','Back','Left','Front','Closed'] : ['Top','Bottom','Closed']){assert.equal(await wall().inputValue(),'2');await opening().selectOption({label:mode});const old=current;current=(await f.applyEditor(old,'apply-'+mode)).doc;checkOpeningChange(old,current,mode);await verify(current,'native-'+mode,mode);await f.undo();await f.same(old);await f.redo();await f.same(current);const saved=await f.save('shell-'+mode);await f.freshOpen(saved.file,saved.doc,'reopened-'+mode);await f.same(current);await verify(current,'reopened-native-'+mode,mode);await f.openFeatureEditor(2);assert.equal(await opening().locator('option:checked').textContent(),mode);}
 const before=await f.snapshot('05-before-invalid');await opening().selectOption({label:openingUnderTest});await wall().fill('11');await button('Apply',f.editor()).click();await f.editor().getByText('Opening not applied',{exact:true}).waitFor();const combined=await f.snapshot('06-combined-change-refused');await f.same(current);assert.deepEqual(combined.history,before.history);await verify(current,'07-combined-preserved','Closed');
 // Keep the accepted opening unchanged to reach the independent native Wall validation.
 await opening().selectOption({label:'Closed'});assert.equal(await wall().inputValue(),'11');const apply=button('Apply',f.editor());if(await apply.isEnabled()){await apply.click();await f.editor().locator('.hud-error').first().waitFor();assert.equal(await f.editor().getByText('Opening not applied',{exact:true}).count(),0,'Wall-only refusal must not reuse the mixed-opening guard');}else assert.equal(await apply.isDisabled(),true);const refused=await f.snapshot('08-native-wall-eleven-refused');await f.same(current);assert.deepEqual(refused.history,before.history);await verify(current,'09-wall-refusal-preserved','Closed');
 await wall().fill('2');await opening().selectOption({label:openingUnderTest});const recovered=(await f.applyEditor(current,'10-recovered-top-only')).doc;checkOpeningChange(current,recovered,openingUnderTest);await verify(recovered,'11-recovered-opening-native',openingUnderTest);await f.openFeatureEditor(2);await opening().selectOption({label:sideModes?'Left':'Bottom'});await f.closeEditor();await f.same(recovered);await verify(recovered,'12-cancel-preserved',openingUnderTest);const saved=await f.save('recovered-opening');await f.freshOpen(saved.file,saved.doc,'13-recovered-top-reopened');await f.same(recovered);await verify(recovered,'14-recovered-opening-native',openingUnderTest);await button('Iso').click();await f.page.getByTitle('Frame all (F)',{exact:true}).click();await f.snapshot('15-final');await delayedOwnership(closed);
});
