import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow, sha256 } from './flow-helper.mjs';
import { withMcpSession } from './mcp-browser-session.mjs';
import { inspectorSource, oracleSource } from './static-assembly-axial-mate-oracles.mjs';

const fixture = 'apps/cad-studio/test/fixtures/b05-pin-holder-distance-zero.bcad';
const bytes = await readFile(new URL('./fixtures/b05-pin-holder-distance-zero.bcad', import.meta.url));
const seedHash = '2b198792e9fb4850787aaf41ea2413d7b02fba4ee016059f18a66e2c605b2bb1';
assert.equal(sha256(bytes), seedHash);
const seed = JSON.parse(bytes);
const [concentric, distance] = seed.mates;
const pins = [
  fixture,
  'apps/cad-studio/test/pin-mate-agent-revision-browser.mjs',
  'apps/cad-studio/test/static-assembly-axial-mate-oracles.mjs',
  'apps/cad-studio/test/mcp-browser-session.mjs',
  'apps/cad-studio/src/ui/MatePanel.tsx',
  'apps/cad-studio/src/ui/ProposalBrowser.tsx',
  'apps/cad-studio/src/viewport/instanceEvaluation.ts',
  'packages/barocss-cad-model/src/chat/assembly.ts',
  'packages/barocss-cad-model/src/assembly/edit.ts',
];
const f = await createFlow({
  name: 'pin-mate-agent-revision', envFrozen: 'D1685_SOURCE_FROZEN', output: process.argv[2],
  initialFiles: pins, requiredFrozen: pins, inspectorSource, oracleSource,
  qualification: 'Discover the existing pin Distance mate, approve a local proposal, and edit the result after a native Save and fresh Open.',
  limits: ['One unrotated top-level pin. Placement preview remains outside the existing review viewport contract. Local L1 MCP is scripted.'],
  snapshotExtra: () => ({ bounds: window.__studioInstanceBounds?.() ?? [] }),
});
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });

function checkModel(actual, gap) {
  const model = { ...actual };
  delete model.proposals;
  delete model.history;
  assert.deepEqual(model, {
    ...seed,
    instances: [{ ...seed.instances[0], position: [32, 16, 8 + gap] }],
    mates: [concentric, { ...distance, distance: gap }],
  });
}

async function verify(label, gap) {
  const z = 8 + gap;
  await f.page.waitForFunction(z => {
    const pin = window.__studioInstanceBounds?.()?.find(row => row.id === 'pin');
    return pin?.min?.[2] === z && pin.max?.[2] === z + 20;
  }, z);
  const state = await f.snapshot(label);
  checkModel(state.doc, gap);
  const native = await f.inspect(label, state.doc, 'read');
  const checked = await f.runOracle({ doc: state.doc, native, bounds: state.bounds, z, distance: gap }, label);
  assert.equal(checked.pinZ, z);
  return state.doc;
}

await f.run(async () => {
  const file = join(f.output, 'staged-pin-and-holder.bcad');
  await writeFile(file, bytes);
  await f.freshOpen(file, seed, '01-original-gap-zero-open');
  await verify('02-original-gap-zero', 0);
  const session = { app: f.app, output: f.output, clientName: f.name };
  f.phase = 'Discover and stage the existing Distance mate at L1';
  await withMcpSession(session, file, 'zero-mate', async call => {
    const model = await call('assembly', { action: 'get' });
    const mate = model.mates.find(row => row.kind === 'distance');
    assert.deepEqual([mate.id, mate.a, mate.b, mate.distance], [distance.id, distance.a, distance.b, 0]);
    const op = { tool: 'assembly', args: { action: 'edit_mate', id: mate.id, distance: 3 } };
    assert.match((await call('assembly', op.args, true)).error, /autonomy L1.*only proposes/i);
    const dry = await call('features', { action: 'batch', dryRun: true, ops: [op] });
    assert.equal(dry.dryRun, true);
    assert.equal(sha256(await readFile(file)), seedHash);
    const proposal = await call('proposals', { action: 'propose', title: 'Set the pin-to-holder gap to 3 mm', ops: [op] });
    assert.deepEqual([proposal.proposal, proposal.applied], ['P1', false]);
    const staged = await readFile(file);
    assert.match((await call('proposals', { action: 'accept', id: 'P1' }, true)).error, /user accepts.*studio/i);
    assert.deepEqual(await readFile(file), staged);
  });
  const pending = JSON.parse(await readFile(file, 'utf8'));
  checkModel(pending, 0);
  await f.freshOpen(file, pending, '03-pending-mate-change');
  await button('Chat').first().click();
  const card = f.page.getByRole('listitem', { name: 'Proposal P1', exact: true });
  await button('Preview', card).click();
  await button('Hide', card).waitFor();
  await card.getByText('Placement changes are outside this preview.', { exact: true }).waitFor();
  assert.equal(await card.getByLabel('Volume change').count(), 0);
  await f.same(pending);
  await verify('04-preview-explains-placement-limit', 0);
  await button('Accept', card).click();
  await f.changed(pending);
  const accepted = await verify('05-approved-gap-three', 3);
  assert.deepEqual(accepted.proposals.map(p => p.status), ['accepted']);
  const last = accepted.history.at(-1);
  assert.deepEqual([last.kind, last.proposal, last.by.agent], ['accept', 'P1', 'user']);

  const saved = await f.save('pin-and-holder-gap-three');
  await f.freshOpen(saved.file, saved.doc, '06-fresh-open-gap-three');
  await withMcpSession(session, saved.file, 'saved-mate', async call => {
    const source = await readFile(saved.file);
    const assembly = await call('assembly', { action: 'get' });
    const mate = assembly.mates.find(row => row.id === distance.id);
    assert.deepEqual([mate.a, mate.b, mate.distance], [distance.a, distance.b, 3]);
    assert.deepEqual(await readFile(saved.file), source);
  });
  await f.page.locator('.ol.instance:not(.nested)').filter({ hasText: 'Pin' }).click();
  const mates = f.page.getByRole('complementary', { name: 'Mates', exact: true });
  await mates.getByLabel('Freedom', { exact: true }).getByText('free: 1 turn', { exact: true }).waitFor();
  await mates.locator('button.ol.mate').filter({ hasText: 'Distance' }).click();
  const input = mates.getByLabel('Mate distance', { exact: true });
  assert.equal(Number(await input.inputValue()), 3);
  await verify('07-reopened-distance-editable', 3);
  await input.fill('0');
  await input.press('Enter');
  await f.changed(saved.doc);
  await verify('08-edit-reopened-gap-to-zero', 0);
});
