import type { StudioDoc } from './doc';
import type { DisplayEdge } from './mesh';
import type { NurbsCurve } from './curveSource';
import { partBreps } from './evaluate';

export type NativeEdgeCurveReply = { curve: NurbsCurve; edgeId: string; edgeName: string } | { error: string };

/** Copy the current native coefficients; serialization precision is the caller's responsibility. */
export function readNativeEdgeCurve(doc: StudioDoc, bodyKey: string, picked: DisplayEdge['nativeJoint']): NativeEdgeCurveReply {
  if (!picked || !picked.edgeId || picked.faces.length !== 2 || picked.faces[0] === picked.faces[1])
    return { error: 'Select one unmerged native edge on a root body. Placed or ambiguous edges cannot be copied here.' };
  try {
    const bodies = partBreps(doc).filter(body => body.key === bodyKey);
    if (bodies.length !== 1) return { error: 'The selected body has no unique current native geometry.' };
    const { brep } = bodies[0];
    if (brep.source.family === 'mesh') return { error: 'A faceted mesh does not provide an authored native curve to copy.' };
    const edges = brep.edges.filter(edge => edge.id === picked.edgeId);
    if (edges.length !== 1) return { error: 'The selected edge has no unique current native curve.' };
    const edge = edges[0], uses = brep.coedges.filter(use => use.edge === edge.id);
    if (uses.length !== 2) return { error: 'The selected edge no longer has its two native face uses.' };
    const on = uses.map(use => {
      const loops = brep.loops.filter(loop => loop.id === use.loop);
      if (loops.length !== 1) return undefined;
      const faces = brep.faces.filter(face => face.id === loops[0].face);
      return faces.length === 1 && faces[0].surface.kind === 'surface' ? faces[0].id : undefined;
    });
    if (!on[0] || !on[1] || on[0] === on[1] || !picked.faces.includes(on[0]) || !picked.faces.includes(on[1]))
      return { error: 'The selected native edge and adjacent faces no longer match. Select the edge again.' };
    const c = edge.curve;
    if (!Number.isInteger(c.degree) || c.degree < 1 || !c.knots.every(Number.isFinite)
      || !c.weights.every(w => Number.isFinite(w) && w > 0)
      || c.controlPoints.some(p => p.length !== 3 || !p.every(Number.isFinite)))
      return { error: 'The native curve coefficients cannot be copied safely.' };
    return { edgeId: edge.id, edgeName: edge.name ?? edge.id, curve: {
      degree: c.degree, knots: [...c.knots], points: c.controlPoints.map(p => [p[0], p[1], p[2]]), weights: [...c.weights],
    } };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'The current native edge could not be read.' };
  }
}
