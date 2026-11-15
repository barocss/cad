import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
const pins=['apps/cad-studio/src/ui/TwoCurveRoles.tsx','apps/cad-studio/src/ui/ruledEndpointCorrespondence.ts','packages/barocss-cad-model/src/engine/errors.ts'];
const f=await createFlow({name:'ruled-fold-guidance',output:process.argv[2],envFrozen:'D1320_SOURCE_FROZEN',initialFiles:pins,requiredFrozen:pins,
  qualification:'Explain crossed endpoints before creating a folded Ruled surface, refuse Thicken with its actual normal cause, reopen and recover explicitly.',
  limits:['Planar parallel authored quadratic lines, public Reverse and saved folded surface at1024 desktop; general intersection detection and AT NOT_RUN.'],
  inspectorSource:`import {readFileSync} from 'node:fs';import {partSnapshot} from '@barocss/cad-model/engine/part';import {checkBrep,massPropertiesOf} from '@barocss/cad';const d=JSON.parse(readFileSync(process.argv[2],'utf8'));console.log(JSON.stringify(partSnapshot(d).outputs.map(o=>({valid:checkBrep(o.brep,{strict:true}).valid,volume:massPropertiesOf(o).volume,z:[Math.min(...o.brep.vertices.map(v=>v.point[2])),Math.max(...o.brep.vertices.map(v=>v.point[2]))]}))));`});
const source='@model pair {version:0;length-unit:mm; @curve #a {type:nurbs;degree:2;knots:[0,0,0,1,1,1];control-points:[[0,0,0],[10,0,0],[20,0,0]];weights:[1,1,1];} @curve #b {type:nurbs;degree:2;knots:[0,0,0,1,1,1];control-points:[[0,20,0],[10,20,0],[20,20,0]];weights:[1,1,1];}}';
const seed={format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nextId:0,nodes:[],outputs:{},direct:{sources:{s:source},objects:[{id:'a',name:'First line',source:'s',geometry:'a'},{id:'b',name:'Second line',source:'s',geometry:'b'}]}};
const panel=()=>f.page.getByRole('complementary',{name:'Direct geometry',exact:true});
const button=(name,scope=f.page)=>scope.getByRole('button',{name,exact:true});
const select=async(name,shift=false)=>f.page.locator('.ol.direct').filter({hasText:new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}$`)}).click({modifiers:shift?['Shift']:[]});
await f.run(async()=>{
  await f.newPage();await f.page.setViewportSize({width:1024,height:800});await f.openFile({name:'line-pair.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(seed))},0);await f.same(seed);
  await select('Second line');await button('Reverse',panel()).click();await f.changed(seed);const reversed=await f.doc(), reversedObject=reversed.direct.objects.at(-1);
  await select('First line');await select(reversedObject.name,true);
  const correspondence=panel().getByLabel('Ruled endpoint correspondence');await correspondence.getByRole('status').waitFor();assert.match(await correspondence.textContent(),/connections may cross and fold/);
  assert.match(await correspondence.textContent(),/Select one curve alone and use Reverse/);
  await button('Swap curve order',panel()).click();await correspondence.getByRole('status').waitFor();await f.same(reversed);await button('Swap curve order',panel()).click();
  await correspondence.scrollIntoViewIfNeeded();await f.snapshot('crossed-before-create');
  await button('Ruled surface',panel()).click();await f.changed(reversed);const folded=await f.doc(),foldedObject=folded.direct.objects.at(-1);
  const refuse=async(t,label)=>{
    await panel().getByLabel('Thickness',{exact:true}).fill(String(t));await button('Thicken into a body',panel()).click();
    const hud=f.page.getByRole('dialog',{name:'Thicken',exact:true});await hud.locator('.status.error').waitFor();
    await hud.getByText('The surface normal is undefined',{exact:true}).waitFor();assert.match(await hud.textContent(),/Reducing thickness does not repair the fold/);
    assert.equal(await hud.getByText('This outline isn’t a valid profile',{exact:true}).count(),0);assert.equal(await button('Apply',hud).isDisabled(),true);await f.same(folded);await f.snapshot(label);await button('Cancel',hud).click();await f.same(folded);
  };
  await refuse(2,'folded-thicken2-refusal');await refuse(1,'folded-thicken1-refusal');
  const savedFold=await f.save('folded-surface');await f.freshOpen(savedFold.file,savedFold.doc,'folded-reopened');
  await select(foldedObject.name);await refuse(2,'reopened-fold-refusal');
  // Saved files have no prior authoring Undo stack: recover by explicit visibility and source choice.
  await button('Hide',panel()).click();await f.changed(folded);
  await select(reversedObject.name);await button('Hide',panel()).click();
  await select('Second line'); // Hidden original: Browser click explicitly shows it.
  const visible=await f.doc();assert.equal(visible.direct.objects.find(o=>o.id==='b').hidden,false);
  await select('First line');await select('Second line',true);assert.equal(await panel().getByLabel('Ruled endpoint correspondence').getByRole('status').count(),0);
  const before=await f.doc();await button('Ruled surface',panel()).click();await f.changed(before);const recovered=await f.doc();
  await panel().getByLabel('Thickness',{exact:true}).fill('2');await button('Thicken into a body',panel()).click();const hud=f.page.getByRole('dialog',{name:'Thicken',exact:true});await hud.locator('.status.ok').waitFor();await f.same(recovered);await button('Apply',hud).click();await f.changed(recovered);const accepted=await f.doc();
  const verify=async(doc,label)=>{const [body]=await f.inspect(label,doc);assert.equal(body.valid,true);assert.ok(Math.abs(body.volume-800)<1e-7);assert.deepEqual(body.z,[0,2]);};
  await verify(accepted,'recovered-native');assert.equal(accepted.direct.sources.s,seed.direct.sources.s);assert.ok(accepted.direct.objects.some(o=>o.id===foldedObject.id&&o.hidden));
  await f.undo();await f.same(recovered);await f.redo();await f.same(accepted);const saved=await f.save('recovered-thicken');await f.freshOpen(saved.file,saved.doc,'recovered-reopened');await verify(saved.doc,'recovered-reopened-native');
});
