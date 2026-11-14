import assert from 'node:assert/strict';
import { relative, resolve } from 'node:path';
import { createFlow } from './flow-helper.mjs';

const output = process.argv[2];
assert.ok(output && relative(resolve(import.meta.dirname, '../../..'), resolve(output)).startsWith('../'));
const baseline = process.argv.includes('--baseline');
const pins = ['apps/cad-studio/test/flow-helper.mjs', 'apps/cad-studio/src/ui/NodeEditor.tsx',
  'apps/cad-studio/src/files/documentFile.ts', 'packages/barocss-cad-model/src/app/nativeOffsetFace.ts',
  'packages/barocss-cad-model/src/app/profileCommands.ts', 'packages/barocss-cad-model/src/engine/doc.ts',
  'packages/barocss-cad/src/part/part-model.ts',
  ...(baseline ? [] : ['packages/barocss-cad/src/features/prism-wall-offset.ts'])];
const f = await createFlow({
  name: 'offset-hexagonal-wall', envFrozen: 'D1264_SOURCE_FROZEN', output, initialFiles: pins, requiredFrozen: pins,
  qualification: 'Offset an oblique upright wall of an authored hexagonal prism in desktop Studio.',
  limits: ['One convex six-sided profile extruded along world Z. One oblique side and two signed offsets.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { checkBrep, faceGeometry, brepMassProperties } from '@barocss/cad';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
import { digestOf } from '@barocss/cad-model/util/digest';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const [{brep}] = partBreps(doc);
const ids = [brep.vertices,brep.edges,brep.coedges,brep.loops,brep.faces,brep.shells,brep.bodies]
  .map(group => group.map(item => [item.id,item.name ?? null,item.tolerance ?? null]));
const faces = brep.faces.map(face => ({name:face.name, geometry:faceGeometry(face),
  chart:face.surface.kind==='surface'?face.surface.controlPoints:null,
  trim:face.loops.map(id => brep.loops.find(loop => loop.id===id)!.coedges.map(coedge => {
    const use = brep.coedges.find(use => use.id===coedge)!;
    const edge = brep.edges.find(edge => edge.id===use.edge)!;
    return brep.vertices.find(vertex => vertex.id===edge.vertices[use.sense==='forward'?0:1])!.point;
  })),
}));
const incidence = {
  edges:brep.edges.map(edge=>edge.vertices), coedges:brep.coedges.map(({pcurve:_,...use})=>use),
  loops:brep.loops, faces:brep.faces.map(({surface:_,sense:__,...face})=>face), shells:brep.shells,bodies:brep.bodies,
};
console.log(JSON.stringify({hash:digestOf(brep),incidenceHash:digestOf(incidence),ids,faces,vertices:brep.vertices.map(v=>v.point),
  bindings:brep.coedges.map(use=>use.pcurve?.id ?? null),
  volume:brepMassProperties(brep,1).volume,check:checkBrep(brep,{strict:true})}));
`,
  oracleSource: `
import math,json,sys
from fractions import Fraction as F
d=json.load(sys.stdin)
dmm=F(str(d['distance']))
# The chosen wall 4x−3y=72 moves by signed normal distance d.
# Re-intersect with its neighbors y=0 and 4x+3y=120.
foot=[(0,0),(18+5*dmm/4,0),(24+5*dmm/8,8-5*dmm/6),(18,16),(0,16),(-6,8)]
area=abs(sum(a[0]*b[1]-a[1]*b[0] for a,b in zip(foot,foot[1:]+foot[:1])))/2
volume=float(10*area)
n=d['native']
assert n['check']['valid'],n['check']['issues']
assert n['check']['counts']=={'bodies':1,'shells':1,'faces':8,'loops':8,'coedges':36,'edges':18,'vertices':12}
points=[(float(x),float(y),z) for z in (0,10) for x,y in foot]
def check_points(actual, expected):
    assert len(actual)==len(expected)
    assert all(sum(math.dist(p,q)<=1e-9 for q in actual)==1 for p in expected)
check_points(n['vertices'],points)
normals=[(0,-1,0),(.8,-.6,0),(.8,.6,0),(0,1,0),(-.8,.6,0),(-.8,-.6,0)]
offsets=[0,(72+5*float(dmm))/5,24,16,9.6,0]
dot=lambda a,b:sum(x*y for x,y in zip(a,b))
maximum=0
for face in n['faces']:
    normal=face['geometry']['n']
    if face['name']=='n1.top':
        wanted,offset=(0,0,1),10
    elif face['name']=='n1.bottom':
        wanted,offset=(0,0,-1),0
    else:
        i=int(face['name'].split('side')[1])
        wanted,offset=normals[i],offsets[i]
    assert math.dist(normal,wanted)<=1e-9,(face['name'],normal,wanted)
    residual=abs(dot(wanted,face['geometry']['o'])-offset)
    maximum=max(maximum,residual)
    assert residual<=1e-9,(face['name'],offset,residual)
    expected=[p for p in points if abs(dot(wanted,p)-offset)<=1e-9]
    check_points(face['trim'][0],expected)
    assert len(face['trim'])==1
    grid=face['chart']
    assert len(grid)==2 and all(len(row)==2 for row in grid)
    polygon=[grid[0][0],grid[1][0],grid[1][1],grid[0][1]]
    assert all(abs(dot(wanted,p)-offset)<=1e-9 for p in polygon)
    dim=max(range(3),key=lambda i:abs(wanted[i]))
    project=lambda p:[p[i] for i in range(3) if i!=dim]
    chart=[project(p) for p in polygon]
    turn=lambda a,b,c:(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
    corners=[turn(chart[i],chart[(i+1)%4],chart[(i+2)%4]) for i in range(4)]
    assert min(corners)>1e-9 or max(corners)<-1e-9
    orientation=1 if corners[0]>0 else -1
    for p in face['trim'][0]:
        assert min(orientation*turn(chart[i],chart[(i+1)%4],project(p)) for i in range(4))>=-1e-8
assert abs(n['volume']-volume)<=1e-7 and abs(d['studioVolume']-volume)<=1e-7
print(json.dumps({'status':'PASS','distanceMM':float(dmm),'footprintAreaMM2':float(area),
    'exactVolumeMM3':volume,'nativeVolumeMM3':n['volume'],'studioVolumeMM3':d['studioVolume'],'planeResidualMM':maximum}))
`,
});
const source = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {},
  nodes: [
    { id: 'n0', kind: 'sketch', profile: 'polygon', points: [[0, 0], [18, 0], [24, 8], [18, 16], [0, 16], [-6, 8]] },
    { id: 'n1', kind: 'extrude', sketch: 0, height: 10 },
  ],
  outputs: { b1: { node: 1, side: 'solid' } }, nextId: 2,
};
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const hud = name => f.page.getByRole('dialog', { name, exact: true });
const distance = scope => scope.getByLabel('Offset', { exact: true });
const status = (scope, state) => scope.locator('.status').filter({ hasText: new RegExp('^' + state + '$') }).waitFor();

async function measure(label, doc, mm, original) {
  const native = await f.inspect(label, doc);
  const bodies = (await f.bodies()).bodies;
  assert.equal(bodies.length, 1);
  assert.equal(native.bindings.filter(Boolean).length, 36);
  if (original) {
    assert.deepEqual(native.ids, original.ids);
    assert.equal(native.incidenceHash, original.incidenceHash);
    assert.deepEqual(native.bindings, original.bindings);
  }
  await f.runOracle({ native, distance: mm, studioVolume: bodies[0].volume }, label);
  f.report.observations.push({ label, shapeSHA256: native.hash, identityRetained: !!original });
  return native;
}
async function pickWall() {
  await button('Iso', f.page.locator('.views')).click();
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  const filter = button('Selection filter');
  for (let i = 0; i < 6 && !(await filter.innerText()).includes('Faces'); i++) await filter.click();
  assert.match(await filter.innerText(), /Faces/);
  await f.page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
  const pixel = await f.page.evaluate(p => window.__studioScreenOf(p), [21, 4, 5]);
  assert.ok(pixel && await f.page.evaluate(p => document.elementFromPoint(...p)?.matches('canvas.vp-canvas'), pixel));
  await f.page.mouse.click(...pixel);
  await f.page.waitForFunction(() => window.__studioSelection.selection.faces.length === 1);
  const selection = f.page.getByRole('complementary', { name: 'Selection', exact: true });
  await selection.getByText('0.8, -0.6, 0', { exact: true }).waitFor();
}
await f.run(async () => {
  const origin = new URL(f.server.resolvedUrls.local[0]).origin;
  const newContext = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async options => {
    const context = await newContext({ ...options, serviceWorkers: 'block' });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      return ['http:', 'https:'].includes(url.protocol) && url.origin !== origin ? route.abort() : route.continue();
    });
    return context;
  };
  f.phase = 'Open the hexagonal stock and select the oblique side';
  await f.newPage();
  const [open] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await open.setFiles({ name: 'offset-hexagonal-wall.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(source)) });
  await f.same(source);
  const original = await measure('source', source, 0);
  assert.equal(original.hash, 'd9da8d76ad70cce73d9061bb6d1ac6632e1a9124562aabd239697d79e11b94b8');
  await pickWall();
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.command('Offset face');
  const panel = hud('Offset face');
  await distance(panel).fill('1');
  if (baseline) {
    await status(panel, 'refused');
    assert.ok(await button('Apply', panel).isDisabled());
    await f.same(source);
    await panel.getByText('Kernel detail', { exact: true }).click();
    assert.match(await panel.locator('.hud-error details code').innerText(), /only native cardinal prism or cylinder caps/i);
    const snapshot = await f.snapshot('baseline-refused');
    f.report.observations.push({ label: 'baseline-refusal', reason: snapshot.hud });
    return;
  }
  await status(panel, 'preview');
  await f.same(source);
  await button('Apply', panel).click();
  await f.changed(source);
  const outward = await f.doc(), node = outward.nodes[2];
  assert.equal(node.kind, 'offset-face');
  assert.deepEqual(node.faces, ['n1.side1']);
  assert.deepEqual(node.parent, { node: 1, side: 'solid' });
  assert.equal(node.distance, 1);
  assert.ok(node.sigs?.['n1.side1']);
  assert.deepEqual(outward.nodes.slice(0, 2), source.nodes);
  await measure('outward', outward, 1, original);
  await f.snapshot('outward-applied');

  f.phase = 'Refuse a collapse and edit the same face inwards in History';
  await f.openFeatureEditor(2, 'oblique prism side');
  await button('Edit offset', f.editor()).click();
  const history = hud('Edit Offset face');
  assert.equal(await distance(history).inputValue(), '1');
  await distance(history).fill('-9.6');
  await status(history, 'refused');
  assert.ok(await button('Apply', history).isDisabled());
  await history.getByText('Kernel detail', { exact: true }).click();
  assert.match(await history.locator('.hud-error details code').innerText(), /collaps|topology|cross|convex/i);
  await f.same(outward);
  await f.snapshot('collapse-refused');
  await distance(history).fill('-2');
  await status(history, 'preview');
  await button('Apply', history).click();
  await f.changed(outward);
  const inward = await f.doc();
  assert.deepEqual(inward.nodes[2], { ...node, distance: -2 });
  const inwardShape = await measure('inward', inward, -2, original);
  await f.undo();
  await f.same(outward);
  await f.redo();
  await f.same(inward);
  const saved = await f.save('hexagonal-wall-offset');
  await f.freshOpen(saved.file, inward, 'native-reopen');
  assert.equal((await measure('reopened', await f.doc(), -2, original)).hash, inwardShape.hash);
  const invalid = { ...inward, nodes: [...source.nodes, { ...node, distance: -9.6 }] };
  const [bad] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await bad.setFiles({ name: 'collapsed-hexagon.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(invalid)) });
  await f.waitToast(/Offset face:.*(?:collaps|topology|cross|convex).*Your part is unchanged/i);
  await f.same(inward);
  await f.snapshot('invalid-file-retains-part');
});
