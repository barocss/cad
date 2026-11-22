import { useMemo } from 'react';
import type { ModelNode } from '@barocss/cad-model/engine/doc';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import type { SketchState } from '@barocss/cad-model/sketch/types';
import { addedHoles, holeGroup, holeRegions, type ToolRegion } from '@barocss/cad-model/app/holeRegion';
import type { Active } from '../app/commandState';

interface HoleRegionInputs {
  active: Active | null;
  editNode: number | null;
  nodes: readonly ModelNode[];
  bodies: readonly BodyResult[];
  selectedBodies: readonly number[];
  rendering: boolean;
  drawing: boolean;
  sketch: SketchState | null;
}

export function useViewportHoleRegions({
  active, editNode, nodes, bodies, selectedBodies, rendering, drawing, sketch,
}: HoleRegionInputs): ToolRegion[] {
  // A hole's whole region, see-through, while it is placed or edited: where it runs off the part's edge
  // only a notch shows of it otherwise.
  return useMemo((): ToolRegion[] => {
    if (rendering || drawing || sketch) return [];
    if (active?.cmd.id === 'hole' && active.cmd.build && active.ctx.selection.faces[0]) {
      try {
        const next = active.cmd.build(active.ctx, active.values), b = active.ctx.bodies[active.ctx.selection.faces[0].body];
        return b ? holeRegions(next.nodes, addedHoles(next.nodes, active.ctx.doc.nodes.length), b.mesh.bounds) : [];
      } catch { return []; }
    }
    if (active || editNode === null || nodes[editNode]?.kind !== 'hole') return [];
    const group = holeGroup(nodes, editNode), cut = new RegExp(`\\bn(${group.join('|')})\\.side`);
    const b = bodies.find(x => x.mesh.faces.some(f => cut.test(f.name))) ?? bodies[selectedBodies[0] ?? -1];
    return b ? holeRegions(nodes, group, b.mesh.bounds) : [];
  }, [active, editNode, nodes, bodies, selectedBodies, rendering, drawing, sketch]);
}
