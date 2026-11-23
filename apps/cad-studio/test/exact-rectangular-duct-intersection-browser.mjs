import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow, sha256 } from './flow-helper.mjs';
import { currentPartRevision, withMcpSession } from './mcp-browser-session.mjs';

const baseline = process.argv.includes('--observe-base');
const paired = process.argv.includes('--paired-cavities');
const reviewBaseline = process.argv.includes('--expect-cut-review-unavailable');
const reviewCut = reviewBaseline || process.argv.includes('--review-cut');
const cutOffset = (!paired && reviewCut) || process.argv.includes('--offset') ? 1 : 0;
const pairedOffset = paired && cutOffset > 0;
const path = {
  degree: 2, knots: [0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4],
  controlPoints: [[20, 0, 0], [20, 20, 0], [0, 20, 0], [-20, 20, 0], [-20, 0, 0],
    [-20, -20, 0], [0, -20, 0], [20, -20, 0], [20, 0, 0]],
  weights: Array.from({ length: 9 }, (_, index) => index % 2 ? Math.SQRT1_2 : 1),
};
const holeAt = (halfHeight, center = 0) => [[-1, center - halfHeight], [-1, center + halfHeight], [1, center + halfHeight], [1, center - halfHeight]]
  .map(start => ({ kind: 'line', start }));
const exteriorHalfHeight = paired ? 5 : 3, boxHalfHeight = exteriorHalfHeight + 2;
const initialHalfHeight = paired ? 1 : 2, editedHalfHeight = initialHalfHeight / 2;
const firstCenter = paired ? -2 : 0;
const cavitySections = firstHalfHeight => paired
  ? [{ center: -2, halfHeight: firstHalfHeight }, { center: 2, halfHeight: 1 }]
  : [{ center: 0, halfHeight: firstHalfHeight }];
const holes = cavitySections(initialHalfHeight).map(({ center, halfHeight }) => holeAt(halfHeight, center));
const holeTags = paired ? ['a', 'b'].map(tag => ['inner', 'bottom', 'outer', 'top'].map(side => `${tag}-${side}`))
  : [['hole-inner', 'hole-bottom', 'hole-outer', 'hole-top']];
const seed = { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 2,
  nodes: [
    { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [-2, -exteriorHalfHeight], max: [2, exteriorHalfHeight], holes,
      sideTags: { outer: ['top', 'outer', 'bottom', 'inner'], holes: holeTags } },
    { id: 'n1', kind: 'sweep-curve', sketch: 0, name: 'Closed circular rail', path, mode: 'exact' },
  ], outputs: { b1: { node: 1, side: 'solid' } } };
const pins = [
  'packages/barocss-cad/src/brep/exact-sweep.ts', 'packages/barocss-cad/src/brep/analytic-boolean.ts',
  'packages/barocss-cad/src/brep/exact-ring-intersect.ts', 'packages/barocss-cad/src/brep/edge-continuity.ts',
  'apps/cad-studio/src/App.tsx', 'apps/cad-studio/test/exact-rectangular-duct-intersection-browser.mjs',
];
if (!baseline || paired) pins.push('packages/barocss-cad/src/brep/exact-rectangular-duct-intersect.ts');
if (reviewCut) pins.push(
  'packages/barocss-cad-model/src/chat/part/modelCandidate.ts',
  'packages/barocss-cad-model/src/chat/part/proposals.ts',
  'packages/barocss-cad-model/src/chat/part/views.ts',
);
if (reviewCut && !reviewBaseline) pins.push(
  'packages/barocss-cad-model/src/chat/offsetRectangularDuctIntersectionEvidence.ts',
  'packages/barocss-cad-model/src/chat/rectangularDuctIntersectionProposalReview.ts',
);
if (paired && reviewCut && !reviewBaseline) pins.push(
  'packages/barocss-cad-model/src/chat/closedPairedRectangularDuctEvidence.ts',
  'packages/barocss-cad-model/src/chat/pairedRectangularDuctIntersectionEvidence.ts',
);
const f = await createFlow({
  name: 'exact-rectangular-duct-intersection', output: process.argv[2],
  envFrozen: pairedOffset ? (reviewCut ? 'D1777_SOURCE_FROZEN' : 'D1776_SOURCE_FROZEN')
    : paired ? (reviewCut ? 'D1774_SOURCE_FROZEN' : 'D1773_SOURCE_FROZEN')
    : reviewCut ? 'D1769_SOURCE_FROZEN' : cutOffset ? 'D1767_SOURCE_FROZEN' : 'D1765_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: paired ? `Intersect the exact two-cavity duct with a ${cutOffset ? 'positive-offset' : 'centered'} box in desktop Studio.`
    : cutOffset ? 'Intersect one exact closed rectangular duct with an offset box in desktop Studio.'
      : 'Intersect one exact closed rectangular duct with a centered box in desktop Studio.',
  limits: [paired ? `One R20 mm rail, outer 4 × 10 mm and two axially separated 2 × 2 mm cavities, initial retained x ≥ ${cutOffset}, desktop WebGPU.`
    : `One R20 mm rail, outer 4 × 6 mm and centered 2 × 4 or 2 × 2 mm cavity, retained x ≥ ${cutOffset}, desktop WebGPU.`],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep, faceGeometry, massPropertiesOf, measureBrepEdgeContinuity } from '@barocss/cad';
import { partSnapshot } from '@barocss/cad-model/engine/part';
import { digestOf } from '@barocss/cad-model/util/digest';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const { outputs: [output] } = partSnapshot(doc), { brep } = output;
const check = checkBrep(brep, { strict: true });
const faces = brep.faces.map(face => {
  const geometry = faceGeometry(face);
  const loops = face.loops.map(id => {
    const loop = brep.loops.find(item => item.id === id);
    return { kind: loop.kind, edges: loop.coedges.map(id => {
      const use = brep.coedges.find(item => item.id === id);
      const edge = brep.edges.find(item => item.id === use.edge);
      const twin = brep.coedges.find(item => item.id === use.twin);
      return { id: edge.id, points: edge.curve.controlPoints, degree: edge.curve.degree, sense: use.sense,
        reciprocal: twin?.twin === id && twin.edge === use.edge && twin.sense !== use.sense,
        pcurves: Boolean(use.pcurve && twin?.pcurve) };
    }) };
  });
  return { name: face.name, geometry, loops };
});
const joints = brep.edges.map(edge => measureBrepEdgeContinuity(brep, edge.id));
let mass = null, quadrature = null;
try { mass = massPropertiesOf(output); } catch {}
try { quadrature = brepMassProperties(brep, 1); } catch {}
console.log(JSON.stringify({ source: brep.source, check, faces, joints, mass, quadrature,
  chartCount: brep.coedges.filter(use => use.pcurve).length, digest: digestOf(brep) }));
`,
});
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const browser = () => f.page.getByRole('complementary', { name: 'Browser', exact: true });
const near = (value, expected, tolerance = 1e-7) =>
  assert.ok(Number.isFinite(value) && Math.abs(value - expected) <= tolerance, JSON.stringify({ value, expected, tolerance }));

async function begin() {
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
  await chooser.setFiles({ name: 'closed-rectangular-duct.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) });
  await f.same(seed);
  near((await f.bodies()).bodies[0].volume, (paired ? 1280 : 640) * Math.PI);

  await f.page.evaluate(() => document.activeElement?.blur());
  await f.command('Box');
  const box = f.page.getByRole('dialog', { name: 'Box', exact: true });
  for (const [field, value] of Object.entries({ 'Width X': 30, 'Depth Y': 60, 'Height Z': 2 * boxHalfHeight,
    'At X': cutOffset, 'At Y': -30, 'At Z': -boxHalfHeight })) {
    await box.getByLabel(field, { exact: true }).fill(String(value));
  }
  await box.locator('.status').filter({ hasText: /^preview$/ }).waitFor();
  await button('Apply', box).click();
  await f.changed(seed);
  const boxed = (await f.snapshot('01-duct-and-box')).doc;
  assert.deepEqual(boxed.nodes.slice(0, 2), seed.nodes);
  assert.deepEqual([boxed.nodes[2].min, boxed.nodes[2].max, boxed.nodes[3].from, boxed.nodes[3].height],
    [[cutOffset, -30], [cutOffset + 30, 30], -boxHalfHeight, 2 * boxHalfHeight]);
  return boxed;
}

const ordinate = (radius, offset) => Math.sqrt((radius - offset) * (radius + offset));
const segmentArea = (radius, offset) => radius ** 2 * Math.acos(offset / radius) - offset * ordinate(radius, offset);
function expectedAngle(native, edgeId, offset) {
  const faces = native.faces.filter(face => face.loops.some(loop => loop.edges.some(edge => edge.id === edgeId)));
  const cap = faces.find(face => face.geometry.kind === 'plane' && face.geometry.n[0] < -.99);
  const cylinder = faces.find(face => face.geometry.kind === 'cylinder');
  return cap && cylinder ? Math.acos(-cylinder.geometry.out * offset / cylinder.geometry.r) * 180 / Math.PI : 90;
}

function verifyCut(native, cavityHalfHeight, offset = cutOffset) {
  // The start tangent is +Y and sketch X is +X, so sketch Y maps to world −Z.
  const openings = cavitySections(cavityHalfHeight).map(hole => ({ ...hole, center: -hole.center }));
  const sectionCount = openings.length + 1, wallCount = 4 * sectionCount;
  assert.deepEqual(native.source, { family: 'analytic-boolean', id: 'n4' });
  assert.ok(native.check.valid, native.check.issues.join('\n'));
  assert.deepEqual(native.check.counts, { bodies: 1, shells: 1, faces: wallCount + 2, loops: wallCount + 2 * sectionCount,
    coedges: 24 * sectionCount, edges: 12 * sectionCount, vertices: 8 * sectionCount });
  assert.equal(native.check.topology[0].genus, openings.length);
  assert.equal(native.chartCount, native.check.counts.coedges);
  assert.ok(native.check.maximumPcurveGap < 1e-8);
  const innerArea = segmentArea(21, offset) - segmentArea(19, offset);
  const hollowHeight = openings.reduce((total, hole) => total + 2 * hole.halfHeight, 0);
  const volume = 2 * exteriorHalfHeight * (segmentArea(22, offset) - segmentArea(18, offset)) - hollowHeight * innerArea;
  near(native.mass.volume, volume);
  near(native.quadrature.volume, volume, 1e-6);
  if (paired) {
    const annularSegmentMoment = (outer, inner) => 2 * (ordinate(outer, offset) ** 3 - ordinate(inner, offset) ** 3) / 3;
    const x = (10 * annularSegmentMoment(22, 18) - hollowHeight * annularSegmentMoment(21, 19)) / volume;
    const z = -openings.reduce((total, hole) => total + 2 * hole.halfHeight * hole.center * innerArea, 0) / volume;
    for (const value of [native.mass, native.quadrature]) {
      assert.equal(value.method, 'quadrature');
      [x, 0, z].forEach((expected, axis) => near(value.centroid[axis], expected));
    }
  }
  assert.equal(native.joints.length, 12 * sectionCount);
  assert.equal(native.faces.filter(face => face.geometry.kind === 'cylinder').length, 2 * sectionCount);

  const caps = native.faces.filter(({ geometry }) => geometry.kind === 'plane' && geometry.n[0] < -.99);
  assert.equal(caps.length, 2);
  const seen = [];
  for (const { geometry, loops } of caps) {
    near(geometry.o[0], offset);
    assert.deepEqual(loops.map(loop => loop.kind), ['outer', ...openings.map(() => 'inner')]);
    const meanY = loops[0].edges.flatMap(edge => edge.points).reduce((sum, point) => sum + point[1], 0) / 8;
    const side = Math.sign(meanY), centerY = side * ordinate(20, offset);
    seen.push(side);
    const owned = new Set();
    for (const [index, loop] of loops.entries()) {
      assert.equal(loop.edges.length, 4);
      const zMean = loop.edges.flatMap(edge => edge.points).reduce((total, point) => total + point[2], 0) / 8;
      const section = index ? openings.find(hole => Math.abs(hole.center - zMean) < 1e-7) : { center: 0, halfHeight: exteriorHalfHeight };
      assert.ok(section && !owned.has(section));
      owned.add(section);
      const halfWidth = index ? 1 : 2, { halfHeight, center } = section;
      const low = ordinate(20 - halfWidth, offset), high = ordinate(20 + halfWidth, offset);
      let area = 0;
      for (const edge of loop.edges) {
        assert.equal(edge.degree, 1);
        assert.equal(edge.points.length, 2);
        assert.ok(edge.reciprocal && edge.pcurves);
        for (const [x, y, z] of edge.points) {
          near(x, offset);
          assert.equal(Math.sign(y), side);
          near(Math.min(Math.abs(Math.abs(y) - low), Math.abs(Math.abs(y) - high)), 0);
          near(Math.abs(z - center), halfHeight);
        }
        const [a, b] = edge.points;
        area -= (edge.sense === 'forward' ? 1 : -1) * ((a[1] - centerY) * (b[2] - center) - (a[2] - center) * (b[1] - centerY)) / 2;
      }
      near(area, (index ? -1 : 1) * (high - low) * 2 * halfHeight);
    }
  }
  assert.deepEqual(seen.sort((a, b) => a - b), [-1, 1]);
  for (const joint of native.joints) {
    assert.equal(joint.status, 'measured');
    assert.equal(joint.sampleCount, 8);
    const angle = expectedAngle(native, joint.edgeId, offset);
    near(joint.minimumAngleDegrees, angle);
    near(joint.maximumAngleDegrees, angle);
  }
  return caps;
}

async function measureInStudio(native, caps, stage, expectRefused = false, offset = cutOffset) {
  await button('Iso', f.page.locator('.views')).click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await browser().getByRole('button', { name: /^Sweep along Closed circular rail/ }).click();
  const panel = f.page.getByRole('region', { name: 'Edge continuity', exact: true });
  await button('Inspect native joints', panel).click();
  const pick = panel.getByRole('combobox', { name: 'Native shared edge', exact: true });
  const result = panel.getByRole('status', { name: 'Edge continuity result', exact: true });
  const capEdgeIds = new Set(caps.flatMap(cap => cap.loops.flatMap(loop => loop.edges.map(edge => edge.id))));
  const corner = native.joints.find(joint => !capEdgeIds.has(joint.edgeId)).edgeId;
  const samples = [corner, ...caps.flatMap(cap => cap.loops.map(loop => {
    const vertical = loop.edges.find(edge => Math.abs(edge.points[0][1] - edge.points[1][1]) < 1e-7);
    return (offset && vertical ? vertical : loop.edges[0]).id;
  }))];
  for (const id of expectRefused ? samples.slice(0, 1) : samples) {
    await pick.selectOption(id);
    await button('Measure continuity', panel).click();
    if (expectRefused) {
      const detail = result.locator('details[open]');
      if (!await detail.count()) await result.getByText('Measurement detail', { exact: true }).click();
      assert.match(await detail.innerText(), /A face has no native parameter curve\./);
    } else {
      const reading = result.locator('[data-continuity-angle]');
      await reading.waitFor();
      const values = (await reading.innerText()).replaceAll('°', '').split(' – ').map(Number);
      for (const value of values) near(value, expectedAngle(native, id, offset), 5.1e-7);
      assert.match(await result.innerText(), /Native samples\s+8/);
    }
  }
  await result.scrollIntoViewIfNeeded();
  await f.snapshot(stage);
}

async function capRays(stage, materialZ = 2.5, offset = cutOffset) {
  const cube = f.page.getByRole('group', { name: 'View cube', exact: true });
  await button('View cube directions', cube).click();
  await f.page.getByRole('menuitem', { name: 'Left', exact: true }).click();
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await f.page.waitForFunction(() => document.querySelector('.view-cube .vc-label')?.textContent === 'LEFT');
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  const station = ordinate(20, offset);
  const material = [-station, station].map(y => [offset, y, paired ? 0 : materialZ]);
  const cavity = [-station, station].flatMap(y => cavitySections(initialHalfHeight).map(hole => [offset, y, hole.center]));
  const samples = await f.page.evaluate(points => points.map(point => window.__studioSurfacePoint(point)), [...material, ...cavity]);
  for (const [index, point] of material.entries()) {
    assert.ok(samples[index], 'A material ray hits its cap.');
    point.forEach((value, axis) => near(samples[index][axis], value, 1e-4));
  }
  for (const point of samples.slice(2)) assert.ok(!point || point[0] > offset + 0.1, JSON.stringify({ cavityRay: point }));
  const filter = button('Selection filter');
  for (let i = 0; i < 6 && !(await filter.innerText()).includes('Faces'); i++) await filter.click();
  assert.match(await filter.innerText(), /Faces/);
  const selected = [];
  for (const [index, materialPoint] of material.entries()) {
    const pixel = await f.page.evaluate(point => window.__studioScreenOf(point), materialPoint);
    assert.ok(pixel && await f.page.evaluate(point => document.elementFromPoint(...point)?.matches('canvas.vp-canvas'), pixel));
    await f.page.mouse.click(...pixel);
    await f.page.waitForFunction(previous => {
      const faces = window.__studioSelection?.selection.faces;
      return faces?.length === 1 && faces[0].face !== previous;
    }, selected[index - 1] ?? -1);
    selected.push(await f.page.evaluate(() => window.__studioSelection.selection.faces[0].face));
    await f.snapshot(stage + '-cap-' + (index + 1));
  }
  f.report.observations.push({ label: stage + '-cap-rays', samples, selected });
}

async function editOffset(previous, value, label) {
  await f.openFeatureEditor(3);
  await f.editor().getByLabel('Corner X', { exact: true }).fill(String(value));
  const { doc } = await f.applyEditor(previous, label);
  assert.deepEqual([doc.nodes[2].min, doc.nodes[2].max], [[value, -30], [value + 30, 30]]);
  const extrude = { ...previous.nodes[3] };
  delete extrude.made;
  assert.deepEqual(doc.nodes[3], extrude);
  assert.deepEqual(doc.nodes.slice(0, 2), previous.nodes.slice(0, 2));
  assert.deepEqual(doc.nodes.slice(4), previous.nodes.slice(4));
  return doc;
}

async function editCavity(halfHeight, label) {
  await f.openFeatureEditor(1);
  await f.editor().getByText('Exact closed circle', { exact: true }).waitFor();
  await button('Edit sketch', f.editor()).click();
  await f.sketchPanel().getByLabel('Active outline', { exact: true }).selectOption('1');
  await f.sketchPanel().getByLabel('Point 1 Y', { exact: true }).fill(String(firstCenter - halfHeight));
  await f.sketchPanel().getByLabel('Point 2 Y', { exact: true }).fill(String(firstCenter + halfHeight));
  const { doc } = await f.finishSketch(label);
  assert.deepEqual(doc.nodes[0].holes, cavitySections(halfHeight).map(({ center, halfHeight }) => holeAt(halfHeight, center)));
  assert.deepEqual(doc.nodes[0].sideTags, seed.nodes[0].sideTags);
  return doc;
}

async function modelImage(request, args) {
  const response = await request('tools/call', { name: 'query', arguments: { action: 'render', ...args } });
  assert.equal(response.isError, false, response.content[0].text);
  const meta = JSON.parse(response.content[0].text);
  const png = Buffer.from(response.content.find(item => item.type === 'image').data, 'base64');
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(meta.imageSha256, sha256(png));
  assert.equal(Object.keys(meta.views).length, 4);
  return { meta, png };
}

function verifyOffsetReview(evidence) {
  near(evidence.volume.analytic, 6 * (segmentArea(22, 1) - segmentArea(18, 1)) - 4 * (segmentArea(21, 1) - segmentArea(19, 1)));
  for (const cap of evidence.caps) {
    assert.deepEqual(cap.normal, [-1, 0, 0]);
    assert.deepEqual([cap.outer.edges.length, cap.inner.edges.length], [4, 4]);
    near(cap.outer.width, ordinate(22, 1) - ordinate(18, 1));
    near(cap.inner.width, ordinate(21, 1) - ordinate(19, 1));
    near(cap.outer.height, 6);
    near(cap.inner.height, 4);
    near(cap.outer.signedArea, cap.outer.width * 6);
    near(cap.inner.signedArea, -cap.inner.width * 4);
    near(cap.materialArea, cap.outer.signedArea + cap.inner.signedArea);
  }
}

function verifyPairedReview(evidence, native) {
  const area = (outer, inner) => segmentArea(outer, cutOffset) - segmentArea(inner, cutOffset);
  const width = (outer, inner) => ordinate(outer, cutOffset) - ordinate(inner, cutOffset);
  const envelopeWidth = width(22, 18), apertureWidth = width(21, 19);
  near(evidence.volume.analytic, 10 * area(22, 18) - 4 * area(21, 19));
  assert.deepEqual(evidence.corners.slice().sort(), native.joints.map(joint => joint.edgeId).sort());
  for (const center of [evidence.centroid.analytic, evidence.centroid.native]) {
    assert.equal(center.length, 3);
    center.forEach((value, axis) => near(value, native.mass.centroid[axis]));
  }
  const allRimEdges = new Set();
  for (const cap of evidence.caps) {
    const original = native.faces.find(face => face.name === cap.name);
    assert.ok(original);
    assert.deepEqual(cap.normal, [-1, 0, 0]);
    assert.equal(cap.outer.z.length, 2);
    cap.outer.z.forEach((value, axis) => near(value, axis ? 5 : -5));
    near(cap.outer.width, envelopeWidth);
    near(cap.outer.height, 10);
    near(cap.outer.signedArea, 10 * envelopeWidth);
    near(cap.materialArea, 10 * envelopeWidth - 4 * apertureWidth);
    assert.equal(cap.cavities.length, 2);
    for (const [index, aperture] of cap.cavities.entries()) {
      const interval = index ? [-3, -1] : [1, 3];
      assert.equal(aperture.owner, cap.name);
      assert.equal(aperture.z.length, 2);
      aperture.z.forEach((value, axis) => near(value, interval[axis]));
      near(aperture.width, apertureWidth);
      near(aperture.height, 2);
      near(aperture.signedArea, -2 * apertureWidth);
      const prefix = index ? 'b-' : 'a-';
      assert.equal(aperture.walls.length, 4);
      assert.ok(aperture.walls.every(wall => wall.includes(`[${prefix}`)));
    }
    const rimEdges = [cap.outer, ...cap.cavities].flatMap(loop => loop.edges);
    assert.deepEqual(rimEdges.slice().sort(), original.loops.flatMap(loop => loop.edges.map(edge => edge.id)).sort());
    rimEdges.forEach(id => allRimEdges.add(id));
  }
  assert.equal(allRimEdges.size, 24);
  if (pairedOffset) {
    const angles = evidence.capCylinderJointAngles;
    const joints = native.joints.filter(joint => Math.abs(expectedAngle(native, joint.edgeId, cutOffset) - 90) > 1e-7);
    assert.deepEqual(angles.map(joint => joint.edge).sort(), joints.map(joint => joint.edgeId).sort());
    assert.equal(angles.length, 12);
    for (const joint of angles) {
      const original = joints.find(value => value.edgeId === joint.edge);
      const expected = expectedAngle(native, joint.edge, cutOffset);
      near(joint.expectedAngleDegrees, expected);
      near(joint.minimumAngleDegrees, original.minimumAngleDegrees);
      near(joint.maximumAngleDegrees, original.maximumAngleDegrees);
    }
  } else assert.equal(evidence.capCylinderJointAngles, undefined);
}

async function reviewPendingCut(call, request, revision, native) {
  const { proposals: [proposal] } = await call('proposals', { action: 'list' });
  assert.equal(proposal.id, 'P1');
  assert.match(proposal.modelReviewRevision, /^[0-9a-f]{64}$/);
  const modelPins = { proposal: proposal.id, expectedRevision: revision, expectedProposalRevision: proposal.modelReviewRevision };
  const { meta, png } = await modelImage(request, modelPins);
  const evidence = meta.rectangularDuctIntersection;
  assert.deepEqual([evidence.body, evidence.duct, evidence.box, evidence.offset, evidence.pathRadius], ['b4', 'b1', 'b3', cutOffset, 20]);
  assert.equal(meta.candidate.bodySha256, native.digest);
  assert.equal(evidence.caps.length, 2);
  near(evidence.volume.native, native.mass.volume);
  assert.equal(evidence.volume.method, 'quadrature');
  assert.ok(evidence.maximumGapMM < 1e-8);
  assert.equal(evidence.measuredEdges, paired ? 36 : 24);
  assert.ok(evidence.maximumAngleErrorDegrees < 1e-7);
  if (paired) verifyPairedReview(evidence, native); else verifyOffsetReview(evidence);
  const faces = evidence.caps.map(cap => cap.name);
  const lookup = { ...modelPins, action: 'inspect', faces, expectedReviewRevision: meta.candidate.reviewRevision };
  const read = await call('query', lookup);
  assert.deepEqual([read.candidate, read.revision, read.imageSha256, read.rectangularDuctIntersection],
    [meta.candidate, meta.revision, meta.imageSha256, evidence]);
  for (const face of read.faces) {
    assert.equal(face.geometry.kind, 'plane');
    near(face.geometry.point[0], cutOffset);
    assert.deepEqual(face.geometry.outwardNormal, [-1, 0, 0]);
  }
  const other = await modelImage(request, { ...modelPins, orientation: 'opposite' });
  assert.equal(other.meta.candidate.bodySha256, meta.candidate.bodySha256);
  assert.deepEqual(other.meta.rectangularDuctIntersection, evidence);
  assert.notEqual(other.meta.candidate.reviewRevision, meta.candidate.reviewRevision);
  const visible = [...Object.values(meta.views), ...Object.values(other.meta.views)].flatMap(view => view.visible_faces);
  assert.ok(faces.every(name => visible.includes(name)));
  assert.equal((await call('query', { ...lookup, orientation: 'opposite' }, true)).code, 'MODEL_REVIEW_IMAGE_STALE');
  assert.equal((await call('query', { ...lookup, expectedProposalRevision: '0'.repeat(64) }, true)).code, 'MODEL_REVIEW_PROPOSAL_STALE');
  assert.equal((await call('query', { ...lookup, expectedRevision: '0'.repeat(16) }, true)).code, 'MODEL_REVIEW_BASE_STALE');
  const oppositeRead = await call('query', { ...lookup, orientation: 'opposite', expectedReviewRevision: other.meta.candidate.reviewRevision });
  assert.deepEqual(oppositeRead.faces, read.faces);
  const label = pairedOffset ? 'paired-offset-cut' : paired ? 'paired-cut' : 'offset-cut';
  await writeFile(join(f.output, `${label}-agent-four-views.png`), png);
  await writeFile(join(f.output, `${label}-agent-opposite-views.png`), other.png);
  f.report.observations.push({ label: paired ? `${label}-review` : 'offset-duct-review', ...meta.candidate, revision: meta.revision, imageSha256: meta.imageSha256,
    oppositeImageSha256: other.meta.imageSha256, evidence });
  return { meta, png, other, lookup, faces: read.faces };
}

async function localApproval(boxed, cut, native) {
  const file = join(f.output, paired ? 'paired-duct-cut-proposal.bcad' : cutOffset ? 'offset-duct-proposal.bcad' : 'centered-duct-proposal.bcad');
  const bytes = JSON.stringify(boxed);
  const session = { app: f.app, output: f.output, clientName: f.name };
  await writeFile(file, bytes);
  const reviewed = await withMcpSession(session, file, 'duct-intersection', async (call, request) => {
    const revision = await currentPartRevision(call);
    const op = expectedRevision => ({ tool: 'features', args: {
      action: 'command', command: 'intersect', bodies: Object.keys(boxed.outputs), expectedRevision,
    } });
    const stale = await call('features', { action: 'batch', dryRun: true, ops: [op('0'.repeat(16))] }, true);
    assert.match(stale.error, /changed|stale/i);
    const ops = [op(revision)];
    assert.ok((await call('features', { action: 'batch', dryRun: true, ops })).dryRun);
    assert.equal(await readFile(file, 'utf8'), bytes);
    const staged = await call('proposals', { action: 'propose', title: 'Intersect the closed rectangular duct', ops });
    assert.deepEqual([staged.proposal, staged.applied], ['P1', false]);
    if (reviewBaseline) {
      const pendingBytes = await readFile(file);
      const { proposals: [proposal] } = await call('proposals', { action: 'list' });
      assert.equal(proposal.id, 'P1');
      assert.equal(proposal.modelReviewRevision, undefined);
      assert.match(proposal.proposalRevision, /^[0-9a-f]{64}$/);
      const render = await call('query', { action: 'render', proposal: proposal.id, expectedRevision: revision,
        expectedProposalRevision: proposal.proposalRevision }, true);
      assert.equal(render.code, 'MODEL_REVIEW_UNAVAILABLE');
      assert.deepEqual(await readFile(file), pendingBytes);
      f.report.observations.push({ label: paired ? 'paired-cut-review-unavailable' : 'offset-duct-review-unavailable', ...render });
    }
    if (reviewCut && !reviewBaseline) {
      const bytes = await readFile(file);
      const review = await reviewPendingCut(call, request, revision, native);
      assert.deepEqual(await readFile(file), bytes);
      return review;
    }
  });
  const pending = JSON.parse(await readFile(file, 'utf8'));
  assert.deepEqual([pending.nodes, pending.outputs], [boxed.nodes, boxed.outputs]);
  await f.freshOpen(file, pending, '08-local-proposal-open');
  await button('Chat').first().click();
  const card = f.page.getByRole('listitem', { name: 'Proposal P1', exact: true });
  await button('Preview', card).click();
  await button('Hide', card).waitFor();
  await f.same(pending);
  await f.snapshot('09-local-proposal-preview');
  await button('Accept', card).click();
  await f.changed(pending);
  const { doc } = await f.snapshot('10-local-proposal-approved');
  assert.deepEqual([doc.nodes, doc.outputs], [cut.nodes, cut.outputs]);
  const approved = await f.inspect('local-approved-native', doc);
  verifyCut(approved, initialHalfHeight);
  assert.equal(approved.digest, native.digest);
  if (reviewCut) {
    const saved = await f.save(paired ? 'paired-duct-cut-reviewed' : 'offset-cut-reviewed');
    const reopened = (await f.freshOpen(saved.file, doc, '11-approved-fresh-open')).doc;
    const reopenedNative = await f.inspect('approved-reopened-native', reopened);
    verifyCut(reopenedNative, initialHalfHeight);
    assert.equal(reopenedNative.digest, native.digest);
    if (reviewed) await withMcpSession(session, saved.file, 'offset-cut-reviewed', async (call, request) => {
      const expectedRevision = await currentPartRevision(call);
      assert.equal(expectedRevision, reviewed.meta.revision);
      assert.deepEqual((await modelImage(request, { expectedRevision })).png, reviewed.png);
      assert.deepEqual((await modelImage(request, { expectedRevision, orientation: 'opposite' })).png, reviewed.other.png);
      const current = await call('query', { action: 'inspect', faces: reviewed.lookup.faces, expectedRevision });
      assert.deepEqual(current.faces, reviewed.faces);
      assert.equal((await call('query', { ...reviewed.lookup, expectedRevision }, true)).code, 'MODEL_REVIEW_UNAVAILABLE');
    });
  }
}

await f.run(async () => {
  const boxed = await begin();
  f.phase = 'Intersect the closed rectangular duct with the box';
  await button('Sweep along Closed circular rail', browser()).click();
  await button('Box', browser()).click({ modifiers: ['Shift'] });
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.command('Intersect');
  await f.page.waitForFunction(count => window.__studioDoc.nodes.length > count
    || [...document.querySelectorAll('.toast[role="alert"]')].some(node => /intersect|boolean|could not/i.test(node.textContent)), boxed.nodes.length);
  if ((await f.doc()).nodes.length === boxed.nodes.length) {
    assert.ok(baseline, 'Expected an accepted centered intersection');
    await f.same(boxed);
    const refused = await f.snapshot('02-intersection-refused');
    f.report.observations.push({ label: 'intersection-refused', notices: refused.notices });
    return;
  }
  await f.changed(boxed);
  const cut = (await f.snapshot('02-rectangular-duct-intersection')).doc;
  assert.deepEqual([cut.nodes[4].kind, cut.nodes[4].left, cut.nodes[4].right],
    ['intersect', { node: 1, side: 'solid' }, { node: 3, side: 'solid' }]);
  const native = await f.inspect('intersection-native', cut);
  const measured = native.joints.filter(joint => joint.status === 'measured').length;
  f.report.observations.push({ label: 'intersection-native', valid: native.check.valid, issues: native.check.issues, counts: native.check.counts,
    charts: native.chartCount, measured, joints: native.joints.length, volume: native.mass?.volume, digest: native.digest });
  if (baseline) {
    if (measured === 0 && native.chartCount === 0) {
      const caps = native.faces.filter(({ geometry }) => geometry.kind === 'plane' && geometry.n[0] < -.99);
      assert.equal(caps.length, 2);
      await measureInStudio(native, caps, '03-original-continuity-refused', true);
    }
    return;
  }
  const caps = verifyCut(native, initialHalfHeight);
  await measureInStudio(native, caps, '03-native-rim-continuity');
  await capRays('04-initial');
  if (reviewCut) {
    await localApproval(boxed, cut, native);
    return;
  }

  let beforeCavityEdit = cut, keptOffset = cutOffset;
  if (cutOffset) {
    keptOffset = 2;
    beforeCavityEdit = await editOffset(cut, keptOffset, '05-box-offset-two');
    const offsetNative = await f.inspect('offset-two-native', beforeCavityEdit);
    verifyCut(offsetNative, initialHalfHeight, keptOffset);
    await f.undo();
    await f.same(cut);
    await f.redo();
    await f.same(beforeCavityEdit);
  }
  const edited = await editCavity(editedHalfHeight, '05-cavity-edited');
  assert.deepEqual(edited.nodes.slice(1), beforeCavityEdit.nodes.slice(1));
  const editedNative = await f.inspect('edited-intersection-native', edited);
  verifyCut(editedNative, editedHalfHeight, keptOffset);
  await f.undo();
  await f.same(beforeCavityEdit);
  await f.redo();
  await f.same(edited);
  const saved = await f.save(pairedOffset ? 'paired-cavity-offset-intersection' : paired ? 'paired-cavity-intersection'
    : cutOffset ? 'offset-rectangular-duct-intersection' : 'centered-rectangular-duct-intersection');
  const reopened = (await f.freshOpen(saved.file, edited, '06-fresh-open')).doc;
  const reopenedNative = await f.inspect('reopened-intersection-native', reopened);
  const reopenedCaps = verifyCut(reopenedNative, editedHalfHeight, keptOffset);
  assert.equal(reopenedNative.digest, editedNative.digest);
  await measureInStudio(reopenedNative, reopenedCaps, '06-reopened-rim-continuity', false, keptOffset);
  await capRays('07-reopened', 1.5, keptOffset);
  let restored = await editCavity(initialHalfHeight, '08-cavity-restored');
  if (cutOffset) restored = await editOffset(restored, cutOffset, '08-box-offset-restored');
  const restoredNative = await f.inspect('restored-intersection-native', restored);
  verifyCut(restoredNative, initialHalfHeight);
  assert.equal(restoredNative.digest, native.digest);
  await localApproval(boxed, cut, native);
});
