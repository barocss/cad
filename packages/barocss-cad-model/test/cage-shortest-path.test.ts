import test from 'node:test';
import assert from 'node:assert/strict';
import { commitDrag, redoSession, runOp, select, shortestCagePath, startSession, undoSession, type StudioCage } from '../src/subd/cageEdit';
const grid: StudioCage={positions:[0,0,0,1,0,0,2,0,0,0,1,0,1,1,0,2,1,0,0,2,0,1,2,0,2,2,0],faces:[[0,1,4,3],[1,2,5,4],[3,4,7,6],[4,5,8,7]],creases:[[1,2],[2,5]]};
const seeds=(c:StudioCage,a:number,b:number)=>select(select(startSession(0,c),{kind:'vertex',v:a},false),{kind:'vertex',v:b},true);
test('fewest edges, deterministic lower-ID tie breaking independent of pick/face/coordinate order',()=>{
 for(const [a,b] of [[0,8],[8,0]]) {
  const s=seeds(grid,a,b),r=runOp(s,'select-path');assert.deepEqual(r.sel.edges,[[0,1],[1,2],[2,5],[5,8]]);assert.equal(r.mode,'edge');assert.deepEqual(r.sel.vertices,[]);
  assert.equal(r.cage,s.cage);assert.equal(r.undo,s.undo);assert.equal(r.redo,s.redo);assert.equal(r.start,s.start);
 }
 const moved={...grid,positions:grid.positions.map((v,i)=>v*(i%3===0?100:1)+73),faces:[...grid.faces].reverse()};
 assert.deepEqual(shortestCagePath(seeds(moved,8,0)).sel.edges,[[0,1],[1,2],[2,5],[5,8]]);
});
test('boundary, pole and closed-cube paths use edges, not face diagonals or distances',()=>{
 const cube={positions:[0,0,0,1,0,0,1,1,0,0,1,0,0,0,1,1,0,1,1,1,1,0,1,1],faces:[[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]]};
 assert.deepEqual(shortestCagePath(seeds(cube,0,6)).sel.edges,[[0,1],[1,2],[2,6]]);
 const fan={positions:[0,0,0,1,0,0,0,1,0,-1,0,0,0,-1,0],faces:[[0,1,2],[0,2,3],[0,3,4],[0,4,1]]};
 assert.deepEqual(shortestCagePath(seeds(fan,1,3)).sel.edges,[[1,0],[0,3]]);
});
test('disconnected, isolated, invalid and wrong-mode seeds refuse without source mutation',()=>{
 const c={positions:[...grid.positions,...grid.positions],faces:[...grid.faces,...grid.faces.map(f=>f.map(v=>v+9))]};
 for(const s of [seeds(c,0,17),seeds({...grid,positions:[...grid.positions,10,10,10]},0,9),seeds(grid,0,99),seeds(grid,0,-1),startSession(0,grid),{...seeds(grid,0,8),mode:'face' as const},{...seeds(grid,0,8),sel:{vertices:[0,0],edges:[],faces:[]}}]) {
  const before=structuredClone(s);assert.throws(()=>shortestCagePath(s));assert.deepEqual(s,before);
 }
 const bad=seeds({...grid,faces:[[0,1,999]]},0,1);assert.throws(()=>shortestCagePath(bad),/invalid cage/);
});
test('follow-on crease/move owns history, restores exact path selection and preserves redo',()=>{
 const s=seeds(grid,0,8),path=shortestCagePath(s),sharp=runOp(path,'crease');
 assert.equal(sharp.undo.length,1);assert.deepEqual(undoSession(sharp).sel,path.sel);assert.deepEqual(redoSession(undoSession(sharp)).cage,sharp.cage);
 const moved=commitDrag(path,[0,0,2],false);assert.equal(moved.undo.length,1);assert.deepEqual(undoSession(moved).sel,path.sel);
 const undone=undoSession(moved);const again=shortestCagePath({...undone,mode:'vertex',sel:s.sel});assert.equal(again.redo,undone.redo);
});
test('polygon and hole rims stay on edges; insertion uses current split-edge topology',()=>{
 const rim={positions:[0,0,0,1,0,0,2,0,0,2,1,0,2,2,0,1,2,0,0,2,0,0,1,0],faces:[[0,1,2,3,4,5,6,7]]};
 assert.deepEqual(shortestCagePath(seeds(rim,0,4)).sel.edges,[[0,1],[1,2],[2,3],[3,4]]);
 const hole:StudioCage={positions:Array.from({length:16},(_,i)=>[i%4,Math.floor(i/4),0]).flat(),faces:[]};
 for(let y=0;y<3;y++)for(let x=0;x<3;x++)if(x!==1||y!==1){const a=y*4+x;hole.faces.push([a,a+1,a+5,a+4]);}
 assert.deepEqual(shortestCagePath(seeds(hole,5,10)).sel.edges,[[5,6],[6,10]]);
 const quad={positions:[0,0,0,2,0,0,2,2,0,0,2,0],faces:[[0,1,2,3]]};
 const split=runOp(select(startSession(0,quad),{kind:'edge',a:0,b:1},false),'insert-loop');
 const two=select(select(split,{kind:'vertex',v:0},false),{kind:'vertex',v:1},true),r=shortestCagePath(two);
 assert.deepEqual(r.sel.edges,[[0,4],[4,1]]);assert.equal(r.undo,two.undo);assert.equal(r.cage,two.cage);
 assert.throws(()=>shortestCagePath(select(two,{kind:'vertex',v:2},true)),/exactly two/);
});
