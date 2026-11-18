import assert from 'node:assert/strict';
import {createFlow} from './flow-helper.mjs';
const f=await createFlow({name:'assembly-nested-meshes',output:process.argv[2],envFrozen:'ASSEMBLY_NESTED_MESHES_FROZEN',initialFiles:['apps/cad-studio/test/assembly-nested-meshes-browser.mjs','packages/barocss-cad-model/src/api/assemblyCore.ts'],qualification:'Public Assembly.meshes must include a node-less subassembly visible in Studio and preserved by native Save/Open.',limits:['The defect is in the public mesh facade, not Studio rendering. No change to geometry, keys, or saved documents.'],inspectorSource:`
import {readFileSync} from 'node:fs';
import {part,assembly,Location,Assembly} from '@barocss/cad-model/api';
import {placedDoc} from '@barocss/cad-model/engine/doc';
import {evaluateDoc} from '@barocss/cad-model/engine/evaluate';
const input=JSON.parse(readFileSync(process.argv[2],'utf8'));
if(!input.nodes){const sub=assembly('sub',part()).addPart('pin',part('Pin').box({w:10,d:10,h:20}));console.log(JSON.stringify(assembly('top',part()).addPart('Nested pin',part('sub',sub.doc),{at:Location.at([30,0,0])}).doc));}
else{const before=JSON.stringify(input),a=new Assembly("opened",input),flat=evaluateDoc(placedDoc(input.instances[0],input),1);if(!flat.ok)throw Error(flat.error.title);const meshes=a.meshes();console.log(JSON.stringify({meshes:meshes.map(m=>({key:m.key,vertices:m.positions.length/3,minX:Math.min(...Array.from(m.positions).filter((_,i)=>i%3===0))})),bodies:flat.bodies.map(b=>({key:b.key,volume:b.volume,bounds:b.mesh.bounds})),unchanged:before===JSON.stringify(input)}));}
`});
await f.run(async()=>{
 const doc=await f.inspect('fixture',{});await f.newPage();await f.page.getByLabel('Model file',{exact:true}).setInputFiles({name:'nested-mesh.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))});await f.page.waitForFunction(()=>window.__studioDoc?.instances?.[0]?.name==='Nested pin');await f.ready();const opened=await f.doc();await f.page.getByTitle('Frame all (F)',{exact:true}).click();await f.snapshot('nested-visible');const result=await f.inspect('opened',opened);f.report.observations.push(result);assert.equal(result.bodies.length,1);assert.ok(Math.abs(result.bodies[0].volume-2000)<1e-6);assert.equal(result.unchanged,true);assert.equal(result.meshes.length,1);assert.equal(result.meshes[0].minX,30);await f.same(opened);const saved=await f.save('nested-mesh');await f.freshOpen(saved.file,saved.doc,'reopened');const roundtrip=await f.inspect('reopened',await f.doc());assert.deepEqual(roundtrip,result);await f.snapshot('reopened-nested');
});
