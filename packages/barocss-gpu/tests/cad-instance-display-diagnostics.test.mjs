// Source-bundled instance/display capability and control behavior checks. No browser/GPU.
// Run: node --test --test-concurrency=1 packages/barocss-gpu/tests/cad-instance-display-diagnostics.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { act, createElement } from 'react';
import { JSDOM } from 'jsdom';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), 'cad-instance-diagnostics-'));
const dom = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost' });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
test.after(() => {
  dom.window.close();
  delete globalThis.window;
  delete globalThis.document;
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});
const { createRoot } = await import('react-dom/client');
const require = createRequire(import.meta.url);
let displayModeScope, instanceDisplayStatus, instancePickFields, snapshotInstanceIsolation, ViewDisplayControls;
try {
  const outfile = join(temporary, 'diagnostics.cjs');
  await build({
    stdin: { contents: 'export { displayModeScope, instanceDisplayStatus, instancePickFields, snapshotInstanceIsolation } from "./apps/cad-studio/src/viewport/Viewport.tsx"; export { ViewDisplayControls } from "./apps/cad-studio/src/ui/ViewDisplayControls.tsx";', resolveDir: root },
    outfile, bundle: true, platform: 'node', format: 'cjs', jsx: 'automatic', logLevel: 'silent',
    plugins: [{
      name: 'shared-react',
      setup(builder) {
        builder.onResolve({ filter: /^react(?:-dom)?(?:\/|$)/ }, ({ path }) => ({
          path: require.resolve(path), external: true,
        }));
      },
    }],
    alias: { '@': resolve(root, 'apps/cad-studio/src'), '@barocss/gpu/viewer': resolve(root, 'packages/barocss-gpu/src/viewer/index.ts'), '@barocss/gpu': resolve(root, 'packages/barocss-gpu/src/index.ts'), '@barocss/cad-model': resolve(root, 'packages/barocss-cad-model/src') },
  });
  ({ displayModeScope, instanceDisplayStatus, instancePickFields, snapshotInstanceIsolation, ViewDisplayControls } = require(outfile));
} finally { await rm(temporary, { recursive: true, force: true }); }

const defaultStatus = Object.freeze({ requested: 'shaded-with-edges', effective: 'shaded-with-edges', supported: true });
const noCall = () => { throw new Error('A capability diagnosis must not draw, change geometry or pick.'); };
const bridge = Object.freeze({ setInstances: noCall, pickInstanceFace: noCall });

test('default assembly display is supported when the actual renderer can draw and identify instance faces', () => {
  assert.equal(instanceDisplayStatus(defaultStatus, bridge, true), defaultStatus);
  assert.equal(instanceDisplayStatus(defaultStatus, null, false), defaultStatus);
  assert.equal(instanceDisplayStatus(null, bridge, true), null);
});

test('an absent or incomplete bridge is diagnosed explicitly, including the default mode', () => {
  for (const renderer of [null, {}, { setInstances: noCall }, { pickInstanceFace: noCall }, { setInstances: true, pickInstanceFace: true }]) {
    const result = instanceDisplayStatus(defaultStatus, renderer, true);
    assert.equal(result.supported, false); assert.equal(result.effective, 'shaded-with-edges');
    assert.match(result.reason, /requires the renderer instance bridge/);
  }
  assert.deepEqual(defaultStatus, { requested: 'shaded-with-edges', effective: 'shaded-with-edges', supported: true });
});

test('all five placed-instance modes use the actual adapter capability status without a UI-only rejection', () => {
  for (const requested of ['shaded-with-edges', 'hidden-lines-removed', 'hidden-lines-dashed', 'wireframe', 'x-ray']) {
    const status = Object.freeze({ requested, effective: requested, supported: true });
    assert.equal(instanceDisplayStatus(status, bridge, true), status);
    const rejected = Object.freeze({ requested, effective: 'shaded-with-edges', supported: false, reason: 'This backend combination is unsupported.' });
    assert.equal(instanceDisplayStatus(rejected, bridge, true), rejected, 'an actual renderer rejection is never changed to support');
    const missing = instanceDisplayStatus(status, {}, true);
    assert.equal(missing.supported, false); assert.match(missing.reason, /requires the renderer instance bridge/);
  }
});

test('placed instances do not create a scope guard; Render/analysis/direct/proposal/mould/editing guards remain precise', () => {
  const instances = [{ id: 'placed-copy', bodies: [] }];
  for (const props of [{}, { instances: [] }, { instances }]) assert.equal(displayModeScope(props), undefined);
  for (const [props, reason] of [
    [{ render: {} }, /Model view/], [{ analysis: 'zebra' }, /analysis/], [{ scalarMaps: [{}] }, /analysis/],
    [{ mould: {} }, /mould/], [{ direct: [{}] }, /direct geometry/], [{ proposal: {} }, /proposal/],
    [{ instancePreview: {} }, /instance is dragged/], [{ sketch: {} }, /sketch/], [{ cage: {} }, /cage/], [{ tool: {} }, /tool/], [{ regions: [{}] }, /tool/],
  ]) assert.match(displayModeScope({ instances, ...props }), reason);
});

// Mount the actual controls so React owns their state and input events.
function controls(t) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const doc = { nodes: [], instances: [] };
  t.after(async () => { await act(async () => root.unmount()); host.remove(); });
  return {
    labeled: name => [...host.querySelectorAll('[aria-label]')].filter(node => node.getAttribute('aria-label') === name),
    host,
    async update(display) {
      await act(async () => root.render(createElement(ViewDisplayControls, {
        doc, viewport: { current: null }, cornerRight: { current: null },
        display: { displayOpen: true, displayMode: 'shaded-with-edges', effectiveDisplayMode: 'shaded-with-edges', ...display },
        view: { ortho: false, ao: true, theme: 'dark', rendering: false, printing: false, viewBackend: 'webgpu' },
        section: { section: null }, analysis: { analysis: null, mapKind: null, mapLegend: null },
        picking: { pickFilter: 'all', snapStep: 1 }, explodeStore: {},
      })));
    },
  };
}

test('one real display selector exposes five modes, guarded fallback and the mode-change handler', async t => {
  const calls = [], display = { displayMode: 'wireframe', effectiveDisplayMode: 'shaded-with-edges', displayScopeReason: 'Model view only',
    displayModeReason: 'Model view only', displayModeNotice: 'Model view only', clearDisplayModeFailure: () => calls.push('clear'),
    setDisplayMode: mode => calls.push(mode) };
  const panel = controls(t);
  await panel.update(display);
  const selectors = panel.labeled('CAD display mode');
  assert.equal(selectors.length, 1);
  const [select] = selectors;
  assert.equal(select.value, 'shaded-with-edges');
  assert.equal(select.disabled, true);
  assert.equal(select.dataset.displayModeRequested, 'wireframe');
  assert.equal(select.dataset.displayModeSupported, 'false');
  assert.deepEqual([...select.options].map(option => option.value), ['shaded-with-edges', 'hidden-lines-removed', 'hidden-lines-dashed', 'wireframe', 'x-ray']);
  assert.equal(panel.host.querySelector('[role="status"]').textContent, 'Model view only Shaded with edges is active.');
  await panel.update({ ...display, displayScopeReason: undefined, displayModeReason: undefined, effectiveDisplayMode: 'wireframe' });
  assert.equal(select.disabled, false);
  assert.equal(select.value, 'wireframe');
  await act(async () => {
    select.value = 'x-ray';
    select.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
  assert.deepEqual(calls, ['clear', 'x-ray']);
  assert.equal(display.displayMode, 'wireframe', 'the controlled request is not mutated');
});

test('default bridge availability preserves an existing backend rejection rather than declaring it passed', () => {
  const failed = Object.freeze({ ...defaultStatus, supported: false, reason: 'Backend unavailable.' });
  assert.equal(instanceDisplayStatus(failed, bridge, true), failed);
});

test('only actual generated caps carry instanceCap and never native-face authority', () => {
  const native = Object.freeze({ id: 'part', body: 7, face: 12 });
  assert.deepEqual(instancePickFields(native), { instance: 'part', instanceFace: { body: 7, face: 12 } });
  assert.deepEqual(instancePickFields({ id: 'part', body: 7, face: -1 }), { instance: 'part' }, 'unknown provenance is not a generated cap');
  assert.deepEqual(instancePickFields({ id: 'part', body: 7, face: -1, cap: true }), { instance: 'part', instanceCap: { body: 7 } });
  assert.deepEqual(instancePickFields({ id: 'part', body: 7, face: 12, cap: true }), { instance: 'part', instanceCap: { body: 7 } }, 'an explicit cap flag suppresses native-face authority');
  assert.deepEqual(native, { id: 'part', body: 7, face: 12 });
});

test('isolation snapshots only selected visible placed instances and survives later selection changes', () => {
  const selected = ['hidden', 'placed-b', 'placed-a', 'placed-b', 'unevaluated', 'empty'];
  const body = Object.freeze({}), bodies = Object.freeze([body]);
  const placed = Object.freeze([Object.freeze({ id: 'placed-a', bodies }), Object.freeze({ id: 'placed-b', bodies }), Object.freeze({ id: 'empty', bodies: Object.freeze([]) })]);
  const snapshot = snapshotInstanceIsolation(selected, placed);
  assert.deepEqual(snapshot, ['placed-b', 'placed-a']);
  assert.notEqual(snapshot, selected);
  selected.splice(0, selected.length);
  assert.deepEqual(snapshot, ['placed-b', 'placed-a'], 'clearing selection does not restore or replace the snapshot');
  assert.equal(placed[0].bodies, bodies); assert.equal(placed[1].bodies, bodies);
  assert.equal(snapshotInstanceIsolation(selected, placed), undefined);
  assert.equal(snapshotInstanceIsolation(['hidden', 'unevaluated', 'empty'], placed), undefined);
});

test('one real Display isolate toggle snapshots selected instances and restores with empty selection', async t => {
  const snapshot = ['placed-a']; let isolated;
  const setIsolatedInstances = update => { isolated = update(isolated); };
  const display = { isolationSelection: snapshot, setIsolatedInstances };
  const panel = controls(t);
  await panel.update(display);
  const isolate = panel.labeled('Isolate selection');
  assert.equal(isolate.length, 1);
  assert.equal(isolate[0].disabled, false);
  assert.equal(isolate[0].getAttribute('aria-pressed'), 'false');
  await act(async () => isolate[0].click());
  assert.equal(isolated, snapshot);
  await panel.update({ ...display, isolatedInstances: isolated, isolationSelection: undefined, isolationReason: 'Select a visible placed instance to isolate.' });
  assert.equal(panel.labeled('Isolate selection').length, 0);
  const restore = panel.labeled('Restore view');
  assert.equal(restore.length, 1);
  assert.equal(restore[0].disabled, false);
  assert.equal(restore[0].getAttribute('aria-pressed'), 'true');
  await act(async () => restore[0].click());
  assert.equal(isolated, undefined);
  await panel.update({ ...display, isolationSelection: undefined, isolationReason: 'Select a visible placed instance to isolate.' });
  assert.equal(panel.labeled('Isolate selection')[0].disabled, true);
  await panel.update({ ...display, displayOpen: false });
  assert.equal(panel.labeled('Isolate selection').length, 0, 'the toggle only exists in the open Display card');
  // Document replacement ownership remains in App, outside this controlled component.
  const app = await readFile(resolve(root, 'apps/cad-studio/src/App.tsx'), 'utf8');
  const replace = app.slice(app.indexOf('const replaceDoc ='), app.indexOf('const writeFile ='));
  assert.match(replace, /setIsolatedInstances\(undefined\)/, 'New/Open must not reuse the previous document isolation IDs');
  assert.doesNotMatch(app, /(?:doc\.|localStorage\.(?:getItem|setItem)\(['"])[iI]solatedInstances/);
});

test('Viewport forwards the snapshot to view state, suspends it under existing guards and schedules state updates', async () => {
  const source = await readFile(resolve(root, 'apps/cad-studio/src/viewport/Viewport.tsx'), 'utf8');
  assert.match(source, /isolatedInstances\?: readonly string\[\]/);
  assert.match(source, /isolatedInstances: displayModeScope\(propsRef\.current\) \? undefined : propsRef\.current\.isolatedInstances/);
  assert.match(source, /setState\(viewState\(\)\); request\(\); \}, \[[^\]]*props\.isolatedInstances/);
  assert.match(displayModeScope({ render: {}, isolatedInstances: ['placed'] }), /Model view/);
  assert.equal(displayModeScope({ isolatedInstances: ['placed'], instances: [{ id: 'placed', bodies: [] }] }), undefined);
});
