import type { Ctx, Values } from '../../app/commands';
import { cardinalEdgeRotation, edgeEndpointRotation } from '../../app/rotateCommand';

type AgentRotatePivot = { error: string } | { values: Values; edge: string; endpoint?: 'from' | 'to' };

export function agentRotatePivot(ctx: Ctx, args: Record<string, unknown>, given: Record<string, unknown>, placedPart?: string): AgentRotatePivot {
  const edge = Array.isArray(args.edges) && args.edges.length === 1 ? args.edges[0] : undefined;
  const { about, angle, endpoint, axis } = given;
  const vertex = about === 'vertex';
  const mode = vertex ? 'vertex' : 'edge';
  const keys = vertex ? ['about', 'angle', 'endpoint', 'axis'] : ['about', 'angle'];
  if ((about !== 'edge' && !vertex) || placedPart || ctx.doc.instances?.length || args.expectedRevision === undefined
    || typeof edge !== 'string' || args.faces !== undefined || args.bodies !== undefined || args.point !== undefined
    || typeof angle !== 'number' || !Number.isFinite(angle) || angle === 0 || Math.abs(angle) >= 360
    || Object.keys(given).some(key => !keys.includes(key))) {
    return { error: `Rotate about ${mode} needs the current expectedRevision, one exact native edge name and one finite nonzero angle below 360 degrees in magnitude.` };
  }
  const pickedEndpoint = endpoint === 'from' || endpoint === 'to' ? endpoint : undefined;
  const pickedAxis = axis === 'x' || axis === 'y' || axis === 'z' ? axis : undefined;
  if (vertex && (!pickedEndpoint || !pickedAxis)) {
    return { error: 'Rotate about vertex needs endpoint from or to and axis x, y or z.' };
  }
  const pivot = vertex && pickedEndpoint && pickedAxis
    ? edgeEndpointRotation(ctx, pickedEndpoint, pickedAxis) : cardinalEdgeRotation(ctx);
  const [pick] = ctx.selection.edges;
  if (!pivot || ctx.bodies[pick.body].mesh.edges[pick.edge].names[0] !== edge) {
    const support = vertex ? 'straight edge and its native endpoint' : 'straight X, Y or Z edge';
    return { error: `Rotate about ${mode} needs one exact native ${support} on the current solid.` };
  }
  return { values: { ...pivot, angle }, edge, ...(vertex ? { endpoint: pickedEndpoint } : {}) };
}
