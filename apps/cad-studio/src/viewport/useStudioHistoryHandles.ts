import { useEffect, useLayoutEffect, useMemo } from 'react';
import { historyHandleIsCurrent } from '../app/commandState';
import { useHistoryFilletRadius } from '../app/useHistoryFilletRadius';
import { useSplitSourceBounds } from '../app/useSplitSourceBounds';
import { useCommandGizmos } from './useCommandGizmos';

type GizmoOptions = Parameters<typeof useCommandGizmos>[0];
type SplitOptions = Parameters<typeof useSplitSourceBounds>[0];
type FilletOptions = Parameters<typeof useHistoryFilletRadius>[0];
interface Options extends Pick<GizmoOptions, 'model' | 'context' | 'drag'> {
  command: GizmoOptions['command'] & { readActive: NonNullable<GizmoOptions['command']['readActive']> };
  source: Pick<SplitOptions['source'], 'commandDoc' | 'variant' | 'fresh' | 'busy' | 'instances' | 'inPlace'> &
    Pick<FilletOptions, 'worker' | 'open' | 'scope'> & {
      engine: SplitOptions['engine']; nextRevision(): number;
  };
  enabled: { viewport: boolean; fillet: boolean };
  ownership: {
    split(): boolean; fillet(): boolean; editor(): boolean; idle(): boolean; canChangeDocument(): boolean;
  };
  lifecycle: { previewBodies: GizmoOptions['model']['bodies'] | null; retirePreview(): void; clearApply(): void };
}

/** Read original History geometry before offering a handle, and retire drags when their source changes. */
export function useStudioHistoryHandles({ model, command, source, context, drag, enabled, ownership, lifecycle }: Options) {
  const { doc, evaluated, bodies, marker, editNode } = model;
  const { active, readActive, setActive } = command;
  const { commandDoc, engine, worker, open, variant, fresh, busy, instances, inPlace, scope, nextRevision } = source;
  const { sketch, rendering, drawing, measure, assemblyDraft } = context;
  const allowed = enabled.viewport && !sketch && !rendering && !drawing && !measure && !assemblyDraft;
  const splitSource = useSplitSourceBounds({
    source: { doc, commandDoc, evaluated, worker, open, engine, marker, variant, fresh, busy, instances, inPlace },
    index: editNode, enabled: allowed && !active, engine, nextRevision,
    liveSourceCurrent: ownership.split, editorCurrent: () => ownership.editor() && !readActive(),
  });
  const historyFillet = useHistoryFilletRadius({
    doc, commandDoc, evaluated, bodies, index: editNode, worker, open, scope, engine, readIdle: !active,
    enabled: allowed && enabled.fillet, revision: nextRevision,
    idle: ownership.idle, liveSourceCurrent: ownership.fillet,
  });

  useLayoutEffect(() => {
    const running = readActive();
    if (!running || historyHandleIsCurrent(running)) return;
    lifecycle.retirePreview();
    lifecycle.clearApply();
    setActive(current => current === running ? null : current);
  });
  const gizmos = useCommandGizmos({
    model, command, context, drag, historyFillet,
    retireScalarDraft: () => { lifecycle.retirePreview(); lifecycle.clearApply(); },
    splitSource: { evidence: splitSource, canStart: evidence => {
      const running = readActive();
      return ownership.canChangeDocument() && (running
        ? !!evidence && running.ctx.splitSourceBounds === evidence && running.ownsSource?.() === true
        : ownership.editor());
    } },
  });
  const { bodyDrag } = drag;
  const { gizmo, handles, cmdBody } = gizmos;
  useEffect(() => gizmos.settleDrag(), [lifecycle.previewBodies, bodyDrag, active]);
  useEffect(() => gizmos.resetDrag(), [active?.cmd.id]);
  const dragTransforms = useMemo(() => cmdBody !== undefined && bodyDrag ? new Map([[cmdBody, bodyDrag.matrix]]) : null, [cmdBody, bodyDrag]);
  return { gizmo, handles, dragTransforms };
}
