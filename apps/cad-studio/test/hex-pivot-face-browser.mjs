import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { currentPartRevision, withMcpSession } from './mcp-browser-session.mjs';

const baseline = process.argv.includes('--baseline');
const pins = ['packages/barocss-cad-model/src/engine/pivotStock.ts', 'packages/barocss-cad-model/src/app/pivotFaceCommand.ts',
  'packages/barocss-cad/src/features/prism-wall-offset.ts', 'packages/barocss-cad/src/part/part-face-finish.ts'];
const f = await createFlow({
  name: 'hex-pivot-face', output: process.argv[2], envFrozen: 'HEX_PIVOT_FACE_FROZEN',
  qualification: 'Pivot an oblique native hexagonal wall about either original cap edge.',
  limits: ['One upright six-wall convex solid and one selected planar wall.'], initialFiles: pins, requiredFrozen: pins,
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep, faceGeometry } from '@barocss/cad';
import { partSnapshot } from '@barocss/cad-model/engine/part';
const { outputs } = partSnapshot(JSON.parse(readFileSync(process.argv[2], 'utf8')));
const brep = outputs[0].brep, mass = brepMassProperties(brep, 1);
const vertices = new Map(brep.vertices.map(vertex => [vertex.id, vertex]));
console.log(JSON.stringify({ count: outputs.length, topology: checkBrep(brep, { strict: true }),
  closed: brep.shells.length === 1 && brep.shells[0].closed,
  faces: brep.faces.map(face => [face.name, faceGeometry(face)]),
  vertices: brep.vertices, volume: mass.volume, centroid: mass.centroid,
  topologyIds: [brep.faces.map(({ surface, sense, ...face }) => [face, surface.id]),
    brep.edges.map(edge => [edge.id, edge.name, edge.vertices, edge.curve.id]), brep.loops,
    brep.coedges.map(({ pcurve, ...coedge }) => [coedge, pcurve?.id]), brep.shells, brep.bodies],
  edges: brep.edges.map(edge => ({ edge, ends: edge.vertices.map(id => vertices.get(id)),
    uses: brep.coedges.filter(use => use.edge === edge.id).map(use => [use.id, use.sense, brep.loops.find(loop => loop.id === use.loop).face]) })),
}));
`,
});
const ring = [[0, 0], [18, 0], [24, 8], [18, 16], [0, 16], [-6, 8]];
const seed = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 2,
  nodes: [{ kind: 'sketch', id: 'n0', profile: 'polygon', points: ring }, { kind: 'extrude', id: 'n1', sketch: 0, height: 10 }],
  outputs: { b1: { node: 1, side: 'solid' } },
};
const face = 'n1.side1', lower = 'n1.bottom|n1.side1', upper = 'n1.side1|n1.top';
const degree = Math.atan(1 / 5) * 180 / Math.PI;
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const hud = (name = 'Pivot face') => f.page.getByRole('dialog', { name, exact: true });
const angle = name => hud(name).getByLabel('Angle', { exact: true });
const preview = (name, text = 'preview') => hud(name).locator('.status').getByText(text, { exact: true }).waitFor();
const near = (a, b, tolerance = 1e-8) => Math.abs(a - b) <= tolerance;
const same = (a, b) => a.every((value, i) => near(value, b[i]));
const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);

async function click(point, shifted = false) {
  const pixel = await f.page.evaluate(p => window.__studioScreenOf(p), point);
  if (shifted) await f.page.keyboard.down('Shift');
  try { await f.page.mouse.click(...pixel); }
  finally { if (shifted) await f.page.keyboard.up('Shift'); }
}

async function prove(label, doc, original, upperFixed = false, positive = true) {
  const actual = await f.inspect(label, doc);
  assert.equal(actual.topology.valid, true);
  assert.deepEqual([actual.count, actual.closed, actual.topology.counts], [1, true,
    { bodies: 1, shells: 1, faces: 8, loops: 8, coedges: 36, edges: 18, vertices: 12 }]);
  assert.deepEqual(actual.topologyIds, original.topologyIds);
  const hinge = upperFixed ? upper : lower;
  assert.deepEqual(actual.edges.find(entry => entry.edge.name === hinge), original.edges.find(entry => entry.edge.name === hinge));
  let retained = 0;
  for (const vertex of original.vertices) {
    const actualVertex = actual.vertices.find(candidate => candidate.id === vertex.id);
    if (JSON.stringify(actualVertex) === JSON.stringify(vertex)) retained++;
  }
  assert.equal(retained, 10);
  for (const z of [0, 10]) {
    const station = (upperFixed ? 10 - z : z) * (positive ? 1 : -1);
    const wanted = ring.map(([x, y], i) => i === 1 ? [x - station / 4, y, z]
      : i === 2 ? [x - station / 8, y + station / 6, z] : [x, y, z]);
    for (const point of wanted) assert.equal(actual.vertices.filter(v => same(v.point, point)).length, 1, JSON.stringify(point));
  }
  const planes = new Map(actual.faces);
  for (const [name, before] of original.faces) {
    const after = planes.get(name);
    assert.equal(after.kind, 'plane');
    if (name === face) {
      const length = Math.sqrt(26), signedZ = (upperFixed === positive ? -1 : 1);
      const expected = [4 / length, -3 / length, signedZ / length];
      assert.ok(same(after.n, expected));
      assert.ok(near(dot(expected, after.o), (72 + signedZ * (upperFixed ? 10 : 0)) / length));
    } else {
      assert.ok(same(before.n, after.n));
      assert.ok(near(dot(before.n, before.o), dot(after.n, after.o)));
    }
  }
  const volume = (positive ? 67195 : 70795) / 18;
  assert.ok(near(actual.volume, volume));
  assert.ok(near((await f.bodies()).bodies[0].volume, volume));
  if (positive) {
    const expectedZ = 133065 / 26878;
    assert.ok(same(actual.centroid, [1865271 / 215024, 1307299 / 161268, upperFixed ? 10 - expectedZ : expectedZ]));
  }
  f.report.observations.push({ label, hinge, volume: actual.volume, centroid: actual.centroid, retained });
}

await f.run(async () => {
  const stockFile = join(f.output, 'hexagonal-pivot-stock.bcad');
  await writeFile(stockFile, JSON.stringify(seed));
  const original = await f.inspect('01-original-native', seed);
  await f.freshOpen(stockFile, seed, '01-authored-hexagonal-stock');
  await button('Right', f.page.locator('.views')).click();
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await f.page.waitForFunction(() => window.__studioCamera().ortho);
  await click([21, 4, 5]);
  await f.page.waitForFunction(() => window.__studioSelection.selection.faces.length === 1);
  await click([21, 4, 0], true);
  await f.page.waitForFunction(() => window.__studioSelection.selection.edges.length === 1);
  await button('Iso', f.page.locator('.views')).click();
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.page.keyboard.press('Space');
  const palette = f.page.getByRole('dialog', { name: 'Command palette', exact: true });
  await palette.locator('input').fill('Pivot face');
  const choice = palette.getByRole('option', { name: /^Pivot face/ });
  if (baseline) {
    assert.match(await choice.innerText(), /rectangular extrusion/);
    await f.same(seed);
    await f.snapshot('02-baseline-hex-pivot-unavailable');
    return;
  }

  await choice.click();
  await angle().fill(String(degree));
  await preview();
  await f.page.locator('.gizmo-handle[data-handle="deg"]').waitFor();
  await f.snapshot('02-bottom-hinge-preview');
  await button('Cancel', hud()).click();
  await hud().waitFor({ state: 'hidden' });
  await f.same(seed);
  await f.command('Pivot face');
  await angle().fill(String(degree));
  await preview();
  await button('Apply', hud()).click();
  await f.changed(seed);
  const first = await f.doc();
  assert.deepEqual([first.nodes[2].faces, first.nodes[2].hingeEdge, first.nodes[2].pull], [[face], lower, 'z']);
  await prove('03-bottom-hinge-native', first, original);

  const history = 'Edit Pivot face';
  await f.openFeatureEditor(2, 'hexagonal Pivot face');
  await button('Edit pivot face', f.editor()).click();
  await preview(history);
  const fixed = () => hud(history).getByLabel('Fixed edge', { exact: true });
  const options = await fixed().locator('option').evaluateAll(items => items.map(item => item.value));
  assert.deepEqual(options.sort(), [lower, upper].sort());
  await angle(history).fill('44');
  await preview(history, 'refused');
  assert.equal(await button('Apply', hud(history)).isEnabled(), false);
  await f.same(first);
  await f.snapshot('03-collapse-refusal');

  await angle(history).fill(String(-degree));
  await fixed().selectOption(upper);
  await preview(history);
  await f.same(first);
  await f.snapshot('04-upper-hinge-negative-preview');
  await button('Apply', hud(history)).click();
  await f.changed(first);
  const revised = await f.doc();
  assert.deepEqual([revised.nodes.length, revised.nodes[2].id, revised.nodes[2].faces, revised.nodes[2].hingeEdge, revised.nodes[2].pull],
    [3, first.nodes[2].id, [face], upper, '-z']);
  await prove('05-upper-hinge-native', revised, original, true, false);
  await f.undo();
  await f.same(first);
  await f.redo();
  await f.same(revised);

  const saved = await f.save('hexagonal-hinge-native');
  await f.freshOpen(saved.file, saved.doc, '05-reopened-native-file');
  await prove('06-reopened-native', saved.doc, original, true, false);
  await button('Iso', f.page.locator('.views')).click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await f.openFeatureEditor(2, 'reopened hexagonal Pivot face');
  await button('Edit pivot face', f.editor()).click();
  await preview(history);
  assert.equal(await fixed().inputValue(), upper);
  await f.snapshot('06-reopened-hexagonal-pivot-history');

  await withMcpSession({ app: f.app, output: f.output, clientName: 'hexagonal-pivot-review' }, stockFile, 'hex-pivot-agent', async call => {
    const expectedRevision = await currentPartRevision(call);
    const propose = edge => ({ action: 'propose', title: 'Pivot the original hexagonal wall', ops: [{ tool: 'features',
      args: { action: 'command', command: 'pivot-face', faces: [face], edges: [edge], expectedRevision, values: { deg: degree } },
    }] });
    const refused = await call('proposals', propose('n1.side0|n1.side1'), true);
    assert.match(JSON.stringify(refused), /edge on that face|cap edge/i);
    const staged = await call('proposals', propose(lower));
    assert.deepEqual([staged.proposal, staged.applied], ['P1', false]);
    assert.ok(near(staged.change.volume, 67195 / 18 - 3840, 0.001));
    assert.deepEqual(JSON.parse(await readFile(stockFile, 'utf8')).nodes, seed.nodes);
  });
});
