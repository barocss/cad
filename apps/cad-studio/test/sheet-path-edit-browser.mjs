import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createFlow, sha256 } from './flow-helper.mjs';
const baseline = process.argv.includes('--baseline');
const pins = ['apps/cad-studio/test/sheet-path-edit-browser.mjs', 'packages/barocss-cad-model/src/app/editFields.ts', 'apps/cad-studio/src/ui/NodeEditor.tsx'];
const f = await createFlow({ name: 'sheet-path-edit', output: process.argv[2], envFrozen: 'SHEET_PATH_SOURCE_FROZEN', initialFiles: pins, requiredFrozen: pins,
  qualification: baseline ? 'Record missing Sheet profile History path fields' : 'Edit original local sheet path coordinates through History, preserve rules and compare folded and flat geometry',
  limits: ['One literal orthogonal L, two leg lengths, desktop WebGPU. No angle field, arbitrary contour, bend table, calibrated manufacturing, DXF export or full-domain geometry qualification.'],
  inspectorSource: `
import {readFileSync} from 'node:fs';
import {toPartDocument} from '@barocss/cad-model/engine/part';
import {evaluateCadPart,massPropertiesOf,flatPatternOf,checkOutput} from '@barocss/cad';
const doc=JSON.parse(readFileSync(process.argv[2],'utf8'));
console.log(JSON.stringify(evaluateCadPart(toPartDocument(doc)).outputs.map(out=>({id:out.id,count:out.bodyCount,mass:massPropertiesOf(out),valid:checkOutput(out).valid,sheet:out.sheet,flat:flatPatternOf(out),brep:out.brep}))));
`, snapshotExtra: () => ({ dirty: !!document.querySelector('[aria-label="Unsaved changes"]'), controls: ['Undo','Redo'].map(n=>document.querySelector('button[aria-label="'+n+'"]')?.disabled) }) });
const button = (scope,name) => scope.getByRole('button',{name,exact:true});
const field = (scope,name) => scope.getByLabel(name,{exact:true});
const versions = () => f.page.getByRole('complementary',{name:'Versions panel',exact:true});
const name='sheet-path.bcad',project='sheet-path-'+randomUUID();
const source=(a=40,b=30)=>({format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nodes:[{id:'n0',kind:'sheet-contour',path:[[0,b],[0,0],[a,0]],side:'left',width:30,thickness:1.5,bendRadius:1.5,kFactor:.44,plane:{origin:[0,30,0],normal:[0,-1,0],xAxis:[1,0,0]}}],outputs:{b0:{node:0,side:'solid'}},nextId:1});
const near=(a,b,label)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=1e-9*Math.max(1,Math.abs(b)),`${label}: ${a} != ${b}`);
async function geometry(label,a,b){
  await f.same(source(a,b));const rows=await f.inspect(label,await f.doc());assert.equal(rows.length,1);const n=rows[0];assert.equal(n.id,'n0');assert.equal(n.count,1);assert.equal(n.valid,true);
  const volume=30*1.5*(a+b-6+Math.PI/2*2.25),length=a+b-6+Math.PI/2*(1.5+.44*1.5);
  near(n.mass.volume,volume,'native folded volume');const worker=await f.bodies();assert.equal(worker.bodies.length,1);near(worker.bodies[0].volume,volume,'Worker folded volume');
  assert.equal(n.sheet.thickness,1.5);assert.equal(n.sheet.bendRadius,1.5);assert.equal(n.sheet.kFactor,.44);assert.equal(n.sheet.bends.length,1);assert.equal(n.sheet.bends[0].name,'n0.bend1');near(n.sheet.bends[0].angle,90,'bend angle');
  const flat=n.flat;assert.equal(flat.loops.length,1);assert.equal(flat.bends.length,1);assert.equal(flat.bends[0].name,'n0.bend1');near(flat.bends[0].allowance,Math.PI/2*(1.5+.44*1.5),'allowance');
  const loop=flat.loops[0];assert.equal(loop.outer,true);assert.equal(loop.segments.length,4);assert.ok(loop.segments.every(s=>s.kind==='line'));
  const lengths=loop.segments.map(s=>Math.hypot(s.b[0]-s.a[0],s.b[1]-s.a[1])).sort((a,b)=>a-b);[30,30,length,length].sort((a,b)=>a-b).forEach((v,i)=>near(lengths[i],v,'flat side '+i));
  const points=loop.segments.map(s=>s.a);const area=Math.abs(points.reduce((s,p,i)=>{const q=points[(i+1)%4];return s+p[0]*q[1]-p[1]*q[0];},0))/2;near(area,30*length,'flat area');
  f.report.observations.push({label,a,b,volume,length,flatArea:area,nativeSHA256:sha256(JSON.stringify(n.brep)),authority:'flatPatternOf original live evaluated output; independent closed-form dimensions'});await f.persist();return n;
}
async function edit(label,value,a,b){await f.openFeatureEditor(0,label);const before=await f.doc();await field(f.editor(),label).fill(String(value));await f.applyEditor(before,`edit-${a}-${b}`);await geometry(`native-${a}-${b}`,a,b);}
await f.run(async()=>{
  await f.newPage();await f.page.locator('input[aria-label="Model file"]').setInputFiles({name,mimeType:'application/json',buffer:Buffer.from(JSON.stringify(source()))});await f.same(source());await button(f.page,'Iso').click();await f.page.getByTitle('Frame all (F)',{exact:true}).click();await geometry('initial',40,30);await f.openFeatureEditor(0);
  if(baseline){assert.equal(await field(f.editor(),'Path point 3 local X').count(),0);assert.equal(await field(f.editor(),'Path point 1 local Y').count(),0);await f.snapshot('00-baseline-missing-path-fields');await f.closeEditor();await f.same(source());return;}
  assert.equal(await field(f.editor(),'Path point 3 local X').inputValue(),'40');assert.equal(await field(f.editor(),'Path point 1 local Y').inputValue(),'30');await f.closeEditor();
  await edit('Path point 3 local X',50,50,30);await edit('Path point 1 local Y',35,50,35);
  const accepted=await f.snapshot('01-accepted');const nativeBefore=await geometry('before-invalid',50,35);await f.openFeatureEditor(0);await field(f.editor(),'Path point 3 local X').fill('0');await button(f.editor(),'Apply').click();await f.editor().locator('.hud-error').first().waitFor();await f.same(source(50,35));const refused=await f.snapshot('02-coincident-refused');assert.match(refused.editor,/coincident|zero|short|length|segment|path|bend/i);assert.deepEqual(refused.controls,accepted.controls);assert.equal(refused.dirty,accepted.dirty);assert.deepEqual(refused.history,accepted.history);assert.deepEqual((await geometry('refused-native',50,35)).brep,nativeBefore.brep);
  await field(f.editor(),'Path point 3 local X').fill('51');await f.editor().locator('.hud-error').waitFor({state:'hidden'});await button(f.editor(),'Apply').waitFor();assert.equal(await button(f.editor(),'Apply').isEnabled(),true);await f.closeEditor();await geometry('cancel-recovered',50,35);
  await f.undo();await geometry('undo-y',50,30);await f.undo();await geometry('undo-x',40,30);await f.redo();await geometry('redo-x',50,30);await f.redo();await geometry('redo-y',50,35);
  async function attach(){if(!(await versions().isVisible()))await button(f.page,'Project and versions').click();await versions().getByRole('textbox',{name:'Browser project name',exact:true}).fill(project);await button(versions(),'Project in this browser').click();await field(versions(),'Project').waitFor();}
  await attach();await button(f.page,'Save').click();await versions().getByRole('list',{name:'Project documents',exact:true}).getByText(name,{exact:true}).waitFor();await f.page.getByLabel('Unsaved changes',{exact:true}).waitFor({state:'hidden'});
  const bytes=Buffer.from(await f.page.evaluate(async([project,name])=>{const root=await navigator.storage.getDirectory(),projects=await root.getDirectoryHandle('projects'),dir=await projects.getDirectoryHandle(project),file=await(await dir.getFileHandle(name)).getFile();return Array.from(new Uint8Array(await file.arrayBuffer()));},[project,name]));assert.deepEqual(JSON.parse(bytes),source(50,35));f.report.files.push({name,bytes:bytes.length,sha256:sha256(bytes)});
  await button(versions(),'Close project').click();await field(versions(),'Project').waitFor({state:'hidden'});await f.page.reload();await f.page.waitForSelector('.viewport[data-renderer="webgpu"]');await f.ready();await attach();await button(versions(),'Open '+name).click();await geometry('reopened',50,35);await f.openFeatureEditor(0);assert.equal(await field(f.editor(),'Path point 3 local X').inputValue(),'50');assert.equal(await field(f.editor(),'Path point 1 local Y').inputValue(),'35');await f.closeEditor();await button(f.page,'Iso').click();await f.page.getByTitle('Frame all (F)',{exact:true}).click();await f.snapshot('03-reopened-iso');
});
