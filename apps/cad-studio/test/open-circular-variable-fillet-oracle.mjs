export const nativeImports = `
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
import { digestOf } from '@barocss/cad-model/util/digest';
import { brepMassProperties, checkBrep, curveDomain, evaluateCurve, faceGeometry, surfaceD1Evaluator, surfaceDomain } from '@barocss/cad';
`;

export const nativeInspectionSource = `
const blends=brep.faces.filter(face=>face.name?.startsWith(feature.id+'.face'));
const owners=new Map(), loops=new Map(brep.loops.map(loop=>[loop.id,loop.face]));
for(const use of brep.coedges) {
  const faces=owners.get(use.edge) ?? [];
  faces.push(loops.get(use.loop)); owners.set(use.edge,faces);
}
const blendIds=new Set(blends.map(face=>face.id)), support=new Map(brep.faces.map(face=>[face.id,faceGeometry(face)]));
const ends=[0,1].map(side=>{
  const plane=brep.faces.filter(face=>{
    const g=support.get(face.id);
    return g.kind==='plane' && g.n[side===0?1:0]<-.99;
  });
  assert.equal(plane.length,1);
  const edges=brep.edges.filter(edge=>owners.get(edge.id).includes(plane[0].id) && owners.get(edge.id).some(id=>blendIds.has(id)));
  return edges.map(({curve,vertices})=>{
    const [a,b]=curveDomain(curve);
    return {vertices,points:Array.from({length:9},(_,j)=>evaluateCurve(curve,a+(b-a)*j/8))};
  });
});
const slices=[.125,.25,.5,.75,.875].map(fraction=>{
  const theta=fraction*Math.PI/2;
  const rows=blends.flatMap(face=>{
    const sf=face.surface;
    assert.equal(sf.kind,'surface');
    if(sf.kind!=='surface')return [];
    const {u:[u0,u1],v:[v0,v1]}=surfaceDomain(sf), d1=surfaceD1Evaluator(sf);
    const uMid=(u0+u1)/2;
    const at=v=>{const [x,y]=d1(uMid,v).point;return Math.atan2(y,x);};
    const a=at(v0),b=at(v1);
    if(theta<Math.min(a,b)-1e-9 || theta>Math.max(a,b)+1e-9)return [];
    let lo=v0,hi=v1;
    for(let j=0;j<60;j++) { const mid=(lo+hi)/2; if((at(mid)<theta)===(b>a))lo=mid;else hi=mid; }
    return [[u0,uMid,u1].map(u=>d1(u,(lo+hi)/2).point)];
  });
  assert.ok(rows.length,'Missing section at fraction '+fraction);
  return {fraction,rows};
});
const native = {key,check:checkBrep(brep,{strict:true}),sha:digestOf(brep),mass:brepMassProperties(brep,1),slices,ends,vertices:Object.fromEntries(brep.vertices.map(v=>[v.id,v.point]))};
`;

export const inspectorSource = `
${nativeImports}
const doc=JSON.parse(readFileSync(process.argv[2],'utf8'));
const [{brep,key}]=partBreps(doc), feature=doc.nodes.at(-1);
${nativeInspectionSource}
console.log(JSON.stringify(native));
`;


export const oracleSource = `
import math,json,sys
from collections import Counter
d=json.load(sys.stdin)
r0,r1=d['radii']
height=d['height']
r=8
base=math.pi*r*r*height/4
mean2=(r0*r0+r0*r1+r1*r1)/3
mean3=(r0**3+r0*r0*r1+r0*r1*r1+r1**3)/4
removed=math.pi/2*((1-math.pi/4)*r*mean2-(5/6-math.pi/4)*mean3)
n=d['native']
assert n['check']['valid'],n['check']['issues']
assert n['check']['counts']['bodies']==n['check']['counts']['shells']==1
def section(t,phi):
    radius=r0+(r1-r0)*t
    theta=t*math.pi/2
    radial=r-radius+radius*math.sin(phi)
    return (radial*math.cos(theta),radial*math.sin(theta),height-radius+radius*math.cos(phi))
assert len(n['slices'])==5
gap=0
for i,row in enumerate(n['slices']):
    t=row['fraction']
    assert t==(.125,.25,.5,.75,.875)[i]
    want=[section(t,phi) for phi in (0,math.pi/4,math.pi/2)]
    for points in row['rows']:
        assert len(points)==3
        gap=max(gap,min(max(map(math.dist,points,want)),max(map(math.dist,points,reversed(want)))))
trim=0
for t,edges in zip((0,1),n['ends'],strict=True):
    radius=r0 if t==0 else r1
    assert edges
    degree=Counter(v for e in edges for v in e['vertices'])
    endpoints=[n['vertices'][v] for v,k in degree.items() if k==1]
    assert len(endpoints)==2 and max(degree.values())<=2
    seen={edges[0]['vertices'][0]}
    for _ in edges:
        for e in edges:
            if seen.intersection(e['vertices']):seen.update(e['vertices'])
    assert seen==set(degree)
    for phi in (0,math.pi/2):
        trim=max(trim,min(math.dist(p,section(t,phi)) for p in endpoints))
    for edge in edges:
        for x,y,z in edge['points']:
            trim=max(trim,abs(y if t==0 else x),abs(math.hypot(math.hypot(x,y)-(r-radius),z-(height-radius))-radius))
assert gap<2e-6 and trim<2e-6,(gap,trim)
expected=base-removed
errors=[abs(v-expected) for v in (n['mass']['volume'],d['workerVolume'])]
assert max(errors)<2e-6,(expected,n['mass']['volume'],d['workerVolume'])
print(json.dumps(dict(status='PASS',expectedVolumeMM3=expected,removedMM3=removed,nativeVolumeMM3=n['mass']['volume'],
    workerVolumeMM3=d['workerVolume'],maximumVolumeErrorMM3=max(errors),maximumSectionResidualMM=gap,maximumEndTrimResidualMM=trim,
    sections=len(n['slices']))))
`;
