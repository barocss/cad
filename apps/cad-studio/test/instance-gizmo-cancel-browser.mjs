import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { installD523PlacedReplyScheduler } from './placed-worker-reply-scheduler.mjs';

const repo = resolve(import.meta.dirname, '../../..');
const mode = process.argv[3] ?? 'escape';
assert.ok(['escape', 'lost-capture', 'switch', 'commit', 'undo-pending'].includes(mode));
const fixture = 'apps/cad-studio/test/fixtures/instance-looks.bcad';
const f = await createFlow({
  name: 'instance-gizmo-cancellation',
  output: process.argv[2],
  envFrozen: 'INSTANCE_GIZMO_SOURCE_FROZEN',
  qualification: 'Compare the accepted occurrence placement, renderer picks and history when an X-axis drag is committed or interrupted.',
  initialFiles: [import.meta.filename, fixture, 'apps/cad-studio/test/placed-worker-reply-scheduler.mjs'],
  requiredFrozen: ['apps/cad-studio/src/App.tsx', 'apps/cad-studio/src/viewport/Viewport.tsx'],
  limits: ['Desktop Chrome/WebGPU, Top orthographic, one X axis and static unmated cubes. X-axis move only.',
    'Lost capture, when selected, uses the public DOM releasePointerCapture API on an observed real mouse pointer.'],
});
const button = name => f.page.getByRole('button', { name, exact: true });
const row = id => f.page.locator(`[data-browser-instance-path="${id}"]`);
const move = () => f.page.locator('[data-gizmo="moveX"]');
const reasons = 'CAD display modes are not available while an instance is dragged.';
const points = [[10, 10, 20], [33, 10, 20], [60, 10, 20]];
const sourcePicks = ['c1', null, 'c2'];
const dragPicks = [null, 'c1', 'c2'];
const read = () => f.page.evaluate(points => {
  const button = label => {
    const el = document.querySelector(`button[aria-label="${label}"]`);
    return { disabled: el?.disabled, hint: el?.getAttribute('data-tip') };
  };
  const view = document.querySelector('.viewport');
  const display = document.querySelector('[aria-label="CAD display mode"]');
  return {
    doc: JSON.parse(JSON.stringify(window.__studioDoc)),
    history: {
      undo: button('Undo'), redo: button('Redo'),
      rows: [...document.querySelectorAll('.history .hs')].map(el => el.textContent),
      dirty: !!document.querySelector('[aria-label="Unsaved changes"]'),
    },
    reason: view?.getAttribute('data-display-mode-reason'),
    displayStatus: document.querySelector('#cad-display-mode-status')?.textContent?.trim() ?? null,
    displayDisabled: display?.disabled,
    dragging: !!document.querySelector('[data-gizmo][data-dragging="true"]'),
    selection: [...document.querySelectorAll('[data-browser-instance-path].sel')].map(el => el.dataset.browserInstancePath),
    picks: points.map(p => window.__studioInstanceAt?.(p)?.id ?? null),
  };
}, points);
const screenshot = async label => {
  const state = await f.snapshot(label, () => {
    const view = document.querySelector('.viewport');
    return { displayScope: view?.getAttribute('data-display-mode-reason') };
  });
  assert.ok(state.doc);
};

await f.run(async () => {
  if (mode === 'undo-pending') {
    const newContext = f.browser.newContext.bind(f.browser);
    f.browser.newContext = async options => {
      const context = await newContext(options);
      await context.addInitScript(installD523PlacedReplyScheduler);
      return context;
    };
  }
  await f.newPage();
  f.phase = 'Open both static instances and establish renderer picks';
  await f.openFile(resolve(repo, fixture), 2);
  await button('Top').click();
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await row('c1').click();
  await move().waitFor();
  await f.page.waitForFunction(() => new Promise(resolve => {
    let previous = '', count = 0;
    const frame = () => {
      const key = JSON.stringify(window.__studioCamera?.());
      count = key === previous ? count + 1 : 0;
      previous = key;
      if (count >= 12) resolve(true);
      else requestAnimationFrame(frame);
    };
    frame();
  }));
  if (await button('Display and previews').getAttribute('aria-expanded') !== 'true') await button('Display and previews').click();
  const display = f.page.getByLabel('CAD display mode', { exact: true });
  await display.waitFor();
  await f.page.waitForFunction(({ points, expected }) =>
    JSON.stringify(points.map(p => window.__studioInstanceAt?.(p)?.id ?? null)) === JSON.stringify(expected),
  { points, expected: sourcePicks });
  const before = await read();
  assert.deepEqual(before.doc.instances.map(i => i.id), ['c1', 'c2']);
  assert.deepEqual(before.selection, ['c1']);
  assert.equal(before.reason, null);
  assert.equal(before.displayDisabled, false);
  await screenshot('01-before');

  f.phase = 'Drag the actual Cube 1 X arrow while keeping the pointer held';
  if (mode === 'lost-capture') {
    await f.page.locator('canvas.vp-canvas').evaluate(el => {
      el.addEventListener('pointerdown', event => { el.dataset.probePointer = String(event.pointerId); });
    });
  }
  const gesture = await move().evaluate(mark => {
    const svg = mark.closest('svg').getBoundingClientRect();
    const points = [...mark.querySelector('polygon').points];
    const x = svg.left + points.reduce((sum, p) => sum + p.x, 0) / points.length;
    const y = svg.top + points.reduce((sum, p) => sum + p.y, 0) / points.length;
    const from = window.__studioProject([10, 10, 20]), to = window.__studioProject([33, 10, 20]);
    return { start: [x, y], end: [x + to[0] - from[0], y + to[1] - from[1]], onCanvas: document.elementFromPoint(x, y)?.matches('canvas.vp-canvas') === true };
  });
  assert.equal(gesture.onCanvas, true, 'the projected arrow must receive actual canvas input');
  await f.page.mouse.move(...gesture.start);
  await f.page.locator('[data-gizmo="moveX"][data-active="true"]').waitFor();
  // Clicking a handle without movement must not commit or leave a preview.
  await f.page.mouse.click(...gesture.start);
  const clicked = await read();
  assert.deepEqual(clicked.doc, before.doc);
  assert.deepEqual(clicked.history, before.history);
  assert.deepEqual(clicked.picks, before.picks);
  assert.equal(clicked.reason, null);
  await f.page.mouse.down();
  await f.page.mouse.move(...gesture.end, { steps: 12 });
  await f.page.locator('[data-gizmo="moveX"][data-dragging="true"]').waitFor();
  await f.page.waitForFunction(({ points, expected }) =>
    JSON.stringify(points.map(p => window.__studioInstanceAt?.(p)?.id ?? null)) === JSON.stringify(expected),
  { points, expected: dragPicks });
  const during = await read();
  assert.equal(during.reason, reasons);
  assert.match(during.displayStatus ?? '', /while an instance is dragged/);
  assert.equal(during.displayDisabled, true);
  assert.deepEqual(during.doc, before.doc, 'pointer motion must only preview');
  assert.deepEqual(during.history, before.history);
  await screenshot('02-drag-pointer-held');

  if (mode === 'undo-pending') {
    f.phase = 'Undo while the committed placement awaits its native result';
    await f.page.evaluate(() => window.__d523Placed.arm({ onlyPlaced: true }));
    await f.page.mouse.up();
    const receipt = await f.page.waitForFunction(() => {
      const { claimed, events } = window.__d523Placed.snapshot();
      return claimed && events.find(e => e.kind === 'native-event-held' && e.id === claimed.id && e.key === claimed.key && e.resultOK);
    });
    assert.equal((await f.doc()).instances[0].position[0], 23);
    assert.deepEqual((await read()).picks, dragPicks);
    await button('Undo').click();
    await f.same(before.doc);
    const undone = await read();
    await f.page.evaluate(() => window.__d523Placed.release());
    await f.page.waitForFunction(({ id, key }) => window.__d523Placed.snapshot().events.some(e =>
      e.kind === 'client-callback-reached' && e.delivery === 'held-original-event' && e.id === id && e.key === key), await receipt.jsonValue());
    await screenshot('03-undo-with-delayed-placement');
    const afterReply = await read();
    for (const sample of [undone, afterReply]) {
      assert.deepEqual(sample.doc, before.doc);
      assert.deepEqual(sample.picks, sourcePicks);
      assert.equal(sample.reason, null);
    }
    return;
  }
  if (mode === 'commit') {
    f.phase = 'Commit X placement, undo, redo and reopen';
    await f.page.mouse.up();
    await f.changed(before.doc);
    const accepted = await f.doc();
    const [x] = accepted.instances[0].position;
    assert.ok(Math.abs(x - 23) < 0.3, `expected +23 mm, got ${x}`);
    const expected = structuredClone(before.doc);
    expected.instances[0].position[0] = x;
    assert.deepEqual(accepted, expected);
    await f.page.waitForFunction(() => !document.querySelector('.viewport')?.getAttribute('data-display-mode-reason'));
    assert.deepEqual((await read()).picks, dragPicks);
    await f.undo(); await f.same(before.doc);
    await f.redo(); await f.same(accepted);
    const saved = await f.save('placement');
    await f.freshOpen(saved.file, accepted, '03-reopened-placement');
    await button('Top').click();
    await f.page.waitForFunction(({ points, expected }) =>
      JSON.stringify(points.map(p => window.__studioInstanceAt?.(p)?.id ?? null)) === JSON.stringify(expected),
    { points, expected: dragPicks });
    f.report.observations.push({ x, nativePlacement: accepted.instances.map(i => i.position) });
    return;
  }

  f.phase = `Cancel by ${mode} and capture state before and after physical pointer-up`;
  if (mode === 'escape') await f.page.keyboard.press('Escape');
  else if (mode === 'switch') {
    // Keyboard activation lets the pointer stay physically down on the canvas.
    await row('c2').focus();
    await row('c2').press('Enter');
    await f.page.waitForFunction(() => document.querySelector('[data-browser-instance-path="c2"]')?.classList.contains('sel'));
  } else {
    await f.page.locator('canvas.vp-canvas').evaluate(el => {
      const pointer = Number(el.dataset.probePointer);
      if (!el.hasPointerCapture(pointer)) throw Error('Real drag did not acquire pointer capture');
      el.releasePointerCapture(pointer);
      delete el.dataset.probePointer;
    });
    // Chrome can deliver pending lostpointercapture at the next physical pointer event.
    await f.page.mouse.move(gesture.end[0] + 1, gesture.end[1]);
  }
  if (mode !== 'switch') await f.page.locator('[data-gizmo][data-dragging="true"]').waitFor({ state: 'detached' });
  await screenshot('03-cancel-pointer-held');
  const cancelled = await read();
  await f.page.mouse.up();
  await screenshot('04-after-pointer-up');
  const released = await read();
  f.report.observations.push({ mode, gesture, before, during, cancelled, released });
  await f.persist();

  for (const [stage, state] of [['after cancel while held', cancelled], ['after pointer-up', released]]) {
    assert.deepEqual(state.doc, before.doc, `${stage}: accepted document changed`);
    assert.deepEqual(state.history, before.history, `${stage}: Undo, Redo, dirty state, or the history rail changed`);
    assert.equal(state.dragging, false, `${stage}: pointer gesture must end`);
    assert.deepEqual({ reason: state.reason, disabled: state.displayDisabled, picks: state.picks },
      { reason: null, disabled: false, picks: sourcePicks }, `${stage}: obsolete instance preview is still visible or blocking display modes`);
  }
});
