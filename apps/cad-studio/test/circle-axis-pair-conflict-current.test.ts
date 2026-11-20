import assert from 'node:assert/strict';
import test from 'node:test';
import {commitDimension,constraintEntries,removeConstraint,type Polygon} from '@barocss/cad-model/sketch/rules';
import {xyPlane} from '@barocss/cad-model/sketch/plane';
import type {SketchState} from '@barocss/cad-model/sketch/types';
import {circleAxisPairConflict,circleDistanceConflict} from '../src/sketch/constraintList';
import {studioSketchViewportActions} from '../src/viewport/studioSketchViewportActions';

test('two same-pair centre projections expose both exact rows when the third length disagrees',()=>{
  let source: Polygon={kind:'polygon',closed:true,points:[[0,0],[60,0],[60,30],[0,30]],
    hv:{h:[0,2],v:[1,3]},circles:[{c:[12,10],r:3},{c:[40,18],r:3}]};
  for (const [key,value] of [['len0',60],['len1',30],['cedge0_0',8],['cedge3_0',15],['ccdx0_1',25],['ccdy0_1',12]] as const) {
    const edit=commitDimension(source,key,value);
    assert.ok(edit.ok,edit.ok?'':edit.reason);source=edit.shape;
  }
  assert.deepEqual(source.circles!.map(c=>c.c),[[15,8],[40,20]]);
  assert.ok(Math.hypot(25,12)>26 && Math.hypot(25,12)<30);
  const before=JSON.stringify(source);
  const ids=constraintEntries(source).filter(r=>/^(Horizontal|Vertical) distance$/.test(r.label)).map(r=>r.id);
  assert.deepEqual(ids,['rule:2','rule:3']);
  for(const attempt of [20,26,30]) {
    let sketch:SketchState|null={plane:xyPlane(),tool:'dimension',shape:source,editDim:'ccdist0_1'};
    const current=sketch;
    const liveShape={current:source};
    const calls={error:[] as string[],focus:[] as readonly string[][],reason:[] as string[],mutations:0};
    const actions=studioSketchViewportActions({liveShape,sketch:current,currentSketchSource:()=>undefined,
      setSketch:next=>{sketch=typeof next==='function'?next(sketch):next;},
      setSketchError:reason=>calls.error.push(reason),clearOutlinePickIssue:()=>{},updateCircleDiameter:()=>{},
      setConstraintConflict:(reason,owner,rows)=>{assert.equal(owner,source);calls.reason.push(reason);calls.focus=[...calls.focus,[...rows]];},
      updateShape:()=>{calls.mutations++;},trimSketch:()=>{}});
    assert.ok(actions.onDimCommit);
    actions.onDimCommit('ccdist0_1',attempt,source);
    assert.equal(calls.error.length,0);
    if(attempt===20) {
      assert.deepEqual(calls.focus,[[ids[0]]]);
      assert.match(calls.reason[0]!,/stored horizontal distance of 25 mm/);
    } else {
      assert.deepEqual(calls.focus,[ids]);
      assert.match(calls.reason[0]!,/stored horizontal 25 mm and vertical 12 mm distances \(together ≈ 27[.]73084925 mm\)/);
    }
    assert.equal(calls.mutations,0);assert.equal(sketch!.shape,source);assert.equal(JSON.stringify(source),before);
    assert.equal(circleDistanceConflict(source,'ccdist0_1',attempt)?.id,attempt===20?ids[0]:undefined);
  }
  const released=removeConstraint(source,'rule:3');
  const applied=commitDimension(released,'ccdist0_1',30);
  assert.ok(applied.ok,applied.ok?'':applied.reason);
  const [a,b]=applied.shape.circles!.map(c=>c.c);
  assert.ok(Math.abs(Math.abs(b![0]-a![0])-25)<1e-6);
  assert.ok(Math.abs(Math.abs(b![1]-a![1])-Math.sqrt(275))<1e-6);
  assert.ok(Math.abs(Math.hypot(b![0]-a![0],b![1]-a![1])-30)<1e-6);
});

test('combined proof is conservative under tolerances, reordered pair and unrelated or invalid rows',()=>{
  const s:Polygon={kind:'polygon',closed:true,points:[[0,0],[60,0],[60,30],[0,30]],
    hv:{h:[0,2],v:[1,3]},circles:[{c:[15,8],r:3},{c:[40,20],r:3},{c:[50,20],r:2}]};
  const x={kind:'ccdx',a:1,b:0,value:25} as const;
  const y={kind:'ccdy',a:0,b:1,value:12} as const;
  const unrelated={kind:'ccdx',a:0,b:2,value:35} as const;
  const shape={...s,rules:[y,unrelated,x]};
  const proof=circleAxisPairConflict(shape,'ccdist0_1',30);
  assert.deepEqual(proof,{horizontal:{id:'rule:2',value:25},vertical:{id:'rule:0',value:12},distance:Math.hypot(25,12)});
  for(const r of [Math.hypot(25,12),Math.hypot(25,12)-1e-7,Math.hypot(25,12)+1e-7,NaN,0,Infinity])
    assert.equal(circleAxisPairConflict(shape,'ccdist0_1',r),undefined);
  for(const k of ['ccdx0_1','ccdist1_0','ccdist0_0','ccdist0_2','ccdist0_3','ccdist0_99999999999999999'])
    assert.equal(circleAxisPairConflict(shape,k,30),undefined);
  for(const rules of [[x],[x,{...y,value:0}],[y,{...x,value:NaN}],[x,y,x],[x,y,{...y,value:13}],[x,{...y,b:2}]])
    assert.equal(circleAxisPairConflict({...s,rules},'ccdist0_1',30),undefined);
  assert.equal(circleAxisPairConflict({...shape,closed:false},'ccdist0_1',30),undefined);
  assert.equal(circleAxisPairConflict({...shape,pending:true},'ccdist0_1',30),undefined);
});
