import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createFlow } from './flow-helper.mjs';
const baseline = process.argv.includes('--baseline');
const f = await createFlow({ name: 'three-vertex-frame-guidance', output: process.argv[2], envFrozen: 'THREE_VERTEX_GUIDANCE_FROZEN', initialFiles: ['apps/cad-studio/test/three-vertex-frame-guidance-browser.mjs', 'apps/cad-studio/src/ui/SketchPanel.tsx', 'apps/cad-studio/src/ui/VertexPlaneSummary.tsx'], qualification: baseline ? 'Observe absence of ordered vertex frame and fixed-snapshot guidance in actual Sketch panel' : 'Ordered native-vertex frame guidance', limits: ['Single native box and ordered non-axis plane; no new topology or geometry algorithm qualification.'] });
const seed = JSON.parse(await readFile(resolve(f.app, 'test/fixtures/linear-cut-pattern.bcad'), 'utf8'));
seed.nodes = seed.nodes.slice(0, 2);
seed.outputs = { b1: { node: 1, side: 'solid' } };
seed.nextId = 2;
const points = [[0, 0, 10], [60, 30, 10], [60, 0, 0]];
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
async function pick(point, inward, count, ordered = points) {
    const [corner, centre] = await f.page.evaluate(ps => ps.map(p => window.__studioScreenOf(p)), [point, inward]);
    const d = centre.map((v, i) => v - corner[i]), l = Math.hypot(...d), pixel = corner.map((v, i) => v + 3 * d[i] / l);
    assert.ok(await f.page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('canvas.vp-canvas'), pixel));
    if (count > 1)
        await f.page.keyboard.down('Shift');
    try {
        await f.page.mouse.click(...pixel);
    }
    finally {
        if (count > 1)
            await f.page.keyboard.up('Shift');
    }
    await f.page.waitForFunction(n => window.__studioSelection?.selection.vertices?.length === n, count);
    assert.deepEqual(await f.page.evaluate(() => window.__studioSelection.selection.vertices.map(v => v.at)), ordered.slice(0, count));
}
const summary = () => f.sketchPanel().getByRole('region', { name: 'Selected vertex plane summary', exact: true });
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = v => v.map(x => x / Math.hypot(...v));
function expectedFrame(ordered, offset = 0, angle = 0) {
    const [o, p, q] = ordered, x = unit(p.map((v, i) => v - o[i])), n = unit(cross(p.map((v, i) => v - o[i]), q.map((v, i) => v - o[i]))), y = cross(n, x), r = angle * Math.PI / 180;
    const normal = n.map((v, i) => v * Math.cos(r) + y[i] * Math.sin(r));
    return { 'Origin (mm)': o.map((v, i) => v + offset * normal[i]), '+X': x, '+Y': cross(normal, x), Normal: normal };
}
async function invariant() { return f.page.evaluate(() => ({ doc: window.__studioDoc, dirty: !!document.querySelector('[aria-label="Unsaved changes"]'), undo: document.querySelector('button[aria-label="Undo"]')?.disabled, redo: document.querySelector('button[aria-label="Redo"]')?.disabled })); }
async function checkFrame(ordered, label, offset = 0, angle = 0) {
    await summary().waitFor();
    const before = await invariant(), expected = expectedFrame(ordered, offset, angle), actual = {};
    for (const [name, vector] of Object.entries(expected)) {
        const matches = await summary().locator('.kv').evaluateAll((rows, label) => rows
            .filter(row => [...row.childNodes].filter(node => node.nodeType === Node.TEXT_NODE)
            .map(node => node.textContent).join('').trim() === label)
            .map(row => row.querySelector('b')?.textContent), name);
        assert.equal(matches.length, 1, `one displayed row for ${name}`);
        const text = matches[0];
        assert.equal(typeof text, 'string');
        actual[name] = text.split(',').map(Number);
        assert.equal(actual[name].length, 3);
        vector.forEach((v, i) => { const rounded = Number(v.toPrecision(6)); assert.ok(Math.abs(actual[name][i] - rounded) <= 1e-12, `${label} ${name}: ${text} vs ${vector}`); });
    }
    assert.match(await summary().innerText(), /fixed snapshot/i);
    assert.deepEqual(await invariant(), before);
    await f.same(seed);
    f.report.observations.push({ label, ordered, offset, angle, expected, displayed: actual, displayPrecision: 6, inspectionNoMutation: true });
}
async function openOrdered(ordered, label) {
    await f.newPage();
    await f.openFile({ name: 'three-point-frame.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) }, 2);
    await f.same(seed);
    await button('Top', f.page.locator('.views')).click();
    if (await button('Ortho').getAttribute('aria-pressed') !== 'true')
        await button('Ortho').click();
    await f.page.getByTitle('Frame all (F)', { exact: true }).click();
    for (let i = 0; i < ordered.length; i++) {
        const p = ordered[i];
        await button(p[2] === 0 ? 'Front' : 'Top', f.page.locator('.views')).click();
        await pick(p, p[2] === 0 ? [30, 0, 5] : [30, 15, 10], i + 1, ordered);
    }
    const before = await f.snapshot(label + '-ordered-native-points');
    await button('Sketch', f.page.locator('.mode')).click();
    await f.sketchPanel().waitFor();
    assert.equal(await f.sketchPanel().getByLabel('Sketch plane', { exact: true }).inputValue(), 'vertices');
    await f.same(seed);
    return before;
}
await f.run(async () => {
    const before = await openOrdered(points, '01');
    if (baseline) {
        const text = await f.sketchPanel().innerText();
        assert.doesNotMatch(text, /fixed snapshot|captured|origin|normal|\+X|\+Y/i);
        f.report.observations.push({ baseline, orderedPoints: points, plane: 'vertices', panelText: text, docExact: true, beforeSelection: before.selection });
        await f.snapshot('02-selected-vertices-no-guidance');
        return;
    }
    await checkFrame(points, '02-original-frame');
    await f.snapshot('02-current-frame');
    await f.sketchPanel().getByLabel('Plane angle', { exact: true }).fill('30');
    await f.sketchPanel().getByLabel('Plane offset', { exact: true }).fill('2');
    await checkFrame(points, '03-offset-angle', 2, 30);
    assert.match(await summary().innerText(), /current frame includes the plane offset or angle/);
    await f.snapshot('03-adjusted-frame');
    await f.sketchPanel().getByLabel('Sketch plane', { exact: true }).selectOption('xy');
    assert.equal(await summary().count(), 0);
    await f.same(seed);
    const swapped = [points[0], points[2], points[1]];
    await openOrdered(swapped, '04-swapped');
    await checkFrame(swapped, '05-swapped-frame');
    await f.snapshot('05-swapped-frame');
    // Existing saved sketch re-entry has no captured vertex anchor. Do not invent one.
    await f.newPage();
    await f.openFile({ name: 'existing-sketch.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) }, 2);
    await f.same(seed);
    await f.openFeatureEditor(1);
    await f.editor().getByRole('button', { name: 'Edit sketch', exact: true }).click();
    await f.sketchPanel().waitFor();
    assert.equal(await summary().count(), 0);
    await f.same(seed);
    f.report.observations.push({ xyHasNoVertexClaim: true, existingSketchReopenHasNoVertexClaim: true, faceActual: 'NOT_RUN', baselineActual: 'NOT_RUN: heavy gate exit75 after129s, no browser started' });
});
