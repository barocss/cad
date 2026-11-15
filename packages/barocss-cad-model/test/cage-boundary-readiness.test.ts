import test from 'node:test';
import assert from 'node:assert/strict';
import { boxCage } from '../src/app/primitives';
import { cageBoundaryReadiness, emptyCageSel, openRun, runOp, select, startSession, validationOf, type CageSession } from '../src/subd/cageEdit';
const fixture = () => {
  const base = startSession(0,boxCage(30,20,16,3,[0,0,0]));
  const faceAt=(z:number)=>base.cage.faces.findIndex(f=>f.every(v=>base.cage.positions[3*v+2]===z));
  const hole=runOp(select(select(base,{kind:'face',f:faceAt(16)},false),{kind:'face',f:faceAt(0)},true),'delete');
  const edges=validationOf(hole).boundaryEdges,[a,b]=edges[0],A=openRun(hole.cage,a,b)!;
  const [x,y]=edges.find(([x,y])=>!A.some(([a,b])=>(a===x&&b===y)||(a===y&&b===x)))!,B=openRun(hole.cage,x,y)!;
  return {base,hole,A,B};
};
const withEdges=(s:CageSession, edges:readonly (readonly [number,number])[]):CageSession=>({...s,sel:{...emptyCageSel,edges}});
test('readiness refuses empty, interior and partial-hole selection before commands',()=>{
  const {base,hole,A}=fixture();
  for(const op of ['fill','bridge'] as const){
    assert.equal(cageBoundaryReadiness(base,op).ok,false);
    const [a,b]=base.cage.faces[0];
    const interior=cageBoundaryReadiness(withEdges(base,[[a,b]]),op);
    assert.equal(interior.ok,false);assert.match(interior.reason,/open boundary edges/);
    assert.equal(cageBoundaryReadiness(withEdges(hole,A.slice(0,1)),op).ok,false);
  }
  assert.match(cageBoundaryReadiness(withEdges(hole,A.slice(0,1)),'fill').reason,/complete hole boundary/);
  assert.equal(cageBoundaryReadiness(withEdges(hole,[A[0],A[2]]),'fill').ok,false);
});
test('one complete hole readies Fill; two holes ready Bridge without creating geometry',()=>{
  const {hole,A,B}=fixture();
  const one=withEdges(hole,A),two=withEdges(hole,[...A,...B]);
  for(const s of [one,two]){
    const before=structuredClone(s);
    const fill=cageBoundaryReadiness(s,'fill'),bridge=cageBoundaryReadiness(s,'bridge');
    assert.equal(fill.ok,s===one);assert.equal(bridge.ok,s===two);
    assert.deepEqual(s,before);
  }
  assert.match(cageBoundaryReadiness(two,'bridge').reason,/attempt/);
  const bridged=runOp(two,'bridge');assert.equal(bridged.cage.faces.length,56);assert.equal(validationOf(bridged).boundaryEdges.length,0);
});
test('Bridge permits matched open chains but rejects unequal counts and mixed closure',()=>{
  const {hole,A,B}=fixture();
  const chains=withEdges(hole,[...A.slice(0,2),...B.slice(0,2)]),before=structuredClone(chains);
  assert.equal(cageBoundaryReadiness(chains,'bridge').ok,true);
  assert.equal(cageBoundaryReadiness(chains,'fill').ok,false);
  assert.equal(runOp(chains,'bridge').cage.faces.length,hole.cage.faces.length+2);
  assert.deepEqual(chains,before);
  const uneven=cageBoundaryReadiness(withEdges(hole,[A[0],...B.slice(0,2)]),'bridge');
  assert.equal(uneven.ok,false);assert.match(uneven.reason,/matching edge counts/);
  const mixed=cageBoundaryReadiness(withEdges(hole,[...A,...B.slice(0,2)]),'bridge');
  assert.equal(mixed.ok,false);assert.match(mixed.reason,/not one of each/);
});
test('invalid edge references and duplicated boundary edges never claim readiness or mutate selection',()=>{
  const {hole,A}=fixture();
  for(const edges of [[[999,1000]],[A[0],A[0],...A.slice(1)]] as (readonly [number,number])[][]){
    const s=withEdges(hole,edges),before=structuredClone(s);
    for(const op of ['fill','bridge'] as const)assert.equal(cageBoundaryReadiness(s,op).ok,false);
    assert.deepEqual(s,before);
  }
});
