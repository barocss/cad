import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { currentPartRevision, withMcpSession } from './mcp-browser-session.mjs';

const baseline = process.argv.includes('--baseline');
const pins = [
  'apps/cad-studio/test/rounded-cube-area-browser.mjs',
  'apps/cad-studio/src/ui/SelectionInspector.tsx',
  'packages/barocss-cad/src/blend/edge-finish.ts',
  'packages/barocss-cad/src/brep/solid-mass.ts',
  ...(!baseline ? ['packages/barocss-cad/src/brep/spherical-cube-area.ts'] : []),
];
const f = await createFlow({
  name: 'rounded-cube-area', output: process.argv[2], envFrozen: 'ROUNDED_CUBE_AREA_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Approve an existing all-edge spherical Fillet in Studio and measure its exact surface area after reopen.',
  inspectorSource: `
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { brepSurfaceArea, checkOutput, massPropertiesOf, surfaceAreaOf } from '@barocss/cad';
import { partSnapshot } from '@barocss/cad-model/engine/part';
const { outputs: [output] } = partSnapshot(JSON.parse(readFileSync(process.argv[2], 'utf8')));
console.log(JSON.stringify({ report: checkOutput(output), volume: massPropertiesOf(output).volume,
  area: surfaceAreaOf(output), rawArea: brepSurfaceArea(output.brep),
  quadratureArea: brepSurfaceArea(output.brep, { quadratureSegments: 8 }),
  digest: createHash('sha256').update(JSON.stringify(output.brep)).digest('hex') }));
`,
});
const side = 20;
const stock = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 2,
  nodes: [
    { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [side, side] },
    { id: 'n1', kind: 'extrude', sketch: 0, height: side },
  ],
  outputs: { b1: { node: 1, side: 'solid' } },
};
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const card = () => f.page.getByRole('listitem', { name: 'Proposal P1', exact: true });
const relative = (a, b) => Math.abs(a / b - 1);

async function check(label, doc, radius) {
  const core = side - 2 * radius;
  const expected = {
    volume: core ** 3 + 6 * core ** 2 * radius + 3 * Math.PI * core * radius ** 2 + 4 / 3 * Math.PI * radius ** 3,
    area: 6 * core ** 2 + 6 * Math.PI * core * radius + 4 * Math.PI * radius ** 2,
  };
  const native = await f.inspect(label, doc);
  assert.ok(native.report.valid, native.report.issues.join('\n'));
  assert.equal(native.report.counts.faces, 34);
  assert.equal(native.report.topology[0].genus, 0);
  assert.ok(relative(native.volume, expected.volume) < 1e-9);
  assert.ok(relative((await f.bodies()).bodies[0].volume, expected.volume) < 1e-9);
  assert.equal(native.area, native.rawArea);
  if (baseline) {
    assert.ok(relative(native.area, expected.area) > 1e-6);
    assert.equal(native.area, native.quadratureArea);
  } else {
    assert.ok(relative(native.area, expected.area) < 1e-9);
    assert.ok(relative(native.quadratureArea, expected.area) > 1e-9);
  }
  f.report.observations.push({ label, radius, expected, native });
  return native.digest;
}

await f.run(async () => {
  f.phase = 'Propose all twelve current native edges through local MCP';
  const source = join(f.output, 'source-cube.bcad');
  await writeFile(source, JSON.stringify(stock));
  const edges = await withMcpSession({ app: f.app, output: f.output, clientName: f.name }, source, 'rounded-cube', async call => {
    const expectedRevision = await currentPartRevision(call);
    const summary = await call('query', { action: 'summary', body: 'b1' });
    const edges = summary.bodies[0].edges.map(edge => edge.name);
    assert.equal(new Set(edges).size, 12);
    const result = await call('proposals', { action: 'propose', title: 'Round all twelve cube edges', ops: [
      { tool: 'features', args: { action: 'command', command: 'fillet', edges, expectedRevision, values: { radius: 2 } } },
    ] });
    assert.deepEqual([result.proposal, result.applied], ['P1', false]);
    return edges;
  });
  const pending = JSON.parse(await readFile(source, 'utf8'));
  assert.deepEqual(pending.nodes, stock.nodes);
  await f.freshOpen(source, pending, 'cube-with-pending-fillet');
  await button('Chat').first().click();
  await button('Preview', card()).click();
  await button('Hide', card()).waitFor();
  await f.same(pending);
  await f.snapshot('all-edge-fillet-preview');
  await button('Hide', card()).click();
  await button('Preview', card()).click();
  await button('Accept', card()).click();
  await f.changed(pending);
  const approved = await f.doc();
  assert.ok(approved.nodes[2].kind === 'fillet');
  assert.deepEqual([...approved.nodes[2].edges].sort(), edges.sort());
  assert.equal(approved.nodes[2].radius, 2);
  const digest = await check('radius-2', approved, 2);
  await f.snapshot('rounded-cube-approved');
  await f.undo();
  await f.same(pending);
  await f.redo();
  await f.same(approved);
  const saved = await f.save('rounded-cube');
  const reopened = await f.freshOpen(saved.file, approved, 'reopened-rounded-cube');
  assert.equal(await check('radius-2-reopened', reopened.doc, 2), digest);
  if (baseline) return;

  f.phase = 'Edit radius in the reopened part and verify the current surface area';
  await f.openFeatureEditor(2, 'Fillet radius');
  await f.editor().getByLabel('Radius', { exact: true }).fill('2.5');
  const edited = (await f.applyEditor(approved, 'radius-2-5-applied')).doc;
  assert.equal(edited.nodes[2].radius, 2.5);
  const editedDigest = await check('radius-2-5', edited, 2.5);
  const readArea = async () => {
    const { bodies: [{ key }] } = await f.bodies();
    await f.page.locator(`[data-browser-body-key="${key}"]`).click();
    const area = f.page.getByRole('complementary', { name: 'Selection', exact: true })
      .locator('.kv').filter({ hasText: /^Surface area/ });
    await area.waitFor();
    assert.equal((await area.textContent()).replace(/[^0-9]/g, ''), '2135');
  };
  await readArea();
  await f.snapshot('rounded-cube-area-inspector');
  await f.undo();
  await f.same(approved);
  await f.redo();
  await f.same(edited);
  const revised = await f.save('rounded-cube-r2-5');
  const reopenedEdit = await f.freshOpen(revised.file, edited, 'reopened-rounded-cube-r2-5');
  assert.equal(await check('radius-2-5-reopened', reopenedEdit.doc, 2.5), editedDigest);
  await readArea();
  await f.snapshot('reopened-rounded-cube-area-inspector');
});
