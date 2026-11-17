// #256: narrow cross-document working + accepted-preview retirement acceptance.
// Execute only after whole-checkout freeze, under the shared heavy gate.
import assert from 'node:assert/strict';
import { isAbsolute, relative, resolve } from 'node:path';
import { createFlow, sha256 } from './flow-helper.mjs';
import { clickModelCommand } from './model-rail-helper.mjs';
const output = process.argv[2], lateOnly = process.argv[3] === '--late-only';
assert.ok(output && isAbsolute(output) && relative(resolve(import.meta.dirname, '../../..'), output).startsWith('../'));
function box(parameter, height) {
  return { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: { [parameter]: height },
    nodes: [{ id: 'n0', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [10, 5] }, { id: 'n1', kind: 'extrude', sketch: 0, height: { parameter } }],
    outputs: { b1: { node: 1, side: 'solid' } }, nextId: 2,
    variability: { version: 1, inputs: [{ name: 'size', type: 'number', unit: 'mm', min: 1, max: 100, default: height, bindings: [{ to: 'parameter', part: 'base', parameter }] }] } };
}
const a = box('HeightA', 20), b = box('HeightB', 10);
b.variability.variants = [{ name: 'Tall', values: { size: 22 } }];
b.variability.active = 'Tall';
const file = doc => ({ name: 'same-name.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) });
const pins = ['apps/cad-studio/test/variant-active-document-boundary-browser.mjs', 'apps/cad-studio/src/state/useVariants.ts', 'apps/cad-studio/src/ui/VariantsPanel.tsx', 'apps/cad-studio/src/App.tsx', 'apps/cad-studio/src/engine/client.ts'];
const f = await createFlow({ name: 'variant-active-document-boundary', envFrozen: 'VARIANT_ACTIVE_BOUNDARY_FROZEN', output, initialFiles: pins, requiredFrozen: pins,
  qualification: lateOnly ? '#256 real pending A variant response cannot restore its result after accepted B Open.' : '#256 invalid A draft and accepted preview retire before the first saved-active B evaluation.',
  limits: [lateOnly ? 'Synthetic own boxes. Only pending variant response across public Open; original Worker callbacks released FIFO. Boolean/choice, other document entry routes and exports are NOT_RUN. Prior saved-active scenario is not rerun.' : 'Synthetic own boxes. Only numeric invalid-draft to saved-active Open and Show Master. Boolean/choice, delayed replies, other document entry routes and export are NOT_RUN.', 'No downloads.'],
  oracleSource: `import json,math,sys
r=json.load(sys.stdin); bodies=r['bodies']; assert len(bodies)==1
b=bodies[0]; expected={40:(2000,[5,2.5,20]),22:(1100,[5,2.5,11]),10:(500,[5,2.5,5])}[r['height']]
assert math.isclose(b['volume'],expected[0],rel_tol=0,abs_tol=1e-9)
assert all(math.isclose(x,y,rel_tol=0,abs_tol=1e-9) for x,y in zip(b['centroid'],expected[1]))
assert len(b['centroid'])==3
print(json.dumps({'status':'PASS','expectedVolume':expected[0],'expectedCentroid':expected[1]}))` });
// Hold only a real A evaluation response, then every later callback on that same Worker.
// Preserve original payloads and FIFO delivery: never reverse mesh-delta messages.
function installReplyHold() {
  const proto = Worker.prototype, post = proto.postMessage, descriptor = Object.getOwnPropertyDescriptor(proto, 'onmessage');
  let armed = false, target = null, held = null; const queue = [], samples = [];
  const sample = phase => { const state = window.__studioBodies?.(); samples.push({ phase, fresh: window.__studioFresh === true && state?.fresh === true, volumes: state?.bodies?.map(body => body.volume) ?? [] }); };
  proto.postMessage = function(request, ...args) {
    if (armed && request?.type === 'evaluate' && request?.doc?.doc?.parameters?.HeightA !== undefined) {
      armed = false; target = { worker: this, id: request.id, revision: request.revision, parameters: { ...request.doc.doc.parameters } };
    }
    return post.call(this, request, ...args);
  };
  Object.defineProperty(proto, 'onmessage', { configurable: true, get: descriptor.get, set(cb) {
    descriptor.set.call(this, cb && function(event) {
      if (target?.worker === this) {
        if (event.data?.id === target.id && event.data.result) held = { id: target.id, revision: target.revision, ok: event.data.result.ok, parameters: target.parameters };
        if (held) { queue.push(() => cb.call(this, event)); return; }
      }
      cb.call(this, event);
    });
  } });
  window.__variantReplyHold = {
    arm() { if (armed || target) throw Error('Already holding'); armed = true; },
    read: () => ({ held, queued: queue.length }),
    async release() {
      if (!held) throw Error('No real response held');
      while (queue.length) { queue.shift()(); sample('callback'); await new Promise(resolve => setTimeout(resolve, 0)); sample('tick'); }
      target = null; held = null; return samples;
    },
  };
}
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const panel = () => f.page.getByRole('complementary', { name: 'Variants panel' });
const value = () => panel().getByLabel('Value of size', { exact: true });
const requests = () => f.page.evaluate(() => window.__variantBoundaryRequests);
async function open(doc) {
  const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await chooser.setFiles(file(doc)); await f.same(doc);
}
async function geometry(label, height) {
  const expected = { 40: 2000, 22: 1100, 10: 500 }[height];
  await f.page.waitForFunction(volume => { const s = window.__studioBodies?.(); return window.__studioFresh && s?.massReady && s.bodies.length === 1 && Math.abs(s.bodies[0].volume - volume) < 1e-9; }, expected);
  await f.runOracle({ height, bodies: (await f.bodies()).bodies }, label);
}
await f.run(async () => {
  const origin = new URL(f.server.resolvedUrls.local[0]).origin, newContext = f.browser.newContext.bind(f.browser);
  f.report.fixtureHashes = { a: sha256(file(a).buffer), b: sha256(file(b).buffer) };
  f.browser.newContext = async options => {
    const context = await newContext({ ...options, serviceWorkers: 'block', acceptDownloads: false });
    await context.addInitScript(() => {
      const original = Worker.prototype.postMessage;
      window.__variantBoundaryRequests = [];
      Worker.prototype.postMessage = function(message, ...args) {
        const parameters = message?.doc?.doc?.parameters;
        if (message?.type === 'evaluate' && parameters && ('HeightA' in parameters || 'HeightB' in parameters)) window.__variantBoundaryRequests.push({ id: message.id, revision: message.revision, parameters: { ...parameters } });
        return original.call(this, message, ...args);
      };
    });
    if (lateOnly) await context.addInitScript(installReplyHold);
    await context.route('**/*', route => { const url = new URL(route.request().url()); if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' }); return ['http:', 'https:'].includes(url.protocol) && url.origin !== origin ? route.abort() : route.continue(); });
    return context;
  };
  await f.newPage(); await f.page.setViewportSize({ width: 1440, height: 900 });
  if (lateOnly) {
    f.phase = 'Hold a real A variant evaluation then accept B Open';
    await open(a); await clickModelCommand(f.page, 'Inspect', 'Variants'); await panel().waitFor();
    await f.page.evaluate(() => window.__variantReplyHold.arm());
    await value().fill('40');
    await f.page.waitForFunction(() => window.__variantReplyHold.read().held);
    const held = await f.page.evaluate(() => window.__variantReplyHold.read());
    assert.equal(held.held.ok, true); assert.equal(held.held.parameters.HeightA, 40); assert.ok(held.queued > 0); assert.deepEqual(await f.doc(), a);
    // Do not use open(): it waits for freshness which deliberately cannot arrive until FIFO release.
    const plainB = box('HeightB', 10), start = (await requests()).length;
    const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
    await chooser.setFiles(file(plainB));
    await f.page.waitForFunction(() => window.__studioDoc?.parameters?.HeightB === 10);
    const state = () => f.page.evaluate(() => ({ doc: window.__studioDoc, selection: window.__studioSelection.selection, dirty: !!document.querySelector('[aria-label="Unsaved changes"]') }));
    const accepted = await state(); assert.deepEqual(accepted.doc, plainB);
    assert.equal(await value().inputValue(), '10'); assert.equal(await panel().getByRole('alert').count(), 0);
    await f.snapshot('04-B-accepted-before-old-response');
    const deliverySamples = await f.page.evaluate(() => window.__variantReplyHold.release());
    assert.ok(deliverySamples.length > 0);
    for (const state of deliverySamples.filter(s => s.fresh)) assert.ok(state.volumes.length === 1 && Math.abs(state.volumes[0] - 500) < 1e-9, JSON.stringify(state));
    await f.ready(); await geometry('B-after-A-response', 10); await f.same(plainB);
    assert.deepEqual(await state(), accepted);
    const incoming = (await requests()).slice(start).filter(r => Object.hasOwn(r.parameters, 'HeightB'));
    assert.ok(incoming.length); assert.ok(incoming.every(r => r.parameters.HeightB === 10), JSON.stringify(incoming));
    assert.equal(await value().inputValue(), '10'); assert.equal(await panel().getByLabel('Variant shown').count(), 0);
    assert.equal(await panel().getByRole('alert').count(), 0);
    assert.deepEqual(await f.page.evaluate(() => window.__variantReplyHold.read()), { held: null, queued: 0 });
    await f.snapshot('05-B-current-after-FIFO');
    f.report.observations.push({ label: 'late-A-response-to-B-master', held, incoming, deliverySamples, FIFO: true, acceptedStatePreserved: true });
    return;
  }
  f.phase = 'A valid40 then invalid101 retains only its own accepted preview';
  await open(a); await clickModelCommand(f.page, 'Inspect', 'Variants'); await panel().waitFor();
  await value().fill('40'); await geometry('A-valid40', 40); await f.same(a);
  await value().fill('101'); await panel().getByRole('alert').waitFor();
  assert.equal(await value().getAttribute('aria-invalid'), 'true');
  assert.match(await panel().getByLabel('Variant shown').innerText(), /last valid preview/);
  await geometry('A-invalid101-retains40', 40); await f.same(a); await f.snapshot('01-A-invalid');
  f.phase = 'Open independent B with saved active Tall22';
  const start = (await requests()).length;
  await open(b); await geometry('B-saved-active22', 22);
  const incoming = (await requests()).slice(start).filter(r => Object.hasOwn(r.parameters, 'HeightB'));
  assert.ok(incoming.length > 0); assert.ok(incoming.every(r => r.parameters.HeightB === 22), JSON.stringify(incoming));
  assert.equal(await value().inputValue(), '22'); assert.equal(await value().getAttribute('aria-invalid'), null);
  assert.equal(await panel().getByRole('alert').count(), 0);
  const banner = await panel().getByLabel('Variant shown').innerText(); assert.match(banner, /Tall/); assert.doesNotMatch(banner, /edited|last valid preview/);
  await f.same(b); await f.snapshot('02-B-saved-active');
  f.report.observations.push({ label: 'saved-active-boundary', firstB: incoming[0], allB: incoming, banner });
  f.phase = 'Explicit Show Master uses B default10';
  await button('Show the master', panel()).click(); await geometry('B-master10', 10);
  assert.equal(await value().inputValue(), '10'); assert.equal(await panel().getByLabel('Variant shown').count(), 0);
  const master = structuredClone(b); delete master.variability.active;
  await f.same(master); await f.snapshot('03-B-master');
});
