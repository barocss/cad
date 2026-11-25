import type { P2 } from '@barocss/cad-model/sketch/profile';
import type { SketchState } from '@barocss/cad-model/sketch/types';
import { sketchFinishInputs } from '../app/sketchControls';
import { unfinishedMaterialChains } from '../app/sketchOpenGuidance';

export type OpenEndRole = 'start' | 'end';

export interface SketchOpenEnd {
  chainIndex: number;
  role: OpenEndRole;
  label: string;
  point: P2;
  pending: boolean;
}

export interface SketchOpenEndChain {
  chainIndex: number;
  start: P2;
  end: P2;
  pending: boolean;
}

export interface SketchOpenEndsReport {
  chains: readonly SketchOpenEndChain[];
  ends: readonly SketchOpenEnd[];
}

export interface ScreenOffset {
  dx: number;
  dy: number;
}

export const EMPTY_OPEN_ENDS_REPORT: SketchOpenEndsReport = { chains: [], ends: [] };

const finitePoint = (point: readonly number[] | undefined): point is P2 =>
  Array.isArray(point) && point.length === 2 && Number.isFinite(point[0]) && Number.isFinite(point[1]);

/**
 * Find the open endpoints of unclosed material Line/Arc chains using the exact same join and
 * eligibility rules that Finish applies. Closed outlines (including self-intersecting ones),
 * construction geometry, and endpoints already joined into a closed loop produce zero markers.
 */
export function findSketchOpenEnds(sketch: SketchState): SketchOpenEndsReport {
  if (sketch.band) return EMPTY_OPEN_ENDS_REPORT;
  const { joined } = sketchFinishInputs(sketch);
  const openChains = unfinishedMaterialChains(joined);
  if (!openChains.length) return EMPTY_OPEN_ENDS_REPORT;

  const chains: SketchOpenEndChain[] = [];
  const ends: SketchOpenEnd[] = [];
  const multi = openChains.length > 1;

  for (const [chainIndex, shape] of openChains.entries()) {
    const first = shape.points[0];
    const last = shape.points[shape.points.length - 1];
    if (!finitePoint(first) || !finitePoint(last)) continue;
    const start: P2 = [first[0], first[1]];
    const end: P2 = [last[0], last[1]];
    const pending = !!shape.pending;
    const prefix = multi ? `Open ${chainIndex + 1}` : 'Open ';
    chains.push({ chainIndex, start, end, pending });
    ends.push(
      { chainIndex, role: 'start', label: `${prefix}A`, point: start, pending },
      { chainIndex, role: 'end', label: `${prefix}B`, point: end, pending },
    );
  }
  return { chains, ends };
}

/**
 * Compute per-marker badge offsets in screen pixels so two close endpoints (e.g. a small gap or
 * zoomed-out view) push their badges to opposite sides and remain readable.
 */
export function openEndLabelOffsets(screenPoints: readonly (readonly [number, number])[]): ScreenOffset[] {
  const base: ScreenOffset = { dx: 14, dy: -16 };
  const offsets: ScreenOffset[] = screenPoints.map(() => ({ ...base }));
  for (let i = 0; i < screenPoints.length; i++) {
    for (let j = i + 1; j < screenPoints.length; j++) {
      const dx = screenPoints[j][0] - screenPoints[i][0];
      const dy = screenPoints[j][1] - screenPoints[i][1];
      const dist = Math.hypot(dx, dy);
      if (dist > 64) continue;
      if (dist < 1e-3) {
        offsets[i] = { dx: -54, dy: -18 };
        offsets[j] = { dx: 14, dy: 16 };
      } else {
        const ux = dx / dist, uy = dy / dist;
        offsets[i] = { dx: ux > 0 ? -58 : 14, dy: uy >= 0 ? -18 : 16 };
        offsets[j] = { dx: ux > 0 ? 14 : -58, dy: uy >= 0 ? 16 : -18 };
      }
    }
  }
  return offsets;
}
