import assert from 'node:assert/strict';
import {createFlow} from './flow-helper.mjs';
const baseline=process.argv.includes('--baseline');
const pins=['apps/cad-studio/test/open-polyline-terminal-length-browser.mjs','apps/cad-studio/test/flow-helper.mjs','apps/cad-studio/src/ui/SketchPanel.tsx','apps/cad-studio/src/App.tsx','apps/cad-studio/src/viewport/viewportPointerInput.ts','apps/cad-studio/src/sketch/draftHistory.ts'];
pins.push('apps/cad-studio/src/sketch/openLineLength.ts');
if(!baseline)pins.push('apps/cad-studio/src/sketch/openPolylineTerminalLength.ts');
const f=await createFlow({name:'open-polyline-terminal-length',output:process.argv[2],envFrozen:'OPEN_POLYLINE_TERMINAL_LENGTH_SOURCE_FROZEN',initialFiles:pins,requiredFrozen:pins,qualification:'Observe whether the visible terminal Edge 2 length field of a three-point open polyline changes authored endpoints; independently verify subsequent closed-profile extrusion and Save/Open.',limits:['Three-point axis-aligned open polyline only; readonly controls are never forcibly enabled.','Baseline success means observation and lifecycle passed, not that requested terminal length20 was honored.'],inspectorSource:`
import {readFileSync} from 'node:fs';import {partSnapshot} from '@barocss/cad-model/engine/part';import {checkBrep,massPropertiesOf} from '@barocss/cad';console.log(JSON.stringify(partSnapshot(JSON.parse(readFileSync(process.argv[2],'utf8'))).outputs.map(o=>({id:o.id,count:o.bodyCount,valid:checkBrep(o.brep,{strict:true}).valid,mass:massPropertiesOf(o),vertices:o.brep.vertices.map(v=>v.point)}))));
`});
const button=name=>f.page.getByRole('button',{name,exact:true});
const near=(a,b,t=1e-8)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=t,`${a} != ${b}`);
async function points(){const fields=await f.sketchPanel().locator('input').evaluateAll(es=>es.filter(e=>/^Point \d+ [XY]$/.test(e.getAttribute('aria-label')??'')).map(e=>Number(e.value)));assert.equal(fields.length%2,0);return Array.from({length:fields.length/2},(_,i)=>fields.slice(i*2,i*2+2));}
async function observation(label){const row={label,points:await points(),length:await f.sketchPanel().getByLabel('Edge 2 length',{exact:true}).inputValue(),undo:await button('Undo').isEnabled(),redo:await button('Redo').isEnabled()};f.report.observations.push(row);await f.snapshot(label);return row;}
async function click(p,label){const screen=await f.screenOf(p);await f.page.mouse.move(...screen,{steps:4});const hit=await f.page.evaluate(p=>{const e=document.elementFromPoint(...p);return {canvas:!!e?.closest('canvas.vp-canvas'),tag:e?.tagName,classes:e?.getAttribute('class')};},screen);f.report.observations.push({label,p,hit});await f.persist();assert.equal(hit.canvas,true,'Pointer must reach canvas, not dimension overlay');await f.page.mouse.click(...screen);await f.page.waitForTimeout(150);}
async function geometry(label,doc,y){const rows=await f.inspect(label,doc);assert.equal(rows.length,1);const n=rows[0];assert.equal(n.count,1);assert.ok(n.valid);near(n.mass.volume,30*(y-10)*3,1e-7);near(n.mass.centroid[0],25);near(n.mass.centroid[1],(10+y)/2);near(n.mass.centroid[2],1.5);const expected=[10,40].flatMap(a=>[10,y].flatMap(b=>[0,3].map(c=>[a,b,c])));assert.equal(n.vertices.length,8);const unused=new Set(n.vertices.map((_,i)=>i));for(const p of expected){const matches=[...unused].filter(i=>p.every((v,j)=>Math.abs(v-n.vertices[i][j])<=1e-8));assert.equal(matches.length,1);unused.delete(matches[0]);}f.report.observations.push({label,volume:n.mass.volume,centroid:n.mass.centroid,expectedVolume:30*(y-10)*3});}
await f.run(async()=>{
 await f.newPage();await button('New part').click();await f.page.waitForFunction(()=>window.__studioDoc.nodes.length===0);await f.ready();const empty=await f.doc();await f.page.locator('.mode').getByRole('button',{name:'Sketch',exact:true}).click();await f.sketchPanel().waitFor();await f.frame([[0,0],[60,45]]);await f.tool('Line','l');
 await click([10,10],'first-point');await click([40,10],'second-point');await click([40,25],'third-point');assert.deepEqual(await points(),[[10,10],[40,10],[40,25]]);
 const before=await observation('01-open-polyline-before');assert.equal(Number(before.length),15);
 const field=f.sketchPanel().getByLabel('Edge 2 length',{exact:true});const capability=await field.evaluate(e=>({readOnly:e.readOnly,disabled:e.disabled,title:e.getAttribute('title')}));
 f.report.observations.push({label:'terminal-length-control',...capability,requested:20,attempted:!capability.readOnly&&!capability.disabled});await f.persist();
 if(!baseline){assert.equal(capability.readOnly,false);assert.equal(capability.disabled,false);assert.equal(await f.sketchPanel().getByLabel('Edge 1 length',{exact:true}).evaluate(e=>e.readOnly),true);}
 if(!capability.readOnly&&!capability.disabled){await field.fill('20');await f.page.locator('.topbar button.finish').focus();}
 const after=await observation('02-terminal-length-observed');await f.same(empty);
 assert.equal(after.points.length,3);assert.deepEqual(after.points.slice(0,2),[[10,10],[40,10]]);assert.equal(after.points[2][0],40);
 const y=after.points[2][1];assert.ok(y===25||y===30,'Unexpected authored endpoint: stop rather than weaken the native oracle');
 const changed=JSON.stringify(before.points)!==JSON.stringify(after.points);
 f.report.observations.push({label:'requested-length-observation',requested:20,actualLength:y-10,intendedLengthApplied:y===30,authoredPointsChanged:changed,displayed:after.length,unsupportedReadonly:capability.readOnly});await f.persist();
 if(baseline&&after.undo){await button('Undo').click();f.report.observations.push({label:'03-draft-undo',interpretation:changed?'Observed Undo after changed terminal endpoint':'Existing placement Undo; readonly or ineffective length edit did not establish a length-edit entry',points:await points(),redo:await button('Redo').isEnabled()});await f.snapshot('03-draft-undo');assert.equal(await button('Redo').isEnabled(),true);await button('Redo').click();assert.deepEqual(await points(),after.points);await observation('04-draft-redo');}
 if(!baseline){
  assert.equal(after.length,'20');assert.deepEqual(after.points,[[10,10],[40,10],[40,30]]);assert.equal(y,30);
  const exact=async(lastY,length)=>{assert.deepEqual(await points(),[[10,10],[40,10],[40,lastY]]);assert.equal(Number(await field.inputValue()),length);assert.equal(await f.sketchPanel().getByLabel('Edge 1 length',{exact:true}).evaluate(e=>e.readOnly),true);await f.same(empty);};
  await field.fill('25');await f.page.locator('.topbar button.finish').focus();await exact(35,25);await observation('02b-terminal-length25');
  await button('Undo').click();await exact(30,20);await button('Undo').click();await exact(25,15);
  await button('Undo').click();assert.deepEqual(await points(),[[10,10],[40,10]]);await f.same(empty);await f.snapshot('03-fixed-placement-undo');
  await button('Redo').click();await exact(25,15);await button('Redo').click();await exact(30,20);await button('Redo').click();await exact(35,25);
  await button('Undo').click();await exact(30,20);await observation('04-fixed-edits-redone-return20');
  for(const value of ['0','-1','']){await field.fill(value);await f.page.locator('.topbar button.finish').focus();assert.deepEqual(await points(),[[10,10],[40,10],[40,30]]);await f.same(empty);}
  await f.page.mouse.move(...await f.screenOf([50,38]),{steps:4});assert.deepEqual(await points(),[[10,10],[40,10],[40,30]]);await f.same(empty);await f.snapshot('04b-invalid-and-pointer-preserve');
 }
 await f.same(empty);await click([10,y],'close-top');await click([10,10],'close-left');
 const sketch=(await f.finishSketch('05-finished')).doc;assert.equal(sketch.nodes.length,1);await f.openExtrudeHud();const solid=(await f.applyExtrude({distance:3,previous:sketch,label:'06-extruded'})).doc;
 await geometry('07-native',solid,y);await f.undo();await f.same(sketch);await f.redo();await f.same(solid);await geometry('08-redo-native',solid,y);
 const saved=await f.save('open-polyline-terminal-length');await f.freshOpen(saved.file,saved.doc,'09-reopened');await f.same(solid);await geometry('10-reopened-native',solid,y);await button('Iso').click();await f.page.getByTitle('Frame all (F)',{exact:true}).click();await f.snapshot('11-final');
});
