import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createFlow,sha256} from './flow-helper.mjs';
const f=await createFlow({name:'step-tangent-fillet',output:process.argv[2],envFrozen:'STEP_TANGENT_FROZEN',initialFiles:['apps/cad-studio/test/step-tangent-fillet-browser.mjs'],qualification:'Characterize the imported tangent seam omitted from viewport picks; Fillet admission remains NOT_RUN.',inspectorSource:`
import {readFileSync} from 'node:fs';
import {partBreps} from '@barocss/cad-model/engine/evaluate';
import {bodyMesh} from '@barocss/cad-model/engine/mesh';
import {checkBrep,brepMassProperties} from '@barocss/cad';
const doc=JSON.parse(readFileSync(process.argv[2],'utf8')), [{brep}]=partBreps(doc);
console.log(JSON.stringify({valid:checkBrep(brep,{strict:true}).valid,volume:brepMassProperties(brep,1).volume,nativeSeams:brep.edges.filter(e=>e.name==='n0.n1.top|n0.n2.face').map(e=>({id:e.id,name:e.name})),edges:bodyMesh(brep,0).edges.map(e=>({index:e.index,names:e.names}))}));`});
const button=(name,scope=f.page)=>scope.getByRole('button',{name,exact:true});
await f.run(async()=>{
 const bytes=await readFile(process.argv[3]);assert.equal(sha256(bytes),'3f2cc1b71923713941e34dfce461d1cd14dc07a1d66bc76137b9d5e0155b0953');f.report.files.push({sha256:sha256(bytes),bytes:bytes.length});
 await f.newPage();await f.page.setViewportSize({width:1024,height:900});await f.page.locator('input[aria-label="Model file"]').setInputFiles({name:'tangent-box.step',mimeType:'application/step',buffer:bytes});await f.waitToast(/STEP opened/);await f.ready();const doc=await f.doc();assert.equal(doc.nodes[0].kind,'import');assert.equal(doc.nodes[0].step,bytes.toString());const native=await f.inspect('imported',doc);assert.ok(native.valid);assert.ok(Math.abs(native.volume-(7200-120*(1-Math.PI/4)))<1e-7);
 await button('Top',f.page.locator('.views')).click();if(await button('Ortho').getAttribute('aria-pressed')!=='true')await button('Ortho').click();await f.page.getByTitle('Frame all (F)',{exact:true}).click();const filter=button('Selection filter');for(let i=0;i<6&&!(await filter.innerText()).includes('Edges');i++)await filter.click();await f.worldClick([15,2,20]);assert.equal(native.nativeSeams.length,1);assert.equal(native.edges.some(e=>e.names.includes('n0.n1.top|n0.n2.face')),false);const selected=await f.page.evaluate(()=>window.__studioSelection.selection);assert.equal(selected.edges.length,0);assert.equal(selected.faces.length,0);assert.equal(selected.bodies.length,0);await f.same(doc);f.report.observations.push({nativeSeam:native.nativeSeams[0],viewportSelected:selected,fillet:'NOT_RUN: native tangent seam is not a selectable display edge'});await f.page.screenshot({path:f.output+'/01-tangent-unselectable.png'});assert.equal(f.report.downloads.length,0);
});
