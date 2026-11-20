// EXTRUDE_JOIN_SOURCE_FROZEN=1 node test/extrude-join-suggestion-browser.mjs /absolute/evidence
import assert from 'node:assert/strict';
import { isAbsolute, relative, resolve } from 'node:path';
import { createFlow } from './flow-helper.mjs';

const output = process.argv[2];
const repo = resolve(import.meta.dirname, '../../..');
assert.ok(output && isAbsolute(output) && relative(repo, output).startsWith('../'), 'Use an evidence directory outside the repo');
const pins = [
  'apps/cad-studio/test/extrude-join-suggestion-browser.mjs',
  'apps/cad-studio/test/flow-helper.mjs',
  'apps/cad-studio/src/ui/Hud.tsx',
  'apps/cad-studio/src/App.tsx',
  'apps/cad-studio/src/app/commandState.ts',
  'apps/cad-studio/src/engine/client.ts',
  'apps/cad-studio/src/engine/engine.worker.ts',
  'packages/barocss-cad-model/src/app/commands.ts',
  'packages/barocss-cad-model/src/app/profileCommands.ts',
];
const f = await createFlow({
  name: 'extrude-join-suggestion', output, envFrozen: 'EXTRUDE_JOIN_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: '#739 Desktop Extrude suggestions, explicit operations, and native readback',
  limits: ['Ordinary upright rectangular solids and single XY rectangles. The timing controls hold an unmodified native volumes reply.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
import { brepMassProperties, checkBrep } from '@barocss/cad';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
console.log(JSON.stringify(partBreps(doc).map(({ key, brep }) => ({
  key, valid: checkBrep(brep, { strict: true }).valid,
  kinds: brep.bodies.map(body => body.kind), closed: brep.shells.map(shell => shell.closed),
  volume: brepMassProperties(brep, 1).volume,
}))));
`,
});

const profile = (id, min, max, z) => ({
  id, kind: 'sketch', profile: 'rectangle', min, max,
  ...(z === undefined ? {} : { plane: { origin: [0, 0, z], normal: [0, 0, 1], xAxis: [1, 0, 0] } }),
});
const ref = node => ({ node, side: 'solid' });
const seed = (z, { hidden = false, multiple = false, anchored = false } = {}) => ({
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {},
  nodes: [
    profile('n0', [0, 0], [multiple ? 10 : 20, 20]),
    { id: 'n1', kind: 'extrude', sketch: 0, height: 10 },
    ...(multiple ? [profile('n2', [10, 0], [20, 20]), { id: 'n3', kind: 'extrude', sketch: 2, height: 10 }] : []),
    { ...profile(multiple ? 'n4' : 'n2', [5, 5], [15, 15], z), ...(anchored ? { on: ref(1) } : {}) },
  ],
  outputs: { b1: ref(1), ...(multiple ? { b3: ref(3) } : {}) },
  bodies: { b1: { name: 'Stock A', ...(hidden ? { hidden: true } : {}) }, ...(multiple ? { b3: { name: 'Stock B' } } : {}) },
  nextId: multiple ? 5 : 3,
});

const button = name => f.hud().getByRole('button', { name, exact: true });
const operation = () => f.hud().getByRole('combobox', { name: 'Operation', exact: true });
const distance = () => f.hud().getByLabel('Distance', { exact: true });
const join = () => operation().locator('option').filter({ hasText: /^Join to Stock A$/ });
const suggestion = () => f.hud().getByText(/Suggested.*Join to Stock A/i);
const selected = () => operation().evaluate(select => select.selectedOptions[0]?.label);
const history = () => f.page.evaluate(() => ({
  controls: ['Undo', 'Redo'].map(name => document.querySelector(`button[aria-label="${name}"]`).disabled),
  rows: [...document.querySelectorAll('.history .hs')].map(row => row.getAttribute('aria-label')),
  dirty: !!document.querySelector('[aria-label="Unsaved changes"]'),
}));
const framePaint = () => f.page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));

async function open(doc, label) {
  f.phase = `Open ${label}`;
  await f.openFile({ name: `${label}.bcad`, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) }, doc.nodes.length);
  await f.same(doc);
}

async function start(doc, height, label) {
  const index = doc.nodes.length - 1;
  f.phase = `Select the finished rectangle for ${label}`;
  const historyBar = f.page.getByRole('group', { name: 'History', exact: true });
  await historyBar.getByRole('button', { name: 'Sketch · rectangle', exact: true }).click();
  await f.editor().waitFor();
  await f.closeEditor();
  const picked = await f.page.evaluate(() => window.__studioSelection.selection.sketches);
  assert.deepEqual(picked, [index]);
  f.phase = `Preview ${label}`;
  await f.openExtrudeHud();
  if (height !== 8) await distance().fill(String(height));
  await f.page.waitForFunction(() => document.querySelector('.hud .status')?.textContent === 'preview');
}

async function cancel() {
  await button('Cancel').click();
  await f.hud().waitFor({ state: 'hidden' });
}

async function apply(before) {
  await button('Apply').click();
  await f.changed(before);
  await f.hud().waitFor({ state: 'hidden' });
  return f.doc();
}

async function verifyVolumes(label, doc, volumes) {
  const expected = Object.entries(volumes).sort(([a], [b]) => a.localeCompare(b));
  const native = await f.inspect(label, doc);
  const studio = (await f.bodies()).bodies;
  for (const set of [native, studio]) {
    assert.deepEqual(set.map(body => body.key).sort(), expected.map(([key]) => key));
    for (const [key, volume] of expected) {
      const actual = set.find(body => body.key === key).volume;
      assert.ok(Number.isFinite(actual) && Math.abs(actual - volume) < 1e-8, `${key}: ${actual} versus ${volume}`);
    }
  }
  for (const body of native) {
    assert.equal(body.valid, true);
    assert.deepEqual(body.kinds, ['solid']);
    assert.deepEqual(body.closed, [true]);
  }
  f.report.observations.push({ label, expectedVolumesMm3: volumes, native, studio, toleranceMm3: 1e-8 });
}

async function useKeyboard(choice, key) {
  await operation().press(key);
  assert.equal(await selected(), choice);
}

async function checkJoined(label, doc, original) {
  assert.deepEqual(doc.nodes.slice(0, 3), original.nodes);
  assert.deepEqual(doc.bodies, original.bodies);
  assert.deepEqual(doc.nodes[3], { kind: 'extrude', id: 'n3', sketch: 2, height: 5 });
  assert.equal(doc.nodes[4].id, 'n4');
  assert.equal(doc.nodes[4].kind, 'union');
  assert.deepEqual(doc.nodes[4].left, ref(1));
  assert.deepEqual(doc.nodes[4].right, ref(3));
  assert.deepEqual(doc.outputs, { b4: ref(4) });
  await verifyVolumes(label, doc, { b4: 20 * 20 * 10 + 10 * 10 * (5 - (10 - 8)) });
}

function installVolumeHold() {
  const worker = Worker.prototype;
  const onMessage = Object.getOwnPropertyDescriptor(worker, 'onmessage');
  if (!onMessage?.set) throw new Error('Worker onmessage setter required');
  const post = worker.postMessage;
  const replies = [];
  const heights = new Map();
  let armed = false;
  let request;
  let held;
  worker.postMessage = function (message, ...args) {
    if (message?.type === 'volumes') {
      const tool = message.doc.ids[message.intersection - 1];
      const node = message.doc.added.find(([id]) => id === tool)?.[1];
      heights.set(message.id, node?.height);
      if (armed) {
        armed = false;
        request = { worker: this, id: message.id };
      }
    }
    return Reflect.apply(post, this, [message, ...args]);
  };
  Object.defineProperty(worker, 'onmessage', {
    configurable: true, get: onMessage.get,
    set(callback) {
      onMessage.set.call(this, callback && function (event) {
        const { id, volumes } = event.data;
        if (volumes) {
          const blocked = this === request?.worker && id === request.id;
          replies.push({ id, height: heights.get(id), volumes, blocked });
          heights.delete(id);
          if (blocked) {
            held = () => callback.call(this, event);
            request = undefined;
            return;
          }
        }
        callback.call(this, event);
      });
    },
  });
  window.__extrudeJoinVolumeHold = {
    arm() {
      if (armed || request || held) throw new Error('Previous native volumes reply has not been released');
      armed = true;
    },
    read: () => replies,
    release() {
      if (!held) throw new Error('No native volumes reply to release');
      const deliver = held;
      held = undefined;
      deliver();
    },
  };
}

const armHold = () => f.page.evaluate(() => {
  window.__extrudeJoinVolumeHold.arm();
  return window.__extrudeJoinVolumeHold.read().length;
});
const releaseHold = () => f.page.evaluate(() => window.__extrudeJoinVolumeHold.release());

async function readHeld(from, height, expected) {
  const handle = await f.page.waitForFunction(start => window.__extrudeJoinVolumeHold.read().slice(start).find(reply => reply.blocked), from);
  const reply = await handle.jsonValue();
  assert.equal(reply.volumes.ok, true);
  assert.equal(reply.height, height);
  const actual = reply.volumes.volumes.find(body => body.key === 'b4')?.volume;
  assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) < 1e-8, `Held overlap ${actual} versus ${expected}`);
  return reply;
}

await f.run(async () => {
  await f.newPage();
  const original = seed(8);
  await open(original, 'stock-and-independent-rectangle');
  const before = await history();
  await start(original, 5, 'Stock A recommendation');
  await join().waitFor({ state: 'attached' });
  await suggestion().waitFor({ state: 'visible' });
  assert.equal(await selected(), 'New body');
  assert.deepEqual(await f.doc(), original);
  assert.deepEqual(await history(), before);
  await f.snapshot('01-new-result-with-join-recommendation');

  f.phase = 'Choose Join and then choose New using the keyboard';
  await distance().focus();
  await f.page.keyboard.press('Tab');
  await f.page.keyboard.press('Tab');
  assert.equal(await operation().evaluate(select => select === document.activeElement), true);
  await useKeyboard('Join to Stock A', 'ArrowDown');
  await useKeyboard('New body', 'ArrowUp');
  const separate = await apply(original);
  assert.deepEqual(separate.nodes.slice(0, 3), original.nodes);
  assert.deepEqual(separate.nodes[3], { kind: 'extrude', id: 'n3', sketch: 2, height: 5 });
  assert.deepEqual(separate.outputs, { b1: ref(1), b3: ref(3) });
  await verifyVolumes('explicit-new', separate, { b1: 20 * 20 * 10, b3: 10 * 10 * 5 });
  await f.undo();
  await f.same(original);
  await f.redo();
  await f.same(separate);
  await f.undo();
  await f.same(original);

  await start(original, 5, 'Explicit Join to Stock A');
  await join().waitFor({ state: 'attached' });
  await useKeyboard('Join to Stock A', 'ArrowDown');
  await suggestion().waitFor({ state: 'hidden' });
  await f.page.waitForFunction(() => document.querySelector('.hud .status')?.textContent === 'preview');
  assert.deepEqual(await f.doc(), original);
  await f.snapshot('02-explicit-join-preview');
  const joined = await apply(original);
  await checkJoined('explicit-join', joined, original);
  await f.undo();
  await f.same(original);
  await verifyVolumes('join-undo', original, { b1: 4000 });
  await f.redo();
  await f.same(joined);
  await checkJoined('join-redo', joined, original);
  const saved = await f.save('stock-joined');
  await f.freshOpen(saved.file, joined, '03-reopened-join');
  await checkJoined('join-reopened', await f.doc(), original);

  await f.context.addInitScript(installVolumeHold);
  await f.page.reload();
  await f.page.waitForSelector('.viewport[data-renderer="webgpu"]');
  await f.ready();
  for (const [label, doc] of [
    ['coplanar contact', seed(10)], ['one mm gap', seed(11)],
    ['hidden overlap', seed(8, { hidden: true })], ['two overlapping targets', seed(8, { multiple: true })],
  ]) {
    await open(doc, label);
    const state = await history();
    const replyCount = await f.page.evaluate(() => window.__extrudeJoinVolumeHold.read().length);
    await start(doc, 5, label);
    if (label === 'coplanar contact' || label === 'one mm gap') {
      const handle = await f.page.waitForFunction(start => window.__extrudeJoinVolumeHold.read()
        .slice(start).find(reply => reply.height === 5), replyCount);
      const reply = await handle.jsonValue();
      assert.equal(reply.volumes.ok, true);
      assert.equal(reply.volumes.emptyIntersection, 'b4');
      f.report.observations.push({ label, reply });
    }
    const controls = await f.snapshot('no-offer-' + label.replaceAll(' ', '-'));
    assert.doesNotMatch(controls.hud, /Join to Stock/);
    if (await operation().count()) assert.equal(await selected(), 'New body');
    await cancel();
    assert.deepEqual(await f.doc(), doc);
    assert.deepEqual(await history(), state);
  }

  const anchored = seed(10, { anchored: true });
  await open(anchored, 'anchored-rectangle');
  await start(anchored, 5, 'anchored default');
  assert.equal(await selected(), 'Join to body');
  assert.equal(await join().count(), 0);
  const anchorResult = await apply(anchored);
  assert.deepEqual(anchorResult.nodes[4].left, ref(1));
  assert.deepEqual(anchorResult.nodes[4].right, ref(3));
  await verifyVolumes('anchored-default', anchorResult, { b4: 4500 });

  const below = seed(-2);
  await open(below, 'independent-rectangle-below-stock');
  await start(below, 5, 'valid target before depth edit');
  await join().waitFor({ state: 'attached' });
  await useKeyboard('Join to Stock A', 'ArrowDown');
  await distance().fill('1');
  await f.hud().getByText(/join target.*unavailable/i).waitFor();
  assert.equal(await selected(), 'Selected body unavailable');
  assert.equal(await operation().inputValue(), 'join:b1');
  assert.equal(await button('Apply').isEnabled(), false);
  await distance().press('Enter');
  assert.deepEqual(await f.doc(), below);
  await f.snapshot('04-invalid-join-after-depth-change');
  await useKeyboard('New body', 'ArrowUp');
  const later = await armHold();
  await distance().fill('5');
  const current = await readHeld(later, 5, 300);
  assert.equal(await join().count(), 0);
  assert.equal(await selected(), 'New body');
  await releaseHold();
  await join().waitFor({ state: 'attached' });
  await suggestion().waitFor({ state: 'visible' });
  assert.equal(await selected(), 'New body');
  f.report.observations.push({ label: 'current delayed reply preserves explicit New', reply: current });
  const recovered = await apply(below);
  assert.deepEqual(recovered.outputs, { b1: ref(1), b3: ref(3) });
  await verifyVolumes('explicit-new-after-depth-invalidation', recovered, { b1: 4000, b3: 500 });

  for (const action of ['depth changed', 'cancelled']) {
    await open(below, action);
    const state = await history();
    const from = await armHold();
    await start(below, 8, action);
    const delayed = await readHeld(from, 8, 600);
    assert.equal(await join().count(), 0);
    if (action === 'cancelled') {
      await cancel();
    } else {
      await distance().fill('1');
      await f.page.waitForFunction(() => document.querySelector('.hud .status')?.textContent === 'preview');
      assert.equal(await button('Apply').isEnabled(), true);
    }
    f.phase = `Release the actual native overlap reply after ${action}`;
    await releaseHold();
    await framePaint();
    assert.equal(await join().count(), 0);
    if (action === 'depth changed') await cancel();
    assert.equal(await f.hud().count(), 0);
    assert.deepEqual(await f.doc(), below);
    assert.deepEqual(await history(), state);
    f.report.observations.push({ label: action, delayed, docAndHistoryUnchanged: true });
  }
  assert.deepEqual(f.report.downloads.map(download => download.suggestedFilename), ['stock-and-independent-rectangle.bcad']);
});
