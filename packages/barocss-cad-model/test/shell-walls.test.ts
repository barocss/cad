import assert from 'node:assert/strict';
import test from 'node:test';
import { commandById } from '../src/app/commands';
import { editFields } from '../src/app/editFields';
import { rectanglePart, type StudioDoc } from '../src/engine/doc';
import { dispatchTool } from '../src/chat/tools';
import { evaluateDoc } from '../src/engine/evaluate';
import { readStudioDoc } from '../src/engine/migrate';

test('a selected original rectangular body has six closed Shell walls and round-trips their ownership', () => {
  const doc = rectanglePart(40, 30, 20), stock = evaluateDoc(doc, 1);
  assert.ok(stock.ok);
  const shell = commandById('shell')!;
  const ctx = { doc, bodies: stock.bodies, selection: { bodies: [0], edges: [], faces: [] } };
  const defaults = shell.defaults!(ctx);
  const uniform = shell.build!(ctx, defaults).nodes[2];
  assert.ok(uniform.kind === 'shell');
  assert.deepEqual(uniform.open, []);
  const values = { ...defaults, wallMode: 'per-face', leftWall: 3, rightWall: 5, frontWall: 2, backWall: 4, bottomWall: 2, topWall: 3 };
  const created = shell.build!(ctx, values), feature = created.nodes[2];
  assert.ok(feature.kind === 'shell-walls');
  assert.equal(feature.opening, null);
  assert.deepEqual(feature.walls, { 'n1.side3': 3, 'n1.side1': 5, 'n1.side0': 2, 'n1.side2': 4, 'n1.bottom': 2, 'n1.top': 3 });
  const input = readStudioDoc(JSON.stringify(created));
  assert.ok('doc' in input);
  assert.deepEqual(input.doc.nodes[2], feature);
  const result = evaluateDoc(input.doc, 2);
  assert.ok(result.ok && Math.abs(result.bodies[0].volume! - 12480) < 1e-7);
  const fields = editFields(created.nodes, 2);
  assert.deepEqual(fields.map(field => field.label), ['Bottom wall', 'Front wall', 'Right wall', 'Back wall', 'Left wall', 'Top wall']);
  const right = fields.find(field => field.key === 'rightWall');
  assert.ok(right?.kind === 'number');
  const invalid = evaluateDoc({ ...created, nodes: right.set(created.nodes, 37) }, 3);
  assert.equal(invalid.ok, false);
  for (const malformed of [
    { ...feature, opening: undefined },
    { ...feature, secondOpening: 'n1.top' },
    { ...feature, sigs: { ...feature.sigs, 'n1.top': feature.sigs['n1.bottom'] } },
  ]) assert.ok('error' in readStudioDoc(JSON.stringify({ ...created, nodes: [...created.nodes.slice(0, 2), malformed] })));
});

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
  assert.equal(Object.hasOwn(node, 'secondOpening'), false);
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

test('top and vertical per-face Shell stores both openings and keeps only four editable thicknesses', () => {
  const doc = rectanglePart(40, 30, 20);
  const stock = evaluateDoc(doc, 1);
  assert.ok(stock.ok);
  const shell = commandById('shell')!;
  const pick = (name: string) => {
    const face = stock.bodies[0].mesh.faces.findIndex(candidate => candidate.nativePlaneName === name);
    assert.ok(face >= 0);
    return { body: 0, face };
  };
  const context = { doc, bodies: stock.bodies, selection: { bodies: [], edges: [], faces: [pick('n1.side0'), pick('n1.top')] } };
  const values = { ...shell.defaults!(context), wallMode: 'per-face', leftWall: 3, rightWall: 5, backWall: 4, bottomWall: 2 };
  const expectedFields = ['bottomWall', 'rightWall', 'backWall', 'leftWall'];
  assert.deepEqual(shell.fields!(context, values).map(field => field.key), ['wallMode', ...expectedFields]);
  const built = shell.build!(context, values), node = built.nodes[2];
  assert.ok(node.kind === 'shell-walls');
  assert.deepEqual([node.opening, node.secondOpening, node.walls], ['n1.top', 'n1.side0', {
    'n1.side3': 3, 'n1.side1': 5, 'n1.side2': 4, 'n1.bottom': 2,
  }]);
  const opened = readStudioDoc(JSON.stringify(built));
  assert.ok('doc' in opened);
  assert.deepEqual(opened.doc, built);
  const result = evaluateDoc(opened.doc, 2);
  assert.ok(result.ok && Math.abs(result.bodies[0].volume! - 9024) < 1e-7);
  const fields = editFields(opened.doc.nodes, 2);
  assert.deepEqual(fields.map(field => field.key), expectedFields);
  const bottom = fields.find(field => field.key === 'bottomWall');
  assert.ok(bottom?.kind === 'number');
  const edited = evaluateDoc({ ...opened.doc, nodes: bottom.set(opened.doc.nodes, 6) }, 3);
  assert.ok(edited.ok && Math.abs(edited.bodies[0].volume! - 12352) < 1e-7);

  const missingWall = { ...node, walls: { 'n1.side1': 5, 'n1.side2': 4, 'n1.bottom': 2 } };
  const duplicate = { ...node, secondOpening: node.opening };
  for (const [invalid, message] of [[missingWall, /four kept walls/], [duplicate, /distinct second original opening/]] as const) {
    const loaded = readStudioDoc(JSON.stringify({ ...built, nodes: [...built.nodes.slice(0, 2), invalid] }));
    assert.ok('error' in loaded);
    assert.match(loaded.error, message);
  }
  const twoSides = { ...context, selection: { ...context.selection, faces: [pick('n1.side0'), pick('n1.side1')] } };
  assert.deepEqual(shell.fields!(twoSides, values).map(field => field.key), ['wallMode', 'bottomWall', 'backWall', 'leftWall', 'topWall']);
  const bottomAndSide = { ...context, selection: { ...context.selection, faces: [pick('n1.bottom'), pick('n1.side1')] } };
  assert.equal(commandById('rib')?.available(bottomAndSide).ok, false);
});

test('opposite caps form a through Shell with four independent side walls', () => {
  const doc = rectanglePart(40, 30, 20), stock = evaluateDoc(doc, 1);
  assert.ok(stock.ok);
  const faces = ['n1.bottom', 'n1.top'].map(name => {
    const face = stock.bodies[0].mesh.faces.findIndex(candidate => candidate.nativePlaneName === name);
    assert.ok(face >= 0);
    return { body: 0, face };
  });
  const shell = commandById('shell')!;
  const ctx = { doc, bodies: stock.bodies, selection: { bodies: [], edges: [], faces } };
  const values = { ...shell.defaults!(ctx), wallMode: 'per-face', leftWall: 3, rightWall: 5, frontWall: 2, backWall: 4 };
  assert.deepEqual(shell.fields!(ctx, values).map(field => field.key), ['wallMode', 'frontWall', 'rightWall', 'backWall', 'leftWall']);
  const made = shell.build!(ctx, values);
  const opened = readStudioDoc(JSON.stringify(made));
  assert.ok('doc' in opened);
  const node = opened.doc.nodes[2];
  assert.ok(node.kind === 'shell-walls');
  assert.deepEqual([node.opening, node.secondOpening, node.walls], ['n1.top', 'n1.bottom', {
    'n1.side0': 2, 'n1.side1': 5, 'n1.side2': 4, 'n1.side3': 3,
  }]);
  const native = evaluateDoc(opened.doc, 2);
  assert.ok(native.ok && Math.abs(native.bodies[0].volume! - 8640) < 1e-7);
  const right = editFields(opened.doc.nodes, 2).find(field => field.key === 'rightWall');
  assert.ok(right?.kind === 'number');
  const edited = evaluateDoc({ ...opened.doc, nodes: right.set(opened.doc.nodes, 7) }, 3);
  assert.ok(edited.ok && Math.abs(edited.bodies[0].volume! - 9600) < 1e-7);
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

test('the revision-pinned local Shell tool keeps both original lateral openings and requires four named walls', async () => {
  const doc = rectanglePart(40, 30, 20), original = evaluateDoc(doc, 1);
  assert.ok(original.ok);
  const state = { doc, bodies: original.bodies };
  const evaluate = async (candidate: StudioDoc) => evaluateDoc(candidate, 1);
  const current = await dispatchTool(state, 'query', { action: 'rebuild' }, evaluate);
  assert.ok(!current.isError, current.content);
  const args = { action: 'command', command: 'shell', expectedRevision: JSON.parse(current.content).revision,
    faces: ['n1.side1', 'n1.side3'], values: { wallMode: 'per-face', bottomWall: 2, frontWall: 3, backWall: 4, topWall: 5 } };
  const result = await dispatchTool(state, 'features', args, evaluate);
  assert.ok(result.changed && !result.isError, result.content);
  const feature = result.state.doc.nodes[2];
  assert.ok(feature.kind === 'shell-walls');
  assert.deepEqual([feature.opening, feature.secondOpening].sort(), ['n1.side1', 'n1.side3']);
  assert.ok(Math.abs(result.state.bodies[0].volume! - 12040) < 1e-7);
  const duplicate = await dispatchTool(state, 'features', { ...args, faces: ['n1.side3', 'n1.side3'] }, evaluate);
  assert.ok(duplicate.isError && !duplicate.changed && duplicate.state.doc === doc, duplicate.content);
  const collapse = await dispatchTool(state, 'features', { ...args, values: { ...args.values, topWall: 18 } }, evaluate);
  assert.ok(collapse.isError && !collapse.changed && collapse.state.doc === doc, collapse.content);
  assert.match(collapse.content, /leave no cavity/i);
});

test('the local Shell tool requires one explicit current body key and six finite closed-wall values', async () => {
  const doc = rectanglePart(40, 30, 20), original = evaluateDoc(doc, 1);
  assert.ok(original.ok);
  const state = { doc, bodies: original.bodies }, evaluate = async (candidate: StudioDoc) => evaluateDoc(candidate, 1);
  const current = await dispatchTool(state, 'query', { action: 'rebuild' }, evaluate);
  assert.ok(!current.isError, current.content);
  const values = { wallMode: 'per-face', leftWall: 3, rightWall: 5, frontWall: 2, backWall: 4, bottomWall: 2, topWall: 3 };
  const args = { action: 'command', command: 'shell', expectedRevision: JSON.parse(current.content).revision, bodies: ['b1'], values };
  for (const [input, reason] of [
    [{ bodies: [] }, /one exact original rectangular body ID/],
    [{ bodies: ['b1', 'b1'] }, /one exact original rectangular body ID/],
    [{ point: [1, 2, 3] }, /one exact original rectangular body ID/],
    [{ faces: ['n1.top'] }, /one exact original rectangular body ID/],
    [{ values: { ...values, topWall: Infinity } }, /topWall/],
    [{ values: { ...values, topWall: undefined } }, /topWall/],
  ] as const) {
    const refused = await dispatchTool(state, 'features', { ...args, ...input }, evaluate);
    assert.ok(refused.isError && !refused.changed && refused.state.doc === doc, refused.content);
    assert.match(refused.content, reason);
  }
  const result = await dispatchTool(state, 'features', args, evaluate);
  assert.ok(result.changed && !result.isError, result.content);
  const feature = result.state.doc.nodes[2];
  assert.ok(feature.kind === 'shell-walls');
  assert.equal(feature.opening, null);
  assert.equal(Object.keys(feature.sigs).length, 6);
  assert.ok(Math.abs(result.state.bodies[0].volume! - 12480) < 1e-7);
});

test('a corner Shell preserves three original opening names and refuses ambiguous three-face selections', async () => {
  const doc = rectanglePart(40, 30, 20), original = evaluateDoc(doc, 1);
  assert.ok(original.ok);
  const shell = commandById('shell')!;
  const picks = (names: string[]) => names.map(name => {
    const face = original.bodies[0].mesh.faces.findIndex(candidate => candidate.nativePlaneName === name);
    assert.ok(face >= 0, name);
    return { body: 0, face };
  });
  const selected = ['n1.side0', 'n1.top', 'n1.side1'];
  const ctx = { doc, bodies: original.bodies, selection: { bodies: [], edges: [], faces: picks(selected) } };
  const values = { wallMode: 'per-face', bottomWall: 2, backWall: 4, leftWall: 3 };
  const built = shell.build!(ctx, values), feature = built.nodes[2];
  assert.ok(feature.kind === 'shell-walls');
  assert.deepEqual([feature.opening, feature.secondOpening, feature.thirdOpening], ['n1.top', 'n1.side1', 'n1.side0']);
  assert.deepEqual(feature, shell.build!({ ...ctx, selection: { ...ctx.selection, faces: picks([...selected].reverse()) } }, values).nodes[2]);
  assert.deepEqual(editFields(built.nodes, 2).map(field => field.key), ['bottomWall', 'backWall', 'leftWall']);
  const loaded = readStudioDoc(JSON.stringify(built));
  assert.ok('doc' in loaded);
  assert.deepEqual(loaded.doc.nodes[2], feature);
  const result = evaluateDoc(loaded.doc, 2);
  assert.ok(result.ok && Math.abs(result.bodies[0].volume! - 6684) < 1e-7);
  for (const patch of [{ thirdOpening: undefined }, { thirdOpening: feature.opening }, { secondOpening: undefined },
    { thirdOpening: 'n1.unknown', walls: { 'n1.side0': 3, 'n1.side2': 4, 'n1.bottom': 2 } }]) {
    assert.ok('error' in readStudioDoc(JSON.stringify({ ...built, nodes: [...built.nodes.slice(0, 2), { ...feature, ...patch }] })));
  }
  const duplicate = { ...ctx, selection: { ...ctx.selection, faces: picks(['n1.top', 'n1.side1', 'n1.top']) } };
  assert.equal(shell.fields?.(duplicate, values).some(field => field.key === 'wallMode'), false);
  assert.throws(() => shell.build!(duplicate, values), /three distinct faces/);
  const staleSignature = { ...feature, sigs: { ...feature.sigs, 'n1.side0': feature.sigs['n1.side2'], 'n1.side2': feature.sigs['n1.side0'] } };
  const stale = evaluateDoc({ ...built, nodes: [...built.nodes.slice(0, 2), staleSignature] }, 3);
  assert.ok(!stale.ok && /REFERENCE_MOVED/.test(stale.error.detail));

  const state = { doc, bodies: original.bodies };
  const evaluate = async (candidate: StudioDoc) => evaluateDoc(candidate, 1);
  const revision = JSON.parse((await dispatchTool(state, 'query', { action: 'rebuild' }, evaluate)).content).revision;
  const args = { action: 'command', command: 'shell', expectedRevision: revision, faces: selected, values };
  const tool = await dispatchTool(state, 'features', args, evaluate);
  assert.ok(tool.changed && !tool.isError, tool.content);
  assert.deepEqual(tool.state.doc.nodes[2], feature);
  for (const change of [{ faces: ['n1.top', 'n1.side1', 'n1.top'] }, { values: { ...values, leftWall: undefined } },
    { values: { ...values, bottomWall: 20 } }]) {
    const refused = await dispatchTool(state, 'features', { ...args, ...change }, evaluate);
    assert.ok(refused.isError && !refused.changed && refused.state.doc === doc, refused.content);
  }
});


test('three openings with an opposite pair have one canonical manual and revision-pinned Agent recipe', async () => {
  const doc = rectanglePart(40, 30, 20), original = evaluateDoc(doc, 1);
  assert.ok(original.ok);
  const shell = commandById('shell')!;
  const names = ['n1.bottom', 'n1.side0', 'n1.top'];
  const picks = names.map(name => {
    const face = original.bodies[0].mesh.faces.findIndex(candidate => candidate.nativePlaneName === name);
    assert.ok(face >= 0, name);
    return { body: 0, face };
  });
  const selection = { faces: picks, bodies: [], edges: [] };
  const values = { wallMode: 'per-face', leftWall: 3, rightWall: 5, backWall: 4 };
  const ctx = { doc, bodies: original.bodies, selection };
  const built = shell.build!(ctx, values), feature = built.nodes[2];
  assert.ok(feature.kind === 'shell-walls');
  assert.deepEqual([feature.opening, feature.secondOpening, feature.thirdOpening], ['n1.top', 'n1.bottom', 'n1.side0']);
  assert.deepEqual(feature, shell.build!({ ...ctx, selection: { ...selection, faces: [...picks].reverse() } }, values).nodes[2]);
  assert.deepEqual(editFields(built.nodes, 2).map(field => field.key), ['rightWall', 'backWall', 'leftWall']);
  const loaded = readStudioDoc(JSON.stringify(built));
  assert.ok('doc' in loaded);
  assert.deepEqual(loaded.doc.nodes[2], feature);
  const result = evaluateDoc(loaded.doc, 2);
  assert.ok(result.ok && Math.abs(result.bodies[0].volume! - 7360) < 1e-7);

  const state = { doc, bodies: original.bodies }, evaluate = async (candidate: StudioDoc) => evaluateDoc(candidate, 1);
  const expectedRevision = JSON.parse((await dispatchTool(state, 'query', { action: 'rebuild' }, evaluate)).content).revision;
  const args = { action: 'command', command: 'shell', expectedRevision, faces: names, values };
  const tool = await dispatchTool(state, 'features', args, evaluate);
  assert.ok(tool.changed && !tool.isError, tool.content);
  assert.deepEqual(tool.state.doc.nodes[2], feature);
  const collapse = await dispatchTool(state, 'features', { ...args, values: { ...values, rightWall: 37 } }, evaluate);
  assert.ok(collapse.isError && !collapse.changed && collapse.state.doc === doc, collapse.content);
});
