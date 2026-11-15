import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
const pins = ['apps/cad-studio/src/App.tsx', 'apps/cad-studio/src/ui/DirectInspector.tsx', 'apps/cad-studio/src/ui/DirectPanel.tsx', 'apps/cad-studio/src/ui/TwoCurveRoles.tsx', 'apps/cad-studio/src/ui/ruledMidpointNormal.ts'];
const f = await createFlow({ name: 'two-curve-roles', output: process.argv[2], envFrozen: 'D1319_SOURCE_FROZEN', initialFiles: pins, requiredFrozen: pins,
  qualification: 'Swap Direct curve roles without history edits; verify both Sweep and Ruled orientations, normal-side Thicken and history editing.',
  limits: ['Authored planar line-pair sources at 1024 desktop; no general curved-surface direction or AT claim.'],
  inspectorSource: `import {readFileSync} from 'node:fs';
import {analyzeSurface} from '@barocss/cad-model/engine/direct';
import {partSnapshot} from '@barocss/cad-model/engine/part';
import {checkBrep,massPropertiesOf} from '@barocss/cad';
const doc=JSON.parse(readFileSync(process.argv[2],'utf8')), d=doc.direct;
const surface=analyzeSurface(d,d.objects.at(-1).id,.5,.5);
const outputs=partSnapshot(doc).outputs;
console.log(JSON.stringify({surface,bodies:outputs.map(o=>({valid:checkBrep(o.brep,{strict:true}).valid,volume:massPropertiesOf(o).volume,z:[Math.min(...o.brep.vertices.map(v=>v.point[2])),Math.max(...o.brep.vertices.map(v=>v.point[2]))]}))}));` });
const line = (id, points) => `@curve #${id} {type:nurbs;degree:1;knots:[0,0,1,1];control-points:${JSON.stringify(points)};weights:[1,1];}`;
const seed = (parallel) => ({ format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nextId:0,nodes:[],outputs:{},direct:{sources:{s:`@model pair {version:0;length-unit:mm;${line('a',parallel?[[0,0,0],[20,0,0]]:[[10,10,0],[30,10,0]])}${line('b',parallel?[[0,20,0],[20,20,0]]:[[45,10,0],[45,30,0]])}}`},objects:[{id:'a',name:'Profile A',source:'s',geometry:'a'},{id:'b',name:'Path B',source:'s',geometry:'b'}]}});
const panel=()=>f.page.getByRole('complementary',{name:'Direct geometry',exact:true});
const button=(name,scope=f.page)=>scope.getByRole('button',{name,exact:true});
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} vs ${b}`);
await f.run(async()=>{
  for(const parallel of [false,true]) for(const reverse of [false,true]){
    const original=seed(parallel),tag=`${parallel?'ruled':'sweep'}-${reverse?'reverse':'forward'}`;
    await f.newPage();await f.page.setViewportSize({width:1024,height:800});
    await f.openFile({name:`${tag}.bcad`,mimeType:'application/json',buffer:Buffer.from(JSON.stringify(original))},0);await f.same(original);
    await f.page.locator('.ol.direct').filter({hasText:'Profile A'}).click();await f.page.locator('.ol.direct').filter({hasText:'Path B'}).click({modifiers:['Shift']});
    const beforeUndo=await button('Undo').isEnabled();
    if(reverse) await button('Swap curve order',panel()).click();
    await f.same(original);assert.equal(await button('Undo').isEnabled(),beforeUndo);
    const role=panel().locator('.kv').filter({hasText:'Sweep profile / Ruled first'});
    assert.match(await role.textContent(),reverse?/Path B/:/Profile A/);
    const direction=panel().getByRole('status',{name:'Ruled surface direction'});
    if(parallel) assert.match(await direction.textContent(),reverse?/0, 0, -1\.000/:/0, 0, 1\.000/);
    await direction.scrollIntoViewIfNeeded();await f.snapshot(`${tag}-roles`);
    await button(parallel?'Ruled surface':'Sweep',panel()).click();await f.changed(original);const surfaceDoc=await f.doc();
    assert.deepEqual(surfaceDoc.direct.objects.slice(0,2),original.direct.objects);assert.equal(surfaceDoc.direct.sources.s,original.direct.sources.s);
    const inspected=await f.inspect(`${tag}-surface`,surfaceDoc);
    assert.deepEqual(inspected.surface.point,parallel?[10,10,0]:reverse?[55,20,0]:[20,20,0]);near(inspected.surface.normal[2],reverse?-1:1);
    await f.undo();await f.same(original);await f.redo();await f.same(surfaceDoc);
    if(!parallel){const saved=await f.save(tag);await f.freshOpen(saved.file,saved.doc,`${tag}-reopened`);continue;}
    await f.page.locator('.ol.direct').filter({hasText:'Ruled surface'}).click();
    await panel().getByLabel('Thickness',{exact:true}).fill('2');await panel().getByLabel('Thicken side',{exact:true}).selectOption('normal');await button('Thicken into a body',panel()).click();
    const hud=f.page.getByRole('dialog',{name:'Thicken',exact:true});await hud.locator('.status.ok').waitFor();await f.same(surfaceDoc);await button('Apply',hud).click();await f.changed(surfaceDoc);const thick=await f.doc();
    const verify=async(doc,t,label)=>{const r=await f.inspect(label,doc);assert.equal(r.bodies.length,1);assert.equal(r.bodies[0].valid,true);near(r.bodies[0].volume,400*t);near(r.bodies[0].z[0],reverse?-t:0);near(r.bodies[0].z[1],reverse?0:t);};
    await verify(thick,2,`${tag}-thicken2`);
    await f.openFeatureEditor(thick.nodes.length-1,tag);await f.editor().getByLabel('Thickness',{exact:true}).fill('3');await f.applyEditor(thick,`${tag}-edit3`);const edited=await f.doc();await verify(edited,3,`${tag}-thicken3`);
    await f.undo();await f.same(thick);await f.redo();await f.same(edited);
    const saved=await f.save(tag);await f.freshOpen(saved.file,saved.doc,`${tag}-reopened`);await verify(saved.doc,3,`${tag}-reopened-native`);
  }
});
