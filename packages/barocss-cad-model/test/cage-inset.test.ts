import test from 'node:test';
import assert from 'node:assert/strict';
import { insetPlanarQuad } from '../src/subd/cageInset';
import { startSession, insetCageSelection, commitDrag, undoSession, redoSession, type CageSession, type StudioCage } from '../src/subd/cageEdit';
const quad: StudioCage = { positions:[2,3,5,12,3,5,12,11,5,2,11,5],faces:[[0,1,2,3]],creases:[[0,1],[3,0]] };
const inner=[3,4,5,11,4,5,11,10,5,3,10,5];
const picked=(c=quad): CageSession=>({...startSession(0,c),mode:'face',sel:{vertices:[],edges:[],faces:[0]}});
function near(a: readonly number[],b: readonly number[]) { assert.equal(a.length,b.length); a.forEach((x,i)=>assert.ok(Math.abs(x-b[i])<1e-10,`${i}: ${x} != ${b[i]}`)); }
function twins(faces: readonly (readonly number[])[]) {
 const edges=new Map<string,[number,number][]>();
 for(const f of faces) for(let i=0;i<f.length;i++) {const a=f[i],b=f[(i+1)%f.length],key=[a,b].sort((x,y)=>x-y).join(':');edges.set(key,[...(edges.get(key)??[]),[a,b]]);}
 let shared=0,boundary=0;
 for(const e of edges.values()) { assert.ok(e.length<=2); if(e.length===2){assert.deepEqual(e[0],[e[1][1],e[1][0]]);shared++;}else boundary++; }
 assert.equal(shared,8); assert.equal(boundary,4);
}
test('10 by 8 quad inset 1 creates independent 8 by 6 inner coordinates and a consistently wound ring',()=>{
 const before=structuredClone(quad),r=insetPlanarQuad(quad,0,1);
 near(Array.from(r.positions).slice(12),inner); assert.deepEqual(Array.from(r.positions).slice(0,12),quad.positions);
 assert.equal(r.faces.length,5); assert.deepEqual(r.faces[0],[4,5,6,7]); twins(r.faces);
 for(const f of r.faces) { const area=f.reduce((sum,a,i)=>{const b=f[(i+1)%f.length];return sum+r.positions[3*a]*r.positions[3*b+1]-r.positions[3*b]*r.positions[3*a+1];},0); assert.ok(area>0); }
 assert.deepEqual(r.creases,quad.creases); assert.deepEqual(quad,before);
});
test('tilted and reversed quads retain physical inset distance and winding',()=>{
 // Rigid 3-4-5 rotation around X, then translation: independent rational fixture.
 const tilted={...quad,positions:[2,3,5,12,3,5,12,7.8,11.4,2,7.8,11.4]};
 const r=insetPlanarQuad(tilted,0,1); near(Array.from(r.positions).slice(12),[3,3.6,5.8,11,3.6,5.8,11,7.2,10.6,3,7.2,10.6]);twins(r.faces);
 const reversed={...quad,faces:[[3,2,1,0]]}; const rr=insetPlanarQuad(reversed,0,1);
 near(Array.from(rr.positions).slice(12),[3,10,5,11,10,5,11,4,5,3,4,5]); twins(rr.faces);
});
test('adjacent untouched face keeps outer edge twin and outer crease without moving its vertices',()=>{
 const c={...quad,positions:[...quad.positions,17,3,5,17,11,5],faces:[[0,1,2,3],[1,4,5,2]]};
 const r=insetPlanarQuad(c,0,1); assert.deepEqual(Array.from(r.positions).slice(0,18),c.positions);assert.deepEqual(r.faces[1],c.faces[1]);assert.deepEqual(r.creases,c.creases);
 assert.ok(r.faces.some(f=>f.some((v,i)=>v===1&&f[(i+1)%f.length]===2)));
 assert.ok(r.faces.some(f=>f.some((v,i)=>v===2&&f[(i+1)%f.length]===1)));
});
test('unsupported geometry and distances reject without mutating source',()=>{
 const bad: StudioCage[]=[
  {...quad,faces:[[0,1,2]]}, {...quad,faces:[[0,1,2,2]]},
  {...quad,positions:[2,3,5,12,3,5,5,5,5,2,11,5]},
  {...quad,positions:[2,3,5,12,3,5,12,11,6,2,11,5]},
  {...quad,positions:[2,3,5,2,3,5,12,11,5,2,11,5]},
  {...quad,positions:[2,3,5,12,3,5,22,3,5,2,11,5]},
  {...quad,faces:[[0,1,2,99]]}, {...quad,positions:[NaN,...quad.positions.slice(1)]},
 ];
 for(const c of bad) { const before=structuredClone(c);assert.throws(()=>insetPlanarQuad(c,0,1));assert.deepEqual(c,before); }
 for(const d of [0,-1,NaN,Infinity,4,4.1,6]) {const before=structuredClone(quad);assert.throws(()=>insetPlanarQuad(quad,0,d));assert.deepEqual(quad,before);}
 for(const f of [-1,.5,1]) assert.throws(()=>insetPlanarQuad(quad,f,1));
});
test('session requires valid face picks and refuses mirror seam faces without consuming history',()=>{
 const s=picked();
 for(const bad of [{...s,mode:'vertex' as const},{...s,sel:{vertices:[],edges:[],faces:[]}},{...s,sel:{vertices:[],edges:[],faces:[0,0]}}]) assert.throws(()=>insetCageSelection(bad,1));
 const seam={...picked({...quad,positions:quad.positions.map((x,i)=>i%3===0?x-2:x)}),mirror:'x' as const};
 const before=structuredClone(seam);assert.throws(()=>insetCageSelection(seam,1),/mirror seam/);assert.deepEqual(seam,before);
});
test('inner face remains selected for extrude and move; undo/redo preserve numerical geometry and two steps',()=>{
 const s=picked(),r=insetCageSelection(s,1);assert.equal(r.undo.length,1);assert.equal(r.mode,'face');assert.deepEqual(r.sel,{vertices:[],edges:[],faces:[0]});near(r.cage.positions.slice(12),inner);
 const raised=commitDrag(r,[0,0,3],true);assert.equal(raised.undo.length,2);assert.deepEqual(raised.cage.positions.slice(0,12),quad.positions);
 const top=raised.cage.faces[raised.sel.faces[0]].flatMap(v=>raised.cage.positions.slice(3*v,3*v+3)); near(top,[3,4,8,11,4,8,11,10,8,3,10,8]);
 const back=undoSession(raised);assert.deepEqual(back.cage,r.cage);assert.deepEqual(back.sel,r.sel);
 const original=undoSession(back);assert.deepEqual(original.cage,s.cage);assert.deepEqual(original.sel,s.sel);
 assert.deepEqual(redoSession(redoSession(original)).cage,raised.cage);assert.deepEqual(s,picked());
});
