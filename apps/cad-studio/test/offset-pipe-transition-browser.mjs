import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { currentPartRevision, withMcpSession } from './mcp-browser-session.mjs';

const pins = [
  'apps/cad-studio/test/offset-pipe-transition-browser.mjs',
  'apps/cad-studio/test/pipe-transition-native.ts',
  'packages/barocss-cad-model/src/app/profileCommands.ts',
  'packages/barocss-cad-model/src/app/commands.ts',
  'packages/barocss-cad/src/features/loft.ts',
];
const f = await createFlow({
  name: 'offset-pipe-transition', output: process.argv[2], envFrozen: 'OFFSET_PIPE_TRANSITION_FROZEN',
  qualification: 'Join two offset circular pipe ends with a separate open transition using two existing Lofts and Subtract.',
  limits: ['Parallel circular sections, linear ruled span, 2 mm radial wall in XY sections.'],
  initialFiles: pins, requiredFrozen: pins,
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { inspectPipeTransition, pipeTransitionFixture } from './test/pipe-transition-native';
const [path, mode, key] = process.argv.slice(2);
const doc = JSON.parse(readFileSync(path, 'utf8'));
console.log(JSON.stringify(JSON.parse(mode) === 'seed' ? pipeTransitionFixture()
  : inspectPipeTransition(doc, key ? JSON.parse(key) : undefined)));
`,
});
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const browser = () => f.page.getByRole('complementary', { name: 'Browser', exact: true });
const bodyRow = key => browser().locator(`button[data-browser-body-key="${key}"]`);
const loft = () => f.page.getByRole('dialog', { name: 'Loft', exact: true });
const card = () => f.page.getByRole('listitem', { name: 'Proposal P1', exact: true });

async function loftFrom(previous, indices, label) {
  for (const [i, index] of indices.entries()) {
    await button(`Sketch ${index + 1}`).click(i ? { modifiers: ['Shift'] } : {});
  }
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.command('Loft');
  await loft().locator('.status').filter({ hasText: /^preview$/ }).waitFor();
  await loft().getByText('Ruled · 2 sections', { exact: true }).waitFor();
  await f.same(previous);
  await f.snapshot(label + '-preview');
  await button('Apply', loft()).click();
  await f.changed(previous);
  await loft().waitFor({ state: 'hidden' });
  const doc = await f.doc();
  const feature = doc.nodes.at(-1);
  assert.deepEqual(feature.from, indices);
  assert.deepEqual(feature.sections, [{ sketch: previous.nodes.length, z: 0 }, { sketch: previous.nodes.length + 1, z: 30 }]);
  assert.deepEqual(doc.nodes.slice(0, previous.nodes.length), previous.nodes);
  return doc;
}

async function native(doc, label, pipeProof) {
  const result = await f.inspect(label, doc, 'read', 'b16');
  assert.deepEqual(result.filter(({ key }) => key === 'b2' || key === 'b5'), pipeProof);
  assert.deepEqual(result.map(({ key }) => key), ['b2', 'b5', 'b16']);
  assert.ok(result[2].transition.check.valid);
  await f.ready();
  assert.match(await bodyRow('b2').innerText(), /^Inlet pipe/);
  assert.match(await bodyRow('b5').innerText(), /^Outlet pipe/);
  const bodies = (await f.bodies()).bodies;
  assert.equal(bodies.length, 3);
  assert.ok(bodies.some(body => Math.abs(body.volume - 1080 * Math.PI) < 1e-6));
  f.report.observations.push({ label, transition: result[2], pipeProof });
  return result;
}

await f.run(async () => {
  const seed = await f.inspect('seed', {}, 'seed');
  const pipes = await f.inspect('source-pipes', seed, 'read');
  assert.deepEqual(pipes.map(body => body.key), ['b2', 'b5']);
  assert.ok(Math.abs(pipes[0].volume - 352 * Math.PI) < 1e-6);
  assert.ok(Math.abs(pipes[1].volume - 224 * Math.PI) < 1e-6);
  const source = join(f.output, 'two-offset-pipes.bcad');
  await writeFile(source, JSON.stringify(seed));
  await f.freshOpen(source, seed, '01-source-pipes');
  f.phase = 'preview and apply two ordinary circular Lofts';
  const outer = await loftFrom(seed, [6, 7], '02-outer-loft');
  const tools = await loftFrom(outer, [8, 9], '03-inner-loft');

  f.phase = 'subtract the inner loft in desktop Studio';
  await bodyRow('b12').click();
  await bodyRow('b15').click({ modifiers: ['Shift'] });
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.command('Subtract');
  await f.changed(tools);
  const cut = await f.doc();
  assert.deepEqual(cut.nodes.at(-1), { kind: 'difference', id: 'n16', parent: { node: 12, side: 'solid' }, tool: { node: 15, side: 'solid' } });
  assert.deepEqual(cut.nodes.slice(0, 10), seed.nodes);
  const direct = await native(cut, 'direct-subtraction-proof', pipes);
  await f.snapshot('04-hollow-transition-applied');
  await f.undo();
  await f.same(tools);
  await f.redo();
  await f.same(cut);
  assert.deepEqual(await native(cut, 'desktop-redo-proof', pipes), direct);

  f.phase = 'save the unchanged Lofts and preview the complete cut through a pending proposal';
  await f.undo();
  await f.same(tools);
  const savedTools = await f.save('lofts-before-subtract');
  const stagedFile = join(f.output, 'pending-pipe-transition.bcad');
  await writeFile(stagedFile, await readFile(savedTools.file));
  await withMcpSession({ app: f.app, output: f.output, clientName: 'offset-pipe-transition', autonomy: 1 },
    stagedFile, 'loft-subtract', async call => {
      const args = { action: 'command', command: 'difference', bodies: ['b12', 'b15'], expectedRevision: await currentPartRevision(call) };
      await call('features', args, true);
      const proposal = await call('proposals', { action: 'propose', title: 'Open the circular pipe transition', ops: [{ tool: 'features', args }] });
      assert.deepEqual([proposal.proposal, proposal.applied], ['P1', false]);
    });
  const pending = JSON.parse(await readFile(stagedFile, 'utf8'));
  assert.deepEqual(pending.nodes, tools.nodes);
  await f.freshOpen(stagedFile, pending, '05-pending-hollow-proposal');
  await button('Chat').first().click();
  await button('Preview', card()).click();
  await button('Hide', card()).waitFor();
  await f.same(pending);
  await f.snapshot('06-full-hollow-preview');
  await button('Accept', card()).click();
  await f.changed(pending);
  const accepted = await f.doc();
  assert.equal(accepted.proposals[0].status, 'accepted');
  assert.equal(accepted.history.at(-1).by.agent, 'user');
  assert.deepEqual(accepted.nodes, cut.nodes);
  assert.deepEqual(await native(accepted, 'explicit-approval-proof', pipes), direct);
  await f.undo();
  await f.same(pending);
  await f.redo();
  await f.same(accepted);
  const saved = await f.save('offset-pipe-transition');
  await f.freshOpen(saved.file, accepted, '07-saved-fresh-open');
  assert.deepEqual(await native(accepted, 'reopened-native-proof', pipes), direct);
  await button('Top').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await f.snapshot('08-open-ends-top');
  await f.persist();
});
