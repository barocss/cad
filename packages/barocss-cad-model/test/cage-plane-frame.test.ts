import test from 'node:test';
import assert from 'node:assert/strict';
import { cageLocalDirection } from '../src/subd/cageLocalDirection';
import { startSession,transformCageSelection,undoSession,redoSession,type CageSession,type StudioCage } from '../src/subd/cageEdit';
// Asymmetric tilted trapezoid: its upper rail rises by (0,3,4), not an XY-plane fixture.
const cage:StudioCage={positions:[2,3,5,8,3,5,10,6,9,1,6,9,20,3,5,20,6,9],faces:[[0,1,2,3],[1,4,5,2]],creases:[[0,1]]};
const picked=(c=cage):CageSession=>({...startSession(0,c),mode:'face',sel:{vertices:[],edges:[],faces:[0]}});
function near(a:readonly number[],b:readonly number[]){assert.equal(a.length,b.length);a.forEach((v,i)=>assert.ok(Math.abs(v-b[i])<1e-12,`${i}: ${v} != ${b[i]}`));}
const dot=(a:readonly number[],b:readonly number[])=>a.reduce((sum,v,i)=>sum+v*b[i],0);
const cross=(a:readonly number[],b:readonly number[])=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
test('tilted trapezoid U,V,N match independent directions and a right-handed orthonormal frame',()=>{
 const s=picked(),u=cageLocalDirection(s,'face-u'),v=cageLocalDirection(s,'face-v'),n=cageLocalDirection(s,'face');
 near(u,[1,0,0]);near(v,[0,.6,.8]);near(n,[0,-.8,.6]);
 for(const d of [u,v,n])assert.ok(Math.abs(Math.hypot(...d)-1)<1e-12);
 for(const pair of [[u,v],[u,n],[v,n]])assert.ok(Math.abs(dot(pair[0],pair[1]))<1e-12);
 near(cross(u,v),n);
});
test('cyclic face indexing preserves frame; reversal deliberately follows the other successor',()=>{
 const order=[0,1,2,3];
 for(let i=0;i<4;i++){
  const f=[...order.slice(i),...order.slice(0,i)],s=picked({...cage,faces:[f,cage.faces[1]]});
  near(cageLocalDirection(s,'face-u'),[1,0,0]);near(cageLocalDirection(s,'face-v'),[0,.6,.8]);
 }
 const reverse=[3,2,1,0],length=Math.sqrt(26);
 for(let i=0;i<4;i++){
  const s=picked({...cage,faces:[[...reverse.slice(i),...reverse.slice(0,i)],cage.faces[1]]});
  near(cageLocalDirection(s,'face-u'),[-1/length,3/length,4/length]);
  near(cageLocalDirection(s,'face-v'),[5/length,.6/length,.8/length]);
  near(cageLocalDirection(s,'face'),[0,.8,-.6]);
 }
});
test('lowest actual vertex ID, not face-array start, determines the U edge',()=>{
 const c={...cage,faces:[[2,3,0,1],cage.faces[1]]};near(cageLocalDirection(picked(c),'face-u'),[1,0,0]);
 // Reassign IDs: the lowest ID now sits on the former upper-right corner.
 const permutation=[2,3,0,1,4,5],positions=permutation.flatMap(v=>cage.positions.slice(3*v,3*v+3));
 const renamed={positions,faces:[[2,3,0,1]]};near(cageLocalDirection(picked(renamed),'face-u'),[-1,0,0]);
});
test('U/V movement preserves unpicked coordinates, source and one-step history',()=>{
 for(const [frame,expected] of [['face-u',[7,3,5,13,3,5,15,6,9,6,6,9]],['face-v',[2,6,9,8,6,9,10,9,13,1,9,13]]] as const){
  const s=picked(),before=structuredClone(s),direction=cageLocalDirection(s,frame),r=transformCageSelection(s,{kind:'move-along',direction,distance:5});
  near(r.cage.positions.slice(0,12),expected);assert.deepEqual(r.cage.positions.slice(12),s.cage.positions.slice(12));assert.deepEqual(r.cage.faces,s.cage.faces);assert.deepEqual(r.cage.creases,s.cage.creases);assert.deepEqual(s,before);assert.equal(r.sel,s.sel);assert.equal(r.undo.length,1);
  const u=undoSession(r);assert.deepEqual(u.cage,s.cage);assert.deepEqual(u.sel,s.sel);assert.deepEqual(redoSession(u).cage,r.cage);
 }
});
test('both plane axes refuse nonplanar, concave, degenerate, stale and multiple selections',()=>{
 const bad=[
  picked({...cage,positions:cage.positions.map((v,i)=>i===11?v+1:v)}),
  picked({positions:[2,3,5,8,3,5,3,3.6,5.8,1,6,9],faces:[[0,1,2,3]]}),
  picked({...cage,faces:[[0,1,1,3]]}),picked({...cage,faces:[[0,1,2]]}),
  {...picked(),sel:{vertices:[],edges:[],faces:[0,1]}}, {...picked(),sel:{vertices:[],edges:[],faces:[99]}},
  {...picked(),mode:'vertex' as const}, {...picked(),sel:{vertices:[0],edges:[],faces:[0]}},
 ];
 for(const s of bad)for(const frame of ['face-u','face-v'] as const){const before=structuredClone(s);assert.throws(()=>cageLocalDirection(s,frame));assert.deepEqual(s,before);}
});
