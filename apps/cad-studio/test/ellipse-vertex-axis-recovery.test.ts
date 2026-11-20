import assert from 'node:assert/strict';
import test from 'node:test';
import {ellipseMatches,ellipseShape} from '@barocss/cad-model/sketch/ellipse';
import {xyPlane} from '@barocss/cad-model/sketch/plane';
import type {Polygon} from '@barocss/cad-model/sketch/rules';
import type {SketchState} from '@barocss/cad-model/sketch/types';
import {pickSketchViewport} from '../src/viewport/sketchOutlinePick';
import {studioSketchViewportActions} from '../src/viewport/studioSketchViewportActions';

const ellipse=()=>ellipseShape({center:[60,40],rx:50,ry:20,angle:0});
function fixture(source:Polygon,tool:SketchState['tool']='dimension') {
  let state:SketchState|null={plane:xyPlane(),shape:source,tool};
  const errors:string[]=[],offers:SketchState[]=[];
  let updates=0;
  const handlers=()=>studioSketchViewportActions({sketch:state,liveShape:{current:source},currentSketchSource:()=>undefined,
    setSketch:next=>{state=typeof next==='function'?next(state):next;},
    setSketchError:message=>errors.push(message),offerEllipseAxes:current=>offers.push(current),
    clearOutlinePickIssue:()=>{},updateCircleDiameter:()=>{},setConstraintConflict:()=>{},
    updateShape:()=>{updates++;},trimSketch:()=>{}});
  const hit=(x:number,y:number)=>pickSketchViewport(state!,source,(u,v)=>[8*u,8*v],8*x,8*y);
  return {get state(){return state;},errors,offers,get updates(){return updates;},handlers,hit};
}

test('actual pick reducer sends the ellipse generated vertices to owned axis recovery instead of opening a point distance',()=>{
  const source=ellipse();assert.equal(source.points.length,192);assert.equal(ellipseMatches(source),true);
  const q=fixture(source),snapshot=JSON.stringify(source);
  for(const i of [0,1,48,96]){
    const [x,y]=source.points[i]!, hit=q.hit(x,y);
    assert.deepEqual(hit,{kind:'point',i});
    q.handlers().onSketchPick?.(hit,false);
    assert.equal(q.state?.editDim,null);assert.deepEqual(q.state?.picked,[]);
    assert.equal(q.state?.shape,source);assert.equal(q.offers.at(-1),q.state);
    assert.match(q.errors.at(-1)!,/Edit Rx or Ry/);
  }
  q.handlers().onSketchPick?.({kind:'edge',i:0},false);
  assert.equal(q.offers.length,5);assert.equal(q.updates,0);
  assert.equal(JSON.stringify(source),snapshot);
});

test('Select, unrelated polygon vertices, invalid ellipse metadata and genuine attached circle retain existing picks',()=>{
  const source=ellipse();
  const select=fixture(source,'select');
  select.handlers().onSketchPick?.(select.hit(...source.points[0]!),false);
  assert.deepEqual(select.state?.picked,[{kind:'point',i:0}]);assert.equal(select.offers.length,0);
  const invalid={...source,ellipse:{center:[60,40] as [number,number],rx:52,ry:20,angle:0}};
  assert.equal(ellipseMatches(invalid),false);
  const malformed=fixture(invalid);
  for(const i of [0,96]) malformed.handlers().onSketchPick?.(malformed.hit(...invalid.points[i]!),false);
  assert.equal(malformed.state?.editDim,'dist0_96');assert.equal(malformed.offers.length,0);
  const triangle:Polygon={kind:'polygon',closed:true,points:[[0,0],[40,0],[20,20]]};
  const regular=fixture(triangle);
  for(const i of [0,1]) regular.handlers().onSketchPick?.(regular.hit(...triangle.points[i]!),false);
  assert.equal(regular.state?.editDim,'len0');assert.equal(regular.offers.length,0);
  const withCircle={...source,circles:[{c:[60,40] as [number,number],r:3}]};
  assert.equal(ellipseMatches(withCircle),true);
  const attached=fixture(withCircle);const hit=attached.hit(60,40);
  assert.deepEqual(hit,{kind:'circle',i:0});
  attached.handlers().onSketchPick?.(hit,false);
  assert.equal(attached.state?.editDim,'cdia0');assert.equal(attached.offers.length,0);
});
