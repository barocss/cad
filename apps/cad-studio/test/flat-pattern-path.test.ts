import assert from 'node:assert/strict';
import test from 'node:test';
import type { FlatSegment } from '@barocss/cad';
import { evaluateDoc } from '@barocss/cad-model/engine/evaluate';
import { emptyDoc, withNode } from '@barocss/cad-model/engine/doc';
import { flatLoopPath } from '../src/ui/flatPatternPath';

type P = [number, number];
const near = (a: P, b: P) => a.forEach((v,i)=>assert.ok(Math.abs(v-b[i])<1e-8, `${a} != ${b}`));

// Decode the SVG endpoint-form circular arcs independently: find both geometric
// centers, then use the SVG large/sweep flags to choose one center and midpoint.
function svgArcs(d: string) {
  let from: P = [NaN,NaN];
  const arcs = [];
  for (const [,cmd,raw] of d.matchAll(/([MLAZ])([^MLAZ]*)/g)) {
    const args = raw.trim().split(/\s+/).map(Number);
    if (cmd === 'M' || cmd === 'L') { from = [args[0],args[1]]; continue; }
    if (cmd !== 'A') continue;
    const [r,ry,rotation,large,sweep,x,y] = args;
    assert.equal(r,ry); assert.equal(rotation,0);
    const to: P = [x,y], dx = x-from[0], dy = y-from[1];
    const chord = Math.hypot(dx,dy);
    assert.ok(chord>0 && chord<=2*r+1e-9);
    const hh = Math.sqrt(Math.max(0,r*r-chord*chord/4));
    const sx = (from[0]+x)/2, sy = (from[1]+y)/2;
    const centers: P[] = [[sx-dy/chord*hh,sy+dx/chord*hh],[sx+dy/chord*hh,sy-dx/chord*hh]];
    const alternatives = centers.map(center => {
      const a = Math.atan2(from[1]-center[1],from[0]-center[0]);
      const b = Math.atan2(y-center[1],x-center[0]);
      const inc = (b-a+2*Math.PI)%(2*Math.PI);
      const delta = sweep ? inc : inc-2*Math.PI;
      return { center, mid: [center[0]+r*Math.cos(a+delta/2),center[1]+r*Math.sin(a+delta/2)] as P, delta };
    });
    const chosen = alternatives.find(c => hh === 0 || Number(Math.abs(c.delta)>Math.PI)===large);
    assert.ok(chosen);
    arcs.push({ from, to, ...chosen });
    from = to;
  }
  return arcs;
}
const arc = (start: P, end: P, ccw:boolean): FlatSegment =>
  ({ kind:'arc', start, end, ccw, radius:10, center:[10,10] });

test('short and major circular arcs preserve endpoints, center and signed direction after Y reflection',()=>{
  const cases = [
    {ccw:true, end:[10,20], delta:-Math.PI/2, mid:[10+Math.SQRT1_2*10,10-Math.SQRT1_2*10]},
    {ccw:false, end:[10,0], delta:Math.PI/2, mid:[10+Math.SQRT1_2*10,10+Math.SQRT1_2*10]},
    {ccw:true, end:[10,0], delta:-3*Math.PI/2, mid:[10-Math.SQRT1_2*10,10-Math.SQRT1_2*10]},
    {ccw:false, end:[10,20], delta:3*Math.PI/2, mid:[10-Math.SQRT1_2*10,10+Math.SQRT1_2*10]},
  ];
  for (const {ccw,end,delta,mid} of cases) {
    const [a] = svgArcs(flatLoopPath([arc([20,10],end as P,ccw)],20));
    near(a.from,[20,10]); near(a.to,[end[0],20-end[1]]); near(a.center,[10,10]); near(a.mid,mid as P);
    assert.ok(Math.abs(a.delta-delta)<1e-8);
  }
});

test('full-circle paths preserve orientation across both semicircles',()=>{
  for (const ccw of [true,false]) {
    const [first,second] = svgArcs(flatLoopPath([arc([20,10],[20,10],ccw)],20));
    near(first.mid,[10,ccw?0:20]); near(second.mid,[10,ccw?20:0]);
    near(first.to,second.from); near(second.to, first.from);
  }
});

test('row1427 native 55 × 20 flat SVG reaches both outward R10 extremes',()=>{
  const sketch = withNode(emptyDoc(),{kind:'sketch',profile:'loop',segments:[
    {kind:'line',start:[10,5]},{kind:'arc',start:[45,5],center:[45,15],direction:'ccw'},
    {kind:'line',start:[45,25]},{kind:'arc',start:[10,25],center:[10,15],direction:'ccw'},
  ]});
  const doc = withNode(sketch,{kind:'sheet-base',sketch:0,thickness:1.5,bendRadius:1.5,kFactor:.44});
  const r = evaluateDoc(doc,1); assert.ok(r.ok);
  const flat = r.bodies[0].flat; assert.ok(flat);
  assert.deepEqual(flat.box,{min:[0,0],max:[55,20]});
  const [left,right] = flat.loops.flatMap(loop=>svgArcs(flatLoopPath(loop.segments,20))).sort((a,b)=>a.center[0]-b.center[0]);
  assert.ok(left && right);
  near(left.center,[10,10]); near(left.mid,[0,10]);
  near(right.center,[45,10]); near(right.mid,[55,10]);
});
