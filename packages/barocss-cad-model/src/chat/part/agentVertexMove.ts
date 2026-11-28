import type { Ctx, VertexSel } from '../../app/commands';
import { nativeSolidLine } from '../../app/nativeSolidLine';

type Endpoint = 'from' | 'to';
type MoveSelection = { sourceEdge: string; sourceEndpoint: Endpoint; destinationEdge: string; destinationEndpoint: Endpoint };
type VertexMove = { error: string } | { context: Ctx; references: MoveSelection };

export function agentVertexMove(ctx: Ctx, args: Record<string, unknown>, given: Record<string, unknown>, placedPart?: string): VertexMove {
  const { edges } = args;
  const { sourceEndpoint, destinationEndpoint } = given;
  if (placedPart || ctx.doc.instances?.length || args.expectedRevision === undefined || args.faces !== undefined
    || args.bodies !== undefined || args.point !== undefined || !Array.isArray(edges) || edges.length !== 2
    || typeof edges[0] !== 'string' || typeof edges[1] !== 'string' || edges[0] === edges[1]
    || Object.keys(given).some(key => !['mode', 'sourceEndpoint', 'destinationEndpoint'].includes(key))) {
    return { error: 'Vertex-to-vertex Move needs the current expectedRevision and two distinct exact edge names in source, destination order.' };
  }
  if ((sourceEndpoint !== 'from' && sourceEndpoint !== 'to') || (destinationEndpoint !== 'from' && destinationEndpoint !== 'to')) {
    return { error: 'Vertex-to-vertex Move needs sourceEndpoint and destinationEndpoint set to from or to.' };
  }
  const [sourcePick, destinationPick] = ctx.selection.edges;
  if (ctx.bodies.length !== 2 || ctx.selection.edges.length !== 2 || sourcePick.body === destinationPick.body) {
    return { error: 'Vertex-to-vertex Move needs one original edge on each of two standalone solids.' };
  }
  const [sourceEdge, destinationEdge] = edges;
  const source = nativeSolidLine(ctx.bodies[sourcePick.body], sourcePick.edge);
  const destination = nativeSolidLine(ctx.bodies[destinationPick.body], destinationPick.edge);
  if (source?.names[0] !== sourceEdge || destination?.names[0] !== destinationEdge
    || ctx.bodies[destinationPick.body].mesh.edges.some(edge => edge.names.includes(sourceEdge))
    || ctx.bodies[sourcePick.body].mesh.edges.some(edge => edge.names.includes(destinationEdge))) {
    return { error: 'Vertex-to-vertex Move needs an unambiguous native straight edge on each solid.' };
  }
  const sourceAt = sourceEndpoint === 'from' ? source.a : source.b;
  const destinationAt = destinationEndpoint === 'from' ? destination.a : destination.b;
  if (sourceAt.every((value, index) => value === destinationAt[index])) {
    return { error: 'The two native vertices already coincide.' };
  }
  const moveVertices: readonly [VertexSel, VertexSel] = [
    { body: sourcePick.body, at: sourceAt }, { body: destinationPick.body, at: destinationAt },
  ];
  return {
    context: { ...ctx, selection: { ...ctx.selection, edges: [], vertices: [...moveVertices] }, moveVertices },
    references: { sourceEdge, sourceEndpoint, destinationEdge, destinationEndpoint },
  };
}
