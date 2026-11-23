import assert from 'node:assert/strict';
import { copyFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { currentPartRevision, withMcpSession } from './mcp-browser-session.mjs';

const annular = process.argv.includes('--annular');
const rectangular = process.argv.includes('--rectangular');
const baseline = process.argv.includes('--expect-refused');
assert.ok(!annular || !rectangular);
assert.ok(!baseline || annular || rectangular);
const railRadius = 20;
const knots = [0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4];
const ellipse = [[20, 0], [20, 12], [0, 12], [-20, 12], [-20, 0], [-20, -12], [0, -12], [20, -12], [20, 0]]
  .map(([x, y]) => [x, y, 0]);
const weights = Array.from({ length: 9 }, (_, i) => i % 2 === 0 ? 1 : Math.SQRT1_2);
const profile = rectangular ? { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [5, -8], max: [9, -2],
  sideTags: { outer: ['top', 'outer', 'bottom', 'inner'] } }
  : { id: 'n0', kind: 'sketch', profile: 'circle', center: annular ? [0, 0] : [5, -8], radius: 2,
    ...(annular ? { holes: [[{ kind: 'arc', start: [{ parameter: 'BoreRadius' }, 0], center: [0, 0], direction: 'cw' }]],
      sideTags: { outer: ['outer'], holes: [['bore']] } } : {}) };
const seed = { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: annular ? { BoreRadius: 1 } : {}, nextId: 1,
  nodes: [profile], outputs: {},
  direct: { sources: { control: `@model control { version:0; length-unit:mm;
    @curve #ellipse { type:nurbs; degree:2; knots:${JSON.stringify(knots)};
      control-points:${JSON.stringify(ellipse)}; weights:${JSON.stringify(weights)}; } }` },
  objects: [{ id: 'ellipse', name: 'Ellipse control', source: 'control', geometry: 'ellipse' }] } };
const pins = [
  'packages/barocss-cad/src/brep/exact-sweep.ts', 'packages/barocss-cad/src/features/revolve.ts',
  'packages/barocss-cad/src/brep/edge-continuity.ts', 'packages/barocss-cad-model/src/app/profileCommands.ts',
  'packages/barocss-cad-model/src/engine/curveSource.ts', 'packages/barocss-cad-model/src/chat/part/features.ts',
  'packages/barocss-cad-model/src/engine/errors.ts', 'apps/cad-studio/src/sketch/useSketchActions.ts',
];

const f = await createFlow({
  name: 'exact-closed-circle-sweep', output: process.argv[2],
  envFrozen: rectangular ? 'D1761_SOURCE_FROZEN' : annular ? 'D1753_SOURCE_FROZEN' : 'D1673_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Draw the circular path in Studio, create the closed exact Sweep, inspect its seams and reopen its editable History.',
  limits: ['One four-quarter R20 mm path, one circular or aligned rectangular section, desktop WebGPU, and local L1 MCP.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import {
  brepMassProperties, checkBrep, curveDomain, evaluateCurve, evaluateSurface, faceGeometry, massPropertiesOf,
  measureBrepEdgeContinuity, surfaceDomain,
} from '@barocss/cad';
import { partSnapshot } from '@barocss/cad-model/engine/part';
import { digestOf } from '@barocss/cad-model/util/digest';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const { outputs: [output] } = partSnapshot(doc), { brep } = output;
const intervals = [0, .17, .5, .83, 1], at = ([lo, hi], t) => lo + (hi - lo) * t;
const samples = brep.faces.map(face => {
  const { u, v } = surfaceDomain(face.surface);
  const shell = brep.shells.findIndex(item => item.faces.includes(face.id));
  const points = intervals.flatMap(s => intervals.map(t => evaluateSurface(face.surface, at(u, s), at(v, t))));
  const kind = faceGeometry(face).kind;
  const trims = ${rectangular} && kind === 'plane' ? brep.coedges.filter(use => face.loops.includes(use.loop)).map(use => {
    const { curve } = brep.edges.find(edge => edge.id === use.edge);
    return { degree: curve.degree, points: intervals.map(t => evaluateCurve(curve, at(curveDomain(curve), t))) };
  }) : undefined;
  return { shell, name: face.name, points, kind, trims };
});
console.log(JSON.stringify({ check: checkBrep(brep, { strict: true }), source: brep.source, bodyCount: output.bodyCount,
  mass: massPropertiesOf(output), quadrature: brepMassProperties(brep, 1).volume, samples,
  planes: brep.faces.filter(face => faceGeometry(face).kind === 'plane').length,
  pcurves: brep.coedges.filter(use => use.pcurve).length,
  seams: brep.edges.map(edge => measureBrepEdgeContinuity(brep, edge.id, { curvature: true })),
  digest: digestOf(brep) }));
`,
});

const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const browser = () => f.page.getByRole('complementary', { name: 'Browser', exact: true });
const hud = () => f.page.getByRole('dialog', { name: 'Sweep', exact: true });
const status = value => hud().locator('.status').filter({ hasText: new RegExp(`^${value}$`) });
const card = id => f.page.getByRole('listitem', { name: `Proposal ${id}`, exact: true });
const widthInput = () => f.sketchPanel().getByLabel('Edge 1 length', { exact: true });
const near = (value, expected, tolerance = 1e-7) =>
  assert.ok(Math.abs(value - expected) <= tolerance, JSON.stringify({ value, expected, tolerance }));
const expectedVolume = (radius, bore = 0) => rectangular
  ? 2 * Math.PI * railRadius * (2 * radius) * 6
  : 2 * Math.PI ** 2 * railRadius * (radius ** 2 - bore ** 2);
const tagOf = name => /\[([^\]]+)\]/.exec(name)?.[1];
const jointAngle = seam => rectangular && tagOf(seam.faces[0].name) !== tagOf(seam.faces[1].name) ? 90 : 0;

async function verifyRectangle(label, read, halfWidth) {
  assert.deepEqual(read.check.counts, { bodies: 1, shells: 1, faces: 8, loops: 8, coedges: 32, edges: 16, vertices: 8 });
  assert.equal(read.check.topology[0].genus, 1);
  assert.equal(read.planes, 4);
  assert.equal(read.pcurves, 32);
  let surfaceResidual = 0;
  for (const tag of profile.sideTags.outer) {
    const faces = read.samples.filter(face => tagOf(face.name) === tag);
    assert.equal(faces.length, 2);
    const plane = tag === 'top' || tag === 'bottom';
    for (const { kind, points, trims } of faces) {
      assert.equal(kind, plane ? 'plane' : 'cylinder');
      for (const [x, y, z] of points) {
        const residual = plane ? z - (tag === 'top' ? 3 : -3)
          : Math.hypot(x, y) - (railRadius + (tag === 'outer' ? halfWidth : -halfWidth));
        surfaceResidual = Math.max(surfaceResidual, Math.abs(residual));
        assert.ok(Math.abs(z) <= 3 + 1e-7);
      }
      if (plane) {
        assert.deepEqual(trims.map(trim => trim.degree).sort(), [1, 1, 2, 2]);
        const rimRadii = [];
        for (const trim of trims) {
          const radius = Math.hypot(...trim.points[0].slice(0, 2));
          for (const [x, y, z] of trim.points) {
            near(z, tag === 'top' ? 3 : -3);
            const rho = Math.hypot(x, y);
            assert.ok(Math.abs(rho - railRadius) <= halfWidth + 1e-7);
            if (trim.degree === 2) near(rho, radius);
          }
          if (trim.degree === 2) rimRadii.push(radius);
        }
        rimRadii.sort((a, b) => a - b);
        near(rimRadii[0], railRadius - halfWidth);
        near(rimRadii[1], railRadius + halfWidth);
      }
    }
  }
  near(surfaceResidual, 0);
  const { bodies } = await f.bodies();
  assert.equal(bodies.length, 1);
  for (const volume of [read.mass.volume, read.quadrature, bodies[0].volume]) near(volume, expectedVolume(halfWidth));
  read.mass.centroid.forEach(value => near(value, 0));
  const angles = read.seams.map(seam => {
    assert.equal(seam.status, 'measured');
    const expected = jointAngle(seam);
    near(seam.maximumAngleDegrees, expected, 1e-5);
    near(seam.minimumAngleDegrees, expected, 1e-5);
    return expected;
  });
  assert.deepEqual(angles.sort((a, b) => a - b), [...Array(8).fill(0), ...Array(8).fill(90)]);
  f.report.observations.push({ label, width: 2 * halfWidth, volume: read.mass.volume, quadrature: read.quadrature,
    digest: read.digest, surfaceResidual, gap: read.check.maximumPcurveGap, counts: read.check.counts, angles });
  return read;
}

async function verify(label, doc, radius) {
  const read = await f.inspect(label, doc);
  assert.ok(read.check.valid, read.check.issues.join('\n'));
  assert.deepEqual(read.source, { family: 'sweep-curve', id: 'n1' });
  assert.equal(read.bodyCount, 1);
  if (rectangular) return verifyRectangle(label, read, radius);
  const bore = annular ? doc.parameters.BoreRadius : 0, shells = bore ? 2 : 1;
  assert.deepEqual(read.check.counts, { bodies: 1, shells, faces: 4 * shells, loops: 4 * shells,
    coedges: 16 * shells, edges: 8 * shells, vertices: 4 * shells });
  assert.equal(read.check.topology[0].genus, shells);
  assert.equal(read.planes, 0);
  assert.equal(read.pcurves, 16 * shells);
  let surfaceResidual = 0;
  for (const [shell, target] of (bore ? [radius, bore] : [radius]).entries()) {
    const faces = read.samples.filter(face => face.shell === shell);
    assert.equal(faces.length, 4);
    for (const face of faces) {
      if (annular) assert.ok(face.name.includes(shell ? '[bore]' : '[outer]'), face.name);
      for (const [x, y, z] of face.points)
        surfaceResidual = Math.max(surfaceResidual, Math.abs(Math.hypot(Math.hypot(x, y) - railRadius, z) - target));
    }
  }
  near(surfaceResidual, 0);
  near(read.mass.volume, expectedVolume(radius, bore));
  near(read.quadrature, expectedVolume(radius, bore));
  read.mass.centroid.forEach(value => near(value, 0));
  const { bodies } = await f.bodies();
  assert.equal(bodies.length, 1);
  near(bodies[0].volume, expectedVolume(radius, bore));
  assert.equal(read.seams.length, 8 * shells);
  for (const seam of read.seams) {
    assert.equal(seam.status, 'measured');
    near(seam.maximumAngleDegrees, 0, 1e-5);
    assert.equal(seam.curvature.status, 'measured');
    near(seam.curvature.maximumDifference, 0);
  }
  f.report.observations.push({ label, radius, ...(annular ? { bore } : {}), volume: read.mass.volume, quadrature: read.quadrature, digest: read.digest,
    surfaceResidual, gap: read.check.maximumPcurveGap, counts: read.check.counts,
    maximumAngle: Math.max(...read.seams.map(seam => seam.maximumAngleDegrees)),
    maximumCurvatureDifference: Math.max(...read.seams.map(seam => seam.curvature.maximumDifference)) });
  return read;
}

async function startSweep(path) {
  await button('Sketch 1', browser()).click();
  await button(path, browser()).click();
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.command('Sweep');
  await hud().getByLabel('Representation', { exact: true }).selectOption('exact');
}

async function measureSeams(native, railName, label = '05-measured-native-seams') {
  f.phase = 'Measure all native ring seams in the Studio inspector';
  await button(rectangular ? 'Iso' : 'Top', f.page.locator('.views')).click();
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await button(`Sweep along ${railName}`, browser()).click();
  const panel = f.page.getByRole('region', { name: 'Edge continuity', exact: true });
  await button('Inspect native joints', panel).click();
  const options = panel.getByRole('combobox', { name: 'Native shared edge', exact: true });
  const result = panel.getByRole('status', { name: 'Edge continuity result', exact: true });
  const reading = result.locator('[data-continuity-angle]');
  for (const seam of native.seams) {
    await options.selectOption(seam.edgeId);
    await button('Measure continuity', panel).click();
    await reading.waitFor();
    assert.equal(await reading.textContent(), jointAngle(seam) + '°');
    assert.match(await result.innerText(), /Native samples\s+8/);
  }
  await result.scrollIntoViewIfNeeded();
  await f.snapshot(label);
}

async function showCavity(doc) {
  f.phase = 'Show the closed cavity in a Studio section';
  await button('Section view').click();
  await button('Section across Y').click();
  await button('Front', f.page.locator('.views')).click();
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await f.page.waitForFunction(() => {
    const section = window.__studioSection();
    return section.mode === 'plane' && section.planes[0].axis === 'y' && Math.abs(section.planes[0].offset) < 1e-6;
  });
  const section = await f.page.evaluate(() => window.__studioSection());
  assert.equal(section.gpu, true);
  await f.same(doc);
  await f.snapshot('08-reopened-cavity-section', () => ({ section: window.__studioSection() }));
  await button('Section view').click();
  await f.same(doc);
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
  await f.newPage();
  const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await chooser.setFiles({ name: 'closed-circle-sweep.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) });
  await f.same(seed);

  f.phase = 'Draw a circle and convert it to a Direct curve';
  await button('Sketch', f.page.locator('.mode')).click();
  await f.sketchPanel().waitFor();
  await f.tool('Circle', 'c');
  await f.frame([[0, 0], [railRadius, 0]]);
  await f.worldClick([0, 0]);
  await f.worldClick([railRadius, 0]);
  assert.equal(Number(await f.sketchPanel().locator('#sk-diameter').inputValue()), 2 * railRadius);
  await button('Make curves', f.sketchPanel()).click();
  await f.sketchPanel().waitFor({ state: 'hidden' });
  await f.changed(seed);
  const authored = (await f.snapshot('01-circle-made-from-sketch')).doc;
  assert.deepEqual(authored.nodes, seed.nodes);
  const rail = authored.direct.objects.find(object => object.id !== 'ellipse');
  assert.ok(rail && !rail.hidden);
  const text = authored.direct.sources[rail.source];
  const readList = name => JSON.parse(text.match(new RegExp(name + '\\s*:\\s*(.+?);'))[1]);
  const path = { degree: 2, knots: readList('knots'), controlPoints: readList('control-points'), weights: readList('weights') };
  assert.deepEqual(path.knots, knots);
  assert.equal(path.controlPoints.length, 9);
  assert.equal(path.weights.length, 9);
  for (const [i, [x, y, z]] of path.controlPoints.entries()) {
    near(Math.hypot(x, y), (i % 2 === 0 ? 1 : Math.SQRT2) * railRadius);
    near(z, 0);
  }

  f.phase = 'Refuse an ellipse as a closed Exact Sweep path';
  await startSweep('Ellipse control');
  await status('refused').waitFor();
  await hud().getByText('This closed Sweep needs a circle', { exact: true }).waitFor();
  assert.ok(await button('Apply', hud()).isDisabled());
  await f.same(authored);
  await f.snapshot('02-ellipse-refused');
  await button('Cancel', hud()).click();
  await button('Ellipse control', browser()).click();
  await button('Hide', f.page.getByRole('complementary', { name: 'Direct geometry', exact: true })).click();
  await f.changed(authored);
  const railDoc = await f.doc();
  const savedRail = baseline ? null : await f.save('closed-circle-input');

  f.phase = 'Preview and apply the closed circle';
  await startSweep(rail.name);
  await hud().locator('.hud-step').getByText('Exact closed circle', { exact: true }).waitFor();
  if (baseline) {
    await status('refused').waitFor();
    await hud().getByText(rectangular ? 'The closed-circle Sweep needs a circular section' : 'This Sweep needs a circular disk',
      { exact: true }).waitFor();
    assert.ok(await button('Apply', hud()).isDisabled());
    await f.same(railDoc);
    await f.snapshot(rectangular ? '03-closed-rectangle-refused' : '03-closed-annulus-refused');
    return;
  }
  await status('preview').waitFor();
  await f.snapshot('03-closed-circle-preview');
  await button('Apply', hud()).click();
  await f.changed(railDoc);
  const applied = (await f.snapshot('04-closed-circle-applied')).doc;
  assert.deepEqual([applied.nodes[1].kind, applied.nodes[1].mode, applied.nodes[1].path], ['sweep-curve', 'exact', path]);
  const native = await verify('accepted-native', applied, 2);
  await measureSeams(native, rail.name);

  let edited;
  const radius = annular ? 2 : 3;
  if (annular) {
    const panel = await f.openParameters();
    const input = panel.getByLabel('Value of BoreRadius', { exact: true });
    await input.fill('2'); await input.press('Enter');
    await f.waitToast(/strictly positive wall clearance around the bore/);
    await f.same(applied);
    await f.snapshot('06-refuse-wall-contact');
    await f.closeParameters(panel);
    edited = (await f.setParameter('BoreRadius', 1.5, '07-enlarge-cavity')).doc;
    assert.deepEqual(edited.nodes, applied.nodes);
  } else if (rectangular) {
    await f.openFeatureEditor(1, 'edit the closed Sweep rectangle');
    await f.editor().getByText('Sketch 1 · 4 × 6 mm', { exact: true }).waitFor();
    await button('Edit sketch', f.editor()).click();
    await f.sketchPanel().waitFor();
    assert.equal(await widthInput().inputValue(), '4');
    await widthInput().fill('40');
    await f.page.locator('.topbar button.finish').click();
    await f.waitToast(/The rectangle reaches the bend axis/);
    await f.same(applied);
    assert.equal(await widthInput().inputValue(), '40');
    await f.snapshot('06-refuse-axis-contact');
    await widthInput().fill('6');
    edited = (await f.finishSketch('07-history-width-edit')).doc;
    near(edited.nodes[0].max[0] - edited.nodes[0].min[0], 6);
    near(edited.nodes[0].max[1] - edited.nodes[0].min[1], 6);
    assert.deepEqual(edited.nodes[1], applied.nodes[1]);
  } else {
    await f.openFeatureEditor(1, 'edit the closed Sweep diameter');
    await f.editor().getByText('Exact closed circle', { exact: true }).waitFor();
    const diameter = f.editor().getByLabel('Diameter', { exact: true });
    await diameter.fill('40');
    await button('Apply', f.editor()).click();
    await f.editor().getByText('Choose a larger arc radius or reduce the sketch diameter.', { exact: true }).waitFor();
    await f.same(applied);
    await f.snapshot('06-refuse-axis-contact');
    await diameter.fill('6');
    edited = (await f.applyEditor(applied, '07-history-diameter-edit')).doc;
    assert.equal(edited.nodes[0].radius, 3);
    assert.deepEqual(edited.nodes[1], applied.nodes[1]);
  }
  const expanded = await verify('edited-native', edited, radius);
  await f.undo();
  await f.same(applied);
  await f.redo();
  await f.same(edited);
  const saved = await f.save('closed-circle-sweep');
  const reopened = (await f.freshOpen(saved.file, edited, '08-reopened')).doc;
  const reopenedNative = await verify('reopened-native', reopened, radius);
  assert.equal(reopenedNative.digest, expanded.digest);
  if (annular) {
    await showCavity(reopened);
    await measureSeams(reopenedNative, rail.name, '08-reopened-native-seams');
    const restored = (await f.setParameter('BoreRadius', 1, '09-restored-cavity')).doc;
    assert.equal((await verify('restored-native', restored, radius)).digest, native.digest);
    await f.undo();
    await f.same(edited);
  }
  if (rectangular) await measureSeams(reopenedNative, rail.name, '08-reopened-native-seams');
  await f.openFeatureEditor(1);
  await f.editor().getByText('Exact closed circle', { exact: true }).waitFor();
  if (rectangular) await f.editor().getByText('Sketch 1 · 6 × 6 mm', { exact: true }).waitFor();
  else assert.equal(Number(await f.editor().getByLabel('Diameter', { exact: true }).inputValue()), 2 * radius);
  await f.snapshot('09-reopened-history');
  if (rectangular) {
    await button('Edit sketch', f.editor()).click();
    await f.sketchPanel().waitFor();
    assert.equal(await widthInput().inputValue(), '6');
    await widthInput().fill('4');
    const restored = (await f.finishSketch('09-restored-width')).doc;
    assert.deepEqual(restored.nodes[1], applied.nodes[1]);
    assert.equal((await verify('restored-native', restored, 2)).digest, native.digest);
  }

  f.phase = 'Qualify a revision-bound local proposal on the authored circle';
  const file = join(f.output, 'closed-circle-proposal.bcad');
  await copyFile(savedRail.file, file);
  await withMcpSession({ app: f.app, output: f.output, clientName: f.name }, file, 'closed-circle', async call => {
    const expectedRevision = await currentPartRevision(call);
    const description = await call('describe', { command: 'sweep-curve' });
    assert.match(description.values.representation, /closed circle.*four rational quadratic quarter spans/);
    if (annular) assert.match(description.values.sketch, /A closed circle accepts a disk with an optional concentric bore/);
    if (rectangular) assert.match(description.values.sketch, /A closed circle accepts [^.]*aligned rectangle/);
    const summary = await call('query', { action: 'summary' });
    const source = summary.direct_curves.find(candidate => candidate.id === rail.id);
    assert.ok(source?.revision);
    const feature = revision => ({ tool: 'features', args: { action: 'command', command: 'sweep-curve', expectedRevision,
      values: { sketch: 'n0', path: source.id, pathRevision: revision, representation: 'exact' } } });
    const before = await readFile(file);
    const bad = await call('features', { action: 'batch', dryRun: true, ops: [feature('0'.repeat(64))] }, true);
    assert.match(bad.error, /path geometry changed/);
    const op = feature(source.revision);
    const dry = await call('features', { action: 'batch', dryRun: true, ops: [op] });
    assert.ok(dry.dryRun);
    near(dry.change.volume, expectedVolume(2, annular ? 1 : 0), .001);
    assert.deepEqual(await readFile(file), before);
    const result = await call('proposals', { action: 'propose', title: 'Exact Sweep around the authored circle', ops: [op] });
    assert.deepEqual([result.proposal, result.applied], ['P1', false]);
  });
  const pending = JSON.parse(await readFile(file));
  assert.deepEqual([pending.nodes, pending.outputs], [railDoc.nodes, railDoc.outputs]);
  await f.freshOpen(file, pending, '10-proposal-open');
  await button('Chat').first().click();
  await button('Preview', card('P1')).click();
  await button('Hide', card('P1')).waitFor();
  await f.same(pending);
  await button('Accept', card('P1')).click();
  await f.changed(pending);
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  const approved = (await f.snapshot('11-proposal-approved')).doc;
  assert.deepEqual([approved.nodes[1].mode, approved.nodes[1].path, approved.outputs], ['exact', path, applied.outputs]);
  assert.equal((await verify('approved-native', approved, 2)).digest, native.digest);
});
