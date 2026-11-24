import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sha256 } from '../../../apps/cad-studio/test/flow-helper.mjs';

export const holeOracle = String.raw`
import json, math, sys
sample = json.load(sys.stdin)
body, depth, radius = sample["body"], sample["depth"], sample["radius"]
removed = math.pi * radius**2 * depth
volume = 48000 - removed
z = (480000 - removed * (20 - depth / 2)) / volume
assert math.isclose(body["volume"], volume, rel_tol=1e-8, abs_tol=1e-6), (body, volume)
assert all(abs(a-b) <= 1e-6 for a,b in zip(body["centroid"], [30,20,z], strict=True)), (body, z)
if sample.get("checkBounds"):
    for edge, expected in [("min",[0,0,0]),("max",[60,40,20])]:
        assert all(abs(a-b) <= 1e-6 for a,b in zip(body["bounds"][edge], expected, strict=True)), body
print(json.dumps({"status":"PASS","depth":depth,"radius":radius,"expectedVolume":volume,"volume":body["volume"],"centroid":body["centroid"]}))
`;

export async function qualifyHoleProps(f, ready, raw, workers) {
  const states = [];
  const readHole = async (label, depth, previous, radius = 4) => {
    await ready(depth, previous);
    assert.equal(await f.page.getByRole('spinbutton', { name: 'Hole Radius', exact: true }).inputValue(), String(radius));
    const { observation } = await raw(label);
    const { host, calls } = observation;
    const owner = host.nativeOwner, viewer = host.viewer;
    for (const actual of [host.renderedOwner, host.adapter.desired, viewer.mountedOwner, viewer.frameOwner])
      assert.deepEqual(actual, owner);
    assert.equal(viewer.facade, '@barocss/viewer');
    assert.equal(viewer.displayMeshes.revision, owner.evaluationRevision);
    const doc = JSON.parse(host.documentJSON);
    assert.deepEqual(doc, host.currentDocument);
    assert.equal(doc.schema, 3);
    assert.equal(doc.units, 'mm');
    assert.deepEqual(doc.nodes.map(node => node.kind), ['sketch', 'extrude', 'hole']);
    const hole = doc.nodes[2];
    assert.deepEqual(hole, { id: hole.id, kind: 'hole', parent: { node: 1, side: 'solid' }, center: [30, 20], radius, depth });
    const call = calls.find(entry => entry.revision === owner.evaluationRevision);
    assert.deepEqual(call.doc, doc);
    assert.equal(call.reply.ok, true);
    assert.equal(call.reply.bodies.length, 1);
    assert.equal(call.reply.bodies[0].key, host.native.key);
    assert.deepEqual(viewer.displayMeshes.bodies, [
      { bodyId: host.native.key, vertices: host.native.vertices, triangles: host.native.triangles },
    ]);
    await f.runOracle({ body: host.native, depth, radius, checkBounds: true }, label);
    states.push({ owner, viewer, doc, bytes: host.documentJSON, body: host.native, mesh: call.reply.bodies[0].mesh });
    return owner.evaluationRevision;
  };

  f.phase = 'change current public Hole depth from 6 to 10 and Reset to 6';
  const first = await readHole('hole-depth-6', 6, -1);
  await f.page.getByRole('spinbutton', { name: 'Hole Depth', exact: true }).fill('10');
  const second = await readHole('hole-depth-10', 10, first);
  await f.page.getByRole('button', { name: 'Reset', exact: true }).click();
  const restoredDepth = await readHole('hole-depth-6-restored', 6, second);
  f.phase = 'change hole radius and verify a visibly different Viewer frame';
  await f.page.getByRole('spinbutton', { name: 'Hole Radius', exact: true }).fill('7');
  const resized = await readHole('hole-radius-7', 6, restoredDepth, 7);
  await f.page.getByRole('button', { name: 'Reset', exact: true }).click();
  await readHole('hole-radius-4-restored', 6, resized);
  assert.ok(workers.some(url => /\/assets\/engine\.worker-.*\.js$/.test(url)));
  const [a, b, restored, wider, final] = states;
  const expectedB = structuredClone(a.doc);
  expectedB.nodes[2].depth = 10;
  assert.deepEqual(b.doc, expectedB);
  assert.equal(restored.bytes, a.bytes);
  const expectedWider = structuredClone(a.doc);
  expectedWider.nodes[2].radius = 7;
  assert.deepEqual(wider.doc, expectedWider);
  assert.equal(final.bytes, a.bytes);
  assert.notEqual(wider.viewer.pixels.sha256, a.viewer.pixels.sha256);
  assert.deepEqual(final.viewer.pixels, a.viewer.pixels);
  assert.equal(new Set(states.map(state => state.owner.hostEpoch)).size, 1);
  assert.equal(new Set(states.map(state => state.body.key)).size, 1);
  assert.notDeepEqual(b.mesh, a.mesh);
  assert.deepEqual(restored.mesh, a.mesh);
  assert.deepEqual(restored.viewer.camera, a.viewer.camera);

  const file = join(f.output, 'returned-hole-depth-10.bcad');
  await writeFile(file, b.bytes);
  const checkStudioBody = async (state, depth, label) => {
    assert.equal(state.bodies.bodies.length, 1);
    assert.equal(state.bodies.bodies[0].key, b.body.key);
    await f.runOracle({ body: state.bodies.bodies[0], depth, radius: 4 }, label);
  };
  const opened = await f.freshOpen(file, b.doc, 'studio-hole-depth-10-open');
  await checkStudioBody(opened, 10, 'studio-open');
  await f.openFeatureEditor(2, 'returned Hole');
  await f.editor().getByLabel('Depth', { exact: true }).fill('8');
  const edited = await f.applyEditor(b.doc, 'studio-hole-depth-8-edited');
  const expectedEdit = structuredClone(b.doc);
  expectedEdit.nodes[2].depth = 8;
  assert.deepEqual(edited.doc, expectedEdit);
  await checkStudioBody(edited, 8, 'studio-edit');
  const saved = await f.save('studio-hole-depth-8');
  assert.deepEqual(saved.doc, expectedEdit);
  const reopened = await f.freshOpen(saved.file, expectedEdit, 'studio-hole-depth-8-fresh-open');
  await checkStudioBody(reopened, 8, 'studio-reopen');
  assert.equal(await readFile(file, 'utf8'), b.bytes);
  assert.equal(f.report.downloads.length, 1);
  f.report.observations.push({
    returnedSHA256: sha256(b.bytes), workers,
    owners: states.map(state => state.owner), frames: states.map(state => state.viewer.pixels),
  });
}
