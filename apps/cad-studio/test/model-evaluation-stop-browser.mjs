import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createFlow } from './flow-helper.mjs';
import { installD321NativeWorkerHold } from './stop-work-native-worker.mjs';

const hook = 'apps/cad-studio/src/state/useStudioModelEvaluation.ts';
const pins = ['apps/cad-studio/src/App.tsx', 'apps/cad-studio/test/model-evaluation-stop-browser.mjs',
  'apps/cad-studio/test/stop-work-native-worker.mjs', ...(existsSync(new URL('../src/state/useStudioModelEvaluation.ts', import.meta.url)) ? [hook] : [])];
const f = await createFlow({
  name: 'model-evaluation-stop', output: process.argv[2], envFrozen: 'D1897_SOURCE_FROZEN',
  qualification: 'Stop one owned Box evaluation after the real Worker returns, then replay it from History.',
  limits: ['Desktop Studio. A test-only FIFO delays delivery of the real Worker result and mass messages.'],
  initialFiles: pins, requiredFrozen: pins,
  snapshotExtra: () => ({
    trace: window.__d321Worker.snapshot(), ready: window.__studioFresh,
    undo: document.querySelector('button[aria-label="Undo"]')?.getAttribute('data-tip'),
    redo: document.querySelector('button[aria-label="Redo"]')?.getAttribute('data-tip'),
  }),
});
const seed = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 2,
  nodes: [
    { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [40, 20] },
    { id: 'n1', kind: 'extrude', sketch: 0, height: 5 },
  ],
  outputs: { b1: { node: 1, side: 'solid' } },
};
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
function checkVolumes(snapshot, expected) {
  assert.equal(snapshot.ready, true);
  assert.equal(snapshot.bodies.massReady, true);
  const actual = snapshot.bodies.bodies.map(body => body.volume).sort((a, b) => a - b);
  assert.equal(actual.length, expected.length);
  actual.forEach((value, i) => assert.ok(Math.abs(value - expected[i]) < 1e-7, `${value} vs ${expected[i]}`));
}

await f.run(async () => {
  const newContext = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async options => {
    const context = await newContext(options);
    await context.addInitScript(installD321NativeWorkerHold);
    return context;
  };
  await f.newPage();
  await f.page.getByLabel('Model file', { exact: true }).setInputFiles({
    name: 'evaluation-stop-seed.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)),
  });
  await f.same(seed);
  const original = await f.snapshot('01-current-stock');
  checkVolumes(original, [4000]);

  f.phase = 'A new Box is pending behind one unchanged real Worker result';
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.page.keyboard.press('b');
  const hud = f.page.getByRole('dialog', { name: 'Box', exact: true });
  await hud.waitFor();
  for (const [label, value] of [['Width X', 10], ['Depth Y', 10], ['Height Z', 10], ['At X', 50], ['At Y', 0]])
    await hud.getByLabel(label, { exact: true }).fill(String(value));
  await f.page.waitForFunction(() => document.querySelector('.hud .status')?.textContent === 'preview');
  await f.page.evaluate(() => window.__d321Worker.arm());
  await button('Apply', hud).click();
  await f.page.waitForFunction(() => {
    const { claimed, events } = window.__d321Worker.snapshot();
    return window.__studioDoc?.nodes?.length === 4 && claimed
      && events.some(event => event.kind === 'held' && event.key === claimed.key && event.id === claimed.id && event.resultOK)
      && events.some(event => event.kind === 'held' && event.key === claimed.key && event.masses);
  }, null, { timeout: 20000 });
  const stop = button('Cancel the computation');
  await stop.waitFor();
  const pending = await f.snapshot('02-actual-result-and-mass-held');
  assert.equal(pending.ready, false);
  assert.deepEqual(pending.doc.nodes.slice(0, 2), seed.nodes);

  f.phase = 'Stop restores the original geometry and discards the old Worker delivery';
  await stop.click();
  await f.same(seed);
  const stopped = await f.snapshot('03-stop-restores-original');
  checkVolumes(stopped, [4000]);
  const { claimed, events } = stopped.trace;
  const terminated = events.find(event => event.kind === 'terminate' && event.key === claimed.key);
  assert.ok(terminated?.discardedHeld >= 2);
  const claimedEvent = events.find(event => event.kind === 'claimed' && event.key === claimed.key && event.id === claimed.id);
  assert.equal(events.some(event => event.kind === 'delivery-to-client' && event.key === claimed.key && event.sequence > claimedEvent.sequence), false);
  const recovered = events.find(event => event.kind === 'submit' && event.type === 'evaluate' && event.key !== claimed.key && event.sequence > terminated.sequence);
  assert.ok(recovered?.nativeSource?.epoch > claimed.nativeSource.epoch);
  assert.equal(recovered.sourceNodeCount, seed.nodes.length);

  await f.dismissToasts();
  await f.redo();
  await f.same(pending.doc);
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  const replay = await f.snapshot('04-redo-evaluates-box-on-new-worker');
  checkVolumes(replay, [1000, 4000]);
  await f.undo();
  await f.same(seed);
  checkVolumes(await f.snapshot('05-undo-restores-stock'), [4000]);
});
