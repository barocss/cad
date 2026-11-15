import type { SketchPick } from '@barocss/cad-model/sketch/rules';

/** Hide only the duplicate action for two actual points; circle/edge dimension choices stay unchanged. */
export function duplicatePointDistance(picked: readonly SketchPick[], dimension: string | null | undefined): boolean {
  return !!dimension && picked.length === 2 && picked.every(pick => pick.kind === 'point') && picked[0].i !== picked[1].i;
}
export const MAKE_CURVES_HELP = 'Each shape of the sketch as a curve in space (for lofts, sweeps and ruled surfaces); matching ellipses become exact ellipse curves. The sketch is kept.';

export function SketchSolverDiagnostics({ rank, dof }: { rank: number; dof: number }) {
  return <details className="sk-solver-diagnostics" onKeyDown={event => {
    if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
  }}><summary>Solver diagnostics</summary><div className="kv solver">Solver<b>rank {rank} · {dof} DOF</b></div></details>;
}
