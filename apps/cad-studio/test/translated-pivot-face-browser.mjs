import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { currentPartRevision, withMcpSession } from './mcp-browser-session.mjs';

const baseline = process.argv.includes('--baseline');
const pins = ['packages/barocss-cad-model/src/app/pivotFaceCommand.ts', 'packages/barocss-cad-model/src/engine/doc.ts',
  'packages/barocss-cad-model/src/engine/references.ts', 'packages/barocss-cad-model/src/engine/rematch.ts',
  'packages/barocss-cad/src/part/part-face-finish.ts', 'apps/cad-studio/src/ui/NodeEditor.tsx'];
const f = await createFlow({
  name: 'translated-pivot-face', output: process.argv[2], envFrozen: 'TRANSLATED_PIVOT_FACE_FROZEN',
  qualification: 'Select and pivot translated stock, then follow the same hinge through two upstream edits.',
  limits: ['One rectangular extrusion with two authored Move features.'], initialFiles: pins, requiredFrozen: pins,
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep } from '@barocss/cad';
import { partSnapshot } from '@barocss/cad-model/engine/part';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const { outputs } = partSnapshot(doc);
const brep = outputs[0].brep;
const vertices = Object.fromEntries(brep.vertices.map(v => [v.id, v.point]));
console.log(JSON.stringify({ outputs: outputs.length, strict: checkBrep(brep, { strict: true }).valid,
  closed: brep.shells.every(shell => shell.closed),
  topology: [brep.bodies.length, brep.shells.length, brep.faces.length, brep.loops.length, brep.coedges.length, brep.edges.length, brep.vertices.length],
  edges: brep.edges.map(edge => ({ edge, endpoints: edge.vertices.map(id => vertices[id]), uses: brep.coedges.filter(use => use.edge === edge.id)
    .map(use => [use.id, use.sense, brep.faces.find(face => face.loops.includes(use.loop)).id]) })),
  vertices: Object.values(vertices), volume: brepMassProperties(brep, 1).volume }));
`,
});
const stock = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', nextId: 4, parameters: { H: 12 },
  nodes: [
    { kind: 'sketch', id: 'n0', profile: 'rectangle', min: [4, -3], max: [44, 17] },
    { kind: 'extrude', id: 'n1', sketch: 0, from: 6, height: { parameter: 'H' } },
    { kind: 'translate', id: 'n2', parent: { node: 1, side: 'solid' }, offset: [80, -23, 14] },
    { kind: 'translate', id: 'n3', parent: { node: 2, side: 'solid' }, offset: [-5, 3, 2] },
  ], outputs: { b3: { node: 3, side: 'solid' } },
};
const movingFace = 'n1.side0';
const fixedEdge = 'n1.side0|n1.top';
const angle = 12;
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const hud = () => f.page.getByRole('dialog', { name: 'Pivot face', exact: true });
const samePoint = (a, b) => a.every((value, i) => Math.abs(value - b[i]) < 1e-6);
const topology = [1, 1, 6, 6, 24, 12, 8];

async function clickAt(point, shifted = false) {
  const pixel = await f.page.evaluate(world => window.__studioScreenOf(world), point);
  if (shifted) await f.page.keyboard.down('Shift');
  try { await f.page.mouse.click(...pixel); }
  finally { if (shifted) await f.page.keyboard.up('Shift'); }
}

async function prove(label, doc, originalHinge, expectedHeight, expectedMoveZ) {
  const actual = await f.inspect(label, doc);
  assert.deepEqual([actual.outputs, actual.strict, actual.closed, actual.topology], [1, true, true, topology]);
  const hinge = actual.edges.find(entry => entry.edge.name === fixedEdge);
  assert.ok(hinge);
  assert.deepEqual([hinge.edge.id, hinge.edge.curve.id, hinge.edge.vertices, hinge.uses],
    [originalHinge.edge.id, originalHinge.edge.curve.id, originalHinge.edge.vertices, originalHinge.uses]);
  const bottom = 8 + expectedMoveZ, top = bottom + expectedHeight;
  for (const x of [79, 119]) {
    assert.ok(hinge.endpoints.some(point => samePoint(point, [x, -23, top])));
  }
  const inset = expectedHeight * Math.tan(angle * Math.PI / 180);
  for (const x of [79, 119]) {
    for (const point of [[x, -23 + inset, bottom], [x, -3, bottom], [x, -23, top], [x, -3, top]]) {
      assert.ok(actual.vertices.some(vertex => samePoint(vertex, point)), JSON.stringify(point));
    }
  }
  const volume = 40 * expectedHeight * (20 - inset / 2);
  assert.ok(Math.abs(actual.volume - volume) < 1e-6, `${actual.volume} versus ${volume}`);
  return { height: expectedHeight, moveZ: expectedMoveZ, endPoints: hinge.endpoints, volume: actual.volume };
}

await f.run(async () => {
  const file = join(f.output, 'moved-stock.bcad');
  await writeFile(file, JSON.stringify(stock));
  const source = await f.inspect('01-stock-native', stock);
  const hinge = source.edges.find(entry => entry.edge.name === fixedEdge);
  assert.ok(hinge?.endpoints.every(point => point[1] === -23 && point[2] === 34));
  await f.freshOpen(file, stock, '01-native-stock');
  await button('Front', f.page.locator('.views')).click();
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await f.page.waitForFunction(() => window.__studioCamera().ortho);
  await clickAt([99, -23, 28]);
  await f.page.waitForFunction(() => window.__studioSelection.selection.faces.length === 1);
  await clickAt([89, -23, 34], true);
  await f.page.waitForFunction(() => {
    const { faces, edges } = window.__studioSelection.selection;
    return faces.length === 1 && edges.length === 1;
  });
  await button('Iso', f.page.locator('.views')).click();
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.snapshot('02-translated-face-and-edge');
  await f.page.keyboard.press('Space');
  const palette = f.page.getByRole('dialog', { name: 'Command palette', exact: true });
  await palette.locator('input').fill('Pivot face');
  const choice = palette.getByRole('option', { name: /^Pivot face/ });
  if (baseline) {
    assert.match(await choice.innerText(), /an original rectangular extrusion/);
    await f.snapshot('03-baseline-command-refused');
    await f.same(stock);
    f.report.observations.push({ nativeRectangularPrism: true, faceAndEdgeSelected: true, studioUnavailable: true });
    return;
  }
  await choice.click();
  await hud().locator('.status').getByText('preview', { exact: true }).waitFor();
  await hud().getByLabel('Angle', { exact: true }).fill(String(angle));
  await hud().locator('.status').getByText('preview', { exact: true }).waitFor();
  await f.snapshot('03-translated-pivot-preview');
  await button('Apply', hud()).click();
  await f.changed(stock);
  const pivoted = await f.doc(), pivot = pivoted.nodes.at(-1);
  assert.deepEqual([pivot.kind, pivot.parent.node, pivot.faces, pivot.hingeEdge, pivot.angle, pivot.pull],
    ['draft', 3, [movingFace], fixedEdge, angle, '-z']);
  assert.deepEqual(pivoted.nodes.slice(0, 4), stock.nodes);
  const observations = [await prove('04-pivot-native', pivoted, hinge, 12, 14)];

  await f.setParameter('H', 16, '04-height-edited');
  const taller = await f.doc();
  assert.deepEqual([taller.nodes.at(-1).hingeEdge, taller.nodes.at(-1).angle], [fixedEdge, angle]);
  observations.push(await prove('05-taller-native', taller, hinge, 16, 14));
  await f.openFeatureEditor(2, 'first Move');
  await f.editor().getByLabel('ΔZ', { exact: true }).fill('20');
  await f.applyEditor(taller, '05-move-edited');
  const moved = await f.doc();
  assert.deepEqual([moved.nodes[2].offset, moved.nodes[3], moved.nodes.at(-1).hingeEdge, moved.nodes.at(-1).angle],
    [[80, -23, 20], stock.nodes[3], fixedEdge, angle]);
  observations.push(await prove('06-moved-native', moved, hinge, 16, 20));
  await f.undo();
  await f.same(taller);
  await f.redo();
  await f.same(moved);
  const saved = await f.save('moved-pivot');
  await f.freshOpen(saved.file, saved.doc, '06-reopened');
  await button('Iso', f.page.locator('.views')).click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  observations.push(await prove('07-reopened-native', await f.doc(), hinge, 16, 20));
  await f.snapshot('07-reopened-framed');

  const before = await readFile(file);
  await withMcpSession({ app: f.app, output: f.output, clientName: 'barocss-translated-pivot-test' }, file, 'translated-agent', async call => {
    const command = { action: 'command', command: 'pivot-face', faces: [movingFace], edges: [fixedEdge],
      expectedRevision: await currentPartRevision(call), values: { deg: angle } };
    const response = await call('proposals', { action: 'propose', title: 'Pivot the translated stock', ops: [{ tool: 'features', args: command }] });
    assert.deepEqual([response.proposal, response.applied], ['P1', false]);
    assert.ok(Math.abs(response.change.volume - (observations[0].volume - source.volume)) < 0.001);
    const pending = JSON.parse(await readFile(file, 'utf8'));
    assert.deepEqual(pending.nodes, JSON.parse(before).nodes);
  });
  f.report.observations.push({ observations, hingeId: hinge.edge.id, hinge: fixedEdge, finalAngle: angle, translatedAgentProposal: true });
});
