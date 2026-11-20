import type { Ctx, Selection } from '@barocss/cad-model/app/commands';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { FriendlyError } from '@barocss/cad-model/engine/errors';
import { xyPlane, type SketchPlane } from '@barocss/cad-model/sketch/plane';
import { sketchShapes } from '@barocss/cad-model/sketch/reopen';
import type { SketchState } from '@barocss/cad-model/sketch/types';
import type { EngineClient } from '../engine/client';
import type { useMidpointSketch } from '../sketch/useMidpointSketch';
import type { OpenScope } from '../state/openOwnership';
import { footprintBody } from './materialFootprint';
import { midpointFaces, midpointSelectionHint } from './midpointSketch';
import { sketchRegion } from './sketchControls';

type Model = { doc: StudioDoc; evaluated: StudioDoc; ctx: Ctx };
type LiveOwner = {
  doc: StudioDoc;
  evaluated: StudioDoc;
  open: OpenScope;
  worker: number;
  scope: object;
  generation: object;
  sketchRevision: number;
  selection: Selection | null;
  commandActive: boolean;
};
type Launch = {
  readOwner(): LiveOwner;
  projection: { ready(): boolean; request: number; currentRequest(): number };
  midpoint: { ready(): boolean; review: ReturnType<typeof useMidpointSketch>['start'] };
  engine: Pick<EngineClient, 'midpointPlane' | 'projectFootprint'>;
  canChangeDocument(): boolean;
  notice(error: FriendlyError): void;
  editor: {
    setSketch(sketch: SketchState): void;
    discardFeatureDraft(): void;
    clearPreview(): void;
    clearHistoryEditor(): void;
    frame(min: [number, number], max: [number, number], plane: SketchPlane): void;
  };
};

function captureSourceCheck(model: Model, readOwner: Launch['readOwner']): () => boolean {
  const start = readOwner();
  return () => {
    const live = readOwner();
    // The model must still match the render that supplied the command selection.
    return live.doc === model.doc && live.evaluated === model.evaluated && live.selection === model.ctx.selection
      && live.open === start.open && live.worker === start.worker && live.scope === start.scope
      && live.generation === start.generation && live.sketchRevision === start.sketchRevision && !live.commandActive;
  };
}

export function launchDerivedSketch(kind: 'midpoint' | 'projection', model: Model, launch: Launch): void {
  const { doc, evaluated, ctx } = model;
  const { engine, editor, midpoint, projection, canChangeDocument, readOwner, notice } = launch;
  const frame = (plane: SketchPlane) => {
    const [min, max] = sketchRegion(ctx.bodies, plane);
    editor.frame(min, max, plane);
  };
  if (kind === 'midpoint') {
    const refuse = (hint: string) => notice({ title: 'Midpoint sketch not started', hint, detail: '' });
    const target = midpointFaces(ctx, doc);
    if (!target) { refuse(midpointSelectionHint); return; }
    if (!midpoint.ready()) { refuse('Close other tools and wait for the current part in Model.'); return; }
    if (!canChangeDocument()) return;
    const current = captureSourceCheck(model, readOwner);
    midpoint.review({
      faces: target.faces,
      current: () => current() && midpoint.ready(),
      read: () => engine.midpointPlane(evaluated, target.key, target.faces),
      refuse,
      adopt: plane => {
        if (!canChangeDocument()) return;
        editor.discardFeatureDraft();
        editor.setSketch({ plane, anchor: { kind: 'midpoint', offset: 0, midpointPlane: plane }, tool: 'rectangle', shape: null, base: null });
        editor.clearPreview();
        frame(plane);
      },
    });
    return;
  }

  const refuse = (hint: string) => notice({ title: 'Projection not started', hint, detail: '' });
  const key = footprintBody(ctx);
  if (!key || !projection.ready() || !canChangeDocument()) {
    refuse('Close other tools and select one current solid in Model.');
    return;
  }
  const current = captureSourceCheck(model, readOwner);
  void engine.projectFootprint(evaluated, key).then(result => {
    if (projection.request !== projection.currentRequest() || !current() || !projection.ready()) return;
    if ('error' in result) { refuse(result.error); return; }
    const plane = xyPlane(), { shape, done } = sketchShapes(result.sketch);
    editor.clearHistoryEditor();
    editor.setSketch({ plane, anchor: { kind: 'xy', offset: 0 }, tool: 'rectangle', shape, done, base: null });
    frame(plane);
  });
}
