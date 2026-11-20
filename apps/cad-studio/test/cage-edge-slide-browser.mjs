import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const pins = [
  'packages/barocss-cad-model/src/subd/cageEdit.ts',
  'packages/barocss-cad-model/src/subd/cageEdgeSlide.ts',
  'apps/cad-studio/src/subd/useCageEditor.ts',
  'apps/cad-studio/src/subd/cageLoopDraft.ts',
  'apps/cad-studio/src/ui/CagePanel.tsx',
];
const f = await createFlow({
  name: 'cage-edge-slide', output: process.argv[2], envFrozen: 'CAGE_SLIDE_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Slide a closed existing loop along both neighboring rows in Studio and reopen the saved solid.',
  limits: ['Desktop Chrome WebGPU, one closed regular box loop. Open and irregular loops are exercised by Model tests.'],
});

const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const panel = () => f.page.getByRole('complementary', { name: 'Cage editor', exact: true });
const cageButton = name => button(name, panel());
const state = () => f.page.evaluate(() => window.__studioCage());
const slide = () => cageButton('Slide loop').click();
const ratio = () => panel().getByRole('spinbutton', { name: 'Slide ratio', exact: true });
const apply = () => cageButton('Apply slide');
const cancel = () => cageButton('Cancel slide preview');
const done = () => cageButton('Done editing cage');

async function command(text) {
  await f.page.getByText('barocss', { exact: true }).click();
  await f.command(text);
}

function delayPreviewReply() {
  const proto = Worker.prototype;
  const post = proto.postMessage;
  const handler = Object.getOwnPropertyDescriptor(proto, 'onmessage');
  let armed = false, target, reply, deliver;
  proto.postMessage = function (request, ...args) {
    if (armed && request.type === 'preview') {
      armed = false;
      target = { worker: this, id: request.id };
    }
    return post.call(this, request, ...args);
  };
  Object.defineProperty(proto, 'onmessage', {
    ...handler,
    set(callback) {
      handler.set.call(this, callback && function (event) {
        if (target?.worker === this && event.data?.id === target.id && event.data?.result) {
          reply = { id: target.id, ok: event.data.result.ok };
          deliver = reject => callback.call(this, reject ? new MessageEvent('message', {
            data: { ...event.data, result: {
              ok: false, revision: event.data.result.revision, wallTime: event.data.result.wallTime,
              error: { title: 'Injected slide evaluation refusal', hint: 'Adjust the ratio.', detail: '' },
            } },
          }) : event);
          target = null;
          return;
        }
        callback.call(this, event);
      });
    },
  });
  window.__slideHold = {
    arm() { armed = true; reply = undefined; },
    read: () => reply,
    release(reject = false) { deliver(reject); deliver = undefined; },
  };
}

await f.run(async () => {
  const newContext = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async options => {
    const context = await newContext(options);
    await context.addInitScript(delayPreviewReply);
    return context;
  };
  await f.newPage();
  await button('New part').click();
  await f.page.waitForFunction(() => window.__studioDoc.nodes.length === 0);
  await f.ready();
  await command('subd box');
  const hud = f.page.getByRole('dialog', { name: 'SubD box', exact: true });
  for (const [name, value] of [['Width X', 30], ['Depth Y', 20], ['Height Z', 16], ['Quads along a side', 4], ['Centre X', 0], ['Centre Y', 0], ['At Z', 0]]) {
    await hud.getByLabel(name, { exact: true }).fill(String(value));
  }
  await hud.locator('.status.ok').waitFor();
  await button('Apply', hud).click();
  await f.page.waitForFunction(() => window.__studioDoc.nodes.some(node => node.kind === 'subd'));
  await f.ready();
  const base = await f.doc();
  const initialBody = (await f.bodies()).bodies[0];

  await command('edit cage');
  await panel().waitFor();
  await button('View cube directions').click();
  await f.page.getByRole('menuitem', { name: 'Top', exact: true }).click();
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await cageButton('Box').click();
  await cageButton('Vertex').click();
  await cageButton('Edge').click();
  const pick = await f.page.evaluate(() => window.__studioScreenOf([0, 2.5, 16]));
  assert.ok(pick);
  await f.page.mouse.click(...pick);
  await f.page.waitForFunction(() => window.__studioCage().sel.edges.length === 1);
  await cageButton('Loop').click();
  const loop = await state();
  const selected = new Set(loop.sel.edges.flat());
  assert.equal(selected.size, 16);
  assert.equal(loop.sel.edges.length, 16);
  assert.equal(loop.undo, 0);
  assert.equal(loop.cage.positions.length / 3, 98);
  assert.equal(loop.cage.faces.length, 96);
  for (const vertex of selected) assert.equal(loop.cage.positions[3 * vertex], 0);

  async function change(value, expectedX) {
    await ratio().fill(String(value));
    const edited = await state();
    assert.deepEqual(edited.sel, loop.sel);
    assert.deepEqual(edited.cage.faces, loop.cage.faces);
    assert.deepEqual(edited.cage.creases, loop.cage.creases);
    assert.equal(edited.cage.positions.length, loop.cage.positions.length);
    edited.cage.positions.forEach((coordinate, i) => {
      const expected = i % 3 === 0 && selected.has(Math.floor(i / 3)) ? expectedX : loop.cage.positions[i];
      assert.ok(Math.abs(coordinate - expected) < 1e-9, `coordinate ${i}: ${coordinate} vs ${expected}`);
    });
    assert.equal(edited.undo, Number(value !== 0));
    assert.equal(await done().getAttribute('aria-disabled'), 'true');
    await f.same(base);
    f.report.observations.push({ ratio: value, x: expectedX, vertices: selected.size, undo: edited.undo });
    return edited;
  }

  f.phase = 'preview both directions and refuse invalid ratios';
  await slide();
  await change(0.25, -1.875);
  await change(-0.5, 3.75);
  await change(0, 0);
  for (const invalid of ['', '1', '-1', '1.1']) {
    await ratio().fill(invalid);
    assert.deepEqual(await state(), loop);
    assert.ok(await apply().isDisabled());
  }

  f.phase = 'cancel while a successful preview reply is held';
  await f.page.evaluate(() => window.__slideHold.arm());
  await change(-0.5, 3.75);
  await f.page.waitForFunction(() => window.__slideHold.read()?.ok === true);
  const held = await f.page.evaluate(() => window.__slideHold.read());
  assert.ok(await apply().isDisabled());
  await cancel().click();
  assert.deepEqual(await state(), loop);
  await f.page.evaluate(() => window.__slideHold.release());
  await f.same(base);
  assert.deepEqual(await state(), loop);
  assert.equal(await ratio().count(), 0);
  f.report.observations.push({ held, acceptedDocumentRestored: true });

  f.phase = 'verify baseline and Done guard after an injected evaluation failure';
  await slide();
  await f.page.evaluate(() => window.__slideHold.arm());
  await change(0.25, -1.875);
  await f.page.waitForFunction(() => window.__slideHold.read()?.ok === true);
  await f.page.evaluate(() => window.__slideHold.release(true));
  await panel().getByText(/Injected slide evaluation refusal/).waitFor();
  assert.deepEqual(await state(), loop);
  assert.ok(await apply().isDisabled());
  assert.equal(await done().getAttribute('aria-disabled'), 'true');
  await f.same(base);
  await cancel().click();
  f.report.observations.push({ injectedEvaluationFailureRestoredBaseline: true });

  f.phase = 'apply an existing loop slide and check cage history';
  await slide();
  const draft = await change(0.25, -1.875);
  await f.page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent === 'Apply slide' && !b.disabled));
  await f.snapshot('01-quarter-slide');
  await apply().click();
  assert.deepEqual(await state(), draft);
  await cageButton('Undo cage step').click();
  assert.deepEqual(await state(), loop);
  await slide();
  await change(-0.5, 3.75);
  await ratio().press('Escape');
  assert.deepEqual(await state(), loop);
  await slide();
  await change(0, 0);
  await apply().click();
  assert.deepEqual(await state(), loop);
  await cageButton('Redo cage step').click();
  assert.deepEqual(await state(), draft);
  await button('Iso').click();
  await f.snapshot('02-applied-loop');

  f.phase = 'accept, undo, redo, and reopen the native solid';
  await f.page.waitForFunction(() => document.querySelector('[aria-label="Done editing cage"]')?.getAttribute('aria-disabled') === 'false');
  await done().click();
  await panel().waitFor({ state: 'detached' });
  await f.changed(base);
  const accepted = await f.doc();
  assert.deepEqual(accepted.nodes.find(node => node.kind === 'subd').cage, draft.cage);
  const evaluated = await f.bodies();
  assert.equal(evaluated.bodies.length, 1);
  const [{ volume, centroid }] = evaluated.bodies;
  assert.ok(volume > 0);
  assert.ok(Math.abs(centroid[0] - initialBody.centroid[0]) > 1e-4);
  await f.undo();
  await f.same(base);
  await f.redo();
  await f.same(accepted);
  const saved = await f.save('loop-slid');
  await f.freshOpen(saved.file, accepted, '03-fresh-open');
  const reopened = await f.bodies();
  assert.equal(reopened.bodies.length, 1);
  assert.ok(Math.abs(reopened.bodies[0].volume - volume) < 1e-6);
  const reopenedCentroid = reopened.bodies[0].centroid;
  assert.ok(reopenedCentroid.every((v, i) => Math.abs(v - centroid[i]) < 1e-9));
  f.report.observations.push({ initialBody, volume, centroid, reopened: reopened.bodies[0] });
});
