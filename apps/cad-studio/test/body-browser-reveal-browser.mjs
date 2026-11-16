import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
import { clickModelCommand } from './model-rail-helper.mjs';

const f = await createFlow({ name: 'body-browser-reveal', output: process.argv[2], envFrozen: 'BODY_BROWSER_REVEAL_FROZEN',
  initialFiles: ['apps/cad-studio/test/body-browser-reveal-browser.mjs'],
  requiredFrozen: ['apps/cad-studio/src/App.tsx', 'apps/cad-studio/src/ui/BodyBrowserRows.tsx'],
  qualification: 'Explicit exact-key base-body reveal preserves model, selection and camera.',
  limits: ['Desktop base bodies and face picks. Instances/nested paths remain unsupported. No geometry or file-format qualification.'],
  inspectorSource: `
import { emptyDoc, withNode } from '@barocss/cad-model/engine/doc';
let doc = emptyDoc();
for (let i = 0; i < 36; i++) {
  const x = (i % 6) * 12, y = Math.floor(i / 6) * 12, sketch = doc.nodes.length;
  doc = withNode(doc, { kind: 'sketch', profile: 'rectangle', min: [x,y], max: [x+4,y+6] });
  doc = withNode(doc, { kind: 'extrude', sketch, height: 8 });
}
console.log(JSON.stringify(doc));
` });
const button = name => f.page.getByRole('button', { name, exact: true });
const reveal = () => button('Show selection in Browser');
const row = key => f.page.locator(`[data-browser-body-key="${key}"]`);
async function read() {
  return f.page.evaluate(() => ({ doc: window.__studioDoc, selection: window.__studioSelection,
    eye: window.__studioEye(), screen: window.__studioScreenOf([0,0,0]),
    dirty: !!document.querySelector('[aria-label="Unsaved changes"]'),
    history: ['Undo','Redo'].map(name => { const b = document.querySelector(`button[aria-label="${name}"]`); return [b.disabled,b.getAttribute('data-tip')]; }),
    windowScroll: [window.scrollX,window.scrollY] }));
}
async function scrollState(key, reset = false) {
  return row(key).evaluate((el, reset) => {
    let p = el.parentElement;
    while (p && (!/(auto|scroll)/.test(getComputedStyle(p).overflowY) || p.scrollHeight <= p.clientHeight)) p = p.parentElement;
    if (!p) throw new Error('No browser scroll container');
    if (reset) p.scrollTop = 0;
    const a = el.getBoundingClientRect(), b = p.getBoundingClientRect();
    return { top: p.scrollTop, visible: a.top >= b.top && a.bottom <= b.bottom, focus: document.activeElement === el };
  }, reset);
}
async function pickLast() {
  const point = await f.page.evaluate(() => window.__studioScreenOf([62,63,8]));
  await f.page.mouse.click(...point);
  await f.page.waitForFunction(() => window.__studioSelection.selection.faces.some(p => p.body === 35));
}
await f.run(async () => {
  const seed = await f.inspect('fixture', {});
  for (const width of [1024,1440]) {
    await f.newPage(); await f.page.setViewportSize({ width, height: width === 1024 ? 800 : 900 });
    await f.page.locator('input[aria-label="Model file"]').setInputFiles({ name: 'same-name-bodies.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) });
    await f.same(seed);
    await button('Top').click();
    if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
    await f.frame([[0,0],[64,66]]);
    await scrollState('b71', true);
    await pickLast();
    assert.equal((await scrollState('b71')).top, 0, 'Ordinary selection must not reveal automatically');
    const before = await read();
    await reveal().click();
    assert.deepEqual(await read(), before);
    assert.deepEqual(await scrollState('b71'), { top: (await scrollState('b71')).top, visible: true, focus: true });
    const firstTop = (await scrollState('b71')).top;
    assert.ok(firstTop > 0);
    await reveal().click();
    assert.equal((await scrollState('b71')).top, firstTop, 'Already-visible repeat should not scroll');
    assert.deepEqual(await read(), before);
    await f.snapshot(`${width}-exact-last-body`);
    // Closed Browser opens and resolves the same key after rows mount.
    await button('Collapse the browser').click();
    const closed = await read();
    await reveal().click();
    assert.deepEqual(await read(), closed);
    assert.ok((await scrollState('b71')).visible);
    assert.ok((await scrollState('b71')).focus);
    await f.snapshot(`${width}-closed-browser-revealed`);
    // Pending rename is not blurred, committed, or discarded by the reveal button.
    await row('b71').dblclick();
    const name = f.page.getByRole('textbox', { name: 'Body name', exact: true });
    await name.fill('uncommitted rename');
    const draft = await read();
    await reveal().click();
    assert.equal(await name.inputValue(), 'uncommitted rename');
    assert.equal(await name.evaluate(el => document.activeElement === el), true);
    assert.deepEqual(await read(), draft);
    await name.press('Escape');
    await f.same(seed);
    await f.dismissToasts();
    await reveal().focus();
    const keyboard = await read();
    await reveal().press('Enter');
    assert.deepEqual(await read(), keyboard);
    assert.ok((await scrollState('b71')).focus);
    assert.ok((await scrollState('b71')).visible);
    // A live modeling command remains active and its values unchanged.
    await clickModelCommand(f.page, 'Pattern', 'Linear pattern');
    const hud = f.page.getByRole('dialog', { name: 'Linear pattern', exact: true });
    await hud.waitFor();
    const command = await read();
    await reveal().click();
    assert.equal(await hud.isVisible(), true);
    assert.deepEqual(await read(), command);
    await hud.getByRole('button', { name: 'Cancel', exact: true }).click();
    await f.same(seed);
    await row('b1').click();
    await row('b71').click({ modifiers: ['Shift'] });
    const mixed = await read();
    await reveal().click();
    assert.deepEqual(await read(), mixed);
    await f.page.getByRole('status', { name: 'Find selection in Browser', exact: true }).filter({ hasText: /one base body/ }).waitFor();
    const replacement = structuredClone(seed);
    replacement.nodes = replacement.nodes.map(node => node.kind === 'extrude' ? { ...node, height: 9 } : node);
    await f.page.locator('input[aria-label="Model file"]').setInputFiles({ name: 'same-ids-new-document.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(replacement)) });
    await f.same(replacement);
    assert.equal(await f.page.evaluate(() => document.activeElement?.hasAttribute('data-browser-body-key')), false);
    f.report.observations.push({ width, key: 'b71', firstTop, preserved: ['document','dirty','history','selection','camera','window scroll'] });
  }
  assert.deepEqual(f.report.downloads, []);
});
