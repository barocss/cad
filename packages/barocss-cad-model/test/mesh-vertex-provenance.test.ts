import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { emptyDoc, withNode, rectanglePart } from '../src/engine/doc';
import { brepsFor } from '../src/engine/evaluate';
import { bodyMesh } from '../src/engine/mesh';
import { meshInMM, readMeshFile } from '../src/engine/meshImport';
test('imported mesh endpoint authority names exact accepted welded B-rep vertices, not native Sketch vertices',()=>{
 const mesh=meshInMM(readMeshFile('block.stl',new Uint8Array(readFileSync(join(import.meta.dirname,'fixtures/block-cm.stl')))),'cm');
 for(const representation of [undefined,'facets'] as const){
  const doc=withNode(emptyDoc(),{kind:'mesh',name:'block',unit:'cm',...mesh,...(representation?{representation}:{})}), source=brepsFor(doc);assert.ok('breps' in source);
  let count=0;
  for(const brep of source.breps){
   const display=bodyMesh(brep,1),vertices=new Map(brep.vertices.map(v=>[v.id,v.point]));
   for(const edge of display.edges){
    assert.equal(edge.nativeVertices,undefined);
    if(edge.names.length>1)assert.equal(edge.meshVertices,undefined);
    if(!edge.meshVertices)continue;
    count++;assert.equal(edge.straight,true);assert.equal(edge.names.length,1);assert.notEqual(edge.meshVertices[0],edge.meshVertices[1]);
    assert.deepEqual(edge.a,vertices.get(edge.meshVertices[0]));assert.deepEqual(edge.b,vertices.get(edge.meshVertices[1]));
   }
  }
  assert.ok(count>0,'at least one exact unmerged imported endpoint is available');
 }
});
test('native prism endpoints retain their separate authority',()=>{
 const source=brepsFor(rectanglePart(20,12,8));assert.ok('breps' in source);
 const mesh=bodyMesh(source.breps[0],1);assert.ok(mesh.edges.some(e=>e.nativeVertices));assert.ok(mesh.edges.every(e=>!e.meshVertices));
});
