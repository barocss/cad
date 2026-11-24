import type { ComponentProps, Dispatch, RefObject, SetStateAction } from 'react';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { SketchState } from '@barocss/cad-model/sketch/types';
import { activateDraftBezier, activateDraftOutline, draftShapeOrder, sketchCutInputs, TOOLS } from '../app/sketchControls';
import { CircleChordControls } from '../sketch/CircleChordControls';
import { currentCoordinateFeedback } from '../sketch/coordinateFeedback';
import { ownsEllipseAxesRecovery } from '../sketch/ellipseAxesRecovery';
import { toggleObjectSnapKind, type ObjectSnapKinds } from '../sketch/objectSnapKinds';
import { commitOutlineRotation } from '../sketch/outlineRotationCommit';
import { PathGapControls } from '../sketch/PathGapControls';
import { SketchSnapControls } from '../sketch/SketchSnapControls';
import type { useSketchDraftHistory } from '../sketch/useSketchDraftHistory';
import { ownsPanelDrivingLength } from '../viewport/studioSketchViewportActions';
import { OverlaidLinesControls } from './OverlaidLinesControls';
import { SavedBezierPicker } from './SavedBezierPicker';
import { SketchOutlineTools } from './SketchOutlineTools';
import { SketchPanel } from './SketchPanel';

type Panel = ComponentProps<typeof SketchPanel>;
type SnapControls = ComponentProps<typeof SketchSnapControls>;

interface Props {
  sketch: SketchState;
  document: { shown: StudioDoc; live: RefObject<StudioDoc> };
  draft: Pick<ReturnType<typeof useSketchDraftHistory>, 'coordinateFeedback' | 'sketchIssue' | 'renderedSketch' |
    'liveShape' | 'updateShape' | 'setActiveOutline'> & {
    generation: RefObject<number>;
    pickerGeneration: number;
    finishError: Panel['finishError'];
    setSketch: Dispatch<SetStateAction<SketchState | null>>;
  };
  constraints: Panel['constraintInspection'];
  tools: Pick<SnapControls, 'twoPoint' | 'extension' | 'objectKinds' | 'crossingToolSupported' | 'placedRotationLimited'> & {
    circle: ComponentProps<typeof CircleChordControls>['circle'];
    gap: ComponentProps<typeof PathGapControls>['gap'];
    scan: ComponentProps<typeof OverlaidLinesControls>['scan'];
    setObjectKinds: Dispatch<SetStateAction<ObjectSnapKinds>>;
    closeDimension(): void;
  };
  edit: Omit<ComponentProps<typeof SketchOutlineTools>, 'sketch'> & {
    place: Panel['onPlace'];
    band: Panel['onBand'];
    recoverLength: NonNullable<Panel['onDrivingLength']>;
  };
}

/** Compose the active Sketch panel and bind edits to its current draft. */
export function StudioSketchInspector({ sketch, document, draft, constraints, tools, edit }: Props) {
  const doc = document.shown;
  const { coordinateFeedback, sketchIssue, renderedSketch, liveShape, generation, pickerGeneration,
    updateShape, setActiveOutline, setSketch, finishError } = draft;
  const { twoPoint, circle, extension, objectKinds, gap, scan } = tools;
  const ellipse = sketchIssue?.ellipse;
  const conflict = sketchIssue?.conflict;
  const canEditAxes = ownsEllipseAxesRecovery(ellipse, doc, sketch);
  const face = sketch.anchor?.kind === 'face' && !sketch.anchor.offset && !sketch.anchor.angle ? sketch.anchor.face : undefined;

  const selectSaved: ComponentProps<typeof SavedBezierPicker>['onActivate'] = source => {
    if (document.live.current !== doc || renderedSketch.current.draft !== sketch ||
      renderedSketch.current.generation !== pickerGeneration || generation.current !== pickerGeneration || liveShape.current !== sketch.shape) return;
    const ordered = draftShapeOrder(sketch), index = ordered.indexOf(source);
    if (index < 0 || ordered.lastIndexOf(source) !== index) return;
    const next = source.kind === 'bezier' ? activateDraftBezier(sketch, source) : activateDraftOutline(sketch, index);
    if (next && next !== sketch) setActiveOutline(next);
  };
  const selectOutline = (index: number) => {
    const source = sketchCutInputs(sketch).shapes[index];
    const next = activateDraftOutline(sketch, draftShapeOrder(sketch).indexOf(source));
    if (next && next !== sketch) setActiveOutline(next);
  };

  return <SketchPanel
    sketch={sketch} constraintInspection={constraints} constraintDocument={doc}
    toolLabel={TOOLS.find(item => item.tool === sketch.tool)!.label} finishError={finishError}
    error={ellipse && !canEditAxes ? null : sketchIssue?.reason ?? null}
    onEditEllipseAxes={canEditAxes ? () => ownsEllipseAxesRecovery(ellipse, document.live.current, renderedSketch.current.draft) &&
      renderedSketch.current.generation === generation.current : undefined}
    conflictIds={!finishError && conflict?.doc === doc && conflict.source === sketch.shape ? conflict.ids : undefined}
    coordinateFeedback={currentCoordinateFeedback(coordinateFeedback, doc, sketch.shape, generation.current)}
    toolControls={<>
      <SketchSnapControls twoPoint={{ ...twoPoint, begin: () => { circle.cancel(); twoPoint.begin(); } }} extension={extension}
        objectKinds={objectKinds} crossingToolSupported={tools.crossingToolSupported} placedRotationLimited={tools.placedRotationLimited}
        onToggleObjectKind={kind => tools.setObjectKinds(kinds => toggleObjectSnapKind(kinds, kind))}
        onExitObjectKinds={sketch.editDim ? tools.closeDimension : undefined} />
      <PathGapControls gap={gap} />
      <CircleChordControls circle={{ ...circle, begin: () => { twoPoint.cancel(); circle.begin(); } }} />
      <OverlaidLinesControls scan={scan} />
    </>}
    referencePicker={<SavedBezierPicker sketch={sketch} onActivate={selectSaved} />}
    onActivateOutline={sketch.editNode !== undefined && (sketch.tool === 'select' || sketch.tool === 'dimension') ? selectOutline : undefined}
    onTransformOutline={(owner, ownerDoc, candidate) => commitOutlineRotation(owner, ownerDoc, candidate, {
      doc: document.live.current, rendered: renderedSketch.current.draft, liveShape: liveShape.current,
      generation: generation.current, renderedGeneration: renderedSketch.current.generation,
    }, shape => updateShape(shape, false, 'panel'))}
    onShape={(shape, coordinate, origin) => {
      if (origin && (origin.doc !== document.live.current || origin.source !== liveShape.current)) return;
      updateShape(shape, false, origin?.kind ?? 'panel', coordinate);
    }}
    onDrivingLength={(source, edge, value) => !ownsPanelDrivingLength(doc, document.live.current, sketch,
      renderedSketch.current.draft, pickerGeneration, generation.current) || edit.recoverLength(source, edge, value)}
    onPlace={sketch.editNode === undefined ? edit.place : undefined}
    onUi={patch => setSketch(current => current && { ...current, ...patch })} onBand={edit.band}
    outlineTools={<SketchOutlineTools sketch={sketch} onOffset={edit.onOffset} onToCurves={edit.onToCurves}
      onLinkedInset={face?.linkSource ? edit.onLinkedInset : undefined} onUseOutline={face?.outline?.length ? edit.onUseOutline : undefined} />}
  />;
}
