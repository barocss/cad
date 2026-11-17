import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createFlow, sha256 } from './flow-helper.mjs';
const baseline = process.argv.includes('--baseline');
const pins = ['apps/cad-studio/test/shaft-location-edit-browser.mjs', 'packages/barocss-cad-model/src/app/editFields.ts', 'apps/cad-studio/src/ui/NodeEditor.tsx'];
const f = await createFlow({ name: 'shaft-location-edit', output: process.argv[2], envFrozen: 'SHAFT_LOCATION_SOURCE_FROZEN', initialFiles: pins, requiredFrozen: pins,
  qualification: baseline ? 'Record missing Shaft History axial position fields' : 'Edit original shaft keyseat and groove axial positions through History and compare native physical locations',
  limits: ['One literal shaft, one square keyseat and one ring groove. No manufacturing validation, assemblies, general Boolean proof or arbitrary cutter families.'],
  inspectorSource: `
import {readFileSync} from 'node:fs';
import {toPartDocument} from '@barocss/cad-model/engine/part';
import {evaluateCadPart,massPropertiesOf,checkOutput,faceGeometry} from '@barocss/cad';
const doc=JSON.parse(readFileSync(process.argv[2],'utf8'));
console.log(JSON.stringify(evaluateCadPart(toPartDocument(doc)).outputs.map(out=>({id:out.id,count:out.bodyCount,mass:massPropertiesOf(out),valid:checkOutput(out).valid,shaft:out.shaft,brep:out.brep,faces:out.brep.faces.map(face=>({name:face.name,geometry:faceGeometry(face),points:face.loops.flatMap(id=>out.brep.loops.find(l=>l.id===id).coedges.flatMap(id=>{const c=out.brep.coedges.find(c=>c.id===id),e=out.brep.edges.find(e=>e.id===c.edge);return e.vertices.map(id=>out.brep.vertices.find(v=>v.id===id).point);} ))}))}))));
`, snapshotExtra: () => ({ dirty: !!document.querySelector('[aria-label="Unsaved changes"]'), controls: ['Undo','Redo'].map(n=>document.querySelector('button[aria-label="'+n+'"]')?.disabled) }) });
const button = (scope,name) => scope.getByRole('button',{name,exact:true});
const field = (scope,name) => scope.getByLabel(name,{exact:true});
const versions = () => f.page.getByRole('complementary',{name:'Versions panel',exact:true});
const name='shaft-location.bcad',project='shaft-location-'+randomUUID();
const source=(offset=4,at=8)=>({format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nodes:[{id:'n0',kind:'shaft',generator:'shaft@0',center:[12,-8],from:7,steps:[{diameter:20,length:30,keyseats:[{width:4,depth:3,length:10,offset,ends:'square'}]},{diameter:30,length:40},{diameter:20,length:30,grooves:[{diameter:18,width:2,at}]}]}],outputs:{b0:{node:0,side:'solid'}},nextId:1});
const near=(a,b,label)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=1e-9*Math.max(1,Math.abs(b)),`${label}: ${a} != ${b}`);
async function geometry(label,offset,at){
  await f.same(source(offset,at));const rows=await f.inspect(label,await f.doc());assert.equal(rows.length,1);const n=rows[0];assert.equal(n.id,'n0');assert.equal(n.count,1);assert.equal(n.valid,true);
  // Integral[-2,2] sqrt(100-y*y)-7 dy; the axial cut is 10 mm long.
  const keyArea=2*Math.sqrt(96)+100*Math.asin(.2)-28,keyVolume=keyArea*10,grooveVolume=Math.PI*19*2;
  const stockVolume=Math.PI*(100*60+225*40),volume=stockVolume-keyVolume-grooveVolume;
  const stockMoment=Math.PI*(100*30*22+225*40*57+100*30*92);
  const cz=(stockMoment-keyVolume*(7+offset+5)-grooveVolume*(77+at+1))/volume;
  near(n.mass.volume,volume,'native volume');near(n.mass.centroid[2],cz,'native axial centroid');
  const worker=await f.bodies();assert.equal(worker.bodies.length,1);near(worker.bodies[0].volume,volume,'Worker volume');near(worker.bodies[0].centroid[2],cz,'Worker axial centroid');
  assert.equal(n.shaft.generator,'shaft@0');assert.equal(n.shaft.manufacturingValidated,false);assert.equal(n.shaft.keyseats.length,1);assert.equal(n.shaft.grooves.length,1);near(n.shaft.keyseats[0].from,offset,'local keyseat report');near(n.shaft.grooves[0].from,70+at,'local groove report');
  const keyfaces=n.faces.filter(face=>/^n0\.keyseat1(?:[.#]|$)/.test(face.name??''));assert.ok(keyfaces.length>0,'named native keyseat faces');const z=keyfaces.flatMap(face=>face.points.map(p=>p[2]));assert.ok(z.length>0);near(Math.min(...z),7+offset,'keyseat physical start');near(Math.max(...z),17+offset,'keyseat physical end');
  for(const [wall,level] of [[1,77+at],[2,79+at]]){const faces=n.faces.filter(face=>(face.name??'').split('#')[0]===`n0.groovewall1.${wall}`);assert.ok(faces.length>0,'groove wall '+wall);for(const face of faces){assert.equal(face.geometry.kind,'plane');near(face.geometry.o[2],level,'groove plane');assert.ok(face.points.length>0);face.points.forEach(p=>near(p[2],level,'groove physical endpoint'));}}
  f.report.observations.push({label,offset,at,volume,cz,keyArea,nativeSHA256:sha256(JSON.stringify(n.brep)),authority:'original live native output; independent stock-minus-cut volume and axial first moment'});await f.persist();return n;
}
async function edit(label,value,a,b){await f.openFeatureEditor(0,label);const before=await f.doc();await field(f.editor(),label).fill(String(value));await f.applyEditor(before,`edit-${a}-${b}`);await geometry(`native-${a}-${b}`,a,b);}
await f.run(async()=>{
  await f.newPage();await f.page.locator('input[aria-label="Model file"]').setInputFiles({name,mimeType:'application/json',buffer:Buffer.from(JSON.stringify(source()))});await f.same(source());await button(f.page,'Iso').click();await f.page.getByTitle('Frame all (F)',{exact:true}).click();await geometry('initial',4,8);await f.openFeatureEditor(0);
  if(baseline){assert.equal(await field(f.editor(),'Keyseat 1 (step 1) from step start').count(),0);assert.equal(await field(f.editor(),'Groove 1 (step 3) from step start').count(),0);await f.snapshot('00-baseline-missing-location-fields');await f.closeEditor();await f.same(source());return;}
  assert.equal(await field(f.editor(),'Keyseat 1 (step 1) from step start').inputValue(),'4');assert.equal(await field(f.editor(),'Groove 1 (step 3) from step start').inputValue(),'8');await f.closeEditor();
  await edit('Keyseat 1 (step 1) from step start',10,10,8);await edit('Groove 1 (step 3) from step start',15,10,15);
  const accepted=await f.snapshot('01-accepted');const nativeBefore=await geometry('before-invalid',10,15);await f.openFeatureEditor(0);await field(f.editor(),'Keyseat 1 (step 1) from step start').fill('25');await button(f.editor(),'Apply').click();await f.editor().locator('.hud-error').first().waitFor();await f.same(source(10,15));const refused=await f.snapshot('02-keyseat-overflow-refused');assert.match(refused.editor,/keyseat|runs off|step/i);assert.deepEqual(refused.controls,accepted.controls);assert.equal(refused.dirty,accepted.dirty);assert.deepEqual(refused.history,accepted.history);assert.deepEqual((await geometry('refused-native',10,15)).brep,nativeBefore.brep);
  await field(f.editor(),'Keyseat 1 (step 1) from step start').fill('11');await f.editor().locator('.hud-error').waitFor({state:'hidden'});await button(f.editor(),'Apply').waitFor();assert.equal(await button(f.editor(),'Apply').isEnabled(),true);await f.closeEditor();await geometry('cancel-recovered',10,15);
  await f.undo();await geometry('undo-y',10,8);await f.undo();await geometry('undo-x',4,8);await f.redo();await geometry('redo-x',10,8);await f.redo();await geometry('redo-y',10,15);
  async function attach(){if(!(await versions().isVisible()))await button(f.page,'Project and versions').click();await versions().getByRole('textbox',{name:'Browser project name',exact:true}).fill(project);await button(versions(),'Project in this browser').click();await field(versions(),'Project').waitFor();}
  await attach();await button(f.page,'Save').click();await versions().getByRole('list',{name:'Project documents',exact:true}).getByText(name,{exact:true}).waitFor();await f.page.getByLabel('Unsaved changes',{exact:true}).waitFor({state:'hidden'});
  const bytes=Buffer.from(await f.page.evaluate(async([project,name])=>{const root=await navigator.storage.getDirectory(),projects=await root.getDirectoryHandle('projects'),dir=await projects.getDirectoryHandle(project),file=await(await dir.getFileHandle(name)).getFile();return Array.from(new Uint8Array(await file.arrayBuffer()));},[project,name]));assert.deepEqual(JSON.parse(bytes),source(10,15));f.report.files.push({name,bytes:bytes.length,sha256:sha256(bytes)});
  await button(versions(),'Close project').click();await field(versions(),'Project').waitFor({state:'hidden'});await f.page.reload();await f.page.waitForSelector('.viewport[data-renderer="webgpu"]');await f.ready();await attach();await button(versions(),'Open '+name).click();await geometry('reopened',10,15);await f.openFeatureEditor(0);assert.equal(await field(f.editor(),'Keyseat 1 (step 1) from step start').inputValue(),'10');assert.equal(await field(f.editor(),'Groove 1 (step 3) from step start').inputValue(),'15');await f.closeEditor();await button(f.page,'Iso').click();await f.page.getByTitle('Frame all (F)',{exact:true}).click();await f.snapshot('03-reopened-iso');
  f.phase='multiple grooves retain dimensions but refuse position editing';
  const multiple=source(10,15);multiple.nodes[0].steps[2].grooves.push({diameter:17,width:1,at:23});
  await button(versions(),'Close project').click();await field(versions(),'Project').waitFor({state:'hidden'});
  await f.page.locator('input[aria-label="Model file"]').setInputFiles({name:'shaft-multiple-grooves.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(multiple))});await f.same(multiple);await f.openFeatureEditor(0);
  const limitation='Groove positions are editable only on steps with one groove. Moving multiple grooves past one another can change named references.';
  await f.editor().getByText(limitation,{exact:true}).waitFor();
  assert.equal(await f.editor().getByLabel(/^Groove .*from step start$/).count(),0);
  assert.equal(await field(f.editor(),'Keyseat 1 (step 1) from step start').inputValue(),'10');
  const diameters=field(f.editor(),'Groove (step 3) Ø'),widths=field(f.editor(),'Groove (step 3) width');
  assert.equal(await diameters.count(),2);assert.equal(await widths.count(),2);
  for(const [i,value] of ['18','17'].entries())assert.equal(await diameters.nth(i).inputValue(),value);
  for(const [i,value] of ['2','1'].entries())assert.equal(await widths.nth(i).inputValue(),value);
  await f.same(multiple);assert.equal(await button(f.editor(),'Apply').isEnabled(),false);await f.snapshot('04-multiple-groove-position-limitation');await f.closeEditor();await f.same(multiple);
  f.report.observations.push({label:'multiple-groove-position-limitation',limitation,positionFields:0,diameterFields:2,widthFields:2,documentPreserved:true});await f.persist();

});
