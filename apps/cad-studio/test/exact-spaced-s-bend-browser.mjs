import assert from 'node:assert/strict';
import { copyFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { currentPartRevision, withMcpSession } from './mcp-browser-session.mjs';

const baseline = process.argv.includes('--expect-refused');
const elbow = process.argv.includes('--annular-elbow');
const lineArc = process.argv.includes('--annular-line-arc');
const arcLine = process.argv.includes('--arc-line');
assert.ok(!arcLine || (!lineArc && !elbow));
const singleBend = elbow || lineArc || arcLine;
const singleJoin = lineArc || arcLine;
const tailLength = elbow ? 14 : 0;
const annular = elbow || lineArc || process.argv.includes('--annular');
const sameTurn = process.argv.includes('--same-turn');
const turn = sameTurn ? -1 : 1;
const endY = 12 + turn * 18;
const leadBend = [[-10, 0, 0], [-5, 0, 0], [0, 0, 0], [20, 0, 0], [20, 20, 0]];
const path = singleBend ? { degree: 2, knots: elbow ? [0, 0, 0, 1, 1, 2, 2, 3, 3, 3] : [0, 0, 0, 1, 1, 2, 2, 2],
  controlPoints: elbow ? [...leadBend, [20, 27, 0], [20, 34, 0]] : arcLine ? leadBend.toReversed() : leadBend,
  weights: arcLine ? [1, Math.SQRT1_2, 1, 1, 1] : [1, 1, 1, Math.SQRT1_2, 1, ...(elbow ? [1, 1] : [])] } : { degree: 2, knots: [0, 0, 0, 1, 1, 2, 2, 3, 3, 3],
  controlPoints: [[0, 0, 0], [0, 12, 0], [12, 12, 0], [16, 12, 0], [20, 12, 0], [38, 12, 0], [38, endY, 0]],
  weights: [1, Math.SQRT1_2, 1, 1, 1, Math.SQRT1_2, 1] };
const kink = path.controlPoints.map((point, i) => elbow && i >= 5 ? [20 + (i - 4) * 7, 20, 0]
  : (lineArc && i < 2) || (arcLine && i > 2) ? [point[0], point[0], 0] : !singleBend && i === 5 ? [20, endY, 0] : point);
const mark = (id, points) => `@curve #${id} { type:nurbs; degree:2; knots:${JSON.stringify(path.knots)};
  control-points:${JSON.stringify(points)}; weights:${JSON.stringify(path.weights)}; }`;
const rail = arcLine ? 'Arc and straight rail' : lineArc ? 'Annular line and arc rail' : elbow ? 'Annular elbow rail' : sameTurn ? 'Spaced same-turn rail' : 'Spaced S-bend rail';
const representation = arcLine ? 'Exact arc and line' : lineArc ? 'Exact line and arc' : elbow ? 'Exact line–arc–line' : 'Exact arc–line–arc';
const stations = singleBend ? [{ axis: 0, centre: [0, 0, 0] }, ...(elbow ? [{ axis: 1, centre: [20, 20, 0] }] : [])]
  : [{ axis: 0, centre: [12, 12, 0] }, { axis: 0, centre: [20, 12, 0] }];
const forwardMouths = singleBend ? [{ name: 'start', view: 'Left', axis: 0, sign: -1, centre: [-10, 0, 0] },
  { name: 'end', view: 'Back', axis: 1, sign: 1, centre: [20, 20 + tailLength, 0] }]
  : [{ name: 'start', view: 'Front', axis: 1, sign: -1, centre: [0, 0, 0] },
    { name: 'end', view: sameTurn ? 'Front' : 'Back', axis: 1, sign: turn, centre: [38, endY, 0] }];
const mouths = arcLine ? forwardMouths.toReversed().map((mouth, i) => ({ ...mouth, name: i ? 'end' : 'start' })) : forwardMouths;
const disk = { id: 'n0', kind: 'sketch', profile: 'circle', center: [0, 0], radius: 2, sideTags: { outer: ['e0'] } };
const bore = { kind: 'arc', start: [{ parameter: 'BoreRadius' }, 0], center: [0, 0], direction: 'cw' };
const profile = annular ? { ...disk, holes: [[bore]], sideTags: { ...disk.sideTags, holes: [['bore']] } } : disk;
const recipe = arcLine ? 'arc-line-sweep' : lineArc ? 'annular-line-arc' : 'spaced-s-bend';
const kinkName = arcLine ? 'Kinked arc and line rail' : lineArc ? 'Kinked line and arc rail' : 'Kinked spaced rail';
const seed = { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: annular ? { BoreRadius: 1 } : {},
  nextId: 1, nodes: [profile], outputs: {},
  direct: { sources: { rail: `@model rail { version:0; length-unit:mm; ${mark('spaced', path.controlPoints)} ${mark('kink', kink)} }` },
    objects: [{ id: 'spaced', name: rail, source: 'rail', geometry: 'spaced' },
      { id: 'kink', name: kinkName, source: 'rail', geometry: 'kink' }] } };
const pins = ['packages/barocss-cad/src/brep/exact-sweep.ts', 'packages/barocss-cad-model/src/app/profileCommands.ts',
  'packages/barocss-cad-model/src/engine/errors.ts', 'packages/barocss-cad-model/src/chat/part/features.ts'];
const f = await createFlow({
  name: arcLine ? 'exact-arc-line-sweep' : lineArc ? 'exact-annular-line-arc' : elbow ? 'exact-annular-elbow' : `exact-spaced-${annular ? 'annular-' : ''}${sameTurn ? 'same-turn' : 's-bend'}`, output: process.argv[2],
  envFrozen: arcLine ? 'D1750_SOURCE_FROZEN' : lineArc ? 'D1744_SOURCE_FROZEN' : elbow ? 'D1743_SOURCE_FROZEN' : sameTurn && annular ? 'D1729_SOURCE_FROZEN'
    : sameTurn ? 'D1725_SOURCE_FROZEN' : annular ? 'D1723_SOURCE_FROZEN' : 'D1721_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: arcLine ? 'Sweep a circle along a quarter bend and straight exit with caps in travel order.'
    : singleBend ? 'Sweep a concentric annulus through a tangent quarter bend on a straight lead.'
    : `Sweep a ${annular ? 'concentric annulus' : 'disk'} along two tangent bends separated by a native straight span.`,
  limits: [arcLine ? 'R20 quarter bend and 10 mm straight exit with one circular disk or concentric bore, desktop WebGPU and local MCP.'
    : singleBend ? `R20 quarter bend, 10 mm straight lead${elbow ? ' and 14 mm tail' : ''}, one circular concentric bore, desktop WebGPU and local MCP.`
    : `Coplanar R12/R18 ${sameTurn ? 'same-turn' : 'opposite'} quarter circles and 8 mm straight. One circular ${annular ? 'concentric bore' : 'disk'}. Desktop WebGPU and local MCP.`],
  ...(!baseline && { inspectorSource: `
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep, curveDomain, evaluateCurve, faceGeometry, massPropertiesOf, measureBrepEdgeContinuity } from '@barocss/cad';
import { partSnapshot } from '@barocss/cad-model/engine/part';
import { digestOf } from '@barocss/cad-model/util/digest';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const { outputs: [output] } = partSnapshot(doc);
const { brep } = output;
const uses = new Map(brep.coedges.map(use => [use.id, use]));
const faces = new Map(brep.faces.flatMap(face => face.loops.map(loop => [loop, face])));
const edges = new Map(brep.edges.map(edge => [edge.id, edge]));
const isBore = face => face.name.includes('.side[bore]');
const samples = curve => {
  const [a,b] = curveDomain(curve);
  return [0,.15,.37,.5,.64,.85,1].map(t => evaluateCurve(curve, a + (b-a)*t));
};
const joints = ${JSON.stringify(stations)}.map(({ axis, centre }) => brep.edges.filter(edge =>
  edge.curve.controlPoints.every(point => Math.abs(point[axis] - centre[axis]) < 1e-7)).map(edge => {
  const edgeUses = brep.coedges.filter(use => use.edge === edge.id);
  return { id: edge.id, degree: edge.curve.degree, bindings: edgeUses.map(use => !!use.pcurve),
    reciprocal: edgeUses.every(use => uses.get(use.twin)?.twin === use.id && uses.get(use.twin)?.sense !== use.sense),
    geometry: edgeUses.map(use => faceGeometry(faces.get(use.loop)).kind),
    bore: edgeUses.map(use => isBore(faces.get(use.loop))),
    points: samples(edge.curve),
    result: measureBrepEdgeContinuity(brep,edge.id,{curvature:true}) };
}));
const caps = brep.faces.flatMap(face => {
  const geometry = faceGeometry(face);
  if (geometry.kind !== 'plane') return [];
  const loops = face.loops.map(id => brep.loops.find(loop => loop.id === id));
  return [{name:face.name, geometry, loops:loops.map(loop => ({kind:loop.kind, rims:loop.coedges.map(id => {
    const edge = edges.get(uses.get(id).edge);
    return { name: edge.name, points: samples(edge.curve) };
  })}))}];
});
const outerSurfaces = brep.faces.filter(face => !isBore(face) && faceGeometry(face).kind !== 'plane')
  .map(face => [face.name, digestOf(face.surface)]);
console.log(JSON.stringify({ check: checkBrep(brep,{strict:true}), joints, caps, outerSurfaces,
  mass: massPropertiesOf(output), independent: brepMassProperties(brep,1), digest: digestOf(brep) }));
` }),
});

const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const browser = () => f.page.getByRole('complementary', { name: 'Browser', exact: true });
const hud = () => f.page.getByRole('dialog', { name: 'Sweep', exact: true });
const status = value => hud().locator('.status').filter({ hasText: new RegExp(`^${value}$`) });
const firstLength = 6 * Math.PI, secondLength = 9 * Math.PI, run = 8;
const pathLength = singleBend ? 10 + tailLength + 10 * Math.PI : firstLength + run + secondLength;
const volume = (radius, inner = 0) => Math.PI * (radius ** 2 - inner ** 2) * pathLength;
const centroid = (radius, inner) => {
  const innerMoment = bend => 2 * (bend + (radius ** 2 + inner ** 2) / (4 * bend)) / Math.PI;
  if (singleBend) {
    const m = innerMoment(20), arc = 10 * Math.PI;
    return [(-50 + arc * m + tailLength * 20) / pathLength, (arc * (20 - m) + tailLength * (20 + tailLength / 2)) / pathLength, 0];
  }
  const first = innerMoment(12), second = innerMoment(18);
  return [(firstLength * (12 - first) + run * 16 + secondLength * (20 + second)) / pathLength,
    (firstLength * first + run * 12 + secondLength * (endY - turn * second)) / pathLength, 0];
};
const near = (value, target, tolerance = 1e-7) =>
  assert.ok(Number.isFinite(value) && Math.abs(value - target) <= tolerance, JSON.stringify({ value, target, tolerance }));

async function verify(label, doc, radius) {
  const native = await f.inspect(label, doc);
  const inner = annular ? doc.parameters.BoreRadius : 0;
  assert.ok(native.check.valid, native.check.issues.join('\n'));
  assert.deepEqual(native.check.topology.map(body => body.genus), [annular ? 1 : 0]);
  assert.deepEqual(native.check.counts, singleJoin
    ? annular
      ? { bodies: 1, shells: 1, faces: 10, loops: 12, coedges: 40, edges: 20, vertices: 12 }
      : { bodies: 1, shells: 1, faces: 6, loops: 6, coedges: 20, edges: 10, vertices: 6 }
    : annular
    ? { bodies: 1, shells: 1, faces: 14, loops: 16, coedges: 56, edges: 28, vertices: 16 }
    : { bodies: 1, shells: 1, faces: 8, loops: 8, coedges: 28, edges: 14, vertices: 8 });
  assert.equal(native.caps.length, 2);
  for (const { name, axis, sign, centre } of mouths) {
    const cap = native.caps.find(face => face.name === 'n1.' + name);
    assert.ok(cap, name);
    cap.geometry.n.forEach((value, i) => near(value, i === axis ? sign : 0));
    assert.deepEqual(cap.loops.map(loop => loop.kind), annular ? ['outer', 'inner'] : ['outer']);
    for (const loop of cap.loops) {
      assert.equal(loop.rims.length, 2);
      for (const rim of loop.rims) {
        if (arcLine) assert.ok(rim.name.split('|').includes('n1.' + name), rim.name);
        for (const p of rim.points) {
          near(p[axis], centre[axis]);
          near(Math.hypot(p[1 - axis] - centre[1 - axis], p[2]), loop.kind === 'outer' ? radius : inner);
        }
      }
    }
  }
  assert.deepEqual(native.joints.map(joint => joint.length), stations.map(() => annular ? 4 : 2));
  native.joints.forEach((joint, index) => {
    const { axis, centre } = stations[index];
    assert.equal(joint.filter(edge => edge.bore[0]).length, annular ? 2 : 0);
    for (const edge of joint) {
      assert.equal(edge.degree, 2);
      assert.deepEqual(edge.bindings, [true, true]);
      assert.equal(edge.reciprocal, true);
      assert.ok(edge.geometry.every(kind => kind !== 'plane'));
      assert.equal(edge.bore[0], edge.bore[1]);
      assert.equal(edge.result.status, 'measured');
      assert.equal(edge.result.curvature.status, 'measured');
      assert.ok(edge.result.curvature.maximumDifference > 0);
      near(edge.result.maximumAngleDegrees, 0, 1e-6);
      for (const p of edge.points) {
        near(p[axis], centre[axis]);
        near(Math.hypot(p[1 - axis] - centre[1 - axis], p[2]), edge.bore[0] ? inner : radius);
      }
    }
  });
  const { bodies } = await f.bodies();
  assert.equal(bodies.length, 1);
  const centre = centroid(radius, inner);
  for (const result of [native.mass, native.independent, bodies[0]]) {
    near(result.volume, volume(radius, inner), 2e-6);
    result.centroid.forEach((value, axis) => near(value, centre[axis], 2e-6));
  }
  f.report.observations.push({ label, radius, inner, wall: annular ? radius - inner : null, volume: native.mass.volume, digest: native.digest,
    centre, gap: native.check.maximumPcurveGap, angles: native.joints.map(edges => edges.map(edge => edge.result.maximumAngleDegrees)) });
  return native;
}

async function studyJoints(native, label) {
  await button('Iso', f.page.locator('.views')).click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await button('Sweep along ' + rail, browser()).click();
  const panel = f.page.getByRole('region', { name: 'Edge continuity', exact: true });
  await button('Inspect native joints', panel).click();
  const options = panel.getByRole('combobox', { name: 'Native shared edge', exact: true });
  const result = panel.getByRole('status', { name: 'Edge continuity result', exact: true });
  for (const edge of native.joints.flat()) {
    await options.selectOption(edge.id);
    await button('Measure continuity', panel).click();
    const angle = result.locator('[data-continuity-angle]');
    await angle.waitFor();
    assert.equal(await angle.textContent(), '0°');
    assert.match(await result.innerText(), /Native samples\s+8/);
  }
  await result.scrollIntoViewIfNeeded();
  await f.snapshot(label);
}

async function inspectBoreMouths(inner) {
  const cube = f.page.getByRole('group', { name: 'View cube', exact: true });
  const middle = (inner + 2) / 2;
  for (const { name, view, axis, sign, centre } of mouths) {
    const [x, y] = centre;
    f.phase = 'Inspect the open ' + name + ' bore mouth';
    await button('View cube directions', cube).click();
    await f.page.getByRole('menuitem', { name: view, exact: true }).click();
    if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
    await f.page.getByTitle('Frame all (F)', { exact: true }).click();
    await f.page.waitForFunction(([x, y, axis, direction]) => {
      const a = window.__studioScreenOf([x, y, 0]), b = window.__studioScreenOf(axis === 0 ? [x + 1, y, 0] : [x, y + 1, 0]);
      return document.querySelector('.view-cube .vc-label')?.textContent === direction && Math.hypot(a[0] - b[0], a[1] - b[1]) < .01;
    }, [x, y, axis, view.toUpperCase()]);
    const hits = await f.page.evaluate(([x, y, middle]) => ({
      opening: window.__studioSurfacePoint([x, y, 0]), land: window.__studioSurfacePoint([x, y, middle]),
    }), [x, y, middle]);
    assert.ok(hits.land, JSON.stringify(hits));
    near(hits.land[axis], centre[axis], 1e-4);
    assert.ok(!hits.opening || sign * (centre[axis] - hits.opening[axis]) > .25, JSON.stringify(hits));
    const label = `09-${name}-bore-opening`;
    f.report.observations.push({ label, ...hits });
    await f.snapshot(label);
  }
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
  await chooser.setFiles({ name: recipe + '-input.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) });
  await f.same(seed);
  await f.snapshot('01-opened-spaced-rail');
  const source = baseline ? null : await f.save('spaced-rail-source');
  await button('Sketch 1', browser()).click();
  await button(baseline ? rail : kinkName, browser()).click();
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.command('Sweep');
  await hud().getByLabel('Representation', { exact: true }).selectOption('exact');
  await status('refused').waitFor();
  assert.ok(await button('Apply', hud()).isDisabled());
  await f.same(seed);
  const refusal = await hud().innerText();
  const baselineRefusal = arcLine ? /outside the exact Sweep range/i : sameTurn && !annular ? /outside the arc–line–arc Sweep range/i
    : annular ? /needs a circular disk/i : /outside the exact Sweep range/i;
  assert.match(refusal, baseline ? baselineRefusal : /tangent/i);
  await f.snapshot(baseline ? '02-baseline-spaced-refused' : '02-kink-refused');
  if (baseline) return;

  f.phase = 'Apply a circular Exact Sweep on the spaced rail';
  await button(rail, browser()).click();
  await hud().locator('.hud-step').getByText(representation, { exact: true }).waitFor();
  await status('preview').waitFor();
  await f.snapshot('03-spaced-exact-preview');
  await button('Apply', hud()).click();
  await f.changed(seed);
  const accepted = (await f.snapshot('04-spaced-s-bend-applied')).doc;
  assert.deepEqual([accepted.nodes[1].kind, accepted.nodes[1].mode, accepted.nodes[1].path], ['sweep-curve', 'exact', path]);
  const original = await verify('diameter-four-native', accepted, 2);
  await studyJoints(original, '05-both-spaced-joints');

  let edited;
  const radius = annular ? 2 : 3;
  if (annular) {
    f.phase = 'Refuse wall contact and edit the concentric bore';
    const panel = await f.openParameters();
    const input = panel.getByLabel('Value of BoreRadius', { exact: true });
    await input.fill('2'); await input.press('Enter');
    const refusal = await f.waitToast(/Parameters not changed/);
    assert.match(refusal, /strictly positive wall clearance around the bore/);
    await f.same(accepted);
    await f.snapshot('06-spaced-bore-wall-contact-refused');
    await f.closeParameters(panel);
    edited = (await f.setParameter('BoreRadius', 1.5, '06-spaced-bore-three')).doc;
    assert.deepEqual(edited.nodes, accepted.nodes);
    assert.equal(edited.parameters.BoreRadius, 1.5);
  } else {
    f.phase = 'Refuse axis contact and edit the saved diameter';
    await f.openFeatureEditor(1, 'spaced Sweep');
    const diameter = f.editor().getByLabel('Diameter', { exact: true });
    await diameter.fill(arcLine ? '40' : '24'); await button('Apply', f.editor()).click();
    await f.editor().getByText('Choose a larger arc radius or reduce the sketch diameter.', { exact: true }).waitFor();
    await f.same(accepted);
    await diameter.fill('6');
    edited = (await f.applyEditor(accepted, '06-spaced-diameter-six')).doc;
    assert.equal(edited.nodes[0].radius, 3);
    assert.deepEqual(edited.nodes.slice(1), accepted.nodes.slice(1));
  }
  const native = await verify('edited-native', edited, radius);
  if (annular) {
    assert.deepEqual(native.outerSurfaces, original.outerSurfaces);
    assert.deepEqual(native.joints.map(joint => joint.map(edge => edge.id)),
      original.joints.map(joint => joint.map(edge => edge.id)));
  }
  await f.undo(); await f.same(accepted);
  await f.redo(); await f.same(edited);
  const saved = await f.save(recipe);
  await f.freshOpen(saved.file, edited, '07-spaced-s-bend-reopened');
  const reopened = await verify('reopened-native', await f.doc(), radius);
  assert.equal(reopened.digest, native.digest);
  await studyJoints(reopened, '08-both-reopened-joints');
  if (annular) {
    await inspectBoreMouths(1.5);
    const restored = (await f.setParameter('BoreRadius', 1, '09-spaced-bore-restored')).doc;
    assert.equal((await verify('post-open-original-bore', restored, radius)).digest, original.digest);
    await f.undo(); await f.same(edited);
  }
  await f.openFeatureEditor(1, 'reopened spaced Sweep');
  assert.equal(Number(await f.editor().getByLabel('Diameter', { exact: true }).inputValue()), 2 * radius);
  await f.editor().getByText(representation, { exact: true }).waitFor();
  if (arcLine) {
    const inputs = f.editor().getByRole('group', { name: 'Sweep inputs', exact: true });
    const fields = await inputs.locator('.field').allTextContents();
    assert.deepEqual(fields.slice(-2), ['Start20, 20, 0 mm', 'End-10, 0, 0 mm']);
  }
  await f.snapshot('09-spaced-history');
  if ((arcLine || sameTurn) && !annular) {
    await f.editor().getByLabel('Diameter', { exact: true }).fill('4');
    const restored = (await f.applyEditor(edited, '09-spaced-diameter-restored')).doc;
    assert.deepEqual(restored, accepted);
    assert.equal((await verify('post-open-original-diameter', restored, 2)).digest, original.digest);
  }

  f.phase = 'Approve the same revision-pinned sweep in Studio';
  const proposalFile = join(f.output, 'spaced-proposal.bcad');
  await copyFile(source.file, proposalFile);
  await withMcpSession({ app: f.app, output: f.output, clientName: f.name }, proposalFile, 'spaced-s-bend', async call => {
    const expectedRevision = await currentPartRevision(call);
    if (singleBend) {
      const description = await call('describe', { command: 'sweep-curve' });
      const style = arcLine ? 'arc–line' : lineArc ? 'line–arc' : 'line–arc–line';
      assert.ok(description.values.sketch.includes(style + ' path accepts a circular disk with an optional concentric circular hole'));
    } else if (annular || sameTurn) {
      const description = await call('describe', { command: 'sweep-curve' });
      assert.match(description.values.sketch, /arc–line–arc path accepts a circular disk with an optional concentric circular hole/);
      assert.match(description.values.representation, /straight tangent span can separate two coplanar bends that turn in the same or opposite directions/);
    }
    const { direct_curves: curves } = await call('query', { action: 'summary' });
    const picked = curves.find(curve => curve.id === 'spaced'), other = curves.find(curve => curve.id === 'kink');
    assert.ok(picked?.revision && other?.revision);
    const op = pathRevision => ({ tool: 'features', args: { action: 'command', command: 'sweep-curve', expectedRevision,
      values: { sketch: 'n0', path: picked.id, pathRevision, representation: 'exact' } } });
    const before = await readFile(proposalFile);
    const stale = await call('features', { action: 'batch', dryRun: true, ops: [op(other.revision)] }, true);
    assert.match(stale.error, /path geometry changed/);
    const dry = await call('features', { action: 'batch', dryRun: true, ops: [op(picked.revision)] });
    assert.ok(dry.dryRun);
    near(dry.change.volume, volume(2, annular ? 1 : 0), 0.001);
    assert.deepEqual(await readFile(proposalFile), before);
    const proposal = await call('proposals', { action: 'propose', title: `Exact ${rail} Sweep`, ops: [op(picked.revision)] });
    assert.deepEqual([proposal.proposal, proposal.applied], ['P1', false]);
  });
  const pending = JSON.parse(await readFile(proposalFile, 'utf8'));
  assert.deepEqual([pending.nodes, pending.outputs], [seed.nodes, seed.outputs]);
  await f.freshOpen(proposalFile, pending, '10-spaced-proposal-open');
  await button('Chat').first().click();
  const card = f.page.getByRole('listitem', { name: 'Proposal P1', exact: true });
  await button('Preview', card).click(); await button('Hide', card).waitFor();
  await f.same(pending);
  await button('Accept', card).click(); await f.changed(pending);
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  const approved = (await f.snapshot('11-spaced-proposal-approved')).doc;
  assert.deepEqual([approved.nodes, approved.outputs], [accepted.nodes, accepted.outputs]);
  assert.equal((await verify('approved-native', approved, 2)).digest, original.digest);
});
