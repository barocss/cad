import assert from 'node:assert/strict';
import {createFlow} from './flow-helper.mjs';
const f=await createFlow({name:'held-interior-fillet-replacement',output:process.argv[2],envFrozen:'HELD_INTERIOR_FROZEN',initialFiles:['apps/cad-studio/test/held-interior-fillet-replacement-browser.mjs'],qualification:'Explicitly restore numeric interior stations on a new straight edge and retain fractions after upstream resizing.',limits:['One terminal unshaped varying Fillet, two interiors on a convex box edge.'],inspectorSource:`
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep, evaluateSurface } from '@barocss/cad';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
import { digestOf } from '@barocss/cad-model/util/digest';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const [{key,brep}] = partBreps(doc), feature=doc.nodes.at(-1).id;
const surfaces = brep.faces.filter(face => face.name?.startsWith(feature+'.face')).map(face => face.surface);
const bounds=brep.vertices.map(v=>v.point[0]), length=Math.max(...bounds)-Math.min(...bounds);
const stations = [0, ...doc.nodes.at(-1).radii.slice(1, -1).map(p => p.fraction), 1];
const samples = stations.flatMap((t, i) => i === 0 ? [t] : [(t + stations[i-1])/2, t]).map(t=>{
  const x=t*length;
  const candidates=surfaces.flatMap(surface=>{
    assert.equal(surface.kind,'surface');
    if(surface.kind!=='surface') return [];
    const u0=surface.knotsU[surface.degreeU],u1=surface.knotsU[surface.controlPoints.length];
    const v0=surface.knotsV[surface.degreeV],v1=surface.knotsV[surface.controlPoints[0].length],uMid=(u0+u1)/2;
    const a=evaluateSurface(surface,uMid,v0)[0], b=evaluateSurface(surface,uMid,v1)[0];
    if (x<Math.min(a,b)-1e-9 || x>Math.max(a,b)+1e-9) return [];
    let lo=v0,hi=v1;
    for (let i=0;i<60;i++) {
      const mid=(lo+hi)/2;
      if ((evaluateSurface(surface,uMid,mid)[0]<x)===(a<b)) lo=mid;
      else hi=mid;
    }
    return [[u0,uMid,u1].map(u=>evaluateSurface(surface,u,(lo+hi)/2))];
  });
  assert.ok(candidates.length>0, 'Missing native section at X='+x);
  return {t,x,sections:candidates};
});
console.log(JSON.stringify({key,check:checkBrep(brep,{strict:true}),sha:digestOf(brep),volume:brepMassProperties(brep,1).volume,samples}));
`,oracleSource:`
import json,math,sys
from fractions import Fraction as F
d=json.load(sys.stdin)
n=d['native']
assert n['check']['valid'],n['check']['issues']
assert n['check']['counts']['bodies']==1 and n['check']['counts']['shells']==1
length,height,edited = d['length'],d['height'],d['edited']
# Independent signed sections. Both interior slopes vanish at the peak and trough.
stations=[F(0),F(1,4),F(7,10) if edited else F(5,8),F(1)]
left=[F(5,4),F(7,4),F(7,4),-F(7,4)]
middle=[F(3),F(0),-F(9,2),F(3)] if edited else [F(3),F(0),-F(6),F(4)]
right=[F(3,2),F(0),F(2),-F(1)] if edited else [F(1),F(0),F(3),-F(3,2)]
polynomials=[left,middle,right]
integral=sum((b-a)*40*sum(c*g/F(i+j+1) for i,c in enumerate(p) for j,g in enumerate(p))
             for a,b,p in zip(stations,stations[1:],polynomials))
assert integral == (F(32939,168) if edited else F(27731,168))
def radius(t):
    j=next(i for i,r in enumerate(stations[1:]) if t<=float(r))
    u=(t-float(stations[j]))/float(stations[j+1]-stations[j])
    return sum(float(c)*u**k for k,c in enumerate(polynomials[j]))
expected_stations = [float(stations[0])]
for lo,hi in zip(stations,stations[1:]):
    expected_stations += [float((lo+hi)/2),float(hi)]
assert len(n['samples']) == 7
assert all(abs(a['t']-b)<1e-12 for a,b in zip(n['samples'],expected_stations))
removed=(1-math.pi/4)*float(integral)*length/40
expected=length*30*height-removed
assert abs(n['volume']-expected)<=1e-7,(n['volume'],expected)
assert abs(d['workerVolume']-expected)<=1e-7,(d['workerVolume'],expected)
gap=0
for entry in n['samples']:
    r=radius(entry['t'])
    x=entry['t']*length
    diag=r*(1-1/math.sqrt(2))
    want=[(x,r,height),(x,diag,height-diag),(x,0,height-r)]
    for section in entry['sections']:
        a=min(max(math.dist(x,y) for x,y in zip(order,want)) for order in (section,list(reversed(section))))
        gap=max(gap,a)
assert gap<=1e-6,gap
print(json.dumps({'status':'PASS','volumeMM3':expected,'removedMM3':removed,
'workerVolumeMM3':d['workerVolume'],'nativeVolumeMM3':n['volume'],'maximumSectionResidualMM':gap,'axialSamples':len(n['samples']),
'radiusSquaredIntegralAt40MM3':str(integral),'controlXMM':[float(u)*length for u in stations]}))
`});

const missing={format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nodes:[{id:'n0',kind:'sketch',profile:'rectangle',min:[0,0],max:[40,30]},{id:'n1',kind:'extrude',sketch:0,height:10},{id:'n2',kind:'fillet',parent:{node:1,side:'solid'},edges:['n1.side6|n1.side7'],radius:1.25,radii:[{at:[20,20,0],radius:1.25,atEnd:true},{at:[20,20,.75],radius:3,fraction:.25},{at:[20,20,1.875],radius:1,fraction:.625},{at:[20,20,3],radius:2.5,atEnd:true}],sigs:{'n1.side6|n1.side7':{k:'line',p:[20,20,1.5],d:[0,0,1],s:3}}}],outputs:{b2:{node:2,side:'solid'}},nextId:3};
const button=(name,scope=f.page)=>scope.getByRole('button',{name,exact:true});
async function locations(length){for(const [selector,point]of [['[data-fillet-endpoint="Start"]',[0,0,10]],['[data-fillet-station="Interior 1"]',[length*.25,0,10]],['[data-fillet-station="Interior 2"]',[length*.625,0,10]],['[data-fillet-endpoint="End"]',[length,0,10]]]){const marker=f.page.locator(selector);await marker.waitFor();assert.deepEqual((await marker.getAttribute('data-position')).split(',').map(Number),point);}}
async function pick(length=40){const p=await f.page.evaluate(x=>window.__studioScreenOf([x,0,10]),length/2);await f.page.mouse.click(...p);await locations(length);assert.match(await f.editor().innerText(),/Interior 1 25% R3/);assert.match(await f.editor().innerText(),/Interior 2 62.5% R1/);assert.match(await f.editor().innerText(),/End R2.5/);}
async function open(doc){await f.page.locator('input[aria-label="Model file"]').setInputFiles({name:'held-stations.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))});await f.page.waitForFunction(d=>window.__studioDoc?.nodes?.length===3&&JSON.stringify(window.__studioDoc.nodes[0])===JSON.stringify(d.nodes[0])&&JSON.stringify(window.__studioDoc.nodes[2]?.edges)===JSON.stringify(d.nodes[2].edges),doc,{timeout:30000});await f.ready();}
async function verify(doc,label,length){const native=await f.inspect(label,doc),[body]=(await f.bodies()).bodies;assert.equal(native.key,body.key);await f.runOracle({native,length,height:10,edited:false,workerVolume:body.volume},label);}
await f.run(async()=>{
 await f.newPage();await open(missing);await f.page.getByRole('region',{name:'References',exact:true}).waitFor();const before=await f.doc();assert.ok(before.nodes[2].held);await button('Top',f.page.locator('.views')).click();if(await button('Ortho').getAttribute('aria-pressed')!=='true')await button('Ortho').click();await f.page.getByTitle('Frame all (F)',{exact:true}).click();const filter=button('Selection filter');for(let i=0;i<6&&!(await filter.innerText()).includes('Edges');i++)await filter.click();await f.openFeatureEditor(2);
 await button('Replace edge',f.editor()).click();await pick();await f.same(before);await f.snapshot('01-two-station-assignment');await button('Cancel edge replacement',f.editor()).click();await f.same(before);assert.equal(await f.page.locator('[data-fillet-station]').count(),0);
 await button('Replace edge',f.editor()).click();await pick();await button('Apply edge replacement',f.editor()).click();await f.changed(before);await f.ready();const repaired=await f.doc();assert.deepEqual(repaired.nodes[2].radii.map(({at,...r})=>r),before.nodes[2].radii.map(({at,...r})=>r));assert.deepEqual(repaired.nodes[2].radii.map(r=>r.at),[[0,0,10],[10,0,10],[25,0,10],[40,0,10]]);assert.equal(repaired.nodes[2].held,undefined);await verify(repaired,'02-repaired',40);await f.undo();await f.same(before);await f.redo();await f.same(repaired);await f.closeEditor();await button('New part').click();await f.ready();await open(repaired);assert.deepEqual(await f.doc(),repaired);await f.openFeatureEditor(1);await f.editor().getByLabel('Width',{exact:true}).fill('60');const resized=(await f.applyEditor(repaired,'03-resized')).doc;assert.deepEqual(resized.nodes[2].radii,repaired.nodes[2].radii);await verify(resized,'03-resized',60);
 await button('New part').click();await f.ready();await open(resized);assert.deepEqual(await f.doc(),resized);await f.page.getByTitle('Frame all (F)',{exact:true}).click();await f.openFeatureEditor(2);await locations(60);await f.snapshot('04-resized-reopened');await f.closeEditor();assert.deepEqual(f.report.downloads,[]);
});
