import assert from 'node:assert/strict';
import { relative, resolve } from 'node:path';
import { createFlow } from './flow-helper.mjs';

const output = process.argv[2];
assert.ok(output && relative(resolve(import.meta.dirname, '../../..'), resolve(output)).startsWith('../'));
const axisAligned = process.argv[3] === 'axis';
const fixture = axisAligned ? {
  sketch: { profile: 'rectangle', min: [4, -1], max: [14, 4] },
  sourceFace: 'n1.side0', sourceView: 'Front', sourcePoint: [9, 0, 5], sourceNormal: '0, -1, 0',
  topPoint: [9, 1.5, 40], referenceView: 'Front', referencePoint: [9, -1, 35], referenceFace: 'n3.side0',
  move: [0, 2], retargetView: 'Back', retargetPoint: [9, 6, 35], retargetFace: 'n3.side2',
  supports: [-1, 1, 6], collapse: [0, 9, 0],
} : {
  sketch: { profile: 'polygon', points: [[20, 1], [24, -2], [27, 2], [23, 5]] },
  sourceFace: 'n1.side1', sourceView: 'Iso', sourcePoint: [21, 4, 5], sourceNormal: '0.8, -0.6, 0',
  topPoint: [23.5, 1.5, 40], referenceView: 'Left', referencePoint: [21.5, 3, 35], referenceFace: 'n3.side3',
  move: [-3, 1], retargetView: 'Right', retargetPoint: [22.5, 1, 35], retargetFace: 'n3.side1',
  supports: [77, 62, 87], collapse: [-13.25, 0, 0],
};
const pins = [
  'apps/cad-studio/src/App.tsx', 'apps/cad-studio/src/viewport/useViewportPicking.ts',
  'apps/cad-studio/src/ui/Hud.tsx', 'apps/cad-studio/src/state/useCommandPreview.ts',
  'apps/cad-studio/src/files/documentFile.ts', 'apps/cad-studio/test/flow-helper.mjs',
  'apps/cad-studio/test/offset-to-plane-browser.mjs',
  ...['app/profileCommands', 'app/nativeOffsetFace', 'app/offsetPlanePick', 'app/offsetFaceEdit', 'engine/doc', 'engine/part', 'engine/offsetPlane']
    .map(file => 'packages/barocss-cad-model/src/' + file + '.ts'),
];
const f = await createFlow({
  name: 'offset-to-plane', envFrozen: 'D1265_SOURCE_FROZEN', output, initialFiles: pins, requiredFrozen: pins,
  qualification: 'Pick and edit a live native reference plane for Offset face in desktop Studio.',
  limits: ['One upright convex hexagonal source, one disconnected planar-sided reference solid and two selected parallel walls.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep, faceGeometry } from '@barocss/cad';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
import { digestOf } from '@barocss/cad-model/util/digest';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const result = partBreps(doc).map(({key, brep}) => {
  const incidence = { vertices: brep.vertices.map(({id, tolerance}) => [id, tolerance]),
    edges: brep.edges.map(({id, name, vertices, tolerance}) => [id,name,vertices,tolerance]),
    uses: brep.coedges.map(({id, edge, loop, twin, sense, pcurve}) => [id,edge,loop,twin,sense,pcurve?.id]),
    loops: brep.loops, faces: brep.faces.map(({id,name,shell,loops,tolerance}) => [id,name,shell,loops,tolerance]),
    shells: brep.shells, bodies: brep.bodies };
  const planes = Object.fromEntries(brep.faces.map(face => {
    const edges = new Set(brep.loops.filter(loop => face.loops.includes(loop.id)).flatMap(loop => loop.coedges));
    const uses = brep.coedges.filter(use => edges.has(use.id));
    const ends = new Set(brep.edges.filter(edge => uses.some(use => use.edge === edge.id)).flatMap(edge => edge.vertices));
    return [face.name, { geometry: faceGeometry(face), trim: brep.vertices.filter(v => ends.has(v.id)).map(v => v.point),
      poles: face.surface.kind === 'surface' ? face.surface.controlPoints.flat() : [] }];
  }));
  return { key, hash: digestOf(brep), incidence: digestOf(incidence), check: checkBrep(brep,{strict:true}), planes,
    vertices: brep.vertices.map(v => v.point), volume: brepMassProperties(brep,1).volume };
});
console.log(JSON.stringify(result));
`,
  oracleSource: `
import json,math,sys
from fractions import Fraction as F
r=json.load(sys.stdin)
support=F(r['support'])
if r['axisAligned']:
    d=-support
    p=[(3*d/4,-d),(18-3*d/4,-d),(24,8),(18,16),(0,16),(-6,8)]
    signed_residual=lambda x,y: y-float(support)
else:
    d=(support-72)/5
    p=[(0,0),(support/4,0),((support+120)/8,(120-support)/6),(18,16),(0,16),(-6,8)]
    signed_residual=lambda x,y: (4*x-3*y-float(support))/5
volume=float(10*abs(sum(a[0]*b[1]-a[1]*b[0] for a,b in zip(p,p[1:]+p[:1])))/2)
n=r['source']
assert n['check']['valid'] and r['target']['check']['valid']
assert n['check']['counts']=={'bodies':1,'shells':1,'faces':8,'loops':8,'coedges':36,'edges':18,'vertices':12}
points=[(float(x),float(y),z) for z in (0,10) for x,y in p]
assert len(points)==len(n['vertices'])
assert all(sum(math.dist(p,q)<1e-9 for q in n['vertices'])==1 for p in points)
source=n['planes'][r['sourceFace']]
target=r['target']['planes'][r['face']]
residual=max(abs(signed_residual(x,y)) for x,y,z in source['trim']+source['poles']+target['trim']+target['poles'])
assert residual<1e-9
assert min(v[2] for v in target['trim'])==30 and max(v[2] for v in source['trim'])==10
assert abs(n['volume']-volume)<1e-7 and abs(r['workerVolume']-volume)<1e-7
print(json.dumps({'status':'PASS','support':float(support),'distanceMM':float(d),'exactVolumeMM3':volume,
'nativeVolumeMM3':n['volume'],'studioVolumeMM3':r['workerVolume'],'maximumPlaneResidualMM':residual}))
`,
});
const source = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {},
  nodes: [
    { id: 'n0', kind: 'sketch', profile: 'polygon', points: [[0, 0], [18, 0], [24, 8], [18, 16], [0, 16], [-6, 8]] },
    { id: 'n1', kind: 'extrude', sketch: 0, height: 10 },
    { id: 'n2', kind: 'sketch', ...fixture.sketch },
    { id: 'n3', kind: 'extrude', sketch: 2, height: 10, from: 30 },
    { id: 'n4', kind: 'translate', parent: { node: 3, side: 'solid' }, offset: [0, 0, 0] },
  ],
  outputs: { b1: { node: 1, side: 'solid' }, b4: { node: 4, side: 'solid' } }, nextId: 5,
};
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const hud = name => f.page.getByRole('dialog', { name, exact: true });
const status = (scope, state) => scope.locator('.status').filter({ hasText: new RegExp('^' + state + '$') }).waitFor();
const frame = () => f.page.getByTitle('Frame all (F)', { exact: true }).click();
async function view(name) {
  if (name === 'Iso') await button(name, f.page.locator('.views')).click();
  else {
    await button('View cube directions').click();
    await f.page.getByRole('menuitem', { name, exact: true }).click();
    await f.page.waitForFunction(label => {
      const labels = [...document.querySelectorAll('.view-cube .vc-label')];
      return labels.length === 1 && labels[0].textContent === label;
    }, name.toUpperCase());
  }
  await f.page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
}

async function point(world) {
  const pixel = await f.page.evaluate(p => {
    const screen = window.__studioScreenOf(p);
    return screen && document.elementFromPoint(...screen)?.matches('canvas.vp-canvas') ? screen : null;
  }, world);
  assert.ok(pixel, JSON.stringify(world));
  await f.page.mouse.click(...pixel);
}

async function measure(label, doc, support, face, baseline) {
  const read = await f.inspect(label, doc), key = baseline ? 'b5' : 'b1';
  const part = read.find(body => body.key === key), reference = read.find(body => body.key === 'b4');
  const worker = (await f.bodies()).bodies;
  assert.equal(worker.length, 2);
  assert.deepEqual(read.map(body => body.key).sort(), ['b4', key].sort());
  if (baseline) assert.equal(part.incidence, baseline.part.incidence);
  await f.runOracle({ source: part, target: reference, workerVolume: worker.find(body => body.key === key).volume,
    support, face, axisAligned, sourceFace: fixture.sourceFace }, label);
  f.report.observations.push({ label, bodyHash: part.hash, referenceHash: reference.hash, incidenceHash: part.incidence });
  return { part, reference };
}

async function open(doc, name) {
  const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await chooser.setFiles({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) });
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

  f.phase = 'Open both solids and select the source wall';
  await f.newPage();
  await open(source, 'offset-to-plane-source.bcad');
  await f.same(source);
  const before = await f.inspect('before', source);
  const baseline = { part: before.find(body => body.key === 'b1'), reference: before.find(body => body.key === 'b4') };
  assert.ok(baseline.part.check.valid && baseline.reference.check.valid);
  await view(fixture.sourceView);
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await frame();
  const filter = button('Selection filter');
  for (let i = 0; i < 6 && !(await filter.innerText()).includes('Faces'); i++) await filter.click();
  assert.match(await filter.innerText(), /Faces/);
  await point(fixture.sourcePoint);
  const selection = f.page.getByRole('complementary', { name: 'Selection', exact: true });
  await selection.getByText(fixture.sourceNormal, { exact: true }).waitFor();
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.command('Offset face');
  const panel = hud('Offset face');
  await panel.getByLabel('Mode', { exact: true }).selectOption('to-plane');
  await panel.getByText('Pick a parallel face on another solid', { exact: true }).waitFor();
  assert.ok(await button('Apply', panel).isDisabled());

  f.phase = 'Refuse a nonparallel face, then accept an antiparallel reference';
  await view('Top');
  await point(fixture.topPoint);
  await status(panel, 'refused');
  assert.match(await panel.locator('.hud-error').innerText(), /parallel/i);
  assert.ok(await button('Apply', panel).isDisabled());
  await f.same(source);
  await f.snapshot('nonparallel-refused');
  await view(fixture.referenceView);
  await point(fixture.referencePoint);
  await status(panel, 'preview');
  await panel.getByText(fixture.referenceFace).waitFor();
  await f.same(source);
  await button('Apply', panel).click();
  await f.changed(source);
  const outward = await f.doc(), bound = outward.nodes[5];
  assert.equal(bound.kind, 'offset-face');
  assert.deepEqual(bound.faces, [fixture.sourceFace]);
  assert.deepEqual(bound.target.body, { node: 4, side: 'solid' });
  assert.equal(bound.target.feature, 'n4');
  assert.equal(bound.target.face, fixture.referenceFace);
  assert.ok(!Object.hasOwn(bound, 'distance'));
  const first = await measure('outward', outward, fixture.supports[0], fixture.referenceFace, baseline);
  assert.equal(first.reference.hash, baseline.reference.hash);
  await f.snapshot('reference-applied');

  await f.openFeatureEditor(4, 'reference position');
  await f.editor().getByLabel('ΔX', { exact: true }).fill(String(fixture.move[0]));
  await f.editor().getByLabel('ΔY', { exact: true }).fill(String(fixture.move[1]));
  await f.applyEditor(outward, 'reference-moved');
  const moved = await f.doc();
  assert.deepEqual(moved.nodes[5], bound);
  const second = await measure('inward', moved, fixture.supports[1], fixture.referenceFace, baseline);

  await f.openFeatureEditor(5, 'reference-bound Offset');
  await button('Edit offset', f.editor()).click();
  const history = hud('Edit Offset face');
  assert.equal(await history.getByLabel('Mode', { exact: true }).inputValue(), 'to-plane');
  await history.getByText(fixture.referenceFace).waitFor();
  await view(fixture.retargetView);
  await point(fixture.retargetPoint);
  await history.getByText(fixture.retargetFace).waitFor();
  await status(history, 'preview');
  await button('Apply', history).click();
  await f.changed(moved);
  const retargeted = await f.doc();
  assert.equal(retargeted.nodes[5].id, bound.id);
  assert.equal(retargeted.nodes[5].target.face, fixture.retargetFace);
  const third = await measure('retargeted', retargeted, fixture.supports[2], fixture.retargetFace, baseline);
  assert.equal(third.reference.hash, second.reference.hash);

  await f.undo();
  await f.same(moved);
  await f.redo();
  await f.same(retargeted);
  const saved = await f.save('offset-reference-plane');
  await f.freshOpen(saved.file, retargeted, 'native-reopen');
  assert.equal((await measure('reopen', await f.doc(), fixture.supports[2], fixture.retargetFace, baseline)).part.hash, third.part.hash);

  f.phase = 'Invalid collapse file retains the accepted model';
  const collapsed = { ...outward, nodes: outward.nodes.map((node, index) => index === 4 ? { ...node, offset: fixture.collapse } : node) };
  await open(collapsed, 'collapse-reference-plane.bcad');
  await f.waitToast(/Offset face:.*(?:collapse|cross).*Your part is unchanged/i);
  await f.same(retargeted);
  await f.snapshot('collapse-file-refused');
});
