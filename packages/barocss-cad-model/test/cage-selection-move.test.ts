import test from 'node:test';
import assert from 'node:assert/strict';
import { startSession, transformCageSelection, commitDrag, undoSession, redoSession, type CageSession, type CageSelection, type StudioCage } from '../src/subd/cageEdit';
const cage: StudioCage={positions:[2,3,5,12,3,5,12,11,5,2,11,5,17,3,5,17,11,5,25,3,5,25,11,5],faces:[[0,1,2,3],[1,4,5,2],[4,6,7,5]],creases:[[0,1]]};
const selected=(sel: CageSelection,c=cage): CageSession=>({...startSession(2,c),sel,mode:sel.faces.length?'face':sel.edges.length?'edge':'vertex'});
const vertex=()=>selected({vertices:[0],edges:[],faces:[]});
test('independent all-axis displacements move selected vertex, shared edges and multiple faces exactly once',()=>{
 const cases:[CageSelection,number[]][]=[
  [{vertices:[0],edges:[],faces:[]},[0]],
  [{vertices:[],edges:[[1,0],[1,2]],faces:[]},[0,1,2]],
  [{vertices:[],edges:[],faces:[0,1]},[0,1,2,3,4,5]],
 ];
 for(const [sel,ids] of cases) for(const axis of [0,1,2] as const) for(const distance of [2.5,-4]) {
  const s=selected(sel),before=structuredClone(s),r=transformCageSelection(s,{kind:'move',axis,distance});
  const expected=[...cage.positions]; for(const v of ids) expected[3*v+axis]=cage.positions[3*v+axis]+distance;
  assert.deepEqual(r.cage.positions,expected); assert.deepEqual(r.cage.faces,cage.faces);assert.deepEqual(r.cage.creases,cage.creases);
  assert.equal(r.sel,s.sel);assert.equal(r.start,s.start);assert.equal(r.mode,s.mode);assert.equal(r.node,s.node);assert.deepEqual(s,before);
  const delta=[0,0,0];delta[axis]=distance;
  assert.deepEqual(r,commitDrag(s,delta,false));
 }
});
test('mirror seam clamps only its normal displacement and preserves tangential motion',()=>{
 for(const axis of [0,1,2] as const) {
  const positions=[0,2,3,4,2,3,4,6,3,0,6,3];
  const p=positions.map((_,i)=>positions[3*Math.floor(i/3)+(i%3-axis+3)%3]);
  const c={positions:p,faces:[[0,1,2,3]]};
  const seam={...selected({vertices:[0],edges:[],faces:[]},c),mirror:(['x','y','z'] as const)[axis]};
  assert.equal(transformCageSelection(seam,{kind:'move',axis,distance:9}),seam);
  const both={...seam,sel:{vertices:[0,1],edges:[],faces:[]}};
  const r=transformCageSelection(both,{kind:'move',axis,distance:2});assert.equal(r.cage.positions[axis],0);assert.equal(r.cage.positions[3+axis],6);
  const tangent=((axis+1)%3) as 0|1|2,rt=transformCageSelection(seam,{kind:'move',axis:tangent,distance:-2});
  const expected=[...p];expected[tangent]-=2;assert.deepEqual(rt.cage.positions,expected);assert.equal(rt.mirror,seam.mirror);
  const delta=[0,0,0];delta[axis]=2;assert.deepEqual(r,commitDrag(both,delta,false));
 }
});
test('one move is one history step; zero preserves redo and subsequent edit clears redo',()=>{
 const s=vertex(),r=transformCageSelection(s,{kind:'move',axis:2,distance:3});assert.equal(r.undo.length,1);assert.equal(r.redo.length,0);
 assert.deepEqual(r.cage.positions.slice(0,3),[2,3,8]);
 const u=undoSession(r);assert.deepEqual(u.cage,s.cage);assert.deepEqual(u.sel,s.sel);assert.deepEqual(redoSession(u).cage,r.cage);
 for(const distance of [0,-0]) assert.equal(transformCageSelection(u,{kind:'move',axis:0,distance}),u);
 const next=transformCageSelection(u,{kind:'move',axis:1,distance:-1});assert.equal(next.undo.length,1);assert.equal(next.redo.length,0);
});
test('invalid axis, distance, stale references and overflow reject without mutating geometry/history',()=>{
 const s=undoSession(transformCageSelection(vertex(),{kind:'move',axis:0,distance:1}));
 for(const axis of [-1,3,.5,NaN]) {const before=structuredClone(s);assert.throws(()=>transformCageSelection(s,{kind:'move',axis:axis as 0,distance:1}));assert.deepEqual(s,before);}
 for(const distance of [NaN,Infinity,-Infinity]) {const before=structuredClone(s);assert.throws(()=>transformCageSelection(s,{kind:'move',axis:0,distance}));assert.deepEqual(s,before);}
 for(const sel of [{vertices:[],edges:[],faces:[]},{vertices:[99],edges:[],faces:[]},{vertices:[-.5],edges:[],faces:[]},{vertices:[],edges:[[0,2]],faces:[]},{vertices:[],edges:[[0,99]],faces:[]},{vertices:[],edges:[],faces:[3]}] satisfies CageSelection[]) {
  const bad={...s,sel},before=structuredClone(bad);assert.throws(()=>transformCageSelection(bad,{kind:'move',axis:0,distance:1}));assert.deepEqual(bad,before);
 }
 const huge=selected(s.sel,{...cage,positions:cage.positions.map((v,i)=>i===0?Number.MAX_VALUE:v)}),before=structuredClone(huge);
 assert.throws(()=>transformCageSelection(huge,{kind:'move',axis:0,distance:Number.MAX_VALUE}),/overflow/);assert.deepEqual(huge,before);
});
