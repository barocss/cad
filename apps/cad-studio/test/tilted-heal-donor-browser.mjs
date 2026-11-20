import assert from 'node:assert/strict';
import { copyFile, readFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { withMcpSession } from './mcp-browser-session.mjs';
import { boredCapOracle, capCase } from './replace-face-cap-fixture.mjs';

const [output, input, side] = process.argv.slice(2), app = resolve(import.meta.dirname, '..');
assert.ok(output && input && ['upper', 'lower'].includes(side) &&
  isAbsolute(output) && relative(resolve(app, '../..'), output).startsWith('../'));
const movedFile = join(output, 'mcp-donor-moved.bcad');
const bytes = await readFile(input), original = JSON.parse(bytes);
const replacement = original.nodes.at(-3), donor = replacement.target.body.node, cap = capCase('two-bore-' + side);
assert.equal(replacement.kind, 'replace-face');
assert.equal(original.nodes[donor].kind, 'translate');

const pins = [
  'apps/cad-studio/src/App.tsx', 'apps/cad-studio/src/files/documentFile.ts', 'apps/cad-studio/src/state/commandApply.ts',
  'apps/cad-studio/src/state/historyFeatureApply.ts',
  'apps/cad-studio/test/replace-face-cap-fixture.mjs', 'packages/barocss-cad-model/src/engine/doc.ts',
  'packages/barocss-cad/src/features/bored-cap-offset.ts', 'packages/barocss-cad/src/brep/cylindrical-bore.ts',
];
const f = await createFlow({
  name: 'tilted-heal-donor', envFrozen: 'TILTED_HEAL_DONOR_FROZEN', output, initialFiles: pins, requiredFrozen: pins,
  qualification: 'Move the original plane donor after two distinct heals and refuse a collapsing replacement.',
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { checkBrep, brepMassProperties } from '@barocss/cad';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
console.log(JSON.stringify(partBreps(doc).map(({ key, brep }) => ({
  key, brep, report: checkBrep(brep, { strict: true }), mass: brepMassProperties(brep, 1),
}))));
`,
});
const near = (actual, ideal) => assert.ok(Math.abs(actual - ideal) < 1e-7, `${actual} != ${ideal}`);
const key = 'b' + (original.nodes.length - 1), donorKey = 'b' + donor;
const byKey = (parts, key) => parts.find(part => part.key === key);
const incidence = ({ bodies, shells, faces, loops, coedges, edges, vertices }) => [
  bodies, shells, faces.map(({ surface, ...face }) => [face, surface.id]), loops, coedges.map(({ pcurve, ...use }) => [use, pcurve.id]),
  edges.map(({ curve, ...edge }) => [edge, curve.id]), vertices.map(vertex => vertex.id),
];
async function measure(label, doc, support, previous) {
  const native = await f.inspect(label, doc), worker = (await f.bodies()).bodies;
  assert.equal(native.length, 2);
  assert.equal(worker.length, 2);
  const plate = byKey(native, key), ref = byKey(native, donorKey), oracle = boredCapOracle({ ...cap, bores: [] }, support);
  assert.ok(plate.report.valid && ref.report.valid);
  assert.deepEqual(plate.report.counts, { bodies: 1, shells: 1, faces: 6, loops: 6, coedges: 24, edges: 12, vertices: 8 });
  assert.equal(plate.report.topology[0].genus, 0);
  assert.ok(plate.report.maximumPcurveGap < 1e-9 && plate.report.maximumEdgeSurfaceGap < 1e-9);
  near(plate.mass.volume, oracle.volume);
  near(byKey(worker, key).volume, oracle.volume);
  near(ref.mass.volume, 192);
  plate.mass.centroid.forEach((v, i) => near(v, oracle.centroid[i]));
  for (const { point: [x, y, z] } of plate.brep.vertices) near(z, z === cap.opposite ? cap.opposite : support(x, y));
  if (previous) {
    const oldPlate = byKey(previous, key), oldRef = byKey(previous, donorKey);
    assert.deepEqual(incidence(plate.brep), incidence(oldPlate.brep));
    assert.deepEqual(incidence(ref.brep), incidence(oldRef.brep));
    for (const { id, point } of ref.brep.vertices) {
      const before = oldRef.brep.vertices.find(vertex => vertex.id === id).point;
      point.forEach((v, i) => near(v, before[i] + (i === 2 ? cap.moved : 0)));
    }
  }
  f.report.observations.push({ label, nativeVolume: plate.mass.volume, workerVolume: byKey(worker, key).volume, centroid: plate.mass.centroid });
  return native;
}

async function moveThroughMcp() {
  await copyFile(input, movedFile);
  return withMcpSession({ app, output, clientName: 'cad-healed-tilt-donor', autonomy: 3 }, movedFile, 'move-healed-tilt', async call => {
    const pin = await call('query', { action: 'render' });
    const move = { action: 'edit', index: donor, values: { o2: cap.moved }, expectedRevision: pin.revision };
    await call('features', move);
    const accepted = await readFile(movedFile), next = JSON.parse(accepted);
    const expected = structuredClone(original);
    expected.nodes[donor].offset[2] = cap.moved;
    // This MCP edit refreshes the two native wall signatures after the same named supports move.
    for (let index = original.nodes.length - 2; index < original.nodes.length; index++) {
      const [face] = original.nodes[index].faces;
      const before = original.nodes[index].sigs[face], after = next.nodes[index].sigs[face];
      assert.equal(after.r, before.r);
      assert.ok(after.s > before.s);
      assert.ok(Math.abs(after.p[2] - before.p[2] - cap.direction) < 0.01);
      expected.nodes[index].sigs[face] = { ...before, p: after.p, s: after.s };
    }
    assert.deepEqual(next, expected);
    const { bodies } = await call('query', { action: 'summary' });
    assert.equal(bodies.length, 2);
    assert.equal(byKey(bodies, key).volume, 18000);
    assert.equal(byKey(bodies, donorKey).volume, 192);
    const nextPin = await call('query', { action: 'render' });
    const collision = await call('features', { ...move, values: { o2: cap.collapse }, expectedRevision: nextPin.revision }, true);
    assert.match(JSON.stringify(collision), /opposite cap at one corner/);
    assert.deepEqual(await readFile(movedFile), accepted);
    f.report.observations.push({ before: pin.revision, after: nextPin.revision, mcpVolume: 18000, collision: collision.error });
    return { expected: next, movedBytes: accepted };
  });
}

await f.run(async () => {
  const origin = new URL(f.server.resolvedUrls.local[0]).origin, newContext = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async options => {
    const context = await newContext({ ...options, serviceWorkers: 'block' });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      return ['http:', 'https:'].includes(url.protocol) && url.origin !== origin ? route.abort() : route.continue();
    });
    return context;
  };
  f.phase = 'Move the upstream donor through stdio MCP';
  const { expected, movedBytes } = await moveThroughMcp();
  await f.freshOpen(input, original, 'two-heals-before-donor-move');
  const previous = await measure('original', original, cap.height);
  await f.openFeatureEditor(donor, 'reference position');
  await f.editor().getByLabel('ΔZ', { exact: true }).fill(String(cap.moved));
  await f.applyEditor(original, 'moved-tilted-heals');
  const moved = await f.doc();
  const studioDocument = structuredClone(original);
  studioDocument.nodes[donor].offset[2] = cap.moved;
  assert.deepEqual(moved, studioDocument);
  await measure('moved', moved, cap.movedHeight, previous);
  await f.undo(); await f.same(original);
  await f.redo(); await f.same(moved);
  const saved = await f.save('healed-tilted-donor-moved');
  await f.freshOpen(saved.file, moved, 'moved-reopened');
  await measure('reopened', moved, cap.movedHeight, previous);

  f.phase = 'Refuse a donor move that brings the tilted plane to the opposite cap';
  await f.openFeatureEditor(donor, 'reference position');
  await f.editor().getByLabel('ΔZ', { exact: true }).fill(String(cap.collapse));
  await f.editor().getByRole('button', { name: 'Apply', exact: true }).click();
  const error = f.editor().locator('.hud-error');
  await error.waitFor();
  const detail = error.locator('summary');
  if (await detail.count()) await detail.click();
  assert.match(await error.innerText(), /opposite cap at one corner/i);
  await f.same(moved);
  await measure('collapse-refused', moved, cap.movedHeight, previous);
  await f.snapshot('donor-collapse-refused');
  await f.freshOpen(movedFile, expected, 'mcp-moved-reopened');
  const mcp = await measure('mcp-open', expected, cap.movedHeight, previous);
  assert.deepEqual(mcp, await f.inspect('studio-document', moved));
  assert.deepEqual(await readFile(input), bytes);
  assert.deepEqual(await readFile(movedFile), movedBytes);
});
