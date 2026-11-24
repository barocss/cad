import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFlow } from './flow-helper.mjs';

const [output, input, option] = process.argv.slice(2);
const baseline = option === '--baseline';
assert.ok(output && input, 'Use a native Keep-mode file from instance-pattern-orientation-browser.mjs');
const f = await createFlow({
  name: 'instance-pattern-orientation-lifecycle', envFrozen: 'PATTERN_LIFECYCLE_FROZEN', output,
  qualification: 'Circular pattern native admission and edit refusal while a real root evaluation waits.',
  initialFiles: [
    'apps/cad-studio/test/instance-pattern-orientation-lifecycle-browser.mjs',
    'apps/cad-studio/src/files/useStudioDocumentFiles.ts',
    'packages/barocss-cad-model/src/engine/migrate.ts',
    'packages/barocss-cad-model/src/assembly/patternCheck.ts',
  ],
  limits: ['Top-level pattern; one stale serialized rotation, one held successful root evaluation, and a late native file read. Only delivery timing changes.'],
});
const panel = () => f.page.getByRole('complementary', { name: 'Instance', exact: true });
const field = () => panel().getByLabel('Pattern orientation', { exact: true });
const select = async () => {
  await f.page.locator('[data-browser-instance-path="cube"]').click();
  await field().waitFor();
};
async function openBytes(name, doc) {
  await f.page.getByLabel('Model file', { exact: true }).setInputFiles({
    name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)),
  });
}
function parentState() {
  return {
    undo: document.querySelector('button[aria-label="Undo"]').disabled,
    redo: document.querySelector('button[aria-label="Redo"]').disabled,
    bounds: window.__studioInstanceBounds(),
    selection: window.__studioSelection,
  };
}
function holdOneRootReply() {
  const proto = Worker.prototype;
  const post = proto.postMessage;
  const onmessage = Object.getOwnPropertyDescriptor(proto, 'onmessage');
  if (!onmessage?.set) throw new Error('Native Worker onmessage required');
  let armed = false, target, held;
  const replies = [];
  proto.postMessage = function (request, ...args) {
    if (armed && request?.type === 'evaluate') {
      armed = false;
      target = { worker: this, id: request.id, revision: request.revision };
    }
    return post.call(this, request, ...args);
  };
  Object.defineProperty(proto, 'onmessage', {
    configurable: true, get: onmessage.get, set(callback) {
      onmessage.set.call(this, callback && function (event) {
        if (target?.worker === this) {
          if (event.data?.id === target.id && event.data?.result) {
            held = { id: target.id, revision: target.revision, actual: event.data.result.revision, ok: event.data.result.ok };
          }
          if (held) {
            replies.push(() => callback.call(this, event));
            return;
          }
        }
        callback.call(this, event);
      });
    },
  });
  window.__holdPatternLifecycle = {
    arm() { armed = true; },
    read: () => held,
    async release() {
      if (!held) throw new Error('No evaluation reply held');
      target = undefined;
      for (const reply of replies.splice(0)) {
        reply();
        await new Promise(done => setTimeout(done, 0));
      }
      held = undefined;
    },
  };
  const read = File.prototype.arrayBuffer;
  let delayNext = false, send, done = false;
  File.prototype.arrayBuffer = async function () {
    const delayed = delayNext && this.name === 'same-pattern.bcad';
    if (delayed) delayNext = false;
    const bytes = await read.call(this);
    if (delayed) {
      await new Promise(resume => { send = resume; });
      done = true;
    }
    return bytes;
  };
  window.__holdPatternFile = {
    arm() { delayNext = true; },
    held: () => !!send,
    release() { if (!send) throw new Error('No file held'); send(); },
    done: () => done,
  };
}

await f.run(async () => {
  await f.newPage();
  if (!baseline) {
    await f.page.addInitScript(holdOneRootReply);
    await f.page.reload();
    await f.ready();
  }
  f.phase = 'Open the accepted Keep-mode file';
  await f.openFile(input, 2);
  await select();
  assert.equal(await field().inputValue(), 'keep');
  const before = await f.doc();
  const beforeState = await f.page.evaluate(parentState);
  assert.deepEqual(before.instances.find(i => i.id === 'pat1-1').rotation, [0, 0, 90]);
  const stale = await readFile(input, 'utf8').then(JSON.parse);
  stale.instances.find(i => i.id === 'pat1-1').rotation = [0, 0, 180];
  f.phase = 'Open the same recipe with one wrong cached pose';
  await openBytes('stale-fixed-bracket.bcad', stale);
  if (baseline) {
    await f.page.waitForFunction(() => window.__studioDoc?.instances?.find(i => i.id === 'pat1-1')?.rotation[2] === 180);
    await f.ready();
    await select();
    assert.equal(await field().inputValue(), 'keep');
    await f.page.waitForFunction(() => window.__studioInstanceBounds()?.find(i => i.id === 'pat1-1')?.min[0] === 0);
    await f.snapshot('01-stale-rotation-admitted', parentState);
    f.report.observations.push({ actual: 'wrong cached 180 degree turn displayed under Keep', required: 90 });
    return;
  }
  await f.waitToast(/PATTERN_VALUE.*occurrence/i);
  await f.same(before);
  assert.equal(await field().inputValue(), 'keep');
  assert.deepEqual(await f.page.evaluate(parentState), beforeState);
  await f.snapshot('01-stale-rotation-refused', parentState);
  await f.dismissToasts();

  f.phase = 'Refuse a pattern Apply while a real root-body move waits';
  const body = f.page.getByRole('complementary', { name: 'Browser', exact: true }).locator('.ol-row > button.ol[title="Double-click to rename"]').first();
  await body.click();
  await f.page.evaluate(() => window.__holdPatternLifecycle.arm());
  await f.page.keyboard.press('ArrowRight');
  await f.page.waitForFunction(() => !!window.__holdPatternLifecycle.read() && window.__studioFresh === false);
  const held = await f.page.evaluate(() => window.__holdPatternLifecycle.read());
  assert.ok(held.ok);
  assert.equal(held.revision, held.actual);
  await select();
  const pending = await f.doc();
  const pendingState = await f.page.evaluate(parentState);
  assert.notDeepEqual(pending.nodes, before.nodes);
  await field().selectOption('rotate');
  await panel().getByRole('button', { name: 'Apply', exact: true }).click();
  await f.waitToast(/Wait for the computation to finish/);
  assert.deepEqual(await f.doc(), pending);
  assert.deepEqual(await f.page.evaluate(parentState), pendingState);
  await f.snapshot('02-pending-apply-refused', parentState);
  await f.page.evaluate(() => window.__holdPatternLifecycle.release());
  await f.same(pending);
  await f.undo();
  await f.same(before);
  await f.redo();
  await f.same(pending);
  assert.equal((await f.doc()).instancePatterns[0].kind, 'circular-fixed');
  await select();
  await field().selectOption('rotate');
  await panel().getByRole('button', { name: 'Apply', exact: true }).click();
  await f.changed(pending);
  const rotating = await f.doc();
  assert.equal(rotating.instancePatterns[0].kind, 'circular');
  assert.deepEqual(rotating.instances.find(i => i.id === 'pat1-1').rotation, [0, 0, 180]);
  await f.snapshot('03-apply-after-evaluation', parentState);

  f.phase = 'Keep the newer same-name Open and discard the old form draft';
  await field().selectOption('keep');
  await f.page.evaluate(() => window.__holdPatternFile.arm());
  await openBytes('same-pattern.bcad', before);
  await f.page.waitForFunction(() => window.__holdPatternFile.held());
  const replacement = structuredClone(rotating);
  replacement.nodes[0].max[0] = 91;
  await openBytes('same-pattern.bcad', replacement);
  await f.same(replacement);
  await select();
  assert.equal(await field().inputValue(), 'rotate');
  const acceptedState = await f.page.evaluate(parentState);
  await f.page.evaluate(() => window.__holdPatternFile.release());
  await f.page.waitForFunction(() => window.__holdPatternFile.done());
  await f.snapshot('04-stale-open-does-not-restore-draft', parentState);
  await f.same(replacement);
  assert.deepEqual(await f.page.evaluate(parentState), acceptedState);
  assert.equal(await field().inputValue(), 'rotate');
  const saved = await f.save('current-circular');
  await f.freshOpen(saved.file, saved.doc, '05-current-document-reopened');
  f.report.observations.push({ held, refusedDocumentAndHistoryUnchanged: true, lateOpenIgnored: true });
});
