import { evaluateDoc } from '@barocss/cad-model/engine/evaluate';
import { mountNodes } from '@barocss/cad-model/app/mounts';
import { commands } from '@barocss/cad-model/app/commands';
import { readFileSync } from 'node:fs';
const sampleRows = JSON.parse(readFileSync('../../packages/barocss-cad-model/samples/rows/fastener-sizes.json', 'utf8')).rows;
import test from 'node:test';
import assert from 'node:assert/strict';
import type { ComponentProps, ReactElement } from 'react';
import { rectanglePart, type StudioDoc } from '@barocss/cad-model/engine/doc';
import type { EngineClient } from '../src/engine/client';
import { HistoryFeatureEditor } from '../src/ui/HistoryFeatureEditor';
import { NodeEditor } from '../src/ui/NodeEditor';
import { createValueStore } from '../src/state/valueStore';
import type { Active } from '../src/app/commandState';
import type { StudioNotice } from '../src/app/studioNotice';

function fixture() {
  const first = rectanglePart(30, 20, 10);
  const doc: StudioDoc = { ...first, nodes: [...first.nodes,
    { kind: 'sketch', id: 'n2', profile: 'rectangle', min: [2, 2], max: [5, 5] },
    { kind: 'extrude', id: 'n3', sketch: 2, height: 3 }],
    outputs: { ...first.outputs, b3: { node: 3, side: 'solid' } }, nextId: 4 };
  let current = doc, marker: number | null = null;
  let finish!: (value: Awaited<ReturnType<EngineClient['faceEndDistance']>>) => void;
  const active = createValueStore<Active | null>(null), notice = createValueStore<StudioNotice | null>(null), events: string[] = [];
  const props: ComponentProps<typeof HistoryFeatureEditor> = {
    model: { doc, evaluated: doc, commandDoc: doc, editNode: 3, fresh: true, busy: false, workerSession: 1 },
    owner: { document: () => current, evaluated: () => doc, marker: () => marker, variant: () => null,
      worker: () => 1, hasDraft: () => false, ownsEvaluatedSource: () => current === doc },
    commands: { ctx: { doc, bodies: [], selection: { faces: [], edges: [], bodies: [] } },
      discardFeatureDraft: () => { events.push('discard'); }, closeForCommand: () => { events.push('close'); },
      setActive: active.set, editSketch: index => { events.push(`sketch-${index}`); } },
    inset: { roundedPending: false, detach: () => {}, relink: undefined },
    editor: { onApply: () => {}, onClose: () => {}, onDelete: () => {},
      readAlignTargets: async () => { throw new Error('Not an Align feature'); } },
    worker: { faceEndDistance: () => { events.push('read'); return new Promise(resolve => { finish = resolve; }); } },
    canChangeDocument: () => true, onNotice: notice.set,
  };
  const editor = () => (HistoryFeatureEditor(props) as ReactElement<ComponentProps<typeof NodeEditor>>).props;
  return { props, editor, active, notice, events, stale: () => { current = { ...doc }; },
    rollBack: () => { marker = 0; }, finish: () => finish({ error: 'worker result' }) };
}
test('History editor composes existing evidence and source sketch without exposing irrelevant Align readers', () => {
  const f = fixture(), editor = f.editor();
  assert.equal(editor.nodes, f.props.model.doc.nodes); assert.equal(editor.onApply, f.props.editor.onApply);
  assert.equal(editor.onClose, f.props.editor.onClose); assert.equal(editor.onDelete, f.props.editor.onDelete);
  assert.equal(editor.readAlignTargets, undefined); editor.onEditSketch?.(); assert.deepEqual(f.events, ['sketch-2']);
});
test('owned end-face transition discards draft and closes editor before launching saved command', () => {
  const f = fixture(), editor = f.editor(); assert.ok(editor.onPickEndFace); editor.onPickEndFace();
  assert.deepEqual(f.events, ['discard', 'close']); assert.equal(f.active.get()?.cmd.id, 'extrude-end-face-edit');
  assert.equal(f.active.get()?.ctx, f.props.commands.ctx); assert.equal(f.active.get()?.preview, 'busy');
});
for (const change of ['stale', 'rollBack'] as const) {
  test(`end-face transition refuses ${change} ownership without closing or launching`, () => {
    const f = fixture(), editor = f.editor(); f[change](); editor.onPickEndFace?.();
    assert.deepEqual(f.events, []); assert.equal(f.active.get(), null);
    assert.equal(f.notice.get()?.title, 'End face not started');
  });
}
test('distance read refuses stale ownership both before and after asynchronous worker read', async () => {
  const f = fixture(), editor = f.editor(), pending = editor.readFaceEndDistance!();
  f.stale(); f.finish(); assert.deepEqual(await pending, { error: 'The source changed. Open the current feature again.' });
  assert.deepEqual(f.events, ['read']); const rejected = await editor.readFaceEndDistance!();
  assert.ok('error' in rejected); assert.deepEqual(f.events, ['read']);
});
test('busy History cannot transition to end-face picking', () => {
  const f = fixture(); f.props.model.busy = true; f.editor().onPickEndFace?.();
  assert.equal(f.active.get(), null); assert.deepEqual(f.events, []);
});

function fastenerFixture() {
  const f = fixture(), cmd = commands.find(c => c.id === 'fastener')!;
  const ctx = { ...f.props.commands.ctx, doc: { ...rectanglePart(64, 32, 8), fastenerSizes: { version: 1 as const, rows: sampleRows } } };
  const doc = cmd.build!(ctx, { ...cmd.defaults!(ctx), kind: 'hex-bolt', size: 'M6', length: '20',
    joint: 'nut', model: 'cosmetic', x: 32, y: 16, z: 8, grip: 8, holeD: 6.6 });
  f.props.model = { ...f.props.model, doc, evaluated: doc, commandDoc: doc, editNode: doc.nodes.length - 1 };
  f.props.commands.ctx = { ...ctx, doc };
  f.props.owner = { ...f.props.owner, document: () => doc, evaluated: () => doc, ownsEvaluatedSource: () => true };
  return f;
}
test('saved Fastener History starts the existing grouped command with placement and fit evidence', () => {
  const f = fastenerFixture(), action = f.editor().savedFeatureEdit;
  assert.equal(action?.label, 'Edit Fastener'); action!.start();
  assert.deepEqual(f.events, ['discard', 'close']);
  assert.equal(f.active.get()?.cmd.label, 'Edit Fastener');
  assert.equal(f.active.get()?.values.holeD, 6.6);
  assert.equal(f.active.get()?.values.joint, 'nut');
  assert.equal(f.active.get()?.ctx, f.props.commands.ctx);
});
for (const failure of ['document', 'evaluated', 'worker', 'marker', 'variant', 'draft', 'fresh', 'busy', 'permission', 'source', 'context'] as const) {
  test(`saved Fastener transition refuses ${failure} without discarding or launching`, () => {
    const f = fastenerFixture();
    if (failure === 'fresh') f.props.model.fresh = false;
    if (failure === 'busy') f.props.model.busy = true;
    if (failure === 'context') f.props.commands.ctx = { ...f.props.commands.ctx, doc: { ...f.props.model.doc } };
    const action = f.editor().savedFeatureEdit; assert.ok(action);
    if (failure === 'document') f.props.owner.document = () => ({ ...f.props.model.doc });
    if (failure === 'evaluated') f.props.owner.evaluated = () => ({ ...f.props.model.evaluated });
    if (failure === 'worker') f.props.owner.worker = () => 2;
    if (failure === 'marker') f.props.owner.marker = () => 0;
    if (failure === 'variant') f.props.owner.variant = () => 'other';
    if (failure === 'draft') f.props.owner.hasDraft = () => true;
    // These functions are captured when rendered, as in the other saved-command entries.
    if (failure === 'permission') { f.props.canChangeDocument = () => false; f.editor().savedFeatureEdit!.start(); }
    else if (failure === 'source') { f.props.owner.ownsEvaluatedSource = () => false; f.editor().savedFeatureEdit!.start(); }
    else action.start();
    assert.deepEqual(f.events, []); assert.equal(f.active.get(), null);
  });
}
test('ordinary feature History does not offer grouped Fastener entry', () => {
  assert.equal(fixture().editor().savedFeatureEdit, undefined);
});

for (const failure of ['document', 'evaluated', 'worker', 'marker', 'variant'] as const) {
  test(`launched saved Fastener retains live ${failure} ownership until Apply`, () => {
    const f = fastenerFixture(); f.editor().savedFeatureEdit!.start();
    const owns = f.active.get()!.ownsSource!; assert.equal(owns(), true);
    if (failure === 'document') f.props.owner.document = () => ({ ...f.props.model.doc });
    if (failure === 'evaluated') f.props.owner.evaluated = () => ({ ...f.props.model.evaluated });
    if (failure === 'worker') f.props.owner.worker = () => 2;
    if (failure === 'marker') f.props.owner.marker = () => 0;
    if (failure === 'variant') f.props.owner.variant = () => 'other';
    assert.equal(owns(), false);
  });
}

function mountFixture() {
  const f = fixture(), base: StudioDoc = { ...rectanglePart(160, 100, 10), mounts: { version: 1,
    rows: JSON.parse(readFileSync('../../packages/barocss-cad-model/samples/rows/mounts.json', 'utf8')).rows } };
  const result = evaluateDoc(base, 0); assert.ok(result.ok);
  const face = result.bodies[0].mesh.faces.find(face => face.name === 'n1.top')!;
  const ctx = { doc: base, bodies: result.bodies, selection: { bodies: [], edges: [], faces: [{ body: 0, face: face.index }] } };
  const doc = mountNodes(ctx, { row: 'nema17', x: 80, y: 50, turn: '0', pilot: 'through' });
  f.props.model = { ...f.props.model, doc, evaluated: doc, commandDoc: doc, editNode: doc.nodes.length - 1 };
  f.props.commands.ctx = { ...ctx, doc };
  f.props.owner = { ...f.props.owner, document: () => doc, evaluated: () => doc, ownsEvaluatedSource: () => true };
  return f;
}
test('terminal Mount History starts grouped Edit Mount with live source ownership', () => {
  const f = mountFixture(); const action = f.editor().savedFeatureEdit; assert.equal(action?.label, 'Edit Mount');
  action!.start(); assert.deepEqual(f.events, ['discard', 'close']);
  assert.equal(f.active.get()?.cmd.id, 'edit'); assert.equal(f.active.get()?.values.row, 'nema17');
  assert.equal(f.active.get()?.ownsSource?.(), true); f.props.owner.worker = () => 2;
  assert.equal(f.active.get()?.ownsSource?.(), false);
});
test('Mount source draft blocks entry and inner group rows do not offer a guessed owner', () => {
  const f = mountFixture(); f.props.owner.hasDraft = () => true; f.editor().savedFeatureEdit!.start();
  assert.deepEqual(f.events, []); assert.equal(f.active.get(), null);
  f.props.model.editNode = 2; assert.equal(f.editor().savedFeatureEdit, undefined);
});

function connectorFixture() {
  const f = fixture(), base: StudioDoc = { ...rectanglePart(40, 20, 10), connectors: { version: 1, rows: [{ id: 'port', estimate: true, opening: { shape: 'rect', width: 8, height: 4, depth: 6 }, body: { shape: 'rect', width: 7, height: 3, length: 7 }, keepOut: { margin: 1, depth: 15 } }] } };
  const result = evaluateDoc(base, 0); assert.ok(result.ok);
  const face = result.bodies[0].mesh.faces.find(face => face.name === 'n1.top')!;
  const ctx = { doc: base, bodies: result.bodies, selection: { bodies: [], edges: [], faces: [{ body: 0, face: face.index }] } };
  const command = commands.find(c => c.id === 'connector')!, doc = command.build!(ctx, command.defaults!(ctx));
  f.props.model = { ...f.props.model, doc, evaluated: doc, commandDoc: doc, editNode: 2 };
  f.props.commands.ctx = { ...ctx, doc };
  f.props.owner = { ...f.props.owner, document: () => doc, evaluated: () => doc, ownsEvaluatedSource: () => true };
  return f;
}
test('connector History shares guarded admission for opening and body with live source ownership', () => {
  const f = connectorFixture();
  for (const index of [2, 3]) { f.props.model.editNode = index; assert.equal(f.editor().savedFeatureEdit?.label, 'Edit connector placement'); }
  f.editor().savedFeatureEdit!.start(); assert.deepEqual(f.events, ['discard', 'close']);
  assert.equal(f.active.get()?.cmd.id, 'edit'); assert.equal(f.active.get()?.ownsSource?.(), true);
  f.props.owner.worker = () => 2; assert.equal(f.active.get()?.ownsSource?.(), false);
});
test('connector History blocks stale or drafted sources before command creation', () => {
  for (const changed of ['draft', 'document'] as const) {
    const f = connectorFixture(), action = f.editor().savedFeatureEdit!;
    if (changed === 'draft') f.props.owner.hasDraft = () => true;
    else f.props.owner.document = () => ({ ...f.props.model.doc });
    action.start(); assert.deepEqual(f.events, []); assert.equal(f.active.get(), null);
  }
});

function subdPrimitiveFixture() {
  const f = fixture(), source = rectanglePart(10, 10, 10), command = commands.find(c => c.id === 'subd-torus')!;
  const ctx = { doc: source, bodies: [], selection: { bodies: [], edges: [], faces: [] } };
  const doc = command.build!(ctx, { R: 12, r: 3, nu: 8, nv: 4, x: 30, y: 0, z: 0 });
  f.props.model = { ...f.props.model, doc, evaluated: doc, commandDoc: doc, editNode: 2 };
  f.props.commands.ctx = { ...ctx, doc };
  f.props.owner = { ...f.props.owner, document: () => doc, evaluated: () => doc, ownsEvaluatedSource: () => true };
  return f;
}
test('owned SubD primitive enters saved command and retires on source change', () => {
  const f = subdPrimitiveFixture(), action = f.editor().savedFeatureEdit;
  assert.equal(action?.label, 'Edit SubD torus');action!.start();
  assert.deepEqual(f.events, ['discard', 'close']);assert.equal(f.active.get()?.values.nu, 8);
  assert.equal(f.active.get()?.ownsSource?.(), true);f.props.owner.document = () => ({ ...f.props.model.doc });
  assert.equal(f.active.get()?.ownsSource?.(), false);
});
test('SubD primitive draft blocks entry and a changed cage never gains primitive controls', () => {
  const f = subdPrimitiveFixture(); f.props.owner.hasDraft = () => true; f.editor().savedFeatureEdit!.start();
  assert.deepEqual(f.events, []);
  const doc = f.props.model.doc, node = doc.nodes[2];assert.equal(node.kind, 'subd');if(node.kind!=='subd')return;
  const positions = [...node.cage.positions];positions[0] += 1;
  const changed = { ...doc, nodes: doc.nodes.map((n,i)=>i===2?{...node,cage:{...node.cage,positions}}:n) };
  f.props.model = { ...f.props.model, doc: changed, evaluated: changed, commandDoc: changed };
  assert.equal(f.editor().savedFeatureEdit, undefined);
});

function mirrorFixture() {
  const f = fixture(), base = rectanglePart(40, 24, 10), result = evaluateDoc(base, 0); assert.ok(result.ok);
  const ctx = { doc: base, bodies: result.bodies, selection: { bodies: [0], edges: [], faces: [] } };
  const command = commands.find(c => c.id === 'mirror')!, doc = command.build!(ctx, { plane: 'yz', at: 40 });
  f.props.model = { ...f.props.model, doc, evaluated: doc, commandDoc: doc, editNode: doc.nodes.length - 1 };
  f.props.commands.ctx = { ...ctx, doc };
  f.props.owner = { ...f.props.owner, document: () => doc, evaluated: () => doc, ownsEvaluatedSource: () => true };
  return f;
}
test('each saved Mirror group row opens one atomic editor with current source ownership', () => {
  for (const index of [2, 3, 4]) {
    const f = mirrorFixture(); f.props.model.editNode = index;
    const action = f.editor().savedFeatureEdit; assert.equal(action?.label, 'Edit Mirror'); action!.start();
    assert.deepEqual(f.events, ['discard', 'close']); assert.equal(f.active.get()?.values.at, 40);
    assert.equal(f.active.get()?.ownsSource?.(), true); f.props.owner.worker = () => 2;
    assert.equal(f.active.get()?.ownsSource?.(), false);
  }
});
test('Mirror source draft blocks grouped entry and ordinary source rows do not inherit it', () => {
  const f = mirrorFixture(); f.props.owner.hasDraft = () => true; f.editor().savedFeatureEdit!.start();
  assert.deepEqual(f.events, []); assert.equal(f.active.get(), null);
  f.props.model.editNode = 1; assert.equal(f.editor().savedFeatureEdit, undefined);
});
