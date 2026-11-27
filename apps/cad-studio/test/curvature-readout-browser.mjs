import assert from 'node:assert/strict';
import { relative, resolve } from 'node:path';
import { createFlow } from './flow-helper.mjs';

const output = process.argv[2];
assert.ok(output && relative(resolve(import.meta.dirname, '../../..'), resolve(output)).startsWith('../'));
const pins = ['apps/cad-studio/src/ui/curvatureReadout.ts',
  'apps/cad-studio/src/App.tsx', 'apps/cad-studio/src/app/useDirectCurveCurvature.ts', 'apps/cad-studio/src/app/useEdgeCurvature.ts',
  'apps/cad-studio/src/ui/DirectInspector.tsx', 'apps/cad-studio/src/ui/DirectPanel.tsx', 'apps/cad-studio/src/ui/EdgeCurvature.tsx',
  'apps/cad-studio/src/viewport/Viewport.tsx', 'apps/cad-studio/src/viewport/CurvatureComb.tsx',
  'packages/barocss-cad-model/src/engine/direct.ts', 'packages/barocss-cad-model/src/engine/edgeCurvature.ts',
];
const f = await createFlow({
  name: 'curvature-readout', envFrozen: 'D1378_SOURCE_FROZEN', output, initialFiles: pins, requiredFrozen: pins,
  qualification: 'Verify constant and varying curvature readouts, independent comb scale and density, selection clearing and keyboard focus.',
  limits: ['Authored two-span rational curve and straight control, native R4 semicircle and G2 edge. Desktop Chrome WebGPU at 1024x800 and1440x900; no assistive-technology claim.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { geometryOf, measureDirectCurveCurvature } from '@barocss/cad-model/engine/direct';
const { direct } = JSON.parse(readFileSync(process.argv[2], 'utf8'));
console.log(JSON.stringify(direct.objects.map(object => {
  let measurement, error;
  try { measurement = measureDirectCurveCurvature(direct, object.id); }
  catch (cause) { error = cause.message; }
  return { object, curve: geometryOf(direct, object), measurement, error };
})));
`,
  oracleSource: `
import json, math, sys
from fractions import Fraction as F

data = json.load(sys.stdin)
base = [[1,2,3],[4,8,-1],[8,3,2],[12,-4,7],[17,2,5]]
weights = list(map(F, ('1','1.5','0.75','2','1.25')))
reversed_curve = data['stage'] in ('reversed', 'edited')
if reversed_curve:
    base.reverse()
    weights.reverse()
if data['stage'] == 'edited':
    base[1][2] = 9
if data['stage'] == 'replacement':
    base = [[x, y + 6, z] for x,y,z in base]
source = data['read']
id = data['screen']['id']
selected, = [item for item in source if item['object']['id'] == id]
curve = selected['curve']
if reversed_curve:
    original, = [item for item in source if item['object']['id'] == 'obj_1']
    assert original['object']['hidden'] is True and 'measurement' not in original and original['error']
else:
    assert id == 'obj_1'
assert curve['degree'] == 2 and curve['controlPoints'] == base and curve['weights'] == weights
knot = 0 if reversed_curve else -1
assert curve['knots'] == [-3,-3,-3,knot,knot,2,2,2]
assert data['screen']['spans'] == 2 and len(data['screen']['segments']) == 16
assert all(len(tips) == 8 for tips in data['screen']['tips'])
measurement = selected['measurement']
assert measurement['unit'] == '1/mm'
assert list(map(len, measurement['spans'])) == [8, 8]

def cross(a,b):
    return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]

origin, bx, by, bz = data['screen']['basis']
assert math.dist(origin, bz) > 1
def project(p):
    return [origin[k]+sum((axis[k]-origin[k])*v for axis,v in zip((bx,by,bz),p)) for k in range(2)]

magnitudes = []
point_error = vector_error = screen_error = 0
for j,(span,lo,hi) in enumerate(zip(measurement['spans'],(-3,knot),(knot,2))):
    homogeneous = [[w*x for x in [*p,1]] for p,w in zip(base[2*j:2*j+3],weights[2*j:2*j+3])]
    for i,sample in enumerate(span):
        u = F(2*i+1,16)
        basis = [(1-u)**2,2*u*(1-u),u**2]
        d1 = [-2*(1-u),2-4*u,2*u]
        d2 = [2,-4,2]
        h, hd, hdd = ([sum(b*c[k] for b,c in zip(coeff,homogeneous)) for k in range(4)] for coeff in (basis,d1,d2))
        point = [v/h[3] for v in h[:3]]
        first = [(hd[k]-hd[3]*point[k])/h[3] for k in range(3)]
        second = [(hdd[k]-2*hd[3]*first[k]-hdd[3]*point[k])/h[3] for k in range(3)]
        speed2 = sum(v*v for v in first)
        vector = [v/(speed2*speed2) for v in cross(cross(first,second),first)]
        magnitude = math.hypot(*vector)
        magnitudes.append(magnitude)
        assert sample['parameter'] == float(lo+(hi-lo)*u)
        point_error = max(point_error,math.dist(point,sample['point']))
        vector_error = max(vector_error,math.dist(vector,sample['vector']),abs(magnitude-sample['magnitude']))
        start = project(point)
        tip = project([a+data['screen']['scale']*b for a,b in zip(point,vector)])
        line = data['screen']['segments'][j*8+i]
        screen_error = max(screen_error,math.dist(line[:2],start),math.dist(line[2:],tip),math.dist(data['screen']['tips'][j][i],tip))
minimum,maximum = min(magnitudes),max(magnitudes)
assert abs(measurement['minimum']-minimum)<1e-12 and abs(measurement['maximum']-maximum)<1e-12
for a,b in zip(data['screen']['range'], (minimum,maximum)):
    assert a == float(format(b, '.7g')), (a, b)
assert point_error < 1e-12 and vector_error < 1e-12 and screen_error < 1e-6, (point_error,vector_error,screen_error)
print(json.dumps(dict(status='PASS',minimum=minimum,maximum=maximum,maximumPointErrorMM=point_error,
    maximumCurvatureErrorPerMM=vector_error,maximumRenderResidualPx=screen_error,samples=16,scaleMM2=data['screen']['scale'])))
`,
});
const points = [[1, 2, 3], [4, 8, -1], [8, 3, 2], [12, -4, 7], [17, 2, 5]];
const source = (shift = 0) => ({
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nodes: [], outputs: {}, nextId: 0,
  direct: {
    sources: { src_1: `@model authored { version: 0; length-unit: mm;
      @curve #arch { type: nurbs; degree: 2; knots: [-3,-3,-3,-1,-1,2,2,2]; control-points: ${JSON.stringify(points.map(([x,y,z]) => [x,y+shift,z]))}; weights: [1,1.5,0.75,2,1.25]; }
      @curve #line { type: nurbs; degree: 1; knots: [0,0,1,1]; control-points: [[0,-7,0],[14,-7,0]]; weights: [1,1]; }
    }` },
    objects: [
      { id: 'obj_1', name: 'Rational arch', source: 'src_1', geometry: 'arch' },
      { id: 'obj_2', name: 'Straight control', source: 'src_1', geometry: 'line' },
    ],
  },
});
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const direct = () => f.page.getByRole('complementary', { name: 'Direct geometry' });
const panel = () => direct().getByRole('region', { name: 'Curve curvature', exact: true });
const result = () => panel().getByRole('status', { name: 'Curve curvature result', exact: true });
const comb = () => f.page.locator('.curvature-comb');
const row = name => f.page.locator('.outliner .ol.direct').filter({ hasText: name });

async function open(doc, name) {
  const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await chooser.setFiles({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) });
  await f.same(doc);
  await button('Iso', f.page.locator('.views')).click();
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await f.page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
}
async function show() {
  await button('Show curvature comb', panel()).click();
  await result().getByText('Sampled curve curvature', { exact: true }).waitFor();
}
async function capture(stage, doc, sublabel = stage) {
  const read = await f.inspect(sublabel + '-native', doc);
  await comb().locator('line').nth(15).waitFor();
  const range = (await result().locator('b').innerText()).replace(' mm⁻¹', '').split(' – ').map(Number);
  const scale = Number(await panel().getByLabel('Comb scale (mm²)').inputValue());
  const screen = await f.page.evaluate(({ range, scale }) => {
    const element = document.querySelector('.curvature-comb'), bounds = document.querySelector('.vp-canvas').getBoundingClientRect();
    const basis = [[0,0,0],[1,0,0],[0,1,0],[0,0,1]].map(point => window.__studioScreenOf(point).map((v,i) => v-(i?bounds.top:bounds.left)));
    return { scale, range, id: element.dataset.curve, basis, spans: element.querySelectorAll('polyline').length,
      tips: [...element.querySelectorAll('polyline')].map(line => line.getAttribute('points').split(' ').map(p => p.split(',').map(Number))),
      segments: [...element.querySelectorAll('line')].map(line => ['x1','y1','x2','y2'].map(key => Number(line.getAttribute(key)))) };
  }, { range, scale });
  await f.runOracle({ stage, read, screen }, sublabel);
  await f.same(doc);
  return { read, screen };
}

const g2={format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nodes:[
 {kind:'sketch',id:'n0',profile:'rectangle',min:[0,0],max:[30,12]},
 {kind:'extrude',id:'n1',sketch:0,height:20},
 {kind:'fillet',id:'n2',parent:{node:1,side:'solid'},edges:['n1.side0|n1.top'],radius:2,section:{kind:'g2',tension:.5}}],outputs:{b2:{node:2,side:'solid'}},nextId:3};
const capsule={format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nodes:[
 {kind:'sketch',id:'n0',profile:'loop',segments:[{kind:'line',start:[0,-4]},{kind:'arc',start:[20,-4],center:[20,0],direction:'ccw'},{kind:'line',start:[20,4]},{kind:'arc',start:[0,4],center:[0,0],direction:'ccw'}]},
 {kind:'extrude',id:'n1',sketch:0,height:6}],outputs:{b1:{node:1,side:'solid'}},nextId:2};

async function keyboardShow(region) {
 const trigger=button('Show curvature comb',region); await trigger.focus();await trigger.press('Enter');
 await region.getByRole('status').locator('b').waitFor();
 assert.ok(await region.getByRole('button').first().evaluate(el=>el===document.activeElement),'keyboard focus lost after measuring');
}
async function scaleProof(region,label) {
 const before=await region.getByRole('status').locator('b').innerText();
 const vectors=()=>comb().locator('line').evaluateAll(lines=>lines.map(el=>['x1','y1','x2','y2'].map(k=>Number(el.getAttribute(k)))));
 const a=await vectors();assert.ok(a.length>0);
 await region.getByLabel('Comb scale (mm²)').selectOption('8');
 await f.page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 const b=await vectors();assert.equal(b.length,a.length);
 for(let i=0;i<a.length;i++){const x=a[i],y=b[i];assert.ok(Math.abs(x[0]-y[0])<1e-6&&Math.abs(x[1]-y[1])<1e-6);assert.ok(Math.abs(Math.hypot(y[2]-y[0],y[3]-y[1])-2*Math.hypot(x[2]-x[0],x[3]-x[1]))<1e-5);}
 assert.equal(await region.getByRole('status').locator('b').innerText(),before);
 f.report.observations.push({label,readout:before,combCount:a.length,scale4to8OnlyChangesLength:true});
}
async function densityProof(region, label, fullCount) {
  const density = region.getByLabel('Comb density', { exact: true });
  const scale = region.getByLabel('Comb scale (mm²)', { exact: true });
  const status = region.getByRole('status').locator('b');
  const strokes = () => comb().locator('line').evaluateAll(lines => lines.map(line =>
    ['x1','y1','x2','y2'].map(key => Number(line.getAttribute(key)))));
  const tips = () => comb().locator('polyline').evaluateAll(lines => lines.map(line => line.getAttribute('points')));
  const history = async () => [await button('Undo').isEnabled(), await button('Redo').isEnabled()];
  const doc = await f.doc(), before = await history(), readout = await status.innerText();
  assert.equal(await density.inputValue(),'8');
  assert.equal(await scale.inputValue(),'8');
  const full = await strokes(), fullTips = await tips();
  assert.equal(full.length,fullCount);
  for (const level of [2,4,8]) {
    await density.selectOption(String(level));
    const shown = await strokes();
    assert.equal(shown.length,fullCount*level/8);
    assert.ok(shown.every(line => full.some(original => original.every((value,i) => value===line[i]))));
    assert.deepEqual(await tips(),fullTips);
    assert.equal(await status.innerText(),readout);
    assert.equal(await scale.inputValue(),'8');
    if (label.includes('semicircle') || level === 2) await f.snapshot(label+'-density-'+level);
  }
  await density.selectOption('2');
  const wide = await strokes();
  await scale.selectOption('4');
  const short = await strokes();
  assert.equal(await density.inputValue(),'2');
  assert.equal(wide.length,short.length);
  for (let i=0; i<wide.length; i++) {
    const [x,y,X,Y] = wide[i], [a,b,A,B] = short[i];
    assert.deepEqual([x,y],[a,b]);
    assert.ok(Math.abs(Math.hypot(X-x,Y-y)-2*Math.hypot(A-a,B-b))<1e-5);
  }
  await f.same(doc);
  assert.deepEqual(await history(),before);
  f.report.observations.push({label, densityCounts:[fullCount/4,fullCount/2,fullCount], readout, tipLinesIdentical:true, scaleIndependent:true});
}
await f.run(async()=>{for(const width of [1024,1440]){
 await f.newPage();await f.page.setViewportSize({width,height:width===1024?800:900});
 const doc=source();await open(doc,'direct-curvature.bcad');
 await row('Straight control').click();await keyboardShow(panel());
 assert.equal(await result().locator('b').innerText(),'0 mm⁻¹');assert.equal(await panel().getByLabel('Comb scale (mm²)').count(),0);
 assert.equal(await panel().getByLabel('Comb density').count(),0);await comb().waitFor({state:'hidden'});
 const clear=button('Clear curvature',panel());await clear.press('Enter');await button('Show curvature comb',panel()).waitFor();assert.ok(await panel().getByRole('button').first().evaluate(el=>el===document.activeElement));
 await row('Rational arch').click();await keyboardShow(panel());await capture('initial',doc,`${width}-arch-four`);await scaleProof(panel(),`${width}-arch`);await capture('initial',doc,`${width}-arch-eight`);await f.snapshot(`${width}-arch`);
 await densityProof(panel(),`${width}-arch`,16);
 await row('Straight control').click();await comb().waitFor({state:'hidden'});assert.equal(await result().locator('b').count(),0);await keyboardShow(panel());await f.snapshot(`${width}-straight`);await f.same(doc);
 for(const c of [{label:'native-line',doc:capsule,view:'Top',point:[10,-4,6],count:0},{label:'semicircle',doc:capsule,view:'Top',point:[24,0,6],count:16},{label:'g2',doc:g2,view:'Right',point:[30,.375,19.625],count:8}]){
  f.phase=`${width}-${c.label}`;await open(c.doc,c.label+'.bcad');await button(c.view,f.page.locator('.views')).click();
  await f.page.getByTitle('Frame all (F)',{exact:true}).click();const filter=button('Selection filter');for(let i=0;i<6&&!(await filter.innerText()).includes('Edges');i++)await filter.click();assert.match(await filter.innerText(),/Edges/);
  await f.page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  if(c.label==='g2')for(let i=0;i<2;i++){const p=await f.page.evaluate(p=>window.__studioScreenOf(p),c.point);await f.page.mouse.move(...p);await f.page.mouse.wheel(0,-350);await f.page.waitForTimeout(150);}
  const pixel=await f.page.evaluate(p=>window.__studioScreenOf(p),c.point);await f.page.mouse.click(...pixel);await f.page.waitForFunction(()=>window.__studioSelection.selection.edges.length===1);
  const region=f.page.getByRole('region',{name:'Edge curvature',exact:true});await keyboardShow(region);if(c.count===0){assert.equal(await region.getByRole('status').locator('b').innerText(),'0 mm⁻¹');await comb().waitFor({state:'hidden'});assert.equal(await region.getByLabel('Comb scale (mm²)').count(),0);await region.scrollIntoViewIfNeeded();await f.snapshot(width+'-native-line');const clear=button('Clear curvature',region);await clear.focus();await clear.press('Enter');await button('Show curvature comb',region).waitFor();assert.ok(await region.getByRole('button').first().evaluate(el=>el===document.activeElement));await f.same(c.doc);continue;}await comb().locator('line').nth(c.count-1).waitFor();assert.equal(await comb().locator('line').count(),c.count);
  const value=await region.getByRole('status').locator('b').innerText();if(c.label==='semicircle')assert.equal(value,'0.25 mm⁻¹');else assert.equal(value,'0.09090197 – 0.9918771 mm⁻¹');
  await scaleProof(region,`${width}-${c.label}`);await region.scrollIntoViewIfNeeded();await f.snapshot(`${width}-${c.label}`);
  await densityProof(region,`${width}-${c.label}`,c.count);
  const hide=button('Hide curvature comb',region);await hide.focus();await hide.press('Enter');await comb().waitFor({state:'hidden'});assert.ok(await region.getByRole('button').first().evaluate(el=>el===document.activeElement));await f.same(c.doc);
 }
}});
