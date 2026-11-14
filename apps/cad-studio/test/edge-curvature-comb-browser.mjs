import assert from 'node:assert/strict';
import { relative, resolve } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { withMcp } from './fillet-continuity-mcp.mjs';

const output = process.argv[2];
assert.ok(output && relative(resolve(import.meta.dirname, '../../..'), resolve(output)).startsWith('../'));
const pins = [
  'apps/cad-studio/src/App.tsx', 'apps/cad-studio/src/app/useEdgeCurvature.ts', 'apps/cad-studio/src/ui/EdgeCurvature.tsx',
  'apps/cad-studio/scripts/cad-mcp.mjs', 'apps/cad-studio/server/cadDoc.ts',
  ...['contract', 'groups', 'toolDefinitions', 'part/nativeContinuity'].map(name => 'packages/barocss-cad-model/src/chat/'+name+'.ts'),
  'apps/cad-studio/test/fillet-continuity-mcp.mjs', 'apps/cad-studio/src/viewport/Viewport.tsx', 'apps/cad-studio/src/viewport/CurvatureComb.tsx',
  'packages/barocss-cad-model/src/engine/edgeContinuity.ts', 'packages/barocss-cad-model/src/engine/edgeCurvature.ts',
];
const f = await createFlow({
  name: 'edge-curvature-comb', envFrozen: 'D1267_SOURCE_FROZEN', output, initialFiles: pins, requiredFrozen: pins,
  qualification: 'Show the native curvature comb and prove the rendered SVG endpoints in desktop Studio.',
  limits: ['Native shared edges on one unplaced capsule. Straight top edge and one two-span semicircle.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { readEdgeContinuity } from '@barocss/cad-model/engine/edgeContinuity';
const doc=JSON.parse(readFileSync(process.argv[2],'utf8'));
const listed=readEdgeContinuity(doc,'b1',{kind:'list'});
if(!('edges' in listed)) throw new Error(listed.error);
const selected=['n1.side0|n1.top','n1.side1|n1.top'].map(name=>{
  const edge=listed.edges.find(edge=>edge.name===name);
  if(!edge) throw new Error(name);
  return readEdgeContinuity(doc,'b1',{kind:'curve',edgeId:edge.id});
});
console.log(JSON.stringify(selected));
`,
  oracleSource: `
import json,math,sys
d=json.load(sys.stdin)
height=d['height']
line=d['native'][0]['curve']
arc=d['native'][1]['curve']
assert line['minimum']==line['maximum']==0
assert len(line['spans'])==1 and len(line['spans'][0])==8
assert all(s['vector']==[0,0,0] and s['point'][1:]==[-4,height] for s in line['spans'][0])
assert arc['unit']=='1/mm' and list(map(len,arc['spans']))==[8,8]
assert abs(arc['minimum']-.25)<1e-12 and abs(arc['maximum']-.25)<1e-12
numbers=[]
error=0
for index,span in enumerate(arc['spans']):
    for sample in span:
        assert index/2<sample['parameter']<(index+1)/2
        x,y,z=sample['point']
        assert abs(math.dist((x,y,z),(20,0,height))-4)<1e-12 and z==height
        v=[(20-x)/16,-y/16,0]
        assert abs(sample['magnitude']-.25)<1e-12
        error=max(error,math.dist(sample['vector'],v))
        numbers.append((x,y))
assert error<1e-12
gap=0
for read in d['screen']:
    matrix=read['basis']
    o,vx,vy=matrix
    unit_scale=math.dist(o,vx)
    assert unit_scale>0 and abs(math.dist(o,vy)-unit_scale)<1e-4
    a=lambda x,y:[o[i]+(vx[i]-o[i])*x+(vy[i]-o[i])*y for i in range(2)]
    assert read['edgeId']==arc['edgeId'] and read['spanCount']==2
    assert len(read['segments'])==16
    for (x,y),segment in zip(numbers,read['segments']):
        tip=(x+read['scale']*(20-x)/16,y-read['scale']*y/16)
        gap=max(gap,math.dist(segment[:2],a(x,y)),math.dist(segment[2:],a(*tip)))
        assert abs(math.dist(segment[:2],segment[2:])-math.dist(a(x,y),a(*tip)))<1e-6
assert gap<1e-6,gap
print(json.dumps({'status':'PASS','radiusMM':4,'lineCurvature':0,'arcCurvature':.25,'arcSamples':16,
'maximumVectorErrorPerMM':error,'maximumRenderResidualPx':gap,'displayScalesMM2':[s['scale'] for s in d['screen']]}))
`,
});
const source = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {},
  nodes: [
    { id: 'n0', kind: 'sketch', profile: 'loop', segments: [
      { kind: 'line', start: [0, -4] },
      { kind: 'arc', start: [20, -4], center: [20, 0], direction: 'ccw' },
      { kind: 'line', start: [20, 4] },
      { kind: 'arc', start: [0, 4], center: [0, 0], direction: 'ccw' },
    ] },
    { id: 'n1', kind: 'extrude', sketch: 0, height: 6 },
  ],
  outputs: { b1: { node: 1, side: 'solid' } }, nextId: 2,
};
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const panel = () => f.page.getByRole('region', { name: 'Edge curvature', exact: true });
const result = () => panel().getByRole('status', { name: 'Edge curvature result', exact: true });
const comb = () => f.page.locator('.curvature-comb');
async function open(doc, name) {
  const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await chooser.setFiles({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) });
  await f.same(doc);
  await button('Top', f.page.locator('.views')).click();
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  const filter = button('Selection filter');
  for (let i=0;i<6 && !(await filter.innerText()).includes('Edges');i++) await filter.click();
  assert.match(await filter.innerText(), /Edges/);
  await f.page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
}
async function pick(point) {
  const pixel = await f.page.evaluate(p => window.__studioScreenOf(p), point);
  assert.ok(pixel && await f.page.evaluate(p => document.elementFromPoint(...p)?.matches('canvas.vp-canvas'),pixel));
  await f.page.mouse.click(...pixel);
  await f.page.waitForFunction(() => window.__studioSelection?.selection.edges.length === 1);
}
async function capture(scale, height) {
  await comb().waitFor();
  return f.page.evaluate(({ scale,height }) => {
    const element = document.querySelector('.curvature-comb'), c = document.querySelector('.vp-canvas');
    const r = c.getBoundingClientRect();
    const basis = [[0,0,height],[1,0,height],[0,1,height]].map(point =>
      window.__studioScreenOf(point).map((value, axis) => value - (axis ? r.top : r.left)));
    return { scale, basis, edgeId: element.dataset.edge, spanCount: element.querySelectorAll('polyline').length,
      segments: [...element.querySelectorAll('line')].map(line => ['x1','y1','x2','y2'].map(key=>Number(line.getAttribute(key)))) };
  }, {scale,height});
}
async function show(expectation) {
  await button('Show curvature comb',panel()).click();
  await result().getByText(expectation,{exact:true}).waitFor();
}

await f.run(async () => {
  const origin = new URL(f.server.resolvedUrls.local[0]).origin;
  const newContext = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async options => {
    const context = await newContext({ ...options, acceptDownloads: false, serviceWorkers: 'block' });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      return ['http:', 'https:'].includes(url.protocol) && url.origin !== origin ? route.abort() : route.continue();
    });
    return context;
  };
  f.phase = 'Read zero curvature on the selected straight edge';
  await f.newPage();
  await open(source,'curvature-capsule.bcad');
  const native=await f.inspect('native',source);
  await pick([10,-4,6]);
  await show('0 – 0 mm⁻¹');
  assert.equal(await comb().count(),0);
  assert.equal(await panel().getByLabel('Comb scale (mm²)').count(),0);
  await f.snapshot('straight');

  f.phase = 'Pick a semicircle and measure the visible inward comb';
  await pick([24,0,6]);
  await show('0.25 – 0.25 mm⁻¹');
  const screen=[await capture(4,6)];
  await panel().getByLabel('Comb scale (mm²)').selectOption('8');
  screen.push(await capture(8,6));
  await result().getByText('0.25 – 0.25 mm⁻¹',{exact:true}).waitFor();
  await f.runOracle({ native, screen, height:6 },'capsule');
  await f.snapshot('arc-comb');
  await f.same(source);
  await button('Hide curvature comb',panel()).click();
  await comb().waitFor({state:'hidden'});
  await show('0.25 – 0.25 mm⁻¹');

  f.phase = 'Replace the model with the same native IDs at another height';
  const taller=structuredClone(source);
  taller.nodes[1].height=8;
  await open(taller,'taller-curvature-capsule.bcad');
  await comb().waitFor({state:'hidden'});
  assert.equal(await panel().count(),0);
  await pick([24,0,8]);
  await show('0.25 – 0.25 mm⁻¹');
  const updated=await f.inspect('taller-native',taller);
  await f.runOracle({native:updated,screen:[await capture(4,8)],height:8},'taller-capsule');
  const accept = answer => {
    assert.equal(answer.isError,false,JSON.stringify(answer));
    const value=JSON.parse(answer.content[0].text);
    assert.deepEqual(value,answer.structuredContent);
    return value;
  };
  f.phase='Compare Studio and the read-only stdio MCP action';
  const revision=await withMcp(f,source,'capsule-agent',async(request,call)=>{
    const {tools}=await request('tools/list');
    assert.ok(tools.find(tool=>tool.name==='query').inputSchema.properties.action.enum.includes('edge_curvature'));
    const body='b1', {revision}=accept(await call({action:'native_joints',body}));
    for (const {curve} of native) {
      const result=accept(await call({action:'edge_curvature',body,edgeId:curve.edgeId,expectedRevision:revision}));
      assert.deepEqual(result,{body,revision,...curve});
    }
    return revision;
  });
  await withMcp(f,taller,'taller-capsule-agent',async(_,call)=>{
    const body='b1', edgeId=updated[1].curve.edgeId;
    const stale=await call({action:'edge_curvature',body,edgeId,expectedRevision:revision});
    assert.equal(stale.isError,true);
    assert.match(JSON.parse(stale.content[0].text).error,/changed/);
    const current=accept(await call({action:'native_joints',body})).revision;
    const measured=accept(await call({action:'edge_curvature',body,edgeId,expectedRevision:current}));
    assert.deepEqual(measured,{body,revision:current,...updated[1].curve});
  });
  await f.same(taller);
  assert.equal(await f.page.getByLabel('Unsaved changes',{exact:true}).count(),0);
  assert.deepEqual(f.report.downloads,[]);
  await f.snapshot('replacement-comb');
});
