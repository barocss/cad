import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { checkBrep, evaluateCadPart, outputOf, projectBrepHiddenLines } from '../dist/index.js';

const fixture = JSON.parse(readFileSync(new URL('../conformance/r12c/accept-gearbox-shaft.json', import.meta.url)));
const snapshot = evaluateCadPart(fixture.input.partDocument), ring = outputOf(snapshot, 'n10').brep;
const top = {toward:[0,0,1], up:[0,1,0]}, options = {segmentsPerQuarter:12};
const stroke = (drawing, prefix = '') => drawing.edges.filter(e=>e.name.startsWith(prefix))
  .flatMap(e=>e.pieces.filter(p=>p.visible&&p.ink!==false).map(p=>({owner:e.name,circle:e.circle,curve:p.curve})));

test('the original axial O-ring uses its four complete native half-arcs without sampled duplicates', () => {
  assert.equal(fixture.input.partDocument.features.length,11);
  assert.equal(snapshot.outputs.length,8);
  assert.ok(checkBrep(ring,{strict:true}).valid);
  const input=JSON.stringify(ring), frame=projectBrepHiddenLines([ring],top,options);
  assert.equal(frame.edges.length,4);
  const arcs=stroke(frame);
  assert.equal(arcs.length,4);
  const near=(a,b)=>Math.abs(a-b)<1e-9;
  for(const radius of [12.5,16.02941733911914]) {
    const owners=arcs.filter(e=>e.circle&&near(e.circle.radius,radius));
    assert.equal(owners.length,2);
    assert.ok(owners.every(e=>e.curve.kind==='arc' && near(e.curve.t1-e.curve.t0,Math.PI)
      && near(e.circle.center[2],85)&&Math.hypot(...e.circle.center.slice(0,2))<1e-9));
    assert.ok(owners.every(e=>ring.edges.some(edge=>edge.name+'~sil'===e.owner)));
    for (let i=0;i<64;i++) {
      const angle=2*Math.PI*(i+.5)/64, point=[radius*Math.cos(angle),radius*Math.sin(angle)];
      const coverage=owners.filter(({curve})=>{
        const [x,y]=point.map((v,k)=>v-curve.center[k]), det=curve.u[0]*curve.v[1]-curve.u[1]*curve.v[0];
        const cos=(x*curve.v[1]-y*curve.v[0])/det, sin=(curve.u[0]*y-curve.u[1]*x)/det;
        const t=Math.atan2(sin,cos);
        return [-1,0,1].some(turn=>t+2*Math.PI*turn>curve.t0 && t+2*Math.PI*turn<curve.t1);
      });
      assert.equal(coverage.length,1);
    }
  }
  assert.equal(JSON.stringify(ring),input);
});

test('oblique O-ring silhouettes and the original partly covered assembly keep sampled output', () => {
  for(const toward of [[1,-1,1],[275,-420,235]]) {
    const visible=stroke(projectBrepHiddenLines([ring],{toward,up:[0,0,1]},options));
    assert.ok(visible.length>4 && visible.every(p=>p.curve.kind==='polyline'));
  }
  const assembly=projectBrepHiddenLines(snapshot.outputs.map(output=>output.brep),top,options);
  const visible=stroke(assembly,'n10.');
  assert.equal(visible.length,4);
  assert.ok(visible.every(p=>p.curve.kind==='polyline'));
});

test('a real foreground cover leaves the clipped arc on the ordinary visibility path', () => {
  const cap=evaluateCadPart({format:'barocss-cad-part',version:1,units:'mm',parameters:{},features:[
    {id:'s',kind:'sketch',profile:'rectangle',min:[-2,15],max:[2,17]},
    {id:'front',kind:'extrude',sketch:'s',from:90,height:1},
  ]}).outputs[0].brep;
  assert.ok(checkBrep(cap,{strict:true}).valid);
  const strokes=stroke(projectBrepHiddenLines([ring,cap],top,options),'n10.');
  const outer=16.02941733911914;
  const points=strokes.flatMap(({curve})=>curve.kind==='polyline'?curve.points:[]);
  assert.ok(points.length>0);
  assert.ok(points.every(([x,y])=>Math.hypot(x,y-outer)>.2));
  assert.ok(points.some(([x,y])=>Math.abs(x)>6&&y>7));
});
