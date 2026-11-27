import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { currentPartRevision, withMcpSession } from './mcp-browser-session.mjs';
import { clickModelCommand } from './model-rail-helper.mjs';

const baseline = process.argv.includes('--baseline');
const pins = ['packages/barocss-cad-model/src/engine/rematch.ts', 'packages/barocss-cad-model/src/engine/references.ts',
  'packages/barocss-cad/src/part/split-topology-evolution.ts', 'apps/cad-studio/src/files/documentFile.ts'];
const f = await createFlow({
  name: 'split-original-face-reference', output: process.argv[2], envFrozen: 'SPLIT_ORIGINAL_FACE_REFERENCE_FROZEN',
  qualification: 'An original stock face on a selected Split output stays bound during Shell edits and native Open.',
  limits: ['A 24×16×10 mm rectangular extrusion, one coordinate-plane Split and one uniform Shell.'],
  initialFiles: pins, requiredFrozen: pins,
  extraFrozen: baseline ? [] : ['packages/barocss-cad-model/src/engine/splitShellFace.ts'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { partSnapshot } from '@barocss/cad-model/engine/part';
import { checkBrep, faceGeometry, massPropertiesOf, splitTopologyEvolutionOf, resolveSplitTopologySource } from '@barocss/cad';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const prefix = { ...doc, nodes: doc.nodes.slice(0, 3), outputs: { b2_negative: { node: 2, side: 'negative' }, b2_positive: { node: 2, side: 'positive' } } };
const original = partSnapshot(prefix), receipt = splitTopologyEvolutionOf(original, 'n2');
const source = receipt.sources.find(source => source.kind === 'face' && source.name === 'n1.bottom');
const resolved = resolveSplitTopologySource(receipt, source, 'positive');
const positive = original.outputs.find(body => body.id === 'n2/1');
const newCap = positive.brep.faces.find(face => face.name === 'n2.cut.bottom');
let bodies, refusal;
try {
  bodies = partSnapshot(doc).outputs.map(body => {
    const { centroid, volume } = massPropertiesOf(body);
    return { id: body.id, strict: checkBrep(body.brep, { strict: true }).valid, centroid, volume };
  });
} catch (error) {
  refusal = { code: error.code, feature: error.feature, message: error.message };
}
console.log(JSON.stringify({ bodies, refusal, resolved, newCap: newCap && { id: newCap.id, support: faceGeometry(newCap) } }));
`,
});
const start = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 3,
  nodes: [{ kind: 'sketch', id: 'n0', profile: 'rectangle', min: [0, 0], max: [24, 16] },
    { kind: 'extrude', id: 'n1', sketch: 0, height: 10 },
    { kind: 'split', id: 'n2', parent: { node: 1, side: 'solid' }, axis: 'x', at: 9 }],
  outputs: { b2_negative: { node: 2, side: 'negative' }, b2_positive: { node: 2, side: 'positive' } },
};
const opening = 'n1.bottom', generated = 'n2.cut.bottom';
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const at = () => f.editor().getByRole('spinbutton', { name: 'At', exact: true });
const near = (a, b) => assert.ok(Number.isFinite(a) && Math.abs(a - b) < 1e-8, `${a} versus ${b}`);

async function prove(label, doc, x) {
  const native = await f.inspect(label, doc);
  const node = doc.nodes[3];
  assert.deepEqual([node.kind, node.parent, node.open, node.suppressed, node.rematched],
    ['shell', { node: 2, side: 'positive' }, [opening], undefined, undefined]);
  assert.ok(node.sigs?.[opening]);
  assert.deepEqual([native.resolved.status, native.resolved.image.name], ['unique', opening]);
  const length = 24 - x, outer = length * 16 * 10, inner = (length - 4) * 12 * 8;
  const volume = outer - inner, centre = [(x + 24) / 2, 8, (outer * 5 - inner * 4) / volume];
  const body = native.bodies.find(body => body.id === 'n3');
  assert.ok(body.strict);
  for (const result of [body, (await f.bodies()).bodies.find(body => body.key === 'b3')]) {
    near(result.volume, volume);
    centre.forEach((value, axis) => near(value, result.centroid[axis]));
  }
  f.report.observations.push({ label, x, volume, centre, openingId: native.resolved.image.id });
  return native.resolved.image.id;
}

await f.run(async () => {
  const input = join(f.output, 'split-stock.bcad');
  await writeFile(input, JSON.stringify(start));
  await f.freshOpen(input, start, 'original-split');
  await button('View cube directions').click();
  await f.page.getByRole('menuitem', { name: 'Bottom', exact: true }).click();
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  const filter = button('Selection filter');
  for (let attempt = 0; attempt < 6 && !(await filter.innerText()).includes('Faces'); attempt++) await filter.click();
  assert.match(await filter.innerText(), /Faces/);
  const point = await f.page.evaluate(point => window.__studioScreenOf(point), [17, 8, 0]);
  await f.page.mouse.click(...point);
  await f.page.waitForFunction(() => window.__studioSelection.selection.faces.length === 1);
  await clickModelCommand(f.page, 'Modify', 'Shell');
  const hud = f.page.getByRole('dialog', { name: 'Shell', exact: true });
  await hud.locator('.status').getByText('preview', { exact: true }).waitFor();
  await f.snapshot('original-face-shell-preview');
  await button('Apply', hud).click();
  await f.changed(start);
  const authored = await f.doc();
  const firstFaceId = await prove('original-shell', authored, 9);

  await f.openFeatureEditor(2, 'valid Split plane edit');
  await at().fill('12');
  await f.applyEditor(authored, 'valid-split-plane-edit');
  const edited = await f.doc();
  await prove('edited-shell', edited, 12);

  await f.openFeatureEditor(2, 'then remove the original opening');
  await f.editor().getByLabel('Normal', { exact: true }).selectOption('z');
  await at().fill('4');
  await button('Apply', f.editor()).click();
  await f.editor().locator('.hud-error').waitFor();
  await f.same(edited);
  await f.snapshot('live-source-face-refused');
  await f.closeEditor();
  await f.undo();
  await f.same(authored);
  await f.redo();
  await f.same(edited);

  const saved = await f.save('split-original-face-shell');
  await f.newPage();
  await f.openFile(saved.file, 4);
  const reopened = await f.snapshot('fresh-open-valid-shell');
  assert.deepEqual(reopened.doc, saved.doc);
  await prove('reopened-valid-shell', saved.doc, 12);
  const agentFile = join(f.output, 'agent-shell.bcad');
  await writeFile(agentFile, JSON.stringify(edited));
  await withMcpSession({ app: f.app, output: f.output, clientName: 'split-original-face-reference' }, agentFile, 'agent-reference', async call => {
    const expectedRevision = await currentPartRevision(call);
    const outcome = await call('proposals', { action: 'propose', title: 'Turn the Split plane', ops: [{ tool: 'features',
      args: { action: 'edit', index: 2, expectedRevision, values: { axis: 'z', at: 4 } },
    }] }, !baseline);
    if (baseline) assert.deepEqual([outcome.proposal, outcome.applied], ['P1', false]);
    else assert.match(JSON.stringify(outcome), /n1\.bottom/);
    assert.deepEqual(JSON.parse(await readFile(agentFile, 'utf8')).nodes, edited.nodes);
  });

  const stale = structuredClone(edited);
  Object.assign(stale.nodes[2], { axis: 'z', at: 4 });
  const original = await f.inspect('stale-file-source', stale);
  assert.deepEqual([original.resolved.status, original.refusal.code, original.refusal.feature], ['deleted', 'SELECTION', 'n3']);
  assert.equal(original.newCap.id, firstFaceId, 'The generated cap can reuse the old transient face ID.');
  const file = join(f.output, 'original-face-missing.bcad');
  await writeFile(file, JSON.stringify(stale));
  await f.newPage();
  await f.openFile(file, 4);
  await f.page.waitForFunction(() => {
    const node = window.__studioDoc?.nodes?.[3];
    return !!(node?.held || node?.rematched);
  });
  await button('Iso', f.page.locator('.views')).click();
  const cold = await f.snapshot('cold-open-original-face-check');
  assert.deepEqual(cold.doc.nodes.slice(0, 3), stale.nodes.slice(0, 3));
  const shell = cold.doc.nodes[3];
  if (baseline) {
    assert.deepEqual([shell.open, shell.rematched?.[generated], shell.suppressed], [[generated], opening, undefined]);
    const replaced = await f.inspect('baseline-wrong-shell', cold.doc);
    near(replaced.bodies.find(body => body.id === 'n3').volume, 1344);
    near(replaced.bodies.find(body => body.id === 'n3').centroid[2], 54 / 7);
  } else {
    assert.deepEqual([shell.open, shell.rematched, shell.suppressed], [[opening], undefined, true]);
    assert.match(shell.held, /n1\.bottom/);
    const held = await f.inspect('held-native-shell', cold.doc);
    assert.ok(held.bodies.every(body => body.strict));
    near(held.bodies.reduce((sum, body) => sum + body.volume, 0), 3840);
  }
});
