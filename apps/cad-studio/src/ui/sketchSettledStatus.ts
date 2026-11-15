import { openChainGuidance } from '../app/sketchOpenGuidance';
import type { SketchShape } from '@barocss/cad-model/sketch/types';
import type { SolveResult } from '@barocss/cad-model/sketch/profile';
import { wellFormedBezier } from '@barocss/cad-model/sketch/bezier';
import { isConvex } from '@barocss/cad-model/sketch/loops';
import { ellipseMatches } from '@barocss/cad-model/sketch/ellipse';
import { redundancy } from '@barocss/cad-model/sketch/rules';

export function sketchStatus(s: SketchShape | null, solved: SolveResult | null, tool?: string): { text: string; warn: boolean } {
  if (!s) return { text: '', warn: false };
  if (s.kind === 'slot') return s.r > 0 ? { text: 'Slot', warn: false } : { text: 'Click the second centre, then the width', warn: true };
  if (s.kind === 'bezier') return !wellFormedBezier(s) ? { text: 'Bézier curve with unusable control points', warn: true }
    : s.poles.length === 3 ? { text: tool === 'bezier' ? 'Quadratic Bézier · click a fourth point to make it cubic' : 'Quadratic Bézier', warn: tool === 'bezier' } : { text: 'Cubic Bézier', warn: false };
  if (s.kind !== 'polygon') return { text: 'Fully defined', warn: false };
  if (!s.closed && !s.pending && s.construction) return { text: 'Open construction line', warn: false };
  if (!s.closed) return { text: openChainGuidance(s, tool), warn: true };
  if (s.pending) return { text: 'Move to bend the closing arc, click to place it', warn: true };
  if (s.ellipse && ellipseMatches(s)) return { text: 'Ellipse', warn: false };
  if (!solved) return { text: 'Outline closed', warn: false };
  if (!solved.ok) return { text: solved.reason, warn: true };
  const curved = (s.bulges ?? []).some(Boolean);
  const tail = curved ? ' · line + arc outline' : !isConvex(s.points) ? ' · concave, extrudes as a line + arc solid' : '';
  const extra = redundancy(solved);
  if (extra > 0) return { text: `Over-defined · ${extra} redundant constraint${extra > 1 ? 's' : ''} — remove one${tail}`, warn: true };
  return solved.dof === 0 ? { text: 'Fully defined' + tail, warn: false }
    : { text: `Under-defined · ${solved.dof} DOF left — add dimensions or constraints${tail}`, warn: true };
}

