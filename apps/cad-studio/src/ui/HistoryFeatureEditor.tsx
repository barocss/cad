import { loftSectionHistoryEdit } from '@barocss/cad-model/app/loftSectionHistoryEdit';
import { sweepHistoryEdit } from '@barocss/cad-model/app/sweepHistoryEdit';
import { mirrorHistoryEdit } from '@barocss/cad-model/app/mirrorEdit';
import { subdPrimitiveHistoryEdit } from '@barocss/cad-model/app/subdPrimitiveEdit';
import { connectorHistoryEdit } from '@barocss/cad-model/app/connectorEdit';
import { mountHistoryEdit } from '@barocss/cad-model/app/mountEdit';
import { fastenerHistoryEdit } from '@barocss/cad-model/app/editCommand';
import type { ComponentProps, Dispatch, SetStateAction } from 'react';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { Ctx } from '@barocss/cad-model/app/commands';
import { canEditSavedExtrudeEndFace, editSavedExtrudeEndFaceCommand } from '@barocss/cad-model/app/extrudeEndFaceEdit';
import { canEditSavedOffsetFace, editSavedOffsetFaceCommand } from '@barocss/cad-model/app/offsetFaceEdit';
import { editSavedDraftCommand } from '@barocss/cad-model/app/draftEdit';
import { roundedInsetSourceWidth } from '@barocss/cad-model/sketch/internal/roundedInsetRecipe';
import { sharedHoleLayoutPair, sharedHoleLayoutCommand } from '../app/sharedHoleLayout';
import type { Active } from '../app/commandState';
import type { StudioNotice } from '../app/studioNotice';
import type { EngineClient } from '../engine/client';
import { NodeEditor } from './NodeEditor';

type Editor = ComponentProps<typeof NodeEditor>;
interface Props {
  model: { doc: StudioDoc; evaluated: StudioDoc; commandDoc: StudioDoc; editNode: number;
    fresh: boolean; busy: boolean; workerSession: number };
  owner: { document(): StudioDoc; evaluated(): StudioDoc; marker(): number | null;
    variant(): string | null; worker(): number; hasDraft(): boolean; ownsEvaluatedSource(): boolean };
  commands: { ctx: Ctx; discardFeatureDraft(): void; closeForCommand(): void;
    setActive: Dispatch<SetStateAction<Active | null>>; editSketch(index: number): void; replaceAxis?(): void };
  inset: { roundedPending: boolean; detach(): void; problem?: string; relink: Editor['onRelinkInset'] };
  editor: Pick<Editor, 'onFilletStations' | 'filletEndpoints' | 'alignPreview' | 'readAlignTargets' |
    'edgeReplacement' | 'onDraft' | 'pending' | 'onApply' | 'onDelete' | 'onClose'>;
  worker: Pick<EngineClient, 'faceEndDistance'>;
  canChangeDocument(): boolean;
  onNotice: Dispatch<SetStateAction<StudioNotice | null>>;
}
/** Base-part History composition and saved-command admission; App owns draft lifetime and accepted changes. */
export function HistoryFeatureEditor({ model, owner, commands, inset, editor, worker,
  canChangeDocument, onNotice: setToast }: Props) {
  const { doc, evaluated, commandDoc, editNode, fresh, busy, workerSession } = model;
  const { ctx, discardFeatureDraft, closeForCommand, setActive, editSketch, replaceAxis } = commands;
  const { ownsEvaluatedSource } = owner;
  const savedCommand = () => fastenerHistoryEdit(editNode, commandDoc.nodes, commandDoc)?.command ?? mountHistoryEdit(commandDoc, editNode) ?? connectorHistoryEdit(commandDoc, editNode) ?? subdPrimitiveHistoryEdit(commandDoc, editNode) ?? mirrorHistoryEdit(commandDoc, editNode) ?? sweepHistoryEdit(commandDoc, editNode) ?? loftSectionHistoryEdit(commandDoc, editNode);
  const savedFeature = savedCommand();
  return <NodeEditor {...editor} nodes={doc.nodes} parameters={doc.parameters} doc={doc} index={editNode}
    bearingAssembly={{ root: doc, owner: 'base' }}
    readAlignTargets={doc.nodes[editNode]?.kind === 'align' ? editor.readAlignTargets : undefined}
    pendingLabel={inset.roundedPending ? 'Checking the rounded inset…' : doc.nodes[editNode]?.kind === 'fill-feature-pattern' ? 'Checking the fill cut pattern…' : 'Checking the path cut pattern…'}
    onRefuse={m => setToast({ title: 'Cannot bind that value', hint: m, detail: '' })}
    onDetachInset={editNode === 2 && doc.nodes[1]?.kind === 'rounded-rectangle-inset' ? inset.detach : undefined}
    insetSourceWidth={editNode === 2 && doc.nodes[1]?.kind === 'rounded-rectangle-inset' && doc.nodes[0]?.kind === 'sketch' ? roundedInsetSourceWidth(doc.nodes[0]) : undefined}
    insetRelinkProblem={inset.problem} onRelinkInset={inset.relink}
    onDelete={doc.nodes[1]?.kind === 'rounded-rectangle-inset' ? undefined : editor.onDelete}
    onEditSketch={(() => {
      const n = doc.nodes[editNode], s = n?.kind === 'sketch' || n?.kind === 'driven-sketch' ? editNode : n && 'sketch' in n ? n.sketch : null;
      if (s === null || (doc.nodes[s]?.kind !== 'sketch' && doc.nodes[s]?.kind !== 'driven-sketch')) return undefined;
      return () => {
        if (doc.nodes[s]?.kind === 'driven-sketch') { setToast({ title: 'Cannot edit sketch', hint: 'Unbind the line length before editing this sketch.', detail: '' }); return; }
        editSketch(s);
      };
    })()} onReplaceAxis={replaceAxis}
    savedFeatureEdit={savedFeature ? { label: savedFeature.label, start: () => {
      if (owner.document() !== doc || owner.evaluated() !== evaluated || owner.worker() !== workerSession
        || !ownsEvaluatedSource() || owner.marker() !== null || owner.variant() || owner.hasDraft()
        || !fresh || busy || ctx.doc !== commandDoc || !canChangeDocument()) return;
      const saved = savedCommand();
      if (!saved || !saved.available(ctx).ok) return;
      discardFeatureDraft(); closeForCommand();
      setActive({ cmd: saved, ctx, values: saved.defaults?.(ctx) ?? {}, preview: 'busy',
        ownsSource: () => owner.document() === doc && owner.evaluated() === evaluated
          && owner.worker() === workerSession && owner.marker() === null && !owner.variant() });
    } } : undefined}
    onEditDraft={editSavedDraftCommand(commandDoc, editNode) ? () => {
      if (!ownsEvaluatedSource() || owner.marker() !== null || owner.variant() || !fresh || busy || !canChangeDocument()) return;
      const cmd = editSavedDraftCommand(commandDoc, editNode);
      if (!cmd) return;
      discardFeatureDraft();
      closeForCommand();
      setActive({ cmd, ctx, values: cmd.defaults?.(ctx) ?? {}, preview: 'busy' });
    } : undefined}
    onEditSharedHoleLayout={sharedHoleLayoutPair(doc.nodes, editNode) ? () => {
      if (owner.document() !== doc || !ownsEvaluatedSource() || owner.marker() !== null || owner.variant() || !fresh || busy || owner.hasDraft() || !canChangeDocument()) return;
      const pair = sharedHoleLayoutPair(doc.nodes, editNode);
      if (!pair) return;
      const cmd = sharedHoleLayoutCommand(doc, pair, () => owner.document() === doc && owner.marker() === null && !owner.variant()
        && owner.evaluated() === evaluated && owner.worker() === workerSession);
      if (!cmd.available(ctx).ok) return;
      discardFeatureDraft(); closeForCommand();
      setActive({ cmd, ctx, values: cmd.defaults?.(ctx) ?? {}, preview: 'busy' });
    } : undefined}
    onEditOffset={canEditSavedOffsetFace(commandDoc, editNode) ? () => {
      if (!ownsEvaluatedSource() || owner.marker() !== null || owner.variant() || !fresh || busy || !canChangeDocument()) return;
      const cmd = editSavedOffsetFaceCommand(commandDoc, editNode);
      if (!cmd) return;
      discardFeatureDraft();
      closeForCommand();
      setActive({ cmd, ctx, values: cmd.defaults?.(ctx) ?? {}, preview: 'busy' });
    } : undefined}
    onPickEndFace={canEditSavedExtrudeEndFace(doc, editNode) ? () => {
      if (owner.document() !== doc || owner.evaluated() !== evaluated || owner.marker() !== null || owner.variant()
        || !fresh || busy || !canChangeDocument()) {
        setToast({ title: 'End face not started', hint: 'Show the master at the latest History and wait for the model.', detail: '' });
        return;
      }
      const cmd = editSavedExtrudeEndFaceCommand(commandDoc, editNode);
      if (!cmd) return;
      discardFeatureDraft();
      closeForCommand();
      setActive({ cmd, ctx, values: cmd.defaults?.(ctx) ?? {}, preview: 'busy' });
    } : undefined}
    readFaceEndDistance={async () => {
      const current = () => owner.document() === doc && owner.evaluated() === evaluated && owner.marker() === null && !owner.variant();
      if (!current() || !fresh || busy || !canChangeDocument()) {
        return { error: 'Show the master at the latest History and wait for the model before detaching.' };
      }
      const result = await worker.faceEndDistance(doc, editNode);
      return current() ? result : { error: 'The source changed. Open the current feature again.' };
    }} />;
}
