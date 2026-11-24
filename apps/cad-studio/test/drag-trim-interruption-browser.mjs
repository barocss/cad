import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const pins = [
  'apps/cad-studio/test/drag-trim-interruption-browser.mjs',
  'apps/cad-studio/test/flow-helper.mjs',
  'apps/cad-studio/src/App.tsx',
  'apps/cad-studio/src/sketch/draftHistory.ts',
  'apps/cad-studio/src/sketch/dragTrimPlan.ts',
  'apps/cad-studio/src/sketch/useSketchActions.ts',
  'apps/cad-studio/src/viewport/dragTrimStroke.ts',
  'apps/cad-studio/src/viewport/viewportPointerInput.ts',
  'apps/cad-studio/src/viewport/sketchOverlay.tsx',
  'packages/barocss-cad-model/src/sketch/trim.ts',
];
const f = await createFlow({
  headless: false,
  name: 'drag-trim-interruption', output: process.argv[2], envFrozen: 'DRAG_TRIM_INTERRUPTION_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Only actual tab switch and native lostpointercapture cancellation of a held three-cut Trim stroke, followed by independent retry and one Undo.',
  limits: ['One closed straight main outline with separate visible construction targets and boundaries.'],
  snapshotExtra: () => ({
    nativeEvents: window.__trimEvents ?? [],
    visibility: document.visibilityState,
    pointerCapture: !!document.querySelector('canvas.vp-canvas')?.hasPointerCapture(window.__dragTrimPointer),
    dirty: !!document.querySelector('[aria-label="Unsaved changes"]'),
    controls: ['Undo', 'Redo'].map(name => document.querySelector(`button[aria-label="${name}"]`).disabled),
    removed: [...document.querySelectorAll('.sk-drag-trim-interval')].map(line => line.getAttribute('points')),
  }),
});
const line = (a, b, id) => ({ kind: 'polygon', points: [a, b], closed: false, bulges: [0, 0], ids: ['e' + id, 'e' + (id + 1)], construction: true });
const vertical = (x, id) => line([x, -5], [x, 15], id);
const axes = [0, 10, 20];
const source = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 2,
  nodes: [
    { kind: 'sketch', profile: 'rectangle', min: [34, 0], max: [54, 20], id: 'n0',
      sideTags: { outer: ['e1', 'e2', 'e3', 'e4'] },
      construction: [...axes.map((x, i) => vertical(x, 2 * i + 5)), line([-2, 0], [29, 0], 11), line([-2, 10], [29, 10], 13)] },
    { kind: 'extrude', sketch: 0, height: 2, id: 'n1' },
  ],
  outputs: { b1: { node: 1, side: 'solid' } },
};
const button = (scope, name) => scope.getByRole('button', { name, exact: true });
const brush = () => f.page.locator('.vp-overlay .sk-drag-trim');
const cuts = () => brush().locator('.sk-drag-trim-interval');
const ordinary = () => f.page.locator('.vp-overlay .sk-trim:not(.sk-drag-trim-interval)');

async function open(doc, name = 'D876-source.bcad', bytes = Buffer.from(JSON.stringify(doc))) {
  const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), button(f.page, 'Open').click()]);
  await chooser.setFiles({ name, mimeType: 'application/json', buffer: bytes });
  await f.same(doc);
}

async function enterTrim() {
  await f.openFeatureEditor(1);
  await button(f.editor(), 'Edit sketch').click();
  await f.sketchPanel().waitFor();
  await f.tool('Trim', 't');
  await f.frame([[-2, 5], [29, 5], [0, -4], [20, 14], [54, 20]]);
}

async function pixel(point) {
  const pos = await f.page.evaluate(point => {
    const p = window.__studioScreenOf([...point, 0]);
    return p && document.elementFromPoint(...p)?.closest('canvas.vp-canvas') ? p : null;
  }, point);
  assert.ok(pos, JSON.stringify(point));
  return pos;
}

async function settle() {
  await f.page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
}

async function hover(point) {
  await f.page.mouse.move(...await pixel(point));
  await settle();
}

async function hold(from = [-2, 5], to = [22, 5], steps = 1) {
  await f.page.mouse.move(...await pixel(from));
  await f.page.mouse.down();
  await f.page.mouse.move(...await pixel(to), { steps });
  await brush().waitFor({ state: 'attached' });
}

async function lineEndpoints(locator, a, b) {
  await locator.waitFor({ state: 'attached' });
  const actual = await locator.evaluate(line => {
    const rect = line.closest('svg').getBoundingClientRect();
    return Array.from(line.points, q => [q.x + rect.left, q.y + rect.top]);
  });
  const expected = await Promise.all([a, b].map(point => f.screenOf(point)));
  assert.equal(actual.length, 2);
  assert.ok(actual.every(p => expected.some(q => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.02)), JSON.stringify({ actual, expected }));
}

async function verifyPreview() {
  assert.equal(await cuts().count(), 3);
  for (const [i, x] of axes.entries()) await lineEndpoints(cuts().nth(i), [x, 0], [x, 10]);
}

async function beforeCuts() {
  for (const x of axes) {
    await hover([x, 5]);
    await lineEndpoints(ordinary(), [x, 0], [x, 10]);
  }
}

async function afterCuts() {
  for (const x of axes) {
    await hover([x, 5]);
    await ordinary().waitFor({ state: 'detached' });
    await hover([x, -3]);
    await lineEndpoints(ordinary(), [x, -5], [x, 0]);
    await hover([x, 13]);
    await lineEndpoints(ordinary(), [x, 10], [x, 15]);
  }
}

function unchanged(after, before, includeControls = false) {
  for (const key of ['doc', 'bodies', 'selection', 'history', 'dirty', ...(includeControls ? ['controls'] : [])]) {
    assert.deepEqual(after[key], before[key], key);
  }
}


await f.run(async () => {
  const create = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async options => {
    const context = await create({ ...options, acceptDownloads: false, serviceWorkers: 'block' });
    await context.addInitScript(() => {
      window.__trimEvents = [];
      document.addEventListener('pointerdown', e => {
        if (e.isTrusted && e.target?.closest('canvas.vp-canvas')) window.__dragTrimPointer = e.pointerId;
      }, true);
      document.addEventListener('lostpointercapture', e => window.__trimEvents.push({ type: e.type, trusted: e.isTrusted, id: e.pointerId }), true);
      document.addEventListener('visibilitychange', e => window.__trimEvents.push({ type: e.type, trusted: e.isTrusted, hidden: document.hidden }));
      window.addEventListener('blur', e => window.__trimEvents.push({ type: e.type, trusted: e.isTrusted }));
    });
    return context;
  };
  await f.newPage();
  await open(source, 'trim-interruption.bcad');
  await enterTrim();
  await beforeCuts();
  const other = process.argv.includes('--capture-only') ? null : await f.page.context().newPage();
  if (other) {
    await other.goto('about:blank');
    // Playwright defaults to emulated focus even for a background page. Use native Chrome tab state.
    const tabs = await Promise.all([f.page, other].map(async page => {
      const session = await page.context().newCDPSession(page);
      await session.send('Emulation.setFocusEmulationEnabled', { enabled: false });
      const { targetInfo } = await session.send('Target.getTargetInfo');
      const { windowId } = await session.send('Browser.getWindowForTarget', { targetId: targetInfo.targetId });
      assert.equal(targetInfo.type, 'page');
      return { target: targetInfo.targetId, windowId };
    }));
    assert.equal(tabs[0].windowId, tabs[1].windowId, 'both targets must be tabs of the same Chrome window');
    assert.notEqual(tabs[0].target, tabs[1].target);
    f.report.observations.push({ label: 'native-chrome-tab-identities', tabs });
  }
  await f.page.bringToFront();
  await f.page.waitForFunction(() => !document.hidden, null, { polling: 100, timeout: 10000 });
  for (const reason of (process.argv.includes('--capture-only') ? ['native-lostcapture'] : ['tab-switch', 'native-lostcapture'])) {
    f.phase = reason + ': held three-cut stroke';
    const before = await f.snapshot(reason + '-before');
    if (reason === 'tab-switch') {
      await f.page.bringToFront();
      await f.page.waitForFunction(() => document.hasFocus(), null, { polling: 100, timeout: 10000 });
      await settle();
    }
    await hold(); await verifyPreview();
    // Full-page screenshots may disturb native capture in headed Chrome. Read only while held.
    const heldState = await f.page.evaluate(() => ({
      doc: JSON.parse(JSON.stringify(window.__studioDoc)), bodies: window.__studioBodies?.(), selection: window.__studioSelection ?? null,
      history: [...document.querySelectorAll('.history .hs')].map(b => b.getAttribute('aria-label')),
      dirty: !!document.querySelector('[aria-label="Unsaved changes"]'),
      controls: ['Undo', 'Redo'].map(name => document.querySelector(`button[aria-label="${name}"]`).disabled),
      previewCount: document.querySelectorAll('.sk-drag-trim-interval').length,
      captured: document.querySelector('canvas.vp-canvas').hasPointerCapture(window.__dragTrimPointer),
    }));
    unchanged(heldState, before, true);
    assert.equal(heldState.previewCount, 3);
    assert.equal(heldState.captured, true);
    f.report.observations.push({ label: reason + '-held-read-only', ...heldState });
    await f.persist();
    const offset = await f.page.evaluate(() => window.__trimEvents.length);
    if (reason === 'tab-switch') {
      await f.page.waitForFunction(() => document.hasFocus(), null, { polling: 100, timeout: 10000 });
      await other.bringToFront();
      await other.waitForFunction(() => document.hasFocus(), null, { polling: 100, timeout: 10000 });
      await f.page.waitForFunction(() => !document.hasFocus(), null, { polling: 100, timeout: 10000 });
      await f.page.bringToFront();
      await f.page.waitForFunction(() => document.hasFocus(), null, { polling: 100, timeout: 10000 });
      await other.waitForFunction(() => !document.hasFocus(), null, { polling: 100, timeout: 10000 });
    } else {
      const capture = await f.page.evaluate(() => {
        const canvas = document.querySelector('canvas.vp-canvas'), id = window.__dragTrimPointer;
        const held = canvas.hasPointerCapture(id);
        if (held) canvas.releasePointerCapture(id);
        return { id, held };
      });
      assert.equal(capture.held, true, 'native pointer capture was active');
      // The browser processes pending capture transitions with the next actual pointer event.
      await f.page.mouse.move(...await pixel([22.1, 5]));
      await f.page.waitForFunction(id => window.__trimEvents.some(e => e.type === 'lostpointercapture' && e.trusted && e.id === id), capture.id);
    }
    await brush().waitFor({ state: 'detached' });
    const events = await f.page.evaluate(start => window.__trimEvents.slice(start), offset);
    if (reason === 'tab-switch') {
      assert.ok(events.some(e => e.type === 'blur' && e.trusted) ||
        events.some(e => e.type === 'visibilitychange' && e.trusted && e.hidden), JSON.stringify(events));
    } else assert.ok(events.some(e => e.type === 'lostpointercapture' && e.trusted), JSON.stringify(events));
    await f.page.mouse.up();
    await f.sketchPanel().waitFor();
    await beforeCuts();
    unchanged(await f.snapshot(reason + '-late-release'), before, true);
    f.report.observations.push({ label: reason, events, cancelledWithoutCommit: true });
    f.phase = reason + ': independent retry and one Undo';
    await hold(); await verifyPreview(); await f.page.mouse.up();
    await brush().waitFor({ state: 'detached' }); await afterCuts();
    const trimmed = await f.snapshot(reason + '-retry');
    unchanged(trimmed, before); assert.deepEqual(trimmed.controls, [false, true]);
    await button(f.page, 'Undo').click(); await beforeCuts();
    const restored = await f.snapshot(reason + '-one-undo');
    unchanged(restored, before); assert.deepEqual(restored.controls, [true, false]);
  }
  await other?.close();
  assert.deepEqual(f.report.downloads, []);
});
