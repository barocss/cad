import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { emptyDoc, withNode } from '@barocss/cad-model/engine/doc';
import { meshInMM, readMeshFile } from '@barocss/cad-model/engine/meshImport';
import { evaluateDoc } from '@barocss/cad-model/engine/evaluate';
import { bindNativeVertexPick, captureMeshVertexPick, currentMeshVertexTarget, currentNativeVertexPoints, pickVertex } from '../src/viewport/vertexPick';
function fixture() {
  const bytes = new Uint8Array(readFileSync('../../packages/barocss-cad-model/test/fixtures/block-cm.stl'));
  const input = meshInMM(readMeshFile('block.stl', bytes), 'cm');
  const doc = withNode(emptyDoc(), { kind: 'mesh', name: 'Synthetic block', unit: 'cm', ...input, representation: 'facets' });
  const result = evaluateDoc(doc, 1); assert.ok(result.ok);
  const body = result.bodies[0], mesh = body.mesh, edge = mesh.edges.find(e => e.meshVertices);
  assert.ok(edge, 'actual imported mesh supplies a qualified unmerged welded endpoint');
  const at = edge.a, project = (p: readonly number[]) => p.every((v, k) => v === at[k]) ? [0, 0, 0] : [100, 100, 100];
  const pick = pickVertex('all', 0, mesh.edges, 0, 0, project, undefined, { mesh, edge: edge.index }); assert.ok(pick);
  return { doc, body, mesh, edge, pick, result, project };
}
test('mesh endpoint authority is distinct from native Sketch and bound to document/body/mesh', () => {
  const f = fixture(), target = captureMeshVertexPick(f.pick, f.doc, f.result.bodies); assert.ok(target);
  assert.ok(currentMeshVertexTarget(target, f.doc, f.result.bodies));
  const distinct = new Map<string, typeof f.pick>();
  for (const edge of f.mesh.edges) if (edge.meshVertices) {
    const at = edge.a, project = (p: readonly number[]) => p.every((v, k) => v === at[k]) ? [0, 0, 0] : [100, 100, 100];
    const hit = pickVertex('all', 0, f.mesh.edges, 0, 0, project, undefined, { mesh: f.mesh, edge: edge.index });
    if (hit && captureMeshVertexPick(hit, f.doc, f.result.bodies)) distinct.set(edge.meshVertices[0], hit);
  }
  const three = [...distinct.values()].slice(0, 3); assert.equal(three.length, 3);
  three.forEach(p => bindNativeVertexPick(p, f.doc));
  assert.equal(currentNativeVertexPoints(f.doc, f.result.bodies, three), null, 'three distinct mesh picks never gain native Sketch authority');
  assert.equal(captureMeshVertexPick({ ...f.pick }, f.doc, f.result.bodies), null, 'coordinate clone cannot acquire authority');
  assert.equal(currentMeshVertexTarget({ ...target }, f.doc, f.result.bodies), false);
  assert.equal(currentMeshVertexTarget(target, { ...f.doc }, f.result.bodies), false);
  assert.equal(currentMeshVertexTarget(target, f.doc, [{ ...f.body, mesh: { ...f.mesh } }]), false);
  assert.equal(currentMeshVertexTarget(target, f.doc, [f.body, f.body]), false);
  target.at[0] += 1;
  assert.equal(currentMeshVertexTarget(target, f.doc, f.result.bodies), false);
});
test('mesh picking refuses fallback, generated/changed source and ambiguous endpoints', () => {
  const f = fixture();
  const fallback = pickVertex('all', 0, f.mesh.edges, 0, 0, f.project); assert.ok(fallback);
  assert.equal(captureMeshVertexPick(fallback, f.doc, f.result.bodies), null);
  const overlap = pickVertex('all', 0, f.mesh.edges, 0, 0, () => [0, 0, 0], undefined, { mesh: f.mesh, edge: f.edge.index }, true); assert.ok(overlap);
  assert.equal(captureMeshVertexPick(overlap, f.doc, f.result.bodies), null);
  assert.equal(captureMeshVertexPick(f.pick, { ...f.doc, nodes: [...f.doc.nodes, f.doc.nodes[0]] }, f.result.bodies), null);
  assert.equal(captureMeshVertexPick(f.pick, f.doc, [{ ...f.body, ref: undefined }]), null);
  f.pick.at.splice(0);
  assert.equal(captureMeshVertexPick(f.pick, f.doc, f.result.bodies), null, 'mutated empty pick has no authority');
  const changed = { ...f.pick, at: [...f.pick.at] as typeof f.pick.at };
  assert.equal(captureMeshVertexPick(changed, f.doc, f.result.bodies), null);
});
