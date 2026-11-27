import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';

const pins = ['apps/cad-studio/src/App.tsx', 'apps/cad-studio/src/ui/ChatPanel.tsx',
  'apps/cad-studio/src/chat/useStudioChat.ts', 'packages/barocss-cad-model/src/chat/merge.ts'];
if (process.argv.includes('--candidate')) pins.push('apps/cad-studio/src/app/studioChatTurnActions.ts');
const f = await createFlow({
  name: 'agent-turn-app-commit', output: process.argv[2], envFrozen: 'AGENT_TURN_COMMIT_FROZEN',
  qualification: 'Commit an actual local tool edit directly and merge another edit made during the turn.',
  limits: ['The existing local tool produces each edit. The desktop scripted transport delivers the turn events.'],
  initialFiles: pins, requiredFrozen: pins,
  inspectorSource: `
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dispatchTool } from '@barocss/cad-model/chat/tools';
import { captureOp } from '@barocss/cad-model/chat/merge';
import { evaluateDoc } from '@barocss/cad-model/engine/evaluate';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8')), model = evaluateDoc(doc, 0);
assert.ok(model.ok);
const args = { action: 'edit', index: 1, values: { h: 20 } };
const result = await dispatchTool({ doc, bodies: model.bodies }, 'features', args, async input => evaluateDoc(input, 1));
assert.ok(result.changed && !result.isError, result.content);
const next = result.state.doc;
console.log(JSON.stringify({ doc: next, op: captureOp(doc, next, 'features', args) }));
`,
});
const stock = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 2,
  nodes: [{ kind: 'sketch', id: 'n0', profile: 'rectangle', min: [0, 0], max: [32, 32] },
    { kind: 'extrude', id: 'n1', sketch: 0, height: 16 }],
  outputs: { b1: { node: 1, side: 'solid' } },
};
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const input = () => f.page.getByRole('textbox', { name: 'Chat message', exact: true });
const heights = async () => (await f.doc()).nodes.filter(node => node.kind === 'extrude').map(node => node.height);
const select = { faces: [], edges: [], bodies: ['b1'] };

async function send(message) {
  await input().fill(message);
  await input().press('Enter');
}

await f.run(async () => {
  const originalNewContext = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async options => {
    const context = await originalNewContext({ ...options, serviceWorkers: 'block' });
    const origin = new URL(f.server.resolvedUrls.local[0]).origin;
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/chat/status')
        return route.fulfill({ json: { enabled: true, model: 'Local scripted tool replay', via: 'local' } });
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      return ['http:', 'https:'].includes(url.protocol) && url.origin !== origin ? route.abort() : route.continue();
    });
    return context;
  };

  const file = join(f.output, 'agent-box.bcad');
  await writeFile(file, JSON.stringify(stock));
  const edit = await f.inspect('local-agent-height-edit', stock);
  assert.deepEqual(edit.doc.nodes[1], { ...stock.nodes[1], height: 20 });
  await f.freshOpen(file, stock, 'original-box');
  await button('Chat').click();
  await f.page.waitForFunction(() => !!window.__studioScriptChat);
  await f.page.evaluate(({ next, op, selection }) => window.__studioScriptChat([
    [{ type: 'state', doc: next, ops: [op] }, { type: 'text', delta: 'Height updated.' },
      { type: 'done', doc: next, selection, end: 'done' }],
    [{ type: 'state', doc: next, ops: [op] }, { type: 'sleep', ms: 5000 }, { type: 'text', delta: 'Height updated during your edit.' },
      { type: 'done', doc: next, selection, end: 'done' }],
  ]), { next: edit.doc, op: edit.op, selection: select });

  f.phase = 'Apply the local tool result and undo it from the notice';
  await send('Set the box height to 20 mm.');
  await f.waitToast(/Applied by the agent/);
  await f.page.waitForFunction(() => window.__studioSelection.selection.bodies[0] === 0);
  assert.deepEqual(await heights(), [20]);
  await f.snapshot('agent-applied');
  await button('Undo', f.page.locator('.toast')).click();
  await f.same(stock);

  f.phase = 'Add a second box during the next turn and keep it through Undo';
  await send('Set the original box height to 20 mm.');
  await f.page.locator('.chat-msg.busy').waitFor();
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.page.keyboard.press('b');
  const box = f.page.getByRole('dialog', { name: 'Box', exact: true });
  await box.getByLabel('At X', { exact: true }).fill('40');
  await box.locator('.status').getByText('preview', { exact: true }).waitFor();
  await button('Apply', box).click();
  await f.page.waitForFunction(() => window.__studioDoc.nodes.length === 4);
  await f.waitToast(/Chat turn merged with your edits.*1 of 1 change applied/);
  assert.deepEqual(await heights(), [20, 16]);
  await f.snapshot('agent-merge-both-kept');
  await button('Undo', f.page.locator('.toast')).click();
  await f.page.waitForFunction(() => window.__studioDoc.nodes[1]?.height === 16);
  assert.deepEqual(await heights(), [16, 16]);
  const workers = (await f.bodies()).bodies;
  assert.equal(workers.length, 2);
  await f.snapshot('agent-merge-undo-keeps-second-box');
});
