import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';

const pins = [
  'apps/cad-studio/test/browser-extrude-proposal.mjs', 'apps/cad-studio/src/App.tsx',
  'apps/cad-studio/src/chat/browserModelContext.ts', 'apps/cad-studio/src/chat/useBrowserPartProposal.ts',
  'apps/cad-studio/src/ui/ChatPanel.tsx', 'packages/barocss-cad-model/src/chat/browserProposalTargets.ts',
  'packages/barocss-cad-model/src/chat/tools.ts', 'packages/barocss-cad-model/src/chat/part/proposals.ts',
];
const firstBox = process.argv.includes('--box');
const f = await createFlow({
  name: firstBox ? 'browser-box-proposal' : 'browser-extrude-proposal', output: process.argv[2], envFrozen: 'BROWSER_EXTRUDE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Call a real browser WebMCP tool and verify native Studio preview, rejection, approval, history and project persistence.',
  limits: ['One first Box or one literal rectangular Extrude, with WebMCP and testing flags in desktop Chrome.'],
  async createContext(options) {
    if (!f.browser) {
      const { chromium } = createRequire(join(process.env.PW_DIR, 'package.json'))('playwright');
      f.browser = await chromium.launch({ executablePath: process.env.CHROME, headless: true,
        args: ['--enable-unsafe-webgpu', '--enable-blink-features=WebMCP,WebMCPTesting'] });
      f.report.chromeProcessesLaunched = 1;
    }
    const context = await f.browser.newContext({ ...options, acceptDownloads: false });
    await context.addInitScript(holdNextAgentReply);
    return context;
  },
});
const extrudeName = 'cad_part_propose_extrude', boxName = 'cad_part_propose_box', summaryName = 'cad_part_summary';
const proposalName = firstBox ? boxName : extrudeName;
const project = firstBox ? 'Browser first Box proposal' : 'Browser Extrude proposal', file = 'browser-extrude-box.bcad';
const box = height => ({
  format: 'barocss-cad-model', schema: 3, units: 'mm', nextId: 2, parameters: {},
  nodes: [{ kind: 'sketch', id: 'n0', profile: 'rectangle', min: [0, 0], max: [80, 50] },
    { kind: 'extrude', id: 'n1', sketch: 0, height }],
  outputs: { b1: { node: 1, side: 'solid' } },
});
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const chat = () => f.page.getByRole('complementary', { name: 'Chat', exact: true });
const versions = () => f.page.getByRole('complementary', { name: 'Versions panel', exact: true });
const readGrant = () => button('Share part summary and plane measurements with browser tools', chat());
const proposalGrant = (kind = firstBox ? 'Box' : 'Extrude') => button(`Allow one browser ${kind} proposal`, chat());
const card = id => f.page.getByRole('listitem', { name: 'Proposal ' + id, exact: true });
const frame = () => f.page.getByTitle('Frame all (F)', { exact: true }).click();
const toolsReady = (name, present) => f.page.waitForFunction(async ([name, present]) =>
  (await document.modelContext.getTools()).some(tool => tool.name === name) === present, [name, present]);
const getTool = name => f.page.evaluateHandle(async name =>
  (await document.modelContext.getTools()).find(tool => tool.name === name), name);
const invoke = (tool, input = {}) => f.page.evaluate(async ({ tool, input }) =>
  JSON.parse(await document.modelContext.executeTool(tool, input)), { tool, input });

// Preserve the actual Worker result and delay only its delivery in the Open race.
function holdNextAgentReply() {
  const worker = Worker.prototype, send = worker.postMessage;
  const handler = Object.getOwnPropertyDescriptor(worker, 'onmessage');
  let armed = false, target, held;
  worker.postMessage = function (request, ...args) {
    if (armed && request.type === 'part' && request.slot === 'agent') {
      armed = false;
      target = { worker: this, id: request.id };
    }
    return Reflect.apply(send, this, [request, ...args]);
  };
  Object.defineProperty(worker, 'onmessage', {
    configurable: true, get: handler.get,
    set(listener) {
      handler.set.call(this, listener && function (event) {
        if (target?.worker === this && target.id === event.data?.id) {
          target = undefined;
          held = { ok: event.data.result.ok, deliver: () => listener.call(this, event) };
        } else listener.call(this, event);
      });
    },
  });
  window.__browserExtrudeCheck = {
    arm() { armed = true; },
    held: () => held?.ok,
    release() { held.deliver(); held = undefined; },
  };
}

async function open(doc, name = file) {
  await f.openFile({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) }, doc.nodes.length);
  await f.same(doc);
}

async function share() {
  if (!(await chat().isVisible())) await button('Chat').first().click();
  await readGrant().click();
  await toolsReady(summaryName, true);
  return invoke(await getTool(summaryName));
}

async function openProject() {
  if (!(await versions().isVisible())) await button('Project and versions').click();
  await versions().getByRole('textbox', { name: 'Browser project name', exact: true }).fill(project);
  await button('Project in this browser', versions()).click();
  await versions().getByLabel('Project', { exact: true }).waitFor();
}

async function assertBox(height) {
  await f.ready();
  const { nodes, outputs } = await f.doc();
  const expected = box(height).nodes;
  if (firstBox) expected[1].made = { command: 'box', values: { w: 80, d: 50, h: height, x: 0, y: 0, z: 0 } };
  assert.deepEqual(nodes, expected);
  assert.deepEqual(outputs, box(height).outputs);
  const [body] = (await f.bodies()).bodies;
  assert.equal(body.key, 'b1');
  assert.ok(Math.abs(body.volume - 80 * 50 * height) < 1e-7);
}

async function verifyFirstBox() {
  await f.newPage();
  await button('New part').click();
  await f.page.waitForFunction(() => window.__studioDoc.nodes.length === 0);
  await f.ready();
  const original = await f.doc();
  const acceptedBodyCount = async count => assert.equal((await f.bodies()).bodies.length, count);
  const summary = await share();
  assert.deepEqual(summary.bodies, []);
  assert.equal(summary.featureCount, 0);
  await toolsReady(boxName, false);
  await toolsReady(extrudeName, false);
  assert.equal(await proposalGrant().getAttribute('aria-pressed'), 'false');
  await proposalGrant().click();
  await toolsReady(boxName, true);
  await toolsReady(extrudeName, false);
  const tool = await getTool(boxName);
  const input = { width: 80, depth: 50, height: 10, expectedRevision: summary.revision };
  for (const [args, code] of [
    [{ ...input, width: '80' }, 'invalid_arguments'],
    [{ ...input, depth: 0.5 }, 'invalid_arguments'],
    [{ ...input, height: -10 }, 'invalid_arguments'],
    [{ ...input, x: 8 }, 'invalid_arguments'],
    [{ ...input, expectedRevision: '0000000000000000' }, 'stale_part'],
  ]) assert.equal((await invoke(tool, args)).error.code, code);
  await f.same(original);

  const requests = await Promise.allSettled([invoke(tool, input), invoke(tool, input)]);
  const replies = requests.filter(result => result.status === 'fulfilled').map(result => result.value);
  assert.equal(replies.filter(reply => reply.applied === false).length, 1);
  const first = replies.find(reply => reply.applied === false);
  const firstCard = card(first.proposal);
  assert.deepEqual(first, { proposal: first.proposal, applied: false, revision: summary.revision });
  await toolsReady(boxName, false);
  await assert.rejects(invoke(tool, input));
  await firstCard.waitFor();
  const waiting = await f.doc();
  assert.deepEqual({ ...waiting, proposals: undefined, history: undefined }, { ...original, proposals: undefined, history: undefined });
  assert.equal(waiting.proposals.length, 1);
  assert.equal(waiting.proposals[0].by.agent, 'browser');
  assert.deepEqual(waiting.history.map(({ kind, proposal }) => ({ kind, proposal })), [{ kind: 'proposal', proposal: first.proposal }]);
  await acceptedBodyCount(0);
  await button('Preview', firstCard).click();
  await firstCard.getByLabel('Volume change', { exact: true }).getByText(/40000|40[,. ]000/).waitFor();
  await acceptedBodyCount(0);
  await frame();
  await f.snapshot('browser-first-box-preview');
  await button('Reject', firstCard).click();
  await f.page.waitForFunction(() => window.__studioDoc.proposals[0].status === 'rejected');
  await acceptedBodyCount(0);
  await button('Show decided proposals').click();
  await firstCard.getByText(/rejected by user/).waitFor();
  await f.snapshot('browser-first-box-rejected');

  assert.equal((await share()).revision, summary.revision);
  await proposalGrant().click();
  await toolsReady(boxName, true);
  const second = await invoke(await getTool(boxName), input);
  await card(second.proposal).waitFor();
  const beforeAccept = await f.doc();
  assert.deepEqual(beforeAccept.nodes, []);
  await acceptedBodyCount(0);
  await button('Accept', card(second.proposal)).click();
  await f.changed(beforeAccept);
  await assertBox(10);
  await frame();
  const applied = await f.doc();
  assert.equal(applied.proposals[1].decided.by, 'user');
  await f.snapshot('browser-first-box-accepted');
  await button('Undo').click();
  await f.same(beforeAccept);
  await acceptedBodyCount(0);
  await button('Redo').click();
  await f.same(applied);
  await assertBox(10);

  await toolsReady(extrudeName, false);
  assert.equal(await proposalGrant('Box').count(), 0);
  await openProject();
  await button('Save').click();
  const projectFile = 'Untitled.bcad';
  await versions().getByRole('list', { name: 'Project documents', exact: true }).getByText(projectFile, { exact: true }).waitFor();
  await button('Close project', versions()).click();
  await versions().getByLabel('Project', { exact: true }).waitFor({ state: 'hidden' });
  await f.page.reload();
  await f.ready();
  await openProject();
  await button('Open ' + projectFile, versions()).click();
  await f.same(applied);
  await assertBox(10);
  await frame();
  await toolsReady(boxName, false);
  await toolsReady(extrudeName, false);
  await f.snapshot('browser-first-box-project-reopened');

  const current = await share();
  assert.deepEqual(current.bodies[0].bounds, { min: [0, 0, 0], max: [80, 50, 10] });
  assert.equal(current.bodies[0].volume, 40000);
  assert.equal(await proposalGrant('Box').count(), 0);
  await proposalGrant('Extrude').click();
  await toolsReady(extrudeName, true);
  await toolsReady(boxName, false);
  const editTool = await getTool(extrudeName);
  const editArgs = { body: current.bodies[0].key, height: 15, expectedRevision: current.revision };
  assert.equal((await invoke(editTool, { ...editArgs, height: 0.5 })).error.code, 'invalid_arguments');
  const edit = await invoke(editTool, editArgs);
  await card(edit.proposal).waitFor();
  const beforeEdit = await f.doc();
  await assertBox(10);
  await button('Accept', card(edit.proposal)).click();
  await f.changed(beforeEdit);
  await assertBox(15);
  const revised = await f.doc();
  assert.equal(revised.proposals[2].decided.by, 'user');
  await frame();
  await f.snapshot('browser-first-box-edited');
  await button('Undo').click();
  await f.same(beforeEdit);
  await assertBox(10);
  await button('Redo').click();
  await f.same(revised);
  await assertBox(15);
  const revisedSummary = await share();
  assert.deepEqual(revisedSummary.bodies[0].bounds, { min: [0, 0, 0], max: [80, 50, 15] });
  assert.equal(revisedSummary.bodies[0].volume, 60000);
  assert.deepEqual(f.report.downloads, []);
  f.report.observations.push({ chrome: f.browser.version(), original: summary, first, second, duplicate: replies,
    accepted: current, revised: revisedSummary });
}

await f.run(firstBox ? verifyFirstBox : async () => {
  const original = box(10);
  await f.newPage();
  await open(original);
  const summary = await share();
  await frame();
  assert.deepEqual(summary.bodies[0].bounds, { min: [0, 0, 0], max: [80, 50, 10] });
  await toolsReady(proposalName, false);
  assert.equal(await proposalGrant().getAttribute('aria-pressed'), 'false');
  await proposalGrant().click();
  await toolsReady(proposalName, true);
  const tool = await getTool(proposalName);
  const input = { body: 'b1', height: 12, expectedRevision: summary.revision };
  for (const [args, code] of [
    [{ ...input, height: '12' }, 'invalid_arguments'], [{ ...input, height: 0 }, 'invalid_arguments'],
    [{ ...input, force: true }, 'invalid_arguments'], [{ ...input, body: 'old' }, 'extrude_unavailable'],
    [{ ...input, height: 10 }, 'extrude_unavailable'],
    [{ ...input, expectedRevision: '0000000000000000' }, 'stale_part'],
  ]) assert.equal((await invoke(tool, args)).error.code, code);
  await f.same(original);
  await proposalGrant().click();
  await toolsReady(proposalName, false);
  await assert.rejects(invoke(tool, input));
  await proposalGrant().click();
  await toolsReady(proposalName, true);
  const enabled = await getTool(proposalName);
  const requested = await Promise.allSettled([invoke(enabled, input), invoke(enabled, input)]);
  const staged = requested.find(result => result.status === 'fulfilled' && result.value.applied === false)?.value;
  assert.ok(staged);
  assert.deepEqual(staged, { proposal: staged.proposal, applied: false, revision: summary.revision });
  await card(staged.proposal).waitFor();
  await toolsReady(proposalName, false);
  await assert.rejects(invoke(enabled, input));
  await assertBox(10);
  const waiting = await f.doc();
  assert.equal(waiting.proposals.length, 1);
  assert.equal(waiting.proposals[0].by.agent, 'browser');
  await button('Preview', card(staged.proposal)).click();
  const volume = card(staged.proposal).getByLabel('Volume change', { exact: true });
  await volume.getByText(/8000|8[,. ]000/).waitFor();
  await assertBox(10);
  await f.snapshot('browser-proposal-preview');
  await button('Hide', card(staged.proposal)).click();
  await volume.waitFor({ state: 'hidden' });
  await button('Reject', card(staged.proposal)).click();
  await f.page.waitForFunction(() => window.__studioDoc.proposals[0].status === 'rejected');
  await assertBox(10);
  await button('Show decided proposals').click();
  await card(staged.proposal).getByText(/rejected by user/).waitFor();
  await f.snapshot('browser-proposal-rejected');

  const sameRevision = await share();
  assert.equal(sameRevision.revision, summary.revision);
  await proposalGrant().click();
  await toolsReady(proposalName, true);
  const next = await invoke(await getTool(proposalName), { ...input, height: 15 });
  await card(next.proposal).waitFor();
  await assertBox(10);
  const waiting15 = await f.doc();
  await button('Accept', card(next.proposal)).click();
  await f.changed(waiting15);
  await assertBox(15);
  const applied = await f.doc();
  assert.equal(applied.proposals[1].decided.by, 'user');
  await f.snapshot('browser-proposal-accepted');
  await button('Undo').click();
  await f.same(waiting15);
  await assertBox(10);
  await button('Redo').click();
  await f.same(applied);
  await assertBox(15);

  const after = await share();
  await proposalGrant().click();
  await toolsReady(proposalName, true);
  const oldPart = await getTool(proposalName);
  const pendingInput = { ...input, height: 18, expectedRevision: after.revision };
  await f.page.evaluate(({ tool, args }) => {
    window.__browserExtrudeCheck.arm();
    window.__browserExtrudeCheck.pending = document.modelContext.executeTool(tool, args)
      .then(reply => JSON.parse(reply), () => ({ error: { code: 'revoked' } }));
  }, { tool: oldPart, args: pendingInput });
  await f.page.waitForFunction(() => window.__browserExtrudeCheck.held() === true);
  await open(applied, 'same-revision.bcad');
  await toolsReady(proposalName, false);
  await f.page.evaluate(() => window.__browserExtrudeCheck.release());
  const discarded = await f.page.evaluate(() => window.__browserExtrudeCheck.pending);
  assert.ok(['revoked', 'stale_part'].includes(discarded.error?.code));
  await assert.rejects(invoke(oldPart, pendingInput));
  await f.same(applied);
  await assertBox(15);
  await openProject();
  await button('Save').click();
  await versions().getByRole('list', { name: 'Project documents', exact: true }).getByText('same-revision.bcad', { exact: true }).waitFor();
  await button('Close project', versions()).click();
  await versions().getByLabel('Project', { exact: true }).waitFor({ state: 'hidden' });
  await f.page.reload();
  await f.ready();
  await openProject();
  await button('Open same-revision.bcad', versions()).click();
  await f.same(applied);
  await assertBox(15);
  await frame();
  await f.snapshot('browser-proposal-project-reopened');
  const cylinder = { ...original, nodes: [
    { kind: 'sketch', id: 'n0', profile: 'circle', center: [0, 0], radius: 5 }, original.nodes[1],
  ] };
  await open(cylinder, 'unsupported-cylinder.bcad');
  await share();
  assert.equal(await proposalGrant().count(), 0);
  await toolsReady(proposalName, false);
  assert.deepEqual(f.report.downloads, []);
  f.report.observations.push({ chrome: f.browser.version(), staged, next, duplicate: requested.map(result => result.status === 'fulfilled'
    ? result.value : 'retired'), lateAfterOpen: discarded, acceptedVolumesMM3: [40000, 60000] });
});
