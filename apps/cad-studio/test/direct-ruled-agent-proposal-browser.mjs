import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow, sha256 } from './flow-helper.mjs';
import { withMcpSession } from './mcp-browser-session.mjs';

const straight = [[10, 10, 0], [40, 10, 6]];
const cubic = [[10, 30, 3], [18, 37, 12], [32, 25, -3], [40, 30, 9]];
function source(id, points) {
  const knots = [...points.map(() => 2), ...points.map(() => 4)];
  return `@model rails {version:0;length-unit:mm;@curve #${id} {type:nurbs;degree:${points.length - 1};knots:[${knots}];control-points:${JSON.stringify(points)};weights:[${points.map(() => 1)}];}}`;
}
const input = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nodes: [], outputs: {}, nextId: 0,
  direct: {
    sources: { a: source('straight', straight), b: source('crown', cubic) },
    objects: [{ id: 'a', name: 'Straight rail', source: 'a', geometry: 'straight' },
      { id: 'b', name: 'Crown rail', source: 'b', geometry: 'crown' }],
  },
};
const pins = [
  'apps/cad-studio/test/direct-ruled-agent-proposal-browser.mjs', 'apps/cad-studio/test/mcp-browser-session.mjs',
  'apps/cad-studio/scripts/cad-mcp.mjs', 'apps/cad-studio/server/cadMcp.ts',
  'packages/barocss-cad-model/src/chat/directRuledProposal.ts', 'packages/barocss-cad-model/src/chat/tools.ts',
  'packages/barocss-cad-model/src/chat/part/proposals.ts', 'packages/barocss-cad-model/src/chat/proposals.ts',
  'packages/barocss-cad-model/src/engine/direct.ts',
];
const f = await createFlow({
  name: 'direct-ruled-agent-proposal', output: process.argv[2], envFrozen: 'D1625_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Review and approve a revision-pinned native Direct Ruled surface from local MCP in desktop Studio.',
  limits: ['One original straight rail and one cubic rail. Desktop WebGPU and local autonomy L4.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { evaluateSurface } from '@barocss/cad';
import { geometryOf } from '@barocss/cad-model/engine/direct';
const { direct } = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const object = direct.objects.at(-1), surface = geometryOf(direct, object);
if (surface.kind !== 'surface') throw Error('Expected a native surface');
const samples = Array.from({ length: 17 }, (_, i) =>
  Array.from({ length: 9 }, (_, j) => evaluateSurface(surface, 2 + i / 8, j / 8)));
console.log(JSON.stringify({ object, surface, samples }));
`,
});
const title = 'Join the Straight and Crown rails with a Ruled surface';
const card = () => f.page.getByRole('listitem', { name: 'Proposal P1', exact: true });
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const waitForSheets = count => f.page.waitForFunction(count => (window.__studioProposalOverlay?.()?.directSheets ?? 0) === count, count);
const mcp = (file, label, run) => withMcpSession({ app: f.app, output: f.output, clientName: f.name, autonomy: 4 }, file, label, run);
const shapeRow = name => f.page.locator('.ol.direct').filter({ hasText: name });

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

  f.phase = 'Local MCP creates a private candidate and refuses direct application at L4';
  const file = join(f.output, 'pending.bcad'), original = Buffer.from(JSON.stringify(input));
  await writeFile(file, original);
  const revision = await mcp(file, 'propose', async call => {
    const help = await call('describe', { command: 'direct-ruled' });
    assert.match(help.hint, /only inside proposals.propose/);
    const before = await call('query', { action: 'summary' });
    assert.deepEqual(before.direct_curves.map(curve => curve.id), ['a', 'b']);
    const command = { action: 'command', command: help.command, values: { first: 'a', second: 'b' }, expectedRevision: before.direct_revision };
    const op = args => ({ tool: 'features', args });
    const propose = args => ({ action: 'propose', title, ops: [op(args)] });
    assert.match((await call('features', command, true)).error, /user approval/i);
    assert.match((await call('features', { action: 'batch', ops: [op(command)] }, true)).error, /user approval/i);
    assert.match((await call('proposals', propose({ ...command, expectedRevision: '0'.repeat(64) }), true)).error, /Direct inputs changed/);
    assert.match((await call('proposals', propose({ ...command, values: { first: 'a', second: 'a' } }), true)).error, /two distinct/i);
    assert.deepEqual(await readFile(file), original);
    const created = await call('proposals', propose(command));
    assert.deepEqual([created.proposal, created.applied, created.risk.approval], ['P1', false, ['Direct geometry']]);
    const bytes = await readFile(file);
    assert.match((await call('proposals', { action: 'accept', id: 'P1' }, true)).error, /user's approval.*Direct geometry/i);
    assert.deepEqual(await readFile(file), bytes);
    assert.deepEqual(await call('query', { action: 'summary' }), before);
    return before.direct_revision;
  });
  const pendingBytes = await readFile(file), pending = JSON.parse(pendingBytes);
  assert.deepEqual(pending.direct, input.direct);
  assert.deepEqual(pending.history.map(entry => entry.kind), ['proposal']);
  assert.deepEqual(pending.proposals.map(p => [p.id, p.status]), [['P1', 'open']]);

  await f.freshOpen(file, pending, '01-pending');
  f.phase = 'Review the sheet on the WebGPU canvas without creating a selectable object';
  await button('Chat').first().click();
  await card().getByText(/Add a Ruled surface between a and b/).waitFor();
  await button('Iso').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await f.snapshot('02-original');
  const canvas = f.page.locator('canvas.vp-canvas');
  const before = await canvas.screenshot();
  await button('Preview', card()).click();
  await waitForSheets(1);
  await f.snapshot('03-sheet-preview');
  const after = await canvas.screenshot();
  assert.notDeepEqual(before, after, 'The actual canvas changes when the sheet is shown');
  assert.equal(await shapeRow('Ruled surface').count(), 0);
  await f.same(pending);
  const center = await f.page.evaluate(() => window.__studioScreenOf([25, 20.375, 3.9375]));
  assert.ok(center && await f.page.evaluate(point => document.elementFromPoint(...point)?.matches('canvas.vp-canvas'), center));
  await f.page.mouse.click(...center);
  assert.equal(await f.page.locator('.ol.direct.sel').count(), 0);
  await button('Show before', card()).click();
  await waitForSheets(0);
  await button('Show after', card()).click();
  await waitForSheets(1);
  await f.same(pending);

  f.phase = 'A live rail change invalidates the active preview and blocks stale rebase';
  await shapeRow('Crown rail').click();
  await button('Hide', f.page.getByRole('complementary', { name: 'Direct geometry' })).click();
  await f.changed(pending);
  await waitForSheets(0);
  const edited = await f.doc();
  assert.equal(edited.direct.objects[1].hidden, true);
  await button('Rebase & preview', card()).click();
  await f.waitToast(/P1 could not be rebased/);
  assert.equal(await button('Preview', card()).isDisabled(), true);
  await f.same(edited);
  await f.snapshot('04-stale-rail-refused');
  await f.undo();
  await f.same(pending);
  await button('Preview', card()).click();
  await waitForSheets(1);

  f.phase = 'The user approves once and the native sheet supports Undo, Redo and fresh Open';
  await button('Accept', card()).click();
  await f.changed(pending);
  const accepted = await f.doc(), decision = accepted.history.at(-1);
  assert.deepEqual([decision.kind, decision.proposal, decision.by.agent, decision.proposed_by.agent], ['accept', 'P1', 'user', 'chat']);
  assert.deepEqual(accepted.direct.objects.slice(0, 2), input.direct.objects);
  assert.deepEqual([accepted.direct.sources.a, accepted.direct.sources.b], [input.direct.sources.a, input.direct.sources.b]);
  assert.equal(accepted.direct.objects.length, 3);
  await shapeRow('Ruled surface').waitFor();
  await waitForSheets(0);
  await f.snapshot('05-approved-sheet');
  const native = await f.inspect('approved-surface', accepted);
  assert.deepEqual([native.surface.degreeU, native.surface.degreeV], [3, 1]);
  assert.deepEqual(native.surface.knotsU, [2, 2, 2, 2, 4, 4, 4, 4]);
  assert.deepEqual(native.surface.knotsV, [0, 0, 1, 1]);
  const maxError = Math.max(...native.samples.flatMap((slice, i) => {
    const u = i / 16, t = 1 - u;
    const weights = [t ** 3, 3 * t ** 2 * u, 3 * t * u ** 2, u ** 3];
    return slice.map((point, j) => Math.hypot(...point.map((value, axis) => {
      const v = j / 8, a = straight[0][axis] * t + straight[1][axis] * u;
      const b = cubic.reduce((sum, pole, k) => sum + pole[axis] * weights[k], 0);
      return value - (a * (1 - v) + b * v);
    })));
  }));
  assert.ok(maxError < 1e-11, `native sample error ${maxError} mm`);
  await f.undo();
  await f.same(pending);
  await f.redo();
  await f.same(accepted);
  const saved = await f.save('approved-ruled');
  await f.freshOpen(saved.file, accepted, '06-fresh-open');
  await shapeRow('Ruled surface').waitFor();
  await button('Iso').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await f.snapshot('07-reopened-sheet');
  assert.deepEqual(await f.inspect('reopened-surface', await f.doc()), native);
  assert.deepEqual(await readFile(file), pendingBytes);
  f.report.observations.push({ revision, maxError, samples: 153, candidate: native.object.id,
    beforeCanvas: sha256(before), afterCanvas: sha256(after) });
});
