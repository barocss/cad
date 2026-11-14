import { copyLoftGuide } from '@barocss/cad-model/app/loftGuides';
import { planeOf } from '@barocss/cad-model/app/profiles';
import type { Active } from './commandState';

export function loftGuideFeedback(active: Active): string | undefined {
  const { ctx, values, error } = active;
  if (active.cmd.id !== 'loft' || active.preview !== 'error' || values.guideB || typeof values.guide !== 'string'
    || !error?.detail.includes("loft: guide must rise along the sections' normal: controlPoints[")) return;
  const copy = copyLoftGuide(ctx.doc, values.guide);
  const section = ctx.doc.nodes[ctx.selection.sketches?.[0] ?? -1];
  if (!copy.ok || copy.guide.kind !== 'nurbs' || (section?.kind !== 'sketch' && section?.kind !== 'driven-sketch')) return;
  const { origin, normal } = planeOf(section), { controlPoints } = copy.guide;
  const heights = controlPoints.map(p => normal[0] * (p[0] - origin[0]) + normal[1] * (p[1] - origin[1]) + normal[2] * (p[2] - origin[2]));
  if (heights.every((h, i) => i === 0 || h < heights[i - 1])) {
    return copy.guide.degree <= 3
      ? 'This curve runs toward the lower section. Reverse it in Direct geometry or choose another guide.'
      : 'This curve runs toward the lower section. Choose a guide that runs from the lower section to the upper section.';
  }
  return 'Choose another guide. Each control point must be higher than the previous one along the section normal.';
}
