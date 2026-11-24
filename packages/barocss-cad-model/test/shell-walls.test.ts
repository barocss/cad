import assert from 'node:assert/strict';
import test from 'node:test';
import { commandById } from '../src/app/commands';
import { editFields } from '../src/app/editFields';
import { rectanglePart } from '../src/engine/doc';
import { evaluateDoc } from '../src/engine/evaluate';
import { readStudioDoc } from '../src/engine/migrate';

test('Shell saves and edits all original box-wall names and refuses absent or changed ownership', () => {
  const doc = rectanglePart(40, 30, 20);
  const stock = evaluateDoc(doc, 1);
  assert.ok(stock.ok);
  const top = stock.bodies[0].mesh.faces.findIndex(face => face.nativeAlignFace?.axis === 'z' && face.nativeAlignFace.sign === 1);
  assert.ok(top >= 0);
  const shell = commandById('shell')!;
  const ctx = { doc, bodies: stock.bodies, selection: { bodies: [], edges: [], faces: [{ body: 0, face: top }] } };
  const defaults = shell.defaults!(ctx);
  const uniform = shell.build!(ctx, defaults);
  assert.equal(uniform.nodes.at(-1)?.kind, 'shell');
  const created = shell.build!(ctx, { ...defaults, wallMode: 'per-face', bottomWall: 4 });
  const node = created.nodes[2];
  assert.ok(node.kind === 'shell-walls');
  assert.equal(node.walls['n1.bottom'], 4);
  assert.deepEqual(Object.keys(node.sigs).sort(), [node.opening, ...Object.keys(node.walls)].sort());
  const read = readStudioDoc(JSON.stringify(created));
  assert.ok('doc' in read);
  assert.deepEqual(read.doc.nodes[2], node);
  const evalCreated = evaluateDoc(created, 2);
  assert.ok(evalCreated.ok && Math.abs(evalCreated.bodies[0].volume! - 9024) < 1e-7);
  const left = editFields(created.nodes, 2).find(field => field.label === 'Left wall');
  assert.ok(left?.kind === 'number');
  const edited = { ...created, nodes: left.set(created.nodes, 3) };
  const evalEdited = evaluateDoc(edited, 3);
  assert.ok(evalEdited.ok && Math.abs(evalEdited.bodies[0].volume! - 9440) < 1e-7);
  const sketch = created.nodes[0];
  assert.ok(sketch.kind === 'sketch' && sketch.profile === 'rectangle');
  const resized = evaluateDoc({ ...created, nodes: [{ ...sketch, max: [45, 30] }, ...created.nodes.slice(1)] }, 4);
  assert.ok(resized.ok && Math.abs(resized.bodies[0].volume! - 9944) < 1e-7);

  const unsigned = { ...created, nodes: [...created.nodes.slice(0, 2), { ...node, sigs: {} }] };
  assert.match((readStudioDoc(JSON.stringify(unsigned)) as { error?: string }).error ?? '', /six original face signatures/);
  const sigs = structuredClone(node.sigs);
  [sigs['n1.side1'].d, sigs['n1.side3'].d] = [sigs['n1.side3'].d, sigs['n1.side1'].d];
  const swapped = { ...created, nodes: [...created.nodes.slice(0, 2), { ...node, sigs }] };
  const failed = evaluateDoc(swapped, 5);
  assert.ok(!failed.ok);
  assert.match(failed.error.detail, /REFERENCE_MOVED|no longer the face/);
});

test('a lateral per-face Shell exposes its five retained walls and keeps the top wall editable after Open', () => {
  const doc = rectanglePart(40, 30, 20);
  const stock = evaluateDoc(doc, 1);
  assert.ok(stock.ok);
  const shell = commandById('shell')!;
  const pick = (axis: 'x' | 'z', sign: 1 | -1) => {
    const face = stock.bodies[0].mesh.faces.findIndex(candidate => candidate.nativeAlignFace?.axis === axis
      && candidate.nativeAlignFace.sign === sign);
    assert.ok(face >= 0);
    return { doc, bodies: stock.bodies, selection: { bodies: [], edges: [], faces: [{ body: 0, face }] } };
  };
  const ctx = pick('x', 1);
  const defaults = shell.defaults!(ctx), values = {
    ...defaults, wallMode: 'per-face', leftWall: 3, frontWall: 2, backWall: 4, bottomWall: 4, topWall: 6,
  };
  assert.deepEqual(shell.fields!(ctx, values).map(field => field.key), ['wallMode', 'bottomWall', 'frontWall', 'backWall', 'leftWall', 'topWall']);
  const built = shell.build!(ctx, values), node = built.nodes[2];
  assert.ok(node.kind === 'shell-walls');
  assert.equal(node.opening, 'n1.side1');
  assert.deepEqual(node.walls, { 'n1.bottom': 4, 'n1.side0': 2, 'n1.side2': 4, 'n1.side3': 3, 'n1.top': 6 });
  const read = readStudioDoc(JSON.stringify(built));
  assert.ok('doc' in read);
  assert.deepEqual(read.doc.nodes[2], node);
  const native = evaluateDoc(read.doc, 2);
  assert.ok(native.ok && Math.abs(native.bodies[0].volume! - 15120) < 1e-7);
  const edits = editFields(read.doc.nodes, 2), top = edits.find(field => field.key === 'topWall');
  assert.ok(top?.kind === 'number' && edits.every(field => field.key !== 'rightWall'));
  const edited = { ...read.doc, nodes: top.set(read.doc.nodes, 7) };
  const result = evaluateDoc(edited, 3);
  assert.ok(result.ok && Math.abs(result.bodies[0].volume! - 16008) < 1e-7);
  const wrong = structuredClone(built), invalid = wrong.nodes[2];
  assert.ok(invalid.kind === 'shell-walls');
  invalid.sigs['n1.top'].d = [1, 0, 0];
  assert.match((readStudioDoc(JSON.stringify(wrong)) as { error?: string }).error ?? '', /five cardinal walls/);
  const bottom = pick('z', -1);
  const bottomValues = {
    ...shell.defaults!(bottom), wallMode: 'per-face', leftWall: 3, frontWall: 2, rightWall: 5, backWall: 4, topWall: 6,
  };
  assert.deepEqual(shell.fields!(bottom, bottomValues).map(field => field.key), ['wallMode', 'frontWall', 'rightWall', 'backWall', 'leftWall', 'topWall']);
  const bottomDoc = shell.build!(bottom, bottomValues);
  const opened = readStudioDoc(JSON.stringify(bottomDoc));
  assert.ok('doc' in opened);
  const bottomFeature = opened.doc.nodes[2];
  assert.ok(bottomFeature.kind === 'shell-walls');
  assert.equal(bottomFeature.opening, 'n1.bottom');
  assert.ok(!Object.hasOwn(bottomFeature.walls, 'n1.bottom'));
  const bottomResult = evaluateDoc(opened.doc, 4);
  assert.ok(bottomResult.ok && Math.abs(bottomResult.bodies[0].volume! - 13248) < 1e-7);
});
