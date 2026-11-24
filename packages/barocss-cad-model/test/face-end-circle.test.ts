import assert from 'node:assert/strict';
import test from 'node:test';
import {checkBrep,checkOutput,evaluateCadPart,faceGeometry,massPropertiesOf} from '@barocss/cad';
import type {DocPlane,SketchNode,StudioDoc} from '../src/engine/doc';
import {currentFaceEndDistance,toPartDocument} from '../src/engine/part';
import {readStudioDoc} from '../src/engine/migrate';
import {isFaceEndExtrudeSketch} from '../src/engine/faceEndExtrude';
type Circle=Extract<SketchNode,{profile:'circle'}>;
const frames:DocPlane[]=[{origin:[12,100,-7],normal:[0,0,1],xAxis:[1,0,0]},{origin:[12,100,-7],normal:[0,-1,0],xAxis:[1,0,0]},{origin:[12,100,-7],normal:[1,0,0],xAxis:[0,1,0]}];
const world=(f:number,u:number,v:number,t:number)=>f===0?[12+u,100+v,-7+t]:f===1?[12+u,100-t,-7+v]:[12+t,100+u,-7+v];
function fixture(radius=3,height=20,frame=0):StudioDoc{return {format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nodes:[
{id:'n0',kind:'sketch',profile:'rectangle',min:[-1,-2],max:[11,8],plane:frames[frame]},
{id:'n1',kind:'extrude',sketch:0,from:height,height:5},
{id:'n2',kind:'sketch',profile:'circle',center:[5,3],radius,plane:frames[frame],sideTags:{outer:['rim']}},
{id:'n3',kind:'face-end-extrude',sketch:2,target:{body:{node:1,side:'solid'},feature:'n1',face:'n1.bottom'}}],outputs:{b1:{node:1,side:'solid'},b3:{node:3,side:'solid'}},nextId:4};}
test('literal circle To face preserves native radius, axis, caps, mass and source IDs in three frames',()=>{
 for(let f=0;f<3;f++)for(const r of [3,4])for(const h of [20,30]){
 const doc=fixture(r,h,f),before=structuredClone(doc);assert.deepEqual(readStudioDoc(JSON.stringify(doc)),{doc,notes:[]});const part=toPartDocument(doc);assert.equal(currentFaceEndDistance(doc,3),h);assert.deepEqual(part.features[3],{id:'n3',kind:'extrude',sketch:'n2',height:h});
 const outputs=evaluateCadPart(part).outputs,body=outputs[1];assert.ok(checkOutput(body).valid);const mass=massPropertiesOf(body);assert.ok(Math.abs(mass.volume-Math.PI*r*r*h)<1e-7);const center=world(f,5,3,h/2);mass.centroid.forEach((v,j)=>assert.ok(Math.abs(v-center[j])<1e-7));
 const axis=frames[f].normal,w=f===0?2:f===1?1:0;const sides=body.brep.faces.filter(face=>faceGeometry(face).kind==='cylinder');assert.ok(sides.length>0);
 for(const face of sides){assert.ok(face.name?.startsWith('n3.side[rim]'));const g=faceGeometry(face);assert.ok(g.kind==='cylinder');assert.equal(g.out,1);assert.ok(Math.abs(g.r-r)<1e-7);assert.ok(Math.abs(Math.abs(g.a.reduce((s,v,j)=>s+v*axis[j],0))-1)<1e-7);const o=world(f,5,3,0);for(let j=0;j<3;j++)if(j!==w)assert.ok(Math.abs(g.c[j]-o[j])<1e-7);}
 for(const vertex of body.brep.vertices){const p=vertex.point,o=world(f,5,3,0),t=(p[w]-o[w])*axis[w];assert.ok(Math.min(Math.abs(t),Math.abs(t-h))<1e-7);assert.ok(Math.abs(Math.hypot(...p.map((v,j)=>j===w?0:v-o[j]))-r)<1e-7);}
 for(const [name,sign,t]of [['n3.bottom',-1,0],['n3.top',1,h]] as const){const face=body.brep.faces.find(x=>x.name===name);assert.ok(face);const g=faceGeometry(face);assert.ok(g.kind==='plane');assert.ok(Math.abs(g.o[w]-world(f,5,3,t)[w])<1e-7);g.n.forEach((v,j)=>assert.ok(Math.abs(v-sign*axis[j])<1e-7));}
 assert.deepEqual(doc,before);
 }
});
test('circle containment needs the whole disk, not its center',()=>{const doc=fixture(),target=doc.nodes[0];assert.ok(target.kind==='sketch'&&target.profile==='rectangle');doc.nodes[0]={...target,max:[7,8]};assert.throws(()=>toPartDocument(doc),/entire projected profile/);});
test('literal circle admission safely refuses invalid parameters and alternate outline metadata',()=>{
 const source=fixture().nodes[2] as Circle;
 const patches:Partial<Circle>[]=[{radius:0},{radius:-1},{radius:NaN},{radius:Infinity},{radius:{parameter:'r'}},{center:[{parameter:'x'},3]},{center:[NaN,3]},{outline:{points:[[0,0],[1,0],[0,1]]}},{center:[9999,3],radius:3},{center:[5,-9999],radius:3}];
 for(const patch of patches){const s={...source,...patch};assert.doesNotThrow(()=>isFaceEndExtrudeSketch(s));assert.equal(isFaceEndExtrudeSketch(s),false);const doc=fixture();doc.nodes[2]=s;assert.throws(()=>toPartDocument(doc));}
});
test('translated circle extrema must stay within world coordinate range',()=>{const doc=fixture(),source=doc.nodes[2] as Circle;doc.nodes[2]={...source,plane:{...frames[0],origin:[9994,100,-7]}};assert.throws(()=>toPartDocument(doc),/coordinate range/);});

test('circle capability rejects malformed and alternate metadata without throwing, retaining native radius floor',()=>{
 const source=fixture().nodes[2] as Circle;
 const patches:unknown[]=[{center:null},{center:{}},{center:'bad'},{center:[5]},{center:[5,3,1]},{radius:null},{radius:{}},{radius:'3'},{radius:.009},
  ...['outline','holes','regions','on','association','pocketFloor','holeOutlines','regionLengths'].flatMap(key=>[{[key]:null},{[key]:{}},{[key]:[]}])];
 for(const patch of patches){const candidate={...source,...patch as object} as Circle;assert.doesNotThrow(()=>isFaceEndExtrudeSketch(candidate));assert.equal(isFaceEndExtrudeSketch(candidate),false);}
 assert.equal(isFaceEndExtrudeSketch({...source,radius:.01}),true);
});


function downwardCircle(radius = 2, height = 5, origin: [number, number, number] = [0, 0, 20]): StudioDoc {
  const plane: DocPlane = { origin, normal: [0, 0, -1], xAxis: [1, 0, 0] };
  return {
    ...fixture(),
    nodes: [
      { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [10, 10] },
      { id: 'n1', kind: 'extrude', sketch: 0, height },
      { id: 'n2', kind: 'sketch', profile: 'circle', center: [5, -4], radius, plane, sideTags: { outer: ['rim'] } },
      { id: 'n3', kind: 'face-end-extrude', sketch: 2, target: { body: { node: 1, side: 'solid' }, feature: 'n1', face: 'n1.top' } },
    ],
  };
}

test('a downward circle reaches the original rectangular upper cap with the reflected centre and complete outward cylinders', () => {
  const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-8, `${a} vs ${b}`);
  for (const [radius, height, origin] of [
    [2, 5, [0, 0, 20]], [2, 8, [0, 0, 20]], [2.5, 8, [2, 1, 20]],
  ] as const) {
    const doc = downwardCircle(radius, height, [...origin]), travel = origin[2] - height;
    const centre = [origin[0] + 5, origin[1] + 4, (height + origin[2]) / 2];
    const opened = readStudioDoc(JSON.stringify(doc));
    assert.ok('doc' in opened);
    assert.deepEqual(opened.doc, doc);
    const part = toPartDocument(doc);
    assert.deepEqual(part.features[3], { id: 'n3', kind: 'extrude', sketch: 'n2', height: travel });
    const [target, output] = evaluateCadPart(part).outputs;
    assert.equal(target.id, 'n1');
    near(massPropertiesOf(target).volume, 100 * height);
    const check = checkBrep(output.brep, { strict: true });
    assert.equal(check.valid, true, check.issues.join('\n'));
    assert.deepEqual(check.counts, { bodies: 1, shells: 1, faces: 4, loops: 4, coedges: 12, edges: 6, vertices: 4 });
    assert.equal(check.topology[0].genus, 0);
    const mass = massPropertiesOf(output);
    near(mass.volume, Math.PI * radius ** 2 * travel);
    mass.centroid.forEach((value, axis) => near(value, centre[axis]));
    const sides = output.brep.faces.filter(face => faceGeometry(face).kind === 'cylinder');
    assert.equal(sides.length, 2);
    for (const side of sides) {
      assert.match(side.name ?? '', /^n3\.side\[rim\]/);
      const support = faceGeometry(side);
      assert.ok(support.kind === 'cylinder');
      assert.ok(support.a[0] === 0 && support.a[1] === 0 && support.a[2] === 1);
      assert.equal(support.out, 1);
      near(support.c[0], centre[0]); near(support.c[1], centre[1]); near(support.r, radius);
    }
    for (const [name, z, normal] of [['n3.bottom', origin[2], 1], ['n3.top', height, -1]] as const) {
      const face = output.brep.faces.find(candidate => candidate.name === name);
      assert.ok(face);
      const cap = faceGeometry(face);
      assert.ok(cap.kind === 'plane');
      near(cap.n[2], normal); near(cap.o[2], z);
    }
  }
});

test('downward circular termination refuses native contact and uses the reflected footprint', () => {
  const touching = downwardCircle(4);
  assert.throws(() => toPartDocument(touching), /strictly contain the entire projected circle/);
  assert.doesNotThrow(() => toPartDocument(downwardCircle(3.999)));
  assert.throws(() => toPartDocument(downwardCircle(4.001)), /contain the entire projected profile/);
  const wrongSide = downwardCircle();
  wrongSide.nodes[0] = { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [0, -10], max: [10, 0] };
  assert.throws(() => toPartDocument(wrongSide), /contain the entire projected profile/);
  for (const height of [0, -5]) assert.throws(() => toPartDocument(downwardCircle(2, height)), /stay forward/);
  for (const height of [20, 25]) assert.throws(() => toPartDocument(downwardCircle(2, height)), /positive extrusion direction/);
});
