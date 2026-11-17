import test from 'node:test';
import assert from 'node:assert/strict';
import type { SketchNode } from '../src/engine/doc';
import { sketchDxf, sketchDxfDocument } from '../src/sketch/dxf';
type P = [number, number];
const Q:P[]=[[0,0],[2,4],[4,0]], C:P[]=[[0,0],[1,3],[3,3],[4,0]];
const node=(poles:unknown[]):SketchNode=>({kind:'sketch',id:'n0',profile:'rectangle',min:[0,0],max:[10,6],construction:poles.map(poles=>({kind:'bezier',poles}))} as SketchNode);
// Independent group-code reader: no product DXF parser or curve conversion used as an oracle.
function read(text:string){
 const lines=text.trimEnd().split(/\r?\n/);assert.equal(lines.length%2,0);
 const pairs=Array.from({length:lines.length/2},(_,i)=>[Number(lines[2*i]),lines[2*i+1].trim()] as const);
 const entities:(readonly [number,string])[][]=[];let current:(readonly [number,string])[]|null=null;
 for(const pair of pairs){if(pair[0]===0){if(current)entities.push(current);current=pair[1]==='SPLINE'?[pair]:null;}else current?.push(pair);}if(current)entities.push(current);
 const splines=entities.map(e=>{const all=(code:number)=>e.filter(p=>p[0]===code).map(p=>Number(p[1]));const x=all(10),y=all(20);assert.deepEqual(all(30),x.map(()=>0));return {degree:all(71)[0],knots:all(40),weights:all(41),control:x.map((x,i)=>[x,y[i]] as P),layer:e.find(p=>p[0]===8)?.[1],counts:[all(72)[0],all(73)[0]]};});
 return {pairs,splines};
}
function bernstein(p:P[],t:number):P {const n=p.length-1,choose=n===2?[1,2,1]:[1,3,3,1];return [0,1].map(k=>p.reduce((sum,q,i)=>sum+choose[i]*(1-t)**(n-i)*t**i*q[k],0)) as P;}
function deBoor(s:ReturnType<typeof read>['splines'][number],t:number):P{
 const d=s.degree,k=t===1?s.control.length-1:s.knots.findIndex((v,i)=>i>=d&&v<=t&&t<s.knots[i+1]);
 const q=Array.from({length:d+1},(_,j)=>[...s.control[k-d+j]] as P);
 for(let r=1;r<=d;r++)for(let j=d;j>=r;j--){const i=k-d+j,a=(t-s.knots[i])/(s.knots[i+d-r+1]-s.knots[i]);q[j]=[0,1].map(c=>(1-a)*q[j-1][c]+a*q[j][c]) as P;}
 return q[d];
}
const near=(a:P,b:P)=>a.forEach((v,i)=>assert.ok(Math.abs(v-b[i])<1e-12,`${a} != ${b}`));
test('AC1015 preserves every local polynomial coefficient, unit weight and independent evaluated point',()=>{
 const fractional:P[]=[[.125,-.25],[1.5,3.75],[4.125,-.25]], curves=[Q,C,fractional,[...C].reverse(),Q];
 const source=node(curves),before=structuredClone(source),result=sketchDxf(source,{}),parsed=read(result.text);
 assert.match(result.text,/AC1015/);assert.equal(result.report.modelSpace.SPLINE,curves.length);assert.equal(parsed.splines.length,curves.length);
 const units=parsed.pairs.findIndex(p=>p[0]===9&&p[1]==='$INSUNITS');assert.deepEqual(parsed.pairs[units+1],[70,'4']);
 parsed.splines.forEach((s,i)=>{const p=curves[i],degree=p.length-1;assert.equal(s.degree,degree);assert.deepEqual(s.control,p);assert.deepEqual(s.weights,p.map(()=>1));assert.deepEqual(s.knots,[...Array(p.length).fill(0),...Array(p.length).fill(1)]);assert.deepEqual(s.counts,[2*p.length,p.length]);assert.equal(s.layer,'CONSTRUCTION');for(const t of [0,.25,.5,.75,1])near(deBoor(s,t),bernstein(p,t));});
 near(deBoor(parsed.splines[0],.25),[1,1.5]);near(deBoor(parsed.splines[0],.5),[2,2]);near(deBoor(parsed.splines[1],.5),[2,2.25]);assert.deepEqual(source,before);
});
test('tilted and offset planes do not transform local poles; ordinary profile and reference entities stay unchanged',()=>{
 const source=node([Q,C]);const plain=sketchDxfDocument(node([]),{});const withCurves=sketchDxfDocument(source,{});assert.deepEqual(withCurves.entities.filter(e=>e.type!=='spline'),plain.entities);assert.deepEqual(withCurves.layers,plain.layers);
 for(const plane of [{origin:[0,0,12],normal:[0,0,1],xAxis:[1,0,0]},{origin:[100,-20,7],normal:[0,.6,.8],xAxis:[1,0,0]}] as const){assert.deepEqual(sketchDxfDocument({...source,plane} as SketchNode,{}),withCurves);}
 assert.ok(sketchDxf(node([]),{},'AC1009').text.includes('AC1009'));
 assert.throws(()=>sketchDxf(source,{},'AC1009'),e=>!!e&&typeof e==='object'&&'code'in e&&e.code==='R12_NEEDS_TOLERANCE');
});
test('malformed and degenerate Beziers reject the whole export without mutating source; valid loops and collinear curves remain',()=>{
 for(const poles of [undefined,null,[],[[0,0],[1,1]],[[0,0],[1,1],[2,2],[3,3],[4,4]],[[0,0],[NaN,1],[2,2]],[[0,0],[1,Infinity],[2,2]],[[0,0],[1,1,2],[2,2]],[[1,1],[1,1],[1,1]],[[0,0],[5,5],[0,0]]]){
  const source=node([Q,poles]),before=structuredClone(source);assert.throws(()=>sketchDxf(source,{}),/three or four finite control points|all coincide|doubles back/);assert.deepEqual(source,before);
 }
 for(const poles of [[[0,0],[1,1],[2,2]],[[0,0],[2,0],[0,2],[0,0]]])assert.equal(sketchDxf(node([poles]),{}).report.modelSpace.SPLINE,1);
});
