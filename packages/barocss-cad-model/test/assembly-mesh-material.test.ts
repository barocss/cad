import test from 'node:test';
import assert from 'node:assert/strict';
import {part,assembly,Location} from '../src/api';
test('public meshes report the effective occurrence material without modifying its definition',()=>{
 const pin=part('Pin').box({w:10,d:10,h:20}).material('al6061');
 const original=assembly('Fixture',part()).addPart('Pin',pin).addPart('Copy',pin,{at:Location.at([30,0,0])});
 const before=structuredClone(original.doc),changed=original.setPartLook('Pin','b1',{material:'steel'});
 console.log(JSON.stringify({looks:changed.partLooks('Pin'),materials:changed.meshes().map(m=>[m.key,m.material])}));
 assert.deepEqual(original.doc,before);assert.deepEqual(changed.doc.instances![0].doc,original.doc.instances![0].doc);
 assert.deepEqual(changed.meshes().map(m=>m.material),['steel','al6061']);
});

test('reset and explode preserve material precedence and copied mesh arrays',()=>{
 const pin=part().box({w:10,d:10,h:20}).material('al6061');const a=assembly('a',part()).addPart('pin',pin,{at:Location.at([30,0,0])}).setPartLook('pin','b1',{material:'brass'}),before=structuredClone(a.doc);
 const mesh=a.meshes()[0];assert.equal(mesh.material,'brass');assert.equal(a.meshes({explode:1})[0].material,'brass');mesh.positions[0]=999;assert.notEqual(a.meshes()[0].positions[0],999);assert.deepEqual(a.doc,before);
 assert.equal(a.setPartLook('pin','b1',{material:null}).meshes()[0].material,'al6061');
});

test('nested local material and outer override resolve through the original body key',()=>{
 const leaf=part().box({w:10,d:10,h:20}).material('al6061');const sub=assembly('sub',part()).addPart('leaf',leaf).setPartLook('leaf','b1',{material:'steel'});
 const outer=assembly('outer',part()).addPart('sub',part('sub',sub.doc),{at:Location.at([30,0,0])});assert.equal(outer.meshes()[0].material,'steel');const before=structuredClone(outer.doc);
 const changed=outer.setPartLook('sub','p1/b1',{material:'brass'});assert.equal(changed.meshes()[0].material,'brass');assert.equal(changed.setPartLook('sub','p1/b1',null).meshes()[0].material,'steel');assert.deepEqual(outer.doc,before);
});

test('hidden hosts remain omitted, body hiding remains display-policy-neutral, and unset materials stay absent',async()=>{
 const {Assembly}=await import('../src/api');const bare=assembly('bare',part()).addPart('pin',part().box({w:10,d:10,h:20}));assert.equal(bare.meshes()[0].material,undefined);
 const hidden=bare.setPartLook('pin','b1',{material:'steel',hidden:true});assert.equal(hidden.meshes().length,1);assert.equal(hidden.meshes()[0].material,'steel');
 const host=new Assembly('hidden',{...hidden.doc,instances:hidden.doc.instances!.map(i=>({...i,hidden:true}))});assert.deepEqual(host.meshes(),[]);
});

test('brief material fallback remains when no occurrence or body material is authored',()=>{
 const raw=part().box({w:10,d:10,h:20}).doc;raw.brief={version:1,material:{value:'brass',basis:'stated',source:'Synthetic test choice'}};
 const a=assembly('brief',part()).addPart('pin',part('pin',raw));assert.equal(a.meshes()[0].material,'brass');assert.equal(a.setPartLook('pin','b1',{material:'steel'}).meshes()[0].material,'steel');
});


test('legacy empty material values keep the existing brief fallback',()=>{
 const raw=part().box({w:10,d:10,h:20}).doc;raw.bodies={b1:{material:''}};raw.brief={version:1,material:{value:'brass',basis:'stated',source:'Synthetic fallback'}};
 const a=assembly('legacy',part()).addPart('pin',part('pin',raw));assert.equal(a.meshes()[0].material,'brass');
});
