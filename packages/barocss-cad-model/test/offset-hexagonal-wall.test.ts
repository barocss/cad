import test from 'node:test';
import assert from 'node:assert/strict';
import { offsetFaceCommand } from '../src/app/profileCommands';
import { dispatchTool } from '../src/chat/tools';
import { encodeStudioFile, readStudioFile } from '../src/engine/container';
import { emptyDoc, withNode, type StudioDoc } from '../src/engine/doc';
import { evaluateDoc } from '../src/engine/evaluate';

function stock() {
  const sketch = withNode(emptyDoc(), { kind: 'sketch', profile: 'polygon',
    points: [[0, 0], [18, 0], [24, 8], [18, 16], [0, 16], [-6, 8]] });
  return withNode(sketch, { kind: 'extrude', sketch: 0, height: 10 });
}

test('the agent and Studio share the oblique prism offset and retain the source when a wall collapses', async () => {
  const source = stock();
  const first = evaluateDoc(source, 1);
  assert.ok(first.ok, first.ok ? '' : first.error.detail);
  const { bodies } = first;
  const wall = bodies[0].mesh.faces.find(face => face.name === 'n1.side1');
  assert.ok(wall);
  const state = { doc: source, bodies };
  const ctx = { ...state, selection: { faces: [{ body: 0, face: wall.index }], edges: [], bodies: [] } };
  const [handle] = offsetFaceCommand.handles!(ctx, { d: 1 });
  assert.deepEqual(handle.at.map(x => Number(x.toFixed(12))), [21, 4, 5]);
  assert.deepEqual(handle.dir.map(x => Number(x.toFixed(12))), [0.8, -0.6, 0]);
  const call = (d: number) => dispatchTool(state, 'run_command', { command: 'offset-face', faces: [wall.name], values: { d } },
    async (doc: StudioDoc) => evaluateDoc(doc, 2));

  const before = structuredClone(source);
  const accepted = await call(1);
  assert.ok(!accepted.isError && accepted.changed, accepted.content);
  assert.deepEqual(accepted.state.doc, offsetFaceCommand.build!(ctx, { d: 1 }));
  const node = accepted.state.doc.nodes.at(-1);
  assert.ok(node?.kind === 'offset-face');
  assert.deepEqual(node.faces, [wall.name]);
  assert.ok(node.sigs?.[wall.name]);
  const volume = accepted.state.bodies[0].volume;
  assert.ok(volume !== null && Math.abs(volume - 3934.791666666667) <= 1e-7);
  const opened = await readStudioFile(encodeStudioFile(accepted.state.doc));
  assert.ok('doc' in opened);
  assert.deepEqual(opened.doc, JSON.parse(JSON.stringify(accepted.state.doc)));

  const sketch = source.nodes[0];
  assert.ok(sketch.kind === 'sketch' && sketch.profile === 'polygon');
  const renamed = { ...sketch, points: [...sketch.points.slice(1), sketch.points[0]] };
  const changed = evaluateDoc({ ...accepted.state.doc, nodes: [renamed, ...accepted.state.doc.nodes.slice(1)] }, 3);
  assert.ok(!changed.ok && /REFERENCE_MOVED/.test(changed.error.detail));
  const stale = { ...ctx, doc: { ...source, nodes: [renamed, ...source.nodes.slice(1)] } };
  assert.throws(() => offsetFaceCommand.build!(stale, { d: 1 }), /no longer agrees with the current document/);

  const rejected = await call(-9.6);
  assert.ok(rejected.isError && !rejected.changed, rejected.content);
  assert.equal(rejected.state.doc, source);
  assert.deepEqual(source, before);

  const cap = bodies[0].mesh.faces.find(face => face.name === 'n1.top');
  assert.ok(cap);
  const legacy = offsetFaceCommand.build!({ ...ctx, selection: { ...ctx.selection, faces: [{ body: 0, face: cap.index }] } }, { d: 1 });
  assert.deepEqual(legacy.nodes.slice(2).map(feature => feature.kind), ['sketch', 'extrude', 'union']);
});
