import assert from 'node:assert/strict';
import { relative, resolve } from 'node:path';
import { createFlow } from './flow-helper.mjs';

const output = process.argv[2];
assert.ok(output && relative(resolve(import.meta.dirname, '../../..'), resolve(output)).startsWith('../'));
const pins = [
  'apps/cad-studio/src/App.tsx', 'apps/cad-studio/src/app/useDirectCurveCurvature.ts', 'apps/cad-studio/src/app/useEdgeCurvature.ts',
  'apps/cad-studio/src/ui/DirectInspector.tsx', 'apps/cad-studio/src/ui/DirectPanel.tsx', 'apps/cad-studio/src/ui/EdgeCurvature.tsx',
  'apps/cad-studio/src/viewport/Viewport.tsx', 'apps/cad-studio/src/viewport/CurvatureComb.tsx',
  'packages/barocss-cad-model/src/engine/direct.ts', 'packages/barocss-cad-model/src/engine/edgeCurvature.ts',
];
const f = await createFlow({
  name: 'direct-curve-curvature', envFrozen: 'D1268_SOURCE_FROZEN', output, initialFiles: pins, requiredFrozen: pins,
  qualification: 'Read and draw both knot spans of a nonplanar rational curve through Studio Reverse and a pole edit.',
  limits: ['One authored two-span rational quadratic curve with a C0 knot and a straight control. Desktop Chrome WebGPU, Iso/Ortho.'],
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
  await f.newPage();
  f.phase = 'Select the authored rational curve in the viewport';
  const original = source();
  await open(original, 'direct-curvature.bcad');
  // t=-2 gives Bernstein [1/4,1/2,1/4]. Compile nothing on the selection path.
  const pixel = await f.page.evaluate(p => window.__studioScreenOf(p), [4.75/1.1875, 7.0625/1.1875, 0.375/1.1875]);
  assert.ok(pixel && await f.page.evaluate(p => document.elementFromPoint(...p)?.matches('canvas.vp-canvas'), pixel));
  await f.page.mouse.click(...pixel);
  await row('Rational arch').and(f.page.locator('.sel')).waitFor({ timeout: 8000 });
  await show();
  await capture('initial', original);
  await panel().getByLabel('Comb scale (mm²)').selectOption('8');
  await capture('initial', original, 'larger-scale');
  await f.snapshot('initial-comb');

  f.phase = 'Reverse the curve and verify the reversed span order';
  await button('Reverse', direct()).click();
  await f.changed(original);
  const reversed = await f.doc();
  await comb().waitFor({ state: 'hidden' });
  await show();
  const reversedResult = await capture('reversed', reversed);
  const reversedObject = reversed.direct.objects.find(o => o.name.endsWith('reversed'));
  assert.equal(reversedResult.screen.id, reversedObject.id);
  assert.notEqual(reversedObject.id, 'obj_1');
  await f.snapshot('reversed-comb');

  f.phase = 'Edit pole Z and recompute while that same curve remains selected';
  await panel().getByLabel('Comb scale (mm²)').selectOption('8');
  await direct().getByLabel('Control point', { exact: true }).selectOption('1');
  const z = direct().getByLabel('Z', { exact: true });
  await z.fill('9');
  await z.press('Enter');
  await f.changed(reversed);
  const edited = await f.doc();
  const editedObject = edited.direct.objects.find(o => o.id === reversedObject.id);
  assert.notEqual(editedObject.source, reversedObject.source);
  const editedResult = await capture('edited', edited);
  assert.equal(editedResult.screen.id, reversedObject.id);
  assert.equal(editedResult.screen.scale, 8);
  const a = reversedResult.read.find(o => o.object.id === reversedObject.id).measurement.spans;
  const b = editedResult.read.find(o => o.object.id === reversedObject.id).measurement.spans;
  assert.notDeepEqual(a[0], b[0]);
  assert.deepEqual(a[1], b[1]);
  await f.snapshot('edited-comb');

  f.phase = 'Clear the overlay for another pick and a document with a reused curve ID';
  await row('Straight control').click();
  await comb().waitFor({ state: 'hidden' });
  await show();
  assert.equal(await result().locator('b').innerText(), '0 – 0 mm⁻¹');
  assert.equal(await panel().getByLabel('Comb scale (mm²)').count(), 0);
  await comb().waitFor({ state: 'hidden' });
  await row('reversed').click();
  await button('Show curvature comb', panel()).waitFor();
  // Reuse an actively measured ID in a different file.
  await row('Rational arch').filter({ hasNotText: 'reversed' }).click();
  await show();
  await comb().waitFor();
  const replacement = source(6);
  await open(replacement, 'same-id-curve.bcad');
  await comb().waitFor({ state: 'hidden' });
  await row('Rational arch').click();
  await button('Show curvature comb', panel()).waitFor();
  await show();
  await capture('replacement', replacement);
  await f.snapshot('replacement-comb');
  await button('Hide curvature comb', panel()).click();
  await comb().waitFor({ state: 'hidden' });
  assert.equal(f.report.downloads.length, 0);
});
