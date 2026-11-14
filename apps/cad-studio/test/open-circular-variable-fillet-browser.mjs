import assert from 'node:assert/strict';
import { relative, resolve } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { inspectorSource, oracleSource } from './open-circular-variable-fillet-oracle.mjs';
import { withMcp } from './fillet-continuity-mcp.mjs';

const output = process.argv[2], baseline = process.argv[3] === '--baseline';
assert.ok(output && relative(resolve(import.meta.dirname, '../../..'), resolve(output)).startsWith('../'));
const pins = [
  'apps/cad-studio/test/open-circular-variable-fillet-oracle.mjs',
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
  inspectorSource, oracleSource,
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
