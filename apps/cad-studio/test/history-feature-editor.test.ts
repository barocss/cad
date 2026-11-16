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
