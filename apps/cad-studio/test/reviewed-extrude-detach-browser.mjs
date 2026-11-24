import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { withMcpSession } from './mcp-browser-session.mjs';

const [output, input, option] = process.argv.slice(2);
assert.ok(output && input, 'Use the Studio-saved downward Extrude to face fixture');
const baseline = option === '--baseline';
const original = JSON.parse(await readFile(input, 'utf8'));
assert.equal(original.nodes[3].kind, 'face-end-extrude');
assert.equal(original.nodes[1].height, 8);
assert.equal(original.nodes[2].plane.origin[2], 20);
const pins = [
  'apps/cad-studio/test/reviewed-extrude-detach-browser.mjs', 'apps/cad-studio/test/mcp-browser-session.mjs',
  'apps/cad-studio/server/cadMcp.ts', 'packages/barocss-cad-model/src/chat/part/features.ts',
  'packages/barocss-cad-model/src/engine/part.ts', 'packages/barocss-cad-model/src/engine/faceEndExtrude.ts',
];
const f = await createFlow({
  name: 'reviewed-extrude-detach', envFrozen: 'D1935_SOURCE_FROZEN', output,
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'A local Agent proposes detaching the current native Extrude to face; Studio explicitly approves and reopens it.',
  limits: ['One exact downward R2 circle bound to the upper cap of one rectangular extrusion. No paid providers or remote Agent.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
import { brepMassProperties, checkBrep, faceGeometry } from '@barocss/cad';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
console.log(JSON.stringify(partBreps(doc).map(({ key, brep }) => ({
  key, valid: checkBrep(brep, { strict: true }).valid,
  mass: brepMassProperties(brep, 1),
  vertices: brep.vertices.map(vertex => vertex.point),
  faces: brep.faces.map(face => [face.name, faceGeometry(face)]),
}))));
`,
});
const button = (name, parent = f.page) => parent.getByRole('button', { name, exact: true });
const near = (a, b) => Math.abs(a - b) < 1e-8;

async function native(label, doc, targetTop) {
  const shapes = await f.inspect(label, doc);
  assert.deepEqual(shapes.map(body => body.key), ['b1', 'b3']);
  assert.ok(shapes.every(body => body.valid));
  const [stock, extrusion] = shapes;
  assert.ok(near(stock.mass.volume, targetTop * 100));
  assert.ok(near(extrusion.mass.volume, 48 * Math.PI));
  assert.ok(extrusion.mass.centroid.every((v, i) => near(v, [5, 4, 14][i])));
  assert.ok(extrusion.vertices.every(([x, y, z]) => near(Math.hypot(x - 5, y - 4), 2) && (near(z, 8) || near(z, 20))));
  const worker = (await f.bodies()).bodies.find(body => body.key === 'b3');
  assert.ok(near(worker.volume, 48 * Math.PI));
  f.report.observations.push({ label, targetTop, volume: extrusion.mass.volume, centroid: extrusion.mass.centroid });
  return extrusion;
}

await f.run(async () => {
  const active = join(f.output, 'agent-detach-source.bcad');
  const bytes = JSON.stringify(original);
  await writeFile(active, bytes);
  const session = { app: f.app, output: f.output, clientName: 'reviewed-extrude-detach', autonomy: 1 };
  const readRevision = async call => (await call('query', { action: 'rebuild' })).revision;
  const first = await withMcpSession(session, active, baseline ? 'previous-handler' : 'current-handler', async call => {
    const revision = await readRevision(call);
    assert.match(revision, /^[a-f0-9]{16}$/);
    const request = { action: 'edit', index: 3, expectedRevision: revision, values: { detachToDistance: true } };
    const propose = args => ({ action: 'propose', title: 'Detach at the current native distance', ops: [{ tool: 'features', args }] });
    const denied = async (args, why) => {
      const failed = await call('proposals', propose(args), true);
      assert.match(failed.error, why);
      assert.equal(await readFile(active, 'utf8'), bytes);
    };
    if (baseline) {
      await denied(request, /has no value.*detachToDistance/i);
      return null;
    }
    const desc = await call('describe', { tool: 'features', action: 'edit' });
    assert.match(JSON.stringify(desc), /detachToDistance/);
    await denied({ ...request, expectedRevision: undefined }, /expectedRevision/);
    await denied({ ...request, expectedRevision: revision === '0000000000000000' ? 'ffffffffffffffff' : '0000000000000000' }, /part changed/);
    await denied({ ...request, index: 1 }, /active Extrude to face/i);
    await denied({ ...request, values: { detachToDistance: true, height: 1 } }, /only values.detachToDistance/);
    await denied({ ...request, values: { detachToDistance: false } }, /detachToDistance/);
    await denied({ ...request, feature: { kind: 'extrude', sketch: 2, height: 1 } }, /only values.detachToDistance/);
    assert.match((await call('features', request, true)).error, /propos/i);
    const proposal = await call('proposals', propose(request));
    assert.equal(proposal.applied, false);
    const pending = await readFile(active, 'utf8');
    assert.match((await call('proposals', { action: 'accept', id: proposal.proposal }, true)).error, /user accepts.*studio/i);
    assert.equal(await readFile(active, 'utf8'), pending);
    return proposal.proposal;
  });

  await f.newPage();
  const pending = JSON.parse(await readFile(active, 'utf8'));
  await f.openFile(active, 4);
  await f.same(pending);
  const geometryBefore = await native('original-bound-native', pending, 8);
  if (baseline) {
    await f.snapshot('00-unchanged-previous-bound-extrusion');
    return;
  }
  assert.deepEqual(pending.nodes, original.nodes);
  await button('Chat').first().click();
  const card = f.page.getByRole('listitem', { name: `Proposal ${first}`, exact: true });
  await card.waitFor();
  await button('Preview', card).click();
  await button('Hide', card).waitFor();
  await f.same(pending);
  await f.snapshot('01-agent-detach-pending');
  await button('Accept', card).click();
  await f.changed(pending);
  const approved = await f.doc(), detached = { id: 'n3', kind: 'extrude', sketch: 2, height: 12 };
  assert.deepEqual(approved.nodes, [...original.nodes.slice(0, 3), detached]);
  const approval = approved.history.at(-1);
  assert.deepEqual([approval.kind, approval.proposal, approval.by.agent], ['accept', first, 'user']);
  assert.deepEqual(await native('approved-detached-native', approved, 8), geometryBefore);
  await f.snapshot('02-approved-detached-extrusion');
  await f.undo(); await f.same(pending);
  await f.redo(); await f.same(approved);
  const saved = await f.save('agent-detached-extrude');
  await f.freshOpen(saved.file, approved, '03-reopened-detached-extrusion');
  assert.deepEqual(await native('detached-fresh-open', approved, 8), geometryBefore);

  await f.openFeatureEditor(1, 'move the former target');
  await f.editor().getByLabel('Distance', { exact: true }).fill('6');
  const moved = (await f.applyEditor(approved, '04-former-target-moved')).doc;
  assert.equal(moved.nodes[1].height, 6);
  assert.deepEqual(moved.nodes[3], detached);
  assert.deepEqual(await native('detached-after-target-change', moved, 6), geometryBefore);
});
