import type { Command } from '@barocss/cad-model/app/commands';
import { prefixDoc, type ModelNode, type StudioDoc } from '@barocss/cad-model/engine/doc';
import type { FriendlyError } from '@barocss/cad-model/engine/errors';
import { isRefusal } from '@barocss/cad-model/engine/refusal';
import { roundedInsetMinimumSpan } from '@barocss/cad-model/sketch/internal/roundedRectangleInset';
import { createRoundedInsetExtrusion, detachRoundedInsetRecipe, resizeRoundedInsetSource, roundedInsetSourceWidth } from '@barocss/cad-model/sketch/internal/roundedInsetRecipe';

export const LINKED_INSET_EXTRUDE: Command = {
  id: 'linked-inset-extrude', label: 'Linked inset extrude', icon: 'cad-extrude', group: 'create',
  available: ({ doc, selection, bodies, direct }) => {
    const { sketches, faces, edges, vertices, bodies: pickedBodies } = selection;
    if (doc.nodes.length === 1 && doc.nodes[0].kind === 'sketch' && doc.nodes[0].profile === 'loop'
      && sketches?.length === 1 && sketches[0] === 0 && !bodies.length
      && !faces.length && !edges.length && !vertices?.length && !pickedBodies.length && !direct?.length) return { ok: true };
    return { ok: false, reason: 'Select one finished rounded rectangle sketch in a standalone part.' };
  },
  defaults: () => ({ inset: 1, height: 10 }),
  fields: () => [
    { kind: 'mm', key: 'inset', label: 'Inset distance', min: 0 },
    { kind: 'mm', key: 'height', label: 'Extrude distance', min: 0 },
  ],
  build: ({ doc }, values) => createRoundedInsetExtrusion(doc, Number(values.inset), Number(values.height)),
};

interface RoundedInsetHistoryOptions {
  doc: StudioDoc;
  index: number | null;
  canChangeDocument(): boolean;
  ready(): boolean;
  stage(candidate: { next: StudioDoc; input: StudioDoc; failureTitle: string; roundedInset: 'edit' | 'detach' }): void;
  notice(error: FriendlyError): void;
}

export function createRoundedInsetHistoryEdit({ doc, index, canChangeDocument, ready, stage, notice }: RoundedInsetHistoryOptions) {
  return (nodes?: ModelNode[], sourceWidth?: number) => {
    if (!canChangeDocument()) return;
    const [source, current, extrude] = doc.nodes, draft = nodes?.[1];
    if (index !== 2 || doc.nodes.length !== 3 || source?.kind !== 'sketch' || current?.kind !== 'rounded-rectangle-inset'
      || extrude?.kind !== 'extrude' || extrude.sketch !== 1) return;
    const changesWidth = sourceWidth !== undefined && sourceWidth !== roundedInsetSourceWidth(source);
    const failureTitle = !nodes ? 'Inset not detached' : changesWidth ? 'Inset source width not changed' : 'Inset distance not changed';
    if (!ready()) {
      notice({ title: failureTitle, hint: 'Show the master at the latest History and wait for the part.', detail: '' });
      return;
    }
    try {
      let next: StudioDoc;
      if (!nodes) next = detachRoundedInsetRecipe(doc);
      else {
        if (draft?.kind !== 'rounded-rectangle-inset' || (!changesWidth && draft.insetMM === current.insetMM)) return;
        const resized = changesWidth ? resizeRoundedInsetSource(source, sourceWidth) : source;
        const recipe = draft.insetMM === current.insetMM ? current : { ...current, insetMM: draft.insetMM };
        next = { ...doc, nodes: [resized, recipe, extrude] };
      }
      stage({ next, input: prefixDoc(next, next.nodes.length), failureTitle, roundedInset: nodes ? 'edit' : 'detach' });
    } catch (error) {
      const radius = isRefusal(error, 'BAD_REFERENCE') && error.details?.roundedInsetSourceRadius;
      if (typeof radius === 'number') {
        const display = (value: number) => Number(value.toPrecision(12));
        notice({ title: failureTitle,
          hint: `With a ${display(radius)} mm corner radius, the straight span must exceed ${roundedInsetMinimumSpan} mm. Increase Source width above ${display(2 * radius + roundedInsetMinimumSpan)} mm.`,
          detail: '' });
      } else notice({ title: failureTitle, hint: error instanceof Error ? error.message : String(error), detail: '' });
    }
  };
}
