import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const baseline = process.argv[3] === '--baseline';
const pins = [
  'apps/cad-studio/test/hidden-trim-boundary-browser.mjs',
  'apps/cad-studio/src/app/sketchControls.ts',
  'apps/cad-studio/src/sketch/dragTrimPlan.ts',
  'apps/cad-studio/src/sketch/useSketchActions.ts',
  'apps/cad-studio/src/viewport/viewportPointerInput.ts',
  'packages/barocss-cad-model/src/sketch/entityIds.ts',
  'packages/barocss-cad-model/src/sketch/trim.ts',
];
const f = await createFlow({
  name: 'hidden-trim-boundary', output: process.argv[2], envFrozen: 'HIDDEN_TRIM_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Hidden construction remains a boundary for actual click/drag Trim; a conditional explanation and Show construction recovery preserve accepted state.',
  limits: ['One XY rectangle with two straight construction bounds, an ordinary Line target and an existing 2 mm Extrude.'],
  snapshotExtra: () => ({
    dirty: !!document.querySelector('[aria-label="Unsaved changes"]'),
    historyDisabled: ['Undo', 'Redo'].map(name => document.querySelector(`button[aria-label="${name}"]`).disabled),
    removed: [...document.querySelectorAll('.sk-drag-trim-interval')].map(line => line.getAttribute('points')),
  }),
});
const guide = (y, ids) => ({ kind: 'polygon', points: [[5, y], [25, y]], closed: false, bulges: [0, 0], ids, construction: true });
const outer = [[0, 0], [40, 0], [40, 40], [0, 40]];
const inner = [[10, 5], [10, 15], [15, 15], [15, 25], [10, 25], [10, 35], [30, 35], [30, 5]];
const source = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 2,
  nodes: [
    { kind: 'sketch', profile: 'rectangle', min: outer[0], max: outer[2], id: 'n0', sideTags: { outer: ['e1', 'e2', 'e3', 'e4'] },
      construction: [guide(15, ['e5', 'e6']), guide(25, ['e7', 'e8'])] },
    { kind: 'extrude', sketch: 0, height: 2, id: 'n1' },
  ],
  outputs: { b1: { node: 1, side: 'solid' } },
};
const button = (scope, name) => scope.getByRole('button', { name, exact: true });
const brush = () => f.page.locator('.vp-overlay .sk-drag-trim');
const cuts = () => brush().locator('.sk-drag-trim-interval');
const hoverCut = () => f.page.locator('.vp-overlay polyline.sk-trim:not(.sk-drag-trim-interval)');
const midpoint = [10, 20];

async function open(doc, bytes, name) {
  const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), button(f.page, 'Open').click()]);
  await chooser.setFiles({ name, mimeType: 'application/json', buffer: bytes });
  await f.same(doc);
}

async function enterSketch() {
  await f.openFeatureEditor(1);
  await button(f.editor(), 'Edit sketch').click();
  await f.sketchPanel().waitFor();
  await f.frame([[0, 0], [40, 40], [5, 20], [30, 5], [10, 35]]);
}

async function pixel(point) {
  const p = await f.screenOf(point);
  assert.ok(await f.page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('canvas.vp-canvas'), p), point);
  return p;
}

async function line(points) {
  await f.tool('Line', 'l');
  for (const point of points) await f.page.mouse.click(...await pixel(point));
}

async function hover(point) {
  await f.page.mouse.move(...await pixel(point));
  await f.page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
}

async function hold() {
  await f.page.mouse.move(...await pixel([6, 20]));
  await f.page.mouse.down();
  await f.page.mouse.move(...await pixel([14, 20]));
  await brush().waitFor({ state: 'attached' });
}

function unchanged(after, before) {
  for (const key of ['doc', 'bodies', 'selection', 'history', 'dirty']) assert.deepEqual(after[key], before[key], key);
}


await f.run(async () => {
  const origin = new URL(f.server.resolvedUrls.local[0]).origin;
  const createContext = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async options => {
    const context = await createContext({ ...options, acceptDownloads: false, serviceWorkers: 'block' });
    context.setDefaultTimeout(10000);
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      return ['http:', 'https:'].includes(url.protocol) && url.origin !== origin ? route.abort() : route.continue();
    });
    return context;
  };
  await f.newPage();
  await open(source, Buffer.from(JSON.stringify(source)), 'hidden-trim.bcad');
  await enterSketch();
  await line([inner[0], inner[5]]);
  await f.tool('Trim', 't');
  await button(f.page, 'Hide construction').click();
  await button(f.page, 'Show construction').waitFor();
  const notice = f.page.getByLabel('Hidden construction trimming boundaries', { exact: true });
  if (baseline) assert.equal(await notice.count(), 0);
  else await notice.waitFor();
  await hover(midpoint);
  await hoverCut().waitFor();
  const before = await f.snapshot('01-hidden-boundaries');
  await hold();
  assert.equal(await cuts().count(), 1);
  const actual = await cuts().evaluate(line => {
    const r = line.closest('svg').getBoundingClientRect();
    return Array.from(line.points, q => [q.x + r.left, q.y + r.top]);
  });
  const expected = await Promise.all([inner[1], inner[4]].map(p => f.screenOf(p)));
  assert.ok(expected.every(q => actual.some(p => Math.hypot(p[0]-q[0],p[1]-q[1]) < .02)));
  await f.page.mouse.up();
  await brush().waitFor({state:'detached'});
  await hover(midpoint);
  await hoverCut().waitFor({state:'detached'});
  unchanged(await f.snapshot('02-hidden-boundary-cut'), before);
  await button(f.page,'Undo').click();
  await hover(midpoint); await hoverCut().waitFor();
  await f.page.mouse.click(...await pixel(midpoint));
  await hoverCut().waitFor({state:'detached'});
  await button(f.page,'Undo').click();
  await hover(midpoint); await hoverCut().waitFor();
  await button(f.page,'Show construction').click();
  await notice.waitFor({state:'hidden'});
  await button(f.page,'Hide construction').waitFor();
  await f.snapshot('03-shown-boundaries');
  await f.tool('Select','v');
  await notice.waitFor({state:'hidden'});
  await f.same(source);
  f.report.observations.push({baseline, expectedCut:[[10,15],[10,25]], clickAndDrag:true, acceptedDocUnchanged:true});
});
