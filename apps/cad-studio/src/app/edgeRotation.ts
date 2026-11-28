import type { Ctx } from '@barocss/cad-model/app/commands';
import { cardinalEdgeRotation } from '@barocss/cad-model/app/rotateCommand';
import type { MeasureTarget } from './measureTargets';

/** Bind the picked edge to the same display mesh before deriving the Rotate values. */
export function edgeRotationValues(ctx: Ctx, target: MeasureTarget) {
  const [pick] = ctx.selection.edges;
  if (target.occurrence || !pick || pick.body !== target.pick.body || pick.edge !== target.pick.edge) return;
  const body = ctx.bodies[pick.body];
  if (!body || body.key !== target.body || body.mesh !== target.mesh) return;
  return cardinalEdgeRotation(ctx);
}
