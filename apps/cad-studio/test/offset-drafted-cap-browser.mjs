import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const lower = process.argv.includes('--lower');
const historyBaseline = process.argv.includes('--history-handle-baseline');
const historyHandle = historyBaseline || process.argv.includes('--history-handle');
const historyInward = process.argv.includes('--history-inward');
assert.ok(!historyInward || historyHandle);
const cap = lower ? 'n1.bottom' : 'n1.top';
const pins = [
  'apps/cad-studio/src/App.tsx',
  'apps/cad-studio/src/viewport/offsetFaceLaunchView.ts',
  'apps/cad-studio/src/ui/NodeEditor.tsx',
  'apps/cad-studio/src/files/documentFile.ts',
  'packages/barocss-cad-model/src/app/nativeOffsetFace.ts',
  'packages/barocss-cad-model/src/app/offsetFaceEdit.ts',
  'packages/barocss-cad-model/src/app/profileCommands.ts',
  'packages/barocss-cad-model/src/engine/part.ts',
  'packages/barocss-cad-model/src/engine/migrate.ts',
  'packages/barocss-cad/src/features/drafted-cap-offset.ts',
];
if (historyHandle) pins.push('apps/cad-studio/test/offset-drafted-cap-browser.mjs',
  'apps/cad-studio/src/ui/HistoryFeatureEditor.tsx', 'apps/cad-studio/src/viewport/useCommandGizmos.ts',
  'apps/cad-studio/src/viewport/scalarHandleDrag.ts', 'apps/cad-studio/src/state/useCommandPreview.ts',
  'apps/cad-studio/src/app/commandState.ts');
const f = await createFlow({
  name: 'offset-drafted-cap', output: process.argv[2], envFrozen: lower ? 'D1255_SOURCE_FROZEN' : 'D1254_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: historyHandle ? `Drag the saved terminal ${lower ? 'lower' : 'upper'} Offset face from its current native cap.` :
    'Move a tapered cap and retain its wall planes, references, History and native file.',
  limits: ['One authored rectangular Draft Extrude and one straight rectangular legacy control. Desktop Chrome WebGPU.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { checkBrep, faceGeometry, massPropertiesOf } from '@barocss/cad';
import { partSnapshot } from '@barocss/cad-model/engine/part';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const { outputs } = partSnapshot(doc), body = outputs[0], brep = body.brep;
console.log(JSON.stringify({
  outputs: outputs.length, count: body.bodyCount, check: checkBrep(brep, { strict: true }),
  volume: massPropertiesOf(body).volume, point: brep.vertices.map(v => v.point),
  faces: brep.faces.map(face => ({ name: face.name, geometry: faceGeometry(face) })),
  edgeNames: brep.edges.map(edge => edge.name).sort(),
}));
`,
});
const width = 20, depth = 10, height = 12, degrees = 15;
const slope = Math.tan(degrees * Math.PI / 180);
const seed = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {},
  nodes: [{ kind: 'sketch', id: 'n0', profile: 'rectangle', min: [0, 0], max: [width, depth] },
    { kind: 'extrude', id: 'n1', sketch: 0, height, draft: degrees }],
  outputs: { b1: { node: 1, side: 'solid' } }, nextId: 2,
};
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const hud = name => f.page.getByRole('dialog', { name, exact: true });
const offsetField = panel => panel.getByLabel('Offset', { exact: true });
const status = (panel, state) => panel.locator('.status').filter({ hasText: new RegExp('^' + state + '$') }).waitFor();
const near = (actual, expected, bound = 1e-8) => Math.abs(actual - expected) < bound;
const samePoint = (actual, expected) => actual.every((value, i) => near(value, expected[i]));

async function open(doc, label) {
  await f.newPage(); await f.page.setViewportSize({ width: Number(process.argv.find(x => /^(1024|1440)$/.test(x)) ?? 1440), height: 900 });
  const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await chooser.setFiles({ name: label + '.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) });
  await f.same(doc);
}

async function pickCap(bottom = false) {
  if (bottom) {
    await button('View cube directions').click();
    await f.page.getByRole('menuitem', { name: 'Bottom', exact: true }).click();
  } else {
    await button('Top', f.page.locator('.views')).click();
  }
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  const filter = button('Selection filter');
  for (let i = 0; i < 5 && !(await filter.innerText()).includes('Faces'); i++) await filter.click();
  assert.match(await filter.innerText(), /Faces/);
  await f.page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
  const pixel = await f.page.evaluate(point => window.__studioScreenOf(point), [width / 2, depth / 2, bottom ? 0 : height]);
  assert.ok(await f.page.evaluate(pixel => document.elementFromPoint(...pixel)?.matches('canvas.vp-canvas'), pixel), pixel);
  await f.page.mouse.click(...pixel);
  await f.page.waitForFunction(() => window.__studioSelection.selection.faces.length === 1);
}

function sectionVolume(z) {
  return width * depth * z - (width + depth) * slope * z ** 2 + 4 / 3 * slope ** 2 * z ** 3;
}
async function native(label, doc, distance, original) {
  const start = lower ? -distance : 0, end = lower ? height : height + distance;
  const moved = lower ? start : end;
  const read = await f.inspect(label, doc), volume = sectionVolume(end) - sectionVolume(start);
  assert.equal(read.outputs, 1);
  assert.equal(read.count, 1);
  assert.ok(read.check.valid, read.check.issues.join('\n'));
  assert.deepEqual(read.check.counts, { bodies: 1, shells: 1, faces: 6, loops: 6, coedges: 24, edges: 12, vertices: 8 });
  assert.ok(near(read.volume, volume, 1e-7), JSON.stringify({ label, volume, actual: read.volume }));
  const worker = (await f.bodies()).bodies;
  assert.equal(worker.length, 1);
  assert.ok(near(worker[0].volume, volume, 1e-7));
  for (const level of [start, end]) {
    const lo = level * slope;
    for (const x of [lo, width - lo]) for (const y of [lo, depth - lo])
      assert.ok(read.point.some(point => samePoint(point, [x, y, level])), JSON.stringify({ label, point: [x, y, level] }));
  }
  if (original) {
    assert.deepEqual(read.edgeNames, original.edgeNames);
    assert.deepEqual(read.faces.map(face => face.name).sort(), original.faces.map(face => face.name).sort());
    for (const { name, geometry } of read.faces) {
      assert.equal(geometry.kind, 'plane');
      const before = original.faces.find(face => face.name === name).geometry;
      assert.ok(samePoint(geometry.n, before.n), JSON.stringify({ label, name, geometry, before }));
      if (name !== cap)
        assert.ok(near(geometry.o.reduce((d, v, i) => d + geometry.n[i] * (v - before.o[i]), 0), 0));
      else assert.ok(near(geometry.o[2], moved));
    }
  }
  f.report.observations.push({ label, start, end, expected: volume, native: read.volume, studio: worker[0].volume,
    sourceFaceNames: read.faces.map(face => face.name), maximumEdgeSurfaceGap: read.check.maximumEdgeSurfaceGap });
  return read;
}

async function edit(index) {
  await f.openFeatureEditor(index, 'offset cap');
  await button('Edit offset', f.editor()).click();
  const panel = hud('Edit Offset face');
  await status(panel, 'preview');
  return panel;
}

async function verifyHistoryHandle(stored, original, index, savedDistance) {
  f.phase = 'open the terminal saved Offset in a head-on view';
  const targetDistance = historyInward ? -4 : 4;
  if (lower || historyInward) {
    const saved = await f.save('saved-offset-before-edit');
    await f.freshOpen(saved.file, stored, 'saved-offset-before-edit-opened');
  }
  if (lower) {
    await button('View cube directions').click();
    await f.page.getByRole('menuitem', { name: 'Bottom', exact: true }).click();
  } else {
    await button('Top', f.page.locator('.views')).click();
  }
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  if (lower) await f.page.waitForFunction(() => Math.abs(window.__studioCamera().pitch + Math.PI / 2 - .0002) < 1e-12);
  const camera = () => f.page.evaluate(() => window.__studioCamera());
  const before = await camera(), panel = await edit(index);
  assert.deepEqual(await camera(), before);
  const group = f.page.locator('g.gizmo-handle[data-handle="d"]');
  assert.equal(Number(await offsetField(panel).inputValue()), savedDistance);
  assert.match(await panel.innerText(), lower ? /Bottom end.*Outward −Z/s : /Top end.*Outward \+Z/s);
  if (historyBaseline) {
    assert.equal(await group.count(), 0);
    await f.snapshot('saved-offset-no-handle');
    await offsetField(panel).fill(String(targetDistance));
    await status(panel, 'preview');
    await button('Apply', panel).click(); await f.changed(stored);
    await native('saved-offset-baseline-typed', await f.doc(), targetDistance, original);
    return;
  }
  const metric = await f.page.evaluate(([z, sign]) => {
    const from = window.__studioScreenOf([10, 5, z]), x = window.__studioScreenOf([11, 5, z]), to = window.__studioScreenOf([10, 5, z + sign]);
    return { from, perMm: Math.hypot(x[0] - from[0], x[1] - from[1]), axisPx: Math.hypot(to[0] - from[0], to[1] - from[1]) };
  }, lower ? [-savedDistance, -1] : [height + savedDistance, 1]);
  assert.ok(metric.axisPx < .2 && metric.perMm > 3, JSON.stringify(metric));
  const point = async () => {
    const box = await group.locator('circle').boundingBox(); assert.ok(box);
    return [box.x + box.width / 2, box.y + box.height / 2];
  };
  const [x, y] = await point(), anchorGapPx = Math.hypot(x - metric.from[0], y - metric.from[1]);
  assert.ok(anchorGapPx < .5, JSON.stringify({ anchorGapPx, metric }));
  const pixels = Math.round(metric.perMm * (targetDistance - savedDistance));
  if (historyInward) {
    await f.page.mouse.move(x, y);
    await f.page.mouse.down();
    await f.page.mouse.move(x, y - Math.round(3 * metric.perMm), { steps: 7 });
    await f.page.mouse.up();
    assert.equal(Number(await offsetField(panel).inputValue()), -.1);
    await status(panel, 'preview');
    await f.same(stored);
    await f.snapshot('saved-offset-inward-guard');
    await offsetField(panel).fill(String(savedDistance));
    await status(panel, 'preview');
  }
  const drag = async (editor, label) => {
    const origin = await point();
    await f.page.mouse.move(...origin); await f.page.mouse.down();
    await f.page.mouse.move(origin[0], origin[1] - pixels, { steps: 7 });
    await f.page.locator('.gizmo-readout').filter({ hasText: historyInward ? /Offset [−-]4 mm/ : /Offset 4 mm/ }).waitFor();
    assert.equal(Number(await offsetField(editor).inputValue()), targetDistance);
    await status(editor, 'preview'); await f.same(stored);
    await f.snapshot(label); await f.page.mouse.up();
    assert.equal(Number(await offsetField(editor).inputValue()), targetDistance);
  };
  await drag(panel, 'saved-offset-drag-held');
  await button('Cancel', panel).click(); await f.same(stored);
  const second = await edit(index);
  const origin = await point();
  await f.page.mouse.move(...origin); await f.page.mouse.down();
  await f.page.mouse.move(origin[0],origin[1]-pixels,{steps:7});
  await status(second,'preview');
  assert.equal(Number(await offsetField(second).inputValue()),targetDistance);
  await button('Cancel',second).press('Enter'); await f.same(stored);
  await f.page.locator(`.history .hs[data-node-index="${index}"]`).press('Enter');
  await f.editor().waitFor();
  await button('Edit offset',f.editor()).press('Enter'); await status(second,'preview');
  await f.page.mouse.move(origin[0],origin[1]-pixels*2,{steps:7});
  await f.page.mouse.up();
  assert.equal(Number(await offsetField(second).inputValue()),savedDistance);
  await f.same(stored);
  await drag(second, 'saved-offset-drag-before-apply');
  await button('Apply', second).click(); await f.changed(stored);
  const accepted = await f.doc();
  assert.deepEqual(accepted, { ...stored, nodes: stored.nodes.map((node, i) => i === index ? { ...node, distance: targetDistance } : node) });
  await native('saved-offset-handle-applied', accepted, targetDistance, original);
  await f.undo(); await f.same(stored); await f.redo(); await f.same(accepted);
  await f.undo(); await f.same(stored);
  const typed = await edit(index);
  await offsetField(typed).fill(String(targetDistance)); await status(typed, 'preview');
  await button('Apply', typed).click(); await f.same(accepted);
  await native('saved-offset-handle-typed', await f.doc(), targetDistance, original);
  const saved = await f.save('saved-offset-handle');
  await f.freshOpen(saved.file, accepted, 'saved-offset-handle-opened');
  await native('saved-offset-handle-reopened', accepted, targetDistance, original);
  await button('Iso', f.page.locator('.views')).click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await f.snapshot('saved-offset-handle-final');
  f.report.observations.push({label:'saved-offset-head-on',...metric,anchorGapPx,dragPixels:pixels,from:savedDistance,to:targetDistance,retiredPointerRefused:true});
}

await f.run(async () => {
  f.phase = `Open tapered rectangular stock and pick its ${lower ? 'lower' : 'upper'} cap`;
  await open(seed, 'tapered-box');
  const original = await native('source-shape', seed, 0);
  await pickCap(lower);
  if (lower) await button('Iso', f.page.locator('.views')).click();
  const end = lower ? 0 : height, direction = lower ? -1 : 1;
  const normalPixels = () => f.page.evaluate(([end, direction]) => {
    const from = window.__studioScreenOf([10, 5, end]), to = window.__studioScreenOf([10, 5, end + direction]);
    return [to[0] - from[0], to[1] - from[1]];
  }, [end, direction]);
  const readCamera = () => f.page.evaluate(() => window.__studioCamera());
  const before = await readCamera(), beforePixels = await normalPixels();
  assert.ok(lower ? Math.hypot(...beforePixels) > 8 : Math.hypot(...beforePixels) < 1);
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.command('Offset face');
  const panel = hud('Offset face');
  await status(panel, 'preview');
  assert.match(await panel.innerText(), lower ? /Bottom end.*Outward −Z/s : /Top end.*Outward \+Z/s);
  const after = await readCamera(), dragPixels = await normalPixels();
  assert.ok(Math.hypot(...dragPixels) > 8);
  if (lower) assert.deepEqual(after, before, 'keep an already usable oblique camera');
  else {
    assert.equal(after.ortho, before.ortho);
    assert.notEqual(after.pitch, before.pitch);
  }
  const arrow = f.page.locator('g.gizmo-handle[data-handle="d"] polygon');
  const head = await arrow.evaluate(polygon => {
    const svg = polygon.closest('svg').getBoundingClientRect(), points = [...polygon.points];
    return [svg.x + points.reduce((sum, p) => sum + p.x, 0) / points.length,
      svg.y + points.reduce((sum, p) => sum + p.y, 0) / points.length];
  });
  await f.page.mouse.move(...head);
  await f.page.mouse.down();
  await f.page.mouse.move(...head.map((value, i) => value + dragPixels[i]), { steps: 6 });
  await f.page.mouse.up();
  assert.equal(await offsetField(panel).inputValue(), '3');
  await status(panel, 'preview');
  await f.same(seed);
  f.report.observations.push({ label: 'offset-distance-handle', lower, before, after, beforePixels, dragPixels, startDistance: 2, endDistance: 3 });
  const outwardDistance = historyInward ? -2 : lower ? 2 : 3;
  if (lower || historyInward) await offsetField(panel).fill(String(outwardDistance));
  await status(panel, 'preview');
  await f.same(seed);
  await f.snapshot('taper-outward-preview');
  await button('Apply', panel).click();
  await f.changed(seed);
  const outward = await f.doc(), index = seed.nodes.length, node = outward.nodes[index];
  assert.equal(outward.nodes.length, index + 1);
  assert.deepEqual(outward.nodes.slice(0, index), seed.nodes);
  assert.equal(node.kind, 'offset-face');
  assert.deepEqual(node.faces, [cap]);
  assert.deepEqual(node.parent, { node: 1, side: 'solid' });
  assert.equal(node.distance, outwardDistance);
  assert.ok(node.sigs?.[cap]);
  await button('Iso', f.page.locator('.views')).click();
  await f.snapshot('taper-outward-applied');
  await native('outward-shape', outward, outwardDistance, original);
  if (historyHandle) { await verifyHistoryHandle(outward, original, index, outwardDistance); return; }
  if (!lower) {
    await f.undo(); await f.same(seed);
    await f.redo(); await f.same(outward);
    const file = await f.save('offset-dragged-cap');
    await f.freshOpen(file.file, outward, 'dragged-cap-opened');
    await native('outward-reopened', outward, outwardDistance, original);
  }

  f.phase = 'Refuse a collapse in History, then move the same cap inwards';
  const history = await edit(index);
  assert.equal(await offsetField(history).inputValue(), String(outwardDistance));
  assert.match(await history.innerText(), lower ? /Bottom end.*Outward −Z/s : /Top end.*Outward \+Z/s);
  const collapse = lower ? -height : 8;
  await offsetField(history).fill(String(collapse));
  await status(history, 'refused');
  assert.equal(await button('Apply', history).isDisabled(), true);
  await history.getByText('Kernel detail', { exact: true }).click();
  assert.match(await history.innerText(), /collapse|closes|cross|span/i);
  await f.same(outward);
  await f.snapshot('taper-collapse-refused');
  await offsetField(history).fill('-2');
  await status(history, 'preview');
  await button('Apply', history).click();
  await f.changed(outward);
  const inward = (await f.snapshot('taper-inward-applied')).doc;
  assert.deepEqual(inward.nodes[index], { ...node, distance: -2 });
  assert.deepEqual(inward.nodes.slice(0, index), seed.nodes);
  await native('inward-shape', inward, -2, original);
  await f.undo();
  await f.same(outward);
  await f.redo();
  await f.same(inward);
  const file = await f.save('offset-drafted-cap');
  await f.freshOpen(file.file, inward, 'taper-file-opened');
  await native('reopened-shape', inward, -2, original);
  const reopened = await edit(index);
  assert.equal(await offsetField(reopened).inputValue(), '-2');
  await button('Cancel', reopened).click();
  await f.same(inward);

  f.phase = 'Refuse an invalid signed native file before replacing the current part';
  const impossible = { ...inward, nodes: inward.nodes.map((feature, i) => i === index ? { ...feature, distance: collapse } : feature) };
  const [invalid] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await invalid.setFiles({ name: 'invalid-taper.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(impossible)) });
  await f.waitToast(/Offset face:.*close a wall.*Your part is unchanged/i);
  await f.same(inward);
  await f.snapshot('invalid-file-retains-part');
  await f.dismissToasts();

  f.phase = 'Verify the straight-right-prism native Offset route';
  const { draft: _draft, ...extrude } = seed.nodes[1];
  const straight = { ...seed, nodes: [seed.nodes[0], extrude] };
  await open(straight, 'straight-box');
  await pickCap();
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.command('Offset face');
  const straightPanel = hud('Offset face');
  await offsetField(straightPanel).fill('2');
  await status(straightPanel, 'preview');
  await button('Apply', straightPanel).click();
  await f.changed(straight);
  const straightOffset = (await f.snapshot('straight-native-offset-applied')).doc;
  assert.deepEqual(straightOffset.nodes.slice(0,index),straight.nodes);
  assert.equal(straightOffset.nodes.length,index+1);
  const straightNode=straightOffset.nodes[index];
  assert.equal(straightNode.kind,'offset-face');
  assert.deepEqual(straightNode.parent,{node:1,side:'solid'});
  assert.deepEqual(straightNode.faces,['n1.top']);
  assert.ok(straightNode.sigs?.['n1.top']);
  assert.equal(straightNode.distance,2);
  assert.ok(near((await f.bodies()).bodies[0].volume, width * depth * (height + 2)));
  f.phase = 'mixed equal offsets keep original cap identity and direction';
  await open(seed, 'mixed-source');
  for (const bottom of [true, false]) {
    await pickCap(bottom); await f.page.evaluate(() => document.activeElement?.blur()); await f.command('Offset face');
    const h = hud('Offset face'); await status(h, 'preview');
    assert.match(await h.innerText(), bottom ? /Bottom end.*Outward −Z/s : /Top end.*Outward \+Z/s);
    await button('Apply', h).click(); await h.waitFor({ state: 'hidden' }); await f.ready();
  }
  const mixed = await f.doc();
  assert.deepEqual(mixed.nodes.slice(2).map(n => [n.faces[0], n.distance]), [['n1.bottom', 2], ['n1.top', 2]]);
  const labels = async () => {
    assert.match(await f.page.locator('.hs[data-node-index="2"]').getAttribute('aria-label'), /Offset face .*Bottom end/);
    assert.match(await f.page.locator('.hs[data-node-index="3"]').getAttribute('aria-label'), /Offset face .*Top end/);
  };
  await labels(); await f.snapshot('mixed-history-labels');
  const mixedEdit = await edit(2); assert.match(await mixedEdit.innerText(), /Bottom end.*Outward −Z/s);
  await offsetField(mixedEdit).fill('-2'); await status(mixedEdit, 'preview'); await button('Apply', mixedEdit).click(); await f.changed(mixed);
  const edited = await f.doc(); assert.deepEqual(edited.nodes[3], mixed.nodes[3]); assert.deepEqual(edited.nodes[2], { ...mixed.nodes[2], distance: -2 });
  const shape = await f.inspect('mixed-cap-shape', edited);
  assert.ok(shape.check.valid, JSON.stringify(shape.check));
  assert.ok(near(shape.volume, sectionVolume(14) - sectionVolume(2), 1e-7));
  assert.equal(Math.min(...shape.point.map(p => p[2])), 2); assert.equal(Math.max(...shape.point.map(p => p[2])), 14);
  await f.undo(); await f.same(mixed); await f.redo(); await f.same(edited); await labels();
  const savedMixed = await f.save('mixed-cap-labels'); await f.freshOpen(savedMixed.file, edited, 'mixed-cap-reopened'); await labels();
  const topEdit = await edit(3); assert.match(await topEdit.innerText(), /Top end.*Outward \+Z/s); await button('Cancel', topEdit).click(); await f.same(edited);

});
