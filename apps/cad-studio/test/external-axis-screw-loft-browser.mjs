import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const singleSketch = process.argv.includes('--single-sketch');
const centred = process.argv.includes('--centred-line-arc');
const circularSegment = centred || process.argv.includes('--line-arc');
const triangular = (singleSketch && !circularSegment) || process.argv.includes('--triangle');
const polygon = ['pentagon', 'hexagon', 'trapezoid', 'skew-quadrilateral']
  .find(name => process.argv.includes('--' + name));
const command = singleSketch ? (centred ? 'Smooth Turn' : 'Smooth Screw') : 'Loft';
const profile = centred ? 'centred-line-arc' : circularSegment ? 'line-arc' : polygon ?? (triangular ? 'triangular' : 'rectangular');
const degrees = circularSegment || polygon || triangular ? 360 : 180;
const height = 40, spans = degrees / 30, samples = spans * 10;
const chordY = 3 * Math.sin(Math.PI / 3);
const arcSweep = 2 * Math.PI / 3;
const centroidOffset = 4 * 3 * Math.sin(arcSweep / 2) ** 3 / (3 * (arcSweep - Math.sin(arcSweep)));
const circleX = centred ? -centroidOffset : 12;
const arcSection = { corners: [[circleX + 1.5, chordY], [circleX + 1.5, -chordY], [circleX + 3, 0]],
  volume: 221.13498549200997 };
const profiles = {
  pentagon: { corners: [[-7, -4], [2, -3], [1, -1], [-4, 1], [-6, -1]], volume: 1080.138914574982 },
  hexagon: { corners: [[-7, -5], [1, -5], [3, -3], [2, -1], [-3, 1], [-7, -1]], volume: 1840.2366692758953 },
  trapezoid: { corners: [[-8, -5], [2, -5], [0, -1], [-7, -1]], volume: 1360.1749294647923 },
  'skew-quadrilateral': { corners: [[-7, -4], [2, -3], [0, -1], [-5, 1]], volume: 980.1260521143356 },
  triangular: { corners: [[-7, -4], [2, -3], [-4, 1]], volume: 840.1080446694306 },
  rectangular: { corners: [[14, -4], [26, -4], [26, 4], [14, 4]], volume: 840.4060323005599 * 96 / 21 },
};
const { corners, volume } = circularSegment ? arcSection : profiles[profile];
const frame = { origin: profile === 'rectangular' ? [11, -17, 23] : [21, -19.4, 24.8], normal: [0, .6, .8], xAxis: [1, 0, 0] };
const [x, y, z] = frame.origin;
const ontoPlane = (u, v, h) => [x + u, y + .8 * v + .6 * h, z - .6 * v + .8 * h];

const frozen = [
  'apps/cad-studio/test/external-axis-screw-loft-browser.mjs',
  'packages/barocss-cad/package.json',
  'packages/barocss-cad-model/src/app/profileCommands.ts',
  'packages/barocss-cad-model/src/app/profiles.ts',
  'packages/barocss-cad-model/src/app/ruledTurnCommand.ts',
  'packages/barocss-cad-model/src/app/smoothLoftTurn.ts',
  'packages/barocss-cad/src/internal/convex-polygon-screw-axis.ts',
  'packages/barocss-cad/src/internal/triangular-screw-axis.ts',
  'packages/barocss-cad/src/part/part-profile-solid.ts',
  'packages/barocss-cad/src/features/loft.ts',
  'packages/barocss-cad/src/features/loft-rectangular-turn.ts',
  ...(centred ? ['packages/barocss-cad-model/src/app/lineArcScrew.ts'] : []),
  ...(circularSegment && singleSketch ? [
    'packages/barocss-cad-model/src/app/lineArcScrew.ts',
    'packages/barocss-cad-model/src/app/editFields.ts',
    'packages/barocss-cad-model/src/chat/part/features.ts',
    'apps/cad-studio/src/app/featureNumberInput.ts',
    'apps/cad-studio/src/state/historyFeatureApply.ts',
    'apps/cad-studio/src/ui/NodeEditor.tsx',
  ] : []),
];
const f = await createFlow({
  name: 'external-axis-screw-loft',
  output: process.argv[2],
  envFrozen: 'SCREW_LOFT_FROZEN',
  qualification: centred ? 'Create both windings of a compact centred circular-segment Twist with Studio ' + command + '.'
    : 'Create both windings of a compact external-axis ' + profile + ' Screw with Studio ' + command + '.',
  limits: ['Desktop Chrome. Synthetic source sketches in one tilted frame.'],
  initialFiles: frozen,
  requiredFrozen: frozen,
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep, evaluateCurveD1, evaluateSurfaceD2 } from '@barocss/cad';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
import { digestOf } from '@barocss/cad-model/util/digest';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
console.log(JSON.stringify(partBreps(doc).map(({ key, brep }) => ({
  key, digest: digestOf(brep), counts: checkBrep(brep, { strict: true }).counts, coedges: brep.coedges.length,
  closed: brep.shells.length === 1 && brep.shells[0].closed,
  valid: checkBrep(brep, { strict: true }).valid, volume: brepMassProperties(brep, 1).volume,
  arcs: ${circularSegment} ? brep.faces.filter(face => face.surface.degreeU === 2 && face.surface.degreeV === 3)
    .map(({ surface }) => Array.from({ length: ${spans} + 1 }, (_, i) =>
      [0, .25, .5, .75, 1].map(u => {
        const { point, du, dv } = evaluateSurfaceD2(surface, u, i / ${spans});
        return { point, du, dv };
      }))) : [],
  rails: brep.edges.filter(edge => /^c[0-9]+$/.test(edge.id)).map(({ curve }) => ({
    degree: curve.degree, poles: curve.controlPoints.length, knots: curve.knots,
    steps: Array.from({ length: ${samples + 1} }, (_, i) => evaluateCurveD1(curve, i / ${samples})),
  })),
}))));
`,
});

const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const spin = ([x, y], angle, t) => {
  const a = angle * Math.PI / 180 * t, c = Math.cos(a), s = Math.sin(a);
  return [c * x - s * y, s * x + c * y];
};
const lineArcSegments = rotate => [
  { kind: 'line', start: rotate(corners[0]) },
  { kind: 'arc', start: rotate(corners[1]), center: rotate([circleX, 0]), direction: 'ccw' },
];
function source(angle) {
  if (singleSketch) return {
    format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, outputs: {}, nextId: 1,
    nodes: [circularSegment ? {
      id: 'n0', kind: 'sketch', profile: 'loop', segments: lineArcSegments(point => point), plane: frame,
    } : {
      id: 'n0', kind: 'sketch', profile: 'polygon', points: corners.map(([u, v]) => [u + 10, v - 3]),
      plane: { ...frame, origin: [11, -17, 23] },
    }],
  };
  return {
    format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, outputs: {}, nextId: spans + 1,
    nodes: Array.from({ length: spans + 1 }, (_, i) => {
      const t = i / spans;
      if (circularSegment) {
        const a = angle * t * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
        const rotate = ([u, v]) => [c * u - s * v, s * u + c * v];
        return {
          id: 'n' + i, kind: 'sketch', profile: 'loop',
          segments: lineArcSegments(rotate),
          plane: { ...frame, origin: [x, y + 24 * t, z + 32 * t] },
        };
      }
      return {
        id: 'n' + i, kind: 'sketch', profile: 'polygon', points: corners.map(p => spin(p, angle, t)),
        plane: { ...frame, origin: ontoPlane(0, 0, height * t) },
      };
    }),
  };
}

async function build(angle) {
  f.phase = (centred ? 'create centred Twist at ' : 'create external-axis Screw at ') + angle;
  await f.newPage();
  const doc = source(angle);
  const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await chooser.setFiles({
    name: centred ? 'centred-twist-sections.bcad' : 'screw-sections.bcad',
    mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)),
  });
  await f.same(doc);
  for (let i = 0; i < doc.nodes.length; i++) await button('Sketch ' + (i + 1)).click(i ? { modifiers: ['Shift'] } : {});
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.command(command);
  const hud = f.page.getByRole('dialog', { name: command, exact: true });
  const status = value => hud.locator('.status').filter({ hasText: value });
  if (singleSketch && centred) {
    const field = name => hud.getByLabel(name, { exact: true });
    await field('Height').fill(String(height));
    if (angle > 0) {
      await field('Turn angle').fill('0');
      await status(/^refused$/).waitFor();
      assert.ok(await button('Apply', hud).isDisabled());
      await f.same(doc);
      await f.snapshot('centred-single-sketch-zero-refused');
    }
    await field('Turn angle').fill(String(angle));
  } else if (singleSketch) {
    const field = name => hud.getByLabel(name, { exact: true });
    if (angle > 0) {
      await field('Axis X').fill(circularSegment ? '14' : '7');
      await field('Axis Y').fill(circularSegment ? '0' : '-5');
      await status(/^refused$/).waitFor();
      const reason = circularSegment ? /Screw axis.*outside.*disc/i
        : polygon ? /place the Screw axis outside it with clearance\./ : /Place the Screw axis outside the triangle with clearance\./;
      await hud.locator('.hud-error').filter({ hasText: reason }).waitFor();
      assert.ok(await button('Apply', hud).isDisabled());
      await f.same(doc);
      await f.snapshot('single-sketch-interior-axis-refused');
    }
    await field('Axis X').fill(circularSegment ? '0' : '10');
    await field('Axis Y').fill(circularSegment ? '0' : '-3');
    await field('Pitch per revolution').fill(String(height));
    await field('Turn angle').fill(String(angle));
  } else await hud.getByLabel('Smooth (through the middle sections)', { exact: true }).selectOption('yes');
  await status(/^preview$/).waitFor();
  await f.same(doc);
  if (singleSketch) await f.snapshot('single-sketch-preview-' + angle);
  if (circularSegment) await frameView('line-arc-preview-' + angle);
  await button('Apply', hud).click();
  await f.changed(doc);
  const accepted = await f.doc();
  assert.deepEqual(accepted.nodes.slice(0, doc.nodes.length), doc.nodes);
  const loft = accepted.nodes.at(-1);
  assert.deepEqual([loft.kind, loft.smooth, loft.sections.length], ['loft', true, spans + 1]);
  if (singleSketch) assert.deepEqual(loft.from, [0]);
  return accepted;
}

async function inspect(doc, angle, label, advance = height) {
  const [part, ...others] = await f.inspect(label, doc);
  const { bodies } = await f.bodies();
  assert.equal(others.length, 0);
  assert.deepEqual([part.valid, part.closed, part.counts.bodies, part.counts.faces, part.counts.edges, part.counts.vertices],
    [true, true, 1, corners.length + 2, 3 * corners.length, 2 * corners.length]);
  assert.equal(part.coedges, 6 * corners.length);
  assert.deepEqual(bodies.map(body => body.key), [part.key]);
  assert.ok(Math.abs(part.volume - volume * advance / height) < 1e-7);
  assert.ok(Math.abs(bodies[0].volume - part.volume) < 1e-7);
  assert.equal(part.rails.length, corners.length);
  let maxStationError = 0, minimumWinding = Infinity;
  const seen = new Set();
  for (const rail of part.rails) {
    assert.deepEqual([rail.degree, rail.poles, rail.knots], [3, spans + 1, part.rails[0].knots]);
    assert.equal(new Set(rail.knots.slice(4, -4)).size, spans - 3);
    const start = rail.steps[0].point;
    const corner = corners.findIndex(([u, v]) => Math.hypot(start[0] - x - u, .8 * (start[1] - y) - .6 * (start[2] - z) - v) < 1e-8);
    assert.ok(corner >= 0 && !seen.has(corner));
    seen.add(corner);
    for (const [i, { point: p, derivative: d }] of rail.steps.entries()) {
      const t = i / samples;
      assert.ok(Math.abs(.6 * d[1] + .8 * d[2] - advance) < 1e-8);
      const v = .8 * (p[1] - y) - .6 * (p[2] - z), dv = .8 * d[1] - .6 * d[2];
      const winding = Math.sign(angle) * ((p[0] - x) * dv - v * d[0]);
      minimumWinding = Math.min(minimumWinding, winding);
      assert.ok(winding > 0);
      if (i % 10 === 0) {
        const expected = ontoPlane(...spin(corners[corner], angle, t), advance * t);
        const error = Math.hypot(...p.map((value, k) => value - expected[k]));
        maxStationError = Math.max(maxStationError, error);
        assert.ok(error < 1e-8);
      }
    }
  }
  let arcError;
  if (circularSegment) {
    assert.equal(part.arcs.length, 2);
    let circleError = 0, seamError = 0, tangentError = 0, centroidError = 0;
    const unit = v => v.map(c => c / Math.hypot(...v));
    const distance = (a, b) => Math.hypot(...a.map((c, axis) => c - b[axis]));
    const [first, second] = part.arcs;
    for (let i = 0; i <= spans; i++) {
      const t = i / spans;
      const centre = ontoPlane(...spin([circleX, 0], angle, t), advance * t);
      for (const { point } of [...first[i], ...second[i]]) {
        const axialError = Math.abs(.6 * (point[1] - centre[1]) + .8 * (point[2] - centre[2]));
        circleError = Math.max(circleError, axialError, Math.abs(distance(point, centre) - 3));
      }
      const left = first[i].at(-1), right = second[i][0];
      seamError = Math.max(seamError, distance(left.point, right.point));
      tangentError = Math.max(tangentError, distance(unit(left.du), unit(right.du)), distance(unit(left.dv), unit(right.dv)));
      if (centred) {
        const a = first[i][0].point, b = second[i].at(-1).point;
        const capCentre = left.point.map((mid, j) => a[j] + b[j] - mid);
        const centroid = capCentre.map((c, j) => c + (left.point[j] - c) * centroidOffset / 3);
        centroidError = Math.max(centroidError, distance(centroid, ontoPlane(0, 0, advance * t)));
      }
    }
    assert.ok(Math.max(circleError, seamError, tangentError, centroidError) < 1e-8);
    arcError = { circleError, seamError, tangentError, ...(centred ? { centroidError } : {}) };
  }
  f.report.observations.push({
    label, angle, advance, digest: part.digest, counts: part.counts, coedges: part.coedges, volume: part.volume,
    rails: part.rails.length, maxStationError, minimumWinding, arcError,
  });
  return part;
}

async function frameView(label) {
  await button('Iso').click();
  const ao = button('AO');
  if (await ao.getAttribute('aria-pressed') === 'true') await ao.click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await f.page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
  await f.snapshot(label);
}

await f.run(async () => {
  const origin = new URL(f.server.resolvedUrls.local[0]).origin;
  const newContext = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async options => {
    const context = await newContext({ ...options, serviceWorkers: 'block' });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      return url.origin === origin ? route.continue() : route.abort();
    });
    return context;
  };
  const positive = await build(degrees);
  const right = await inspect(positive, degrees, 'external-axis-positive-native');
  await frameView('external-axis-positive-' + degrees);
  if (circularSegment) {
    const saved = await f.save(centred ? 'centred-line-arc-positive-twist' : 'external-axis-line-arc-positive');
    await f.freshOpen(saved.file, positive, 'external-axis-line-arc-positive-open');
    assert.deepEqual(await inspect(positive, degrees, 'line-arc-positive-reopened-native'), right);
    await frameView('line-arc-positive-reopened');
  }

  const negative = await build(-degrees);
  const left = await inspect(negative, -degrees, 'external-axis-negative-native');
  assert.notEqual(left.digest, right.digest);
  await frameView('external-axis-negative-' + degrees);
  const saved = await f.save(centred ? 'centred-line-arc-negative-twist' : 'external-axis-' + profile + '-screw');
  await f.freshOpen(saved.file, negative, 'external-axis-fresh-open');
  assert.deepEqual(await inspect(negative, -degrees, 'external-axis-reopened-native'), left);
  await frameView('external-axis-reopened-' + degrees);
  if (singleSketch) {
    const index = negative.nodes.length - 1;
    const advanceLabel = centred ? 'Total height' : 'Pitch per revolution';
    const editLabel = centred ? 'single-sketch-height-48' : 'single-sketch-pitch-48';
    await f.openFeatureEditor(index, 'reopened single-sketch ' + command);
    const field = name => f.editor().getByLabel(name, { exact: true });
    assert.equal(Number(await field('Turn angle').inputValue()), -degrees);
    assert.equal(Number(await field(advanceLabel).inputValue()), height);
    if (centred) {
      assert.equal(await field('Pitch per revolution').count(), 0);
      await field('Turn angle').fill('0');
      assert.ok(await button('Apply', f.editor()).isDisabled());
      await f.same(negative);
      await f.snapshot('centred-history-zero-refused');
    }
    assert.equal(await field('Turn width').count(), 0);
    await field('Turn angle').fill(String(degrees));
    const reversed = (await f.applyEditor(negative, 'single-sketch-reversed')).doc;
    assert.deepEqual(reversed, positive);
    assert.equal((await inspect(reversed, degrees, 'single-sketch-reversed-native')).digest, right.digest);

    await f.openFeatureEditor(index, command + ' ' + advanceLabel);
    await field(advanceLabel).fill('48');
    const longer = (await f.applyEditor(reversed, editLabel)).doc;
    assert.deepEqual(longer.nodes.slice(0, -1), reversed.nodes.slice(0, -1));
    const edited = await inspect(longer, degrees, editLabel + '-native', 48);
    await frameView(editLabel + '-model');
    if (polygon || circularSegment) {
      const saved = await f.save(editLabel);
      await f.freshOpen(saved.file, longer, editLabel + '-fresh-open');
      assert.deepEqual(await inspect(longer, degrees, editLabel + '-reopened-native', 48), edited);
      await frameView(editLabel + '-reopened');
      if (circularSegment) {
        await f.openFeatureEditor(index, 'reopened circular segment ' + command + ' at 48 mm');
        assert.equal(Number(await field('Turn angle').inputValue()), degrees);
        assert.equal(Number(await field(advanceLabel).inputValue()), 48);
        await f.snapshot('line-arc-history-reopened');
      }
    }
  }
});
