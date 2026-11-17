import test from 'node:test';
import assert from 'node:assert/strict';
import { startSession, transformCageSelection, undoSession, redoSession, type CageSession, type CageSelection, type CageSelectionTransform, type StudioCage } from '../src/subd/cageEdit';

// Deliberately asymmetric and away from the origin. Expected coordinates below are
// hand-calculated about [10, 20, 30], not produced by another transform helper.
const cage: StudioCage = {
  positions: [12,23,34, 16,23,34, 16,28,34, 12,28,34, 21,23,34, 21,28,34],
  faces: [[0,1,2,3],[1,4,5,2]], creases: [[0,1]],
};
const pivot = [10,20,30] as const;
const selected = (sel: CageSelection, c = cage): CageSession => ({ ...startSession(7,c), sel, mode: sel.faces.length ? 'face' : sel.edges.length ? 'edge' : 'vertex' });
const vertex = () => selected({ vertices: [0], edges: [], faces: [] });
function near(actual: readonly number[], expected: readonly number[]) {
  assert.equal(actual.length, expected.length);
  actual.forEach((v,i) => assert.ok(Math.abs(v-expected[i]) < 1e-12, `${i}: ${v} != ${expected[i]}`));
}
function preserved(s: CageSession, r: CageSession, changed: number[]) {
  for (let v=0; v<cage.positions.length/3; v++) if (!changed.includes(v)) {
    assert.deepEqual(r.cage.positions.slice(v*3,v*3+3),s.cage.positions.slice(v*3,v*3+3));
  }
  assert.deepEqual(r.cage.faces,s.cage.faces); assert.deepEqual(r.cage.creases,s.cage.creases);
  assert.equal(r.sel,s.sel); assert.equal(r.start,s.start); assert.equal(r.node,s.node);
}

test('right-handed 90-degree rotation about each world axis uses the explicit off-origin pivot', () => {
  const expected = [[12,16,33], [14,23,28], [7,22,34]];
  for (const axis of [0,1,2] as const) {
    const s=vertex(), before=structuredClone(s);
    const r=transformCageSelection(s,{kind:'rotate',axis,degrees:90,pivot});
    near(r.cage.positions.slice(0,3),expected[axis]); preserved(s,r,[0]); assert.deepEqual(s,before);
  }
  near(transformCageSelection(vertex(),{kind:'rotate',axis:2,degrees:-90,pivot}).cage.positions.slice(0,3),[13,18,34]);
});

test('vertex, reversed edge and face selections transform only their unique region', () => {
  const cases: [CageSelection, number[], number[]][] = [
    [{vertices:[0],edges:[],faces:[]},[0],[11,21.5,32]],
    [{vertices:[],edges:[[1,0]],faces:[]},[0,1],[11,21.5,32,13,21.5,32]],
    [{vertices:[],edges:[],faces:[0]},[0,1,2,3],[11,21.5,32,13,21.5,32,13,24,32,11,24,32]],
  ];
  for (const [sel,ids,expected] of cases) {
    const s=selected(sel), before=structuredClone(s), r=transformCageSelection(s,{kind:'scale',factor:.5,pivot});
    near(r.cage.positions.slice(0,expected.length),expected); preserved(s,r,ids); assert.deepEqual(s,before);
    assert.equal(r.mode,s.mode);
  }
  const s=selected({vertices:[],edges:[[0,1],[1,2]],faces:[]});
  const r=transformCageSelection(s,{kind:'rotate',axis:2,degrees:90,pivot});
  near(r.cage.positions.slice(0,9),[7,22,34,7,26,34,2,26,34]); preserved(s,r,[0,1,2]);
});

test('mirror seams stay on their plane while other coordinates and non-seam vertices transform', () => {
  for (const axis of [0,1,2] as const) {
    const positions=[0,2,3, 4,2,3, 4,6,3, 0,6,3];
    // Permute the same seam fixture across each supported mirror axis.
    const permuted=positions.map((_,i)=>positions[3*Math.floor(i/3)+(i%3-axis+3)%3]);
    const c={positions:permuted,faces:[[0,1,2,3]]};
    const s={...selected({vertices:[0,1],edges:[],faces:[]},c),mirror: (['x','y','z'] as const)[axis]};
    const r=transformCageSelection(s,{kind:'scale',factor:.5,pivot:[10,10,10]});
    assert.equal(r.cage.positions[axis],0);
    assert.equal(r.cage.positions[3+axis],7);
    for (let k=0;k<3;k++) if(k!==axis) assert.equal(r.cage.positions[k],permuted[k]/2+5);
    assert.deepEqual(r.cage.positions.slice(6),s.cage.positions.slice(6)); assert.equal(r.mirror,s.mirror);
  }
});

test('one accepted transform owns one undo step; undo/redo restore selection and exact coordinates', () => {
  const s=vertex(), r=transformCageSelection(s,{kind:'scale',factor:.5,pivot});
  assert.equal(r.undo.length,1); assert.equal(r.redo.length,0);
  const u=undoSession(r); assert.deepEqual(u.cage,s.cage); assert.deepEqual(u.sel,s.sel);
  assert.deepEqual(redoSession(u).cage,r.cage);
  const next=transformCageSelection(u,{kind:'rotate',axis:0,degrees:90,pivot});
  assert.equal(next.undo.length,1); assert.equal(next.redo.length,0);
  for (const transform of [
    {kind:'scale',factor:1,pivot}, {kind:'rotate',axis:2,degrees:0,pivot},
    {kind:'rotate',axis:1,degrees:720,pivot}, {kind:'rotate',axis:0,degrees:-360,pivot},
  ] satisfies CageSelectionTransform[]) assert.equal(transformCageSelection(u,transform),u);
  assert.equal(transformCageSelection(s,{kind:'scale',factor:.5,pivot:[12,23,34]}),s);
  const seam={...selected({vertices:[0],edges:[],faces:[]},{positions:[0,2,3,4,2,3,4,6,3,0,6,3],faces:[[0,1,2,3]]}),mirror:'x' as const};
  assert.equal(transformCageSelection(seam,{kind:'scale',factor:.5,pivot:[10,2,3]}),seam);
});

test('invalid inputs reject atomically, including stale/non-edge selections and overflow', () => {
  const s=undoSession(transformCageSelection(vertex(),{kind:'scale',factor:.5,pivot}));
  const invalid: CageSelectionTransform[] = [
    ...[0,-1,NaN,Infinity].map(factor=>({kind:'scale' as const,factor,pivot})),
    ...[NaN,Infinity].map(degrees=>({kind:'rotate' as const,axis:0 as const,degrees,pivot})),
    {kind:'scale',factor:2,pivot:[NaN,0,0]}, {kind:'scale',factor:2,pivot:[0,Infinity,0]},
    {kind:'scale',factor:2,pivot:[0,0] as unknown as [number,number,number]},
    {kind:'rotate',axis:3 as 0,degrees:90,pivot}, {kind:'scale',factor:Number.MAX_VALUE,pivot},
  ];
  for (const transform of invalid) {
    const before=structuredClone(s); assert.throws(()=>transformCageSelection(s,transform)); assert.deepEqual(s,before);
  }
  for(const sel of [
    {vertices:[],edges:[],faces:[]}, {vertices:[-1],edges:[],faces:[]}, {vertices:[6],edges:[],faces:[]},
    {vertices:[.5],edges:[],faces:[]}, {vertices:[],edges:[[0,2]],faces:[]},
    {vertices:[],edges:[[0,99]],faces:[]}, {vertices:[],edges:[],faces:[2]},
  ] satisfies CageSelection[]) {
    const bad={...s,sel},before=structuredClone(bad);
    assert.throws(()=>transformCageSelection(bad,{kind:'scale',factor:.5,pivot})); assert.deepEqual(bad,before);
  }
  for(const c of [{...cage,positions:[...cage.positions,0]}, {...cage,positions:cage.positions.map((v,i)=>i===0?NaN:v)}, {...cage,faces:[[0,1,99]]}]) {
    const bad=selected(s.sel,c); assert.throws(()=>transformCageSelection(bad,{kind:'scale',factor:.5,pivot}));
  }
});
