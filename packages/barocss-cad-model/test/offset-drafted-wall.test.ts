import test from 'node:test';
import assert from 'node:assert/strict';
import { offsetFaceCommand } from '../src/app/profileCommands';
import { dispatchTool } from '../src/chat/tools';
import { rectanglePart, type StudioDoc } from '../src/engine/doc';
import { evaluateDoc } from '../src/engine/evaluate';

test('Offset face builds the same inclined-wall edit in the agent and Studio, and retains the document on collapse', async () => {
  const base = rectanglePart(40, 30, 10);
  const doc: StudioDoc = { ...base, nodes: base.nodes.map(node => node.kind === 'extrude' ? { ...node, draft: 10 } : node) };
  const evaluated = evaluateDoc(doc, 1);
  assert.ok(evaluated.ok, evaluated.ok ? 'Expected valid stock' : evaluated.error.detail);
  const bodies = evaluated.bodies;
  const wall = bodies[0].mesh.faces.find(face => face.exact?.kind === 'plane' && face.exact.n[0] > 0.9 && face.exact.n[2] > 0.1);
  assert.ok(wall);
  const ctx = { doc, bodies, selection: { faces: [{ body: 0, face: wall.index }], edges: [], bodies: [] } };
  const [handle] = offsetFaceCommand.handles!(ctx, { d: 3 });
  const slope = Math.tan(Math.PI / 18);
  const q = Math.hypot(1, slope);
  assert.ok(handle.dir.every((value, index) => Math.abs(value - [1 / q, 0, slope / q][index]) < 1e-10));
  const expectedVolume = 12000 - 7000 * slope + 4000 / 3 * slope ** 2 + 3 * q * (300 - 100 * slope);
  const state = { doc, bodies };
  const call = (d: number) => dispatchTool(state, 'run_command', { command: 'offset-face', faces: [wall.name], values: { d } },
    async candidate => evaluateDoc(candidate, 2));

  const accepted = await call(3);
  assert.ok(!accepted.isError && accepted.changed, accepted.content);
  assert.deepEqual(accepted.state.doc, offsetFaceCommand.build!(ctx, { d: 3 }));
  const node = accepted.state.doc.nodes.at(-1);
  assert.ok(node?.kind === 'offset-face');
  assert.deepEqual(node.faces, [wall.name]);
  assert.ok(node.sigs?.[wall.name]);
  const volume = accepted.state.bodies[0].volume;
  assert.ok(volume !== null && Math.abs(volume - expectedVolume) < 1e-7);
  const rejected = await call(-37);
  assert.ok(rejected.isError && !rejected.changed, rejected.content);
  assert.match(rejected.content, /clos|cross|collapse/i);
  assert.deepEqual(rejected.state.doc, doc);
  assert.deepEqual(rejected.state.bodies, bodies);
});
