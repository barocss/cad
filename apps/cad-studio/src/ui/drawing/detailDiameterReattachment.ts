import type { BrepProjection, ProjectedEdge } from '@barocss/cad';
import type { DrawingDetail } from '@barocss/cad-model/drawing/detail';
import { edgeAt, resolveDimension, roundIn } from '@barocss/cad-model/drawing/dimensions';
import { isDetailRef, type DrawingDimension, type DrawingSettings, type Vec3, type XY } from '@barocss/cad-model/drawing/types';

type CircularDimension = Extract<DrawingDimension, { kind: 'diameter' | 'radius' }>;
/** A repair candidate must be actual visible circular ink from this current clipped projection. */
export function visibleDetailRim(projection: BrepProjection, edge: ProjectedEdge): boolean {
  return projection.edges.includes(edge) && !!edge.circle && roundIn(projection, edge)
    && edge.pieces.some(piece => piece.visible && piece.ink !== false && piece.curve.kind === 'arc');
}

/** Repair picking excludes suppressed pieces, then returns the exact original projected edge. */
export function pickVisibleDetailRim(projection: BrepProjection, at: XY, tolerance: number): ProjectedEdge | null {
  const originals = new Map<ProjectedEdge, ProjectedEdge>();
  const edges = projection.edges.flatMap(edge => {
    if (!edge.circle || !roundIn(projection, edge)) return [];
    const pieces = edge.pieces.filter(piece => piece.visible && piece.ink !== false && piece.curve.kind === 'arc');
    if (!pieces.length) return [];
    const clipped = { ...edge, pieces };
    originals.set(clipped, edge);
    return [clipped];
  });
  const hit = edgeAt({ ...projection, edges }, at, tolerance, true);
  return hit ? originals.get(hit) ?? null : null;
}

/** Revalidate the original and candidate at confirmation; preserve every authored non-reference field. */
export function reconnectDetailDiameter(settings: DrawingSettings, original: CircularDimension,
  projection: BrepProjection, detail: DrawingDetail, candidate: { edge: string; near: Vec3 }): CircularDimension | null {
  if (original.kind !== 'diameter' || !isDetailRef(original.view) || original.view !== `detail:${detail.id}`
    || !settings.details?.includes(detail) || settings.dimensions.filter(d => d.id === original.id).length !== 1
    || !settings.dimensions.includes(original)) return null;
  const edge = projection.edges.find(e => e.name === candidate.edge && e.circle
    && e.circle.center.every((v, k) => v === candidate.near[k]) && visibleDetailRim(projection, e));
  if (!edge) return null;
  const { sig: _sig, was: _was, ...retained } = original;
  void _sig; void _was;
  const next = { ...retained, edge: edge.name, near: [...edge.circle!.center] as Vec3 };
  return resolveDimension({ [next.view]: projection }, next, detail, false).ok ? next : null;
}
