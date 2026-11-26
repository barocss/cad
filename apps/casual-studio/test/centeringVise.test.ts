import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkBrep, type Brep } from '../../../packages/barocss-cad/src/brep/brep-core';
import { lookOf } from '@barocss/cad-model/app/bodies';
import { variantNamed, variantOf } from '@barocss/cad-model/assembly/variability';
import { encodeStudioFile, readStudioFile } from '@barocss/cad-model/engine/container';
import { type StudioDoc } from '@barocss/cad-model/engine/doc';
import { evaluateDoc, partBreps } from '@barocss/cad-model/engine/evaluate';
import { buildCenteringVise } from '../src/centeringVise';

function range(b: Brep, axis: number) {
  const v = b.vertices.map(p=>p.point[axis]);
  return [Math.min(...v), Math.max(...v)];
}
function inspect(doc: StudioDoc, opening: number) {
  const evaluated = evaluateDoc(doc,0);
  if (!evaluated.ok) assert.fail(evaluated.error.title);
  const native = partBreps(doc);
  assert.equal(native.length,3);
  const exact = new Map(native.map(({key,brep})=>{
    const report = checkBrep(brep,{strict:true});
    assert.ok(report.valid,report.issues.join('; '));
    assert.equal(brep.bodies.length,1);
    assert.equal(brep.bodies[0].kind,'solid');
    assert.equal(brep.shells.length,1);
    assert.ok(brep.shells[0].closed);
    return [lookOf(doc,evaluated.bodies.find(b=>b.key===key)!).name,brep];
  }));
  const base = exact.get('Vise base')!, left = exact.get('Left jaw')!, right = exact.get('Right jaw')!;
  const leftX = range(left,0), rightX = range(right,0);
  assert.deepEqual(leftX,[-opening/2-16,-opening/2]);
  assert.deepEqual(rightX,[opening/2,opening/2+16]);
  assert.equal(rightX[0]-leftX[1],opening);
  assert.equal((rightX[0]+leftX[1])/2,0);
  for(const jaw of [left,right]) {
    assert.deepEqual(range(jaw,1),[-20,20]);
    assert.deepEqual(range(jaw,2),[8,27]);
  }
  assert.deepEqual(range(base,0),[-60,60]);
  assert.deepEqual(range(base,1),[-30,30]);
  assert.deepEqual(range(base,2),[0,8]);
  // Both caps contain four real bore loops, with opposite rim endpoints yielding their center.
  const verts = new Map(base.vertices.map(v=>[v.id,v.point]));
  const edges = new Map(base.edges.map(e=>[e.id,e]));
  const uses = new Map(base.coedges.map(c=>[c.id,c]));
  const bores = base.loops.filter(l=>l.kind==='inner').map(l=>{
    const pts = l.coedges.flatMap(c=>edges.get(uses.get(c)!.edge)!.vertices.map(v=>verts.get(v)!));
    const xs = pts.map(p=>p[0]);
    const min = Math.min(...xs), max = Math.max(...xs);
    assert.ok(Math.abs(max-min-6.6) < 1e-7);
    assert.ok(pts.every(p=>p[1]===pts[0][1]&&p[2]===pts[0][2]));
    return [(min+max)/2,pts[0][1],pts[0][2]].join(',');
  }).sort();
  const expected = [-51,51].flatMap(x=>[-23,23].flatMap(y=>[0,8].map(z=>[x,y,z].join(',')))).sort();
  assert.deepEqual(bores,expected);
}

test('vise jaws translate equally in opposite directions without moving the base or the work center', ()=>{
  const master = buildCenteringVise();
  inspect(master,40);
  for(const opening of [47.5,60]) {
    const v = variantOf(master,{opening}).doc;
    assert.equal(v.nodes,master.nodes);
    assert.equal(v.outputs,master.outputs);
    inspect(v,opening);
  }
  for(const opening of [39.99,60.01,Infinity,NaN,'60']) assert.throws(()=>variantOf(master,{opening}));
});

test('vise native read/write retains its opening relation and both original jaw ids', async()=>{
  const d = buildCenteringVise(), read = await readStudioFile(encodeStudioFile(d));
  if ('error' in read) assert.fail(read.error);
  assert.deepEqual(read.doc.nodes,d.nodes);
  assert.deepEqual(read.doc.variability,d.variability);
  inspect(read.doc,40);
  inspect(variantNamed(read.doc,'60 mm opening').doc,60);
});
