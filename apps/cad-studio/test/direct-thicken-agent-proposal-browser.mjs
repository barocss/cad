import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { withMcpSession } from './mcp-browser-session.mjs';

const seed = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nodes: [], outputs: {}, nextId: 0,
  direct: {
    sources: {
      rails: '@model panel {version:0;length-unit:mm;@curve #a {type:nurbs;degree:1;knots:[2,2,4,4];control-points:[[10,-6,3],[50,-6,3]];weights:[1,1];}@curve #b {type:nurbs;degree:1;knots:[2,2,4,4];control-points:[[10,24,3],[50,24,3]];weights:[1,1];}}',
    },
    objects: [{ id: 'a', name: 'Front rail', source: 'rails', geometry: 'a' }, { id: 'b', name: 'Back rail', source: 'rails', geometry: 'b' }],
  },
};
const pins = [
  'apps/cad-studio/test/direct-thicken-agent-proposal-browser.mjs', 'apps/cad-studio/test/mcp-browser-session.mjs',
  'apps/cad-studio/server/cadMcp.ts', 'packages/barocss-cad-model/src/chat/directThickenProposal.ts',
  'packages/barocss-cad-model/src/chat/part/proposals.ts', 'packages/barocss-cad-model/src/app/thickenCommand.ts',
  'packages/barocss-cad-model/src/engine/thicken.ts', 'packages/barocss-cad/src/brep/thicken-solid.ts',
];
const f = await createFlow({
  name: 'direct-thicken-agent-proposal', output: process.argv[2], envFrozen: 'D1628_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Approve a pinned planar Direct Thicken proposal in desktop Studio and check its native solid after Save and fresh Open.',
  limits: ['A 40 × 30 mm planar Ruled sheet, symmetric 3 mm thickness, local MCP L4 and desktop WebGPU.', 'Uses the existing faceted Thicken recipe.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { checkBrep, brepMassProperties } from '@barocss/cad';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
import { directOps, geometryOf } from '@barocss/cad-model/engine/direct';
import { digestOf } from '@barocss/cad-model/util/digest';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const action = JSON.parse(process.argv[3]);
if (action === 'make') {
  console.log(JSON.stringify({ ...doc, direct: directOps.ruledSurface(doc.direct, 'a', 'b') }));
} else {
  const surface = geometryOf(doc.direct, doc.direct.objects.at(-1));
  const { kind, id, ...support } = surface;
  console.log(JSON.stringify(partBreps(doc).map(({ key, brep }) => {
    const points = brep.vertices.map(vertex => vertex.point);
    const bounds = ['min', 'max'].map(which => [0, 1, 2].map(axis => Math[which](...points.map(point => point[axis]))));
    return { key, support, bounds, volume: brepMassProperties(brep, 1).volume, valid: checkBrep(brep, { strict: true }).valid,
      solid: brep.bodies[0]?.kind, faces: brep.faces.length, digest: digestOf(brep) };
  })));
}
`,
});
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const card = () => f.page.getByRole('listitem', { name: 'Proposal P1', exact: true });
const sheet = () => f.page.locator('.ol.direct').filter({ hasText: 'Ruled surface' });
const mcp = (file, label, run) => withMcpSession({ app: f.app, output: f.output, clientName: f.name, autonomy: 4 }, file, label, run);
const near = (got, want) => assert.ok(Math.abs(got - want) < 1e-8, `${got} != ${want}`);
async function checkSolid(label, doc) {
  const native = await f.inspect(label, doc, 'solid');
  assert.equal(native.length, 1);
  const [plate] = native;
  assert.deepEqual([plate.valid, plate.solid], [true, 'solid']);
  const expectedBounds = [[10, -6, 1.5], [50, 24, 4.5]];
  plate.bounds.forEach((corner, i) => corner.forEach((value, j) => near(value, expectedBounds[i][j])));
  near(plate.bounds[1][2] - plate.bounds[0][2], 3);
  near(plate.volume, 40 * 30 * 3);
  assert.deepEqual(doc.nodes.at(-1).surface, plate.support);
  return plate;
}

await f.run(async () => {
  const newContext = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async options => {
    const context = await newContext({ ...options, serviceWorkers: 'block' });
    const origin = new URL(f.server.resolvedUrls.local[0]).origin;
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      return url.origin === origin ? route.continue() : route.abort();
    });
    return context;
  };
  const doc = await f.inspect('input', seed, 'make'), file = join(f.output, 'pending-thicken.bcad');
  const original = Buffer.from(JSON.stringify(doc));
  await writeFile(file, original);
  const pin = await mcp(file, 'proposal', async call => {
    const help = await call('describe', { command: 'direct-thicken' });
    assert.equal(help.command, 'direct-thicken');
    const before = await call('query', { action: 'summary' });
    const [{ id: surface }] = before.direct_surfaces;
    const command = { action: 'command', command: help.command, expectedRevision: before.direct_revision, values: { surface, t: 3, side: 'both' } };
    const propose = args => ({ action: 'propose', title: 'Thicken the planar Ruled sheet', ops: [{ tool: 'features', args }] });
    assert.match((await call('features', command, true)).error, /user approval/i);
    assert.match((await call('proposals', propose({ ...command, expectedRevision: '0'.repeat(64) }), true)).error, /Direct inputs changed/);
    assert.match((await call('proposals', propose({ ...command, values: { ...command.values, t: 0 } }), true)).error, /positive thickness/);
    assert.deepEqual(await readFile(file), original);
    const result = await call('proposals', propose(command));
    assert.deepEqual([result.proposal, result.applied, result.change.volume, result.risk.approval], ['P1', false, 3600, ['Direct surface snapshot']]);
    const pending = await readFile(file);
    assert.match((await call('proposals', { action: 'accept', id: 'P1' }, true)).error, /user's approval.*Direct surface snapshot/i);
    assert.deepEqual(await readFile(file), pending);
    return before.direct_revision;
  });
  const pendingBytes = await readFile(file), pending = JSON.parse(pendingBytes);
  assert.deepEqual([pending.nodes, pending.direct], [doc.nodes, doc.direct]);
  await f.freshOpen(file, pending, '01-pending');
  await button('Chat').first().click();
  await button('Iso').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  f.phase = 'Review the thickened body without writing it to the document';
  await button('Preview', card()).click();
  await card().getByLabel('Volume change').getByText('+3600 mm³', { exact: true }).waitFor();
  await f.same(pending);
  await f.snapshot('02-preview');

  f.phase = 'Hide the original sheet and refuse the now stale proposal';
  await sheet().click();
  await button('Hide', f.page.getByRole('complementary', { name: 'Direct geometry' })).click();
  await f.changed(pending);
  const hidden = await f.doc();
  assert.equal(hidden.direct.objects.at(-1).hidden, true);
  await button('Rebase & preview', card()).click();
  await f.waitToast(/P1 could not be rebased/);
  assert.equal(await button('Preview', card()).isDisabled(), true);
  await f.same(hidden);
  await f.snapshot('03-stale');
  await f.undo();
  await f.same(pending);

  f.phase = 'Approve once, then verify thickness and volume on the native solid after fresh Open';
  await button('Preview', card()).click();
  await card().getByLabel('Volume change').getByText('+3600 mm³', { exact: true }).waitFor();
  await button('Accept', card()).click();
  await f.changed(pending);
  const accepted = await f.doc(), node = accepted.nodes.at(-1);
  assert.deepEqual([node.kind, node.thickness, node.side, accepted.history.at(-1).by.agent], ['thicken', 3, 'both', 'user']);
  assert.deepEqual(accepted.direct, doc.direct);
  const plate = await checkSolid('accepted-native', accepted);
  await f.snapshot('04-approved');
  await f.undo();
  await f.same(pending);
  await f.redo();
  await f.same(accepted);
  const saved = await f.save('approved-thicken');
  await f.freshOpen(saved.file, accepted, '05-reopened');
  assert.deepEqual(await checkSolid('reopened-native', await f.doc()), plate);
  await button('Iso').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await f.snapshot('06-reopened-plate');
  assert.deepEqual(await readFile(file), pendingBytes);
  f.report.observations.push({ pin, thickness: plate.bounds[1][2] - plate.bounds[0][2], volume: plate.volume, bounds: plate.bounds, faces: plate.faces, nativeDigest: plate.digest });
});
