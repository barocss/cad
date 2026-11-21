import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const files = [
  'apps/cad-studio/test/cage-transform-exact-ownership-browser.mjs',
  'apps/cad-studio/src/App.tsx',
  'apps/cad-studio/src/engine/client.ts',
  'apps/cad-studio/src/subd/cageCommitReadiness.ts',
  'apps/cad-studio/src/subd/useCageEditor.ts',
  'apps/cad-studio/src/subd/useCageGizmo.ts',
  'apps/cad-studio/src/ui/CagePanel.tsx',
  'apps/cad-studio/src/ui/useWorkspaceModeExit.tsx',
  'apps/cad-studio/src/viewport/viewportPointerInput.ts',
];
const f = await createFlow({
  name: 'cage-transform-exact-ownership', output: process.argv[2], envFrozen: 'CAGE_EXACT_OWNERSHIP_FROZEN',
  initialFiles: files, requiredFrozen: files,
  qualification: 'Only the current cage preview enables Done. Delayed real replies cannot affect a newer cage or part.',
  limits: ['One translated SubD box and physical uniform scale. Browser holds original worker replies without editing their data.'],
});
const panel = () => f.page.getByRole('complementary', { name: 'Cage editor', exact: true });
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const done = () => button('Done editing cage', panel());
const state = () => f.page.evaluate(() => window.__studioCage());
async function command(value) {
  await f.page.getByText('barocss', { exact: true }).click();
  await f.command(value);
}

function holdActualCageReplies() {
  const worker = Worker.prototype, post = worker.postMessage;
  const handler = Object.getOwnPropertyDescriptor(worker, 'onmessage');
  const pending = new Map();
  let armed;
  worker.postMessage = function (request, ...rest) {
    if (armed && request?.type === 'preview') {
      const cage = request.doc.added.map(([, node]) => node).find(node => node.kind === 'subd')?.cage;
      if (cage) {
        pending.set(armed, { worker: this, id: request.id, revision: request.revision, cage });
        armed = undefined;
      }
    }
    return post.call(this, request, ...rest);
  };
  Object.defineProperty(worker, 'onmessage', {
    configurable: true, get: handler.get,
    set(callback) {
      handler.set.call(this, typeof callback !== 'function' ? callback : function (event) {
        for (const pendingReply of pending.values()) {
          if (pendingReply.worker !== this || event.data?.id !== pendingReply.id || !event.data.result || pendingReply.delivered) continue;
          pendingReply.receipt = { id: pendingReply.id, revision: pendingReply.revision, resultRevision: event.data.result.revision,
            ok: event.data.result.ok, cage: pendingReply.cage };
          pendingReply.deliver = () => callback.call(this, event);
          return;
        }
        return callback.call(this, event);
      });
    },
  });
  window.__cageReplyGate = {
    arm(key) {
      if (armed || pending.has(key)) throw Error('A cage preview is already armed or the key is in use.');
      armed = key;
    },
    read(key) { return pending.get(key)?.receipt; },
    async release(key) {
      const entry = pending.get(key);
      if (!entry?.deliver || entry.delivered) throw Error('A real cage preview reply must be held before release.');
      entry.delivered = true;
      entry.deliver();
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    },
  };
}

const arm = key => f.page.evaluate(key => window.__cageReplyGate.arm(key), key);
const release = key => f.page.evaluate(key => window.__cageReplyGate.release(key), key);
async function receive(key, current) {
  const result = await (await f.page.waitForFunction(key => window.__cageReplyGate.read(key), key)).jsonValue();
  assert.equal(result.ok, true);
  assert.equal(result.resultRevision, result.revision);
  assert.deepEqual(result.cage, current.cage);
  return result.revision;
}
async function waitForDone(enabled) {
  await f.page.waitForFunction(enabled => document.querySelector('[aria-label="Done editing cage"]')?.getAttribute('aria-disabled')
    === String(!enabled), enabled);
}
async function verifyDoneRefused(base, current) {
  await waitForDone(false);
  assert.match(await done().getAttribute('aria-description'), /Checking this cage/);
  await done().click({ force: true });
  await done().press('Enter');
  await f.same(base);
  assert.deepEqual(await state(), current);
  await waitForDone(false);
}

async function openCage() {
  await command('edit cage');
  await panel().waitFor();
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await button('Top').click();
  await button('Box', panel()).click();
  await button('Face', panel()).click();
  const p = await f.page.evaluate(() => window.__studioScreenOf([23.75, 32.5, 26]));
  assert.ok(p);
  await f.page.mouse.click(...p);
  const current = await state();
  assert.equal(current.sel.faces.length, 1);
  await panel().getByLabel('Cage drag tool', { exact: true }).selectOption('scale');
  await waitForDone(true);
  return current;
}
async function dragScale(factor, key) {
  const mark = f.page.locator('[data-gizmo="scale"]');
  await mark.waitFor();
  const rect = await mark.boundingBox();
  const x = Math.round(rect.x + rect.width / 2), y = Math.round(rect.y + rect.height / 2);
  await f.page.mouse.move(x, y);
  await f.page.locator('[data-gizmo="scale"][data-active="true"]').waitFor();
  await f.page.mouse.down();
  await f.page.mouse.move(x + Math.round((factor - 1) * 84), y, { steps: 12 });
  await f.page.locator('.gizmo-readout').filter({ hasText: `relative × ${factor}` }).waitFor();
  await arm(key);
  await f.page.mouse.up();
  return state();
}

await f.run(async () => {
  const newContext = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async options => {
    const context = await newContext(options);
    await context.addInitScript(holdActualCageReplies);
    return context;
  };
  await f.newPage();
  await f.page.setViewportSize({ width: 1440, height: 1000 });
  await button('New part').click();
  await f.page.waitForFunction(() => window.__studioDoc.nodes.length === 0);
  await f.ready();
  await command('subd box');
  const hud = f.page.getByRole('dialog', { name: 'SubD box', exact: true });
  for (const [name, value] of [['Width X', 30], ['Depth Y', 20], ['Height Z', 16], ['Quads along a side', 4], ['Centre X', 20], ['Centre Y', 30], ['At Z', 10]]) {
    await hud.getByLabel(name, { exact: true }).fill(String(value));
  }
  await hud.locator('.status.ok').waitFor();
  await button('Apply', hud).click();
  await f.page.waitForFunction(() => window.__studioDoc.nodes.some(n => n.kind === 'subd'));
  await f.ready();
  const base = await f.doc();
  await f.save('unmodified-cage');
  const seed = await openCage();

  f.phase = 'deliver an older original worker reply while the current cage waits';
  const first = await dragScale(1.1, 'first');
  const firstRevision = await receive('first', first);
  assert.equal(first.undo, seed.undo + 1);
  await verifyDoneRefused(base, first);
  const second = await dragScale(0.8, 'current');
  const currentRevision = await receive('current', second);
  assert.ok(currentRevision > firstRevision);
  assert.equal(second.undo, first.undo + 1);
  assert.notDeepEqual(second.cage, first.cage);
  await release('first');
  await verifyDoneRefused(base, second);
  await f.snapshot('older-reply-done-still-blocked');
  await release('current');
  await waitForDone(true);
  assert.deepEqual(await state(), second);
  await f.snapshot('current-reply-done-enabled');
  await done().click();
  await panel().waitFor({ state: 'detached' });
  await f.ready();
  const accepted = await f.doc();
  assert.deepEqual(accepted.nodes[0].cage, second.cage);
  await f.undo(); await f.same(base);
  await f.redo(); await f.same(accepted);
  const saved = await f.save('current-cage-accepted');
  await f.freshOpen(saved.file, accepted, 'current-cage-reopened');

  f.phase = 'discard the cage and deliver its exact result after New part';
  await openCage();
  const discarded = await dragScale(1.1, 'discarded');
  const discardedRevision = await receive('discarded', discarded);
  assert.notDeepEqual(discarded.cage, accepted.nodes[0].cage);
  await button('New part').click();
  const dialog = f.page.getByRole('dialog');
  await dialog.getByText('Discard cage draft and start a new part?', { exact: true }).waitFor();
  await f.snapshot('discard-cage-before-replacement');
  await dialog.getByRole('button', { name: 'Discard changes', exact: true }).click();
  await panel().waitFor({ state: 'detached' });
  await f.page.waitForFunction(() => window.__studioDoc.nodes.length === 0);
  await f.ready();
  const replacement = await f.doc();
  await release('discarded');
  await f.same(replacement);
  assert.equal(await state(), null);
  assert.deepEqual((await f.bodies()).bodies, []);
  await f.snapshot('late-cage-reply-after-new-part');
  await f.undo(); await f.same(accepted);
  assert.equal(await state(), null);
  await f.redo(); await f.same(replacement);
  f.report.observations.push({ firstRevision, currentRevision, discardedRevision, originalWorkerReplies: true,
    olderReplyDidNotEnableDone: true, discardedReplyDidNotRestoreCage: true });
});
