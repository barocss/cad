import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const pins = [
  'apps/cad-studio/test/loft-full-turn-sections-browser.mjs',
  'apps/cad-studio/src/App.tsx',
  'apps/cad-studio/src/ui/HistoryFeatureEditor.tsx',
  'apps/cad-studio/src/ui/NodeEditor.tsx',
  'packages/barocss-cad-model/src/app/editFields.ts',
  'packages/barocss-cad-model/src/app/loftGuides.ts',
  'packages/barocss-cad-model/src/app/profiles.ts',
  'packages/barocss-cad-model/src/app/profileCommands.ts',
  'packages/barocss-cad/src/features/loft.ts',
];
const f = await createFlow({
  name: 'loft-full-turn-sections',
  output: process.argv[2],
  envFrozen: 'LOFT_FULL_TURN_SOURCE_FROZEN',
  initialFiles: pins,
  requiredFrozen: pins,
  qualification: 'Use authored section stations and one explicit guide to preserve a complete ruled rotation, then change the rail in History.',
  limits: ['Five parallel rectangular sections with 90° changes and a piecewise linear NURBS guide. The spans are ruled between stations.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
import { brepMassProperties, checkBrep, curveDomain, evaluateCurve } from '@barocss/cad';
import { digestOf } from '@barocss/cad-model/util/digest';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const [{ brep, key }] = partBreps(doc);
const edges = brep.edges.map(edge => {
  const [start, end] = curveDomain(edge.curve);
  return [start, (start + end) / 2, end].map(t => evaluateCurve(edge.curve, t));
});
console.log(JSON.stringify({
  key, kind: brep.bodies[0].kind, closed: brep.shells.length === 1 && brep.shells[0].closed,
  strict: checkBrep(brep, { strict: true }), volume: brepMassProperties(brep, 1).volume,
  digest: digestOf(brep), vertices: brep.vertices.map(vertex => vertex.point), edges,
}));
`,
});

const levels = [0, 8, 18, 31, 40];
const origin = [13, -8];
const corners = [[-6, -4], [6, -4], [6, 4], [-6, 4]];
const axes = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 0]];
const knots = [0, 0, 1, 2, 3, 4, 4];

function station([x, y], index, sign) {
  const [cosine, sine] = axes[index];
  return [origin[0] + cosine * x - sign * sine * y, origin[1] + sign * sine * x + cosine * y, levels[index]];
}

function directRail(id, name, sign) {
  const points = levels.map((_, index) => station(corners[0], index, sign));
  return {
    source: `@model ${id} { version: 0; length-unit: mm; @curve #rail { type: nurbs; degree: 1;
      knots: ${JSON.stringify(knots)}; control-points: ${JSON.stringify(points)}; weights: [1,1,1,1,1]; } }`,
    object: { id, name, source: id, geometry: 'rail' },
  };
}

const positiveGuide = directRail('right_turn', 'Positive turn rail', 1);
const negativeGuide = directRail('left_turn', 'Negative turn rail', -1);
const source = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, outputs: {}, nextId: 5,
  nodes: levels.map((z, index) => ({
    id: `n${index}`, kind: 'sketch', profile: 'rectangle', min: corners[0], max: corners[2],
    plane: { origin: [...origin, z], normal: [0, 0, 1], xAxis: [...axes[index], 0] },
  })),
  direct: {
    sources: { right_turn: positiveGuide.source, left_turn: negativeGuide.source },
    objects: [positiveGuide.object, negativeGuide.object],
  },
};

const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const near = (a, b) => Math.hypot(...a.map((value, index) => value - b[index])) < 1e-8;

async function loft(guide) {
  const order = [4, 0, 3, 1, 2];
  for (const [index, section] of order.entries()) {
    await button(`Sketch ${section + 1}`).click({ modifiers: index ? ['Shift'] : [] });
  }
  assert.deepEqual(await f.page.evaluate(() => window.__studioSelection.selection.sketches), order);
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.command('Loft');
  const hud = f.page.getByRole('dialog', { name: 'Loft', exact: true });
  if (guide) await hud.getByLabel('Guide (copied)', { exact: true }).selectOption({ label: guide });
  await hud.locator('.status').filter({ hasText: /^preview$/ }).waitFor();
  await f.same(source);
  await button('Apply', hud).click();
  await f.changed(source);
  return f.doc();
}

async function verify(doc, label, sign) {
  const { nodes } = doc;
  const feature = nodes.at(-1);
  assert.equal(feature.kind, 'loft');
  assert.deepEqual(feature.from, [0, 1, 2, 3, 4]);
  assert.deepEqual(feature.sections.map(section => section.z), levels);
  assert.deepEqual(nodes.slice(0, source.nodes.length), source.nodes);
  const native = await f.inspect(label, doc);
  const [body] = (await f.bodies()).bodies;
  assert.ok(native.strict.valid, JSON.stringify(native.strict.issues));
  assert.deepEqual([native.strict.counts.bodies, native.kind, native.closed], [1, 'solid', true]);
  assert.equal(native.key, body.key);
  assert.ok(Math.abs(native.volume - body.volume) < 1e-7);
  if (!sign) {
    // Without a corner guide, the axis-aligned rectangles exchange width and depth each span.
    const expected = 40 * (96 + 16 / 6);
    assert.equal(feature.guide, undefined);
    assert.ok(Math.abs(native.volume - expected) < 1e-7, JSON.stringify({ native: native.volume, expected }));
    return native;
  }
  assert.deepEqual(feature.guide, {
    kind: 'nurbs', degree: 1, knots, controlPoints: levels.map((_, index) => station(corners[0], index, sign)),
  });
  assert.equal(native.vertices.length, 20);
  assert.equal(native.strict.counts.faces, 18);
  // A quarter-turn ruled span scales area by (1 - t)² + t². Its mean is 2/3.
  const expected = 40 * 96 * (2 / 3);
  assert.ok(Math.abs(native.volume - expected) < 1e-7, JSON.stringify({ native: native.volume, expected }));
  for (const corner of corners) {
    const points = levels.map((_, index) => station(corner, index, sign));
    for (const point of points) assert.ok(native.vertices.some(vertex => near(vertex, point)), JSON.stringify(point));
    for (const [index, a] of points.slice(0, -1).entries()) {
      const b = points[index + 1];
      const midpoint = a.map((value, axis) => (value + b[axis]) / 2);
      assert.ok(native.edges.some(([first, middle, last]) =>
        near(middle, midpoint) && ((near(first, a) && near(last, b)) || (near(first, b) && near(last, a)))
      ), JSON.stringify({ a, midpoint, b }));
    }
  }
  return native;
}

async function frame() {
  await button('Iso').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
}

await f.run(async () => {
  const origin = new URL(f.server.resolvedUrls.local[0]).origin;
  const openContext = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async options => {
    const context = await openContext({ ...options, serviceWorkers: 'block' });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      return url.origin === origin ? route.continue() : route.abort();
    });
    return context;
  };
  await f.newPage();
  const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await chooser.setFiles({ name: 'authored-turn-sections.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(source)) });
  await f.same(source);

  f.phase = 'create the ordinary ruled Loft from the same station shapes';
  const ordinary = await loft();
  const baseline = await verify(ordinary, 'unguided-native', 0);
  await frame();
  await f.snapshot('unguided-control');
  await f.undo();
  await f.same(source);

  f.phase = 'create a full guided turn from the five rotated sections';
  const positive = await loft(positiveGuide.object.name);
  const first = await verify(positive, 'positive-turn-native', 1);
  await frame();
  await f.snapshot('positive-full-turn');

  f.phase = 'replace the guide in History and verify the opposite native turn';
  await f.openFeatureEditor(positive.nodes.length - 1, 'full-turn Loft');
  await f.editor().getByLabel('Guide (copied)', { exact: true }).selectOption({ label: negativeGuide.object.name });
  const negative = (await f.applyEditor(positive, 'negative-full-turn')).doc;
  const second = await verify(negative, 'negative-turn-native', -1);
  assert.notEqual(first.digest, second.digest);
  assert.deepEqual(negative.nodes.at(-1).sections, positive.nodes.at(-1).sections);
  await f.undo();
  await f.same(positive);
  await f.redo();
  await f.same(negative);
  const saved = await f.save('guided-ruled-full-turn');
  await f.freshOpen(saved.file, negative, 'full-turn-reopened');
  assert.equal((await verify(negative, 'full-turn-reopened-native', -1)).digest, second.digest);
  await frame();
  await f.snapshot('full-turn-reopened-framed');
  f.report.observations.push({
    levels, ordinaryVolume: baseline.volume, positiveVolume: first.volume, negativeVolume: second.volume,
    positiveDigest: first.digest, negativeDigest: second.digest,
  });
});
