import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
const name = 'separate-file-open';
const f = await createFlow({
  name, output: process.argv[2], envFrozen: 'D2049_SOURCE_FROZEN',
  initialFiles: ['apps/cad-studio/test/separate-file-open-browser.mjs', 'apps/cad-studio/src/state/useFeatureHistory.ts', 'apps/cad-studio/src/ui/SelectionInspector.tsx'],
  qualification: 'A later native File Open supersedes a pending Separate pieces; a current Separate still applies exactly.',
  limits: ['Two disjoint exact boxes from one ordinary linear body Pattern. Real Worker and file data deliberately delivered out of order.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { toPartDocument } from '@barocss/cad-model/engine/part';
import { checkOutput, evaluateCadPart, massPropertiesOf } from '@barocss/cad';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
console.log(JSON.stringify(evaluateCadPart(toPartDocument(doc)).outputs.map(b => ({
 id: b.id, pieces: b.bodyCount, valid: checkOutput(b).valid, vertices: b.brep.vertices.map(v => v.point), ...massPropertiesOf(b)
}))));
`,
});
// Delay only timing: neither the real Worker reply nor the browser's file bytes are altered.
function installOpenRace() {
  const prototype = Worker.prototype;
  const onmessage = Object.getOwnPropertyDescriptor(prototype, 'onmessage');
  const post = prototype.postMessage, arrayBuffer = File.prototype.arrayBuffer;
  let armed = false, target, reply, file;
  prototype.postMessage = function(request, ...args) {
    if (armed && request?.type === 'evaluate') {
      armed = false;
      target = { worker: this, id: request.id };
    }
    return post.call(this, request, ...args);
  };
  Object.defineProperty(prototype, 'onmessage', {
    ...onmessage,
    set(listener) {
      onmessage.set.call(this, listener && function(event) {
        if (target?.worker === this && target.id === event.data?.id) {
          target = null;
          window.__historyOpenRace.replyOK = event.data.result?.ok;
          reply = () => listener.call(this, event);
          return;
        }
        listener.call(this, event);
      });
    },
  });
  File.prototype.arrayBuffer = async function(...args) {
    const bytes = await arrayBuffer.apply(this, args);
    if (this.name === 'D2049-newer-open.bcad') await new Promise(resolve => { file = resolve; });
    return bytes;
  };
  window.__historyOpenRace = {
    arm() { armed = true; },
    replyHeld: () => !!reply,
    fileHeld: () => !!file,
    sendReply() { const send = reply; reply = null; send(); },
    sendFile() { const send = file; file = null; send(); },
  };
}

const ref = node => ({ node, side: 'solid' });
const nodes = [
  { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [10, 6] },
  { id: 'n1', kind: 'extrude', sketch: 0, height: 8 },
  { id: 'n2', kind: 'linear-pattern', parent: ref(1), axis: 'x', spacing: 30, count: 2 },
];
const base = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nodes, outputs: { b2: ref(2) }, nextId: 3,
};
const newer = { ...base, nodes: [nodes[0], { ...nodes[1], height: 12 }, nodes[2]] };
const click = (name) => f.page.getByRole('button', { name, exact: true }).click();
const upload = (name, doc) => f.page.locator('input[aria-label="Model file"]').setInputFiles({
  name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)),
});
const settle = () => f.page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const priorReproduced = process.argv.includes('--prior');
const nearPoint = (a, b) => Math.hypot(...a.map((x, i) => x - b[i])) < 1e-7;
const corners = (starts, height) => starts.flatMap(x0 => [x0, x0 + 10].flatMap(x => [0, 6].flatMap(y => [0, height].map(z => [x, y, z]))));
function assertVertices(vertices, expected) {
  assert.equal(vertices.length, expected.length);
  for (const p of expected) assert.equal(vertices.filter(q => nearPoint(p, q)).length, 1, JSON.stringify(p));
}
async function assertPattern(label, expected, height) {
  const state = await f.snapshot(label), native = await f.inspect(label, state.doc);
  assert.deepEqual(state.doc, expected);
  assert.equal(native.length, 1);
  const [body] = native, visible = state.bodies.bodies;
  assert.equal(body.valid, true);
  assert.equal(body.pieces, 2);
  assertVertices(body.vertices, corners([0, 30], height));
  assert.equal(visible.length, 1);
  for (const b of [body, ...visible]) {
    assert.ok(Math.abs(b.volume - 120 * height) < 1e-7);
    assert.ok(Math.hypot(...b.centroid.map((x, i) => x - [20, 3, height / 2][i])) < 1e-7);
  }
}
async function assertSeparate(label) {
  const state = await f.snapshot(label);
  assert.deepEqual(state.doc.nodes.slice(0,3), nodes);
  assert.deepEqual(state.doc.nodes[3], { id:'n3', kind:'separate', parent: ref(2) });
  assert.equal(state.bodies.bodies.length, 2);
  const native = await f.inspect(label, state.doc);
  assert.equal(native.length, 2);
  const byX = [...native].sort((a, b) => a.centroid[0] - b.centroid[0]);
  byX.forEach((b, i) => {
    assert.ok(nearPoint(b.centroid, [5 + i * 30, 3, 4]), JSON.stringify(b.centroid));
    assertVertices(b.vertices, corners([i * 30], 8));
  });
  for (const b of [...native,...state.bodies.bodies]) assert.ok(Math.abs(b.volume - 480) < 1e-7);
  assert.ok(native.every(b => b.valid && b.pieces === 1));
}
async function selectPattern() {
  await f.page.locator('button[data-browser-body-key="b2"]').click();
  await f.page.getByRole('button', { name: 'Separate the pieces', exact: true }).waitFor();
}
await f.run(async () => {
  const newContext = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async options => {
    const context = await newContext(options);
    await context.addInitScript(installOpenRace);
    return context;
  };
  await f.newPage();
  f.browser.newContext = newContext;
  f.phase = 'open two disconnected pattern pieces';
  await upload('D2049-old.bcad', base);
  await f.same(base);
  await selectPattern();
  await assertPattern('01-old-one-body-two-pieces', base, 8);
  f.phase = 'hold successful Separate reply and then real file bytes';
  await f.page.evaluate(() => window.__historyOpenRace.arm());
  await click('Separate the pieces');
  await f.page.waitForFunction(() => window.__historyOpenRace.replyHeld());
  assert.equal(await f.page.evaluate(() => window.__historyOpenRace.replyOK), true);
  await upload('D2049-newer-open.bcad', newer);
  await f.page.waitForFunction(() => window.__historyOpenRace.fileHeld());
  await f.page.evaluate(() => window.__historyOpenRace.sendReply());
  await settle();
  await f.page.evaluate(() => window.__historyOpenRace.sendFile());
  await settle();
  if (priorReproduced) {
    f.phase='prior Separate wins incorrectly';
    await f.page.waitForFunction(() => window.__studioDoc.nodes.at(-1).kind === 'separate');
    await f.ready();
    await assertSeparate('02-prior-selected-file-lost');
    return;
  }
  f.phase='fixed latest Open owns the document and history';
  await f.same(newer);
  await assertPattern('02-latest-selected-file-wins', newer, 12);
  assert.equal(await f.page.locator('.toast').count(),0);
  await f.undo(); await f.same(base);
  await assertPattern('03-first-undo-original-pattern', base, 8);
  await f.redo(); await f.same(newer);
  const saved = await f.save('newer-pattern');
  await f.freshOpen(saved.file, newer, '04-reopened');
  await assertPattern('05-fresh-native', newer, 12);
  await upload('D2049-old.bcad', base); await f.same(base);
  await selectPattern(); await click('Separate the pieces'); await f.changed(base);
  await assertSeparate('06-current-separate-two-bodies');
  await f.undo(); await f.same(base);
});
