import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { currentPartRevision, withMcpSession } from './mcp-browser-session.mjs';

const baseline = process.argv.includes('--baseline');
const cuboid = process.argv.includes('--cuboid');
const partName = cuboid ? 'rounded-cuboid' : 'rounded-cube';
const agentArea = process.argv.includes('--agent-area');
const agentAreaBaseline = process.argv.includes('--agent-area-baseline');
const pins = [
  'apps/cad-studio/test/rounded-cube-area-browser.mjs',
  'apps/cad-studio/src/ui/SelectionInspector.tsx',
  'packages/barocss-cad/src/blend/edge-finish.ts',
  'packages/barocss-cad/src/brep/solid-mass.ts',
  ...(!baseline ? ['packages/barocss-cad/src/brep/spherical-box-area.ts'] : []),
  ...(agentArea || agentAreaBaseline ? [
    'packages/barocss-cad-model/src/chat/part/query.ts',
    'packages/barocss-cad-model/src/chat/contract.ts',
    'packages/barocss-cad-model/src/chat/tools-v2.json',
  ] : []),
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
// This height puts the reference R2 cuboid just below the inspector's whole-mm² rounding boundary.
const dimensions = cuboid ? [40, 30, 20.0004] : [20, 20, 20];
const [width, depth, height] = dimensions;
const stock = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 2,
  nodes: [
    { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [width, depth] },
    { id: 'n1', kind: 'extrude', sketch: 0, height },
  ],
  outputs: { b1: { node: 1, side: 'solid' } },
};
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const card = () => f.page.getByRole('listitem', { name: 'Proposal P1', exact: true });
const relative = (a, b) => Math.abs(a / b - 1);

function measures(radius) {
  const [a, b, c] = dimensions.map(length => length - 2 * radius);
  const faces = a * b + a * c + b * c, edges = a + b + c;
  return {
    volume: a * b * c + 2 * faces * radius + Math.PI * edges * radius ** 2 + 4 / 3 * Math.PI * radius ** 3,
    area: 2 * faces + 2 * Math.PI * edges * radius + 4 * Math.PI * radius ** 2,
  };
}

async function check(label, doc, radius) {
  const expected = measures(radius);
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

async function checkAgentArea(file, radius, staleRevision) {
  const original = await readFile(file);
  const expected = measures(radius).area;
  const receipt = await withMcpSession({ app: f.app, output: f.output, clientName: f.name }, file, `area-${radius}`, async call => {
    const expectedRevision = await currentPartRevision(call);
    const help = await call('describe', { tool: 'query', action: 'mass' });
    const compact = await call('query', { action: 'mass' });
    const body = compact.bodies[0];
    assert.equal(body.area, Number(expected.toFixed(3)));
    const request = { action: 'mass', bodies: [body.body], areaPrecision: 'full', expectedRevision };
    if (agentAreaBaseline) {
      assert.equal(help.input.properties.areaPrecision, undefined);
      assert.ok(relative(body.area, expected) > 1e-9);
      const refused = await call('query', request, true);
      assert.match(refused.error, /areaPrecision|expectedRevision/i);
      return { expectedRevision, compact: body.area, refused };
    }
    assert.deepEqual(help.input.properties.areaPrecision.enum, ['full']);
    const missing = await call('query', { ...request, expectedRevision: undefined }, true);
    assert.equal(missing.code, 'MASS_INPUT');
    if (staleRevision) {
      assert.notEqual(staleRevision, expectedRevision);
      const stale = await call('query', { ...request, expectedRevision: staleRevision }, true);
      assert.deepEqual([stale.code, stale.revision], ['MASS_STALE', expectedRevision]);
      assert.equal(stale.bodies, undefined);
    }
    const native = await call('query', request);
    assert.equal(native.revision, expectedRevision);
    assert.ok(relative(native.bodies[0].area, expected) < 1e-9);
    assert.deepEqual(native.bodies[0], { ...body, area: native.bodies[0].area, area_basis: 'native surfaces' });
    return { expectedRevision, compact: body.area, native: native.bodies[0].area };
  });
  assert.deepEqual(await readFile(file), original);
  f.report.observations.push({ radius, agent: receipt });
  return receipt.expectedRevision;
}

async function readArea(expected) {
  const area = f.page.getByRole('complementary', { name: 'Selection', exact: true })
    .locator('.kv').filter({ hasText: /^Surface area/ });
  if (!(await area.isVisible())) {
    const { bodies: [{ key }] } = await f.bodies();
    await f.page.locator(`[data-browser-body-key="${key}"]`).click();
  }
  await area.waitFor();
  assert.equal((await area.textContent()).replace(/[^0-9]/g, ''), String(Math.round(expected)));
}

await f.run(async () => {
  f.phase = 'Propose all twelve current native edges through local MCP';
  const source = join(f.output, partName + '-stock.bcad');
  await writeFile(source, JSON.stringify(stock));
  const edges = await withMcpSession({ app: f.app, output: f.output, clientName: f.name }, source, partName, async call => {
    const expectedRevision = await currentPartRevision(call);
    const summary = await call('query', { action: 'summary', body: 'b1' });
    const edges = summary.bodies[0].edges.map(edge => edge.name);
    assert.equal(new Set(edges).size, 12);
    const result = await call('proposals', { action: 'propose', title: 'Round all twelve stock edges', ops: [
      { tool: 'features', args: { action: 'command', command: 'fillet', edges, expectedRevision, values: { radius: 2 } } },
    ] });
    assert.deepEqual([result.proposal, result.applied], ['P1', false]);
    return edges;
  });
  const pending = JSON.parse(await readFile(source, 'utf8'));
  assert.deepEqual(pending.nodes, stock.nodes);
  await f.freshOpen(source, pending, partName + '-pending-fillet');
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
  await f.snapshot(partName + '-approved');
  await f.undo();
  await f.same(pending);
  await f.redo();
  await f.same(approved);
  const saved = await f.save(partName);
  const reopened = await f.freshOpen(saved.file, approved, 'reopened-' + partName);
  assert.equal(await check('radius-2-reopened', reopened.doc, 2), digest);
  if (cuboid) {
    await readArea(baseline ? 4887 : measures(2).area);
    await f.snapshot(partName + '-r2-inspector');
  }
  if (baseline) return;
  const firstRevision = agentArea || agentAreaBaseline ? await checkAgentArea(saved.file, 2) : undefined;

  f.phase = 'Edit radius in the reopened part and verify the current surface area';
  await f.openFeatureEditor(2, 'Fillet radius');
  await f.editor().getByLabel('Radius', { exact: true }).fill('2.5');
  const edited = (await f.applyEditor(approved, 'radius-2-5-applied')).doc;
  assert.equal(edited.nodes[2].radius, 2.5);
  const editedDigest = await check('radius-2-5', edited, 2.5);
  await readArea(measures(2.5).area);
  await f.snapshot(partName + '-area-inspector');
  await f.undo();
  await f.same(approved);
  await f.redo();
  await f.same(edited);
  const revised = await f.save(partName + '-r2-5');
  const reopenedEdit = await f.freshOpen(revised.file, edited, 'reopened-' + partName + '-r2-5');
  assert.equal(await check('radius-2-5-reopened', reopenedEdit.doc, 2.5), editedDigest);
  if (firstRevision) await checkAgentArea(revised.file, 2.5, firstRevision);
  await readArea(measures(2.5).area);
  await f.snapshot('reopened-' + partName + '-area-inspector');
});
