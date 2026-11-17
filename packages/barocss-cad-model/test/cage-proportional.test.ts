import test from 'node:test';
import assert from 'node:assert/strict';
import { cageProportionalWeights } from '../src/subd/cageProportional';
import { startSession,transformCageSelection,undoSession,redoSession,type CageSession,type StudioCage } from '../src/subd/cageEdit';
// Bottom rail x=0,2,4,6; top rail is far enough to stay outside R=4.
const strip:StudioCage={positions:[0,0,0,2,0,0,4,0,0,6,0,0,0,10,0,2,10,0,4,10,0,6,10,0],faces:[[0,1,5,4],[1,2,6,5],[2,3,7,6]],creases:[[0,1]]};
const session=(vertices=[0],c=strip):CageSession=>({...startSession(0,c),sel:{vertices,edges:[],faces:[]}});
test('distance 0, R/2, R and beyond have weights 1, .5, 0, 0; creases do not block',()=>{
 const s=session(),before=structuredClone(s);assert.deepEqual(cageProportionalWeights(s,4),[1,.5,0,0,0,0,0,0]);assert.deepEqual(s,before);
 assert.deepEqual(cageProportionalWeights(session([0,2]),4),[1,.5,1,.5,0,0,0,0]);
 assert.deepEqual(cageProportionalWeights(session([0,0,2]),4),cageProportionalWeights(session([2,0]),4));
});
test('U-shaped topology uses path length rather than spatial distance; nearby disconnected parts stay zero',()=>{
 const c:StudioCage={positions:[0,0,0,0,10,0,1,10,0,1,0,0,.1,.1,0,.2,.1,0,.1,.2,0],faces:[[0,1,2],[1,2,3],[4,5,6]]};
 // Vertex 3 is only 1 mm away but no edge 0-3 exists; shortest edge path exceeds 20 mm.
 const w=cageProportionalWeights(session([0],c),3);assert.deepEqual(w,[1,0,0,0,0,0,0]);
});
test('zero length edges propagate zero distance, tiny radii retain seeds, enormous finite radii remain finite',()=>{
 const c={...strip,positions:strip.positions.map((v,i)=>i===3?0:v)};
 assert.deepEqual(cageProportionalWeights(session([0],c),Number.MIN_VALUE),[1,1,0,0,0,0,0,0]);
 assert.deepEqual(cageProportionalWeights(session(),Number.MIN_VALUE),[1,0,0,0,0,0,0,0]);
 const w=cageProportionalWeights(session(),Number.MAX_VALUE);assert.ok(w.every(v=>Number.isFinite(v)&&v>=0&&v<=1));
});
test('weighted move modifies only positive influences; baseline, history, and exact zero-weight coordinates preserved',()=>{
 const s=session(),before=structuredClone(s),r=transformCageSelection(s,{kind:'move-proportional',axis:2,distance:4,radius:4});
 assert.deepEqual(r.cage.positions,[0,0,4,2,0,2,...strip.positions.slice(6)]);assert.deepEqual(s,before);
 assert.deepEqual(r.cage.faces,s.cage.faces);assert.deepEqual(r.cage.creases,s.cage.creases);assert.equal(r.sel,s.sel);assert.equal(r.start,s.start);assert.equal(r.undo.length,1);
 const u=undoSession(r);assert.deepEqual(u.cage,s.cage);assert.deepEqual(u.sel,s.sel);assert.deepEqual(redoSession(u).cage,r.cage);
 assert.equal(transformCageSelection(u,{kind:'move-proportional',axis:1,distance:0,radius:4}),u);
 assert.equal(transformCageSelection(u,{kind:'move-proportional',axis:1,distance:2,radius:4}).redo.length,0);
 const negative=transformCageSelection(s,{kind:'move-proportional',axis:1,distance:-2,radius:4});assert.deepEqual(negative.cage.positions.slice(0,6),[0,-2,0,2,-1,0]);
});
test('mirror seam clamps normal motion but permits influenced non-seam and tangential movement',()=>{
 const s={...session(),mirror:'x' as const};
 const r=transformCageSelection(s,{kind:'move-proportional',axis:0,distance:4,radius:4});assert.deepEqual(r.cage.positions.slice(0,6),[0,0,0,4,0,0]);
 assert.equal(transformCageSelection(s,{kind:'move-proportional',axis:0,distance:4,radius:1}),s);
 const t=transformCageSelection(s,{kind:'move-proportional',axis:1,distance:4,radius:4});assert.deepEqual(t.cage.positions.slice(0,6),[0,4,0,2,2,0]);
});
test('invalid seeds/topology/radius and overflow refuse atomically, even at zero movement',()=>{
 const s=session();
 for(const radius of [0,-1,NaN,Infinity]) {assert.throws(()=>cageProportionalWeights(s,radius));assert.throws(()=>transformCageSelection(s,{kind:'move-proportional',axis:0,distance:0,radius}));}
 const bad:CageSession[]=[session([]),session([99]),session([.5]),{...s,mode:'face'},{...s,sel:{vertices:[0],edges:[[0,1]],faces:[]}},session([0],{...strip,faces:[[0,1,1]]}),session([0],{...strip,positions:[NaN,...strip.positions.slice(1)]})];
 for(const b of bad){const before=structuredClone(b);assert.throws(()=>cageProportionalWeights(b,4));assert.deepEqual(b,before);}
 const huge=session([0],{...strip,positions:strip.positions.map((v,i)=>i===0?-Number.MAX_VALUE:i===3?Number.MAX_VALUE:v)});
 assert.throws(()=>cageProportionalWeights(huge,1),/overflows/);
 for(const distance of [NaN,Infinity])assert.throws(()=>transformCageSelection(s,{kind:'move-proportional',axis:0,distance,radius:4}));
 assert.throws(()=>transformCageSelection(s,{kind:'move-proportional',axis:3 as 0,distance:1,radius:4}));
 // All edges finite, but adding the displacement to the seed coordinate overflows.
 const p=session([0],{...strip,positions:strip.positions.map((v,i)=>i%3===0?Number.MAX_VALUE:v)}),before=structuredClone(p);
 assert.throws(()=>transformCageSelection(p,{kind:'move-proportional',axis:0,distance:Number.MAX_VALUE,radius:4}),/overflow/);assert.deepEqual(p,before);
});
