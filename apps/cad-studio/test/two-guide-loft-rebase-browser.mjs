import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { createFlow, sha256 } from './flow-helper.mjs';
import { twoGuideInspector, verifyTwoGuideLoft } from './loft-two-guides-oracle.mjs';
import { withMcpSession } from './mcp-browser-session.mjs';

const output = resolve(process.argv[2]);
assert.ok(relative(resolve(import.meta.dirname, '../../..'), output).startsWith('../'));
const pins = [
  'apps/cad-studio/test/two-guide-loft-rebase-browser.mjs',
  'apps/cad-studio/test/mcp-browser-session.mjs', 'apps/cad-studio/test/loft-two-guides-oracle.mjs',
  'apps/cad-studio/src/state/useProposalPreview.ts', 'apps/cad-studio/src/ui/FeatureHistoryMenu.tsx',
  'packages/barocss-cad-model/src/chat/remap.ts', 'packages/barocss-cad-model/src/chat/features.ts',
  'packages/barocss-cad-model/src/chat/part/history.ts', 'packages/barocss-cad-model/src/chat/part/proposals.ts',
  'packages/barocss-cad-model/src/engine/errors.ts',
  'packages/barocss-cad/src/features/loft-two-guides.ts',
];
const f = await createFlow({
  name: 'two-guide-loft-rebase', envFrozen: 'D1277_SOURCE_FROZEN', output,
  initialFiles: pins, requiredFrozen: pins, inspectorSource: twoGuideInspector,
  qualification: 'Rebase a two-guide Loft proposal after a section moves in History, and refuse when its original section is missing or incompatible.',
  limits: ['Desktop WebGPU; two congruent rectangles, two quadratic guides and one congruent decoy sketch.'],
});
const rectangle = id => ({ id, kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [10, 6] });
const seed = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', nextId: 3, parameters: {}, outputs: {},
  nodes: ['n0', 'n1', 'n2'].map(rectangle),
};
const recipe = {
  kind: 'loft', sections: [{ sketch: 0, z: 0 }, { sketch: 1, z: 12 }],
  guides: [[0, 2], [10, 14]].map(([x, middle]) => ({
    kind: 'quadratic-bezier', controlPoints: [[x, 0, 0], [middle, 0, 6], [x, 0, 12]],
  })),
};
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const card = () => f.page.getByRole('listitem', { name: 'Proposal P1', exact: true });
const rebase = () => button('Rebase & preview', card());
async function open(file, doc) {
  await f.newPage();
  await f.openFile(file, doc.nodes.length);
  await f.same(doc);
  await button('Chat').first().click();
  await button('Preview', card()).waitFor();
}
async function historyAction(node, action) {
  const index = (await f.doc()).nodes.findIndex(n => n.id === node);
  assert.ok(index >= 0);
  const sketches = f.page.getByRole('group', { name: 'History', exact: true }).getByRole('button', { name: 'Sketch · rectangle', exact: true });
  await sketches.nth(index).click({ button: 'right', timeout: 10000 });
  await f.page.getByRole('menuitem', { name: action === 'Delete' ? /^Delete\b/ : action, exact: true }).click({ timeout: 10000 });
}
async function refuseRebase(doc, reason, label) {
  await rebase().waitFor();
  assert.equal(await button('Accept', card()).count(), 0);
  await rebase().click();
  await f.waitToast(reason);
  await f.same(doc);
  assert.equal(await button('Accept', card()).count(), 0);
  assert.deepEqual((await f.bodies()).bodies, []);
  await f.snapshot(label);
}
await f.run(async () => {
  const origin = new URL(f.server.resolvedUrls.local[0]).origin;
  const newContext = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async options => {
    const context = await newContext({ ...options, serviceWorkers: 'block' });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      return ['http:', 'https:'].includes(url.protocol) && url.origin !== origin ? route.abort() : route.continue();
    });
    return context;
  };
  f.phase = 'Save a local MCP proposal that names two of three congruent sketches';
  const file = join(output, 'pending-loft.bcad');
  await writeFile(file, JSON.stringify(seed), { flag: 'wx' });
  await withMcpSession({ app: f.app, output, clientName: 'barocss-two-guide-loft-rebase-test' }, file, 'pending', async call => {
    const result = await call('proposals', {
      action: 'propose', title: 'Loft the original two sketches',
      ops: [{ tool: 'features', args: { action: 'add', features: [recipe] } }],
    });
    assert.equal(result.proposal, 'P1');
    assert.equal(result.change.volume, 819.84);
  });
  const pendingBytes = await readFile(file), pending = JSON.parse(pendingBytes);
  assert.deepEqual(pending.proposals[0].orders, [['n0', 'n1', 'n2']]);

  f.phase = 'Delete a section while a congruent substitute still has its original index';
  await open(file, pending);
  await historyAction('n1', 'Delete');
  await f.changed(pending);
  const deleted = await f.doc();
  assert.deepEqual(deleted.nodes.map(n => n.id), ['n0', 'n2']);
  await refuseRebase(deleted, /could not be rebased.*names n1, which the part no longer has/s, 'missing-section-refused');

  f.phase = 'Change a section width and refuse the same proposal against incompatible geometry';
  await open(file, pending);
  await historyAction('n1', 'Edit');
  await f.editor().waitFor();
  await f.editor().getByLabel('Width', { exact: true }).fill('11');
  const incompatible = (await f.applyEditor(pending, 'width-edited')).doc;
  assert.equal(incompatible.nodes[1].id, 'n1');
  assert.deepEqual(incompatible.nodes[1].max, [11, 6]);
  await refuseRebase(incompatible, /could not be rebased.*the Loft sections have different sizes.*same width and depth/is, 'incompatible-section-refused');

  f.phase = 'Move the unrelated sketch into the upper section’s old index and rebase';
  await open(file, pending);
  await historyAction('n2', 'Move earlier');
  await f.changed(pending);
  const moved = await f.doc();
  assert.deepEqual(moved.nodes.map(n => n.id), ['n0', 'n2', 'n1']);
  await rebase().waitFor();
  assert.equal(await button('Accept', card()).count(), 0);
  await f.snapshot('stale-after-reorder');
  await rebase().click();
  await button('Hide', card()).waitFor();
  await card().getByLabel('Volume change').getByText('+819.84 mm³', { exact: true }).waitFor();
  const rebased = await f.doc(), proposal = rebased.proposals[0];
  assert.equal(proposal.status, 'open');
  assert.deepEqual(rebased.nodes, moved.nodes);
  assert.deepEqual(proposal.orders, [['n0', 'n2', 'n1']]);
  assert.deepEqual(proposal.ops[0].args.features[0], { ...recipe, sections: [{ sketch: 0, z: 0 }, { sketch: 2, z: 12 }] });
  assert.deepEqual((await f.bodies()).bodies, []);
  await f.page.waitForFunction(() => window.__studioSection?.().shownKeys.includes('b3'));
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await f.snapshot('rebased-preview');

  f.phase = 'Approve the remapped Loft and reopen with both original section identities';
  await button('Accept', card()).click();
  await f.page.waitForFunction(() => window.__studioDoc?.proposals?.[0]?.status === 'accepted');
  await f.ready();
  const accepted = await f.doc();
  assert.deepEqual(accepted.nodes.at(-1).sections.map(s => accepted.nodes[s.sketch].id), ['n0', 'n1']);
  assert.deepEqual(accepted.history.map(entry => entry.kind), ['proposal', 'rebase', 'accept']);
  const before = await verifyTwoGuideLoft(f, accepted, 2, 4, 'approved');
  const saved = await f.save('rebased-loft');
  await f.freshOpen(saved.file, accepted, 'reopened');
  const after = await verifyTwoGuideLoft(f, await f.doc(), 2, 4, 'reopened');
  assert.deepEqual(after, before);
  assert.deepEqual(await readFile(file), pendingBytes);
  f.report.observations.push({ label: 'source-unchanged', pendingHash: sha256(pendingBytes), saved: f.report.files[0].hash });
});
