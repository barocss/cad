import { insetRelinkReadiness } from '@barocss/cad-model/app/associativeInsetRelink';
import { bodyName } from '@barocss/cad-model/app/bodies';
import type { Ctx, Selection } from '@barocss/cad-model/app/commands';
import { bodyLookRef } from '@barocss/cad-model/app/lookKey';
import { featureLabel, type BodyRef, type StudioDoc } from '@barocss/cad-model/engine/doc';
import { bodyKeyFor, featureId } from '@barocss/cad-model/engine/ids';
import { currentNativePlanePick } from '../app/midpointSketch';
import type { StudioNotice } from '../app/studioNotice';
import type { EngineClient } from '../engine/client';
import type { useInsetRelink } from './useInsetRelink';

type Current<T> = { readonly current: T };

interface InsetSourceReviewOptions {
  model: { doc: StudioDoc; evaluated: StudioDoc; ctx: Ctx; editNode: number | null };
  owner: {
    doc: Current<StudioDoc>; evaluated: Current<StudioDoc>; open: Current<object>; worker: Current<number>;
    work: Current<{ generation: object; scope: object }>;
    footprint: Current<{ insetReady: boolean; editor: number | null; selection: Selection | null }>;
    commandRunning(): boolean;
  };
  preview: {
    engine: Pick<EngineClient, 'previewInsetRelink'>; nextRevision(): number;
    start: ReturnType<typeof useInsetRelink>['start']; cancelNativeReview(): void;
  };
  changes: {
    canChangeDocument(): boolean; commit(next: StudioDoc): boolean;
    onNotice(notice: StudioNotice): void; focusHistory(index: number | null): void;
  };
}

/** Bind a source review to the exact document, History editor and viewport pick. */
export function createInsetSourceReview({ model, owner, preview, changes }: InsetSourceReviewOptions): {
  problem?: string; start?: (opener: HTMLButtonElement) => void;
} {
  const { doc, evaluated, ctx, editNode } = model;
  const feature = editNode === null ? undefined : doc.nodes[editNode];
  const index = feature?.kind === 'sketch' ? editNode : feature?.kind === 'extrude' ? feature.sketch : null;
  if (index === null) return {};
  const sketch = doc.nodes[index];
  if (sketch?.kind !== 'sketch' || !sketch.association) return {};
  const { association, on: target } = sketch;
  const { problem } = insetRelinkReadiness(doc, index);
  if (problem) return { problem };

  function referenceLabel(key: string, id: string, ref?: BodyRef) {
    const body = ctx.bodies.find(candidate => candidate.key === key);
    if (body) return `${bodyName(doc, body)} · ${id}`;
    const step = ref && doc.nodes[ref.node];
    if (!ref || !step) return id;
    const look = bodyLookRef(doc.nodes, ref);
    const name = doc.bodies?.[bodyKeyFor(doc.nodes, look.node, look.side)]?.name;
    const earlier = `Earlier History · ${featureLabel(step, ref.node, doc.nodes)}`;
    return name ? `${name} · ${id} · ${earlier}` : `${id} · ${earlier}`;
  }

  return { start(opener) {
    if (!target) return;
    const refuse = (hint: string, detail = '') => changes.onNotice({ title: 'Inset source not replaced', hint, detail });
    if (!owner.footprint.current.insetReady || owner.doc.current !== doc || !changes.canChangeDocument()) {
      refuse('Return to the current part and wait for the model to finish.');
      return;
    }
    const { selection } = ctx, { faces, edges, bodies, sketches, vertices } = selection;
    const pick = faces.length === 1 && !edges.length && !bodies.length && !sketches?.length && !vertices?.length && !ctx.direct?.length
      ? currentNativePlanePick(ctx, faces[0], doc) : null;
    if (!pick) { refuse('Select one visible native planar face from an earlier solid.'); return; }
    const open = owner.open.current, worker = owner.worker.current, work = owner.work.current;
    const current = () => owner.open.current === open && owner.worker.current === worker
      && owner.work.current.generation === work.generation && owner.work.current.scope === work.scope
      && owner.doc.current === doc && owner.evaluated.current === evaluated && owner.footprint.current.selection === selection
      && owner.footprint.current.editor === editNode && owner.footprint.current.insetReady && !owner.commandRunning();
    const source = association.source;
    preview.cancelNativeReview();
    preview.start({
      labels: {
        before: referenceLabel(bodyKeyFor(doc.nodes, source.node, source.side), association.face, source),
        after: referenceLabel(pick.bodyKey, pick.face.name),
        target: referenceLabel(bodyKeyFor(doc.nodes, target.node, target.side), featureId(doc.nodes, target.node), target),
      },
      current,
      read: () => preview.engine.previewInsetRelink(doc, index,
        { bodyKey: pick.bodyKey, faceId: pick.face.id, faceName: pick.face.name }, preview.nextRevision()),
      refuse: reply => {
        if (reply.field === 'insetMM') refuse('The inset closes on this face. Select a wider planar face and retry.', reply.error);
        else refuse(reply.error);
      },
      returnFocus: () => requestAnimationFrame(() => {
        if (current() && opener.isConnected && !opener.disabled && document.activeElement === document.body) opener.focus();
      }),
      apply: ({ association: updated }) => {
        if (!current() || !changes.canChangeDocument()) return;
        const nodes = doc.nodes.map((node, i) => i === index ? { ...sketch, association: updated } : node);
        const next = { ...doc, nodes };
        if (!changes.commit(next)) return;
        requestAnimationFrame(() => {
          if (owner.doc.current === next && document.activeElement === document.body) changes.focusHistory(editNode);
        });
      },
    });
  } };
}
