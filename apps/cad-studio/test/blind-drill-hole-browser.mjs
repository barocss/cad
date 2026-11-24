import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const pins = ['apps/cad-studio/test/blind-drill-hole-browser.mjs', 'apps/cad-studio/src/ui/NodeEditor.tsx',
  'packages/barocss-cad-model/src/app/commands.ts', 'packages/barocss-cad-model/src/app/editFields.ts',
  'packages/barocss-cad-model/src/engine/blindDrillHole.ts', 'packages/barocss-cad-model/src/engine/part.ts',
  'packages/barocss-cad-model/src/engine/migrate.ts', 'packages/barocss-cad/src/part/part-blind-drill-hole.ts'];
const f = await createFlow({
  name: 'blind-drill-hole', output: process.argv[2], envFrozen: 'D1913_SOURCE_FROZEN',
  qualification: 'Distinguish the cylindrical depth of a flat-floor Hole from a blind Hole ending in a fixed 118-degree drill point.',
  limits: ['One original upright rectangular extrusion, a named +Z face and one strictly interior circular hole.'],
  initialFiles: pins, requiredFrozen: pins,
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep, faceGeometry } from '@barocss/cad';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const [{ brep }] = partBreps(doc);
const faces = brep.faces.map(face => ({
  name: face.name, geometry: faceGeometry(face),
  loops: face.loops.map(id => brep.loops.find(loop => loop.id === id)!.kind),
}));
console.log(JSON.stringify({ faces, vertices: brep.vertices.map(vertex => vertex.point),
  mass: brepMassProperties(brep, 1), check: checkBrep(brep, { strict: true }) }));
`,
  snapshotExtra: () => ({ section: window.__studioSection() }),
});

const rr = 4;
const tip = rr / Math.tan(59 * Math.PI / 180);
const ref = node => ({ node, side: 'solid' });
const stock = height => ({
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 2,
  nodes: [
    { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [32, 24] },
    { id: 'n1', kind: 'extrude', sketch: 0, height },
  ],
  outputs: { b1: ref(1) },
});
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const hud = () => f.page.getByRole('dialog', { name: 'Hole', exact: true });
const field = (name, scope = hud()) => scope.getByLabel(name, { exact: true });
const status = text => hud().locator('.status').filter({ hasText: new RegExp(`^${text}$`) }).waitFor();
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} versus ${b}`);

async function openStock(height) {
  const doc = stock(height);
  await f.page.getByLabel('Model file', { exact: true }).setInputFiles({
    name: `drill-stock-${height}.bcad`, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)),
  });
  await f.same(doc);
  return doc;
}

async function startHole(height, drill, reuseSelection = false) {
  await button('Top', f.page.locator('.views')).click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  if (!reuseSelection) await f.worldClick([16, 12, height]);
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.page.keyboard.press('h');
  await hud().waitFor();
  await field('Type').selectOption(drill ? 'blind-drill' : 'blind');
  await field('Diameter').fill('8');
  await field(drill ? 'Cylindrical depth' : 'Depth').fill('9');
}

async function applyHole(before) {
  await status('preview');
  await button('Apply', hud()).click();
  await f.changed(before);
  return f.doc();
}

async function inspect(label, doc, height, depth, drill) {
  const { faces, vertices, mass, check } = await f.inspect(label, doc);
  assert.ok(check.valid, check.issues.join('\n'));
  assert.equal(check.topology.length, 1);
  assert.equal(check.topology[0].genus, 0);
  const wall = faces.filter(face => face.geometry.kind === 'cylinder');
  assert.equal(wall.length, 2);
  for (const face of wall) near(face.geometry.r, rr);
  const planeAt = z => faces.filter(({ geometry }) => geometry.kind === 'plane'
    && Math.abs(geometry.n[2]) > 1 - 1e-9 && Math.abs(geometry.o[2] - z) < 1e-8);
  const [top] = planeAt(height), [bottom] = planeAt(0);
  assert.deepEqual(top.loops, ['outer', 'inner']);
  assert.deepEqual(bottom.loops, ['outer']);
  const apex = height - depth - (drill ? tip : 0);
  if (drill) {
    const points = vertices.filter(point => Math.hypot(point[0] - 16, point[1] - 12, point[2] - apex) < 1e-8);
    assert.equal(points.length, 1);
    assert.equal(planeAt(height - depth).length, 0);
    assert.equal(faces.filter(({ name }) => /\.point(?:\b|#)/.test(name)).length, 2);
  } else {
    assert.equal(planeAt(height - depth).length, 1);
  }
  const removed = Math.PI * rr ** 2 * (depth + (drill ? tip / 3 : 0));
  const removedMoment = Math.PI * rr ** 2 * (depth ** 2 / 2 + (drill ? depth * tip / 3 + tip ** 2 / 12 : 0));
  const volume = 32 * 24 * height - removed;
  near(mass.volume, volume);
  near(mass.centroid[2], (32 * 24 * height ** 2 / 2 - height * removed + removedMoment) / volume);
  f.report.observations.push({ label, height, depth, apex, volume: mass.volume, centroid: mass.centroid, counts: check.counts });
}

async function section(label, doc) {
  await button('Section view').click();
  await button('Section across X').click();
  await button('Flip the section').click();
  await button('Right', f.page.locator('.views')).click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await f.page.waitForFunction(() => {
    const state = window.__studioSection(), plane = state?.planes?.[0];
    return state?.exact && plane?.axis === 'x' && plane.offset === -16 && plane.normal[0] === -1;
  });
  await f.ready();
  await f.page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await f.same(doc);
  await f.snapshot(label);
  await button('Section view').click();
}

await f.run(async () => {
  await f.newPage();
  let original = await openStock(20);
  f.phase = 'create the existing flat floor and inspect its section';
  await startHole(20, false);
  const flat = await applyHole(original);
  assert.equal(flat.nodes.at(-1).kind, 'hole');
  await inspect('flat-floor-native', flat, 20, 9, false);
  await section('01-flat-floor-section', flat);
  await f.undo(); await f.same(original);

  f.phase = 'preview the full 118-degree point and commit one feature';
  await startHole(20, true);
  await hud().getByText('11.403 mm including the 118° point', { exact: true }).waitFor();
  assert.equal(await field('Copies').count(), 0);
  await status('preview');
  await f.snapshot('02-drill-point-preview');
  const drilled = await applyHole(original);
  const node = drilled.nodes.at(-1);
  assert.deepEqual([node.kind, node.parent, node.center, node.radius, node.depth, node.face],
    ['blind-drill-hole', ref(1), [16, 12], 4, 9, 'n1.top']);
  assert.deepEqual(drilled.nodes.slice(0, -1), original.nodes);
  await inspect('drill-point-native', drilled, 20, 9, true);
  await section('03-drill-point-section', drilled);

  f.phase = 'edit cylindrical depth and re-open the native file';
  await button('Iso', f.page.locator('.views')).click();
  await f.openFeatureEditor(2, 'drill point depth');
  await field('Cylindrical depth', f.editor()).fill('8');
  await f.editor().getByText('10.403 mm · 118° point', { exact: true }).waitFor();
  await f.snapshot('04-cylindrical-depth-edit');
  await button('Apply', f.editor()).click();
  await f.changed(drilled);
  await f.closeEditor();
  const edited = await f.doc();
  assert.deepEqual(edited.nodes.at(-1), { ...node, depth: 8 });
  await inspect('drill-depth8-native', edited, 20, 8, true);
  await f.undo(); await f.same(drilled);
  await f.redo(); await f.same(edited);
  const saved = await f.save('blind-drill-point');
  const reopened = await f.freshOpen(saved.file, edited, '05-fresh-open-drill-point');
  await inspect('drill-reopened-native', reopened.doc, 20, 8, true);

  f.phase = 'refuse the conical point on thin stock and retain the ordinary flat option';
  original = await openStock(11);
  const history = await Promise.all(['Undo', 'Redo'].map(name => button(name).isEnabled()));
  await startHole(11, true);
  await status('refused');
  const error = hud().locator('.hud-error'), details = error.locator('details:not([open]) > summary');
  if (await details.count()) await details.click();
  assert.match(await error.innerText(), /would reach the bottom/i);
  assert.equal(await button('Apply', hud()).isEnabled(), false);
  await f.same(original);
  assert.deepEqual(await Promise.all(['Undo', 'Redo'].map(name => button(name).isEnabled())), history);
  await f.snapshot('06-thin-stock-refusal');
  await button('Cancel', hud()).click();
  await f.same(original);
  await hud().waitFor({ state: 'hidden' });
  await startHole(11, false, true);
  const thinFlat = await applyHole(original);
  await inspect('thin-flat-native', thinFlat, 11, 9, false);
  await section('07-thin-flat-floor-section', thinFlat);
});
