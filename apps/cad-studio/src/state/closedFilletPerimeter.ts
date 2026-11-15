import type { Ctx } from '@barocss/cad-model/app/commands';

/** Diagnostic only: prove one closed display-edge cycle, never admit or change a fillet. */
export function closedFilletPerimeter(ctx: Ctx): { individuallyPicked: boolean } | null {
  const { edges: picked, faces } = ctx.selection, individuallyPicked = picked.length > 0;
  const selection = individuallyPicked ? picked : faces;
  if (!selection.length) return null;
  const bodyIndex = selection[0].body, body = ctx.bodies[bodyIndex];
  if (!Number.isInteger(bodyIndex) || !body || selection.some(item => item.body !== bodyIndex)) return null;
  let edges;
  if (individuallyPicked) {
    if (new Set(picked.map(item => item.edge)).size !== picked.length
      || picked.some(item => !Number.isInteger(item.edge) || !body.mesh.edges[item.edge])) return null;
    edges = picked.map(item => body.mesh.edges[item.edge]);
  } else {
    if (new Set(faces.map(item => item.face)).size !== faces.length
      || faces.some(item => !Number.isInteger(item.face) || !body.mesh.faces[item.face])) return null;
    const selectedFaces = new Set(faces.map(item => item.face));
    // Match commands.edgesOfOneBody: explicit edges take precedence; otherwise
    // every edge incident to a picked face participates in the build.
    edges = body.mesh.edges.filter(edge => edge.faces.some(face => selectedFaces.has(face)));
  }
  if (!edges.length) return null;
  const nodes = new Map<string, { degree: number; adjacent: Set<string> }>();
  const key = (point: readonly number[]) => {
    if (point.length !== 3 || !point.every(Number.isFinite)) return null;
    // The same display endpoint grouping used by commands.chainEnds. This only
    // explains that builder's refusal; it is not a geometry tolerance or repair.
    const coordinates = point.map(value => Math.round(value * 1e4));
    return coordinates.every(Number.isFinite) ? coordinates.join(',') : null;
  };
  for (const edge of edges) {
    // Do not explain an artificial or stale pick whose persistent names have
    // more than one possible display owner.
    if (!edge.names.length || new Set(edge.names).size !== edge.names.length
      || edge.names.some(name => !name || body.mesh.edges.filter(candidate => candidate.names.includes(name)).length !== 1)) return null;
    const a = key(edge.a), b = key(edge.b);
    if (a === null || b === null || (edge.straight && a === b)) return null;
    // A merged circular edge can legitimately be a self-loop. A short straight
    // edge collapsed by display grouping cannot prove a closed perimeter.
    for (const [from, to] of [[a, b], [b, a]]) {
      const node = nodes.get(from) ?? { degree: 0, adjacent: new Set<string>() };
      node.degree++; node.adjacent.add(to); nodes.set(from, node);
    }
  }
  if ([...nodes.values()].some(node => node.degree !== 2)) return null;
  const seen = new Set<string>(), pending = [nodes.keys().next().value!];
  for (const from of pending) {
    if (seen.has(from)) continue;
    seen.add(from);
    pending.push(...nodes.get(from)!.adjacent);
  }
  return seen.size === nodes.size ? { individuallyPicked } : null;
}
