import type { Brep } from '@barocss/cad';

/** Native BRep metadata only, not a mesh closure or manufacturing certification. */
export interface NativeBodyTopology {
  readonly kind: 'solid' | 'sheet' | 'mixed' | 'unknown';
  readonly openShells: number | null;
  /** Unique native edges with an unpaired coedge. Not STL tessellation edge counts. */
  readonly boundaryEdges: number | null;
}
export function nativeBodyTopology(brep: Brep | null | undefined): NativeBodyTopology {
  const unknown: NativeBodyTopology = { kind: 'unknown', openShells: null, boundaryEdges: null };
  if (!brep?.bodies.length) return unknown;
  const shells = new Map(brep.shells.map(s => [s.id, s]));
  const faces = new Map(brep.faces.map(f => [f.id, f]));
  const used = new Set<string>();
  let solids = 0, sheets = 0, openShells = 0;
  for (const body of brep.bodies) {
    if (!body.shells.length || (body.kind !== 'solid' && body.kind !== 'sheet')) return unknown;
    for (const id of body.shells) {
      const shell = shells.get(id);
      if (!shell || shell.body !== body.id || used.has(id) || !shell.faces.length || typeof shell.closed !== 'boolean') return unknown;
      if (shell.faces.some(id => faces.get(id)?.shell !== shell.id)) return unknown;
      used.add(id);
      if (!shell.closed) { if (body.kind === 'solid') return unknown; openShells++; }
    }
    if (body.kind === 'solid') solids++; else sheets++;
  }
  if (used.size !== brep.shells.length) return unknown;
  const edges = new Set(brep.edges.map(e => e.id)), coedges = new Map(brep.coedges.map(c => [c.id, c]));
  const boundary = new Set<string>();
  for (const coedge of brep.coedges) {
    if (!edges.has(coedge.edge)) return unknown;
    if (coedge.twin === null) boundary.add(coedge.edge);
    else {
      const twin = coedges.get(coedge.twin);
      if (!twin || twin.edge !== coedge.edge || twin.twin !== coedge.id) return unknown;
    }
  }
  // A claimed closed shell with unpaired edges is not evidence of a solid.
  if (!openShells && boundary.size) return unknown;
  return { kind: solids && sheets ? 'mixed' : solids ? 'solid' : 'sheet', openShells, boundaryEdges: boundary.size };
}
