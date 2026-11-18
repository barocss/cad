import test from 'node:test';
import assert from 'node:assert/strict';
import { part, assembly, Location, Assembly } from '../src/api';
import { placedDoc } from '../src/engine/doc';
import { evaluateDoc } from '../src/engine/evaluate';

test('public assembly meshes include a placed assembly with no own features', () => {
  const sub = assembly('sub', part()).addPart('pin', part().box({w:10,d:10,h:20}));
  const top = assembly('top', part()).addPart('sub', part('sub', sub.doc), {at:Location.at([30,0,0])});
  const before = structuredClone(top.doc);
  const built = evaluateDoc(placedDoc(top.doc.instances![0], top.doc), 1);
  assert.ok(built.ok);
  assert.equal(built.bodies.length,1);
  const meshes = top.meshes();
  console.log(JSON.stringify({ownNodes:top.doc.instances![0].doc.nodes.length, nestedBodies:built.bodies.length, facadeMeshes:meshes.length}));
  assert.deepEqual(top.doc,before);
  assert.equal(meshes.length,1);
  assert.deepEqual(meshes[0].positions,built.bodies[0].mesh.positions);
});

test('nested transforms, hidden hosts and hidden children preserve their existing semantics',()=>{
  const leaf=assembly('leaf',part()).addPart('pin',part().box({w:10,d:10,h:20}),{at:Location.at([5,0,0])});
  const middle=assembly('middle',part()).addPart('leaf',part('leaf',leaf.doc),{at:Location.at([20,0,0])});
  const top=assembly('top',part()).addPart('middle',part('middle',middle.doc),{at:Location.at([30,0,0])});
  const before=structuredClone(top.doc),meshes=top.meshes();
  assert.equal(meshes.length,1);assert.equal(Math.min(...Array.from(meshes[0].positions).filter((_,i)=>i%3===0)),55);
  assert.deepEqual(top.doc,before);
  assert.equal(new Assembly('hidden-host',{...top.doc,instances:top.doc.instances!.map(i=>({...i,hidden:true}))}).meshes().length,0);
  const hidden=new Assembly('hidden-child',{...leaf.doc,instances:leaf.doc.instances!.map(i=>({...i,hidden:true}))});
  assert.deepEqual(assembly('hidden',part()).addPart('sub',part('sub',hidden.doc)).meshes(),[]);
  assert.deepEqual(assembly('empty',part()).addPart('empty',part()).meshes(),[]);
});

test('explode includes the nested geometry without changing placements or mesh data',()=>{
  const nested=assembly('sub',part()).addPart('pin',part().box({w:10,d:10,h:20}));
  const top=assembly('top',part().box({w:10,d:10,h:10})).addPart('sub',part('sub',nested.doc),{at:Location.at([40,0,0])});
  const before=structuredClone(top.doc),normal=top.meshes(),snapshot=normal.map(m=>m.positions.slice()),exploded=top.meshes({explode:1});
  assert.equal(normal.length,2);assert.deepEqual(exploded.map(m=>m.key),normal.map(m=>m.key));
  assert.deepEqual(exploded[0].positions,normal[0].positions);assert.notDeepEqual(exploded[1].positions,normal[1].positions);
  assert.deepEqual(normal.map(m=>m.positions),snapshot);assert.deepEqual(top.doc,before);
});

test('a nested assembly retains its internal cut in the public mesh result',()=>{
  const sub=assembly('sub',part()).addPart('pin',part().box({w:10,d:10,h:20})).cut({profile:{kind:'circle',radius:2},at:[5,5,0],dir:[0,0,1],depth:'through',parts:['pin']});
  const top=assembly('top',part()).addPart('sub',part('sub',sub.doc),{at:Location.at([30,0,0])});
  const before=structuredClone(top.doc),built=evaluateDoc(placedDoc(top.doc.instances![0],top.doc),1);assert.ok(built.ok);
  assert.ok(built.bodies[0].volume!<2000);const meshes=top.meshes();assert.equal(meshes.length,1);
  assert.deepEqual(meshes[0].positions,built.bodies[0].mesh.positions);assert.deepEqual(top.doc,before);
});
