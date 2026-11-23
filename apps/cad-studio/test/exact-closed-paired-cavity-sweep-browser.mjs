import assert from 'node:assert/strict';
import { copyFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { currentPartRevision, withMcpSession } from './mcp-browser-session.mjs';

const baseline = process.argv.includes('--expect-refused');
const railId = 'circle-rail', railName = 'Closed circular rail';
const path = { degree: 2, knots: [0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4],
  controlPoints: [[20, 0, 0], [20, 20, 0], [0, 20, 0], [-20, 20, 0], [-20, 0, 0],
    [-20, -20, 0], [0, -20, 0], [20, -20, 0], [20, 0, 0]],
  weights: Array.from({ length: 9 }, (_, index) => index % 2 === 0 ? 1 : Math.SQRT1_2),
};
const hole = (center, halfHeight) => [[-1, center - halfHeight], [-1, center + halfHeight], [1, center + halfHeight], [1, center - halfHeight]]
  .map(start => ({ kind: 'line', start }));
const sideTags = { outer: ['top', 'outer', 'bottom', 'inner'],
  holes: [['a-inner', 'a-bottom', 'a-outer', 'a-top'], ['b-inner', 'b-bottom', 'b-outer', 'b-top']] };
const seed = { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 1,
  nodes: [
    { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [-2, -5], max: [2, 5], holes: [hole(-2, 1), hole(2, 1)], sideTags },
  ], outputs: {},
  direct: { sources: { rail: `@model rail { version:0; length-unit:mm;
    @curve #${railId} { type:nurbs; degree:2; knots:${JSON.stringify(path.knots)};
      control-points:${JSON.stringify(path.controlPoints)}; weights:${JSON.stringify(path.weights)}; } }` },
    objects: [{ id: railId, name: railName, source: 'rail', geometry: railId }] },
};
const pins = [
  'packages/barocss-cad/src/brep/exact-sweep.ts', 'packages/barocss-cad/src/features/revolve.ts',
  'packages/barocss-cad-model/src/app/profileCommands.ts', 'packages/barocss-cad-model/src/engine/errors.ts',
  'packages/barocss-cad-model/src/chat/part/features.ts', 'apps/cad-studio/test/exact-closed-paired-cavity-sweep-browser.mjs',
];
const f = await createFlow({
  name: 'exact-closed-paired-cavity-sweep', output: process.argv[2], envFrozen: 'D1770_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Sweep two separate, radially centered rectangular cavities around a closed exact circle.',
  limits: ['One R20 rail, a 4 × 10 mm rectangle and two vertically separated cavities on the default frame. Desktop WebGPU.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep, faceGeometry, massPropertiesOf, measureBrepEdgeContinuity } from '@barocss/cad';
import { partSnapshot } from '@barocss/cad-model/engine/part';
import { digestOf } from '@barocss/cad-model/util/digest';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const { outputs: [output] } = partSnapshot(doc), { brep } = output;
const check = checkBrep(brep, { strict: true });
const shellOf = id => brep.shells.findIndex(shell => shell.faces.includes(id));
const faces = brep.faces.map(face => ({ name: face.name, shell: shellOf(face.id), geometry: faceGeometry(face) }));
const joints = brep.edges.map(edge => {
  const uses = brep.coedges.filter(use => use.edge === edge.id);
  const owner = use => brep.faces.find(face => face.loops.includes(use.loop));
  return { ...measureBrepEdgeContinuity(brep, edge.id), degree: edge.curve.degree, shells: uses.map(use => shellOf(owner(use).id)) };
});
console.log(JSON.stringify({ source: brep.source, check, faces, joints, mass: massPropertiesOf(output),
  quadrature: brepMassProperties(brep, 1), shells: brep.shells.map(shell => ({ closed: shell.closed, faces: shell.faces.length })),
  chartCount: brep.coedges.filter(use => use.pcurve).length, digest: digestOf(brep) }));
`,
});
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const browser = () => f.page.getByRole('complementary', { name: 'Browser', exact: true });
const hud = () => f.page.getByRole('dialog', { name: 'Sweep', exact: true });

const near = (actual, expected, tolerance = 1e-7) =>
  assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance, JSON.stringify({ actual, expected, tolerance }));
const coordinate = (index, axis) => f.sketchPanel().getByLabel(`Point ${index} ${axis}`, { exact: true });
const volume = halfHeight => 40 * Math.PI * (36 - 4 * halfHeight);

async function verify(label, doc, halfHeight) {
  const native = await f.inspect(label, doc);
  assert.deepEqual(native.source, { family: 'sweep-curve', id: 'n1' });
  assert.ok(native.check.valid, native.check.issues.join('\n'));
  assert.deepEqual(native.check.counts, { bodies: 1, shells: 3, faces: 24, loops: 24, coedges: 96, edges: 48, vertices: 24 });
  assert.deepEqual(native.shells, Array.from({ length: 3 }, () => ({ closed: true, faces: 8 })));
  assert.equal(native.check.topology[0].genus, 3);
  assert.equal(native.chartCount, 96);
  assert.ok(native.check.maximumPcurveGap < 1e-8);
  const groups = [];
  for (const [shell, tags] of [sideTags.outer, ...sideTags.holes].entries()) {
    const faces = native.faces.filter(face => face.shell === shell);
    for (const tag of tags) assert.equal(faces.filter(face => face.name.includes(`[${tag}]`)).length, 2);
    const planes = faces.filter(face => face.geometry.kind === 'plane');
    const cylinders = faces.filter(face => face.geometry.kind === 'cylinder');
    assert.equal(planes.length, 4);
    assert.equal(cylinders.length, 4);
    const expectedZ = [[-5, 5], [2 - halfHeight, 2 + halfHeight], [-3, -1]][shell];
    const expectedR = shell ? [19, 21] : [18, 22];
    for (const [values, expected] of [[planes.map(face => face.geometry.o[2]), expectedZ],
      [cylinders.map(face => face.geometry.r), expectedR]]) {
      values.sort((a, b) => a - b).forEach((value, index) => near(value, expected[Math.floor(index / 2)]));
    }
    const joints = native.joints.filter(joint => joint.shells[0] === shell);
    const smooth = joints.filter(joint => joint.degree === 1), hard = joints.filter(joint => joint.degree === 2);
    assert.deepEqual([smooth.length, hard.length], [8, 8]);
    for (const joint of joints) {
      assert.deepEqual(joint.shells, [shell, shell]);
      assert.equal(joint.status, 'measured');
      near(joint.maximumAngleDegrees, joint.degree === 1 ? 0 : 90);
    }
    groups.push({ smooth: smooth[0].edgeId, hard: hard[0].edgeId });
  }
  const centerZ = halfHeight === .5 ? 2 / 17 : 0;
  for (const props of [native.mass, native.quadrature]) {
    near(props.volume, volume(halfHeight));
    props.centroid.forEach((value, index) => near(value, index === 2 ? centerZ : 0));
  }
  f.report.observations.push({ label, volume: native.mass.volume, centroid: native.mass.centroid, digest: native.digest,
    chartGap: native.check.maximumPcurveGap, groups });
  return { digest: native.digest, groups };
}

async function measureInStudio({ groups }, label) {
  await button('Iso', f.page.locator('.views')).click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await button(`Sweep along ${railName}`, browser()).click();
  const panel = f.page.getByRole('region', { name: 'Edge continuity', exact: true });
  await button('Inspect native joints', panel).click();
  const pick = panel.getByRole('combobox', { name: 'Native shared edge', exact: true });
  const result = panel.getByRole('status', { name: 'Edge continuity result', exact: true });
  for (const { smooth, hard } of groups) {
    for (const [id, angle] of [[smooth, '0°'], [hard, '90°']]) {
      await pick.selectOption(id);
      await button('Measure continuity', panel).click();
      const reading = result.locator('[data-continuity-angle]');
      await reading.waitFor();
      assert.equal(await reading.textContent(), angle);
      assert.match(await result.innerText(), /Native samples\s+8/);
    }
  }
  await result.scrollIntoViewIfNeeded();
  await f.snapshot(label);
}

async function openFirstCavity() {
  await f.openFeatureEditor(1);
  await f.editor().getByText('Exact closed circle', { exact: true }).waitFor();
  await button('Edit sketch', f.editor()).click();
  await f.sketchPanel().getByLabel('Active outline', { exact: true }).selectOption('1');
}

async function setBounds(low, high) {
  await coordinate(1, 'Y').fill(String(low));
  await coordinate(2, 'Y').fill(String(high));
}

async function showSection(doc) {
  await button('Section view').click();
  await button('Section across Y').click();
  await button('Front', f.page.locator('.views')).click();
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await f.page.waitForFunction(() => {
    const section = window.__studioSection();
    return section.gpu && section.mode === 'plane' && section.planes[0].axis === 'y' && Math.abs(section.planes[0].offset) < 1e-6;
  });
  await f.same(doc);
  await f.snapshot('08-reopened-two-cavity-section', () => ({ section: window.__studioSection() }));
  await button('Section view').click();
}

async function approveWithAgent(original, expected) {
  const file = join(f.output, 'paired-cavities-agent-proposal.bcad');
  await copyFile(original.file, file);
  await withMcpSession({ app: f.app, output: f.output, clientName: f.name }, file, 'paired-cavity-proposal', async call => {
    const revision = await currentPartRevision(call);
    const rails = (await call('query', { action: 'summary' })).direct_curves;
    const rail = rails.find(curve => curve.id === railId);
    assert.ok(rail?.revision);
    const description = await call('describe', { command: 'sweep-curve' });
    assert.match(description.values.sketch, /two rectangular openings.*radially centered.*axially separated/i);
    const op = { tool: 'features', args: { action: 'command', command: 'sweep-curve', expectedRevision: revision,
      values: { sketch: 'n0', path: railId, pathRevision: rail.revision, representation: 'exact' } } };
    const before = await readFile(file);
    const dry = await call('features', { action: 'batch', dryRun: true, ops: [op] });
    near(dry.change.volume, volume(1), .001);
    assert.deepEqual(await readFile(file), before);
    const staged = await call('proposals', { action: 'propose', title: 'Sweep the exact two-cavity section', ops: [op] });
    assert.deepEqual([staged.proposal, staged.applied], ['P1', false]);
  });
  const pending = JSON.parse(await readFile(file));
  assert.deepEqual([pending.nodes, pending.outputs], [seed.nodes, seed.outputs]);
  await f.freshOpen(file, pending, '10-two-cavity-proposal-open');
  await button('Chat').first().click();
  const card = f.page.getByRole('listitem', { name: 'Proposal P1', exact: true });
  await button('Preview', card).click();
  await button('Hide', card).waitFor();
  await f.same(pending);
  await f.snapshot('11-two-cavity-proposal-preview');
  await button('Accept', card).click();
  await f.changed(pending);
  const approved = (await f.snapshot('12-two-cavity-proposal-approved')).doc;
  assert.equal((await verify('approved-native', approved, 1)).digest, expected);
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
  await chooser.setFiles({ name: 'two-cavity-section.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) });
  await f.same(seed);
  const original = baseline ? null : await f.save('paired-cavity-section');
  await button('Sketch 1', browser()).click();
  await button(railName, browser()).click();
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.command('Sweep');
  await hud().getByLabel('Representation', { exact: true }).selectOption('exact');
  await hud().locator('.hud-step').getByText('Exact closed circle', { exact: true }).waitFor();
  if (baseline) {
    await hud().locator('.status').filter({ hasText: /^refused$/ }).waitFor();
    await hud().getByText('This Sweep needs a centered rectangular opening', { exact: true }).waitFor();
    assert.ok(await button('Apply', hud()).isDisabled());
    await f.same(seed);
    await f.snapshot('01-two-cavities-refused');
    return;
  }
  await hud().locator('.status').filter({ hasText: /^preview$/ }).waitFor();
  await f.snapshot('01-two-cavities-preview');
  await button('Apply', hud()).click();
  await f.changed(seed);
  const initial = (await f.snapshot('02-two-cavities-applied')).doc;
  assert.deepEqual([initial.nodes[1].mode, initial.nodes[1].path], ['exact', path]);
  const before = await verify('initial-native', initial, 1);
  await measureInStudio(before, '03-three-shell-native-joints');

  await openFirstCavity();
  await coordinate(1, 'X').fill('-.75');
  await coordinate(3, 'X').fill('1.25');
  await f.page.locator('.topbar button.finish').click();
  await f.waitToast(/center both openings across the radial width/i);
  await f.same(initial);
  await f.snapshot('04-eccentric-cavity-refused');
  await f.dismissToasts();
  await coordinate(1, 'X').fill('-1');
  await coordinate(3, 'X').fill('1');
  await setBounds(-3, 1);
  await f.page.locator('.topbar button.finish').click();
  await f.waitToast(/axial web|touch|intersect/i);
  await f.same(initial);
  await f.snapshot('05-touching-cavities-refused');
  await f.dismissToasts();
  await setBounds(-2.5, -1.5);
  const edited = (await f.finishSketch('06-first-cavity-edited')).doc;
  assert.deepEqual(edited.nodes[0].holes, [hole(-2, .5), hole(2, 1)]);
  assert.deepEqual(edited.nodes[0].sideTags, sideTags);
  assert.deepEqual(edited.nodes[1], initial.nodes[1]);
  const after = await verify('edited-native', edited, .5);
  await f.undo();
  await f.same(initial);
  await f.redo();
  await f.same(edited);
  const saved = await f.save('two-cavity-closed-sweep');
  const reopened = (await f.freshOpen(saved.file, edited, '07-two-cavities-fresh-open')).doc;
  assert.equal((await verify('reopened-native', reopened, .5)).digest, after.digest);
  await showSection(reopened);
  await openFirstCavity();
  await setBounds(-3, -1);
  const restored = (await f.finishSketch('09-two-cavity-height-restored')).doc;
  assert.equal((await verify('restored-native', restored, 1)).digest, before.digest);
  await approveWithAgent(original, before.digest);
});
