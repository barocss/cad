import { cageLocalDirection } from '../src/subd/cageLocalDirection';
import test from 'node:test';
import assert from 'node:assert/strict';
import { startSession,selectionCentre,transformCageSelection,undoSession,redoSession,type CageSession,type CageSelection } from '../src/subd/cageEdit';
const cage={positions:[12,23,34,16,23,34,16,26,38,12,26,38,25,23,34,25,26,38],faces:[[0,1,2,3],[1,4,5,2]],creases:[[0,1]] as [number,number][]};
const pivot=[10,20,30] as const,direction=[0,-4,3] as const;
const picked=(sel:CageSelection={vertices:[0],edges:[],faces:[]}):CageSession=>({...startSession(0,cage),sel,mode:sel.faces.length?'face':sel.edges.length?'edge':'vertex'});
function near(a:readonly number[],b:readonly number[]){assert.equal(a.length,b.length);a.forEach((v,i)=>assert.ok(Math.abs(v-b[i])<1e-11,`${i}: ${v} != ${b[i]}`));}
test('independent 3-4-5 tilted normal and off-origin pivot rotate right-handed by 90 degrees',()=>{
 const s=picked(),r=transformCageSelection(s,{kind:'rotate-along',direction,degrees:90,pivot});
 // Relative (2,3,4) is perpendicular to N=(0,-.8,.6), so N cross P = (-5,1.2,1.6).
 near(r.cage.positions.slice(0,3),[5,21.2,31.6]);assert.deepEqual(r.cage.positions.slice(3),s.cage.positions.slice(3));
 const reverse=transformCageSelection(s,{kind:'rotate-along',direction:[0,4,-3],degrees:90,pivot});near(reverse.cage.positions.slice(0,3),[15,18.8,28.4]);
 near(reverse.cage.positions,transformCageSelection(s,{kind:'rotate-along',direction,degrees:-90,pivot}).cage.positions);
});
test('Cartesian local rotation matches existing world branch for positive and negative angles',()=>{
 const s=picked({vertices:[],edges:[],faces:[0,1]});
 for(const axis of [0,1,2] as const)for(const degrees of [90,-90,37,180]){
  const d:[number,number,number]=[0,0,0];d[axis]=1;
  near(transformCageSelection(s,{kind:'rotate-along',direction:d,degrees,pivot}).cage.positions,transformCageSelection(s,{kind:'rotate',axis,degrees,pivot}).cage.positions);
 }
});
test('shared edge/face regions rotate once, retain unpicked vertices and own a single undo step',()=>{
 for(const sel of [{vertices:[0,1,2,3],edges:[],faces:[]},{vertices:[],edges:[[0,1],[1,2],[2,3]],faces:[]},{vertices:[],edges:[],faces:[0]}] satisfies CageSelection[]){
  const s=picked(sel),before=structuredClone(s),r=transformCageSelection(s,{kind:'rotate-along',direction,degrees:90,pivot});
  near(r.cage.positions.slice(0,12),[5,21.2,31.6,5,23.6,34.8,0,23.6,34.8,0,21.2,31.6]);assert.deepEqual(r.cage.positions.slice(12),s.cage.positions.slice(12));
  assert.deepEqual(r.cage.faces,s.cage.faces);assert.deepEqual(r.cage.creases,s.cage.creases);assert.equal(r.sel,s.sel);assert.equal(r.start,s.start);assert.deepEqual(s,before);assert.equal(r.undo.length,1);
  const u=undoSession(r);assert.deepEqual(u.cage,s.cage);assert.deepEqual(u.sel,s.sel);assert.deepEqual(redoSession(u).cage,r.cage);
  for(const degrees of [0,360,-720])assert.equal(transformCageSelection(u,{kind:'rotate-along',direction,degrees,pivot}),u);
 }
});
test('huge and tiny finite direction vectors normalize; mirror seam remains constrained',()=>{
 const s=picked(),expected=transformCageSelection(s,{kind:'rotate-along',direction,degrees:90,pivot});
 for(const direction of [[0,-4e300,3e300],[0,-4e-300,3e-300]] as const)near(transformCageSelection(s,{kind:'rotate-along',direction,degrees:90,pivot}).cage.positions,expected.cage.positions);
 const seam={...s,mirror:'x' as const,cage:{...cage,positions:cage.positions.map((v,i)=>i%3===0?v-12:v)}};
 const r=transformCageSelection(seam,{kind:'rotate-along',direction:[0,0,1],degrees:90,pivot:[0,0,0]});assert.equal(r.cage.positions[0],0);near(r.cage.positions.slice(0,3),[0,0,34]);assert.deepEqual(r.cage.positions.slice(3),seam.cage.positions.slice(3));
});
test('invalid directions/degrees/pivots/stale selection and overflow refuse without mutation',()=>{
 const s=picked();
 for(const direction of [[0,0,0],[Infinity,0,0],[NaN,1,0],[1,2]]){const before=structuredClone(s);assert.throws(()=>transformCageSelection(s,{kind:'rotate-along',direction:direction as [number,number,number],degrees:0,pivot}));assert.deepEqual(s,before);}
 for(const degrees of [NaN,Infinity])assert.throws(()=>transformCageSelection(s,{kind:'rotate-along',direction,degrees,pivot}));
 for(const pivot of [[NaN,0,0],[0,0,Infinity],[0,0]])assert.throws(()=>transformCageSelection(s,{kind:'rotate-along',direction,degrees:90,pivot:pivot as [number,number,number]}));
 assert.throws(()=>transformCageSelection(picked({vertices:[99],edges:[],faces:[]}),{kind:'rotate-along',direction,degrees:90,pivot}));
 const huge={...s,cage:{...cage,positions:cage.positions.map((v,i)=>i===0?Number.MAX_VALUE:v)}},before=structuredClone(huge);
 assert.throws(()=>transformCageSelection(huge,{kind:'rotate-along',direction,degrees:90,pivot:[-Number.MAX_VALUE,0,0]}),/overflow/);assert.deepEqual(huge,before);
});

test('oblique and decimal edge-centre axis rotations are exact identity and preserve redo',()=>{
 for(const coords of [[2,3,5,7,6,9],[.1,.2,.3,1.4,2.8,4.2]]){
  const base={...startSession(0,{positions:[...coords,0,10,7],faces:[[0,1,2]]}),mode:'edge' as const,sel:{vertices:[],edges:[[0,1] as [number,number]],faces:[]}};
  const s=undoSession(transformCageSelection(base,{kind:'move',axis:2,distance:1}));
  for(const degrees of [37,90,180,270,-90]){
   const r=transformCageSelection(s,{kind:'rotate-along',direction:cageLocalDirection(s,'edge'),degrees,pivot:selectionCentre(s)!});
   assert.equal(r,s);assert.equal(r.redo,s.redo);assert.equal(r.undo,s.undo);
  }
 }
});
test('point at pivot is invariant without reconstructing decimal coordinates',()=>{
 const s=picked();assert.equal(transformCageSelection(s,{kind:'rotate-along',direction:[3,4,5],degrees:37,pivot:[12,23,34]}),s);
});
test('genuine tiny off-axis offsets beyond cancellation bounds still rotate',()=>{
 const at=(p:number[]):CageSession=>({...startSession(0,{positions:[...p,2,0,0,0,2,0],faces:[[0,1,2]]}),sel:{vertices:[0],edges:[],faces:[]}});
 const tiny=1e-20,s=at([1,tiny,0]);
 const r=transformCageSelection(s,{kind:'rotate-along',direction:[1,0,0],degrees:90,pivot:[0,0,0]});
 assert.notEqual(r,s);assert.ok(Math.abs(r.cage.positions[2]-tiny)<1e-34);assert.ok(Math.abs(r.cage.positions[1])<1e-34);
 const offset=1e-12,oblique=at([1,1+offset,0]);
 const rotated=transformCageSelection(oblique,{kind:'rotate-along',direction:[1,1,0],degrees:90,pivot:[0,0,0]});
 assert.notEqual(rotated,oblique);
 // For N=(1,1,0)/sqrt(2), the displaced Y component rotates toward +Z.
 assert.ok(rotated.cage.positions[2]>offset*.70&&rotated.cage.positions[2]<offset*.72);
 assert.equal(rotated.undo.length,1);
});
test('huge near-parallel coordinates retain real transverse motion and overflow still refuses',()=>{
 const big=1e150,offset=1e138;
 const s={...startSession(0,{positions:[big,big+offset,0,0,0,0,0,1,0],faces:[[0,1,2]]}),sel:{vertices:[0],edges:[],faces:[]}};
 const r=transformCageSelection(s,{kind:'rotate-along',direction:[1,1,0],degrees:90,pivot:[0,0,0]});
 assert.notEqual(r,s);assert.ok(r.cage.positions.every(Number.isFinite));assert.ok(r.cage.positions[2]>offset*.70&&r.cage.positions[2]<offset*.72);
 const max=Number.MAX_VALUE,overflow={...s,cage:{...s.cage,positions:[max,max,0,0,0,0,0,1,0]}},before=structuredClone(overflow);
 assert.throws(()=>transformCageSelection(overflow,{kind:'rotate-along',direction:[0,0,1],degrees:-45,pivot:[0,0,0]}),/overflow/);assert.deepEqual(overflow,before);
});
