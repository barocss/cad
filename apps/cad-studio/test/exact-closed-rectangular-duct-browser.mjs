import assert from 'node:assert/strict';
import { copyFile, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { checkChangedDuctPath } from './duct-proposal-review-browser-steps.mjs';
import { createFlow, sha256 } from './flow-helper.mjs';
import { currentPartRevision, withMcpSession } from './mcp-browser-session.mjs';

const baseline = process.argv.includes('--expect-refused');
const reviewBaseline = process.argv.includes('--expect-review-refused');
const review = reviewBaseline || process.argv.includes('--review-cavity');
const radius = 20;
const railId = 'circle-rail', railName = 'Closed circular rail';
const path = { degree: 2, knots: [0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4],
  controlPoints: [[20, 0, 0], [20, 20, 0], [0, 20, 0], [-20, 20, 0], [-20, 0, 0],
    [-20, -20, 0], [0, -20, 0], [20, -20, 0], [20, 0, 0]],
  weights: Array.from({ length: 9 }, (_, i) => i % 2 === 0 ? 1 : Math.SQRT1_2),
};
const holeAt = halfHeight => [[-1, -halfHeight], [-1, halfHeight], [1, halfHeight], [1, -halfHeight]]
  .map(start => ({ kind: 'line', start }));
const sideTags = { outer: ['top', 'outer', 'bottom', 'inner'],
  holes: [['hole-inner', 'hole-bottom', 'hole-outer', 'hole-top']] };
const seed = { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 1,
  nodes: [{ id: 'n0', kind: 'sketch', profile: 'rectangle', min: [-2, -3], max: [2, 3], holes: [holeAt(2)], sideTags }],
  outputs: {},
  direct: { sources: { rail: `@model rail { version:0; length-unit:mm;
    @curve #${railId} { type:nurbs; degree:2; knots:${JSON.stringify(path.knots)};
      control-points:${JSON.stringify(path.controlPoints)}; weights:${JSON.stringify(path.weights)}; } }` },
  objects: [{ id: railId, name: railName, source: 'rail', geometry: railId }] },
};
const pins = [
  'packages/barocss-cad/src/brep/exact-sweep.ts', 'packages/barocss-cad/src/features/revolve.ts',
  'packages/barocss-cad-model/src/app/profileCommands.ts', 'packages/barocss-cad-model/src/engine/errors.ts',
  'packages/barocss-cad-model/src/chat/part/features.ts', 'apps/cad-studio/src/sketch/useSketchActions.ts',
];
if (review) pins.push(
  'apps/cad-studio/test/exact-closed-rectangular-duct-browser.mjs',
  'apps/cad-studio/test/duct-proposal-review-browser-steps.mjs',
  'packages/barocss-cad-model/src/chat/rectangularDuctProposalReview.ts',
  'packages/barocss-cad-model/src/chat/part/modelCandidate.ts',
  'packages/barocss-cad-model/src/chat/part/views.ts',
  'packages/barocss-cad-model/src/chat/part/proposals.ts',
);
if (review && !reviewBaseline) pins.push('packages/barocss-cad-model/src/chat/closedRectangularDuctEvidence.ts');
const f = await createFlow({
  name: 'exact-closed-rectangular-duct', output: process.argv[2], envFrozen: review ? 'D1763_SOURCE_FROZEN' : 'D1762_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Sweep a rectangle with a centered rectangular opening around a closed circle and edit the cavity after Open.',
  limits: ['One R20 four-quarter rail and one aligned 4 × 6 mm outer rectangle, desktop WebGPU and local L1 MCP.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import {
  brepMassProperties, checkBrep, evaluateSurface, faceGeometry, massPropertiesOf,
  measureBrepEdgeContinuity, surfaceDomain,
} from '@barocss/cad';
import { partSnapshot } from '@barocss/cad-model/engine/part';
import { digestOf } from '@barocss/cad-model/util/digest';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const { outputs: [output] } = partSnapshot(doc), { brep } = output;
const ranges = [0, .17, .5, .83, 1], at = ([lo, hi], t) => lo + (hi - lo) * t;
const faces = brep.faces.map(face => {
  const { u, v } = surfaceDomain(face.surface);
  return { name: face.name, kind: faceGeometry(face).kind,
    shell: brep.shells.findIndex(shell => shell.faces.includes(face.id)),
    samples: ranges.flatMap(s => ranges.map(t => evaluateSurface(face.surface, at(u, s), at(v, t)))) };
});
console.log(JSON.stringify({ source: brep.source, check: checkBrep(brep, { strict: true }), faces,
  shells: brep.shells.map(shell => ({ closed: shell.closed, faces: shell.faces.length })),
  counts: brep.coedges.filter(use => use.pcurve).length, seams: brep.edges.map(edge => measureBrepEdgeContinuity(brep, edge.id)),
  mass: massPropertiesOf(output), quadrature: brepMassProperties(brep, 1).volume, digest: digestOf(brep) }));
`,
});

const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const browser = () => f.page.getByRole('complementary', { name: 'Browser', exact: true });
const hud = () => f.page.getByRole('dialog', { name: 'Sweep', exact: true });
const coordinate = (i, axis) => f.sketchPanel().getByLabel(`Point ${i} ${axis}`, { exact: true });
const tag = name => /\[([^\]]+)\]/.exec(name)?.[1];
const volume = halfHeight => 2 * Math.PI * radius * (24 - 4 * halfHeight);
const near = (value, expected, tolerance = 1e-7) =>
  assert.ok(Math.abs(value - expected) <= tolerance, JSON.stringify({ value, expected, tolerance }));

async function verify(label, doc, halfHeight) {
  const read = await f.inspect(label, doc);
  assert.deepEqual(read.source, { family: 'sweep-curve', id: 'n1' });
  assert.ok(read.check.valid, read.check.issues.join('\n'));
  assert.deepEqual(read.check.counts, { bodies: 1, shells: 2, faces: 16, loops: 16, coedges: 64, edges: 32, vertices: 16 });
  assert.equal(read.check.topology[0].genus, 2);
  assert.equal(read.counts, 64);
  assert.deepEqual(read.shells, [{ closed: true, faces: 8 }, { closed: true, faces: 8 }]);
  let maximumResidual = 0;
  for (const [shell, sides] of [sideTags.outer, sideTags.holes[0]].entries()) {
    for (const id of sides) {
      const faces = read.faces.filter(face => tag(face.name) === id);
      assert.equal(faces.length, 2);
      const plane = id.endsWith('top') || id.endsWith('bottom');
      for (const face of faces) {
        assert.equal(face.shell, shell);
        assert.equal(face.kind, plane ? 'plane' : 'cylinder');
        for (const [x, y, z] of face.samples) {
          const residual = plane ? z - (id.endsWith('top') ? 1 : -1) * (shell ? halfHeight : 3)
            : Math.hypot(x, y) - (radius + (id.endsWith('outer') ? 1 : -1) * (shell ? 1 : 2));
          maximumResidual = Math.max(maximumResidual, Math.abs(residual));
        }
      }
    }
  }
  near(maximumResidual, 0);
  const groups = Array.from({ length: 2 }, () => ({ smooth: [], hard: [] }));
  for (const seam of read.seams) {
    assert.equal(seam.status, 'measured');
    const [a, b] = seam.faces.map(face => tag(face.name));
    const shell = sideTags.holes[0].includes(a) ? 1 : 0;
    assert.ok((shell ? sideTags.holes[0] : sideTags.outer).includes(b));
    const same = a === b;
    near(seam.minimumAngleDegrees, same ? 0 : 90, 1e-5);
    near(seam.maximumAngleDegrees, same ? 0 : 90, 1e-5);
    groups[shell][same ? 'smooth' : 'hard'].push(seam.edgeId);
  }
  for (const group of groups) assert.deepEqual([group.smooth.length, group.hard.length], [8, 8]);
  const { bodies } = await f.bodies();
  assert.equal(bodies.length, 1);
  for (const value of [read.mass.volume, read.quadrature, bodies[0].volume]) near(value, volume(halfHeight));
  read.mass.centroid.forEach(value => near(value, 0));
  f.report.observations.push({ label, digest: read.digest, halfHeight, volume: read.mass.volume, maximumResidual,
    chartGap: read.check.maximumPcurveGap, groups });
  return { ...read, groups };
}

async function measureInStudio(native, label) {
  await button('Iso', f.page.locator('.views')).click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await button(`Sweep along ${railName}`, browser()).click();
  const panel = f.page.getByRole('region', { name: 'Edge continuity', exact: true });
  await button('Inspect native joints', panel).click();
  const pick = panel.getByRole('combobox', { name: 'Native shared edge', exact: true });
  const result = panel.getByRole('status', { name: 'Edge continuity result', exact: true });
  for (const group of native.groups) for (const [id, angle] of [[group.smooth[0], '0°'], [group.hard[0], '90°']]) {
    await pick.selectOption(id);
    await button('Measure continuity', panel).click();
    const reading = result.locator('[data-continuity-angle]');
    await reading.waitFor();
    assert.equal(await reading.textContent(), angle);
    assert.match(await result.innerText(), /Native samples\s+8/);
  }
  await result.scrollIntoViewIfNeeded();
  await f.snapshot(label);
}

async function openAperture() {
  await f.openFeatureEditor(1);
  await f.editor().getByText('Exact closed circle', { exact: true }).waitFor();
  await button('Edit sketch', f.editor()).click();
  await f.sketchPanel().waitFor();
  await f.sketchPanel().getByLabel('Active outline', { exact: true }).selectOption('1');
}

async function setHeight(halfHeight) {
  await coordinate(1, 'Y').fill(String(-halfHeight));
  await coordinate(2, 'Y').fill(String(halfHeight));
}

async function proposalImage(request, args, error = false) {
  const reply = await request('tools/call', { name: 'query', arguments: { action: 'render', ...args } });
  assert.equal(reply.isError, error, reply.content[0].text);
  const meta = JSON.parse(reply.content[0].text);
  if (error) return { meta };
  const png = Buffer.from(reply.content.find(item => item.type === 'image').data, 'base64');
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(sha256(png), meta.imageSha256);
  assert.equal(Object.keys(meta.views).length, 4);
  return { meta, png };
}

async function reviewPendingCavity(call, request, expectedRevision, pathRevision, nativeDigest) {
  const { proposals: [proposal] } = await call('proposals', { action: 'list' });
  assert.equal(proposal.id, 'P1');
  assert.match(proposal.modelReviewRevision, /^[0-9a-f]{64}$/);
  const pins = { expectedRevision, proposal: proposal.id, expectedProposalRevision: proposal.modelReviewRevision };
  if (reviewBaseline) {
    const { meta } = await proposalImage(request, pins, true);
    assert.equal(meta.code, 'MODEL_REVIEW_REPLAY_FAILED');
    assert.match(meta.error, /native geometry.*could not be verified/i);
    f.report.observations.push({ label: 'closed-duct-review-refused', ...meta });
    return;
  }
  const { meta, png } = await proposalImage(request, pins);
  assert.equal(meta.candidate.bodySha256, nativeDigest);
  assert.equal(meta.rectangularDuct.pathRevision, pathRevision);
  assert.equal(meta.rectangularDuct.pathKind, 'closed-circle');
  assert.deepEqual(meta.rectangularDuct.caps, []);
  assert.equal(meta.rectangularDuct.exteriorSeams.length, 8);
  assert.equal(meta.rectangularDuct.interiorSeams.length, 8);
  assert.equal(new Set([...meta.rectangularDuct.exteriorSeams, ...meta.rectangularDuct.interiorSeams]).size, 16);
  const cavity = meta.rectangularDuct.closedCavity;
  assert.deepEqual([cavity.exteriorFaces.length, cavity.interiorFaces.length], [8, 8]);
  const dimensions = cavity.dimensions;
  for (const [actual, expected] of [[dimensions.pathRadius, radius], [dimensions.exterior.radial, 4], [dimensions.exterior.axial, 6],
    [dimensions.interior.radial, 2], [dimensions.interior.axial, 4], [dimensions.wall.radial, 1], [dimensions.wall.axial, 1]]) near(actual, expected);
  near(cavity.volume.analytic, volume(2));
  near(cavity.volume.native, volume(2));
  assert.equal(cavity.volume.method, 'quadrature');
  assert.ok(cavity.maximumGapMM <= 1e-8);
  const expectedReviewRevision = meta.candidate.reviewRevision;
  const faces = ['n1.side[outer]#1', 'n1.side[hole-outer]#1'];
  const lookup = { ...pins, expectedReviewRevision, action: 'inspect', faces };
  const native = await call('query', lookup);
  assert.deepEqual([native.candidate, native.imageSha256, native.rectangularDuct], [meta.candidate, meta.imageSha256, meta.rectangularDuct]);
  assert.deepEqual(native.faces.map(({ name, geometry }) => [name, geometry.kind, geometry.outwardNormal]),
    [[faces[0], 'cylinder', 'away-from-axis'], [faces[1], 'cylinder', 'toward-axis']]);
  near(native.faces[0].geometry.radius, 22);
  near(native.faces[1].geometry.radius, 21);
  assert.equal((await call('query', { ...lookup, expectedReviewRevision: '0'.repeat(64) }, true)).code, 'MODEL_REVIEW_IMAGE_STALE');
  assert.equal((await call('query', { ...lookup, orientation: 'opposite' }, true)).code, 'MODEL_REVIEW_IMAGE_STALE');
  assert.equal((await call('query', { ...lookup, expectedProposalRevision: '0'.repeat(64) }, true)).code, 'MODEL_REVIEW_PROPOSAL_STALE');
  const opposite = await proposalImage(request, { ...pins, orientation: 'opposite' });
  assert.notEqual(opposite.meta.imageSha256, meta.imageSha256);
  assert.notEqual(opposite.meta.candidate.reviewRevision, expectedReviewRevision);
  assert.equal(opposite.meta.candidate.bodySha256, nativeDigest);
  assert.deepEqual(opposite.meta.rectangularDuct, meta.rectangularDuct);
  for (const view of [...Object.values(meta.views), ...Object.values(opposite.meta.views)]) {
    assert.ok(view.visible_faces.every(name => !cavity.interiorFaces.includes(name)));
  }
  const oppositeInspection = await call('query', { ...lookup, orientation: 'opposite', expectedReviewRevision: opposite.meta.candidate.reviewRevision });
  assert.deepEqual(oppositeInspection.faces, native.faces);
  assert.deepEqual(oppositeInspection.rectangularDuct, native.rectangularDuct);
  await writeFile(join(f.output, 'closed-duct-four-views.png'), png);
  await writeFile(join(f.output, 'closed-duct-opposite-views.png'), opposite.png);
  f.report.observations.push({ label: 'closed-duct-proposal-review', revision: meta.revision, imageSha256: meta.imageSha256,
    oppositeImageSha256: opposite.meta.imageSha256, candidate: meta.candidate, rectangularDuct: meta.rectangularDuct });
  return { meta, png, lookup, native, opposite };
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
  await chooser.setFiles({ name: 'closed-rectangular-duct.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) });
  await f.same(seed);
  const original = baseline ? null : await f.save('rail-and-section');
  await button('Sketch 1', browser()).click();
  await button(railName, browser()).click();
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.command('Sweep');
  await hud().getByLabel('Representation', { exact: true }).selectOption('exact');
  await hud().locator('.hud-step').getByText('Exact closed circle', { exact: true }).waitFor();
  if (baseline) {
    await hud().locator('.status').filter({ hasText: /^refused$/ }).waitFor();
    await hud().getByText('The closed-circle rectangular Sweep needs a solid section', { exact: true }).waitFor();
    assert.ok(await button('Apply', hud()).isDisabled());
    await f.same(seed);
    await f.snapshot('01-opening-refused');
    return;
  }
  await hud().locator('.status').filter({ hasText: /^preview$/ }).waitFor();
  await f.snapshot('01-cavity-preview');
  await button('Apply', hud()).click();
  await f.changed(seed);
  const initial = (await f.snapshot('02-sweep-applied')).doc;
  assert.deepEqual([initial.nodes[1].mode, initial.nodes[1].path], ['exact', path]);
  const before = await verify('initial-native', initial, 2);
  await measureInStudio(before, '03-native-joints');

  await openAperture();
  assert.equal(await coordinate(2, 'Y').inputValue(), '2');
  await coordinate(1, 'X').fill('-.75');
  await coordinate(3, 'X').fill('1.25');
  await f.page.locator('.topbar button.finish').click();
  await f.waitToast(/centered rectangular opening/i);
  await f.same(initial);
  await f.snapshot('04-eccentric-opening-refused');
  await coordinate(1, 'X').fill('-1');
  await coordinate(3, 'X').fill('1');
  await setHeight(3);
  await f.page.locator('.topbar button.finish').click();
  await f.waitToast(/insufficient wall clearance/i);
  await f.same(initial);
  await f.snapshot('05-wall-contact-refused');
  await setHeight(1);
  const edited = (await f.finishSketch('06-aperture-edited')).doc;
  assert.deepEqual(edited.nodes[0].holes[0], holeAt(1));
  assert.deepEqual(edited.nodes[0].sideTags, sideTags);
  assert.deepEqual(edited.nodes[1], initial.nodes[1]);
  const after = await verify('edited-native', edited, 1);
  await f.undo();
  await f.same(initial);
  await f.redo();
  await f.same(edited);
  const saved = await f.save('closed-rectangular-duct');
  const reopened = (await f.freshOpen(saved.file, edited, '07-fresh-open')).doc;
  assert.equal((await verify('reopened-native', reopened, 1)).digest, after.digest);
  await button('Section view').click();
  await button('Section across Y').click();
  await button('Front', f.page.locator('.views')).click();
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await f.page.waitForFunction(() => {
    const section = window.__studioSection();
    return section.gpu && section.mode === 'plane' && section.planes[0].axis === 'y' && Math.abs(section.planes[0].offset) < 1e-6;
  });
  await f.same(reopened);
  await f.snapshot('08-reopened-cavity-section', () => ({ section: window.__studioSection() }));
  await button('Section view').click();
  await openAperture();
  await setHeight(2);
  const restored = (await f.finishSketch('09-aperture-restored')).doc;
  assert.deepEqual(restored.nodes[0].holes[0], holeAt(2));
  assert.equal((await verify('restored-native', restored, 2)).digest, before.digest);

  const file = join(f.output, 'closed-duct-proposal.bcad');
  await copyFile(original.file, file);
  const session = { app: f.app, output: f.output, clientName: f.name };
  const reviewed = await withMcpSession(session, file, 'closed-duct', async (call, request) => {
    const expectedRevision = await currentPartRevision(call);
    const description = await call('describe', { command: 'sweep-curve' });
    assert.match(description.values.sketch, /A closed circle [^.]*aligned rectangle with an optional centered rectangular opening/);
    const rail = (await call('query', { action: 'summary' })).direct_curves.find(curve => curve.id === railId);
    assert.ok(rail?.revision);
    const op = pathRevision => ({ tool: 'features', args: { action: 'command', command: 'sweep-curve', expectedRevision,
      values: { sketch: 'n0', path: rail.id, pathRevision, representation: 'exact' } } });
    const bytes = await readFile(file);
    const stale = await call('features', { action: 'batch', dryRun: true, ops: [op('0'.repeat(64))] }, true);
    assert.match(stale.error, /path geometry changed/);
    const dry = await call('features', { action: 'batch', dryRun: true, ops: [op(rail.revision)] });
    near(dry.change.volume, volume(2), .001);
    assert.deepEqual(await readFile(file), bytes);
    const staged = await call('proposals', { action: 'propose', title: 'Exact closed rectangular duct', ops: [op(rail.revision)] });
    assert.deepEqual([staged.proposal, staged.applied], ['P1', false]);
    if (!review) return;
    const pendingBytes = await readFile(file);
    const result = await reviewPendingCavity(call, request, expectedRevision, rail.revision, before.digest);
    assert.deepEqual(await readFile(file), pendingBytes);
    return result;
  });
  const pending = JSON.parse(await readFile(file));
  assert.deepEqual([pending.nodes, pending.outputs], [seed.nodes, seed.outputs]);
  if (reviewed) await checkChangedDuctPath(session, pending, reviewed, path.controlPoints);
  await f.freshOpen(file, pending, '10-proposal-pending');
  await button('Chat').first().click();
  const card = f.page.getByRole('listitem', { name: 'Proposal P1', exact: true });
  await button('Preview', card).click();
  await button('Hide', card).waitFor();
  await f.same(pending);
  if (reviewed) await f.snapshot('10-candidate-preview');
  await button('Accept', card).click();
  await f.changed(pending);
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  const approved = (await f.snapshot('11-proposal-approved')).doc;
  assert.deepEqual([approved.nodes[1].mode, approved.nodes[1].path], ['exact', path]);
  assert.equal((await verify('approved-native', approved, 2)).digest, before.digest);
  if (review) {
    const approvedSave = await f.save('closed-duct-reviewed');
    await f.freshOpen(approvedSave.file, approved, '12-approved-fresh-open');
    assert.equal((await verify('approved-reopened-native', approvedSave.doc, 2)).digest, before.digest);
    if (reviewed) await withMcpSession(session, approvedSave.file, 'closed-duct-reviewed', async (call, request) => {
      const expectedRevision = await currentPartRevision(call);
      assert.equal(expectedRevision, reviewed.meta.revision);
      assert.deepEqual((await proposalImage(request, { expectedRevision })).png, reviewed.png);
      assert.deepEqual((await proposalImage(request, { expectedRevision, orientation: 'opposite' })).png, reviewed.opposite.png);
      const current = await call('query', { action: 'inspect', faces: reviewed.lookup.faces, expectedRevision });
      assert.deepEqual(current.faces, reviewed.native.faces);
      assert.equal((await call('query', { ...reviewed.lookup, expectedRevision }, true)).code, 'MODEL_REVIEW_UNAVAILABLE');
    });
  }
});
