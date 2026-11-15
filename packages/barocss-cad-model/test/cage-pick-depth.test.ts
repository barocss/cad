import test from 'node:test';
import assert from 'node:assert/strict';
import { boxCage } from '../src/app/primitives';
import { pickCage, select, startSession, runOp, undoSession, type CageHit, type StudioCage } from '../src/subd/cageEdit';
const identity = (p: [number, number, number]): [number, number, number] => p;
const vertices = (c: StudioCage, hit: CageHit | null) => {
  assert.ok(hit);
  return hit.kind === 'vertex' ? [hit.v] : hit.kind === 'edge' ? [hit.a, hit.b] : c.faces[hit.f];
};
test('front/back resolve subpixel overlap in Top and Bottom at both viewport scales', () => {
  const cage = boxCage(30, 20, 16, 4, [0, 0, 0]), before = structuredClone(cage);
  for (const scale of [10, 15]) for (const top of [true, false]) for (const offset of [-.06, 0, .06]) {
    const project = ([x,y,z]: [number,number,number]): [number,number,number] => [400+scale*x+(z===16?offset:0), 300-scale*y, top?-z:z];
    for (const [mode,x,y] of [['edge',3.75,0],['vertex',0,0],['face',3.75,2.5]] as const) {
      for (const depth of ['front','back'] as const) {
        const hit = pickCage(cage,project,400+scale*x,300-scale*y,mode,depth);
        const wanted = (top === (depth === 'front')) ? 16 : 0;
        assert.ok(vertices(cage,hit).every(v=>cage.positions[3*v+2]===wanted), JSON.stringify({mode,depth,top,offset,hit}));
      }
      assert.deepEqual(pickCage(cage,project,400+scale*x,300-scale*y,mode), pickCage(cage,project,400+scale*x,300-scale*y,mode,'front'));
    }
  }
  assert.deepEqual(cage,before);
});
test('depth only resolves the fixed closest-distance band, not distant candidates', () => {
  const c: StudioCage = {positions:[0,0,1, .4,0,0, .8,0,-100],faces:[]};
  assert.deepEqual(pickCage(c,identity,0,0,'vertex'),{kind:'vertex',v:1});
  assert.deepEqual(pickCage(c,identity,0,0,'vertex','back'),{kind:'vertex',v:0});
  assert.equal(pickCage(c,identity,100,100,'vertex'),null);
  assert.equal(pickCage({positions:[8,0,0],faces:[]},identity,0,0,'vertex'),null);
});
test('edge depth is interpolated at the pointer, not its midpoint', () => {
  const c: StudioCage={positions:[0,0,-10,10,0,10,0,20,0, 0,0,-4,10,0,-4,0,20,-4],faces:[[0,1,2],[3,4,5]]};
  assert.deepEqual(pickCage(c,identity,2,0,'edge'),{kind:'edge',a:0,b:1});
  assert.deepEqual(pickCage(c,identity,2,0,'edge','back'),{kind:'edge',a:3,b:4});
  assert.deepEqual(pickCage(c,identity,8,0,'edge'),{kind:'edge',a:3,b:4});
  assert.deepEqual(pickCage(c,identity,8,0,'edge','back'),{kind:'edge',a:0,b:1});
});
test('nonfinite projections and pointers produce no malformed hits; collapsed edges stay finite', () => {
  const c=boxCage(30,20,16,4,[0,0,0]);
  for (const mode of ['vertex','edge','face'] as const) {
    for (const bad of [NaN,Infinity,-Infinity]) {
      assert.equal(pickCage(c,()=>[0,0,bad],0,0,mode),null);
      assert.equal(pickCage(c,identity,bad,0,mode),null);
      assert.equal(pickCage(c,()=>[bad,0,0],0,0,mode,'back'),null);
    }
  }
  const collapsed: StudioCage={positions:[0,0,-2,0,0,2,20,20,0],faces:[[0,1,2]]};
  for (const depth of ['front','back'] as const) assert.deepEqual(pickCage(collapsed,identity,0,0,'edge',depth),{kind:'edge',a:0,b:1});
});
test('depth choice changes selection only; Crease changes the selected layer and Undo restores it', () => {
  const session=startSession(0,boxCage(30,20,16,4,[0,0,0]));
  const project=([x,y,z]: [number,number,number]): [number,number,number]=>[10*x,10*y,-z];
  for (const depth of ['front','back'] as const) {
    const hit=pickCage(session.cage,project,37.5,0,'edge',depth);
    assert.ok(hit?.kind==='edge');
    const selected=select({...session,mode:'edge'},hit,false);
    assert.equal(selected.undo.length,0); assert.deepEqual(selected.cage,session.cage);
    const creased=runOp(selected,'crease');
    assert.ok(creased.cage.creases?.some(([a,b])=>(a===hit.a&&b===hit.b)||(a===hit.b&&b===hit.a)));
    assert.equal(creased.undo.length,1); assert.deepEqual(undoSession(creased).cage,session.cage);
  }
});
