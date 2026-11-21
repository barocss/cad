import assert from 'node:assert/strict';
import { copyFile, readFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { createFlow, sha256 } from './flow-helper.mjs';
import { withMcpSession } from './mcp-browser-session.mjs';

const [output, input] = process.argv.slice(2);
assert.ok(input && output && isAbsolute(output) && relative(resolve(import.meta.dirname, '../../..'), output).startsWith('../'));
const stockBytes = await readFile(input), stock = JSON.parse(stockBytes);
const title = 'Restore the sharp upper cap edge', face = 'n2.face', sharp = 'n1.side0|n1.top';
const roundedVolume = 12000 - 40 * (4 - Math.PI);
const verifyNear = (value, expected) => assert.ok(Math.abs(value - expected) < 1e-7, `${value} != ${expected}`);
const pins = [
  'apps/cad-studio/test/delete-face-agent-proposal-browser.mjs', 'apps/cad-studio/test/flow-helper.mjs',
  'apps/cad-studio/test/mcp-browser-session.mjs', 'apps/cad-studio/server/cadMcp.ts', 'apps/cad-studio/src/App.tsx',
  'apps/cad-studio/src/state/useProposalPreview.ts', 'apps/cad-studio/src/ui/ProposalBrowser.tsx',
  'packages/barocss-cad-model/src/chat/part/proposals.ts', 'packages/barocss-cad-model/src/chat/part/features.ts',
  'packages/barocss-cad-model/src/app/deleteFaceCommand.ts', 'packages/barocss-cad/src/part/part-delete-face.ts',
  'packages/barocss-cad/src/features/heal-prismatic-fillet.ts',
];
const f = await createFlow({
  name: 'delete-face-agent-proposal', envFrozen: 'DELETE_FACE_PROPOSAL_FROZEN', output,
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Propose the exact full-span fillet repair via local MCP, then preview, approve, save and reopen in Studio.',
  limits: ['One R2 upper front fillet on a 40 × 30 × 10 mm box. Local autonomy L1 and one human approval.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep } from '@barocss/cad';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
const [{ brep }] = partBreps(JSON.parse(readFileSync(process.argv[2], 'utf8')));
console.log(JSON.stringify({ brep, report: checkBrep(brep, { strict: true }), mass: brepMassProperties(brep, 1) }));
`,
});
const mcp = (file, label, run) => withMcpSession({ app: f.app, output, clientName: 'delete-face-proposal', autonomy: 1 }, file, label, run);
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const card = () => f.page.getByRole('listitem', { name: 'Proposal P1', exact: true });

async function shownVolume(key) {
  await f.page.waitForFunction(key => {
    const shown = window.__studioSection?.();
    return shown?.shownKeys?.length === 1 && shown.shownKeys[0] === key && Number.isFinite(shown.shownVolume);
  }, key);
  return f.page.evaluate(() => window.__studioSection().shownVolume);
}

await f.run(async () => {
  const origin = new URL(f.server.resolvedUrls.local[0]).origin, newContext = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async options => {
    const context = await newContext({ ...options, serviceWorkers: 'block' });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      return ['http:', 'https:'].includes(url.protocol) && url.origin !== origin ? route.abort() : route.continue();
    });
    return context;
  };

  f.phase = 'Propose the exact revision in local MCP without applying';
  const file = join(output, 'pending-delete-face.bcad');
  await copyFile(input, file);
  const revision = await mcp(file, 'pending', async call => {
    const summary = await call('query', { action: 'summary' });
    assert.equal(summary.facts.volume, 11965.664);
    const pin = await call('query', { action: 'render', highlight: [face] });
    assert.ok(Object.values(pin.legend).includes(face));
    const edit = { action: 'command', command: 'delete-face', faces: [face], expectedRevision: pin.revision };
    assert.match((await call('features', edit, true)).error, /autonomy L1/i);
    const propose = args => ({ action: 'propose', title, ops: [{ tool: 'features', args }] });
    const stale = await call('proposals', propose({ ...edit, expectedRevision: '0000000000000000' }), true);
    assert.match(JSON.stringify(stale), /part changed.*requested revision/i);
    assert.deepEqual(await readFile(file), stockBytes);
    const proposal = await call('proposals', propose(edit));
    assert.deepEqual([proposal.proposal, proposal.applied, proposal.change.volume], ['P1', false, 34.336]);
    const bytes = await readFile(file);
    assert.match((await call('proposals', { action: 'accept', id: 'P1' }, true)).error, /user accepts proposals in the studio/i);
    assert.deepEqual(await readFile(file), bytes);
    assert.deepEqual(await call('query', { action: 'summary' }), summary);
    return pin.revision;
  });
  const pendingBytes = await readFile(file), pending = JSON.parse(pendingBytes);
  assert.deepEqual(pending.nodes, stock.nodes);
  assert.deepEqual(pending.outputs, stock.outputs);
  assert.deepEqual(pending.history.map(entry => entry.kind), ['proposal']);
  assert.deepEqual(pending.proposals.map(p => [p.id, p.status]), [['P1', 'open']]);

  await f.freshOpen(file, pending, 'pending-proposal-opened');
  f.phase = 'Review before and after without applying the proposed heal';
  const before = await f.inspect('rounded', pending);
  assert.ok(before.report.valid);
  verifyNear(before.mass.volume, roundedVolume);
  await button('Chat').first().click();
  await card().getByText(title, { exact: false }).waitFor();
  const initial = await shownVolume('b2');
  await button('Preview', card()).click();
  await button('Hide', card()).waitFor();
  const delta = card().getByLabel('Volume change');
  await delta.getByText('+34.34 mm³ (+0.29%)', { exact: true }).waitFor();
  const candidate = await shownVolume('b3');
  assert.ok(candidate > initial, 'The viewport shows the added material before approval.');
  verifyNear(candidate, 12000);
  await f.same(pending);
  await f.snapshot('pending-native-preview');
  await button('Show before', card()).click();
  assert.equal(await shownVolume('b2'), initial);
  await f.same(pending);
  await f.snapshot('pending-original-preview');
  await button('Hide', card()).click();
  assert.equal(await shownVolume('b2'), initial);
  assert.deepEqual(await readFile(file), pendingBytes);

  f.phase = 'Accept only in Studio and inspect the native result';
  await button('Preview', card()).click();
  assert.equal(await shownVolume('b3'), candidate);
  await button('Accept', card()).click();
  await f.changed(pending);
  const accepted = await f.doc(), edit = accepted.nodes.at(-1), decision = accepted.history.at(-1);
  assert.deepEqual(accepted.nodes.slice(0, -1), stock.nodes);
  assert.deepEqual([edit.kind, edit.faces, edit.sigs[face].r], ['delete-face', [face], 2]);
  assert.deepEqual([decision.kind, decision.proposal, decision.by.agent, decision.proposed_by.agent],
    ['accept', 'P1', 'user', 'chat']);
  assert.deepEqual(accepted.proposals.map(p => [p.id, p.status]), [['P1', 'accepted']]);
  const native = await f.inspect('accepted', accepted);
  assert.ok(native.report.valid);
  verifyNear(native.mass.volume, 12000);
  verifyNear((await f.bodies()).bodies[0].volume, 12000);
  assert.deepEqual(native.brep.faces.map(item => [item.name, item.id]).sort(),
    before.brep.faces.filter(item => item.name !== face).map(item => [item.name, item.id]).sort());
  assert.ok(native.brep.edges.some(item => item.name === sharp));
  await f.snapshot('approved-sharp-cap');
  await f.undo(); await f.same(pending);
  assert.equal(await shownVolume('b2'), initial);
  await f.redo(); await f.same(accepted);
  const saved = await f.save('approved-cap-heal');
  await f.freshOpen(saved.file, accepted, 'fresh-open-approved');
  assert.deepEqual((await f.inspect('reopened', accepted)).brep, native.brep);
  await mcp(saved.file, 'reopened', async call => {
    assert.equal((await call('query', { action: 'summary' })).facts.volume, 12000);
    const result = await call('proposals', { action: 'list', all: true });
    assert.deepEqual(result.proposals.map(p => [p.id, p.status]), [['P1', 'accepted']]);
  });
  assert.deepEqual(await readFile(input), stockBytes);
  assert.deepEqual(await readFile(file), pendingBytes);
  f.report.observations.push({ revision, proposal: 'P1', initial, candidate, sourceHash: sha256(stockBytes),
    pendingHash: sha256(pendingBytes), savedHash: sha256(await readFile(saved.file)) });
});
