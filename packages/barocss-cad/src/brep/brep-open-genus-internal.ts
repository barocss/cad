import type { Brep, BrepBody, BrepCoedge, BrepEdge, BrepFace, BrepLoop, BrepShell, BrepVertex } from './brep-core.js';

interface TopologyIndex {
  readonly shells: ReadonlyMap<string, BrepShell>; readonly faces: ReadonlyMap<string, BrepFace>;
  readonly loops: ReadonlyMap<string, BrepLoop>; readonly coedges: ReadonlyMap<string, BrepCoedge>;
  readonly edges: ReadonlyMap<string, BrepEdge>; readonly vertices: ReadonlyMap<string, BrepVertex>;
  readonly usesOfEdge: ReadonlyMap<string, readonly BrepCoedge[]>;
  readonly endingAt: ReadonlyMap<string, readonly BrepCoedge[]>;
}

interface OpenGenusIndex extends TopologyIndex {
  readonly uniqueIds: boolean;
  readonly shellCounts: ReadonlyMap<string, number>; readonly faceCounts: ReadonlyMap<string, number>;
  readonly loopCounts: ReadonlyMap<string, number>; readonly useCounts: ReadonlyMap<string, number>;
}

/** Build once per report, lazily when an open body needs certification. Counts expose unlisted owning records. */
export function indexOpenBodyGenus(brep: Brep, index: TopologyIndex): OpenGenusIndex {
  const count = <T>(items: readonly T[], owner: (item: T) => string): ReadonlyMap<string, number> => {
    const counts = new Map<string, number>();
    for (const item of items) { const id = owner(item); counts.set(id, (counts.get(id) ?? 0) + 1); }
    return counts;
  };
  return { ...index,
    uniqueIds: index.shells.size === brep.shells.length && index.faces.size === brep.faces.length && index.loops.size === brep.loops.length
      && index.coedges.size === brep.coedges.length && index.edges.size === brep.edges.length && index.vertices.size === brep.vertices.length
      && new Set(brep.bodies.map(body => body.id)).size === brep.bodies.length,
    shellCounts: count(brep.shells, shell => shell.body), faceCounts: count(brep.faces, face => face.shell),
    loopCounts: count(brep.loops, loop => loop.face), useCounts: count(brep.coedges, use => use.loop) };
}

/** Report-only certification: a sheet accepted by the checker can still have a pinched boundary (D194). */
export function openBodyGenus(body: BrepBody, index: OpenGenusIndex): number | null {
  const { shells, faces, loops, coedges, edges, vertices, usesOfEdge, endingAt } = index;
  // Duplicate ids make ownership ambiguous, including duplicates hidden by an index's last value.
  if (!index.uniqueIds || !body.shells.length || index.shellCounts.get(body.id) !== body.shells.length) return null;
  const shellIds = new Set<string>(), faceIds = new Set<string>(), loopIds = new Set<string>(), useIds = new Set<string>();
  const edgeShell = new Set<string>(), vertexShell = new Set<string>();
  let genus = 0;
  for (const shellId of body.shells) {
    const shell = shells.get(shellId);
    if (!shell || shell.body !== body.id || shellIds.has(shellId) || !shell.faces.length || index.faceCounts.get(shellId) !== shell.faces.length) return null;
    shellIds.add(shellId);
    const localFaces = new Set<string>(), localUses = new Map<string, BrepCoedge>(), localEdges = new Set<string>(), localVertices = new Set<string>();
    const faceNeighbors = new Map<string, Set<string>>();
    let loopCount = 0;
    for (const faceId of shell.faces) {
      const face = faces.get(faceId);
      if (!face || face.shell !== shellId || faceIds.has(faceId) || index.loopCounts.get(faceId) !== face.loops.length
        || face.loops.filter(id => loops.get(id)?.kind === 'outer').length !== 1) return null;
      faceIds.add(faceId); localFaces.add(faceId); faceNeighbors.set(faceId, new Set());
      for (const loopId of face.loops) {
        const loop = loops.get(loopId);
        if (!loop || loop.face !== faceId || loopIds.has(loopId) || !loop.coedges.length || index.useCounts.get(loopId) !== loop.coedges.length) return null;
        loopIds.add(loopId); loopCount++;
        for (let i = 0; i < loop.coedges.length; i++) {
          const useId = loop.coedges[i], use = coedges.get(useId), next = coedges.get(loop.coedges[(i + 1) % loop.coedges.length]);
          if (!use || !next || use.loop !== loopId || useIds.has(useId) || use.next !== next.id || next.prev !== useId
            || (use.sense !== 'forward' && use.sense !== 'reversed')) return null;
          const edge = edges.get(use.edge), nextEdge = edges.get(next.edge);
          if (!edge || !nextEdge || edge.vertices.some(id => !vertices.has(id))) return null;
          const end = edge.vertices[use.sense === 'forward' ? 1 : 0], startNext = nextEdge.vertices[next.sense === 'forward' ? 0 : 1];
          if (end !== startNext) return null;
          useIds.add(useId); localUses.set(useId, use); localEdges.add(use.edge);
          for (const vertex of edge.vertices) localVertices.add(vertex);
        }
      }
    }
    // A body made of multiple manifold shells must not glue them together by an edge or a vertex id.
    for (const edge of localEdges) { if (edgeShell.has(edge)) return null; edgeShell.add(edge); }
    for (const vertex of localVertices) { if (vertexShell.has(vertex)) return null; vertexShell.add(vertex); }

    const boundaryOut = new Map<string, BrepCoedge>(), boundaryIn = new Map<string, BrepCoedge>();
    const endOf = (use: BrepCoedge) => edges.get(use.edge)!.vertices[use.sense === 'forward' ? 1 : 0];
    const startOf = (use: BrepCoedge) => edges.get(use.edge)!.vertices[use.sense === 'forward' ? 0 : 1];
    for (const edge of localEdges) {
      const uses = usesOfEdge.get(edge) ?? [];
      if (uses.some(use => localUses.get(use.id) !== use)) return null;
      if (uses.length === 1) {
        const use = uses[0], start = startOf(use), end = endOf(use);
        if (use.twin !== null || boundaryOut.has(start) || boundaryIn.has(end)) return null;
        // A full-circle edge with equal endpoint ids contributes both an incoming and an outgoing use.
        boundaryOut.set(start, use); boundaryIn.set(end, use);
      } else if (uses.length === 2) {
        const [a, b] = uses;
        if (a.twin !== b.id || b.twin !== a.id || a.sense === b.sense) return null;
        const fa = loops.get(a.loop)!.face, fb = loops.get(b.loop)!.face;
        faceNeighbors.get(fa)!.add(fb); faceNeighbors.get(fb)!.add(fa);
      } else return null;
    }
    for (const vertex of localVertices) if (boundaryOut.has(vertex) !== boundaryIn.has(vertex)) return null;
    if (shell.closed && boundaryOut.size) return null;

    // Each shell must be connected through actual paired edge uses, not just a shared vertex.
    const reachedFaces = new Set<string>(), pending = [shell.faces[0]];
    while (pending.length) {
      const face = pending.pop()!;
      if (reachedFaces.has(face)) continue;
      reachedFaces.add(face);
      for (const other of faceNeighbors.get(face)!) if (!reachedFaces.has(other)) pending.push(other);
    }
    if (reachedFaces.size !== localFaces.size) return null;

    // Incoming corners at a vertex form one cycle inside, or one chain at the boundary.
    // twin(next(c)) is its successor around the vertex; same-face seams remain ordinary paired uses.
    for (const vertex of localVertices) {
      const corners = (endingAt.get(vertex) ?? []).filter(use => localUses.has(use.id));
      if (!corners.length) return null;
      const cornerIds = new Set(corners.map(use => use.id)), successor = new Map<string, string>(), predecessor = new Map<string, string>();
      for (const corner of corners) {
        const next = localUses.get(corner.next)!;
        if (next.twin === null) continue;
        const other = localUses.get(next.twin);
        if (!other || !cornerIds.has(other.id) || predecessor.has(other.id)) return null;
        successor.set(corner.id, other.id); predecessor.set(other.id, corner.id);
      }
      const boundary = boundaryOut.has(vertex), starts = corners.filter(use => !predecessor.has(use.id));
      if (boundary ? starts.length !== 1 || successor.size !== corners.length - 1 : starts.length !== 0 || successor.size !== corners.length) return null;
      const first = boundary ? starts[0].id : corners[0].id, reached = new Set<string>();
      let current: string | undefined = first;
      while (current !== undefined && !reached.has(current)) { reached.add(current); current = successor.get(current); }
      if (reached.size !== corners.length || (boundary ? current !== undefined : current !== first)) return null;
    }

    let boundaryCycles = 0;
    const reachedBoundary = new Set<string>();
    for (const first of boundaryOut.values()) {
      if (reachedBoundary.has(first.id)) continue;
      let current = first;
      do {
        if (reachedBoundary.has(current.id)) return null;
        reachedBoundary.add(current.id);
        const next = boundaryOut.get(endOf(current));
        if (!next) return null;
        current = next;
      } while (current.id !== first.id);
      boundaryCycles++;
    }
    const chi = localVertices.size - localEdges.size + 2 * localFaces.size - loopCount;
    const shellGenus = 1 - (chi + boundaryCycles) / 2;
    if (!Number.isInteger(shellGenus) || shellGenus < 0) return null;
    genus += shellGenus;
  }
  return genus;
}
