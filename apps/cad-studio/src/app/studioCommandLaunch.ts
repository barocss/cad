import { subdNodeOf, type Command, type Ctx, type Selection, type Values } from '@barocss/cad-model/app/commands';
import type { MeasurePick } from '@barocss/cad-model/app/measure';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import { prepareSketchLaunch, resolveSketchLaunchVertices } from '../sketch/sketchLaunch';
import { SKETCH3D_COMMAND } from '../skeleton/useSkeletonEditor';
import { STEPS_COMMAND } from './assemblySteps';
import { prepareCutPatternLaunch } from './commandLaunchContext';
import type { Active } from './commandState';
import { filletLaunchAvailability, filletType } from './filletFamily';
import { launchDerivedSketch } from './launchDerivedSketch';
import { PROJECT_TO_SKETCH } from './materialFootprint';
import { captureMeasureTarget, type MeasureTarget } from './measureTargets';
import { currentNativePlanePick, SKETCH_AT_MIDPOINT } from './midpointSketch';
import { LINKED_INSET_EXTRUDE } from './roundedInsetCommand';
import type { StudioNotice } from './studioNotice';
import { prepareStudioFeatureCommand } from './useStudioCommandEntry';

type SketchEntry = Extract<ReturnType<typeof prepareSketchLaunch>, { ok: true }>;
type FeatureEntry = Parameters<typeof prepareStudioFeatureCommand>[0];

interface StudioCommandLaunch {
  model: {
    doc: StudioDoc;
    evaluated: StudioDoc;
    ctx: Ctx;
    selection: Selection;
    bodies: readonly BodyResult[];
    unavailable: boolean;
    fresh: boolean;
    busy: boolean;
    nativeVertexReady: boolean;
    hasPlacedSelection: boolean;
    variant?: string | null;
  };
  owner: {
    begin(): number;
    canChangeDocument(): boolean;
    canUseEarlierCut(): boolean;
    cutIntent(): Parameters<typeof prepareCutPatternLaunch>[0]['intent'];
    canStartLinkedInset(): boolean;
  };
  view: {
    closePalette(): void;
    closeWorkspaceDrafts(cmd: Command): void;
    notice(message: StudioNotice): void;
    clearInputNotice(cmd: Command): void;
  };
  entry: {
    derived(request: number): Parameters<typeof launchDerivedSketch>[2];
    switchHeldCage(): boolean;
    sketch(launch: SketchEntry): void;
    sketch3D(): void;
    steps(): void;
    cut(): void;
    interference(): void;
    cage(index: number): void;
    measureReady(): boolean;
    measure(targets: MeasureTarget[]): void;
    immediate(candidate: StudioDoc): void;
    feature(launch: Pick<FeatureEntry['launch'], 'command' | 'cutSource'>): Omit<FeatureEntry, 'family' | 'initial'>;
    select(selection: Selection): void;
    activate(active: Active): void;
  };
}

/** Admit and route a command while App retains the current document and editor ownership. */
export function launchStudioCommand(cmd: Command, initial: Values | undefined, { model, owner, view, entry }: StudioCommandLaunch) {
  const { doc, evaluated, ctx, selection, bodies, fresh, busy } = model;
  const request = owner.begin();
  if (model.unavailable && (cmd.build || cmd.action === 'sketch' || cmd.action === 'measure' || cmd.action === 'cage')) {
    view.closePalette();
    view.notice({ title: `${cmd.label} not started`, hint: 'Fix the model evaluation or undo the last change first.', detail: '', documentSource: { doc, evaluated } });
    return;
  }
  if (cmd.id === SKETCH_AT_MIDPOINT.id || cmd.id === PROJECT_TO_SKETCH.id) {
    view.closePalette();
    launchDerivedSketch(cmd.id === SKETCH_AT_MIDPOINT.id ? 'midpoint' : 'projection', { ctx, doc, evaluated }, entry.derived(request));
    return;
  }
  if ((cmd.build || cmd.action === 'sketch' || cmd.action === 'cage' || cmd.action === 'assembly-cut' || cmd.id === SKETCH3D_COMMAND.id)
    && !owner.canChangeDocument()) return;
  if (cmd.action === 'cage' && entry.switchHeldCage()) return;

  const vertices = cmd.id === 'sketch' ? resolveSketchLaunchVertices(doc, ctx, model.nativeVertexReady) : null;
  if (vertices?.ok === false) { view.notice(vertices.notice); return; }
  view.closeWorkspaceDrafts(cmd);
  const family = filletType(cmd.id);
  if (family && (!fresh || busy)) {
    view.notice({ title: 'Fillet not started', hint: 'Wait for the current part to finish evaluating.', detail: '' });
    return;
  }
  const cut = prepareCutPatternLaunch({ command: cmd, ctx, doc, selection, intent: owner.cutIntent(), canUseEarlier: owner.canUseEarlierCut() });
  if ('notice' in cut) { view.notice(cut.notice); return; }
  const avail = family ? filletLaunchAvailability(ctx, family) : cmd.available(ctx);
  if (!avail.ok) { view.notice({ title: `${cmd.label} can’t run here`, hint: avail.reason, detail: '', inputPick: cmd }); return; }
  if (model.variant) { view.notice({ title: `${cmd.label} can’t run here`, hint: `Showing ${model.variant}: show the master to edit.`, detail: '' }); return; }
  if (cmd === LINKED_INSET_EXTRUDE && !owner.canStartLinkedInset()) {
    view.notice({ title: 'Linked inset not started', hint: 'Show the latest History of a standalone part.', detail: '' });
    return;
  }

  view.clearInputNotice(cmd);
  if (cmd.id === SKETCH3D_COMMAND.id) { entry.sketch3D(); return; }
  if (cmd.id === STEPS_COMMAND.id) { entry.steps(); return; }
  if (cmd.action === 'sketch') {
    const sketch = prepareSketchLaunch({ command: cmd.id, doc, ctx, hasPlacedSelection: model.hasPlacedSelection, vertexPlane: vertices?.plane });
    if (sketch.ok) entry.sketch(sketch); else view.notice(sketch.notice);
    return;
  }
  if (cmd.action === 'assembly-cut') { entry.cut(); return; }
  if (cmd.action === 'interference') { entry.interference(); return; }
  if (cmd.action === 'cage') {
    const index = subdNodeOf(ctx);
    if (index !== null) entry.cage(index);
    return;
  }
  if (cmd.action === 'measure') {
    const face = selection.faces[0], edge = selection.edges[0], vertex = selection.vertices?.[0];
    const first: MeasurePick | undefined = face ?? edge ?? (vertex ? { body: vertex.body, vertex: vertex.at } : undefined);
    const target = first && captureMeasureTarget(first, doc, bodies[first.body],
      !!face && entry.measureReady() && !!currentNativePlanePick(ctx, face, doc));
    entry.measure(target ? [target] : []);
    return;
  }
  if (!cmd.fields) { entry.immediate(cmd.build!(ctx, {})); return; }
  const next = prepareStudioFeatureCommand({ ...entry.feature({ command: cmd, cutSource: cut.source }), initial, family });
  if (family) entry.select(next.ctx.selection);
  entry.activate(next);
}
