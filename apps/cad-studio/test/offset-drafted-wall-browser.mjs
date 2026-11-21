import assert from 'node:assert/strict';
import { relative, resolve } from 'node:path';
import { createFlow } from './flow-helper.mjs';

const output = process.argv[2];
const savedBaseline = process.argv.includes('--saved-handle-baseline');
const savedHandle = savedBaseline || process.argv.includes('--saved-handle');
assert.ok(output && relative(resolve(import.meta.dirname, '../../..'), resolve(output)).startsWith('../'));
const pins = [
  'apps/cad-studio/test/flow-helper.mjs',
  'apps/cad-studio/src/app/offsetCollapseFeedback.ts',
  'apps/cad-studio/src/App.tsx',
  'apps/cad-studio/src/ui/NodeEditor.tsx',
  'apps/cad-studio/src/files/documentFile.ts',
  'packages/barocss-cad-model/src/app/nativeOffsetFace.ts',
  'packages/barocss-cad-model/src/app/offsetFaceEdit.ts',
  'packages/barocss-cad-model/src/app/profileCommands.ts',
  'packages/barocss-cad-model/src/engine/part.ts',
  'packages/barocss-cad-model/src/engine/mesh.ts',
  'packages/barocss-cad/src/part/part-model.ts',
  'packages/barocss-cad/src/part/part-expect.ts',
  'packages/barocss-cad/src/features/drafted-cap-offset.ts',
];
const f = await createFlow({
  name: 'offset-drafted-wall', output, envFrozen: 'D1261_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Move an inclined wall of a rectangular taper through actual Studio.',
  limits: ['One native Draft Extrude, one inclined wall, a topology-preserving signed offset and a collapse refusal.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { checkBrep, faceGeometry, massPropertiesOf } from '@barocss/cad';
import { digestOf } from '@barocss/cad-model/util/digest';
import { partSnapshot } from '@barocss/cad-model/engine/part';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const { outputs } = partSnapshot(doc), body = outputs[0], brep = body.brep;
const identities = Object.fromEntries(['vertices','edges','coedges','loops','faces','shells','bodies'].map(field =>
  [field, brep[field].map(value => [value.id, value.name ?? null])]));
const trims = brep.faces.map(face => {
  const loop = brep.loops.find(l => l.id === face.loops[0])!;
  return { name: face.name, geometry: faceGeometry(face),
    chart: face.surface.kind === 'surface' ? face.surface.controlPoints : [],
    corners: loop.coedges.map(id => {
      const use = brep.coedges.find(c => c.id === id)!;
      const edge = brep.edges.find(e => e.id === use.edge)!;
      return brep.vertices.find(v => v.id === edge.vertices[use.sense === 'forward' ? 0 : 1])!.point;
    }),
  };
});
console.log(JSON.stringify({ outputs: outputs.length, count: body.bodyCount, check: checkBrep(brep, { strict: true }),
  volume: massPropertiesOf(body).volume, sha256: digestOf(brep), point: brep.vertices.map(v => v.point), identities, trims }));
`,
  oracleSource: `
import json, math, sys
d = json.load(sys.stdin)
w, b, h = d['dimensions']
t = math.tan(math.radians(d['draft']))
n = math.hypot(1, t)
cross_plane_shift = d['distance'] * n
vertices = [(x, y, z) for z in (0, h) for x in (t*z,w-t*z+cross_plane_shift) for y in (t*z,b-t*z)]
read = d['native']
assert read['outputs'] == read['count'] == 1 and read['check']['valid']
assert len(read['point']) == 8
def near_vec(a, b, lim=1e-9):
    return all(abs(x-y) <= lim for x,y in zip(a,b))
assert all(sum(near_vec(got, v) for got in read['point']) == 1 for v in vertices)
dot = lambda a,b: sum(x*y for x,y in zip(a,b))
planes = [
    ((-1/n,0,t/n), 0), ((1/n,0,t/n), w/n+d['distance']),
    ((0,-1/n,t/n), 0), ((0,1/n,t/n), b/n),
    ((0,0,-1), 0), ((0,0,1), h),
]
maximum_plane_residual = 0.0
for normal, constant in planes:
    faces = [face for face in read['trims'] if face['geometry']['kind']=='plane' and near_vec(normal,face['geometry']['n'])]
    assert len(faces) == 1, (faces, normal)
    expected = [v for v in vertices if abs(dot(normal,v) - constant) <= 1e-9]
    assert len(expected) == len(faces[0]['corners']) == 4
    assert all(sum(near_vec(got,v) for got in faces[0]['corners']) == 1 for v in expected)
    chart = faces[0]['chart']
    assert len(chart) == 2 and all(len(row) == 2 for row in chart)
    polygon_3d = (chart[0][0], chart[1][0], chart[1][1], chart[0][1])
    residual = max(abs(dot(normal,p)-constant) for p in [faces[0]['geometry']['o'],*faces[0]['corners'],*polygon_3d])
    maximum_plane_residual = max(residual,maximum_plane_residual)
    assert residual <= 1e-9
    drop = max(range(3), key=lambda i: abs(normal[i]))
    project = lambda p: tuple(v for i,v in enumerate(p) if i != drop)
    polygon = tuple(map(project,polygon_3d))
    sides = list(zip(polygon, polygon[1:]+polygon[:1]))
    def turn(a,b,c):
        return (b[0]-a[0])*(c[1]-a[1]) - (b[1]-a[1])*(c[0]-a[0])
    chart_turns = [turn(a,b,polygon[(i+2)%4]) for i,(a,b) in enumerate(sides)]
    assert min(chart_turns) > 1e-8 or max(chart_turns) < -1e-8
    orientation = math.copysign(1,chart_turns[0])
    for corner in faces[0]['corners']:
        assert min(orientation * turn(a,b,project(corner)) for a,b in sides) >= -1e-8, (faces[0]['name'], corner)
    if normal[0] > 0.9:
        assert faces[0]['name'] == d['face']
area = lambda z: (w-2*t*z+cross_plane_shift) * (b-2*t*z)
volume = (area(0)+4*area(h/2)+area(h))*h/6
assert abs(read['volume']-volume) <= 1e-7
assert abs(d['studioVolume']-volume) <= 1e-7
print(json.dumps({'status':'PASS','distanceMM':d['distance'],'expectedVolumeMM3':volume,
    'nativeVolumeMM3': read['volume'], 'studioVolumeMM3':d['studioVolume'],
    'maximumPlaneResidualMM':maximum_plane_residual,'crossPlaneShiftMM':cross_plane_shift}))
`,
});
const dimensions = [40, 30, 10], [width, depth, height] = dimensions;
const draft = 10, slope = Math.tan(draft * Math.PI / 180), unit = Math.hypot(1, slope);
const seed = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {},
  nodes: [{ kind: 'sketch', id: 'n0', profile: 'rectangle', min: [0, 0], max: [width, depth] },
    { kind: 'extrude', id: 'n1', sketch: 0, height, draft }],
  outputs: { b1: { node: 1, side: 'solid' } }, nextId: 2,
};
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const hud = name => f.page.getByRole('dialog', { name, exact: true });
const offset = panel => panel.getByLabel('Offset', { exact: true });
const status = (panel, state) => panel.locator('.status').filter({ hasText: new RegExp('^' + state + '$') }).waitFor();

async function pickWall() {
  await button('Right', f.page.locator('.views')).click();
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  const filter = button('Selection filter');
  for (let i = 0; i < 6 && !(await filter.innerText()).includes('Faces'); i++) await filter.click();
  assert.match(await filter.innerText(), /Faces/);
  await f.page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
  const pixel = await f.page.evaluate(point => window.__studioScreenOf(point), [width - height / 2 * slope, depth / 2, height / 2]);
  assert.ok(pixel && await f.page.evaluate(p => document.elementFromPoint(...p)?.matches('canvas.vp-canvas'), pixel));
  await f.page.mouse.click(...pixel);
  await f.page.waitForFunction(() => window.__studioSelection.selection.faces.length === 1);
}

async function measure(label, doc, face, distance, source) {
  const native = await f.inspect(label, doc);
  assert.deepEqual(native.check.counts, { bodies: 1, shells: 1, faces: 6, loops: 6, coedges: 24, edges: 12, vertices: 8 });
  if (source) assert.deepEqual(native.identities, source.identities);
  const worker = (await f.bodies()).bodies;
  assert.equal(worker.length, 1);
  await f.runOracle({ native, studioVolume: worker[0].volume, face, distance, dimensions, draft }, label);
  return native;
}

async function verifySavedHandle(outward, index, wall, stock) {
  const saved = await f.save('saved-wall-before-edit');
  await f.freshOpen(saved.file, outward, 'saved-wall-before-edit-opened');
  await button('Iso', f.page.locator('.views')).click();
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await f.page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
  const view = await f.page.evaluate(() => window.__studioCamera());
  const openHistory = async () => {
    await f.openFeatureEditor(index, 'saved inclined wall');
    await button('Edit offset', f.editor()).click();
    const panel = hud('Edit Offset face');
    await status(panel, 'preview');
    assert.equal(await offset(panel).inputValue(), '3');
    return panel;
  };
  const panel = await openHistory();
  assert.deepEqual(await f.page.evaluate(() => window.__studioCamera()), view);
  const group = f.page.locator('g.gizmo-handle[data-handle="d"]');
  if (savedBaseline) {
    assert.equal(await group.count(), 0);
    await f.snapshot('saved-wall-before-no-handle');
    await offset(panel).fill('4');
    await status(panel, 'preview');
  } else {
    const anchor = [width - height / 2 * slope + 3 * unit, depth / 2, height / 2];
    const normal = [1 / unit, 0, slope / unit];
    const [from, to] = await f.page.evaluate(([p, d]) =>
      [window.__studioScreenOf(p), window.__studioScreenOf(p.map((value, i) => value + d[i]))], [anchor, normal]);
    const origin = await group.locator('circle').boundingBox();
    assert.ok(origin);
    const gap = Math.hypot(origin.x + origin.width / 2 - from[0], origin.y + origin.height / 2 - from[1]);
    assert.ok(gap < .5, JSON.stringify({ gap, from, origin }));
    const delta = to.map((value, i) => value - from[i]);
    assert.ok(Math.hypot(...delta) > 6);
    const arrow = await group.locator('polygon').boundingBox();
    assert.ok(arrow);
    const [x, y] = [arrow.x + arrow.width / 2, arrow.y + arrow.height / 2];
    await f.page.mouse.move(x, y);
    await f.page.mouse.down();
    await f.page.mouse.move(x + delta[0], y + delta[1], { steps: 6 });
    await status(panel, 'preview');
    assert.equal(await offset(panel).inputValue(), '4');
    await f.same(outward);
    await f.snapshot('saved-wall-drag-preview');
    await f.page.mouse.up();
    f.report.observations.push({ label: 'saved-wall-gizmo', camera: view, gap, delta });
  }
  await button('Apply', panel).click();
  await f.changed(outward);
  const accepted = await f.doc();
  assert.deepEqual(accepted, { ...outward, nodes: outward.nodes.map((node, i) => i === index ? { ...node, distance: 4 } : node) });
  const measured = await measure('saved-wall-accepted', accepted, wall, 4, stock);
  if (savedBaseline) return;
  await f.undo();
  await f.same(outward);
  await f.redo();
  await f.same(accepted);
  await f.undo();
  await f.same(outward);
  const typed = await openHistory();
  await offset(typed).fill('4');
  await status(typed, 'preview');
  await button('Apply', typed).click();
  await f.same(accepted);
  const file = await f.save('saved-wall-after-drag');
  await f.freshOpen(file.file, accepted, 'saved-wall-reopened');
  assert.equal((await measure('saved-wall-reopened', accepted, wall, 4, stock)).sha256, measured.sha256);
  await button('Iso', f.page.locator('.views')).click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await f.snapshot('saved-wall-reopened-framed');
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

  f.phase = 'Open the authored taper and select the inclined +X wall';
  await f.newPage();
  await f.page.setViewportSize({ width: Number(process.argv.find(value => /^(1024|1440)$/.test(value)) ?? 1440), height: 900 });
  const [open] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await open.setFiles({ name: 'drafted-wall.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) });
  await f.same(seed);
  const originShape = await f.inspect('stock', seed);
  const wall = originShape.trims.find(row => row.geometry.kind === 'plane' && row.geometry.n[0] > 0.9 && row.geometry.n[2] > 0.1);
  assert.ok(wall);
  const stock = await measure('original-oracle', seed, wall.name, 0);
  await pickWall();
  await button('Iso', f.page.locator('.views')).click();
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.command('Offset face');
  const panel = hud('Offset face');
  f.phase = 'Drag the signed wall handle and apply an outward offset';
  await status(panel, 'preview');
  const handle = f.page.locator('g.gizmo-handle[data-handle="d"] polygon');
  const head = await handle.evaluate(polygon => {
    const box = polygon.getBoundingClientRect();
    return [box.x + box.width / 2, box.y + box.height / 2];
  });
  const [from, to] = await f.page.evaluate(([a, n]) => [window.__studioScreenOf(a), window.__studioScreenOf(a.map((x, i) => x + n[i]))],
    [[width - height / 2 * slope, depth / 2, height / 2], [1 / unit, 0, slope / unit]]);
  const delta = to.map((value, i) => value - from[i]);
  assert.ok(Math.hypot(...delta) > 6);
  await f.page.mouse.move(...head);
  await f.page.mouse.down();
  await f.page.mouse.move(...head.map((value, i) => value + delta[i]), { steps: 6 });
  await f.page.mouse.up();
  assert.equal(await offset(panel).inputValue(), '3');
  await status(panel, 'preview');
  await f.same(seed);
  await f.snapshot('wall-preview');
  await button('Apply', panel).click();
  await f.changed(seed);
  const outward = await f.doc(), index = seed.nodes.length, node = outward.nodes[index];
  assert.equal(outward.nodes.length, index + 1);
  assert.deepEqual(outward.nodes.slice(0, index), seed.nodes);
  assert.equal(node.kind, 'offset-face');
  assert.deepEqual(node.faces, [wall.name]);
  assert.deepEqual(node.parent, { node: 1, side: 'solid' });
  assert.equal(node.distance, 3);
  assert.ok(node.sigs?.[wall.name]);
  await measure('outward-oracle', outward, wall.name, 3, stock);
  await f.snapshot('wall-outward');
  if (savedHandle) {
    await verifySavedHandle(outward, index, wall.name, stock);
    return;
  }

  f.phase = 'Refuse a topology change, then edit the same wall inwards';
  await f.openFeatureEditor(index, 'inclined wall');
  await button('Edit offset', f.editor()).click();
  const history = hud('Edit Offset face');
  await status(history, 'preview');
  assert.equal(await offset(history).inputValue(), '3');
  await offset(history).fill('-36');
  await status(history, 'refused');
  assert.equal(await button('Apply', history).isDisabled(), true);
  assert.equal(await offset(history).getAttribute('aria-invalid'), 'true');
  assert.equal(await offset(history).getAttribute('aria-describedby'), 'hud-offset-collapse');
  assert.equal(await history.locator('.hud-error').count(), 1);
  await history.getByText(/Reduce the inward move by using a less negative Offset/).waitFor();
  assert.ok((await history.locator('#hud-offset-collapse').innerText()).includes(wall.name));
  assert.equal(await history.locator('#hud-offset-collapse details').getAttribute('open'), null);
  assert.match(await history.innerText(), /clos|cross|collapse/i);
  await f.same(outward);
  await f.snapshot('wall-collapse-refused');
  await offset(history).fill('-35.9'); await status(history, 'preview');
  assert.notEqual(await offset(history).getAttribute('aria-invalid'), 'true');
  await offset(history).fill('-35.918');
  await status(history, 'preview');
  await button('Apply', history).click();
  await f.changed(outward);
  const inward = await f.doc();
  assert.deepEqual(inward.nodes[index], { ...node, distance: -35.918 });
  assert.deepEqual(inward.nodes.slice(0, index), seed.nodes);
  const result = await measure('inward-oracle', inward, wall.name, -35.918, stock);
  const labels = async distance => {
    const name = `Offset face ${distance} mm`;
    const historyButton = f.page.locator(`.hs[data-node-index="${index}"]`);
    assert.equal(await historyButton.getAttribute('aria-label'), name);
    assert.ok((await historyButton.getAttribute('title')).startsWith(name + ' ·'));
    const show = button('Show its features');
    if (await show.count()) await show.click();
    await f.page.locator('.ol-step').getByText(name, { exact: true }).waitFor();
  };
  await labels(-35.918);
  await f.openFeatureEditor(index, 'precise wall offset');
  await button('Edit offset', f.editor()).click();
  await status(history, 'preview');
  assert.equal(await offset(history).inputValue(), '-35.918');
  await offset(history).fill('-35.92');
  await status(history, 'refused');
  assert.equal(await button('Apply', history).isDisabled(), true);
  await f.same(inward);
  await offset(history).fill('-35.916');
  await status(history, 'preview');
  await button('Apply', history).click();
  await f.changed(inward);
  await labels(-35.916);
  const preciseEdit = await f.doc();
  await measure('second-precise-oracle', preciseEdit, wall.name, -35.916, stock);
  await f.undo(); await f.same(inward); await labels(-35.918);
  await f.redo(); await f.same(preciseEdit); await labels(-35.916);
  await f.undo(); await f.same(inward);

  await f.undo();
  await f.same(outward);
  await f.redo();
  await f.same(inward);

  f.phase = 'Save and reopen the accepted wall edit in a fresh Studio context';
  const file = await f.save('drafted-wall');
  await f.freshOpen(file.file, inward, 'wall-file-opened');
  assert.equal((await measure('reopened-oracle', await f.doc(), wall.name, -35.918, stock)).sha256, result.sha256);
  await labels(-35.918);
  const invalid = { ...inward, nodes: [...seed.nodes, { ...node, distance: -37 }] };
  const [bad] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await bad.setFiles({ name: 'collapsed-wall.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(invalid)) });
  await f.waitToast(/Offset face:.*(?:clos|cross|collapse).*Your part is unchanged/i);
  await f.same(inward);
  await f.snapshot('invalid-file-unchanged');
  await f.openFeatureEditor(index, 'inward recovery'); await button('Edit offset', f.editor()).click();
  const recovery = hud('Edit Offset face'); await status(recovery, 'preview');
  await offset(recovery).fill('-36'); await status(recovery, 'refused');
  await recovery.getByText(/Reduce the inward move/).waitFor(); await f.same(inward);
  await offset(recovery).fill('-2'); await status(recovery, 'preview');
  assert.equal(await recovery.locator('#hud-offset-collapse').count(), 0);
  await button('Apply', recovery).click(); await f.changed(inward); const recovered = await f.doc();
  assert.deepEqual(recovered.nodes[index], {...node, distance:-2}); await measure('recovery-minus-two',recovered,wall.name,-2,stock);
  await f.undo(); await f.same(inward); await f.redo(); await f.same(recovered);
  const recoveredFile = await f.save('wall-recovered'); await f.freshOpen(recoveredFile.file,recovered,'recovered-open');
  await measure('recovered-open-oracle',await f.doc(),wall.name,-2,stock);
  f.report.observations.push({ label: 'wall-offset', face: wall.name, handleDistance: 3, inwardDistance: -35.918,
    dragCssPixels: delta, signedRefusal: -37, exactReopen: true, identityRetained: true, shapeSHA256: result.sha256 });
});
