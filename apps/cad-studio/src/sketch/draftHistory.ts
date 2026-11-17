import { bezierError, wellFormedBezier } from '@barocss/cad-model/sketch/bezier';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import { reopenedOrder } from '@barocss/cad-model/sketch/reopen';
import { rectangleOutline } from '@barocss/cad-model/sketch/select';
import { canonical } from '@barocss/cad-model/util/revision';
import { isSettled } from '@barocss/cad-model/sketch/rules';
import type { SketchShape, SketchState } from '@barocss/cad-model/sketch/types';
import { detachSketchLink, sketchCutInputs } from '../app/sketchControls';

type OutlineStep = { kind: 'outline'; shape: SketchShape };
type DraftStep = Pick<SketchState, 'shape' | 'done' | 'association' | 'associationDetached' | 'plane' | 'anchor' | 'base' | 'editNode' | 'mainIds' | 'clearedSideIds' | 'positional' | 'activeOutlineIndex' | 'tool' | 'band' | 'bandPicks'> & {
  kind: 'draft';
  doc: StudioDoc;
};
type SketchStep = OutlineStep | DraftStep;
type RestoredStep = DraftStep | (OutlineStep & { parked?: { index: number; owner: SketchShape } });

export function outlineHistoryState(shape: SketchShape): OutlineStep {
  return { kind: 'outline', shape };
}

export function draftHistoryState(doc: StudioDoc, sketch: SketchState, shape = sketch.shape): DraftStep {
  return { kind: 'draft', doc, shape, done: sketch.done, plane: sketch.plane, anchor: sketch.anchor, base: sketch.base, editNode: sketch.editNode,
    mainIds: sketch.mainIds, clearedSideIds: sketch.clearedSideIds, positional: sketch.positional, activeOutlineIndex: sketch.activeOutlineIndex, tool: sketch.tool, band: sketch.band, bandPicks: sketch.bandPicks, association: sketch.association, associationDetached: sketch.associationDetached };
}

function orderedMainDraft(step: Omit<DraftStep, 'kind' | 'doc'>): SketchShape[] | null {
  const ids = step.mainIds;
  if (step.editNode === undefined || !ids?.length
    || (step.tool !== 'trim' && step.tool !== 'select' && step.tool !== 'dimension')) return null;
  const ordered = reopenedOrder(step.shape, step.done ?? [], ids), main = ordered[0];
  if (!isSettled(main) || main.construction || main.spline || main.ellipse || main.circles?.length
    || main.ids?.length !== ids.length || !ids.every((id, i) => main.ids?.[i] === id)) return null;
  return ordered;
}

function sameMainOutline(a: SketchShape, b: SketchShape): boolean {
  if (a === b) return true;
  if (!isSettled(a) || !isSettled(b)) return false;
  // Trim can copy a settled polygon and set pending to false when it moves into done.
  const left = Object.entries(a).filter(([key]) => key !== 'pending');
  const right = Object.entries(b).filter(([key]) => key !== 'pending');
  return left.length === right.length && left.every(([key, value]) =>
    Object.hasOwn(b, key) && Object.is(value, (b as unknown as Record<string, unknown>)[key]));
}

function parkedOutlineIndex(step: Omit<DraftStep, 'kind' | 'doc'>, shape: SketchShape): number {
  // A saved Bézier has no outline side-ID identity. Only the exact unique parked object owns its edit.
  if (shape.kind === 'bezier') {
    if (step.editNode === undefined || (step.tool !== 'select' && step.tool !== 'dimension') || step.shape === shape
      || !wellFormedBezier(shape) || bezierError(shape.poles)) return -1;
    const done = step.done ?? [], index = done.indexOf(shape);
    return index >= 0 && done.lastIndexOf(shape) === index ? index : -1;
  }
  const ids = shape.ids;
  if (step.editNode === undefined || (step.tool !== 'select' && step.tool !== 'dimension')
    || !isSettled(shape) || !ids?.length || ids.length !== shape.points.length || new Set(ids).size !== ids.length) return -1;
  const sameOwner = (other: SketchShape) => isSettled(other) && other.ids?.length === ids.length
    && ids.every((id, i) => !!id && id === other.ids?.[i]);
  if (step.shape && sameOwner(step.shape)) return -1;
  const done = step.done ?? [], index = done.findIndex(sameOwner);
  return index >= 0 && !done.some((shape, i) => i > index && sameOwner(shape)) ? index : -1;
}

function activateNewRectangle(step: DraftStep, tool: SketchState['tool']) {
  if (step.editNode !== undefined || step.tool !== 'trim' || step.shape || !step.done
    || (tool !== 'select' && tool !== 'dimension')) return null;
  const material = step.done.filter(shape => !shape.construction);
  const rectangle = material[0];
  if (material.length !== 1 || rectangle?.kind !== 'rectangle') return null;
  const shape = rectangleOutline(rectangle);
  return shape ? { shape, done: step.done.filter(item => item !== rectangle) } : null;
}

/** Selection may repartition the same authored outlines between shape and done. Never compare
 * order-insensitively or accept a new geometry owner merely because its numbers happen to match. */
function sameSelectionPartition(expected: DraftStep, current: DraftStep): boolean {
  // Rectangle/Circle/Slot selection parks the same authored objects before the next placement.
  if (current.tool !== 'select' && current.tool !== 'dimension' && current.tool !== 'rectangle' && current.tool !== 'circle' && current.tool !== 'slot') return false;
  if (expected.shape === current.shape && expected.activeOutlineIndex === current.activeOutlineIndex) return false;
  const a = sketchCutInputs(expected).shapes, b = sketchCutInputs(current).shapes;
  if (a.length !== b.length) return false;
  if (current.tool === 'rectangle' || current.tool === 'circle' || current.tool === 'slot') return (expected.tool === 'rectangle' || expected.tool === 'circle' || expected.tool === 'slot')
    && [expected.shape, current.shape].every(shape => !shape || shape.kind === 'rectangle' || shape.kind === 'circle' || shape.kind === 'slot')
    && a.every((shape, index) => shape === b[index]);
  return a.every((shape, index) => {
    const other = b[index];
    if (shape === other) return true;
    // startPicking's only shape conversion: the exact rectangle outline, including side IDs.
    if (shape.kind === 'rectangle') {
      const outline = rectangleOutline(shape);
      return !!outline && canonical(outline) === canonical(other);
    }
    // A tool may park a polygon with an explicit pending:false without changing any nested owner.
    if (shape.kind !== 'polygon' || other.kind !== 'polygon' || shape.pending || other.pending) return false;
    const keys = Object.keys(shape).filter(key => key !== 'pending');
    return keys.length === Object.keys(other).filter(key => key !== 'pending').length
      && keys.every(key => Object.hasOwn(other, key) && Object.is(
        (shape as unknown as Record<string, unknown>)[key], (other as unknown as Record<string, unknown>)[key]));
  });
}

function matches(expected: SketchStep, current: SketchStep): boolean {
  if (expected.kind === 'outline') {
    if (expected.shape.kind === 'bezier' && current.kind === 'draft'
      && [current.shape, ...(current.done ?? [])].filter(shape => shape === expected.shape).length !== 1) return false;
    if (expected.shape === current.shape) return true;
    if (current.kind === 'draft' && current.done?.[parkedOutlineIndex(current, expected.shape)] === expected.shape) return true;
    const main = current.kind === 'draft' ? orderedMainDraft(current)?.[0] : undefined;
    return !!main && sameMainOutline(expected.shape, main);
  }
  if (current.kind !== 'draft' || expected.doc !== current.doc || expected.plane !== current.plane
    || expected.anchor !== current.anchor || expected.base !== current.base
    || expected.editNode !== current.editNode || expected.mainIds !== current.mainIds
    || expected.clearedSideIds !== current.clearedSideIds || expected.positional !== current.positional
    || expected.band !== current.band
    || expected.association !== current.association || expected.associationDetached !== current.associationDetached) return false;
  if (sameSelectionPartition(expected, current)) return true;
  if (expected.activeOutlineIndex !== current.activeOutlineIndex) return false;
  if (expected.shape === current.shape && expected.done === current.done) return true;
  const active = activateNewRectangle(expected, current.tool);
  if (active && current.shape && canonical(active.shape) === canonical(current.shape)
    && active.done.length === current.done?.length
    && active.done.every((shape, i) => shape === current.done?.[i])) return true;
  const a = orderedMainDraft(expected), b = orderedMainDraft(current);
  return !!a && !!b && a.length === b.length && sameMainOutline(a[0], b[0])
    && a.slice(1).every((shape, i) => shape === b[i + 1]);
}

type Edit = { before: SketchStep; after: SketchStep };

function replayStep(current: DraftStep, from: SketchStep, to: SketchStep): RestoredStep {
  if (from.kind === 'outline' && to.kind === 'outline' && from.shape !== current.shape) {
    const index = parkedOutlineIndex(current, from.shape);
    if (current.done?.[index] === from.shape) return { ...to, parked: { index, owner: from.shape } };
  }
  return to;
}

class DraftHistory {
  private done: Edit[] = [];
  private undone: Edit[] = [];

  push(before: SketchStep, after: SketchStep) {
    if (matches(before, after)) return;
    this.done.push({ before, after });
    this.undone = [];
    if (this.done.length > 100) this.done.shift();
  }

  undo(current: DraftStep): RestoredStep | null {
    const step = this.done.at(-1);
    if (!step) return null;
    if (!matches(step.after, current)) { this.clear(); return null; }
    this.done.pop();
    this.undone.push(step);
    return replayStep(current, step.after, step.before);
  }

  redo(current: DraftStep): RestoredStep | null {
    const step = this.undone.at(-1);
    if (!step || !matches(step.before, current)) { this.undone = []; return null; }
    this.undone.pop();
    this.done.push(step);
    return replayStep(current, step.before, step.after);
  }

  available(current: DraftStep): { undo: boolean; redo: boolean } {
    const undo = this.done.at(-1), redo = this.undone.at(-1);
    return { undo: !!undo && matches(undo.after, current), redo: !!redo && matches(redo.before, current) };
  }

  clear() {
    this.done = [];
    this.undone = [];
  }
}

export function createDraftHistory() {
  return new DraftHistory();
}

export function restoreDraftHistory(sketch: SketchState, step: RestoredStep): SketchState {
  if (step.kind === 'outline') {
    if (step.parked) {
      const { index, owner } = step.parked;
      if (sketch.done?.[index] !== owner) return sketch;
      return { ...detachSketchLink(sketch), done: sketch.done.map((shape, i) => i === index ? step.shape : shape),
        picked: sketch.picked?.filter(pick => !pick.done), editDim: null };
    }
    const before = sketch.shape, after = step.shape;
    const ids = isSettled(before) ? before.ids : undefined;
    const sameEdges = isSettled(before) && isSettled(after) && ids && ids.length === before.points.length
      && ids.length === after.points.length && ids.length === after.ids?.length
      && new Set(ids).size === ids.length && ids.every((id, i) => id && id === after.ids?.[i] && !!before.bulges?.[i] === !!after.bulges?.[i]);
    // Attached circles have their own stable side IDs. Never infer their identity from a
    // centre/radius or reuse indices after attachment/removal/reordering.
    const circleIds = isSettled(before) ? before.circleIds : undefined;
    const sameCircles = sameEdges && isSettled(before) && isSettled(after) && circleIds
      && circleIds.length === before.circles?.length && circleIds.length === after.circles?.length
      && circleIds.length === after.circleIds?.length && new Set(circleIds).size === circleIds.length
      && circleIds.every((id, i) => id && id === after.circleIds?.[i]);
    const picked = sameEdges ? (sketch.picked ?? []).filter(pick => !pick.done && Number.isInteger(pick.i)
      && (pick.kind === 'edge' ? !!ids[pick.i] : pick.kind === 'circle' && sameCircles && !!circleIds[pick.i])) : [];
    const restored = { ...detachSketchLink(sketch), shape: step.shape, picked, editDim: null };
    if (sketch.tool !== 'trim' || sketch.shape) return restored;
    const main = orderedMainDraft(sketch)?.[0];
    return main ? { ...restored, shape: null, done: sketch.done?.map(shape => shape === main ? step.shape : shape) } : restored;
  }
  const restored = { ...sketch, shape: step.shape, done: step.done, mainIds: step.mainIds, clearedSideIds: step.clearedSideIds, positional: step.positional, activeOutlineIndex: step.activeOutlineIndex, plane: step.plane, anchor: step.anchor, base: step.base, band: step.band,
    bandPicks: sketch.tool === 'band' ? step.bandPicks : undefined, association: step.association,
    associationDetached: step.associationDetached, picked: [], editDim: null };
  if (step.tool === sketch.tool || (sketch.tool !== 'select' && sketch.tool !== 'dimension')) return restored;
  const active = activateNewRectangle(step, sketch.tool);
  if (active) return { ...restored, shape: active.shape, done: active.done };
  const ordered = orderedMainDraft(step);
  return ordered ? { ...restored, shape: ordered[0], done: ordered.slice(1) } : restored;
}
