import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow, sha256 } from './flow-helper.mjs';

const output = process.argv[2], baseline = process.env.D803_BASELINE === '1';
const contract = process.argv.includes('--contract');
const multi = process.argv.includes('--multi-arc-polyline');
const curved = multi || process.argv.includes('--curved-polyline');
const polyline = curved || process.argv.includes('--polyline');
const label = contract ? 'D1890' : multi ? 'D1618' : curved ? 'D1607' : polyline ? 'D1602' : 'D803';
const geometryOnly = polyline || process.argv.includes('--geometry-only');
const pins = ['apps/cad-studio/test/line-path-gap-browser.mjs', 'apps/cad-studio/src/sketch/usePathGap.ts',
  'apps/cad-studio/src/sketch/pathGap.ts',
  'apps/cad-studio/src/viewport/viewportPointerInput.ts', 'packages/barocss-cad-model/src/sketch/trim.ts'];
const f = await createFlow({
  name: 'line-path-gap', output, envFrozen: label + '_SOURCE_FROZEN', initialFiles: pins, requiredFrozen: pins,
  qualification: contract ? 'Verify the remaining straight Gap refusal and draft ownership contract in desktop Studio.'
    : polyline ? 'Cut 4 mm along a middle construction span and retain the adjoining spans and IDs.'
    : 'Cut 4 mm along a slanted construction segment and retain both identified ends.',
  limits: [multi ? 'Three semicircles in an open construction polyline and one separate closed rectangle in XY.'
    : curved ? 'One quarter arc between two straight spans in a construction polyline and one separate closed rectangle in XY.'
    : polyline ? 'One four-point straight construction polyline and one separate closed stock rectangle in XY.'
    : 'One 30 mm construction segment and one separate closed stock rectangle in XY.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { toPartDocument } from '@barocss/cad-model/engine/part';
import { checkOutput, evaluateCadPart, massPropertiesOf } from '@barocss/cad';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
console.log(JSON.stringify(evaluateCadPart(toPartDocument(doc)).outputs.map(body => ({
  valid: checkOutput(body).valid, volume: massPropertiesOf(body).volume,
}))));
`,
});
const line = {
  kind: 'polygon', closed: false, pending: false, construction: true,
  points: multi ? [[54, 20], [50, 20], [30, 20], [10, 20], [-10, 20], [-14, 20]]
    : curved ? [[16, 20], [20, 20], [35, 35], [35, 39]]
    : polyline ? [[16, 20], [20, 20], [44, 38], [44, 42]] : [[20, 20], [44, 38]],
  bulges: multi ? [0, -1, 1, -1, 0, 0] : polyline ? [0, curved ? Math.tan(-Math.PI / 8) : 0, 0, 0] : [0, 0],
  ids: multi ? ['e5', 'e6', 'e7', 'e8', 'e9', 'e10'] : polyline ? ['e5', 'e6', 'e7', 'e8'] : ['e5', 'e6'] };
const stock = { kind: 'sketch', profile: 'rectangle', min: [50, 40], max: [55, 45], sideTags: { outer: ['e1', 'e2', 'e3', 'e4'] }, id: 'n0' };
const initial = { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {},
  nodes: [{ ...stock, construction: [line] }], outputs: {}, nextId: 1 };
const replacement = { ...initial, nodes: [stock] };
const radius = multi ? 10 : 15, centre = multi ? [20, 20] : [35, 20];
const midAngle = multi ? Math.PI / 2 : 3 * Math.PI / 4;
const sweepSign = multi ? 1 : -1, arcSpan = multi ? 2 : 1;
const arcPoint = (angle, r = radius) => [centre[0] + r * Math.cos(angle), centre[1] + r * Math.sin(angle)];
const pick = curved ? arcPoint(midAngle) : [32, 29];
const nearEnd = curved ? arcPoint(multi ? 0.05 : Math.PI - 0.05) : [21, 20.75];
const outside = curved ? arcPoint(midAngle, radius - 3) : [33.2, 27.4];
const cutPoints = curved ? [arcPoint(midAngle - sweepSign * 2 / radius), arcPoint(midAngle + sweepSign * 2 / radius)]
  : [[30.4, 27.8], [33.6, 30.2]];
const distance = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const button = (parent, name) => parent.getByRole('button', { name, exact: true });
const gap = () => button(f.sketchPanel(), polyline ? 'Cut polyline gap' : 'Cut line gap');
const length = () => f.sketchPanel().getByLabel('Gap length', { exact: true });
const preview = () => f.page.locator('.vp-overlay .sk-path-gap');
const versions = () => f.page.getByRole('complementary', { name: 'Versions panel', exact: true });
const project = label + ' gap ' + randomUUID(), name = multi ? 'multi-arc-polyline-gap.bcad' : curved ? 'arc-polyline-gap.bcad' : polyline ? 'polyline-gap.bcad' : 'line-gap.bcad';
async function edit() {
  await button(f.page.getByRole('group', { name: 'History', exact: true }), 'Sketch · rectangle').click();
  await button(f.editor(), 'Edit sketch').click();
  await f.sketchPanel().waitFor();
  await f.tool('Trim', 't');
  await f.frame([pick, outside, ...line.points]);
}
async function hover(point) {
  const pixel = await f.screenOf(point);
  assert.ok(await f.page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('canvas.vp-canvas'), pixel), pixel);
  await f.page.mouse.move(...pixel);
  await f.page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  return pixel;
}
async function openProject() {
  if (!(await versions().isVisible())) await button(f.page, 'Project and versions').click();
  if (await versions().getByLabel('Project', { exact: true }).isVisible()) return;
  await versions().getByRole('textbox', { name: 'Browser project name', exact: true }).fill(project);
  await button(versions(), 'Project in this browser').click();
  await versions().getByLabel('Project', { exact: true }).waitFor();
}

async function verifyCloseoutContract() {
  const variants = [
    ['constrained', [{ ...line, lengths: { 0: 30 } }]],
    ['overlap', [line, { ...line, ids: ['e7', 'e8'], points: [[21.6, 21.2], [45.6, 39.2]] }]],
    ['current', [line]],
  ];
  const geometry = () => f.page.locator('.vp-overlay .sk-shape[points]').evaluateAll(nodes => nodes.map(node =>
    [node.classList.contains('construction') ? 'construction' : 'material', node.getAttribute('points')]).sort());
  const history = () => Promise.all(['Undo', 'Redo'].map(name => button(f.page, name).isEnabled()));
  const checkMarks = async () => {
    const pixel = await hover(pick);
    await preview().waitFor();
    const actual = await f.page.locator('.vp-overlay .sk-path-gap-end').evaluateAll(nodes => nodes.map(node => {
      const point = new DOMPoint(node.cx.baseVal.value, node.cy.baseVal.value).matrixTransform(node.getScreenCTM());
      return [point.x, point.y];
    }));
    const expected = await Promise.all(cutPoints.map(point => f.screenOf(point)));
    assert.equal(actual.length, 2);
    assert.ok(expected.every(point => actual.some(value => distance(point, value) < 1)));
    return pixel;
  };
  for (const [kind, construction] of variants) {
    f.phase = `Open the ${kind} construction sources in the actual sketch editor`;
    await f.newPage();
    const doc = { ...initial, nodes: [{ ...stock, construction }] };
    await f.openFile({ name: `gap-${kind}.bcad`, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) }, 1);
    await f.same(doc);
    await edit();
    const original = await geometry(), originalHistory = await history();
    assert.equal(original.filter(([cls]) => cls.includes('construction')).length, construction.length);
    if (kind !== 'current') {
      assert.equal(await gap().count(), 0);
      await hover(pick);
      assert.equal(await preview().count(), 0);
      assert.deepEqual(await geometry(), original);
      assert.deepEqual(await history(), originalHistory);
      await f.same(doc);
      await f.snapshot(`${kind}-gap-refused`);
      continue;
    }

    f.phase = 'Switch tools with a gap preview open';
    await gap().click();
    await checkMarks();
    await f.snapshot('original-measured-preview');
    await f.tool('Select', 's');
    await preview().waitFor({ state: 'hidden' });
    await length().waitFor({ state: 'hidden' });
    await f.worldClick([48, 35]);
    assert.deepEqual(await geometry(), original);
    assert.deepEqual(await history(), originalHistory);
    await f.same(doc);
    await f.snapshot('tool-change-retired-preview');

    f.phase = 'Hide the source during a new preview and reject the old canvas point';
    await f.tool('Trim', 't');
    await gap().click();
    await checkMarks();
    await button(f.page, 'Hide construction').click();
    await preview().waitFor({ state: 'hidden' });
    await length().waitFor({ state: 'hidden' });
    assert.equal(await gap().count(), 0);
    await f.worldClick(pick);
    await f.dismissToasts();
    await button(f.page, 'Show construction').click();
    await gap().waitFor();
    assert.equal(await length().count(), 0);
    assert.deepEqual(await geometry(), original);
    assert.deepEqual(await history(), originalHistory);
    await f.same(doc);
    await f.snapshot('source-change-retired-preview');

    f.phase = 'Add an ordinary crossing to the same draft and compare measured cut endpoints';
    await f.tool('Line', 'l');
    await f.worldClick([32, 24]);
    await f.worldClick([32, 34]);
    await f.tool('Trim', 't');
    const withCrossing = await geometry();
    assert.equal(withCrossing.length, original.length + 1);
    await gap().click();
    const pixel = await checkMarks();
    await f.snapshot('measured-preview-with-crossing');
    await f.page.mouse.click(...pixel);
    await length().waitFor({ state: 'hidden' });
    const cut = await geometry();
    assert.equal(cut.length, withCrossing.length + 1);
    const retainedEnds = await f.page.locator('.vp-overlay polyline.sk-shape.construction.open').evaluateAll(nodes => nodes.flatMap(node =>
      [node.points.getItem(0), node.points.getItem(node.points.length - 1)].map(point => {
        const screen = new DOMPoint(point.x, point.y).matrixTransform(node.getScreenCTM());
        return [screen.x, screen.y];
      })));
    assert.equal(retainedEnds.length, 4);
    const cutEndPixels = await Promise.all(cutPoints.map(point => f.screenOf(point)));
    assert.ok(cutEndPixels.every(point => retainedEnds.some(value => distance(point, value) < 1)));
    assert.deepEqual(cut.filter(([cls]) => !cls.includes('construction')),
      withCrossing.filter(([cls]) => !cls.includes('construction')));
    await f.same(doc);
    await f.snapshot('crossing-kept-after-gap');
    await button(f.page, 'Undo').click();
    assert.deepEqual(await geometry(), withCrossing);
    await f.same(doc);
    await button(f.page, 'Redo').click();
    assert.deepEqual(await geometry(), cut);
    await f.same(doc);
    await f.snapshot('crossing-kept-after-redo');
  }
}

await f.run(async () => {
  if (contract) return verifyCloseoutContract();
  if (polyline) {
    const newContext = f.browser.newContext.bind(f.browser);
    f.browser.newContext = async options => {
      const context = await newContext(options);
      const origin = new URL(f.server.resolvedUrls.local[0]).origin;
      await context.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
        return url.origin === origin || !['http:', 'https:'].includes(url.protocol) ? route.continue() : route.abort();
      });
      return context;
    };
  }
  await f.newPage();
  const file = join(output, name);
  await writeFile(file, JSON.stringify(initial));
  await f.openFile(file, 1);
  const opened = await f.doc();
  assert.deepEqual(opened.nodes, initial.nodes);
  await edit();
  if (baseline) {
    f.phase = 'ordinary Trim removes the entire straight reference';
    await f.worldClick(pick);
    const trimmed = await f.finishSketch('01-ordinary-trim');
    assert.equal(trimmed.doc.nodes[0].construction?.length ?? 0, 0);
    assert.deepEqual(trimmed.doc.nodes[0], stock);
    await f.undo();
    await f.same(opened);
    f.report.observations.push({ label: 'line-trim-baseline', sourceLengthMm: 30, retainedLengthMm: 0 });
    assert.deepEqual(f.report.downloads, []);
    return;
  }

  f.phase = 'refuse a hidden source, a missed line, and an end-spanning gap';
  await button(f.page, 'Hide construction').click();
  assert.equal(await gap().count(), 0);
  await button(f.page, 'Show construction').click();
  await gap().click();
  await length().fill('4');
  await hover(outside);
  assert.equal(await preview().count(), 0);
  await f.worldClick(nearEnd);
  const endNotice = polyline ? 'Pick one span away from a corner, or reduce Gap length.' : 'The gap must fit inside the line.';
  await f.sketchPanel().getByRole('status').getByText(endNotice).waitFor();
  await f.same(opened);
  if (polyline) await f.snapshot('00-corner-refused');
  await hover(pick);
  await preview().waitFor({ timeout: 5000 });

  if (geometryOnly) {
    f.phase = 'cancel this preview without changing the sketch';
    await f.page.keyboard.press('Escape');
    await length().waitFor({ state: 'hidden' });
    await preview().waitFor({ state: 'hidden' });
    await f.same(opened);
  } else {
    f.phase = 'retire the preview when a replacement reuses the sketch ID';
    const replacementFile = join(output, 'same-id-no-line.bcad');
    await writeFile(replacementFile, JSON.stringify(replacement));
    const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), button(f.page, 'Open').click()]);
    await chooser.setFiles(replacementFile);
    await f.same(replacement);
    await f.sketchPanel().waitFor({ state: 'hidden' });
    await preview().waitFor({ state: 'hidden' });
    await edit();
    assert.equal(await gap().count(), 0);
    await f.page.keyboard.press('Escape');
    await f.sketchPanel().waitFor({ state: 'hidden' });
    await f.openFile(file, 1);
    await f.same(opened);
    await edit();
  }
  assert.equal(await gap().getAttribute('aria-pressed'), 'false');

  f.phase = 'cut four millimetres measured along the picked span';
  await gap().click();
  const hit = await hover(pick);
  await preview().waitFor({ timeout: 5000 });
  const marks = await f.page.locator('.vp-overlay .sk-path-gap-end').evaluateAll(elements => elements.map(element => {
    const point = new DOMPoint(element.cx.baseVal.value, element.cy.baseVal.value).matrixTransform(element.getScreenCTM());
    return [point.x, point.y];
  }));
  assert.equal(marks.length, 2);
  for (const [index, point] of cutPoints.entries()) {
    const projected = await f.screenOf(point);
    assert.ok(Math.hypot(projected[0] - marks[index][0], projected[1] - marks[index][1]) < 1);
  }
  await f.snapshot('01-line-gap-preview');
  await f.page.mouse.click(...hit);
  await length().waitFor({ state: 'hidden' });
  await f.page.mouse.click(...hit);
  if (polyline) await f.snapshot('02-cut-polyline');
  const edited = await f.finishSketch('02-line-fragments');
  const { construction, ...stockAfter } = edited.doc.nodes[0], [first, second] = construction;
  assert.equal(construction.length, 2);
  assert.deepEqual([...first.points.slice(0, -1), ...second.points.slice(1)], line.points);
  const expectedIds = multi ? [['e5', 'e6', 'e7', 'e11'], ['e12', 'e8', 'e9', 'e10']]
    : polyline ? [['e5', 'e6', 'e9'], ['e10', 'e7', 'e8']] : [['e5', 'e7'], ['e8', 'e6']];
  assert.deepEqual([first.ids, second.ids], expectedIds);
  assert.ok([first, second].every(part => part.construction && !part.closed && !part.pending));
  const cuts = [first.points.at(-1), second.points[0]];
  // The mouse lands on the projected sketch. Allow the existing stored-path tolerance for the Zoom and camera state.
  const positionTolerance = geometryOnly ? 1e-5 : 3e-6;
  for (const [index, point] of cutPoints.entries()) assert.ok(distance(cuts[index], point) < positionTolerance, cuts[index]);
  const chord = distance(...cuts);
  let removed = chord;
  if (curved) {
    removed = 2 * radius * Math.asin(chord / (2 * radius));
    assert.ok(removed - chord > 0.01);
    const [before, after] = [first.bulges[arcSpan], second.bulges[0]];
    assert.deepEqual(first.bulges.slice(0, arcSpan), line.bulges.slice(0, arcSpan));
    assert.equal(first.bulges.at(-1), 0);
    assert.deepEqual(second.bulges.slice(1), line.bulges.slice(arcSpan + 1));
    assert.ok(before * sweepSign > 0 && after * sweepSign > 0);
    const remainingSweep = 4 * sweepSign * (Math.atan(before) + Math.atan(after));
    const originalSweep = multi ? Math.PI : Math.PI / 2;
    assert.ok(Math.abs(radius * remainingSweep + removed - radius * originalSweep) < 1e-5);
    for (const [a, b, bulge] of [[line.points[arcSpan], cuts[0], before], [cuts[1], line.points[arcSpan + 1], after]]) {
      const storedRadius = distance(a, b) / (2 * Math.sin(2 * sweepSign * Math.atan(bulge)));
      assert.ok(Math.abs(storedRadius - radius) < 1e-5, storedRadius);
    }
  } else {
    const bulges = polyline ? [0, 0, 0] : [0, 0];
    assert.deepEqual([first.bulges, second.bulges], [bulges, bulges]);
    const lengthOf = ({ points }) => points.slice(1).reduce((total, point, index) => total + distance(points[index], point), 0);
    for (const part of [first, second]) assert.ok(Math.abs(lengthOf(part) - (polyline ? 17 : 13)) < 1e-5);
  }
  assert.ok(Math.abs(removed - 4) < 1e-5, removed);
  assert.deepEqual(stockAfter, stock);
  await f.undo();
  await f.same(opened);
  await f.redo();
  await f.same(edited.doc);
  await f.openExtrudeHud();
  const solid = await f.applyExtrude({ distance: 2, previous: edited.doc, label: '03-unchanged-stock' });
  const [native] = await f.inspect('line-gap-stock', solid.doc);
  assert.equal(native.valid, true);
  assert.ok(Math.abs(native.volume - 50) < 1e-8);
  assert.ok(Math.abs((await f.bodies()).bodies[0].volume - 50) < 1e-8);

  f.phase = 'save and reopen the two open line references';
  await openProject();
  await button(f.page, 'Save').click();
  await versions().getByRole('list', { name: 'Project documents', exact: true }).getByText(name, { exact: true }).waitFor();
  await f.page.getByLabel('Unsaved changes', { exact: true }).waitFor({ state: 'hidden' });
  const bytes = Buffer.from(await f.page.evaluate(async ([project, name]) => {
    const projects = await (await navigator.storage.getDirectory()).getDirectoryHandle('projects');
    const directory = await projects.getDirectoryHandle(project);
    return Array.from(new Uint8Array(await (await (await directory.getFileHandle(name)).getFile()).arrayBuffer()));
  }, [project, name]));
  assert.deepEqual(JSON.parse(bytes), solid.doc);
  await button(versions(), 'Close project').click();
  await versions().getByLabel('Project', { exact: true }).waitFor({ state: 'hidden' });
  await f.page.reload();
  await f.page.waitForSelector('.viewport[data-renderer="webgpu"]');
  await f.ready();
  await openProject();
  await button(versions(), 'Open ' + name).click();
  await f.same(solid.doc);
  assert.equal(await preview().count(), 0);
  await f.snapshot('04-reopened');
  if (polyline) {
    await f.openFeatureEditor(1, 'reopened stock Extrude');
    await button(f.editor(), 'Edit sketch').click();
    await f.sketchPanel().waitFor();
    await f.tool('Trim', 't');
    await f.frame(line.points);
    await f.snapshot('05-reopened-polyline');
    await f.page.keyboard.press('Escape');
    await f.sketchPanel().waitFor({ state: 'hidden' });
    await f.same(solid.doc);
  }
  f.report.observations.push({ label: curved ? 'arc-gap' : 'line-gap', cuts, removedMm: removed, chordMm: chord, retainedIds: [first.ids, second.ids], volumeMm3: 50,
    bytes: bytes.length, sha256: sha256(bytes) });
  assert.deepEqual(f.report.downloads, []);
});
