import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createFlow, sha256 } from './flow-helper.mjs';

const output = process.argv[2], baseline = process.env.D805_BASELINE === '1';
const polyline = process.argv.includes('--polyline');
const unavailable = process.argv.includes('--unavailable');
const pins = ['apps/cad-studio/test/ordinary-path-gap-browser.mjs', 'apps/cad-studio/src/sketch/useSketchActions.ts',
  'apps/cad-studio/src/sketch/usePathGap.ts', 'apps/cad-studio/src/sketch/pathGap.ts', 'packages/barocss-cad-model/src/engine/curveSource.ts'];
const f = await createFlow({
  name: 'ordinary-path-gap', output, envFrozen: polyline ? 'D1889_SOURCE_FROZEN' : 'D805_SOURCE_FROZEN', initialFiles: pins, requiredFrozen: pins,
  qualification: 'Keep a gapped ordinary draft open through Finish refusal and explicitly make both direct curves.',
  limits: [polyline ? 'One new unconstrained straight four-point path in the default XY plane.' : 'One new unconstrained line in the default XY plane.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { geometryOf, curveLength } from '@barocss/cad-model/engine/direct';
import { curveDomain, evaluateCurve } from '@barocss/cad';
const { direct } = JSON.parse(readFileSync(process.argv[2], 'utf8'));
console.log(JSON.stringify(direct.objects.map(object => {
  const curve = geometryOf(direct, object);
  if (curve.kind !== 'curve') throw Error('Expected a direct curve');
  const [lo, hi] = curveDomain(curve);
  return { ends: [evaluateCurve(curve, lo), evaluateCurve(curve, hi)], length: curveLength(direct, object.id),
    ...(process.argv[3] === 'true' ? { points: curve.controlPoints, degree: curve.degree, knots: curve.knots, weights: curve.weights } : {}) };
})));
`,
});
const a = [20, 20], b = [44, 38], mid = [32, 29];
const start = [16, 20], end = [44, 42];
const points = polyline ? [start, a, b, end] : [a, b];
const button = (parent, name) => parent.getByRole('button', { name, exact: true });
const gap = () => button(f.sketchPanel(), polyline ? 'Cut polyline gap' : 'Cut line gap');
const preview = () => f.page.locator('.vp-overlay .sk-path-gap');
const versions = () => f.page.getByRole('complementary', { name: 'Versions panel', exact: true });
const project = (polyline ? 'D1889 ordinary path gap ' : 'D805 ordinary line gap ') + randomUUID(), name = 'Untitled.bcad';
async function openProject() {
  if (!(await versions().isVisible())) await button(f.page, 'Project and versions').click();
  if (await versions().getByLabel('Project', { exact: true }).isVisible()) return;
  await versions().getByRole('textbox', { name: 'Browser project name', exact: true }).fill(project);
  await button(versions(), 'Project in this browser').click();
  await versions().getByLabel('Project', { exact: true }).waitFor();
}

await f.run(async () => {
  await f.newPage();
  await button(f.page, 'New part').click();
  await f.page.waitForFunction(() => window.__studioDoc.nodes.length === 0);
  await f.ready();
  const empty = await f.doc();
  await button(f.page.locator('.mode'), 'Sketch').click();
  await f.sketchPanel().waitFor();
  await f.tool('Line', 'l');
  await f.frame([...points, mid]);
  for (const point of points) await f.worldClick(point);
  await f.tool('Trim', 't');
  if (unavailable) {
    f.phase = 'Verify the ordinary polyline gap command is unavailable on the base';
    assert.equal(await gap().count(), 0);
    await f.same(empty);
    await f.snapshot('00-polyline-gap-unavailable');
    return;
  }
  if (!baseline) {
    f.phase = 'cut a 4 mm gap in the ordinary draft';
    const cutA = [30.4, 27.8], cutB = [33.6, 30.2];
    await gap().click();
    await f.sketchPanel().getByLabel('Gap length', { exact: true }).fill('4');
    const pixel = await f.screenOf(mid);
    assert.ok(await f.page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('canvas.vp-canvas'), pixel), pixel);
    if (polyline) {
      await f.worldClick(a);
      await f.sketchPanel().getByText('Pick one span away from a corner, or reduce Gap length.', { exact: true }).waitFor();
      await f.same(empty);
      await f.snapshot('00-corner-refused');
    }
    const show = async () => {
      await f.page.mouse.move(...pixel);
      await preview().waitFor({ timeout: 5000 });
    };
    const marks = async () => {
      const actual = await f.page.locator('.vp-overlay .sk-path-gap-end').evaluateAll(nodes => nodes.map(node => {
        const rect = node.closest('svg').getBoundingClientRect();
        return [node.cx.baseVal.value + rect.left, node.cy.baseVal.value + rect.top];
      }));
      const expected = await Promise.all([cutA, cutB].map(point => f.screenOf(point)));
      assert.equal(actual.length, 2);
      assert.ok(expected.every(point => actual.some(entry => Math.hypot(entry[0] - point[0], entry[1] - point[1]) < 1)));
    };
    await show();
    if (polyline) {
      await marks();
      await f.snapshot('00-ordinary-gap-preview');
      await f.page.keyboard.press('Escape');
      await preview().waitFor({ state: 'hidden' });
      await f.sketchPanel().waitFor();
      assert.equal(await gap().getAttribute('aria-pressed'), 'false');
      await f.same(empty);
      await f.snapshot('00-cancelled-gap');
      await gap().click();
      await show();
      await marks();
      assert.equal(await f.page.getByRole('button', { name: 'Undo', exact: true }).isEnabled(), false);
    } else await f.snapshot('00-ordinary-gap-preview');
    await f.page.mouse.click(...pixel);
    await preview().waitFor({ state: 'hidden' });
    if (polyline) {
      f.phase = 'Undo and Redo the two ordinary fragments as one draft edit';
      const fragments = f.page.locator('.vp-overlay polyline.sk-shape.done.open:not(.construction)');
      const geometry = () => fragments.evaluateAll(nodes => nodes.map(node => node.getAttribute('points')));
      const cutGeometry = await geometry();
      assert.equal(cutGeometry.length, 2);
      await f.page.getByRole('button', { name: 'Undo', exact: true }).click();
      await fragments.waitFor();
      assert.equal(await fragments.count(), 1);
      await f.same(empty);
      await f.snapshot('00-draft-undo');
      await f.page.getByRole('button', { name: 'Redo', exact: true }).click();
      assert.deepEqual(await geometry(), cutGeometry);
      await f.same(empty);
      await f.snapshot('00-draft-redo');
    }
  }

  f.phase = 'refuse Finish and keep the ordinary open path';
  await f.page.locator('.topbar button.finish').click();
  await f.sketchPanel().getByRole('alert').getByText(/trim the open chain/i).waitFor();
  await f.same(empty);
  await f.snapshot('01-finish-refusal');

  f.phase = 'make the ordinary paths explicitly';
  await button(f.sketchPanel(), 'Make curves').click();
  await f.sketchPanel().waitFor({ state: 'hidden' });
  await f.page.waitForFunction(count => window.__studioDoc.direct?.objects.length === count, baseline ? 1 : 2);
  await f.ready();
  const doc = await f.doc();
  assert.deepEqual(doc.nodes, []);
  const native = await f.inspect('ordinary-line-native', doc, polyline);
  const expected = baseline ? [[a, b]] : [
    [polyline ? start : a, [30.4, 27.8]], [[33.6, 30.2], polyline ? end : b],
  ];
  const expectPoint = (actual, [x, y, z = 0]) =>
    assert.ok(Math.hypot(actual[0] - x, actual[1] - y, actual[2] - z) < 1e-5, JSON.stringify(actual));
  assert.equal(native.length, expected.length);
  for (const [index, ends] of expected.entries()) {
    ends.forEach((point, endIndex) => expectPoint(native[index].ends[endIndex], point));
    if (!polyline) assert.ok(Math.abs(native[index].length - (baseline ? 30 : 13)) < 1e-5, native[index]);
    else {
      const { degree, knots, weights, points } = native[index];
      assert.equal(degree, 2);
      assert.deepEqual(knots, [0, 0, 0, 1, 1, 2, 2, 2]);
      assert.deepEqual(weights, [1, 1, 1, 1, 1]);
      assert.equal(points.length, 5);
      const corner = index === 0 ? a : b;
      const middle = (start, end) => start.map((value, axis) => (value + end[axis]) / 2);
      [ends[0], middle(ends[0], corner), corner, middle(corner, ends[1]), ends[1]]
        .forEach((point, i) => expectPoint(points[i], point));
      const exact = Math.hypot(...points[0].map((value, axis) => value - points[2][axis]))
        + Math.hypot(...points[2].map((value, axis) => value - points[4][axis]));
      assert.ok(Math.abs(exact - 17) < 1e-5, exact);
    }
  }
  await f.snapshot('02-made-curve');
  f.report.observations.push({ label: 'ordinary-open-path', baseline, finish: 'REFUSED', native });
  if (!baseline) {
    const cutEnds = [native[0].ends[1], native[1].ends[0]];
    const distance = Math.hypot(...cutEnds[0].map((coordinate, axis) => coordinate - cutEnds[1][axis]));
    assert.ok(Math.abs(distance - 4) < 1e-5, distance);
    await f.undo();
    await f.same(empty);
    await f.redo();
    await f.same(doc);

    f.phase = 'save and reopen the exact direct curves';
    await openProject();
    await button(f.page, 'Save').click();
    await versions().getByRole('list', { name: 'Project documents', exact: true }).getByText(name, { exact: true }).waitFor();
    await f.page.getByLabel('Unsaved changes', { exact: true }).waitFor({ state: 'hidden' });
    const bytes = Buffer.from(await f.page.evaluate(async ([project, name]) => {
      const projects = await (await navigator.storage.getDirectory()).getDirectoryHandle('projects');
      const directory = await projects.getDirectoryHandle(project);
      return Array.from(new Uint8Array(await (await (await directory.getFileHandle(name)).getFile()).arrayBuffer()));
    }, [project, name]));
    assert.deepEqual(JSON.parse(bytes), doc);
    await button(versions(), 'Close project').click();
    await versions().getByLabel('Project', { exact: true }).waitFor({ state: 'hidden' });
    await f.page.reload();
    await f.page.waitForSelector('.viewport[data-renderer="webgpu"]');
    await f.ready();
    await openProject();
    await button(versions(), 'Open ' + name).click();
    await f.same(doc);
    assert.equal(await preview().count(), 0);
    if (polyline) assert.deepEqual(await f.inspect('ordinary-polyline-reopened-native', doc, true), native);
    await f.snapshot('03-reopened-curves');
    f.report.observations.push({ label: 'ordinary-gap-project', gapMm: distance, bytes: bytes.length, sha256: sha256(bytes) });
  }
  assert.deepEqual(f.report.downloads, []);
});
