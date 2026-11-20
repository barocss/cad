import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const driver = 'apps/cad-studio/test/straight-length-label-drag-browser.mjs';
const marks = 'apps/cad-studio/src/ui/SketchMarks.tsx';
const f = await createFlow({
  name: 'straight-length-label-drag',
  envFrozen: 'STRAIGHT_LENGTH_LABEL_SOURCE_FROZEN',
  output: process.argv[2],
  initialFiles: [driver, marks],
  requiredFrozen: [driver, marks],
  qualification: 'Move only the display of a straight driving length in an active XY sketch',
  limits: [
    'Desktop Chrome with WebGPU. Two XY sketches with the same local length key.',
    'Mouse gestures use browser input. The pointercancel check dispatches a DOM event with the active mouse pointer ID.',
    'External font loading and service workers are disabled in the test contexts.',
  ],
  inspectorSource: `
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { emptyDoc, withNode } from '@barocss/cad-model/engine/doc';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
import { profileOf } from '@barocss/cad-model/sketch/loops';
import { brepMassProperties, checkBrep } from '@barocss/cad';

function outline(width: number) {
  const made = profileOf([{
    kind: 'polygon', closed: true,
    points: [[0, 0], [width, 0], [width, 20], [0, 20]],
    lengths: { 0: width }, hv: { h: [0, 2], v: [1, 3] },
  }]);
  assert.ok('node' in made);
  return made.node;
}

const input = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (input.fixture) {
  const first = withNode(emptyDoc(), outline(40));
  const solid = withNode(first, { kind: 'extrude', sketch: 0, height: 5 });
  console.log(JSON.stringify(withNode(solid, outline(30))));
} else {
  console.log(JSON.stringify(partBreps(input).map(({ key, brep }) => {
    const vertices = brep.vertices.map(vertex => vertex.point);
    const span = [0, 1, 2].map(axis => {
      const values = vertices.map(vertex => vertex[axis]);
      return Math.max(...values) - Math.min(...values);
    });
    return {
      key, span, vertices, valid: checkBrep(brep, { strict: true }).valid,
      kinds: brep.bodies.map(body => body.kind), closed: brep.shells.map(shell => shell.closed),
      volume: brepMassProperties(brep, 1).volume,
    };
  })));
}
`,
});

const button = name => f.page.getByRole('button', { name, exact: true });
const chip = () => f.page.locator('.vp-overlay .dim.driving[data-dim="len0"] .dim-chip');
const reset = () => f.page.locator('[data-dim-reset="len0"]');
const inline = () => f.page.locator('.dim-editor input');
const field = () => f.sketchPanel().locator('#sk-len0');
const history = () => Promise.all(['Undo', 'Redo'].map(name => button(name).isEnabled()));
const settle = () => f.page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
const plus = (p, q, scale = 1) => p.map((value, i) => value + q[i] * scale);
const difference = (a, b) => plus(a, b, -1);
const dot = (p, q) => p[0] * q[0] + p[1] * q[1];
const length = p => Math.hypot(...p);
const midpoint = (a, b) => plus(a, difference(b, a), 0.5);

function near(actual, expected, tolerance, label) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: expected ${expected}, got ${actual}`);
}
function nearPoint(actual, expected, label) {
  near(length(difference(actual, expected)), 0, 0.8, label);
}

async function placement(width = 40, points = [[0, 0], [width, 0]]) {
  await chip().waitFor();
  await settle();
  const view = await f.page.evaluate(points => {
    const group = document.querySelector('.vp-overlay .dim.driving[data-dim="len0"]');
    const rect = group.querySelector('.dim-chip').getBoundingClientRect();
    const endpoints = line => {
      const matrix = line.getScreenCTM();
      const point = (x, y) => {
        const px = new DOMPoint(x.baseVal.value, y.baseVal.value).matrixTransform(matrix);
        return [px.x, px.y];
      };
      return [point(line.x1, line.y1), point(line.x2, line.y2)];
    };
    return {
      chip: [rect.x + rect.width / 2, rect.y + rect.height / 2],
      text: group.querySelector('.dim-text').textContent,
      interior: window.__studioScreenOf([(points[0][0] + points[1][0]) / 2, 10, 0]),
      measure: points.map(point => window.__studioScreenOf([...point, 0])),
      dimLine: endpoints(document.querySelector('[data-dim-line="len0"]')),
      extensions: [...document.querySelectorAll('[data-dim-extension="len0"]')].map(endpoints),
    };
  }, points);
  const axis = difference(view.measure[1], view.measure[0]);
  const pxPerMm = length(axis) / width;
  const tangent = axis.map(value => value / length(axis));
  const side = [tangent[1], -tangent[0]];
  const outward = difference(midpoint(...view.measure), view.interior);
  const normal = dot(side, outward) >= 0 ? side : side.map(value => -value);
  const offset = dot(difference(view.chip, midpoint(...view.measure)), normal);
  return { ...view, tangent, normal, pxPerMm, offset, offsetMM: offset / pxPerMm };
}

function checkLines(view) {
  assert.equal(view.extensions.length, 2);
  nearPoint(view.chip, midpoint(...view.dimLine), 'Chip follows the dimension line midpoint');
  for (const [i, endpoint] of view.measure.entries()) {
    nearPoint(view.dimLine[i], plus(endpoint, view.normal, view.offset), 'Dimension line keeps its measured endpoint');
    const [start, end] = view.extensions[i];
    near(dot(difference(start, endpoint), view.tangent), 0, 0.8, 'Extension starts at the measured endpoint along the normal');
    near(dot(difference(end, view.dimLine[i]), view.tangent), 0, 0.8, 'Extension ends beside the relocated dimension line');
    near(dot(difference(start, endpoint), view.normal), 4, 0.8, 'Extension gap from the measured endpoint');
    near(dot(difference(end, view.dimLine[i]), view.normal), 5, 0.8, 'Extension overshoot at the dimension line');
  }
}

async function record(label, view) {
  f.report.observations.push({ label, ...view });
  return f.snapshot(label);
}

async function beginDrag(view, normal, tangent = 0) {
  const destination = plus(plus(view.chip, view.normal, normal), view.tangent, tangent);
  await f.page.mouse.move(...view.chip);
  await f.page.mouse.down();
  await f.page.mouse.move(...destination, { steps: 12 });
  return destination;
}

async function edit(index) {
  if (index === 2) {
    await f.page.locator('.history .hs.sketch').click();
    await f.editor().waitFor();
  } else {
    await f.openFeatureEditor(index);
  }
  await f.editor().getByRole('button', { name: 'Edit sketch', exact: true }).click();
  await f.sketchPanel().waitFor();
  await chip().waitFor();
}

async function checkAutomatic(width, points) {
  const view = await placement(width, points);
  assert.equal(view.text, String(width));
  near(view.offset, 26, 0.8, 'Automatic position');
  assert.equal(await reset().count(), 0);
  checkLines(view);
  return view;
}

async function assertNative(doc, width, label) {
  const [native, worker] = await Promise.all([f.inspect(label, doc), f.bodies()]);
  assert.equal(native.length, 1);
  assert.equal(worker.bodies.length, 1);
  const [body] = native;
  assert.equal(body.key, worker.bodies[0].key);
  assert.equal(body.valid, true);
  assert.deepEqual(body.kinds, ['solid']);
  assert.deepEqual(body.closed, [true]);
  const dimensions = [width, 20, 5];
  dimensions.forEach((value, i) => near(body.span[i], value, 1e-7, 'Native solid dimensions'));
  const volume = width * 20 * 5;
  near(body.volume, volume, 1e-7, 'Analytic versus native volume');
  near(worker.bodies[0].volume, volume, 1e-7, 'Analytic versus Studio worker volume');
  f.report.observations.push({ label, native: body, workerVolume: worker.bodies[0].volume, expectedVolume: volume });
  return body;
}

async function assertSameAccepted(doc, identity, expectedHistory, original, state) {
  assert.deepEqual(state.doc, doc);
  assert.deepEqual(state.history, original.history);
  assert.deepEqual(await history(), expectedHistory);
  assert.equal(await f.page.evaluate(before => window.__studioDoc === before, identity), true);
}

await f.run(async () => {
  const newContext = f.browser.newContext.bind(f.browser);
  const origin = new URL(f.server.resolvedUrls.local[0]).origin;
  f.browser.newContext = async options => {
    const context = await newContext({ ...options, serviceWorkers: 'block' });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin === origin) return route.continue();
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      return route.abort();
    });
    return context;
  };

  const source = await f.inspect('fixture', { fixture: true });
  await f.newPage();
  const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await chooser.setFiles({
    name: 'straight-length-placement.bcad', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(source)),
  });
  await f.same(source);
  const documentHistory = await history();
  f.report.observations.push({ label: 'after-file-open-history', documentHistory });
  const nativeBefore = await assertNative(source, 40, 'native-before');

  await edit(1);
  f.phase = 'Automatic label, standard click and initial history';
  const before = await checkAutomatic(40);
  const identity = await f.page.evaluateHandle(() => window.__studioDoc);
  const expectedHistory = await history();
  assert.deepEqual(expectedHistory, [false, false]);
  await chip().locator('..').click();
  assert.equal(await field().evaluate(input => input === document.activeElement), true);
  assert.equal(await inline().count(), 0);
  const original = await record('01-automatic', before);

  f.phase = 'Drag straight driving length label';
  await beginDrag(before, 48, 24);
  await f.page.mouse.up();
  await reset().waitFor();
  const moved = await placement();
  near(moved.offset - before.offset, 48, 0.8, 'Perpendicular pointer travel');
  near(dot(difference(moved.chip, before.chip), before.tangent), 0, 0.8, 'Tangential travel is ignored');
  assert.equal(moved.text, before.text);
  assert.deepEqual(moved.measure, before.measure);
  checkLines(moved);
  const after = await record('02-moved', moved);
  await assertSameAccepted(source, identity, expectedHistory, original, after);
  assert.deepEqual(await assertNative(after.doc, 40, 'native-after'), nativeBefore);

  f.phase = 'Cancel the label drag with Escape';
  await beginDrag(moved, 36);
  near((await placement()).offset - moved.offset, 36, 0.8, 'Escape drag preview');
  await f.page.keyboard.press('Escape');
  await f.page.mouse.up();
  near((await placement()).offset, moved.offset, 0.8, 'Escape restores the committed label position');
  await f.sketchPanel().waitFor();

  f.phase = 'Cancel the label drag with pointercancel';
  await f.page.evaluate(() => {
    document.addEventListener('pointerdown', event => {
      window.lengthLabelTestPointer = event.pointerId;
    }, { capture: true, once: true });
  });
  await beginDrag(moved, -28);
  near((await placement()).offset - moved.offset, -28, 0.8, 'Pointer-cancel drag preview');
  await chip().evaluate(element => {
    const pointerId = window.lengthLabelTestPointer;
    if (!Number.isInteger(pointerId)) throw new Error('Missing mouse pointer ID');
    delete window.lengthLabelTestPointer;
    const owner = [element, element.parentElement].find(target => target.hasPointerCapture(pointerId));
    if (!owner) throw new Error('The active label drag did not capture the mouse');
    owner.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId, pointerType: 'mouse', isPrimary: true }));
  });
  await f.page.mouse.up();
  const cancelled = await placement();
  near(cancelled.offset, moved.offset, 0.8, 'Pointer cancellation restores the committed label position');
  await assertSameAccepted(source, identity, expectedHistory, original, await record('03-cancelled', cancelled));

  f.phase = 'Pan and zoom on the canvas';
  const panStart = await f.page.locator('.vp-canvas').evaluate(canvas => {
    const { x, y, width, height } = canvas.getBoundingClientRect();
    return [[0.5, 0.65], [0.55, 0.62], [0.45, 0.65]].map(([u, v]) => [x + width * u, y + height * v])
      .find(point => document.elementFromPoint(...point) === canvas);
  });
  assert.ok(panStart, 'A visible canvas point for pan and zoom');
  await f.page.mouse.move(...panStart);
  await f.page.mouse.down({ button: 'middle' });
  await f.page.mouse.move(panStart[0] + 55, panStart[1] - 36, { steps: 10 });
  await f.page.mouse.up({ button: 'middle' });
  const panned = await placement();
  assert.ok(length(difference(panned.measure[0], moved.measure[0])) > 25, 'Pan moves the measured endpoints');
  near(panned.pxPerMm, moved.pxPerMm, 0.05, 'Pan preserves camera scale');
  near(panned.offset, moved.offset, 0.8, 'Pan preserves the label offset');
  checkLines(panned);
  await record('04-panned', panned);

  await f.page.mouse.move(...panStart);
  await f.page.mouse.wheel(0, 185);
  await f.page.waitForFunction(([left, right, previous]) => {
    const a = window.__studioScreenOf(left);
    const b = window.__studioScreenOf(right);
    return Math.abs(Math.hypot(b[0] - a[0], b[1] - a[1]) / 40 - previous) > 0.05;
  }, [[0, 0, 0], [40, 0, 0], panned.pxPerMm]);
  const zoomed = await placement();
  near(zoomed.offset, panned.offsetMM * zoomed.pxPerMm, 0.8, 'Zoom preserves the model-relative offset');
  assert.equal(zoomed.text, '40');
  checkLines(zoomed);
  await assertSameAccepted(source, identity, expectedHistory, original, await record('05-zoomed', zoomed));

  f.phase = 'Reset and finish without a geometry edit';
  await reset().click();
  const automatic = await checkAutomatic(40);
  await assertSameAccepted(source, identity, expectedHistory, original, await record('06-reset', automatic));
  await beginDrag(automatic, 48);
  await f.page.mouse.up();
  await reset().waitFor();
  const finished = await f.finishSketch('07-finished-only-layout');
  assert.deepEqual(finished.bodies.bodies, original.bodies.bodies);
  await assertSameAccepted(source, identity, documentHistory, original, finished);

  await edit(2);
  f.phase = 'Open a different sketch with the same length key';
  await record('08-other-sketch-same-key', await checkAutomatic(30));
  await f.page.keyboard.press('Escape');
  await f.sketchPanel().waitFor({ state: 'hidden' });
  await edit(1);
  f.phase = 'Reopen the original sketch';
  const reopened = await checkAutomatic(40);

  f.phase = 'Double-click value edit and sketch Undo/Redo';
  await beginDrag(reopened, 48);
  await f.page.mouse.up();
  await reset().waitFor();
  await chip().locator('..').dblclick();
  await inline().waitFor();
  assert.equal(await inline().inputValue(), '40');
  await inline().fill('44');
  await inline().press('Enter');
  await inline().waitFor({ state: 'hidden' });
  await f.page.waitForFunction(() => document.querySelector('.vp-overlay .dim[data-dim="len0"] .dim-text')?.textContent === '44');
  assert.deepEqual(await history(), [true, false]);
  assert.equal(await reset().count(), 1);
  await f.undo();
  assert.equal(await field().inputValue(), '40');
  assert.deepEqual(await history(), [false, true]);
  assert.equal(await reset().count(), 1);
  await f.redo();
  await f.page.waitForFunction(() => document.querySelector('.vp-overlay .dim[data-dim="len0"] .dim-text')?.textContent === '44');
  assert.equal(await field().inputValue(), '44');
  assert.deepEqual(await history(), [true, false]);
  assert.equal(await reset().count(), 1);
  await f.snapshot('09-sketch-redo-44');
  const edited = (await f.finishSketch('10-finished-length44')).doc;
  assert.deepEqual(edited.nodes.slice(1), source.nodes.slice(1));
  assert.deepEqual(edited.outputs, source.outputs);
  await assertNative(edited, 44, 'native-length44');

  f.phase = 'Document Undo and Redo the actual value edit';
  await f.undo();
  await f.same(source);
  assert.deepEqual(await history(), [documentHistory[0], true]);
  await f.redo();
  await f.same(edited);
  assert.deepEqual(await history(), [true, false]);
  const saved = await f.save('straight-length-placement');
  await f.freshOpen(saved.file, edited, '11-fresh-open');
  await assertNative(await f.doc(), 44, 'native-fresh-open');
  await edit(1);
  assert.equal(edited.nodes[0].outline.lengths[0], 44);
  const endpoints = edited.nodes[0].outline.points.slice(0, 2);
  await record('12-fresh-open-automatic', await checkAutomatic(44, endpoints));
});
