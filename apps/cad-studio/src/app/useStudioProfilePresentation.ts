import { useMemo } from 'react';
import type { Selection } from '@barocss/cad-model/app/commands';
import { unusedSketches } from '@barocss/cad-model/app/profiles';
import { offsetFaceGroup, type StudioDoc } from '@barocss/cad-model/engine/doc';
import type { SketchState } from '../viewport/Viewport';
import { freeSketchProfile } from './freeSketchProfile';

export function useStudioProfilePresentation(
  authoredNodes: StudioDoc['nodes'],
  evaluated: StudioDoc,
  parameters: StudioDoc['parameters'],
  { sketches, profileRegions }: Pick<Selection, 'sketches' | 'profileRegions'>,
  sketch: SketchState | null,
) {
  const freeSketches = useMemo(() => unusedSketches(evaluated.nodes, true), [evaluated.nodes]);
  const innerSteps = useMemo(() => new Set(authoredNodes.flatMap((node, index) => {
    const group = 'made' in node ? node.made : undefined;
    if (!group?.nodes) return [];
    if (group.command === 'offset-face' && !offsetFaceGroup(authoredNodes, index)) return [];
    const first = index - group.nodes + 1;
    return Array.from({ length: group.nodes - 1 }, (_, step) => first + step);
  })), [authoredNodes]);
  const retainedProfiles = useMemo(() => new Set(evaluated.nodes.flatMap(node =>
    node.kind === 'region-extrude' ? [node.sketch] : [])), [evaluated.nodes]);
  const profiles = useMemo(() => sketch ? [] : freeSketches.map(index => {
    const { rings, outerCount, canPickRegion } = freeSketchProfile(evaluated, index, parameters);
    const pickedRegions = canPickRegion && profileRegions?.sketch === index ? profileRegions.indices : undefined;
    return { id: index, rings, picked: !!sketches?.includes(index), outerCount, canPickRegion, pickedRegions, retained: retainedProfiles.has(index) };
  }), [freeSketches, evaluated, parameters, sketches, profileRegions, retainedProfiles, sketch]);
  return { freeSketches, innerSteps, profiles };
}
