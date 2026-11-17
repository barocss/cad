import test from 'node:test';
import assert from 'node:assert/strict';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import { captureMassMembers, readPinnedMass } from '../src/app/pinnedMass';

function fixture() {
  const doc: StudioDoc = { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nodes: [
    { kind: 'sketch', id: 'n0', profile: 'rectangle', min: [0, 0], max: [10, 10] },
    { kind: 'extrude', id: 'n1', sketch: 0, height: 10 },
    { kind: 'sketch', id: 'n2', profile: 'rectangle', min: [30, 0], max: [40, 10] },
    { kind: 'extrude', id: 'n3', sketch: 2, height: 10 },
  ], outputs: { b1: { node: 1, side: 'solid' }, b3: { node: 3, side: 'solid' } }, nextId: 4,
  bodies: { b1: { material: 'al6061' }, b3: { material: 'steel' } } };
  const bodies = [1, 3].map((node, i) => ({ key: `b${node}`, ref: { node, side: 'solid' }, topology: { kind: 'solid', openShells: 0, boundaryEdges: 0 }, family: 'planar', volume: 1000, mass: 2.7, centroid: [5 + 30 * i, 5, 5], inertia: [[45,0,0],[0,45,0],[0,0,45]], massMethod: 'planar-exact' } as BodyResult));
  return { doc, bodies };
}
test('all-member accepted mass uses material-weighted literal cube arithmetic and retains hidden members', () => {
  const { doc, bodies } = fixture(), before = structuredClone(doc), pin = captureMassMembers(doc, bodies, [0,1]); assert.ok(pin);
  const read = readPinnedMass(doc, bodies, pin, 'al6061'); assert.ok(read.ok);
  assert.equal(read.mass, 10.55); assert.ok(Math.abs(read.centroid[0] - 5765/211) < 1e-12);
  const hidden = { ...doc, bodies: { ...doc.bodies, b3: { ...doc.bodies!.b3, hidden: true } } };
  const hiddenRead = readPinnedMass(hidden, bodies, pin, 'al6061'); assert.ok(hiddenRead.ok); assert.deepEqual(hiddenRead.centroid, read.centroid); assert.equal(hiddenRead.members[1].hidden, true);
  const moved = bodies.map((b,i) => i ? { ...b, centroid: [45,5,5] as [number,number,number] } : b);
  const next = readPinnedMass(doc, moved, pin, 'al6061'); assert.ok(next.ok); assert.ok(Math.abs(next.centroid[0] - 7335/211) < 1e-12);
  const sameDensity = { ...doc, bodies: { b1: { material: 'al6061' }, b3: { material: 'al6061' } } };
  const equal = readPinnedMass(sameDensity, bodies, pin, 'al6061'); assert.ok(equal.ok); assert.equal(equal.centroid[0], 20);
  assert.deepEqual(doc, before);
});
test('missing, pending, invalid and changed identities refuse the entire set rather than a partial COM', () => {
  const { doc, bodies } = fixture(), pin = captureMassMembers(doc,bodies,[0,1])!;
  for (const patch of [{ massRef: 12 }, { inertia: [] }, { inertia: [[1,2,3]] }, { volume: null }, { volume: 0 }, { volume: NaN }, { centroid: [Infinity,5,5] }, { massMethod: undefined }, { topology: { kind: 'unknown' } }]) {
    const changed = [bodies[0], { ...bodies[1], ...patch } as BodyResult]; assert.equal(readPinnedMass(doc,changed,pin,'al6061').ok,false);
  }
  assert.equal(readPinnedMass(doc,[bodies[0]],pin,'al6061').ok,false);
  assert.equal(readPinnedMass(doc,[...bodies,bodies[1]],pin,'al6061').ok,false);
  const missingDensity = { ...doc, bodies: { b3: { material: 'missing-material' } } }; assert.equal(readPinnedMass(missingDensity,bodies,pin,'al6061').ok,false);
  const replaced = structuredClone(doc); replaced.nodes[3].id='n9'; assert.equal(readPinnedMass(replaced,bodies,pin,'al6061').ok,false);
  const suppressed = structuredClone(doc); suppressed.nodes[3].suppressed=true; assert.equal(readPinnedMass(suppressed,bodies,pin,'al6061').ok,false);
  assert.equal(captureMassMembers(doc,bodies,[]),null); assert.equal(captureMassMembers(doc,bodies,[0,0]),null); assert.equal(captureMassMembers(doc,bodies,[0,1,2]),null);
});
test('provenance and assumed density remain explicit; input order does not redefine membership', () => {
  const { doc,bodies } = fixture(), pin=captureMassMembers(doc,bodies,[0])!;
  const noMaterial={...doc};delete noMaterial.bodies;
  const estimate=[{...bodies[0],massMethod:'tessellated' as const,volumeBasis:{method:'tessellated' as const,bound:1}}];
  const result=readPinnedMass(noMaterial,estimate,pin,'al6061');assert.ok(result.ok);assert.match(result.members[0].basis,/assumed default/);assert.match(result.members[0].basis,/not a centroid error bound/);
  assert.equal(readPinnedMass(noMaterial,estimate,pin,'missing-default').ok,false);
  const pair=captureMassMembers(doc,bodies,[0,1])!;assert.deepEqual(readPinnedMass(doc,[...bodies].reverse(),pair,'al6061'),readPinnedMass(doc,bodies,pair,'al6061'));
});
