import type { Dispatch, RefObject, SetStateAction } from 'react';
import { toggleBandPick } from '@barocss/cad-model/sketch/band';
import type { SketchNode } from '@barocss/cad-model/engine/doc';
import { ellipseMatches } from '@barocss/cad-model/sketch/ellipse';
import { isDefaultPlane } from '@barocss/cad-model/sketch/plane';
import { commitDimension, commitInlineDimension, dimensionLabel, dimensionValue, drivingDimensionValue, isSettled, isVerifiedFixedTriangleEdit, type Polygon } from '@barocss/cad-model/sketch/rules';
import { sketchClick } from '@barocss/cad-model/sketch/select';
import type { SketchShape, SketchState } from '@barocss/cad-model/sketch/types';
import { circleAxisPairConflict, circleDistanceConflict, edgeCircleDistanceConflict, fixedPointDistanceConflict, opposingLengthConflict } from '../sketch/constraintList';
import { matchesStoredTriangle } from '../sketch/fixedTriangleEditor';
import type { SceneSketchActions } from './SceneViewport';

const outlinePickIssues = {
  dimension: 'Pick two points on the same outline to add a distance constraint.',
  select: 'Select points on one outline at a time.',
  inactive: 'Pick a point on the active outline.',
};
export const isOutlinePickIssue = (reason: string | undefined) =>
  reason === outlinePickIssues.dimension || reason === outlinePickIssues.select || reason === outlinePickIssues.inactive;

/** A panel input may outlive the render that owned its draft. */
export function ownsPanelDrivingLength<T>(doc: T, currentDoc: T, owner: SketchState | null,
  rendered: SketchState | null, generation: number, currentGeneration: number): boolean {
  return doc === currentDoc && owner !== null && rendered === owner && generation === currentGeneration;
}

interface ReopenedSketchSource { source: SketchNode; recoveredLengths: WeakSet<Polygon> }

interface SketchViewportInputs {
  liveShape: RefObject<SketchShape | null>;
  sketch: SketchState | null;
  currentSketchSource(): ReopenedSketchSource | undefined;
  setSketch: Dispatch<SetStateAction<SketchState | null>>;
  setSketchError(reason: string): void;
  offerEllipseAxes?(draft: SketchState): void;
  clearOutlinePickIssue(): void;
  updateCircleDiameter(shape: Extract<SketchShape, { kind: 'circle' }>, diameter: number): void;
  setConstraintConflict(reason: string, source: Polygon, ids: readonly string[]): void;
  updateShape: SceneSketchActions['onSketchShape'];
  trimSketch: NonNullable<SceneSketchActions['onSketchTrim']>;
}

/** Authoring may recover only the stored, literal main outline of a single XY sketch. */
function canRecoverLength(sketch: SketchState | null, opened: ReopenedSketchSource | undefined, source: Polygon): boolean {
  const node = opened?.source;
  if (!sketch || sketch.shape !== source || !isDefaultPlane(sketch.plane) ||
    sketch.done?.length || sketch.band || sketch.association || sketch.associationDetached ||
    node?.profile !== 'polygon' || node.on || node.association ||
    node.regions?.length || node.holes?.length || node.construction?.length) return false;

  // A recovered shape is admitted only by identity in the edit session that produced it.
  if (opened?.recoveredLengths.has(source)) return true;
  return matchesStoredTriangle(node, source);
}

/** Viewport gestures use Studio's existing sketch state and shape history. */
export function studioSketchViewportActions({ liveShape, sketch, currentSketchSource, setSketch, setSketchError, offerEllipseAxes, clearOutlinePickIssue, updateCircleDiameter, setConstraintConflict, updateShape, trimSketch }: SketchViewportInputs): SceneSketchActions & { recoverPanelLength(source: Polygon, edge: number, value: number): boolean } {
  const applyDimension = (opened: ReopenedSketchSource | undefined, source: Polygon, key: string, value: number) => {
    const result = opened ? commitInlineDimension(source, key, value) : commitDimension(source, key, value);
    if (!result.ok) {
      const edge = opposingLengthConflict(source, key, value);
      const circle = circleDistanceConflict(source, key, value);
      const circleAxes = circle ? undefined : circleAxisPairConflict(source, key, value);
      const edgeCircle = edgeCircleDistanceConflict(source, key, value);
      const fixed = fixedPointDistanceConflict(source, key, value);
      if (edgeCircle) {
        const { ids, span, spanEdge, opposite, oppositeDistance } = edgeCircle;
        setConstraintConflict(`${dimensionLabel(source, key)} = ${value} mm conflicts with the ${span} mm length of edge ${spanEdge + 1} and the ${oppositeDistance} mm distance from edge ${opposite + 1}.`, source, ids);
      } else if (fixed) {
        const [a, b] = fixed.points;
        setConstraintConflict(`${dimensionLabel(source, key)} = ${value} mm conflicts with the ${Number(fixed.distance.toPrecision(15))} mm distance set by fixed points ${a + 1} and ${b + 1}.`, source, fixed.ids);
      } else if (circle) setConstraintConflict(`${dimensionLabel(source, key)} = ${value} mm conflicts with the stored ${circle.axis} distance of ${circle.value} mm.`, source, [circle.id]);
      else if (circleAxes) {
        const { horizontal, vertical, distance } = circleAxes;
        setConstraintConflict(`${dimensionLabel(source, key)} = ${value} mm conflicts with the stored horizontal ${horizontal.value} mm and vertical ${vertical.value} mm distances (together ≈ ${Number(distance.toPrecision(10))} mm).`, source, [horizontal.id, vertical.id]);
      } else if (edge !== undefined) setConstraintConflict(result.reason, source, [`len:${edge}`]);
      else setSketchError(result.reason);
      return;
    }
    if (opened && isVerifiedFixedTriangleEdit(result.shape, source)) opened.recoveredLengths.add(result.shape);
    updateShape(result.shape);
  };
  return {
    recoverPanelLength(source: Polygon, edge: number, value: number): boolean {
      if (liveShape.current !== source || sketch?.shape !== source) return true;
      const key = `len${edge}`;
      const opposite = opposingLengthConflict(source, key, value);
      if (opposite !== undefined) {
        const result = commitDimension(source, key, value);
        if (!result.ok) {
          setConstraintConflict(result.reason, source, [`len:${opposite}`]);
          return true;
        }
      }
      const fixed = fixedPointDistanceConflict(source, key, value);
      if (fixed) {
        const result = commitDimension(source, key, value);
        if (!result.ok) {
          const [a, b] = fixed.points;
          setConstraintConflict(`${dimensionLabel(source, key)} = ${value} mm conflicts with the ${Number(fixed.distance.toPrecision(15))} mm distance set by fixed points ${a + 1} and ${b + 1}.`, source, fixed.ids);
          return true;
        }
      }
      const opened = edge === 2 ? currentSketchSource() : undefined;
      if (opened && canRecoverLength(sketch, opened, source)) {
        if (value !== source.lengths?.[edge]) applyDimension(opened, source, key, value);
        return true;
      }
      // Adding an edge lock through the generic shape update loses its diagnostic label.
      // Keep the Model refusal for new locks on a plain outline, without changing
      // the existing apply, history, or already-driving edge routes.
      if (isSettled(source) && source.lengths?.[edge] === undefined && !source.bulges?.some(Boolean)
        && !source.circles?.length && !source.spline && !source.ellipse && Number.isFinite(value) && value >= 0.001) {
        const result = commitDimension(source, key, value);
        if (!result.ok) {
          setSketchError(result.reason);
          return true;
        }
      }
      return false;
    },
    onSketchShape: updateShape,
    onSketchTrim: trimSketch,
    onSketchPick(hit, additive) {
      const source = liveShape.current;
      if (hit?.kind === 'active-circle') {
        if (source === hit.outline && source === sketch?.shape && sketch.tool === 'dimension') {
          clearOutlinePickIssue();
          setSketch(current => current === sketch ? { ...current, picked: [], editDim: 'diameter' } : current);
        }
        return;
      }
      if (hit?.kind === 'parked-outline-point') {
        if (!sketch || source !== sketch.shape || !sketch.done?.includes(hit.outline)) return;
        if (sketch.tool === 'dimension' && sketch.picked?.some(pick => pick.kind === 'point')) {
          setSketchError(outlinePickIssues.dimension);
          return;
        }
        if (sketch.tool === 'select' && additive && sketch.picked?.length) {
          setSketchError(outlinePickIssues.select);
          return;
        }
        setSketchError(outlinePickIssues.inactive);
        return;
      }
      clearOutlinePickIssue();
      // A matching ellipse's outline vertices and arcs are generated by its axis definition.
      // Direct dimensions on either must use the same explicit Rx/Ry recovery.
      if (sketch?.tool === 'dimension' && source === sketch.shape && source?.kind === 'polygon'
        && (hit?.kind === 'edge' || hit?.kind === 'point' && Number.isSafeInteger(hit.i)
          && hit.i >= 0 && hit.i < source.points.length) && ellipseMatches(source)) {
        const next: SketchState = { ...sketch, picked: [], editDim: null };
        setSketchError('Edit Rx or Ry in the Ellipse section.');
        setSketch(current => current === sketch ? next : current);
        offerEllipseAxes?.(next);
        return;
      }
      setSketch(current => current && sketchClick(current, hit, additive));
    },
    onSketchBandPick: index => setSketch(sketch => sketch && index !== null ? toggleBandPick(sketch, index) : sketch),
    onDimClick(key) {
      const input = document.getElementById('sk-' + key) as HTMLInputElement | null;
      input?.focus();
      input?.select();
    },
    onDimEdit: editDim => {
      if (editDim === null && liveShape.current?.kind === 'circle' && liveShape.current !== sketch?.shape) return;
      setSketch(sketch => sketch && { ...sketch, editDim });
    },
    onDimCommit(key, value, source) {
      if (liveShape.current !== source) return;
      if (source.kind === 'circle') {
        if (key !== 'diameter' || sketch?.shape !== source || sketch.editDim !== key) return;
        const valid = Number.isFinite(value) && value >= 0.5;
        if (valid && value !== 2 * source.r) {
          updateCircleDiameter(source, value);
          return;
        }
        if (!valid) setSketchError('Diameter must be at least 0.5 mm.');
        setSketch(current => current === sketch ? { ...current, editDim: null } : current);
        return;
      }
      const opened = key === 'len2' ? currentSketchSource() : undefined;
      setSketch(sketch => sketch && { ...sketch, editDim: null });
      if (value === drivingDimensionValue(source, key)) return;
      // An attached circle already stores its size. Confirming it adds no constraint.
      if (key.startsWith('cdia') && value === dimensionValue(source, key)) return;
      applyDimension(canRecoverLength(sketch, opened, source) ? opened : undefined, source, key, value);
    },
  };
}
