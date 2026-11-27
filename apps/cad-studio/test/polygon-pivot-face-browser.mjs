import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { currentPartRevision, withMcpSession } from './mcp-browser-session.mjs';

const baseline = process.argv.includes('--baseline');
const pins = ['packages/barocss-cad-model/src/engine/pivotStock.ts', 'packages/barocss-cad-model/src/app/pivotFaceCommand.ts',
  'packages/barocss-cad/src/features/prism-wall-offset.ts', 'packages/barocss-cad/src/part/part-face-finish.ts'];
const f = await createFlow({
  name: 'polygon-pivot-face', output: process.argv[2], envFrozen: 'POLYGON_PIVOT_FACE_FROZEN',
  qualification: 'Pivot original triangular and octagonal extrusion walls about exact cap edges.',
  limits: ['Upright straight convex polygon stock and a single selected wall.'], initialFiles: pins, requiredFrozen: pins,
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
  vertices: brep.vertices, volume: mass.volume,
  topologyIds: [brep.faces.map(({ surface, sense, ...face }) => [face, surface.id]),
    brep.edges.map(edge => [edge.id, edge.name, edge.vertices, edge.curve.id]), brep.loops,
    brep.coedges.map(({ pcurve, ...coedge }) => [coedge, pcurve?.id]), brep.shells, brep.bodies],
  edges: brep.edges.map(edge => ({ edge, ends: edge.vertices.map(id => vertices.get(id)),
    uses: brep.coedges.filter(use => use.edge === edge.id).map(use => [use.id, use.sense, brep.loops.find(loop => loop.id === use.loop).face]) })),
}));
`,
});
const models = [
  { id: 'triangle', x: 12, ring: [[0, 0], [24, 0], [6, 16]], area: 192,
    section: d => [[3 * d / 8, d], [24 - 9 * d / 8, d]], volumes: [1690, 2170] },
  { id: 'octagon', x: 10, ring: [[4, 0], [16, 0], [20, 4], [20, 12], [16, 16], [4, 16], [0, 12], [0, 4]], area: 288,
    section: d => [[4 - d, d], [16 + d, d]], volumes: [8240 / 3, 8960 / 3] },
];
const face = 'n1.side0', lower = 'n1.bottom|n1.side0', upper = 'n1.side0|n1.top';
const degree = Math.atan(1 / 5) * 180 / Math.PI;
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const hud = (name = 'Pivot face') => f.page.getByRole('dialog', { name, exact: true });
const angle = name => hud(name).getByLabel('Angle', { exact: true });
const status = (name, text = 'preview') => hud(name).locator('.status').getByText(text, { exact: true }).waitFor();
const near = (a, b, tolerance = 1e-8) => Math.abs(a - b) <= tolerance;
const same = (a, b) => a.every((value, i) => near(value, b[i]));
const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);

function source(ring) {
  return { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 2,
    nodes: [{ kind: 'sketch', id: 'n0', profile: 'polygon', points: ring }, { kind: 'extrude', id: 'n1', sketch: 0, height: 10 }],
    outputs: { b1: { node: 1, side: 'solid' } } };
}

async function pick(point, shifted = false) {
  const pixel = await f.page.evaluate(p => window.__studioScreenOf(p), point);
  if (shifted) await f.page.keyboard.down('Shift');
  try { await f.page.mouse.click(...pixel); }
  finally { if (shifted) await f.page.keyboard.up('Shift'); }
}

async function prove(label, doc, original, model, topFixed, positive = !topFixed) {
  const actual = await f.inspect(label, doc);
  const count = model.ring.length, hinge = topFixed ? upper : lower, signed = positive ? degree : -degree;
  assert.equal(actual.topology.valid, true);
  assert.deepEqual([actual.count, actual.closed, actual.topology.counts], [1, true,
    { bodies: 1, shells: 1, faces: count + 2, loops: count + 2, coedges: 6 * count, edges: 3 * count, vertices: 2 * count }]);
  assert.deepEqual(actual.topologyIds, original.topologyIds);
  assert.deepEqual(actual.edges.find(entry => entry.edge.name === hinge), original.edges.find(entry => entry.edge.name === hinge));
  const retained = original.vertices.filter(vertex => JSON.stringify(vertex) ===
    JSON.stringify(actual.vertices.find(candidate => candidate.id === vertex.id))).length;
  assert.equal(retained, 2 * count - 2);
  for (const z of [0, 10]) {
    const station = (topFixed ? (10 - z) : z) / 5 * (positive ? 1 : -1);
    const wanted = [...model.section(station), ...model.ring.slice(2)];
    for (const [x, y] of wanted) assert.equal(actual.vertices.filter(v => same(v.point, [x, y, z])).length, 1);
  }
  const normal = [0, -5 / Math.sqrt(26), (topFixed === positive ? -1 : 1) / Math.sqrt(26)];
  const planes = new Map(actual.faces);
  for (const [name, before] of original.faces) {
    const after = planes.get(name);
    assert.equal(after.kind, 'plane');
    if (name === face) {
      assert.ok(same(after.n, normal));
      assert.ok(near(dot(normal, after.o), topFixed ? 10 * normal[2] : 0));
    } else {
      assert.ok(same(before.n, after.n));
      assert.ok(near(dot(before.n, before.o), dot(after.n, after.o)));
    }
  }
  const volume = model.volumes[positive ? 0 : 1];
  assert.ok(near(actual.volume, volume));
  assert.ok(near((await f.bodies()).bodies[0].volume, volume));
  assert.deepEqual([doc.nodes[2].hingeEdge, doc.nodes[2].pull], [hinge, topFixed ? '-z' : 'z']);
  assert.ok(near(doc.nodes[2].angle, signed));
  f.report.observations.push({ label, profile: model.id, hinge, volume: actual.volume, retained });
}

await f.run(async () => {
  for (const model of models) {
    const seed = source(model.ring), input = join(f.output, model.id + '-stock.bcad');
    await writeFile(input, JSON.stringify(seed));
    const original = await f.inspect(model.id + '-stock', seed);
    await f.freshOpen(input, seed, model.id + '-original-stock');
    await button('Front', f.page.locator('.views')).click();
    if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
    await f.page.getByTitle('Frame all (F)', { exact: true }).click();
    await f.page.waitForFunction(() => window.__studioCamera().ortho);
    await pick([model.x, 0, 5]);
    await f.page.waitForFunction(() => window.__studioSelection.selection.faces.length === 1);
    await pick([model.x, 0, 0], true);
    await f.page.waitForFunction(() => window.__studioSelection.selection.edges.length === 1);
    await button('Iso', f.page.locator('.views')).click();
    await f.page.evaluate(() => document.activeElement?.blur());
    await f.page.keyboard.press('Space');
    const palette = f.page.getByRole('dialog', { name: 'Command palette', exact: true });
    await palette.locator('input').fill('Pivot face');
    const option = palette.getByRole('option', { name: /^Pivot face/ });
    if (baseline) {
      assert.match(await option.innerText(), /hexagonal wall/);
      await f.same(seed);
      await f.snapshot(model.id + '-baseline-unavailable');
      continue;
    }

    await option.click();
    await angle().fill(String(degree));
    await status();
    await f.page.locator('.gizmo-handle[data-handle="deg"]').waitFor();
    await f.snapshot(model.id + '-positive-preview');
    await button('Apply', hud()).click();
    await f.changed(seed);
    const first = await f.doc();
    await prove(model.id + '-bottom-native', first, original, model, false);

    const history = 'Edit Pivot face';
    await f.openFeatureEditor(2, model.id + ' Pivot face');
    await button('Edit pivot face', f.editor()).click();
    await status(history);
    const edgeSelect = () => hud(history).getByLabel('Fixed edge', { exact: true });
    const choices = await edgeSelect().locator('option').evaluateAll(options => options.map(option => option.value));
    assert.deepEqual(choices.sort(), [lower, upper].sort());
    if (model.id === 'octagon') {
      for (const refused of [24, -32]) {
        await angle(history).fill(String(refused));
        await status(history, 'refused');
        assert.ok(await button('Apply', hud(history)).isDisabled());
        await f.same(first);
        await f.snapshot('octagon-refused-' + refused);
      }
    }
    await angle(history).fill(String(-degree));
    await edgeSelect().selectOption(upper);
    await status(history);
    await f.same(first);
    await f.snapshot(model.id + '-negative-history');
    await button('Apply', hud(history)).click();
    await f.changed(first);
    const changed = await f.doc();
    await prove(model.id + '-top-native', changed, original, model, true);
    await f.undo();
    await f.same(first);
    await f.redo();
    await f.same(changed);
    const saved = await f.save(model.id + '-saved-pivot');
    await f.freshOpen(saved.file, saved.doc, model.id + '-fresh-open');
    await prove(model.id + '-reopened-native', saved.doc, original, model, true);
    await button('Iso', f.page.locator('.views')).click();
    await f.page.getByTitle('Frame all (F)', { exact: true }).click();
    await f.openFeatureEditor(2, model.id + ' reopened Pivot face');
    await button('Edit pivot face', f.editor()).click();
    await status(history);
    assert.equal(await edgeSelect().inputValue(), upper);
    await f.snapshot(model.id + '-reopened-pivot-history');

    await withMcpSession({ app: f.app, output: f.output, clientName: 'polygon-pivot-review' }, input, model.id + '-agent', async call => {
      const expectedRevision = await currentPartRevision(call);
      const proposal = await call('proposals', { action: 'propose', title: 'Pivot the original ' + model.id + ' wall', ops: [{ tool: 'features',
        args: { action: 'command', command: 'pivot-face', faces: [face], edges: [lower], expectedRevision, values: { deg: degree } },
      }] });
      assert.deepEqual([proposal.proposal, proposal.applied], ['P1', false]);
      assert.ok(near(proposal.change.volume, model.volumes[0] - model.area * 10, 0.001));
      assert.deepEqual(JSON.parse(await readFile(input, 'utf8')).nodes, seed.nodes);
    });
    if (model.id === 'octagon') await approveAgentHinge(model, first, original);
  }
});

async function approveAgentHinge(model, first, original) {
  const file = join(f.output, 'octagon-agent-input.bcad');
  await writeFile(file, JSON.stringify(first));
  const proposalId = await withMcpSession({ app: f.app, output: f.output, clientName: 'polygon-pivot-approval' },
    file, 'octagon-hinge-approval', async call => {
      const expectedRevision = await currentPartRevision(call);
      const fields = await call('query', { action: 'edit_fields', index: 2 });
      assert.equal(fields.revision, expectedRevision);
      const choices = fields.fields.find(field => field.key === 'hingeEdge');
      assert.equal(choices.value, lower);
      assert.deepEqual(choices.options.map(option => option.value).sort(), [lower, upper].sort());
      const args = { action: 'edit', index: 2, expectedRevision, values: { hingeEdge: upper } };
      const proposal = await call('proposals', { action: 'propose', title: 'Fix the original top edge', ops: [{ tool: 'features', args }] });
      assert.deepEqual([proposal.proposal, proposal.applied, proposal.change.volume], ['P1', false, undefined]);
      const pending = await readFile(file);
      assert.match((await call('proposals', { action: 'accept', id: proposal.proposal }, true)).error, /user accepts.*studio/i);
      assert.deepEqual(await readFile(file), pending);
      return proposal.proposal;
    });
  const pending = JSON.parse(await readFile(file, 'utf8'));
  assert.deepEqual(pending.nodes, first.nodes);
  await f.freshOpen(file, pending, 'octagon-agent-pending-open');
  await button('Iso', f.page.locator('.views')).click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await button('Chat').first().click();
  const card = f.page.getByRole('listitem', { name: `Proposal ${proposalId}`, exact: true });
  await button('Preview', card).click();
  await button('Hide', card).waitFor();
  await f.same(pending);
  await f.snapshot('octagon-agent-preview');
  await button('Accept', card).click();
  await f.changed(pending);
  const accepted = await f.doc(), approval = accepted.history.at(-1);
  assert.deepEqual([approval.kind, approval.proposal, approval.by.agent], ['accept', proposalId, 'user']);
  await prove('octagon-agent-approved-native', accepted, original, model, true, true);
  await f.undo();
  await f.same(pending);
  await f.redo();
  await f.same(accepted);
  const saved = await f.save('octagon-agent-approved-pivot');
  await f.freshOpen(saved.file, saved.doc, 'octagon-agent-approved-reopened');
  await prove('octagon-agent-reopened-native', saved.doc, original, model, true, true);
}
