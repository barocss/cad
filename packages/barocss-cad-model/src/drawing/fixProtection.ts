import type { DrawingFix } from './issues';
import type { DrawingSettings } from './types';

/** Authored controls an explicit fix would delete; automatic fixes must retain them. */
export function drawingFixControlLoss(settings: DrawingSettings, fix: DrawingFix): string[] {
  const dims = settings.dimensions.filter(d => fix.kind === 'remove' ? d.id === fix.dim
    : fix.kind === 'remove-detail' ? d.view === `detail:${fix.detail}` : false);
  const loss: string[] = [];
  for (const dim of dims) {
    if (dim.tol) {
      const t = dim.tol;
      const value = t.kind === 'symmetric' ? `±${t.value} mm` : t.kind === 'deviation' ? `upper ${t.upper} / lower ${t.lower} mm` : `fit ${t.code}`;
      loss.push(`Dimension ${dim.id} (${dim.kind}, ${dim.view}): tolerance ${value}`);
    }
    if (dim.basic) loss.push(`Dimension ${dim.id} (${dim.kind}, ${dim.view}): basic dimension`);
  }
  for (const frame of settings.frames ?? []) {
    if ((fix.kind === 'remove-frame' && frame.id === fix.frame) || dims.some(d => d.id === frame.dim))
      loss.push(`GD&T frame ${frame.id} (${frame.characteristic} ${frame.value} mm)${frame.dim ? ` on dimension ${frame.dim}` : ''}`);
  }
  return loss;
}
