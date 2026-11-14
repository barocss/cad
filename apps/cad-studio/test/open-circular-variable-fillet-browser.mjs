import assert from 'node:assert/strict';
import { relative, resolve } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { withMcp } from './fillet-continuity-mcp.mjs';

const output = process.argv[2], baseline = process.argv[3] === '--baseline';
assert.ok(output && relative(resolve(import.meta.dirname, '../../..'), resolve(output)).startsWith('../'));
const pins = [
  'apps/cad-studio/src/App.tsx', 'apps/cad-studio/src/ui/NodeEditor.tsx', 'apps/cad-studio/src/ui/Hud.tsx',
  'packages/barocss-cad-model/src/app/commands.ts', 'packages/barocss-cad-model/src/engine/mesh.ts',
  'packages/barocss-cad/src/blend/edge-finish.ts', 'packages/barocss-cad/src/blend/rolling-ball.ts',
  'packages/barocss-cad/src/brep/analytic-boolean.ts', 'apps/cad-studio/test/fillet-continuity-mcp.mjs',
  'apps/cad-studio/scripts/cad-mcp.mjs', 'apps/cad-studio/server/cadDoc.ts',
];
const f = await createFlow({
  name:'open-circular-variable-fillet', output, envFrozen:'D1273_SOURCE_FROZEN', initialFiles:pins, requiredFrozen:pins,
  qualification:'Edit a two-radius circular fillet on the original open quarter rim of one extruded sector.',
  limits:['One radius-8 quarter-disk XY profile, one convex top rim between a cap and coaxial cylindrical wall.'],
  inspectorSource: `
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
import { digestOf } from '@barocss/cad-model/util/digest';
import { brepMassProperties, checkBrep, curveDomain, evaluateCurve, faceGeometry, surfaceD1Evaluator, surfaceDomain } from '@barocss/cad';
const doc=JSON.parse(readFileSync(process.argv[2],'utf8'));
const [{brep,key}]=partBreps(doc), feature=doc.nodes.at(-1);
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
console.log(JSON.stringify({key,check:checkBrep(brep,{strict:true}),sha:digestOf(brep),mass:brepMassProperties(brep,1),slices,ends,vertices:Object.fromEntries(brep.vertices.map(v=>[v.id,v.point]))}));
`,
  oracleSource: `
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
`,
});
const seed={
  format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nodes:[
    {id:'n0',kind:'sketch',profile:'loop',segments:[
      {kind:'line',start:[0,0]}, {kind:'arc',start:[8,0],center:[0,0],direction:'ccw'}, {kind:'line',start:[0,8]},
    ]},
    {id:'n1',kind:'extrude',sketch:0,height:10},
  ],outputs:{b1:{node:1,side:'solid'}},nextId:2,
};
const edge='n1.side1|n1.top';
const button=(name,scope=f.page)=>scope.getByRole('button',{name,exact:true});
const field=(scope,name)=>scope.getByLabel(name,{exact:true});
const status=(hud,label)=>hud.locator('.status').filter({hasText:new RegExp('^'+label+'$')}).waitFor();
async function measure(doc,label,radii){
  const native=await f.inspect(label+'-native',doc);
  const [worker]=(await f.bodies()).bodies;
  assert.equal(worker.key,native.key);
  const accepted=await f.runOracle({native,radii,height:10,workerVolume:worker.volume},label);
  f.report.observations.push({label,nativeHash:native.sha,...accepted});
  return native.sha;
}

await f.run(async()=>{
  const origin=new URL(f.server.resolvedUrls.local[0]).origin;
  const newContext=f.browser.newContext.bind(f.browser);
  f.browser.newContext=async options=>{
    const context=await newContext({...options,serviceWorkers:'block'});
    await context.route('**/*',route=>{
      const url=new URL(route.request().url());
      if(url.hostname==='fonts.googleapis.com')return route.fulfill({contentType:'text/css',body:''});
      return ['http:','https:'].includes(url.protocol)&&url.origin!==origin?route.abort():route.continue();
    });
    return context;
  };
  f.phase='Select the original open circular rim in Studio';
  await f.newPage();
  const [open]=await Promise.all([f.page.waitForEvent('filechooser'),button('Open').click()]);
  await open.setFiles({name:'open-sector.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(seed))});
  await f.same(seed);
  await button('Top',f.page.locator('.views')).click();
  if(await button('Ortho').getAttribute('aria-pressed')!=='true')await button('Ortho').click();
  await f.page.getByTitle('Frame all (F)',{exact:true}).click();
  const filter=button('Selection filter');
  for(let i=0;i<6&&!(await filter.innerText()).includes('Edges');i++)await filter.click();
  assert.match(await filter.innerText(),/Edges/);
  await f.page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
  const point=await f.page.evaluate(q=>window.__studioScreenOf([q,q,10]),8/Math.sqrt(2));
  assert.ok(point && await f.page.evaluate(p=>document.elementFromPoint(...p)?.matches('canvas.vp-canvas'),point));
  await f.page.mouse.click(...point);
  await f.page.waitForFunction(()=>window.__studioSelection?.selection.edges.length===1);
  await f.command('Fillet');
  const hud=f.page.getByRole('dialog',{name:'Fillet',exact:true});
  await field(hud,'Fillet radius mode').selectOption('varying');
  await field(hud,'Radius').fill('.6');
  await field(hud,'End radius (0: same)').fill('1.2');
  if(baseline){
    await status(hud,'refused');
    await hud.getByText(/analytic Boolean: the result is not a manifold solid/).waitFor({state:'attached'});
    await f.same(seed);
    assert.equal(await button('Apply',hud).isEnabled(),false);
    await f.snapshot('kernel-refusal');
    return;
  }
  await status(hud,'preview');
  await f.same(seed);
  await button('Apply',hud).click();
  await f.changed(seed);
  const first=await f.doc(), feature=first.nodes[2];
  assert.equal(feature.kind,'fillet');
  assert.deepEqual(feature.edges,[edge]);
  assert.deepEqual(feature.radii.map(p=>[p.radius,p.atEnd]),[[.6,true],[1.2,true]]);
  assert.ok(Math.hypot(feature.radii[0].at[0]-8,feature.radii[0].at[1])<1e-10);
  assert.ok(Math.hypot(feature.radii[1].at[0],feature.radii[1].at[1]-8)<1e-10);
  await measure(first,'original',[.6,1.2]);
  await button('Iso',f.page.locator('.views')).click();
  await f.snapshot('applied');
  f.phase='Edit just the far radius, undo, redo and reopen';
  await f.openFeatureEditor(2,'circular rim');
  await field(f.editor(),'End radius').fill('1.5');
  await f.applyEditor(first,'end-radius-1.5');
  const edited=await f.doc();
  assert.deepEqual(edited.nodes[2].radii,[feature.radii[0],{...feature.radii[1],radius:1.5}]);
  const hash=await measure(edited,'edited',[.6,1.5]);
  await f.undo();
  await f.same(first);
  await f.redo();
  await f.same(edited);
  const saved=await f.save('open-circular-variable-fillet');
  await f.freshOpen(saved.file,edited,'fresh-open');
  assert.equal(await measure(await f.doc(),'reopened',[.6,1.5]),hash);

  f.phase='Local MCP discovers and dry-runs the same selected open circular rim';
  await withMcp(f,seed,'agent-sector',async request=>{
    const call=async (name,args)=>{
      const reply=await request('tools/call',{name,arguments:args});
      assert.equal(reply.isError,false,JSON.stringify(reply));
      return JSON.parse(reply.content[0].text);
    };
    const listed=await call('query',{action:'native_joints',body:'b1'});
    const rims=listed.edges.filter(e=>e.faces.includes('n1.side1')&&e.faces.includes('n1.top'));
    assert.deepEqual(rims.map(e=>e.name),[edge]);
    const result=await call('features',{action:'batch',dryRun:true,ops:[{tool:'features',args:{
      action:'command',command:'fillet',edges:[rims[0].name],values:{radius:.6,endRadius:1.2},
    }}]});
    assert.equal(result.dryRun,true);
    const expected=mathRadiusRemoved(.6,1.2);
    assert.ok(Math.abs(result.change.volume+expected)<.002);
    f.report.observations.push({label:'mcp-dry-run',nativeEdge:rims[0],volumeDelta:result.change.volume});
  });
});

function mathRadiusRemoved(a,b){
  return Math.PI/2*((1-Math.PI/4)*8*(a*a+a*b+b*b)/3-(5/6-Math.PI/4)*(a**3+a*a*b+a*b*b+b**3)/4);
}
