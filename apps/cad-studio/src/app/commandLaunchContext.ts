import type { Command, Ctx, Selection } from '@barocss/cad-model/app/commands';
import type { BodyRef, StudioDoc } from '@barocss/cad-model/engine/doc';
import { cutPatternSourceLabel, earlierRectangularCutSource, isCutPattern, selectedCutPatternSource } from './cutPatternSource';
import { currentNativePlanePick } from './midpointSketch';
import { LINKED_INSET_EXTRUDE } from './roundedInsetCommand';
import type { StudioNotice } from './studioNotice';

interface CutPatternLaunch {
  command: Command;
  ctx: Ctx;
  doc: StudioDoc;
  selection: Selection;
  intent: { doc: StudioDoc; selection: Selection; index: number } | null;
  canUseEarlier: boolean;
}

/** Match the explicitly selected cut to the current selection before a pattern can open. */
export function prepareCutPatternLaunch({ command, ctx, doc, selection, intent, canUseEarlier }: CutPatternLaunch):
  { source?: BodyRef } | { notice: StudioNotice } {
  if (!isCutPattern(command.id) || !intent || intent.doc !== doc || intent.selection !== selection) return {};
  const source = canUseEarlier ? earlierRectangularCutSource(ctx, command.id, intent.index) : undefined;
  if (source) return { source };
  const currentIndex = selectedCutPatternSource(ctx);
  if (currentIndex === intent.index) return {};
  const earlier = cutPatternSourceLabel(doc.nodes, intent.index);
  const current = cutPatternSourceLabel(ctx.doc.nodes, currentIndex);
  return { notice: {
    title: `${command.label} can’t repeat ${earlier}`,
    hint: current ? `Select the body to repeat ${current}.` : 'Select a current Subtract result.',
    detail: '',
  } };
}

interface LaunchContext {
  command: Command;
  ctx: Ctx;
  doc: StudioDoc;
  shownDoc: StudioDoc;
  selection: Selection;
  hasDirectSelection: boolean;
  nativePlaneReady: boolean;
  snapStep: number;
  cutSource?: BodyRef;
}

/** Carry the authored source required by the tool while it previews the evaluated prefix. */
export function commandLaunchContext({ command, ctx, doc, shownDoc, selection, hasDirectSelection,
  nativePlaneReady, snapStep, cutSource }: LaunchContext): Ctx {
  if (cutSource) return { ...ctx, rectangularCutSource: cutSource };
  if (command.id === 'split' && selection.faces.length === 1 && !selection.edges.length
    && !selection.bodies.length && !selection.vertices?.length && !selection.sketches?.length && !hasDirectSelection
    && nativePlaneReady && currentNativePlanePick(ctx, selection.faces[0], doc))
    return { ...ctx, splitPlanePick: selection.faces[0] };
  if (command === LINKED_INSET_EXTRUDE) return { ...ctx, doc };
  // Bearing reads the authored placed parts before the evaluated prefix includes the first link.
  // Loft reads the displayed Direct rail while keeping that evaluated prefix.
  switch (command.id) {
    case 'bearing': return { ...ctx, doc: { ...ctx.doc, instances: doc.instances } };
    case 'loft': return { ...ctx, doc: { ...ctx.doc, direct: shownDoc.direct } };
    case 'hole': return { ...ctx, holeSnapStep: snapStep };
    case 'extrude': return { ...ctx, viewportEndFace: true };
    default: return ctx;
  }
}
