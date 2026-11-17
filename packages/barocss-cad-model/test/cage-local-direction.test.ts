import test from 'node:test';
import assert from 'node:assert/strict';
import { cageLocalDirection, normalizedCageDirection } from '../src/subd/cageLocalDirection';
import { startSession, transformCageSelection, commitDrag, undoSession, redoSession, type CageSession, type StudioCage } from '../src/subd/cageEdit';
const cage: StudioCage={positions:[2,3,5,12,3,5,12,7.8,11.4,2,7.8,11.4,20,3,5,20,7.8,11.4],faces:[[0,1,2,3],[1,4,5,2]],creases:[[0,1]]};
const face=(c=cage): CageSession=>({...startSession(0,c),mode:'face',sel:{vertices:[],edges:[],faces:[0]}});
const edge=(a=0,b=3): CageSession=>({...startSession(0,cage),mode:'edge',sel:{vertices:[],edges:[[a,b]],faces:[]}});
function near(a:readonly number[],b:readonly number[]){assert.equal(a.length,b.length);a.forEach((x,i)=>assert.ok(Math.abs(x-b[i])<1e-12,`${x} != ${b[i]}`));}
test('tilted 3-4-5 face winding normal and lower-ID edge tangent have independent expected directions',()=>{
 near(cageLocalDirection(face(),'face'),[0,-.8,.6]);
 near(cageLocalDirection(face({...cage,faces:[[3,2,1,0],cage.faces[1]]}),'face'),[0,.8,-.6]);
 near(cageLocalDirection(edge(),'edge'),[0,.6,.8]);near(cageLocalDirection(edge(3,0),'edge'),[0,.6,.8]);
 assert.deepEqual(cageLocalDirection(edge(1,0),'edge'),[1,0,0]);
});
test('local move uses normalized direction and immutable baseline, preserving unselected points and history',()=>{
 const s=face(),before=structuredClone(s),direction=cageLocalDirection(s,'face');
 const r=transformCageSelection(s,{kind:'move-along',direction,distance:5});
 near(r.cage.positions.slice(0,12),[2,-1,8,12,-1,8,12,3.8,14.4,2,3.8,14.4]);assert.deepEqual(r.cage.positions.slice(12),s.cage.positions.slice(12));
 assert.deepEqual(r.cage.faces,s.cage.faces);assert.deepEqual(r.cage.creases,s.cage.creases);assert.equal(r.sel,s.sel);assert.deepEqual(s,before);assert.equal(r.undo.length,1);
 const drag=commitDrag(s,[0,-4,3],false);near(r.cage.positions,drag.cage.positions);
 const u=undoSession(r);assert.deepEqual(u.cage,s.cage);assert.deepEqual(u.sel,s.sel);assert.deepEqual(redoSession(u).cage,r.cage);
 assert.equal(transformCageSelection(u,{kind:'move-along',direction,distance:0}),u);
 const neg=transformCageSelection(s,{kind:'move-along',direction:[0,-8,6],distance:-5});near(neg.cage.positions.slice(0,3),[2,7,2]);
 for(const axis of [0,1,2] as const){const d:[number,number,number]=[0,0,0];d[axis]=4;assert.deepEqual(transformCageSelection(s,{kind:'move-along',direction:d,distance:2}),transformCageSelection(s,{kind:'move',axis,distance:2}));}
});
test('finite tiny and huge directions normalize robustly without losing length',()=>{
 near(normalizedCageDirection([0,3e-300,4e-300]),[0,.6,.8]);near(normalizedCageDirection([0,3e300,4e300]),[0,.6,.8]);
 near(normalizedCageDirection([Number.MAX_VALUE,Number.MAX_VALUE,0]),[Math.SQRT1_2,Math.SQRT1_2,0]);
 assert.deepEqual(normalizedCageDirection([Number.MIN_VALUE,0,0]),[1,0,0]);
});
test('unsupported face and edge frames reject atomically',()=>{
 const invalid=[face({...cage,faces:[[0,1,2]]}),face({...cage,faces:[[0,1,2,2]]}),face({...cage,positions:cage.positions.map((v,i)=>i>=6&&i<9?cage.positions[i-3]:v)}),face({positions:[2,3,5,12,3,5,4,4.2,6.6,2,7.8,11.4],faces:[[0,1,2,3]]}),{...face(),sel:{vertices:[],edges:[],faces:[0,1]}},{...face(),sel:{vertices:[],edges:[],faces:[99]}}];
 // Nonplanarity: move one corner out of the common plane.
 invalid.push(face({...cage,positions:cage.positions.map((v,i)=>i===11?v+1:v)}));
 for(const s of invalid){const before=structuredClone(s);assert.throws(()=>cageLocalDirection(s,'face'));assert.deepEqual(s,before);}
 for(const s of [edge(0,2),edge(0,99),{...edge(),sel:{vertices:[],edges:[[0,1],[1,2]] as [number,number][],faces:[]}}, {...edge(),cage:{...cage,positions:cage.positions.map((v,i)=>i>=9&&i<12?cage.positions[i-9]:v)}}]) assert.throws(()=>cageLocalDirection(s,'edge'));
 assert.throws(()=>cageLocalDirection(face(),'edge'));assert.throws(()=>cageLocalDirection(edge(),'face'));
});
test('mirror constraint and invalid move inputs preserve original state',()=>{
 const s={...edge(0,1),mirror:'x' as const,cage:{...cage,positions:cage.positions.map((v,i)=>i%3===0?v-2:v)}};
 const r=transformCageSelection(s,{kind:'move-along',direction:[1,0,0],distance:2});assert.equal(r.cage.positions[0],0);assert.equal(r.cage.positions[3],12);assert.deepEqual(r,commitDrag(s,[2,0,0],false));
 const seam={...s,mode:'vertex' as const,sel:{vertices:[0],edges:[],faces:[]}};assert.equal(transformCageSelection(seam,{kind:'move-along',direction:[1,0,0],distance:2}),seam);
 for(const direction of [[0,0,0],[NaN,0,1],[0,Infinity,1],[1,2]]){const before=structuredClone(s);assert.throws(()=>transformCageSelection(s,{kind:'move-along',direction:direction as [number,number,number],distance:1}));assert.deepEqual(s,before);}
 for(const distance of [Infinity,NaN]) assert.throws(()=>transformCageSelection(s,{kind:'move-along',direction:[1,0,0],distance}));
 const huge={...face(),cage:{...cage,positions:cage.positions.map((v,i)=>i===0?Number.MAX_VALUE:v)}};assert.throws(()=>transformCageSelection(huge,{kind:'move-along',direction:[1,0,0],distance:Number.MAX_VALUE}),/overflow/);
});
